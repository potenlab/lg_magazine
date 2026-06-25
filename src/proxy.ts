import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { QRIUS_SESSION_COOKIE } from "@/lib/qrius/config";
import { verifySession } from "@/lib/qrius/session";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/adminAuth";

// Next.js 16: this file replaces `middleware.ts`. It gates the WHOLE app —
// every page and API route requires a valid Qrius session. The only paths
// left open are the Qrius auth endpoints themselves, Next.js internals, and
// public/ static assets. The trailing `.*\.[\w]+$` clause excludes any path
// with a file extension (/vision_express, /brand, /fonts, …); without it the
// image optimizer's unauthenticated internal fetch gets 307'd to login and
// images break — even for logged-in users.
export const config = {
  matcher: ["/((?!api/auth/qrius|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Dev-only PDF 라이브 프리뷰 — 매거진 PDF 페이지별 라이브 렌더 (Cover/TOC/
  // EditorIntro/Ch1~4/EditorOutro) 를 풀 세션 거치지 않고 보기 위함.
  // production 에서는 매처를 통해서도 도달 불가하도록 NODE_ENV 가드.
  if (pathname.startsWith("/pdf-preview") && process.env.NODE_ENV === "development") {
    return NextResponse.next();
  }

  // Verify the session cryptographically (not just cookie presence) so a
  // forged or expired cookie cannot slip past the gate.
  const token = request.cookies.get(QRIUS_SESSION_COOKIE)?.value;
  const secret = process.env.QRIUS_SESSION_SECRET;
  const session = token && secret ? await verifySession(token, secret) : null;

  if (session) {
    // Qrius 통과 후, /admin 경로는 별도 관리자 비번 쿠키로 한 번 더 검증한다.
    // 로그인 페이지 자체와 login/logout API 는 통과시켜야 폼이 동작한다.
    const isAdminGated =
      (pathname.startsWith("/admin") && pathname !== "/admin/login") ||
      (pathname.startsWith("/api/admin") && !pathname.startsWith("/api/auth/admin"));

    if (isAdminGated) {
      const adminToken = request.cookies.get(ADMIN_COOKIE)?.value;
      const adminOk = await verifyAdminToken(adminToken);
      if (!adminOk) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "admin_unauthenticated" }, { status: 401 });
        }
        const login = new URL("/admin/login", request.url);
        login.searchParams.set("next", `${pathname}${search}`);
        return NextResponse.redirect(login);
      }
    }
    return NextResponse.next();
  }

  // Unauthenticated API calls get a JSON 401 — a 302 would corrupt fetch().
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Unauthenticated page loads bounce through the Qrius login starter,
  // remembering where the user was headed.
  const login = new URL("/api/auth/qrius/login", request.url);
  login.searchParams.set("redirect", `${pathname}${search}`);
  return NextResponse.redirect(login);
}
