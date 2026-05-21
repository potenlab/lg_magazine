"use client";

import type { V3Session } from "@/lib/v3/scenes/types";

const CHAPTER_LABEL: Record<string, string> = {
  "0": "Chapter 0. 도입",
  "1": "Chapter 1. 내가 지나온 길",
  "2": "Chapter 2. 나는 누구인가",
  "3": "Chapter 3. 내가 그리는 미래",
  "4": "Chapter 4. 내일로 향하는 한 걸음",
  "C": "Closing",
};

function chapterFromSceneId(id: string): string {
  if (id.startsWith("C")) return "C";
  return id.charAt(0);
}

export function ResumeModal({
  session,
  onResume,
  onRestart,
}: {
  session: V3Session;
  onResume: () => void;
  onRestart: () => void;
}) {
  const chapter = chapterFromSceneId(session.lastSceneId);
  const chapterLabel = CHAPTER_LABEL[chapter] ?? "진행 중";
  const name = session.name || "이전 참가자";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="max-w-md rounded-md border border-[#d7bd83]/30 bg-[#f6efdf] p-7 text-[#3d2414] shadow-2xl">
        <p className="font-serif text-lg italic">이전에 진행하시던 매거진이 있어요.</p>
        <p className="mt-2 text-sm leading-relaxed">
          {name}님의 비전 익스프레스가 <strong>{chapterLabel}</strong>에서 멈춰있어요.
        </p>
        <p className="mt-4 text-sm">이어서 가시겠어요? 아니면 새로 시작하시겠어요?</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onResume}
            className="flex-1 rounded-md bg-[#3d2414] px-4 py-2 text-sm text-[#f5ead6]"
          >
            이어가기
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="flex-1 rounded-md border border-[#3d2414]/30 px-4 py-2 text-sm text-[#3d2414]"
          >
            새로 시작
          </button>
        </div>
      </div>
    </div>
  );
}
