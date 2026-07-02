// 로그인 이벤트 → 관리자 통계 집계. 순수 함수만 — 서버(API/엑셀)와
// 클라이언트 어디서든 import 가능 (mssql 의존 없음).

import type { CohortRule } from "./cohortRules";
import { assignCohort, UNASSIGNED_LABEL } from "./assignCohort";

export interface LoginEvent {
  userid: string;
  email: string | null;
  name: string | null;
  /** ISO string. */
  loggedInAt: string;
}

export interface LoginUserStat {
  userid: string;
  /** 가장 최근 로그인에서 받은 값 (Qrius 가 안 주면 null). */
  email: string | null;
  name: string | null;
  count: number;
  firstLogin: string;
  lastLogin: string;
}

export interface LoginCohortStat {
  name: string;
  uniqueUsers: number;
  logins: number;
}

export interface LoginStats {
  totalLogins: number;
  uniqueUsers: number;
  /** 마지막 로그인 최신순. */
  users: LoginUserStat[];
  /** 차수 규칙 순서 + 미지정(있을 때만). 로그인 시각 기준 버킷. */
  byCohort: LoginCohortStat[];
}

export function aggregateLogins(events: LoginEvent[], rules: CohortRule[]): LoginStats {
  const byUser = new Map<string, LoginUserStat>();
  const cohortLogins = new Map<string, number>();
  const cohortUsers = new Map<string, Set<string>>();

  for (const e of events) {
    const u = byUser.get(e.userid);
    if (u) {
      u.count += 1;
      if (e.loggedInAt < u.firstLogin) u.firstLogin = e.loggedInAt;
      if (e.loggedInAt > u.lastLogin) {
        u.lastLogin = e.loggedInAt;
        if (e.email) u.email = e.email;
        if (e.name) u.name = e.name;
      }
      // 최신 로그인에 값이 없으면 과거 값이라도 유지한다.
      if (!u.email && e.email) u.email = e.email;
      if (!u.name && e.name) u.name = e.name;
    } else {
      byUser.set(e.userid, {
        userid: e.userid,
        email: e.email,
        name: e.name,
        count: 1,
        firstLogin: e.loggedInAt,
        lastLogin: e.loggedInAt,
      });
    }

    const cohort = assignCohort(e.loggedInAt, rules) ?? UNASSIGNED_LABEL;
    cohortLogins.set(cohort, (cohortLogins.get(cohort) ?? 0) + 1);
    if (!cohortUsers.has(cohort)) cohortUsers.set(cohort, new Set());
    cohortUsers.get(cohort)!.add(e.userid);
  }

  const users = [...byUser.values()].sort((a, b) => (a.lastLogin < b.lastLogin ? 1 : -1));

  const cohortNames = [
    ...rules.map((r) => r.name),
    ...(cohortLogins.has(UNASSIGNED_LABEL) ? [UNASSIGNED_LABEL] : []),
  ];
  const byCohort = cohortNames
    .filter((name) => cohortLogins.has(name))
    .map((name) => ({
      name,
      uniqueUsers: cohortUsers.get(name)?.size ?? 0,
      logins: cohortLogins.get(name) ?? 0,
    }));

  return { totalLogins: events.length, uniqueUsers: byUser.size, users, byCohort };
}
