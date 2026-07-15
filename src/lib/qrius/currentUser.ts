import { cookies } from "next/headers";
import { QRIUS_SESSION_COOKIE, readQriusConfig } from "./config";
import { verifySession } from "./session";

// qrius 세션 쿠키에서 userid 추출. 시크릿 미설정(프리뷰 env)이나 무효 토큰이면
// null. 서명 검증까지 하므로 위조 쿠키로는 다른 userid 를 사칭할 수 없다.
export async function currentUserid(): Promise<string | null> {
  try {
    const token = (await cookies()).get(QRIUS_SESSION_COOKIE)?.value;
    if (!token) return null;
    const { sessionSecret } = readQriusConfig();
    return (await verifySession(token, sessionSecret))?.userid ?? null;
  } catch {
    return null;
  }
}
