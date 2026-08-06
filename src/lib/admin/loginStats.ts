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
  /** 표시용 이름 — 익명(anon-*) 사용자는 "user#N"(첫 로그인 순), 그 외에는 userid. */
  label: string;
  /** 가장 최근 로그인에서 받은 값 (Qrius 가 안 주면 null). */
  email: string | null;
  name: string | null;
  count: number;
  firstLogin: string;
  lastLogin: string;
  /** 같은 사람으로 합쳐진 브라우저 수. 1 이면 표시하지 않는다. */
  devices?: number;
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
        label: e.userid,
        email: e.email,
        name: e.name,
        count: 1,
        firstLogin: e.loggedInAt,
        lastLogin: e.loggedInAt,
      });
    }

    const cohort = assignCohort(e.loggedInAt, rules) ?? UNASSIGNED_LABEL;
    cohortLogins.set(cohort, (cohortLogins.get(cohort) ?? 0) + 1);
  }

  // 사용자는 "첫 로그인" 시각의 차수에 한 번만 귀속시킨다 — 차수별 인원수 합이
  // 항상 전체 등록 인원수와 일치하도록 (로그인 횟수는 이벤트 시각 기준 그대로).
  for (const u of byUser.values()) {
    const cohort = assignCohort(u.firstLogin, rules) ?? UNASSIGNED_LABEL;
    if (!cohortUsers.has(cohort)) cohortUsers.set(cohort, new Set());
    cohortUsers.get(cohort)!.add(u.userid);
  }

  // 익명 사용자는 첫 로그인 순서로 user#1, user#2 … 안정적인 번호를 붙인다.
  [...byUser.values()]
    .filter((u) => u.userid.startsWith("anon-"))
    .sort((a, b) => (a.firstLogin < b.firstLogin ? -1 : 1))
    .forEach((u, i) => {
      u.label = `user#${i + 1}`;
    });

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

/**
 * 로그인 통계를 "사람" 단위로 다시 묶는다.
 *
 * LG(CNS)에서 실명·이메일을 받을 수 없어 **참가자가 활동에서 입력한 승객명을
 * 사람의 식별자로 쓰기로 합의**했다(2026-08-05, 이민재/이혜원). 기본 집계 단위인
 * userid 는 브라우저 쿠키 단위라 한 사람이 휴대폰·PC 로 접속하면 두 줄이 되는데,
 * 이름이 같으면 한 줄로 합친다.
 *
 * 이름이 연결되지 않은 브라우저(로그인만 하고 활동을 시작하지 않은 경우)는
 * 합칠 근거가 없으므로 user#N 라벨 그대로 각각 남는다.
 *
 * ponytail: 동명이인은 한 사람으로 합쳐진다 — 이메일을 수집하지 않기로 한 이상
 * 구분할 방법이 없다. 실명/사번이 내려오기 시작하면 그 값을 키로 바꾼다.
 */
export function groupLoginUsersByName(
  users: LoginUserStat[],
  nameByUserid: Map<string, string>,
): LoginUserStat[] {
  const byKey = new Map<string, LoginUserStat>();
  for (const u of users) {
    const name = nameByUserid.get(u.userid);
    const key = name ? `name:${name}` : `id:${u.userid}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...u, label: name ?? u.label, devices: 1 });
      continue;
    }
    prev.count += u.count;
    prev.devices = (prev.devices ?? 1) + 1;
    if (u.firstLogin < prev.firstLogin) prev.firstLogin = u.firstLogin;
    if (u.lastLogin > prev.lastLogin) prev.lastLogin = u.lastLogin;
    prev.email ??= u.email;
    prev.name ??= u.name;
  }
  return [...byKey.values()].sort((a, b) => (a.lastLogin < b.lastLogin ? 1 : -1));
}
