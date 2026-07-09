# LLM Provenance + Admin Fallback 가시화 — 설계

작성일: 2026-06-26
상태: 승인 대기 (브레인스토밍 합의안 A)

## 목표

각 v3 응답을 **누가 생성했는지**(Claude / Gemini / aistudio / stub) 세션에 기록하고,
어드민에서 **응답별 provider 뱃지 + task별 fallback율**을 본다.

배경: task→provider 라우팅은 결정적이지만(아래 표) 저장된 세션에는 provider가
남지 않아, 한 응답을 보고 "Claude가 썼나 Gem이 썼나 stub인가"를 사후 판별할 수
없다. stub만 고정 문구 역추적으로 잡히고, Claude/Gemini는 출력만으로 구분 불가.
이 설계는 그 공백을 메운다.

### 비목표 (YAGNI)
- 호출 1건 단위(재시도·동시성 포함) 정밀 로깅 — 별도 테이블이 필요한 방식 B는 채택 안 함.
- 토큰/비용 집계 — 이번 범위 아님.
- 기존 23건 소급 — 역추적 스캔(이미 보유)으로 충분, 마이그레이션 안 함.

## 현재 라우팅 (참고)

버킷 2개로만 갈린다.

| 버킷 | task | 결정 |
|---|---|---|
| synthesis | `synthesizeStrength`, `synthesizeGrowthVision` | `LLM_PROVIDER_SYNTHESIS` ‖ `LLM_PROVIDER` ‖ anthropic |
| default | 그 외 전부 | `LLM_PROVIDER` ‖ anthropic |

URL 프리픽스 override: `/claude`→전부 anthropic, `/gem`→전부 gemini,
`/mix`→ default=gemini·synthesis=anthropic. (`x-llm-mode` 헤더로 전달)

## 데이터 모델

`V3Session`에 필드 1개 추가. Supabase `v3_sessions.data`가 JSONB이므로 **마이그레이션 불필요**.

```ts
// src/lib/v3/scenes/types.ts
export type LLMProviderTag = "anthropic" | "gemini" | "aistudio" | "stub";

export interface LLMCallMeta {
  provider: LLMProviderTag;
  ms: number;            // 호출 소요(ms)
  at: string;            // ISO timestamp (마지막 호출 기준)
}

interface V3Session {
  // ...
  /** task 이름 → 마지막 호출의 provenance. 같은 task 재호출 시 덮어쓴다
   *  (세션당 task별 1줄 = 합의안 A). 기록 없으면 그 task는 아직 미호출. */
  llmMeta: Record<string, LLMCallMeta>;
}
```

`EMPTY_V3_SESSION.llmMeta = {}` 추가.

## 컴포넌트 / 데이터 흐름

```
[scene] realLLM.<task>()
   └─ callTask(task, payload)
        └─ POST /api/v3/llm  ──▶ route: 결정적 provider 계산
                              ◀── { result, provider }     (성공)
   ├─ 성공: recordCall(task, provider, ms)
   └─ 실패/빈응답 → stub 사용: recordCall(task, "stub", ms)

[provenance collector]  (module singleton)
   snapshot() ──▶ V3SessionContext.syncToServer 가 세션에 머지
                  → POST /api/v3/sessions → Supabase data.llmMeta

[admin] /api/v3/sessions → records[].data.llmMeta
   ├─ 집계 패널: task별 anthropic/gemini/stub 개수 + fallback율
   └─ 응답 뱃지: 각 답변/결과 옆 provider 칩
```

### ① 서버 — provider를 응답에 실어보내기
파일: `src/app/api/v3/llm/route.ts`

- 새 헬퍼 `resolveProviderTag(task, mode): LLMProviderTag` — `getProviderFor`와 **동일 우선순위**로 provider 이름을 계산(버킷 판정: synthesis task 집합 상수로). prompts.ts 반환 타입은 건드리지 않는다.
- 동기 경로: `return NextResponse.json({ result, provider })`.
- 비동기 경로(`LLM_ASYNC=1`, 202+jobId): job 결과에 provider를 함께 실어 `/api/v3/llm/jobs`가 `{ status, result, provider }`로 돌려주도록 enqueue 페이로드에 provider를 포함. (jobQueue 결과 객체에 provider 필드 추가)
- `LlmBusyError`(429)·500 등 실패는 provider 미포함 — 클라이언트가 stub로 기록.

> 주의: route가 내는 provider는 **의도된 provider**다. 실제 성공 여부는 클라이언트가
> 안다(성공=의도 provider, 실패→stub). 이 조합이 정확한 최종 상태를 만든다.

### ② 클라이언트 — 수집기 + 기록
새 파일: `src/lib/v3/llm/provenance.ts`
```ts
const meta: Record<string, LLMCallMeta> = {};
export function recordCall(task: string, provider: LLMProviderTag, ms: number) {
  meta[task] = { provider, ms, at: new Date().toISOString() };
}
export function snapshotProvenance(): Record<string, LLMCallMeta> {
  return { ...meta };
}
```
파일: `src/lib/v3/llm/realLLM.ts`
- `callTask`가 `{ result, provider }`를 받도록 변경(현재 `result`만). 202 폴링 경로도 provider 회수.
- 각 contract 메서드를 task 이름과 함께 감싸 계시:
  - 성공 → `recordCall(task, provider, ms)`
  - `catch`/빈응답 stub 분기 → `recordCall(task, "stub", ms)`
  - 호출 시각 측정은 `performance.now()` diff.
- 기존 `fromStub` 플래그·console.warn 동작은 유지(회귀 방지).

파일: `src/components/v3/context/V3SessionContext.tsx`
- `syncToServer`에서 전송 직전 머지:
  `const payload = { ...session, llmMeta: { ...session.llmMeta, ...snapshotProvenance() } };`
  `body: JSON.stringify({ session: payload })`
- reducer/localStorage는 손대지 않는다(provenance는 서버 분석용; 게임 상태 아님).

### ③ 어드민 표시
파일: `src/app/admin/page.tsx` (+ 필요 시 `adminView.ts`)

- **집계 패널**(상단, 전체 레코드 기준): task별 행 — `anthropic n / gemini n / stub n`, fallback율 = stub / (해당 task 기록 수). 역추적 스캔 출력과 같은 표.
- **응답 뱃지**: `ConversationEntry`에 옵셔널 `task?: string`을 추가하고, `buildV3ChapterThreads`의 LLM 산출 entry(tone="result" 등)에 해당 task 이름을 박는다. 어드민은 `llmMeta[entry.task]`로 provider 칩 렌더(`🟦 Claude` / `🟩 Gemini` / `🟨 AIStudio` / `⚠ stub`). `task` 없는 entry(순수 사용자 입력)는 칩 없음. (현재 entry에는 producing-task 정보가 없으므로 이 매핑 추가가 전제다.)

## 엣지 케이스
- **구버전 세션(`llmMeta` 없음)**: 집계·뱃지에서 해당 task를 "미상"으로 빼고 카운트하지 않는다(undefined 안전). 어드민은 빈 객체로 취급.
- **비동기 큐 경로**: provider가 job 결과에 실려야 한다 — 누락 시 클라이언트는 그 task를 stub로 오기록할 수 있으므로, jobQueue 결과 타입 변경을 구현 체크리스트의 명시 항목으로 둔다.
- **같은 task 재호출(retry/재방문)**: 마지막 호출로 덮어쓴다(합의안 A). 중간 stub→재시도 성공이면 최종은 성공으로 남아, "참가자가 최종적으로 본 것" 기준이 된다.
- **stub 후 성공 순서**: realLLM은 호출당 한 번만 record하므로 순서 문제 없음.

## 테스트 전략
- **단위**: `resolveProviderTag(task, mode)` — synthesis 버킷 task 1개 + default 버킷 task 1개를, 각 mode {null, gem, claude, mix} × env 조합으로 검증해 라우팅 표와 일치(특히 mix: synthesis=anthropic / default=gemini, env: `LLM_PROVIDER_SYNTHESIS` 우선순위).
- **단위**: provenance collector — record→snapshot 머지, 동일 task 덮어쓰기.
- **통합(수동/프리뷰)**: `/gem`으로 한 세션 완주 → Supabase `data.llmMeta`가 전부 gemini, 강제 실패 주입 시 해당 task가 stub로 기록.
- **회귀**: 기존 `fromStub` 경로·fallback 동작 불변. 구버전 세션(llmMeta 없음)에서 어드민이 깨지지 않음.

## 작업 표면 요약
| 파일 | 변경 |
|---|---|
| `src/lib/v3/scenes/types.ts` | `LLMProviderTag`/`LLMCallMeta` 타입, `V3Session.llmMeta`, EMPTY 기본값 |
| `src/lib/v3/llm/provenance.ts` | **신규** — 수집기 |
| `src/app/api/v3/llm/route.ts` | `resolveProviderTag`, 응답에 `provider`(동기/비동기 둘 다) |
| `src/lib/llm/jobQueue.ts` | job 결과에 `provider` 필드 |
| `src/lib/v3/llm/realLLM.ts` | `callTask` provider 회수, 메서드별 `recordCall` |
| `src/components/v3/context/V3SessionContext.tsx` | sync 직전 `llmMeta` 머지 |
| `src/app/admin/page.tsx` (+`adminView.ts`) | 집계 패널 + provider 뱃지 |

마이그레이션: 없음 (JSONB).
