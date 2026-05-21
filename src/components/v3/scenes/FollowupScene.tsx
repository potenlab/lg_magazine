"use client";

import { useContext, useEffect, useState } from "react";
import { AutoFlowText } from "@/components/v3/ui/AutoFlowText";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { HintInput } from "@/components/v3/ui/HintInput";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { renderTemplate } from "@/lib/v3/scenes/template";
import { paginateMirror } from "@/lib/v3/paginateMirror";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { DialogStageContext } from "@/components/v3/V3App";
import type { Branch, SceneSpec, SceneId, V3Session, BranchSpec } from "@/lib/v3/scenes/types";

// Find the "exit" branch in a followup scene's branches map — any branch with
// `next` set, meaning a sufficient answer that should advance the flow.
// Different rules use different letters for this slot (ch1 uses D, ch2 uses
// C, ch3VisionLine uses C with affirmation lines, ...), so we detect rather
// than hardcode. Branches with both `next` AND `lines` are exit branches that
// render their lines as a fixed affirmation in place of the LLM reflection.
function findExitBranch(branches?: SceneSpec["branches"]): Branch {
  if (!branches) return "D";
  // Prefer pure-next branch if present (legacy ch1 D pattern).
  for (const letter of ["A", "B", "C", "D"] as Branch[]) {
    const b = branches[letter];
    if (b && b.next && !b.lines && !b.narration) return letter;
  }
  // Otherwise accept a branch with `next` + lines (affirmation-on-exit pattern).
  for (const letter of ["A", "B", "C", "D"] as Branch[]) {
    const b = branches[letter];
    if (b && b.next) return letter;
  }
  return "D";
}

export function FollowupScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session, patch, incrementFollowup } = useV3Session();
  const parentSaveTo = spec.parentSaveTo;
  if (!parentSaveTo) {
    throw new Error(`FollowupScene ${spec.id} missing parentSaveTo`);
  }

  const exitBranch = findExitBranch(spec.branches);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [reflection, setReflection] = useState<string>("");
  const [opener, setOpener] = useState<string | null>(null);
  // Tracks whether the exit was reached by max-followup exhaustion rather than
  // by a sufficient answer. Per spec 14.5, the editor's exit tone should
  // differ: natural exit can affirm, exhausted exit stays plain. The branch
  // spec exposes `exhaustedLines` for that variant.
  const [exhausted, setExhausted] = useState(false);
  const [edit, setEdit] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const { setStage } = useContext(DialogStageContext);

  // While the LLM judge is thinking we only show a one-line italic stub
  // ("편집장이 답변을 들여다본다…"). Keep the dialog wrapper compact so the
  // box doesn't render at full input height with empty space below.
  useEffect(() => {
    if (loading) setStage("narration");
  }, [loading, setStage]);

  useEffect(() => {
    let cancelled = false;
    const answer = String(session[parentSaveTo] ?? "");
    // Chapter type is `0 | 1 | 2 | 3 | 4 | "C"` but followup only fires in 1-4.
    // Narrow defensively so reflectShort gets a valid tone hint.
    const reflectChapter: 1 | 2 | 3 | 4 =
      spec.chapter === 1 || spec.chapter === 2 || spec.chapter === 3 || spec.chapter === 4
        ? spec.chapter
        : 1;
    // ch4 / neededResource(4-6b) 단계에서는 직전 두 질문(인물·자원) 답변을
    // 합쳐 LLM에 전달해 통합 반향을 만든다.  topic은 별도 키로 분기.
    let reflectAnswer = answer;
    let reflectTopic: string = parentSaveTo;
    if (reflectChapter === 4 && parentSaveTo === "neededResource") {
      const supportPerson = String(session.supportPerson ?? "").trim();
      const neededResource = String(session.neededResource ?? "").trim();
      if (supportPerson || neededResource) {
        reflectAnswer = [
          supportPerson ? `[함께할 사람] ${supportPerson}` : null,
          neededResource ? `[필요한 자원] ${neededResource}` : null,
        ]
          .filter(Boolean)
          .join("\n");
        reflectTopic = "supportPersonAndResource";
      }
    }
    (async () => {
      const [judged, refl] = await Promise.all([
        llm.judgeBranch({ sceneId: spec.id, answer }),
        llm.reflectShort({
          answer: reflectAnswer,
          name: session.name,
          chapter: reflectChapter,
          topic: reflectTopic,
        }),
      ]);
      if (cancelled) return;

      const followups = session.followupCounts[spec.id] ?? 0;
      const max = spec.maxFollowups ?? 2;
      const naturalExit = judged.branch === exitBranch;
      // Each non-exit branch may only appear once per followup scene instance.
      // We store seen branches as `followupCounts["sceneId:Branch"] = 1` so
      // the check survives component remounts (onAdvance(spec.id) → remount).
      const branchSeenKey = `${spec.id}:${judged.branch}`;
      const alreadySeen = !naturalExit && (session.followupCounts[branchSeenKey] ?? 0) > 0;
      const forcedExit = !naturalExit && (followups >= max || alreadySeen);
      const finalBranch = naturalExit || forcedExit ? exitBranch : judged.branch;

      // Mark the branch as seen so a repeat low-effort answer can't trigger it again.
      if (finalBranch !== exitBranch) {
        patch({
          followupCounts: { ...session.followupCounts, [branchSeenKey]: 1 },
        } as Partial<V3Session>);
      }

      const pool = spec.branches?.[finalBranch]?.openerPool;
      const pickedOpener =
        pool && pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;

      setBranch(finalBranch);
      setReflection(refl);
      setOpener(pickedOpener);
      setExhausted(forcedExit);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id]);

  if (loading || !branch) {
    return (
      <NarrationBlock text="편집장이 답변을 들여다본다.&#10;펜이 잠시 멈춘다…" />
    );
  }

  if (branch === exitBranch) {
    const exitSpec = spec.branches?.[exitBranch];
    const target =
      exitSpec?.next ??
      (typeof spec.next === "string" ? spec.next : undefined);
    // Pick exit text: spec 14.5 — on forced exit prefer `exhaustedLines`
    // (담담한 톤) over the natural `lines` (추켜세우는 톤). Falls back to
    // `lines`, then to the LLM reflection.
    const rawExitLines = exhausted && exitSpec?.exhaustedLines
      ? exitSpec.exhaustedLines
      : exitSpec?.lines;
    const exitLines = (rawExitLines ?? []).map((l) => renderTemplate(l, session));
    const text = exitLines.length > 0 ? exitLines.join("\n") : reflection;
    return (
      <FollowupExitBody
        reflection={text}
        onAdvance={() => {
          if (target) onAdvance(target);
        }}
      />
    );
  }

  const branchSpec: BranchSpec = spec.branches?.[branch] ?? {};
  const branchLines = [
    ...(opener ? [opener] : []),
    ...(branchSpec.lines ?? []),
  ].map((l) => renderTemplate(l, session));

  const submit = () => {
    if (edit.trim().length === 0) return;
    incrementFollowup(spec.id);
    patch({ [parentSaveTo]: edit.trim() } as Partial<V3Session>);
    onAdvance(spec.id);
  };

  return <FollowupBody
    branchSpec={branchSpec}
    branchLines={branchLines}
    reflection={reflection}
    edit={edit}
    setEdit={setEdit}
    spec={spec}
    onSubmit={submit}
  />;
}

function FollowupExitBody({
  reflection,
  onAdvance,
}: {
  reflection: string;
  onAdvance: () => void;
}) {
  const [settled, setSettled] = useState(false);
  const [page, setPage] = useState(0);
  const { setStage } = useContext(DialogStageContext);
  // Deep mode produces a 3-paragraph reflection — paginate it so neither page
  // is a dense block. Short exit affirmations (≤1 page) stay compact.
  const pages = paginateMirror(reflection);
  useEffect(() => {
    setStage(pages.length > 1 ? "content" : "narration");
  }, [setStage, pages.length]);
  const lastPage = page >= pages.length - 1;
  // Split on newlines so a multi-sentence page staggers line by line.
  const lines = (pages[page] ?? reflection)
    .split("\n")
    .filter((l) => l.trim().length > 0);
  const handleClick = () => {
    if (!settled) return;
    if (!lastPage) {
      setSettled(false);
      setPage(page + 1);
      return;
    }
    onAdvance();
  };
  return (
    <div
      className={`flex flex-1 flex-col ${settled ? "cursor-pointer" : ""}`}
      onClick={settled ? handleClick : undefined}
    >
      <div className="flex-1 space-y-4">
        <AutoFlowText
          key={page}
          lines={lines.length > 0 ? lines : [reflection]}
          onSettled={() => setSettled(true)}
        />
      </div>
      <div className="mt-auto flex justify-end text-[16px] text-[#8b7050]">
        <span
          className={`italic transition-opacity ${settled ? "opacity-100" : "opacity-0"}`}
        >
          다음
        </span>
      </div>
    </div>
  );
}

function FollowupBody({
  branchSpec,
  branchLines,
  reflection,
  edit,
  setEdit,
  spec,
  onSubmit,
}: {
  branchSpec: BranchSpec;
  branchLines: string[];
  reflection: string;
  edit: string;
  setEdit: (v: string) => void;
  spec: SceneSpec;
  onSubmit: () => void;
}) {
  const { session } = useV3Session();
  const [settled, setSettled] = useState(false);
  const narration = branchSpec.narration
    ? renderTemplate(branchSpec.narration, session)
    : undefined;
  const [showLines, setShowLines] = useState(!narration);
  const { setStage } = useContext(DialogStageContext);

  // Deep mode produces a 3-paragraph reflection. When it paginates into 2+
  // pages, page through the reflection on its own dialog windows first, then
  // show the followup question. Non-deep (≤1 page) keeps the reflection inline
  // with the question as before.
  const reflectionPages = reflection ? paginateMirror(reflection) : [];
  const pagedReflection = reflectionPages.length > 1;
  const [reflPage, setReflPage] = useState(0);
  const onReflectionPage = pagedReflection && reflPage < reflectionPages.length;

  useEffect(() => {
    // Compact dialog while showing italic prelude OR while lead-in lines
    // are still staggering. Reflection pages and the settled input grow it.
    const compact = (!showLines && narration) || (!onReflectionPage && !settled);
    setStage(compact ? "narration" : "content");
  }, [showLines, narration, settled, onReflectionPage, setStage]);

  const reflectionLines = reflection
    ? reflection.split("\n").map((l) => l.trim()).filter((l) => l.length > 0)
    : [];
  // On the question page: if the reflection was shown on its own pages, don't
  // repeat it inline — show only the followup question lines.
  const allLines = pagedReflection
    ? branchLines
    : [...reflectionLines, ...branchLines];

  if (!showLines && narration) {
    return (
      <div
        className="flex flex-1 cursor-pointer flex-col"
        onClick={() => setShowLines(true)}
      >
        <div className="flex-1">
          <NarrationBlock text={narration} />
        </div>
        <div className="mt-auto flex items-center justify-end text-[16px] text-[#8b7050]">
          <span className="italic">다음</span>
        </div>
      </div>
    );
  }

  if (onReflectionPage) {
    const pageLines = reflectionPages[reflPage]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    return (
      <div
        className={`flex flex-1 flex-col ${settled ? "cursor-pointer" : ""}`}
        onClick={
          settled
            ? () => {
                setSettled(false);
                setReflPage(reflPage + 1);
              }
            : undefined
        }
      >
        <div className="flex-1 space-y-4">
          <AutoFlowText
            key={reflPage}
            lines={pageLines}
            onSettled={() => setSettled(true)}
          />
        </div>
        <div className="mt-auto flex justify-end text-[16px] text-[#8b7050]">
          <span
            className={`italic transition-opacity ${settled ? "opacity-100" : "opacity-0"}`}
          >
            다음
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-5">
        <AutoFlowText lines={allLines} onSettled={() => setSettled(true)} />
        {settled && (
          <HintInput
            value={edit}
            onChange={setEdit}
            placeholder={branchSpec.placeholder ? renderTemplate(branchSpec.placeholder, session) : undefined}
            hint={branchSpec.inputHint ? renderTemplate(branchSpec.inputHint, session) : undefined}
          />
        )}
      </div>
      {/* Absolute-anchored to dialog bottom-right — mirrors the "이전" button
          (absolute bottom-7 left-7) so the action button stays at a fixed
          position regardless of how much content is above. */}
      <div
        className={`absolute bottom-7 right-7 z-10 flex h-[44px] items-center transition-opacity duration-500 ${
          settled ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <StoryButtonV3
          label={spec.buttonLabel ?? "전달하기"}
          onClick={onSubmit}
          disabled={edit.trim().length === 0}
          ritual
        />
      </div>
    </div>
  );
}
