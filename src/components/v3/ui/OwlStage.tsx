"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { personaConcept } from "@/concepts";
import type { OwlPose } from "@/lib/v3/scenes/types";

export function OwlStage({ pose, large }: { pose: OwlPose; large?: boolean }) {
  const src = personaConcept.characterImages[pose];
  return (
    <motion.div
      key={pose}
      animate={{ y: [0, -5, 0], rotate: [0, -1, 0] }}
      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      className={
        large
          ? "pointer-events-none w-[min(840px,91vw,67vh)] opacity-95"
          : "pointer-events-none w-[min(480px,58vw,62vh)] opacity-95"
      }
    >
      {/* next/image (→ /_next/image) — production's reverse proxy 400s direct
          requests to /public assets, so a raw <img src> breaks there. */}
      <Image
        src={src}
        alt="L-OWL"
        width={1024}
        height={1097}
        priority
        className="h-auto w-full drop-shadow-2xl"
      />
    </motion.div>
  );
}
