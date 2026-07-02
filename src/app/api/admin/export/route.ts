import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { listV3Sessions, isMssqlConfigured } from "@/lib/v3/session/serverStorage";
import { listCohortRules } from "@/lib/admin/cohortRules";
import { assignCohort, UNASSIGNED_LABEL } from "@/lib/admin/assignCohort";
import { listQriusLogins } from "@/lib/admin/qriusLogins";
import { aggregateLogins } from "@/lib/admin/loginStats";

export const runtime = "nodejs";

function durationMin(startIso: string, endIso: string | null): number | "" {
  if (!startIso || !endIso) return "";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  return Math.round(ms / 60000);
}

function join(values: string[] | undefined): string {
  return (values ?? []).filter(Boolean).join(", ");
}

function fmtValueDefs(defs: Record<string, string> | undefined): string {
  if (!defs) return "";
  return Object.entries(defs)
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join(" / ");
}

export async function GET(req: Request) {
  if (!isMssqlConfigured()) {
    return NextResponse.json({ error: "mssql_not_configured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const cohortFilter = searchParams.get("cohort"); // e.g. "4차" | "미지정" | null(=전체)

  const [sessions, rules, loginEvents] = await Promise.all([
    listV3Sessions(),
    listCohortRules(),
    // 로그인 로그는 조회 실패해도 세션 엑셀은 나가야 한다 (테이블 미생성 등).
    listQriusLogins().catch(() => [] as Awaited<ReturnType<typeof listQriusLogins>>),
  ]);

  const rows = sessions
    .map((r) => {
      const cohort = assignCohort(r.createdAt, rules);
      return { record: r, cohortName: cohort ?? UNASSIGNED_LABEL };
    })
    .filter(({ cohortName }) => (cohortFilter ? cohortName === cohortFilter : true))
    .map(({ record: r, cohortName }) => {
      const s = r.data;
      return {
        차수: cohortName,
        이름: s.name || r.userName || "",
        직무: s.job || r.job || "",
        상태: r.status === "completed" ? "완료" : "진행중",
        시작: r.createdAt,
        완료: r.completedAt ?? "",
        "소요(분)": durationMin(r.createdAt, r.completedAt ?? r.updatedAt),
        "마지막 업데이트": r.updatedAt,
        "이탈 지점": r.lastSceneId ?? "",
        sessionId: r.sessionId,

        "Ch0 자유맥락": s.freeContext || "",
        "Ch0 어색함 피드백": s.awkwardnessFeedback || "",

        "Ch1 몰입1": s.flowExperience1 || "",
        "Ch1 몰입2": s.flowExperience2 || "",
        "Ch1 시적 미러": s.ch1PoeticMirror || "",
        "Ch1 공통 패턴": s.commonPattern || "",

        "Ch2 선택 가치": join(s.selectedValues),
        "Ch2 가치 정의": fmtValueDefs(s.valueDefinitions),
        "Ch2 대표 가치": s.topValue || "",
        "Ch2 가치 리플렉션": s.valueReflection || "",
        "Ch2 도움요청 경험": s.helpRequests || "",
        "Ch2 강점 공통결(AI)": s.strengthCommonAsk || "",
        "Ch2 강점 확정": s.strengthConfirmed ? "맞음" : s.strengthRevised || "",
        "Ch2 자기강점 정렬": s.selfStrengthAlignment || "",
        "Ch2 강점 종합(AI)": s.strengthSynthesis || "",
        "Ch2 타인의 시선": s.othersDescription || "",
        "Ch2 정체성 이름": s.identityName || "",

        "Ch3 끌림": s.attraction || "",
        "Ch3 이미 하는 것": s.alreadyDoing || "",
        "Ch3 장애물": s.obstacles || "",
        "Ch3 향하고 싶은 이유": s.whyReason || "",
        "Ch3 성장 방향": s.growthDirection || "",
        "Ch3 지금 도구": join(s.currentTool),
        "Ch3 성장 도구": join(s.growthTool),
        "Ch3 기여": s.contribution || "",
        "Ch3 성장비전 종합(AI)": s.growthVisionSynthesis || "",
        "Ch3 비전 문장": s.visionLine || "",
        "Ch3 시간지평": join(s.timeHorizon),

        "Ch4 첫걸음": s.firstStep || "",
        "Ch4 함께할 사람": s.supportPerson || "",
        "Ch4 필요 자원": s.neededResource || "",

        "Closing 소감": s.closingFeedback || "",
      };
    });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "v3_sessions");

  // LG SSO 로그인 현황 — 사용자별 집계 (차수 필터와 무관하게 전체).
  const loginStats = aggregateLogins(loginEvents, rules);
  const loginRows = loginStats.users.map((u) => ({
    userid: u.userid,
    "로그인 횟수": u.count,
    "첫 로그인": u.firstLogin,
    "마지막 로그인": u.lastLogin,
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(loginRows), "로그인");

  const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const today = new Date().toISOString().slice(0, 10);
  const filename = cohortFilter
    ? `magazine_${cohortFilter}_${today}.xlsx`
    : `magazine_${today}.xlsx`;

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control": "no-store",
    },
  });
}
