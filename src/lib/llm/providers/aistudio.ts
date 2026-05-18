import type { LLMProvider, LLMRequest, LLMResult } from "../provider";

// LG AI Studio (aistudio.singlex.com) provider.
// Contract verified end-to-end against test_api_2/prompt/1 on 2026-04-30:
//   POST /genai/auth/token   {ID, Password}        → {resultVal:"success", token, refreshToken}
//   POST /genai/auth/refresh {ID, RefreshToken}    → same shape
//   POST /genai/{code}/prompt/{n}                  → {message, historyId, sessionId, resultVal, tokens}
//     headers: Authorization: Bearer <jwt>, Content-Type: application/json
//     body:    {empNo, historyId|null, parameters[]}
// JWT is HS256, exp claim = 1h TTL.
// parameters[] element shape still TBD — confirmed empty array works; non-empty
// shape ({name,value} vs other) needs verification when first variable-using
// API is registered (see Phase 9 in progress_backend.md).

interface CachedToken {
  jwt: string;
  refreshToken: string;
  expiresAt: number; // unix seconds, from JWT exp claim
}

// Element shape confirmed via probe 2026-04-30: `{key, value}`. Sending
// `{name, value}` returns a generic 400 ("오류가 발생했습니다…").
type ParameterEntry = { key: string; value: string };

// `token` / `refreshToken` / `message` confirmed via probe; rest kept as fallback.
const JWT_KEYS = ["token", "JWT", "jwt", "accessToken", "access_token", "Token"] as const;
const REFRESH_KEYS = ["refreshToken", "RefreshToken", "refresh_token"] as const;
const TEXT_KEYS = ["message", "response", "text", "content", "result", "answer", "output"] as const;

function pickFirst(obj: unknown, keys: readonly string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function decodeJwtExp(jwt: string): number {
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    // Not a standard JWT — assume 1 hour TTL, refresh aggressively.
    return Math.floor(Date.now() / 1000) + 3600;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (typeof payload.exp === "number") return payload.exp;
  } catch {
    // fall through
  }
  return Math.floor(Date.now() / 1000) + 3600;
}

export class AIStudioProvider implements LLMProvider {
  readonly name = "aistudio";
  private base: string;
  private workspaceId: string;
  private password: string;
  private apiCode: string;
  private promptIndex: string;
  private empNo: string;
  private cached: CachedToken | null = null;

  constructor() {
    const env = process.env;
    if (!env.AISTUDIO_BASE_URL) throw new Error("AISTUDIO_BASE_URL is not set");
    if (!env.AISTUDIO_WORKSPACE_ID) throw new Error("AISTUDIO_WORKSPACE_ID is not set");
    if (!env.AISTUDIO_API_KEY) throw new Error("AISTUDIO_API_KEY is not set");
    if (!env.AISTUDIO_API_CODE) throw new Error("AISTUDIO_API_CODE is not set");
    if (!env.AISTUDIO_EMP_NO) throw new Error("AISTUDIO_EMP_NO is not set");
    this.base = env.AISTUDIO_BASE_URL.replace(/\/+$/, "");
    this.workspaceId = env.AISTUDIO_WORKSPACE_ID;
    this.password = env.AISTUDIO_API_KEY;
    this.apiCode = env.AISTUDIO_API_CODE;
    this.promptIndex = env.AISTUDIO_PROMPT_INDEX || "1";
    this.empNo = env.AISTUDIO_EMP_NO;
  }

  async generateText(req: LLMRequest): Promise<LLMResult> {
    const parameters: ParameterEntry[] = [
      { key: "SYSTEM", value: req.system },
      { key: "USER", value: req.user },
    ];
    const body = JSON.stringify({ empNo: this.empNo, historyId: null, parameters });
    const url = `${this.base}/genai/${this.apiCode}/prompt/${this.promptIndex}`;

    let res = await this.callPrompt(url, body, await this.getJwt());
    if (res.status === 401) {
      this.cached = null;
      res = await this.callPrompt(url, body, await this.getJwt());
    }
    if (!res.ok) {
      throw new Error(`aistudio call: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as unknown;
    const text =
      pickFirst(data, TEXT_KEYS) ??
      pickFirst((data as { data?: unknown })?.data, TEXT_KEYS) ??
      pickFirst((data as { result?: unknown })?.result, TEXT_KEYS);
    if (!text) {
      throw new Error(`aistudio: no text in response — payload: ${JSON.stringify(data)}`);
    }
    const tokens = (data as { tokens?: { inputTokens?: number; outputTokens?: number } })?.tokens;
    return {
      text: text.trim(),
      usage: tokens
        ? {
            promptTokens: typeof tokens.inputTokens === "number" ? tokens.inputTokens : undefined,
            completionTokens:
              typeof tokens.outputTokens === "number" ? tokens.outputTokens : undefined,
          }
        : undefined,
    };
  }

  private callPrompt(url: string, body: string, jwt: string): Promise<Response> {
    return fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body,
    });
  }

  private async getJwt(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cached && this.cached.expiresAt - 30 > now) return this.cached.jwt;
    if (this.cached?.refreshToken) {
      try {
        await this.refreshToken();
        return this.cached!.jwt;
      } catch {
        this.cached = null;
      }
    }
    await this.issueToken();
    return this.cached!.jwt;
  }

  private async issueToken(): Promise<void> {
    const res = await fetch(`${this.base}/genai/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ID: this.workspaceId, Password: this.password }),
    });
    if (!res.ok) {
      throw new Error(`aistudio auth: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as unknown;
    const jwt = pickFirst(data, JWT_KEYS);
    if (!jwt) {
      throw new Error(`aistudio auth: no JWT in response — payload: ${JSON.stringify(data)}`);
    }
    this.cached = {
      jwt,
      refreshToken: pickFirst(data, REFRESH_KEYS) ?? "",
      expiresAt: decodeJwtExp(jwt),
    };
  }

  private async refreshToken(): Promise<void> {
    if (!this.cached?.refreshToken) throw new Error("aistudio refresh: no cached refresh token");
    const res = await fetch(`${this.base}/genai/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ID: this.workspaceId, RefreshToken: this.cached.refreshToken }),
    });
    if (!res.ok) {
      throw new Error(`aistudio refresh: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as unknown;
    const jwt = pickFirst(data, JWT_KEYS);
    if (!jwt) {
      throw new Error(`aistudio refresh: no JWT in response — payload: ${JSON.stringify(data)}`);
    }
    this.cached = {
      jwt,
      refreshToken: pickFirst(data, REFRESH_KEYS) ?? this.cached.refreshToken,
      expiresAt: decodeJwtExp(jwt),
    };
  }
}
