"use client";

import { useEffect, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { readUrlConfig } from "@/lib/v3/llm/realLLM";
import { MagazinePDF, type MagazineData } from "@/lib/v3/pdf/MagazinePDF";
import { registerPdfFonts } from "@/lib/v3/pdf/fonts";
import { renderTemplate } from "@/lib/v3/scenes/template";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

type PdfStatus = "loading" | "ready" | "error";

/**
 * 종착역 도착 후 마지막 선택 화면.
 *   - "내 매거진 다운받기" — PDF 생성/다운로드 (MagazineHandoffScene 로직 재사용)
 *   - "처음부터 다시하기" — 확인 모달 → reset → intro
 *
 * 다운로드 후에도 세션은 그대로 남아 사용자가 다시 와도 같은 매거진을 받을 수 있다.
 */
export function ClosingChoiceScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session, reset } = useV3Session();
  const [data, setData] = useState<MagazineData | null>(null);
  const [status, setStatus] = useState<PdfStatus>("loading");
  const [downloading, setDownloading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    registerPdfFonts();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = session.chapterArticles ?? {};
        const articleFor = (n: 1 | 2 | 3 | 4) =>
          cached[n] ??
          llm.writeChapterArticle({
            name: session.name,
            gender: session.gender,
            job: session.job,
            chapter: n,
            session,
          });
        const [coverHeadline, editorIntro, editorOutro, ch1, ch2, ch3, ch4] = await Promise.all([
          llm.writeCoverHeadline({ session }),
          llm.writeEditorNote({ session, kind: "intro" }),
          llm.writeEditorNote({ session, kind: "outro" }),
          articleFor(1),
          articleFor(2),
          articleFor(3),
          articleFor(4),
        ]);
        if (cancelled) return;
        setData({
          name: session.name,
          date: new Date().toISOString().slice(0, 10),
          coverHeadline,
          editorIntro,
          editorOutro,
          chapters: { 1: ch1, 2: ch2, 3: ch3, 4: ch4 },
        });
        setStatus("ready");
      } catch (err) {
        console.error("[v3] ClosingChoice PDF prep failed:", err);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const handleDownload = async () => {
    if (!data || status !== "ready" || downloading) return;
    setDownloading(true);
    try {
      const blob = await pdf(<MagazinePDF data={data} deep={readUrlConfig().deep} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `STORY_Vol.${session.name}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[v3] PDF generation failed:", err);
      alert("PDF 생성 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setDownloading(false);
    }
  };

  const handleRestartConfirm = () => {
    reset();
    onAdvance("intro");
  };

  const narration = spec.narration ? renderTemplate(spec.narration, session) : "";
  const downloadLabel =
    status === "loading"
      ? "잠시만요…"
      : downloading
        ? "다운로드 중…"
        : "내 매거진 다운받기";

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1">
        {narration && <NarrationBlock text={narration} />}
      </div>
      <div className="mt-auto flex flex-col items-stretch justify-end gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="rounded-md border border-[#3d2414]/30 px-5 py-2.5 text-[15px] text-[#3d2414] transition hover:bg-[#3d2414]/5"
        >
          처음부터 다시하기
        </button>
        <StoryButtonV3
          label={downloadLabel}
          onClick={() => void handleDownload()}
          disabled={status !== "ready" || downloading}
          ritual
        />
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6">
          <div className="max-w-md rounded-md border border-[#d7bd83]/30 bg-[#f6efdf] p-7 text-[#3d2414] shadow-2xl">
            <p className="font-serif text-lg italic">정말 처음부터 다시 시작하시겠어요?</p>
            <p className="mt-3 text-sm leading-relaxed">
              지금까지의 답변과 매거진은 모두 사라져요. 다운로드해두지 않은 매거진은 다시 받을 수 없어요.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-md border border-[#3d2414]/30 px-4 py-2 text-sm text-[#3d2414]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleRestartConfirm}
                className="flex-1 rounded-md bg-[#3d2414] px-4 py-2 text-sm text-[#f5ead6]"
              >
                네, 처음부터
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
