import type { CohortRule } from "./cohortRules";

/** 세션 생성 시각을 규칙 목록과 매칭해 차수 이름을 반환. 매칭 없으면 null. */
export function assignCohort(createdAtIso: string, rules: CohortRule[]): string | null {
  if (!createdAtIso) return null;
  const t = new Date(createdAtIso).getTime();
  if (!Number.isFinite(t)) return null;
  // 여러 규칙이 겹치면 start_at 이 늦은 쪽(=더 최근에 정의한 회차)을 우선한다.
  // listCohortRules 는 start_at 오름차순으로 오므로 뒤에서부터 훑는다.
  for (let i = rules.length - 1; i >= 0; i--) {
    const r = rules[i];
    const s = new Date(r.startAt).getTime();
    const e = new Date(r.endAt).getTime();
    if (Number.isFinite(s) && Number.isFinite(e) && t >= s && t <= e) return r.name;
  }
  return null;
}

/** UI 표시용 — null 은 "미지정" 으로 치환. */
export const UNASSIGNED_LABEL = "미지정";
export function cohortLabel(name: string | null): string {
  return name ?? UNASSIGNED_LABEL;
}
