"use client";

import { useEffect, useMemo, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import type { V3SessionRecord } from "@/lib/v3/session/serverStorage";
import {
  buildV3ChapterThreads,
  type ConversationEntry,
  type ChapterThread,
} from "@/lib/v3/session/adminView";
import { MagazinePDF } from "@/lib/v3/pdf/MagazinePDF";
import { registerPdfFonts } from "@/lib/v3/pdf/fonts";
import { assembleMagazineDataFromSession } from "@/lib/v3/pdf/assembleFromSession";
import type { CohortRule } from "@/lib/admin/cohortRules";
import { assignCohort, UNASSIGNED_LABEL } from "@/lib/admin/assignCohort";

function formatDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function clip(text: string, fallback = "-") {
  if (!text?.trim()) return fallback;
  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
}

function durationMinutes(startISO: string, endISO: string | null): number | null {
  if (!startISO || !endISO) return null;
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 60000);
}

function formatDuration(startISO: string, endISO: string | null) {
  const totalMin = durationMinutes(startISO, endISO);
  if (totalMin == null) return "-";
  if (totalMin < 60) return `${totalMin}분`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

function fromLocalInput(local: string): string {
  // <input type="datetime-local"> 값(예: "2026-06-15T09:00")을 UTC ISO 로.
  return local ? new Date(local).toISOString() : "";
}

type UnifiedItem = {
  key: string;
  name: string;
  job: string;
  status: "in_progress" | "completed";
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  lastSceneId: string | null;
  preview: string;
  cohort: string; // "4차" | "미지정"
  /** 완료면 시작~완료, 진행중이면 시작~최근업데이트 (분). null 은 계산 불가. */
  durationMin: number | null;
};

const SORT_OPTIONS = [
  { key: "updated", label: "최근 업데이트순" },
  { key: "durationDesc", label: "소요시간 긴 순" },
  { key: "durationAsc", label: "소요시간 짧은 순" },
  { key: "createdDesc", label: "시작 최신순" },
] as const;
type SortKey = (typeof SORT_OPTIONS)[number]["key"];

function ConversationCard({
  chapter,
  isOpen,
  onToggle,
  sessionStatus,
}: {
  chapter: ChapterThread;
  isOpen: boolean;
  onToggle: () => void;
  sessionStatus: "in_progress" | "completed";
}) {
  const visible = chapter.entries.filter(
    (entry) => entry.text?.trim() || entry.tone === "result",
  );
  const answerCount = visible.filter(
    (entry) => entry.tone === "answer" && entry.text?.trim(),
  ).length;
  const resultFilled = visible.filter(
    (entry) => entry.tone === "result" && entry.text?.trim(),
  ).length;
  // legacy 항목은 "사용 안 함" 으로 따로 표시하므로 "비어있음" 카운트에서 제외.
  const resultMissing = visible.filter(
    (entry) => entry.tone === "result" && !entry.text?.trim() && !entry.legacy,
  ).length;
  const followupCount = visible.filter(
    (entry) => entry.tone === "followup" && entry.text?.trim(),
  ).length;
  return (
    <section
      id={chapter.chapter.replace(/\s+/g, "-").toLowerCase()}
      className="scroll-mt-6 rounded-md border border-[#e4dccd] bg-white shadow-sm"
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 border-b border-[#eee7dc] px-5 py-4 text-left"
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9b8768]">
            {chapter.chapter}
          </p>
          <h3 className="mt-1 text-lg font-semibold">{chapter.title}</h3>
          <p className="mt-1 text-xs text-[#8d7d66]">
            답변 {answerCount}개 · 되묻기 {followupCount}개 · AI 결과 {resultFilled}개
            {resultMissing > 0 && (
              <span className="ml-1 font-semibold text-[#b25a3b]">· 비어있음 {resultMissing}</span>
            )}
          </p>
        </div>
        <span className="rounded-full border border-[#d8cbb8] px-3 py-1 text-xs text-[#5d4d3b]">
          {isOpen ? "접기" : "펼치기"}
        </span>
      </button>
      {isOpen && (
        <div className="space-y-3 p-5">
          {visible.length === 0 ? (
            <p className="text-sm text-[#7d705f]">아직 이 단계의 응답이 없습니다.</p>
          ) : (
            visible.map((entry, index) => (
              <ConversationBubble
                key={`${entry.label}-${index}`}
                entry={entry}
                sessionStatus={sessionStatus}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}

function ConversationBubble({
  entry,
  sessionStatus,
}: {
  entry: ConversationEntry;
  sessionStatus: "in_progress" | "completed";
}) {
  const isEmpty = !entry.text?.trim();
  // legacy 가 우선. text 있으면 그대로 보여주되 라벨에 [구버전] 표기, 비어있으면
  // 회색 "사용 안 함" placeholder.
  const isLegacy = !!entry.legacy;
  const isMissingResult = isEmpty && entry.tone === "result" && !isLegacy;
  // 완료자인데 비면 거의 실패 (빨강), 진행중이면 아직 거기까지 안 갔거나
  // 분기 우회 등 자연스러운 빈칸일 수 있어 회색으로 노이즈를 낮춘다.
  const failureSuspected = isMissingResult && sessionStatus === "completed";
  const pending = isMissingResult && sessionStatus === "in_progress";

  const styles = isLegacy
    ? "border-dashed border-[#cfc6b3] bg-[#f0ece4] opacity-70"
    : failureSuspected
      ? "border-dashed border-[#e2c8c2] bg-[#fbf1ee]"
      : pending
        ? "border-dashed border-[#d8cbb8] bg-[#f4efe4]"
        : {
            question: "border-[#eadfcf] bg-[#fffdf8]",
            followup: "border-[#d9eee9] bg-[#f5fbf8]",
            answer: "border-[#e2d8ca] bg-[#f8f2e8]",
            result: "border-[#d9e6ef] bg-[#f4f9fb]",
          }[entry.tone || "answer"];

  const labelColor = isLegacy
    ? "text-[#8b7d66]"
    : failureSuspected
      ? "text-[#9b4b3e]"
      : pending
        ? "text-[#8d7d66]"
        : {
            question: "text-[#8d7d66]",
            followup: "text-[#32766b]",
            answer: "text-[#5d4d3b]",
            result: "text-[#217282]",
          }[entry.tone || "answer"];

  return (
    <div className={`rounded-md border p-4 ${styles}`}>
      <p className={`text-[11px] font-semibold tracking-[0.16em] ${labelColor}`}>
        {entry.label}
        {isLegacy && (
          <span className="ml-2 rounded-sm border border-[#c4b89e] px-1.5 py-0.5 text-[9px] font-normal tracking-normal text-[#8b7d66]">
            구버전 · 현재 미사용
          </span>
        )}
      </p>
      {isLegacy && isEmpty ? (
        <p className="mt-2 text-sm italic text-[#9a8d76]">
          (현재 플로우에서 사용되지 않는 반향)
        </p>
      ) : failureSuspected ? (
        <p className="mt-2 text-sm italic text-[#9b4b3e]">
          (LLM 결과 누락 — 완료 세션인데 비어 있음. 호출 실패 의심)
        </p>
      ) : pending ? (
        <p className="mt-2 text-sm italic text-[#8b7050]">
          (아직 채워지지 않음 — 진행중 세션. 도달 전이거나 분기 우회일 수 있음)
        </p>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#34251b]">{entry.text}</p>
      )}
    </div>
  );
}

function CohortRulesModal({
  rules,
  onClose,
  onChanged,
}: {
  rules: CohortRule[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [draftName, setDraftName] = useState("");
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const add = async () => {
    setError("");
    if (!draftName.trim() || !draftStart || !draftEnd) {
      setError("차수 이름과 시작/종료 시각을 모두 입력해주세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/cohorts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName.trim(),
          startAt: fromLocalInput(draftStart),
          endAt: fromLocalInput(draftEnd),
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        setError(payload.error || "저장에 실패했습니다.");
        return;
      }
      setDraftName("");
      setDraftStart("");
      setDraftEnd("");
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`'${name}' 규칙을 삭제할까요?`)) return;
    await fetch(`/api/admin/cohorts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-md border border-[#e4dccd] bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.24em] text-[#9b8768]">
              COHORT RULES
            </p>
            <h2 className="mt-1 text-lg font-semibold">차수 규칙 편집</h2>
            <p className="mt-1 text-xs text-[#8d7d66]">
              세션 시작 시각(created_at)이 아래 구간에 속하면 해당 차수로 자동 분류됩니다.
              같은 이름으로 다시 저장하면 덮어씁니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-[#d8cbb8] px-3 py-1.5 text-xs text-[#5d4d3b]"
          >
            닫기
          </button>
        </div>

        <div className="mt-5 rounded-md border border-[#eee7dc] bg-[#fffdf8] p-4">
          <p className="text-xs font-semibold text-[#5d4d3b]">새 차수 규칙 추가</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="차수 이름 (예: 4차)"
              className="rounded-md border border-[#d8cbb8] bg-white px-3 py-2 text-sm"
            />
            <input
              type="datetime-local"
              value={draftStart}
              onChange={(e) => setDraftStart(e.target.value)}
              className="rounded-md border border-[#d8cbb8] bg-white px-3 py-2 text-sm"
            />
            <input
              type="datetime-local"
              value={draftEnd}
              onChange={(e) => setDraftEnd(e.target.value)}
              className="rounded-md border border-[#d8cbb8] bg-white px-3 py-2 text-sm"
            />
            <button
              onClick={add}
              disabled={busy}
              className="rounded-md bg-[#34251b] px-4 py-2 text-sm font-semibold text-[#fffdf8] disabled:opacity-40"
            >
              {busy ? "저장..." : "추가"}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-[#9b4b3e]">{error}</p>}
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold text-[#5d4d3b]">등록된 규칙</p>
          <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-[#eee7dc]">
            {rules.length === 0 ? (
              <p className="p-4 text-sm text-[#7d705f]">아직 등록된 차수 규칙이 없습니다.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[#f7f3ea] text-left text-[11px] uppercase tracking-widest text-[#9b8768]">
                  <tr>
                    <th className="px-4 py-2">이름</th>
                    <th className="px-4 py-2">시작</th>
                    <th className="px-4 py-2">종료</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id} className="border-t border-[#eee7dc]">
                      <td className="px-4 py-2 font-semibold">{r.name}</td>
                      <td className="px-4 py-2">{formatDate(r.startAt)}</td>
                      <td className="px-4 py-2">{formatDate(r.endAt)}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => remove(r.id, r.name)}
                          className="text-xs text-[#9b4b3e] hover:underline"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {rules.length > 0 && (
            <p className="mt-2 text-[11px] text-[#8d7d66]">
              최근에 추가한 규칙이 우선순위가 높습니다 (규칙이 겹치는 경우).
              참고로 datetime 편집은 &lsquo;삭제 후 재추가&rsquo;로 처리해주세요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [v3Records, setV3Records] = useState<V3SessionRecord[]>([]);
  const [cohortRules, setCohortRules] = useState<CohortRule[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [source, setSource] = useState<"supabase" | "unavailable">("unavailable");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openChapters, setOpenChapters] = useState<string[]>(["Chapter 1"]);
  const [cohortFilter, setCohortFilter] = useState<string>(""); // "" = 전체
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [rulesOpen, setRulesOpen] = useState(false);

  const refresh = async () => {
    setError("");
    setLoading(true);
    try {
      const [v3Res, ruleRes] = await Promise.all([
        fetch("/api/v3/sessions", { cache: "no-store" }),
        fetch("/api/admin/cohorts", { cache: "no-store" }),
      ]);
      if (v3Res.ok) {
        const payload = (await v3Res.json()) as { records?: V3SessionRecord[]; skipped?: boolean };
        setV3Records(payload.records || []);
        setSource(payload.skipped ? "unavailable" : "supabase");
        if (payload.skipped) setError("Supabase가 설정되지 않았습니다.");
      } else {
        setV3Records([]);
        setSource("unavailable");
        setError("세션 데이터를 불러오지 못했습니다.");
      }
      if (ruleRes.ok) {
        const payload = (await ruleRes.json()) as { rules?: CohortRule[] };
        setCohortRules(payload.rules || []);
      }
    } catch (err) {
      setV3Records([]);
      setSource("unavailable");
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const withCohort = useMemo<UnifiedItem[]>(() => {
    return v3Records.map((r) => {
      const cohort = assignCohort(r.createdAt, cohortRules) ?? UNASSIGNED_LABEL;
      const endForDur =
        r.status === "completed" && r.completedAt ? r.completedAt : r.updatedAt;
      return {
        key: r.sessionId,
        name: r.data.name || r.userName || "이름 미입력",
        job: r.data.job || r.job || "직무 미입력",
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        completedAt: r.completedAt,
        lastSceneId: r.lastSceneId,
        preview: r.data.visionLine || r.data.identityName || r.data.flowExperience1 || "",
        cohort,
        durationMin: durationMinutes(r.createdAt, endForDur),
      };
    });
  }, [v3Records, cohortRules]);

  // 필터 탭 옵션: 전체 + 등록된 차수(startAt 오름차순) + 미지정
  const cohortTabs = useMemo(() => {
    const names = cohortRules.map((r) => r.name);
    const hasUnassigned = withCohort.some((i) => i.cohort === UNASSIGNED_LABEL);
    return ["", ...names, ...(hasUnassigned ? [UNASSIGNED_LABEL] : [])];
  }, [cohortRules, withCohort]);

  const filtered = useMemo<UnifiedItem[]>(() => {
    const base = cohortFilter
      ? withCohort.filter((item) => item.cohort === cohortFilter)
      : withCohort;
    const sorted = [...base].sort((a, b) => {
      switch (sortKey) {
        case "durationDesc":
          return (b.durationMin ?? -1) - (a.durationMin ?? -1);
        case "durationAsc":
          return (a.durationMin ?? Number.MAX_SAFE_INTEGER) -
            (b.durationMin ?? Number.MAX_SAFE_INTEGER);
        case "createdDesc":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "updated":
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });
    return sorted;
  }, [withCohort, cohortFilter, sortKey]);

  useEffect(() => {
    setOpenChapters(["Chapter 1"]);
  }, [selectedId]);

  useEffect(() => {
    // 필터 바뀌면 선택이 필터 밖으로 벗어날 수 있으니 첫 항목으로 리셋.
    if (filtered.length > 0 && !filtered.some((i) => i.key === selectedId)) {
      setSelectedId(filtered[0].key);
    }
    if (filtered.length === 0) setSelectedId("");
  }, [filtered, selectedId]);

  const selected = useMemo(
    () => filtered.find((item) => item.key === selectedId) || filtered[0],
    [selectedId, filtered],
  );

  const selectedV3 = selected ? v3Records.find((r) => r.sessionId === selected.key) : undefined;

  const chapterThreads: ChapterThread[] = selectedV3 ? buildV3ChapterThreads(selectedV3.data) : [];

  const stats = useMemo(() => {
    const total = filtered.length;
    const completed = filtered.filter((i) => i.status === "completed").length;
    const durationsCompleted = filtered
      .filter((i) => i.status === "completed" && i.durationMin != null)
      .map((i) => i.durationMin as number);
    const avgMin =
      durationsCompleted.length > 0
        ? Math.round(
            durationsCompleted.reduce((s, v) => s + v, 0) / durationsCompleted.length,
          )
        : null;
    return { total, completed, inProgress: total - completed, avgMin };
  }, [filtered]);

  const toggleChapter = (chapter: string) => {
    setOpenChapters((prev) =>
      prev.includes(chapter) ? prev.filter((item) => item !== chapter) : [...prev, chapter],
    );
  };

  const jumpToChapter = (chapter: string) => {
    setOpenChapters((prev) => (prev.includes(chapter) ? prev : [...prev, chapter]));
    window.setTimeout(() => {
      document
        .getElementById(chapter.replace(/\s+/g, "-").toLowerCase())
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const clearAll = () => {
    if (!window.confirm("저장된 v3 세션을 모두 삭제할까요?")) return;
    fetch("/api/v3/sessions", { method: "DELETE" }).finally(() => {
      setV3Records([]);
      setSelectedId("");
    });
  };

  // PDF 다운로드 진행 상태 — 어드민에서 어떤 세션이라도 즉시 PDF 받을 수 있다.
  // cover/editor/articles 가 캐시된 세션은 LLM 호출 0회로 즉시. 누락된 경우만
  // 그 항목들을 호출하고 결과는 어드민에서 어차피 휘발 (캐시 patch 는 사용자
  // 본인 세션에서만 이뤄짐 — 어드민이 임의로 다른 세션을 patch 하면 사용자가
  // 후에 받는 PDF 와 어긋남).
  // PDF 다운로드 진행 상태 — { sessionId, variant }. 한 번에 한 작업만.
  const [pdfBusy, setPdfBusy] = useState<{ sessionId: string; variant: "full" | "summary" } | null>(null);
  useEffect(() => {
    registerPdfFonts();
  }, []);
  const downloadPdf = async (record: V3SessionRecord, variant: "full" | "summary") => {
    if (pdfBusy) return;
    setPdfBusy({ sessionId: record.sessionId, variant });
    try {
      const { data } = await assembleMagazineDataFromSession(record.data);
      // 요약본 = appendix 페이지 제거. cover/4챕터/editor's note 만.
      const pdfData = variant === "summary" ? { ...data, appendix: undefined } : data;
      const blob = await pdf(<MagazinePDF data={pdfData} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (record.data.name || record.userName || "unknown").replace(/[\\/:*?"<>|]/g, "_");
      const suffix = variant === "summary" ? "_summary" : "";
      a.download = `STORY_Vol.${safeName}${suffix}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[admin] PDF 생성 실패:", err);
      alert("PDF 생성 중 오류가 발생했어요: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setPdfBusy(null);
    }
  };

  const deleteOne = (sessionId: string, name: string) => {
    if (!window.confirm(`'${name}' 응답을 삭제할까요? (되돌릴 수 없습니다)`)) return;
    fetch(`/api/v3/sessions?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE" })
      .finally(() => {
        setV3Records((prev) => prev.filter((r) => r.sessionId !== sessionId));
        setSelectedId((cur) => (cur === sessionId ? "" : cur));
      });
  };

  const downloadExcel = () => {
    const q = cohortFilter ? `?cohort=${encodeURIComponent(cohortFilter)}` : "";
    window.location.href = `/api/admin/export${q}`;
  };

  const formatAvg = (min: number | null) => {
    if (min == null) return "-";
    if (min < 60) return `${min}분`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
  };

  return (
    <main className="min-h-screen bg-[#f7f3ea] text-[#2f261f]">
      <header className="border-b border-[#e4dccd] bg-[#fffaf0] px-6 py-5">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.24em] text-[#9b8768]">MAGAZINE ADMIN</p>
            <h1 className="mt-2 text-2xl font-semibold">응답 관리자</h1>
            <p className="mt-2 text-sm text-[#7d705f]">
              Supabase에 저장된 v3 세션을 차수별로 모아보고, 챕터별 대화 흐름을 확인합니다.
            </p>
            <p className="mt-2 text-xs text-[#9b8768]">
              현재 데이터 소스: {source === "supabase" ? "Supabase" : "연결 없음"}
              {error ? ` · ${error}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={refresh} className="rounded-md border border-[#d8cbb8] px-4 py-2 text-sm text-[#5d4d3b]">
              새로고침
            </button>
            <button
              onClick={() => setRulesOpen(true)}
              className="rounded-md border border-[#d8cbb8] px-4 py-2 text-sm text-[#5d4d3b]"
            >
              차수 규칙
            </button>
            <button
              onClick={downloadExcel}
              disabled={filtered.length === 0}
              className="rounded-md bg-[#34251b] px-4 py-2 text-sm font-semibold text-[#fffdf8] disabled:opacity-40"
            >
              엑셀 다운로드
              {cohortFilter ? ` (${cohortFilter})` : ""}
            </button>
            <button onClick={clearAll} className="rounded-md border border-[#d8cbb8] px-4 py-2 text-sm text-[#9b4b3e]">
              전체 삭제
            </button>
            <button
              onClick={async () => {
                await fetch("/api/auth/admin/logout", { method: "POST" });
                window.location.href = "/admin/login";
              }}
              className="rounded-md border border-[#d8cbb8] px-4 py-2 text-sm text-[#5d4d3b]"
            >
              로그아웃
            </button>
          </div>
        </div>

        <div className="mx-auto mt-4 flex max-w-7xl flex-wrap items-center gap-2">
          {cohortTabs.map((tab) => {
            const label = tab === "" ? "전체" : tab;
            const count =
              tab === ""
                ? withCohort.length
                : withCohort.filter((i) => i.cohort === tab).length;
            const active = tab === cohortFilter;
            return (
              <button
                key={tab || "__all__"}
                onClick={() => setCohortFilter(tab)}
                className="rounded-full border px-3 py-1.5 text-xs transition-colors"
                style={{
                  borderColor: active ? "#34251b" : "#d8cbb8",
                  background: active ? "#34251b" : "transparent",
                  color: active ? "#fffdf8" : "#5d4d3b",
                }}
              >
                {label}
                <span className="ml-1 opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      </header>

      <section className="mx-auto mt-6 grid max-w-7xl gap-5 px-6 pb-6 lg:grid-cols-[380px_1fr]">
        <aside className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-md bg-white p-3 shadow-sm">
              <p className="text-[10px] text-[#8d7d66]">전체</p>
              <p className="mt-1 text-xl font-semibold">{stats.total}</p>
            </div>
            <div className="rounded-md bg-white p-3 shadow-sm">
              <p className="text-[10px] text-[#8d7d66]">완료</p>
              <p className="mt-1 text-xl font-semibold">{stats.completed}</p>
            </div>
            <div className="rounded-md bg-white p-3 shadow-sm">
              <p className="text-[10px] text-[#8d7d66]">진행중</p>
              <p className="mt-1 text-xl font-semibold">{stats.inProgress}</p>
            </div>
            <div className="rounded-md bg-white p-3 shadow-sm">
              <p className="text-[10px] text-[#8d7d66]">평균 소요</p>
              <p className="mt-1 text-xl font-semibold">{formatAvg(stats.avgMin)}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-[#e4dccd] bg-white shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b border-[#eee7dc] px-4 py-3">
              <p className="text-sm font-semibold">응답 목록</p>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-md border border-[#d8cbb8] bg-white px-2 py-1 text-xs text-[#5d4d3b]"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="max-h-[calc(100vh_-_320px)] overflow-y-auto">
              {filtered.length === 0 && (
                <div className="p-5 text-sm leading-6 text-[#7d705f]">
                  {loading ? "응답을 불러오는 중입니다." : "이 조건에 해당하는 응답이 없어요."}
                </div>
              )}
              {filtered.map((item) => {
                const active = item.key === selected?.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setSelectedId(item.key)}
                    className="block w-full border-b border-[#f0e9df] px-4 py-4 text-left transition-colors"
                    style={{ background: active ? "#f4efe4" : "#fff" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{item.name}</p>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="rounded-full px-2 py-1 text-[10px] font-semibold"
                          style={{ background: "#efe6d1", color: "#5d4d3b" }}
                        >
                          {item.cohort}
                        </span>
                        <span
                          className="rounded-full px-2 py-1 text-[10px] font-semibold"
                          style={{
                            background: item.status === "completed" ? "#e7f6ef" : "#f4ead4",
                            color: item.status === "completed" ? "#257a52" : "#8a6a22",
                          }}
                        >
                          {item.status === "completed" ? "완료" : "진행중"}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-[#8d7d66]">
                      {item.job} · {formatDate(item.updatedAt)}
                    </p>
                    <p className="mt-1 text-[11px] text-[#6a5d4d]">
                      소요 {item.durationMin != null ? `${item.durationMin}분` : "-"}
                    </p>
                    {item.status === "in_progress" && item.lastSceneId && (
                      <p className="mt-1 text-[10px] text-[#a06b3e]">
                        이탈 지점: <span className="font-mono">{item.lastSceneId}</span>
                      </p>
                    )}
                    <p className="mt-2 text-xs leading-5 text-[#6a5d4d]">
                      {clip(item.preview, "아직 주요 답변 없음")}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {selected && (
            <div className="sticky top-4 overflow-hidden rounded-md border border-[#e4dccd] bg-white shadow-sm">
              <div className="border-b border-[#eee7dc] px-4 py-3">
                <p className="text-sm font-semibold">챕터 목차</p>
                <p className="mt-1 text-xs text-[#8d7d66]">선택한 응답의 대화 흐름으로 이동합니다.</p>
              </div>
              <div className="p-2">
                {chapterThreads.map((chapter) => {
                  const count = chapter.entries.filter((entry) => entry.text?.trim()).length;
                  return (
                    <button
                      key={chapter.chapter}
                      type="button"
                      onClick={() => jumpToChapter(chapter.chapter)}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-[#f7f3ea]"
                    >
                      <span>
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9b8768]">
                          {chapter.chapter.replace("Chapter ", "CH ")}
                        </span>
                        <span className="text-[#34251b]">{chapter.title}</span>
                      </span>
                      <span className="text-xs text-[#8d7d66]">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        <section className="min-w-0">
          {!selected ? (
            <div className="rounded-md border border-[#e4dccd] bg-white p-10 text-center text-[#7d705f]">
              응답을 선택하면 상세가 표시됩니다.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-md border border-[#e4dccd] bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.18em] text-[#8d7d66]">RESPONSE DETAIL</p>
                    <h2 className="mt-2 text-2xl font-semibold">
                      {selected.name}
                      <span className="ml-3 rounded-full bg-[#efe6d1] px-3 py-1 text-xs font-semibold text-[#5d4d3b] align-middle">
                        {selected.cohort}
                      </span>
                    </h2>
                    <div className="mt-2 grid gap-1 text-sm text-[#7d705f] sm:grid-cols-2">
                      <p>직무: {selected.job}</p>
                      <p>상태: {selected.status === "completed" ? "완료" : "진행중"}</p>
                      <p>시작: {formatDate(selected.createdAt)}</p>
                      <p>
                        종료:{" "}
                        {selected.status === "completed" && selected.completedAt
                          ? formatDate(selected.completedAt)
                          : "-"}
                      </p>
                      <p>최근 업데이트: {formatDate(selected.updatedAt)}</p>
                      <p>
                        소요 시간:{" "}
                        {selected.status === "completed"
                          ? formatDuration(selected.createdAt, selected.completedAt)
                          : `진행중 (${formatDuration(selected.createdAt, selected.updatedAt)} 경과)`}
                      </p>
                      {selected.status === "in_progress" && selected.lastSceneId && (
                        <p className="sm:col-span-2 text-[#a06b3e]">
                          이탈 지점: <span className="font-mono">{selected.lastSceneId}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <div className="rounded-md bg-[#f7f3ea] px-4 py-3 text-sm text-[#5d4d3b]">
                      대표 키워드:{" "}
                      {selectedV3?.data.topValue || selectedV3?.data.identityName || "-"}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {selectedV3 && (
                        <>
                          {(() => {
                            const cached =
                              !!selectedV3.data.coverHeadline?.trim() &&
                              !!selectedV3.data.editorIntro?.trim() &&
                              !!selectedV3.data.editorOutro?.trim();
                            const busyFull =
                              pdfBusy?.sessionId === selectedV3.sessionId && pdfBusy.variant === "full";
                            const busySummary =
                              pdfBusy?.sessionId === selectedV3.sessionId && pdfBusy.variant === "summary";
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() => downloadPdf(selectedV3, "summary")}
                                  disabled={!!pdfBusy}
                                  className="rounded-md border border-[#3d2414]/60 bg-[#3d2414]/5 px-3 py-1.5 text-xs font-semibold text-[#3d2414] hover:bg-[#3d2414]/10 disabled:opacity-40"
                                  title="별첨(대화록) 제외 — 매거진 본문만"
                                >
                                  {busySummary ? "생성 중…" : `요약본 PDF${cached ? " (캐시)" : ""}`}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => downloadPdf(selectedV3, "full")}
                                  disabled={!!pdfBusy}
                                  className="rounded-md border border-[#3d2414]/45 bg-transparent px-3 py-1.5 text-xs text-[#3d2414] hover:bg-[#3d2414]/5 disabled:opacity-40"
                                  title="별첨(전체 대화록) 포함"
                                >
                                  {busyFull ? "생성 중…" : `전체본 PDF${cached ? " (캐시)" : ""}`}
                                </button>
                              </>
                            );
                          })()}
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteOne(selected.key, selected.name)}
                        className="rounded-md border border-[#e2c8c2] px-3 py-1.5 text-xs text-[#9b4b3e] hover:bg-[#fbeeea]"
                      >
                        이 응답 삭제
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {chapterThreads.map((chapter) => (
                  <ConversationCard
                    key={chapter.chapter}
                    chapter={chapter}
                    isOpen={openChapters.includes(chapter.chapter)}
                    onToggle={() => toggleChapter(chapter.chapter)}
                    sessionStatus={selected.status}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      </section>

      {rulesOpen && (
        <CohortRulesModal
          rules={cohortRules}
          onClose={() => setRulesOpen(false)}
          onChanged={refresh}
        />
      )}
    </main>
  );
}
