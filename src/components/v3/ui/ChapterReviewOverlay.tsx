"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import type { ChapterThread } from "@/lib/v3/session/adminView";
import type { V3Session } from "@/lib/v3/scenes/types";

/**
 * Read-only review of one chapter's question/answer digest. Rendered as a
 * full-screen overlay on top of the current scene — closing it returns the
 * participant to exactly where they were (no navigation, no data change).
 */
export function ChapterReviewOverlay({
  thread,
  onClose,
  onEdit,
  lockedFields,
}: {
  thread: ChapterThread;
  onClose: () => void;
  /** 답변 인라인 편집을 허용하려면 전달. fieldKey 가 있는 answer entry 에만
   *  "수정" 어피던스가 붙고, 저장 시 이 콜백으로 patch 가 호출됨. */
  onEdit?: (fieldKey: keyof V3Session, next: string) => void;
  /** 이 set 에 들어 있는 fieldKey 는 이미 LLM 반향이 만들어진 답변이라 잠금.
   *  엔트리에 "수정" 대신 작은 안내 문구 표시. */
  lockedFields?: Set<string>;
}) {
  // Filter strategy:
  // 1) Drop any entry with no text.
  // 2) Drop "question" entries whose following answer hasn't been answered yet,
  //    so questions don't appear before the participant has actually reached
  //    them.
  const rawEntries = thread.entries;
  const entries = rawEntries.filter((e, i) => {
    if (!e.text || e.text.trim().length === 0) return false;
    if (e.tone === "question") {
      const next = rawEntries[i + 1];
      const answered = next && next.text && next.text.trim().length > 0;
      if (!answered) return false;
    }
    return true;
  });

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onClose}
    >
      <motion.div
        className="relative flex max-h-[80vh] w-full max-w-[560px] flex-col overflow-y-auto rounded-md border border-[#d7bd83]/30 bg-[#f6efdf] p-7 shadow-2xl"
        style={{ fontFamily: "var(--font-ridi-batang)" }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[16px] font-semibold uppercase tracking-[0.1em] text-[#9b8768]">
              {thread.chapter}
            </p>
            <h3 className="mt-1 text-[18px] font-semibold text-[#3d2414]">{thread.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[24px] leading-none text-[#8b7050] transition hover:text-[#3d2414]"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="text-[16px] italic text-[#8b7050]">아직 이 챕터의 답변이 없어요.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, i) => {
              // tone-based styling — 질문/답변/AI 결과를 시각적으로 구별
              const isQuestion = entry.tone === "question";
              const isResult = entry.tone === "result";
              const boxClass = isQuestion
                ? "rounded-md border-l-[3px] border-[#b99b6b] bg-transparent px-4 py-2"
                : isResult
                ? "rounded-md border border-[#d7bd83]/40 bg-[#ede1c6]/40 px-4 py-3"
                : "rounded-md border border-[#b99b6b]/30 bg-white/55 px-4 py-3";
              const labelClass = isQuestion
                ? "text-[11px] uppercase tracking-[0.08em] text-[#9b8768]"
                : "text-[16px] tracking-wide text-[#8b7050]";
              const textClass = isQuestion
                ? "mt-1 whitespace-pre-wrap text-[16px] italic leading-[1.6] text-[#6b5337]"
                : "mt-1.5 whitespace-pre-wrap text-[16px] leading-[1.7] text-[#3d2414]";
              const hasField = Boolean(entry.fieldKey);
              const locked = hasField && Boolean(lockedFields?.has(entry.fieldKey!));
              const editable =
                Boolean(onEdit) && entry.tone === "answer" && hasField && !locked;
              return (
                <EntryBox
                  key={i}
                  entry={entry}
                  boxClass={boxClass}
                  labelClass={labelClass}
                  textClass={textClass}
                  editable={editable}
                  locked={locked && entry.tone === "answer"}
                  onSave={
                    editable && entry.fieldKey
                      ? (next) => onEdit?.(entry.fieldKey!, next)
                      : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/** 단일 entry 박스 — editable 일 때 우상단 "수정" 버튼이 보이고, 클릭 시 인라인
 *  textarea 로 전환된다. 저장은 onSave 콜백을 통해 부모(useV3Session.patch)로 전달. */
function EntryBox({
  entry,
  boxClass,
  labelClass,
  textClass,
  editable,
  locked,
  onSave,
}: {
  entry: { label: string; text?: string };
  boxClass: string;
  labelClass: string;
  textClass: string;
  editable: boolean;
  locked?: boolean;
  onSave?: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.text ?? "");

  const start = () => {
    setDraft(entry.text ?? "");
    setEditing(true);
  };
  const cancel = () => setEditing(false);
  const save = () => {
    const v = draft.trim();
    if (!v) return;
    onSave?.(v);
    setEditing(false);
  };

  return (
    <div className={boxClass}>
      <div className="flex items-start justify-between gap-3">
        <p className={labelClass}>{entry.label}</p>
        {editable && !editing && (
          <button
            type="button"
            onClick={start}
            className="shrink-0 text-[12px] italic text-[#8b7050] underline decoration-[#8b7050]/40 underline-offset-[3px] transition hover:text-[#3d2414] hover:decoration-[#3d2414]"
          >
            수정
          </button>
        )}
        {locked && !editing && (
          <span
            className="shrink-0 text-[11px] italic text-[#a18965]"
            title="이 답변은 편집장의 반향이 이미 만들어진 뒤라 수정할 수 없어요."
          >
            반향 생성 후 잠김
          </span>
        )}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(10, Math.max(3, (draft.match(/\n/g)?.length ?? 0) + 2))}
            autoFocus
            className="w-full resize-y rounded-md border border-[#b99b6b]/55 bg-white/80 px-3 py-2 text-[14px] leading-[1.65] text-[#3d2414] outline-none focus:border-[#3d2414]"
            style={{ fontFamily: "var(--font-ridi-batang)" }}
          />
          <div className="flex items-center justify-end gap-3 text-[13px]">
            <button
              type="button"
              onClick={cancel}
              className="italic text-[#8b7050] transition hover:text-[#3d2414]"
            >
              취소
            </button>
            {/* 저장은 StoryButtonV3 동일 톤 — 어두운 양피지·크림 글자·rounded-md. */}
            <button
              type="button"
              onClick={save}
              disabled={draft.trim().length === 0}
              className="rounded-md bg-[#3d2414] px-4 py-2 text-[14px] text-[#f5ead6] transition hover:bg-[#5a3520] disabled:opacity-40"
            >
              저장
            </button>
          </div>
        </div>
      ) : (
        <div className={textClass}>{renderEntryRuns(entry.text ?? "")}</div>
      )}
    </div>
  );
}

// strengthSynthesis 같은 result 텍스트는 `~소주제~` 라인이 섞여 있다.
// 그 줄만 작은 이탤릭으로 렌더링하고 나머지는 그대로 줄바꿈을 살린다.
function renderEntryRuns(text: string) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length === 0) return;
    out.push(<span key={out.length}>{buffer.join("\n")}</span>);
    buffer = [];
  };
  lines.forEach((line, i) => {
    const m = line.match(/^~(.+)~$/);
    if (m) {
      flush();
      out.push(
        <em
          key={out.length}
          className={`block text-[12px] italic tracking-wide text-[#8b7050] ${i === 0 ? "" : "mt-2"}`}
        >
          {m[1]}
        </em>
      );
    } else {
      buffer.push(line);
    }
  });
  flush();
  return out;
}
