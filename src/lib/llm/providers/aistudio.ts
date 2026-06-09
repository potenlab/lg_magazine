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

// Upstream rejects an over-quota call with this Korean phrase in the body —
// shared by both the daily ("하루 토큰 호출량 한도를 초과…") and per-minute
// ("분당 토큰 호출량 한도를 초과…") limits. Matching the common substring lets
// us detect either without depending on HTTP status (it has arrived as 400 and
// as 200+resultVal:"err").
const QUOTA_PHRASE = "토큰 호출량";
// A per-minute hit clears within ~60s; a daily hit needs a re-probe later in the
// day. We don't know the exact reset clock, so a daily cooldown just parks the
// code long enough to stop hammering it — if it re-trips after the cooldown the
// request simply rotates on, so over/under-estimating is self-correcting.
const MINUTE_COOLDOWN_MS = 60_000;
const DAILY_COOLDOWN_MS = 30 * 60_000;

export class AIStudioProvider implements LLMProvider {
  readonly name = "aistudio";
  private base: string;
  private workspaceId: string;
  private password: string;
  private apiCodes: string[];
  private promptIndex: string;
  private empNo: string;
  private cached: CachedToken | null = null;
  // Round-robin cursor + per-code cooldown deadline (unix ms). Persisted on the
  // singleton provider instance (see provider.ts cache), so load spreads across
  // codes and exhausted codes stay parked between requests.
  private cursor = 0;
  private cooldownUntil: number[];

  constructor() {
    const env = process.env;
    if (!env.AISTUDIO_BASE_URL) throw new Error("AISTUDIO_BASE_URL is not set");
    if (!env.AISTUDIO_WORKSPACE_ID) throw new Error("AISTUDIO_WORKSPACE_ID is not set");
    if (!env.AISTUDIO_API_KEY) throw new Error("AISTUDIO_API_KEY is not set");
    if (!env.AISTUDIO_EMP_NO) throw new Error("AISTUDIO_EMP_NO is not set");
    // Prefer the multi-code pool (AISTUDIO_API_CODES, comma-separated) for quota
    // failover; fall back to the single AISTUDIO_API_CODE.
    const codes = (env.AISTUDIO_API_CODES || env.AISTUDIO_API_CODE || "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    if (codes.length === 0) {
      throw new Error("AISTUDIO_API_CODES (or AISTUDIO_API_CODE) is not set");
    }
    this.base = env.AISTUDIO_BASE_URL.replace(/\/+$/, "");
    this.workspaceId = env.AISTUDIO_WORKSPACE_ID;
    this.password = env.AISTUDIO_API_KEY;
    this.apiCodes = codes;
    this.promptIndex = env.AISTUDIO_PROMPT_INDEX || "1";
    this.empNo = env.AISTUDIO_EMP_NO;
    this.cooldownUntil = new Array(codes.length).fill(0);
  }

  async generateText(req: LLMRequest): Promise<LLMResult> {
    const parameters: ParameterEntry[] = [
      { key: "SYSTEM", value: req.system },
      { key: "USER", value: req.user },
    ];
    const body = JSON.stringify({ empNo: this.empNo, historyId: null, parameters });

    let quotaHits = 0;
    // Try each code at most once per call, rotating past any that are quota-capped.
    for (let attempt = 0; attempt < this.apiCodes.length; attempt++) {
      const idx = this.nextAvailableCode();
      if (idx < 0) break; // every code is in cooldown
      const code = this.apiCodes[idx];
      const url = `${this.base}/genai/${code}/prompt/${this.promptIndex}`;

      let res = await this.callPrompt(url, body, await this.getJwt());
      if (res.status === 401) {
        this.cached = null;
        res = await this.callPrompt(url, body, await this.getJwt());
      }
      const raw = await res.text();

      if (raw.includes(QUOTA_PHRASE)) {
        // Per-minute limits mention "분"(minute); anything else is the daily cap.
        const perMinute = raw.includes("분");
        this.cooldownUntil[idx] =
          Date.now() + (perMinute ? MINUTE_COOLDOWN_MS : DAILY_COOLDOWN_MS);
        quotaHits++;
        continue; // rotate to the next code
      }
      if (!res.ok) {
        throw new Error(`aistudio call (${code}): ${res.status} ${raw}`);
      }

      const data = JSON.parse(raw) as unknown;
      const text =
        pickFirst(data, TEXT_KEYS) ??
        pickFirst((data as { data?: unknown })?.data, TEXT_KEYS) ??
        pickFirst((data as { result?: unknown })?.result, TEXT_KEYS);
      if (!text) {
        throw new Error(`aistudio: no text in response — payload: ${raw}`);
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

    throw new Error(
      `aistudio: all ${this.apiCodes.length} API code(s) exhausted (${quotaHits} quota-capped) — raise quotas or add more codes via AISTUDIO_API_CODES`,
    );
  }

  // Round-robin to the next code whose cooldown has elapsed, advancing the cursor
  // so load spreads evenly. Returns -1 when every code is currently capped.
  private nextAvailableCode(): number {
    const now = Date.now();
    for (let n = 0; n < this.apiCodes.length; n++) {
      const idx = (this.cursor + n) % this.apiCodes.length;
      if (this.cooldownUntil[idx] <= now) {
        this.cursor = (idx + 1) % this.apiCodes.length;
        return idx;
      }
    }
    return -1;
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
