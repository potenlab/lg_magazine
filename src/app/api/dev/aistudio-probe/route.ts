import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Dev-only smoke test for the LG AI Studio integration. Surfaces raw JSON
// from /genai/auth/token + /genai/{api}/prompt/{idx} so we can discover the
// real response key names without re-deploying the provider.
//
//   GET /api/dev/aistudio-probe                 → uses AISTUDIO_API_CODE env
//   GET /api/dev/aistudio-probe?api=test_api_2&promptIndex=1
//   GET /api/dev/aistudio-probe?auth_only=1     → token exchange only
//
// Returns 404 in production. Returns the JWT in the response body (dev only).
// Do NOT enable this in production builds.

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "dev-only endpoint" }, { status: 404 });
  }

  const url = new URL(req.url);
  const apiCode = url.searchParams.get("api") || process.env.AISTUDIO_API_CODE || "test_api_2";
  const promptIndex = url.searchParams.get("promptIndex") || process.env.AISTUDIO_PROMPT_INDEX || "1";
  const skipPrompt = url.searchParams.get("auth_only") === "1";

  const base = process.env.AISTUDIO_BASE_URL?.replace(/\/+$/, "");
  const workspaceId = process.env.AISTUDIO_WORKSPACE_ID;
  const password = process.env.AISTUDIO_API_KEY;
  const empNo = process.env.AISTUDIO_EMP_NO;

  const missing = [
    !base && "AISTUDIO_BASE_URL",
    !workspaceId && "AISTUDIO_WORKSPACE_ID",
    !password && "AISTUDIO_API_KEY",
    !empNo && "AISTUDIO_EMP_NO",
  ].filter(Boolean);
  if (missing.length) {
    return NextResponse.json({ error: "missing env", missing }, { status: 400 });
  }

  // Step 1 — token exchange
  const authRes = await fetch(`${base}/genai/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ID: workspaceId, Password: password }),
  });
  const authText = await authRes.text();
  let authJson: unknown = null;
  try { authJson = JSON.parse(authText); } catch { /* keep as text */ }

  const trace: Record<string, unknown> = {
    step1_auth: {
      url: `${base}/genai/auth/token`,
      status: authRes.status,
      ok: authRes.ok,
      body: authJson ?? authText,
    },
  };

  if (!authRes.ok || !authJson) {
    return NextResponse.json(trace, { status: 502 });
  }

  // Try to extract JWT from common keys (don't lock in — we want to learn).
  const candidateKeys = ["token", "JWT", "jwt", "accessToken", "access_token", "Token"];
  const authObj = authJson as Record<string, unknown>;
  let jwt: string | undefined;
  let foundUnder: string | undefined;
  for (const k of candidateKeys) {
    if (typeof authObj[k] === "string") { jwt = authObj[k] as string; foundUnder = k; break; }
  }
  trace.step1_auth_jwt_found_under = foundUnder ?? "<none — check raw body above for the right key>";

  if (skipPrompt || !jwt) {
    return NextResponse.json(trace);
  }

  // Step 2 — prompt call
  const promptUrl = `${base}/genai/${apiCode}/prompt/${promptIndex}`;
  const promptRes = await fetch(promptUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      empNo,
      historyId: null,
      parameters: [],
    }),
  });
  const promptText = await promptRes.text();
  let promptJson: unknown = null;
  try { promptJson = JSON.parse(promptText); } catch { /* keep as text */ }

  trace.step2_prompt = {
    url: promptUrl,
    status: promptRes.status,
    ok: promptRes.ok,
    body: promptJson ?? promptText,
  };

  return NextResponse.json(trace, { status: promptRes.ok ? 200 : 502 });
}
