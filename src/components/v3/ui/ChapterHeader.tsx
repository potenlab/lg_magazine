"use client";

import Image from "next/image";
import { VolumeControl } from "@/components/v3/ui/VolumeControl";

// Top-of-screen branding strip. Matches IntroScene's Header (`small` variant)
// so the masthead is visually unified across all V3 scenes.
// Chapter info now lives in the bottom ProgressRail.
// `dim` (spec.dimBackground 씬): 로고만 어둡게 — 볼륨 컨트롤은 그대로.
export function ChapterHeader({ dim }: { dim?: boolean } = {}) {
  // pointer-events-none on the wrapper so the masthead doesn't intercept
  // clicks meant for the dialog beneath. VolumeControl re-enables pointer
  // events on its own button. z-[40] so the volume button sits above the
  // dialog wrapper (z-20) for every scene — fixes "ch0부터 음량 컨트롤 클릭
  // 안 됨" where the dialog's z-20 wrapper would overlap the header.
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[40] flex items-center justify-between px-8 py-5">
      <div className="flex-1" />

      <Image
        src="/brand/magazine-story-logo.svg"
        alt="Magazine STORY Vision Express"
        width={410}
        height={71}
        priority
        className={`h-auto w-[clamp(180px,24vw,260px)] transition-opacity duration-300 ${dim ? "opacity-25" : "opacity-100"}`}
      />

      <div className="flex-1 flex justify-end">
        <VolumeControl />
      </div>
    </div>
  );
}
