import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * DEV-ONLY stub of the Qrius login page.
 * Enabled only when QRIUS_STUB=1 — returns 404 otherwise, so it is inert in
 * production. Mimics https://www.lgacademy.com/login/index.php so the real
 * (non-mock) login → callback → code-exchange path can be run on localhost.
 */
export async function GET(request: Request) {
  if (process.env.QRIUS_STUB !== "1") {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const redirectUri = url.searchParams.get("redirect_uri");
  if (!redirectUri) {
    return new NextResponse("stub: missing redirect_uri", { status: 400 });
  }

  // Per the CNS spec, Qrius redirects back with ONLY ?code= (it does not echo
  // `state`). The stub matches that so the local test mirrors production.
  let back: URL;
  try {
    back = new URL(redirectUri);
  } catch {
    return new NextResponse("stub: redirect_uri is not a valid URL", { status: 400 });
  }
  back.searchParams.set("code", `stub-${crypto.randomUUID()}`);

  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<title>Qrius 로그인 (stub)</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       font-family:system-ui,-apple-system,sans-serif;background:#0e1726;color:#e6edf6}
  .card{background:#16223a;border:1px solid #2b3a55;border-radius:14px;
        padding:36px 40px;max-width:380px;text-align:center}
  h1{font-size:18px;margin:0 0 6px}
  p{font-size:13px;color:#9fb0c9;margin:0 0 22px;line-height:1.55}
  a.btn{display:block;background:#3b82f6;color:#fff;text-decoration:none;
        padding:12px;border-radius:9px;font-weight:600;font-size:14px}
  a.btn:hover{background:#2f6fd6}
  code{display:block;margin-top:18px;font-size:11px;color:#7e8ea8;word-break:break-all}
</style></head>
<body><div class="card">
  <h1>큐리어스 로그인 (stub)</h1>
  <p>로컬 테스트용 가짜 Qrius 로그인 페이지입니다.<br>
     아래 버튼이 실제 사용자 인증을 대신합니다.</p>
  <a class="btn" href="${back.toString()}">로그인하고 계속하기</a>
  <code>QRIUS_STUB — not for production</code>
</div></body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
