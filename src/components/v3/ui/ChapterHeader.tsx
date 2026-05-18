"use client";

import Image from "next/image";
import { VolumeControl } from "@/components/v3/ui/VolumeControl";

// Top-of-screen branding strip. Matches IntroScene's Header (`small` variant)
// so the masthead is visually unified across all V3 scenes.
// Chapter info now lives in the bottom ProgressRail.
export function ChapterHeader() {
  return (
    <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-8 py-5">
      <div className="pointer-events-none flex-1" />

      <Image
        src="/brand/magazine-story-logo.svg"
        alt="Magazine STORY Vision Express"
        width={410}
        height={71}
        priority
        className="h-auto w-[clamp(180px,24vw,260px)]"
      />

      <div className="flex-1 flex justify-end">
        <VolumeControl />
      </div>
    </div>
  );
}
