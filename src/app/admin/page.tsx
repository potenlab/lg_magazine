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

function ConversationCard({
  chapter,
  isOpen,
  onToggle,
}: {
  chapter: ChapterThread;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const visible = chapter.entries.filter((entry) => entry.text?.trim());
  const answerCount = visible.filter((entry) => entry.tone === "answer").length;
  const resultCount = visible.filter((entry) => entry.tone === "result").length;
  const followupCount = visible.filter((entry) => entry.tone === "followup").length;
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
            답변 {answerCount}개 · 되묻기 {followupCount}개 · AI 결과 {resultCount}개
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
  const styles = {
    question: "border-[#eadfcf] bg-[#fffdf8]",
    followup: "border-[#d9eee9] bg-[#f5fbf8]",
    answer: "border-[#e2d8ca] bg-[#f8f2e8]",
    result: "border-[#d9e6ef] bg-[#f4f9fb]",
  }[entry.tone || "answer"];

  const labelColor = {
    question: "text-[#8d7d66]",
    followup: "text-[#32766b]",
    answer: "text-[#5d4d3b]",
    result: "text-[#217282]",
  }[entry.tone || "answer"];

  return (
    <div className={`rounded-md border p-4 ${styles}`}>
      <p className={`text-[11px] font-semibold tracking-[0.16em] ${labelColor}`}>{entry.label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#34251b]">{entry.text}</p>
    </div>
  );
}

export default function AdminPage() {
  const [records, setRecords] = useState<V3SessionRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [source, setSource] = useState<"supabase" | "unavailable">("unavailable");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openChapters, setOpenChapters] = useState<string[]>(["Chapter 1"]);

  const refresh = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/v3/sessions", { cache: "no-store" });
      if (res.ok) {
        const payload = (await res.json()) as { records: V3SessionRecord[]; skipped?: boolean };
        setRecords(payload.records || []);
        setSource(payload.skipped ? "unavailable" : "supabase");
        if (payload.skipped) setError("Supabase가 설정되지 않았습니다.");
      } else {
        setRecords([]);
        setSource("unavailable");
        setError("세션 데이터를 불러오지 못했습니다.");
      }
    } catch (err) {
      setRecords([]);
      setSource("unavailable");
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    setOpenChapters(["Chapter 1"]);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId && records.length > 0) {
      setSelectedId(records[0].sessionId);
    }
  }, [records, selectedId]);

  const selected = useMemo(
    () => records.find((r) => r.sessionId === selectedId) || records[0],
    [selectedId, records],
  );

  const chapterThreads: ChapterThread[] = selected
    ? buildV3ChapterThreads(selected.data)
    : [];

  const completed = records.filter((r) => r.status === "completed").length;

  const toggleChapter = (chapter: string) => {
    setOpenChapters((prev) =>
      prev.includes(chapter) ? prev.filter((c) => c !== chapter) : [...prev, chapter],
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
    if (!window.confirm("저장된 세션을 모두 삭제할까요?")) return;
    fetch("/api/v3/sessions", { method: "DELETE" }).finally(() => {
      setRecords([]);
      setSelectedId("");
    });
  };

  return (
    <main className="min-h-screen bg-[#f7f3ea] text-[#2f261f]">
      <header className="border-b border-[#e4dccd] bg-[#fffaf0] px-6 py-5">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.24em] text-[#9b8768]">
              VISION EXPRESS ADMIN
            </p>
            <h1 className="mt-2 text-2xl font-semibold">응답 관리자</h1>
            <p className="mt-2 text-sm text-[#7d705f]">
              Supabase에 저장된 세션을 모아보고 챕터별 대화 흐름을 확인합니다.
            </p>
            <p className="mt-2 text-xs text-[#9b8768]">
              데이터 소스: {source === "supabase" ? "Supabase" : "사용 불가"}
              {error ? ` · ${error}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={refresh}
              className="rounded-md border border-[#d8cbb8] px-4 py-2 text-sm text-[#5d4d3b]"
            >
              새로고침
            </button>
            <button
              onClick={clearAll}
              className="rounded-md border border-[#d8cbb8] px-4 py-2 text-sm text-[#9b4b3e]"
            >
              전체 삭제
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto mt-6 grid max-w-7xl gap-5 pb-6 lg:grid-cols-[380px_1fr]">
        <aside className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md bg-white p-4 shadow-sm">
              <p className="text-[11px] text-[#8d7d66]">전체</p>
              <p className="mt-1 text-2xl font-semibold">{records.length}</p>
            </div>
            <div className="rounded-md bg-white p-4 shadow-sm">
              <p className="text-[11px] text-[#8d7d66]">완료</p>
              <p className="mt-1 text-2xl font-semibold">{completed}</p>
            </div>
            <div className="rounded-md bg-white p-4 shadow-sm">
              <p className="text-[11px] text-[#8d7d66]">진행중</p>
              <p className="mt-1 text-2xl font-semibold">{records.length - completed}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-[#e4dccd] bg-white shadow-sm">
            <div className="border-b border-[#eee7dc] px-4 py-3">
              <p className="text-sm font-semibold">세션 목록</p>
            </div>
            <div className="max-h-[calc(100vh_-_250px)] overflow-y-auto">
              {records.length === 0 && (
                <div className="p-5 text-sm leading-6 text-[#7d705f]">
                  {loading
                    ? "세션을 불러오는 중입니다."
                    : "아직 저장된 세션이 없어요. 플로우를 진행하면 여기에 쌓입니다."}
                </div>
              )}
              {records.map((r) => {
                const active = r.sessionId === selected?.sessionId;
                const name = r.data.name || r.userName || "이름 미입력";
                const job = r.data.job || r.job || "직무 미입력";
                const preview =
                  r.data.visionLine || r.data.identityName || r.data.flowExperience1 || "";
                return (
                  <button
                    key={r.sessionId}
                    onClick={() => setSelectedId(r.sessionId)}
                    className="block w-full border-b border-[#f0e9df] px-4 py-4 text-left transition-colors"
                    style={{ background: active ? "#f4efe4" : "#fff" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{name}</p>
                      <span
                        className="rounded-full px-2 py-1 text-[10px] font-semibold"
                        style={{
                          background: r.status === "completed" ? "#e7f6ef" : "#f4ead4",
                          color: r.status === "completed" ? "#257a52" : "#8a6a22",
                        }}
                      >
                        {r.status === "completed" ? "완료" : "진행중"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#8d7d66]">
                      {job} · {formatDate(r.updatedAt)}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-[#6a5d4d]">
                      {clip(preview, "아직 주요 답변 없음")}
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
                <p className="mt-1 text-xs text-[#8d7d66]">
                  선택한 세션의 대화 흐름으로 이동합니다.
                </p>
              </div>
              <div className="p-2">
                {chapterThreads.map((chapter) => {
                  const count = chapter.entries.filter((e) => e.text?.trim()).length;
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
              세션을 선택하면 상세가 표시됩니다.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-md border border-[#e4dccd] bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9b8768]">
                      SESSION DETAIL
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold">
                      {selected.data.name || selected.userName || "이름 미입력"}
                    </h2>
                    <p className="mt-2 text-sm text-[#7d705f]">
                      {selected.data.job || selected.job || "직무 미입력"} · 최초{" "}
                      {formatDate(selected.createdAt)} · 최근 {formatDate(selected.updatedAt)}
                    </p>
                  </div>
                  <div className="rounded-md bg-[#f7f3ea] px-4 py-3 text-sm text-[#5d4d3b]">
                    대표 키워드:{" "}
                    {selected.data.topValue || selected.data.identityName || "-"}
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
