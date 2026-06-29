"use client";

import { useEffect, useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { MagazinePosterScene } from "@/components/v3/scenes/MagazinePosterScene";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { MagazinePDF, type MagazineData } from "@/lib/v3/pdf/MagazinePDF";
import { registerPdfFonts } from "@/lib/v3/pdf/fonts";
import { assembleMagazineDataFromSession } from "@/lib/v3/pdf/assembleFromSession";
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
  const { session, patch, reset } = useV3Session();
  // 캐시 patch 는 한 세션 안에서 한 번만 적용 — 다음 효과에서 session.coverHeadline 등이
  // 이미 채워져 있어도 다시 patch 하지 않도록 useRef로 가드.
  const cacheAppliedRef = useRef(false);
  const [data, setData] = useState<MagazineData | null>(null);
  const [status, setStatus] = useState<PdfStatus>("loading");
  // "summary" 는 별첨(전체 대화록) 제외, "full" 은 포함. 한 번에 한 작업만.
  const [downloading, setDownloading] = useState<null | "full" | "summary">(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [magazineOpen, setMagazineOpen] = useState(false);

  // 운영진에게 남기는 한 마디 (선택). 입력칸은 session 값으로 시드하고,
  // "남기기" 누르면 patch → V3SessionContext 자동저장이 MSSQL 까지 반영.
  // 저장 후에도 다시 수정 가능 (다시 누르면 덮어쓰기).
  const [feedbackDraft, setFeedbackDraft] = useState(session.closingFeedback || "");
  const [feedbackSaved, setFeedbackSaved] = useState(
    Boolean(session.closingFeedback && session.closingFeedback.trim()),
  );
  const handleSaveFeedback = () => {
    const trimmed = feedbackDraft.trim();
    if (!trimmed) return;
    patch({ closingFeedback: trimmed });
    setFeedbackSaved(true);
  };

  useEffect(() => {
    registerPdfFonts();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: assembled, cachePatch } = await assembleMagazineDataFromSession(session);
        if (cancelled) return;
        // 처음 생성한 cover/editor/articles 를 세션에 캐시해, 사용자가 "다시 받기"
        // 누르거나 어드민에서 PDF 받을 때 정확히 같은 결과가 나오게 한다.
        // 한 세션에 대해 한 번만 적용 (Object.keys 검사 + ref 가드).
        if (!cacheAppliedRef.current && Object.keys(cachePatch).length > 0) {
          cacheAppliedRef.current = true;
          patch(cachePatch);
        }
        setData(assembled);
        setStatus("ready");
      } catch (err) {
        console.error("[v3] ClosingChoice PDF prep failed:", err);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, patch]);

  const handleDownload = async (variant: "full" | "summary") => {
    if (!data || status !== "ready" || downloading) return;
    setDownloading(variant);
    try {
      const pdfData = variant === "summary" ? { ...data, appendix: undefined } : data;
      const blob = await pdf(<MagazinePDF data={pdfData} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const suffix = variant === "summary" ? "_매거진" : "";
      a.download = `STORY_Vol.${session.name}${suffix}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[v3] PDF generation failed:", err);
      alert("PDF 생성 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setDownloading(null);
    }
  };

  const handleRestartConfirm = () => {
    reset();
    onAdvance("intro");
  };

  const labelFor = (variant: "full" | "summary") => {
    if (status === "loading") return "매거진 생성중..";
    if (downloading === variant) return "다운로드 중…";
    return variant === "summary" ? "매거진만 받기 (요약)" : "전체본 받기 (별첨 포함)";
  };

  return (
    <div className="flex flex-1 flex-col">
      {/* 여정을 마치며 — 운영진에게 한 마디 (선택). 강제 아님: 비워두고
          매거진을 받아가도 OK. 입력 후 "남기기" 누르면 즉시 MSSQL 반영. */}
      <section className="mx-auto mb-6 w-full max-w-2xl rounded-md border border-[#b99b6b]/30 bg-white/55 px-5 py-5 shadow-sm md:mb-8 md:px-6 md:py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9b8768]">
          여정을 마치며
        </p>
        <h3
          className="mt-1 font-serif text-[17px] italic leading-snug text-[#3d2414] md:text-[18px]"
          style={{ fontFamily: "var(--font-ridi-batang), serif" }}
        >
          운영진에게 한 마디 남겨주세요 <span className="not-italic text-[#8b7050]">(선택)</span>
        </h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#6a5a44]">
          이 여정을 거치며 떠오른 생각이나 운영진에게 전하고 싶은 말을 자유롭게 들려주세요.
        </p>
        <textarea
          value={feedbackDraft}
          onChange={(e) => {
            setFeedbackDraft(e.target.value);
            // 한 글자라도 다시 손대면 "저장됨" 표시는 풀어준다 — 사용자가
            // 수정 중이라는 신호를 명확히 하기 위해.
            if (feedbackSaved) setFeedbackSaved(false);
          }}
          rows={3}
          placeholder="예: 처음엔 어색했는데 마지막엔 따뜻하게 마무리됐어요."
          className="mt-3 block w-full resize-y rounded-md border border-[#b99b6b]/40 bg-[#fffaf0] px-3.5 py-2.5 text-[14px] leading-[1.65] text-[#3d2414] outline-none placeholder:text-[#b3a283] focus:border-[#8b7050]"
        />
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <p className="text-[11.5px] text-[#8b7050]">
            {feedbackSaved ? "고마워요. 잘 전달됐어요." : "안 적고 매거진을 받으셔도 괜찮아요."}
          </p>
          <button
            type="button"
            onClick={handleSaveFeedback}
            disabled={!feedbackDraft.trim() || feedbackSaved}
            className="inline-flex h-9 items-center justify-center rounded-md border border-[#3d2414]/55 bg-transparent px-4 font-serif text-[13px] italic tracking-[0.04em] text-[#3d2414] transition hover:bg-[#3d2414]/5 disabled:opacity-40"
          >
            {feedbackSaved ? "전달됨" : "남기기"}
          </button>
        </div>
      </section>

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
              onClick={() => void handleDownload("summary")}
              disabled={status !== "ready" || !!downloading}
              className="inline-flex h-12 items-center justify-center rounded-md border border-[#3d2414]/55 bg-transparent px-5 font-serif italic tracking-[0.04em] text-[#3d2414] transition hover:bg-[#3d2414]/5 disabled:opacity-40"
              title="매거진 본문만 (대화록 별첨 제외)"
            >
              {labelFor("summary")}
            </button>
            <button
              type="button"
              onClick={() => void handleDownload("full")}
              disabled={status !== "ready" || !!downloading}
              className="inline-flex h-12 items-center justify-center rounded-md border border-[#3d2414]/35 bg-transparent px-5 font-serif italic tracking-[0.04em] text-[#3d2414]/80 transition hover:bg-[#3d2414]/5 disabled:opacity-40"
              title="대화록 별첨까지 모두 포함"
            >
              {labelFor("full")}
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
