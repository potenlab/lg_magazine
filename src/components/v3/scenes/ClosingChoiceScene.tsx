"use client";

import { useEffect, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { MagazinePosterScene } from "@/components/v3/scenes/MagazinePosterScene";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { cleanArticleField } from "@/lib/v3/llm/articleSanitize";
import { MagazinePDF, type MagazineData } from "@/lib/v3/pdf/MagazinePDF";
import { registerPdfFonts } from "@/lib/v3/pdf/fonts";
import { buildAppendixThreads } from "@/lib/v3/pdf/buildAppendix";
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
  const [magazineOpen, setMagazineOpen] = useState(false);

  useEffect(() => {
    registerPdfFonts();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = session.chapterArticles ?? {};
        // 캐시에 있어도 body/headline 이 비어 있으면 stale 로 간주하고 재호출 —
        // 빈 챕터 회귀(매거진 모달·PDF Ch3 빈칸) 회복.
        const isUsable = (a: { headline: string; body: string } | undefined) =>
          !!a && !!a.headline?.trim() && !!a.body?.trim();
        const articleFor = (n: 1 | 2 | 3 | 4) =>
          isUsable(cached[n])
            ? cached[n]
            : llm.writeChapterArticle({
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
        // 캐시된 stale 또는 새로 받은 응답 모두 raw markdown(`**`, `**PULL:**`) 을
        // 흘릴 수 있어 PDF 직전에 일괄 sanitize.
        const cleanArticle = (a: { headline: string; body: string; pullQuote: string | null }) => ({
          headline: cleanArticleField(a.headline),
          body: cleanArticleField(a.body),
          pullQuote: a.pullQuote ? cleanArticleField(a.pullQuote) || null : null,
        });
        setData({
          name: session.name,
          date: new Date().toISOString().slice(0, 10),
          coverHeadline,
          editorIntro,
          editorOutro,
          chapters: {
            1: cleanArticle(ch1),
            2: cleanArticle(ch2),
            3: cleanArticle(ch3),
            4: cleanArticle(ch4),
          },
          appendix: buildAppendixThreads(session),
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
      const blob = await pdf(<MagazinePDF data={data} />).toBlob();
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

  const downloadLabel =
    status === "loading"
      ? "매거진 생성중.."
      : downloading
        ? "다운로드 중…"
        : "내 매거진 다운받기";

  return (
    <div className="flex flex-1 flex-col">
      <div className="grid flex-1 gap-6 md:grid-cols-2 md:gap-10">
        {/* 좌측 — 매거진 다시 보기 / 다운받기 */}
        <section className="flex flex-col items-center justify-center text-center">
          <p
            className="text-[18px] font-semibold leading-[1.55] text-[#3d2414] md:text-[20px]"
            style={{ fontFamily: "var(--font-ridi-batang)" }}
          >
            나의 매거진은 언제든
            <br />
            다시 볼 수 있어요.
          </p>
          {/* 펼쳐보기(fill, primary) + 다운받기(line, secondary) 나란히 배치.
              모바일에서는 한 줄에 둘 다 들어가도록 gap-3 + flex-row 유지. */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <StoryButtonV3
              label="내 매거진 펼쳐보기"
              onClick={() => setMagazineOpen(true)}
              ritual
            />
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={status !== "ready" || downloading}
              className="inline-flex h-12 items-center justify-center rounded-md border border-[#3d2414]/55 bg-transparent px-6 font-serif italic tracking-[0.04em] text-[#3d2414] transition hover:bg-[#3d2414]/5 disabled:opacity-40"
            >
              {downloadLabel}
            </button>
          </div>
        </section>

        {/* 우측 — 다시 플레이하기 */}
        <section className="relative flex flex-col items-center justify-center text-center md:border-l md:border-[#b99b6b]/30 md:pl-10">
          <p
            className="text-[17px] font-semibold leading-[1.55] text-[#3d2414] md:text-[18px]"
            style={{ fontFamily: "var(--font-ridi-batang)" }}
          >
            시간이 흘러 다시 나를 잃어버린 것 같다면,
            <br />
            괜찮아요. 언제든 다시 떠날 수 있어요.
          </p>
          <p className="mt-2 text-[13px] italic text-[#8b7050]">
            ※단, 다시 시작하면 지금까지의 기록은 사라져요.
          </p>
          <div className="mt-6 flex justify-center">
            <StoryButtonV3
              label="다시 플레이하기"
              onClick={() => setConfirmOpen(true)}
              ritual
            />
          </div>
        </section>
      </div>

      {magazineOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/80 px-4 pt-[110px] pb-6 sm:px-6">
          <div className="relative flex h-full max-h-[calc(100vh_-_140px)] w-full max-w-5xl flex-col rounded-md bg-[#f6efdf] p-5 text-[#3d2414] shadow-2xl sm:p-7">
            <button
              type="button"
              onClick={() => setMagazineOpen(false)}
              aria-label="매거진 닫기"
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[#3d2414]/25 bg-[#f6efdf] text-[18px] leading-none text-[#3d2414] transition hover:bg-[#3d2414]/10"
            >
              ×
            </button>
            <div className="flex min-h-0 flex-1 flex-col pt-6">
              <MagazinePosterScene
                spec={{
                  ...spec,
                  buttonLabel: "닫기",
                  next: () => spec.id,
                }}
                onAdvance={() => setMagazineOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

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
