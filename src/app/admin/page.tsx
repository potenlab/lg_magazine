"use client";

import { useEffect, useMemo, useState } from "react";
import type { V3SessionRecord } from "@/lib/v3/session/serverStorage";
import {
  buildV3ChapterThreads,
  type ConversationEntry,
  type ChapterThread,
} from "@/lib/v3/session/adminView";

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

function formatDuration(startISO: string, endISO: string | null) {
  if (!startISO || !endISO) return "-";
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "-";
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}분`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
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
};

function ConversationCard({
  chapter,
  isOpen,
  onToggle,
}: {
  chapter: ChapterThread;
  isOpen: boolean;
  onToggle: () => void;
}) {
  // result tone 은 비어 있어도 한 자리를 유지해서 "LLM 결과가 비었다(실패/미생성)" 가
  // 펼친 화면에서 한눈에 보이도록 한다. answer/question/followup 은 종전대로 숨김.
  const visible = chapter.entries.filter(
    (entry) => entry.text?.trim() || entry.tone === "result",
  );
  const answerCount = visible.filter(
    (entry) => entry.tone === "answer" && entry.text?.trim(),
  ).length;
  const resultFilled = visible.filter(
    (entry) => entry.tone === "result" && entry.text?.trim(),
  ).length;
  const resultMissing = visible.filter(
    (entry) => entry.tone === "result" && !entry.text?.trim(),
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
              <ConversationBubble key={`${entry.label}-${index}`} entry={entry} />
            ))
          )}
        </div>
      )}
    </section>
  );
}

function ConversationBubble({ entry }: { entry: ConversationEntry }) {
  const isEmpty = !entry.text?.trim();
  const isMissingResult = isEmpty && entry.tone === "result";

  const styles = isMissingResult
    ? "border-dashed border-[#e2c8c2] bg-[#fbf1ee]"
    : {
        question: "border-[#eadfcf] bg-[#fffdf8]",
        followup: "border-[#d9eee9] bg-[#f5fbf8]",
        answer: "border-[#e2d8ca] bg-[#f8f2e8]",
        result: "border-[#d9e6ef] bg-[#f4f9fb]",
      }[entry.tone || "answer"];

  const labelColor = isMissingResult
    ? "text-[#9b4b3e]"
    : {
        question: "text-[#8d7d66]",
        followup: "text-[#32766b]",
        answer: "text-[#5d4d3b]",
        result: "text-[#217282]",
      }[entry.tone || "answer"];

  return (
    <div className={`rounded-md border p-4 ${styles}`}>
      <p className={`text-[11px] font-semibold tracking-[0.16em] ${labelColor}`}>{entry.label}</p>
      {isMissingResult ? (
        <p className="mt-2 text-sm italic text-[#9b4b3e]">
          (생성 안 됨 / 실패 — LLM 호출이 비어 있거나 실패했을 가능성)
        </p>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#34251b]">{entry.text}</p>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [v3Records, setV3Records] = useState<V3SessionRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [source, setSource] = useState<"supabase" | "unavailable">("unavailable");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openChapters, setOpenChapters] = useState<string[]>(["Chapter 1"]);

  const refresh = async () => {
    setError("");
    setLoading(true);
    try {
      const v3Res = await fetch("/api/v3/sessions", { cache: "no-store" });
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

  const unifiedList = useMemo<UnifiedItem[]>(() => {
    return v3Records
      .map((r) => ({
        key: r.sessionId,
        name: r.data.name || r.userName || "이름 미입력",
        job: r.data.job || r.job || "직무 미입력",
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        completedAt: r.completedAt,
        lastSceneId: r.lastSceneId,
        preview: r.data.visionLine || r.data.identityName || r.data.flowExperience1 || "",
      }))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [v3Records]);

  useEffect(() => {
    setOpenChapters(["Chapter 1"]);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId && unifiedList.length > 0) {
      setSelectedId(unifiedList[0].key);
    }
  }, [unifiedList, selectedId]);

  const selected = useMemo(
    () => unifiedList.find((item) => item.key === selectedId) || unifiedList[0],
    [selectedId, unifiedList],
  );

  const selectedV3 = selected ? v3Records.find((r) => r.sessionId === selected.key) : undefined;

  const chapterThreads: ChapterThread[] = selectedV3 ? buildV3ChapterThreads(selectedV3.data) : [];
  const completed = unifiedList.filter((item) => item.status === "completed").length;

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

  const deleteOne = (sessionId: string, name: string) => {
    if (!window.confirm(`'${name}' 응답을 삭제할까요? (되돌릴 수 없습니다)`)) return;
    fetch(`/api/v3/sessions?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE" })
      .finally(() => {
        setV3Records((prev) => prev.filter((r) => r.sessionId !== sessionId));
        setSelectedId((cur) => (cur === sessionId ? "" : cur));
      });
  };

  return (
    <main className="min-h-screen bg-[#f7f3ea] text-[#2f261f]">
      <header className="border-b border-[#e4dccd] bg-[#fffaf0] px-6 py-5">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.24em] text-[#9b8768]">MAGAZINE ADMIN</p>
            <h1 className="mt-2 text-2xl font-semibold">응답 관리자</h1>
            <p className="mt-2 text-sm text-[#7d705f]">
              Supabase에 저장된 v3 세션을 모아보고, 챕터별 대화 흐름을 확인합니다.
            </p>
            <p className="mt-2 text-xs text-[#9b8768]">
              현재 데이터 소스: {source === "supabase" ? "Supabase" : "연결 없음"}
              {error ? ` · ${error}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={refresh} className="rounded-md border border-[#d8cbb8] px-4 py-2 text-sm text-[#5d4d3b]">
              새로고침
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
      </header>

      <section className="mx-auto mt-6 grid max-w-7xl gap-5 px-6 pb-6 lg:grid-cols-[380px_1fr]">
        <aside className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md bg-white p-4 shadow-sm">
              <p className="text-[11px] text-[#8d7d66]">전체</p>
              <p className="mt-1 text-2xl font-semibold">{unifiedList.length}</p>
            </div>
            <div className="rounded-md bg-white p-4 shadow-sm">
              <p className="text-[11px] text-[#8d7d66]">완료</p>
              <p className="mt-1 text-2xl font-semibold">{completed}</p>
            </div>
            <div className="rounded-md bg-white p-4 shadow-sm">
              <p className="text-[11px] text-[#8d7d66]">진행중</p>
              <p className="mt-1 text-2xl font-semibold">{unifiedList.length - completed}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-[#e4dccd] bg-white shadow-sm">
            <div className="border-b border-[#eee7dc] px-4 py-3">
              <p className="text-sm font-semibold">응답 목록</p>
            </div>
            <div className="max-h-[calc(100vh_-_250px)] overflow-y-auto">
              {unifiedList.length === 0 && (
                <div className="p-5 text-sm leading-6 text-[#7d705f]">
                  {loading
                    ? "응답을 불러오는 중입니다."
                    : "아직 저장된 응답이 없어요."}
                </div>
              )}
              {unifiedList.map((item) => {
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
                    <p className="mt-1 text-xs text-[#8d7d66]">
                      {item.job} · {formatDate(item.updatedAt)}
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
                    <h2 className="mt-2 text-2xl font-semibold">{selected.name}</h2>
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

              <div className="space-y-4">
                {chapterThreads.map((chapter) => (
                  <ConversationCard
                    key={chapter.chapter}
                    chapter={chapter}
                    isOpen={openChapters.includes(chapter.chapter)}
                    onToggle={() => toggleChapter(chapter.chapter)}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
