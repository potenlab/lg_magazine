import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { QRIUS_LOGOUT_URL, QRIUS_SESSION_COOKIE, readQriusConfig } from "@/lib/qrius/config";

export const runtime = "nodejs";

// Clears the local session, then (in real mode) hands off to the Qrius
// logout URL so the user is logged out of LG Academy too — required by CNS.
export async function GET(request: Request) {
  const cfg = readQriusConfig();
  const cookieStore = await cookies();
  cookieStore.delete(QRIUS_SESSION_COOKIE);

  if (cfg.mock) {
    // Use the request origin so logout works on whatever port dev runs on.
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.redirect(QRIUS_LOGOUT_URL);
}
