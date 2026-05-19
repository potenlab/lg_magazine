"use client";

import { useState, useRef, useEffect } from "react";
import { useBGM } from "@/components/v3/context/BGMContext";

/**
 * Floating volume control button — speaker icon that toggles a popover
 * with slider and quick-preset buttons. Affects both BGM and SFX volume.
 *
 * Used across all V3 scenes (IntroScene phases + ChapterHeader).
 */
export function VolumeControl() {
  const { isPlaying, volume, setVolume } = useBGM();
  const [showVolumeControl, setShowVolumeControl] = useState(false);
  const volumeControlRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (volumeControlRef.current && !volumeControlRef.current.contains(e.target as Node)) {
        setShowVolumeControl(false);
      }
    };

    if (showVolumeControl) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showVolumeControl]);

  const volumePercent = Math.round(volume * 100);
  const volumeIcon =
    volume === 0 ? "muted" : volume < 0.33 ? "low" : volume < 0.66 ? "mid" : "high";

  return (
    <div className="relative" ref={volumeControlRef}>
      <button
        type="button"
        onClick={() => setShowVolumeControl(!showVolumeControl)}
        className="pointer-events-auto rounded-full p-2 transition hover:bg-[#f5ead6]/10"
        aria-label={isPlaying ? "음악 조절" : "음악 켜기"}
        title={isPlaying ? `음악: ${volumePercent}%` : "음악: 끔"}
      >
        <svg
          className="h-6 w-6 text-[#f5ead6]"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          {!isPlaying || volume === 0 ? (
            // Muted icon
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.17v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
          ) : volumeIcon === "high" ? (
            // Speaker high
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
          ) : volumeIcon === "mid" ? (
            // Speaker mid
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
          ) : (
            // Speaker low
            <path d="M7 9v6h4l5 5V4l-5 5H7z" />
          )}
        </svg>
      </button>

      {/* Volume Control Popover */}
      {showVolumeControl && (
        <div className="absolute right-0 top-full mt-2 rounded-lg bg-[#2a1f18] border border-[#8b7050]/30 p-4 shadow-xl z-50" style={{ minWidth: "200px" }}>
          <div className="space-y-3">
            {/* Volume Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs tracking-wider text-[#d7bd83]">음량</label>
                <span className="text-sm text-[#e9d5a8]">{volumePercent}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={volumePercent}
                onChange={(e) => setVolume(parseInt(e.target.value) / 100)}
                className="w-full h-2 bg-[#5a4a42] rounded-lg appearance-none cursor-pointer accent-[#d7bd83]"
                style={{
                  background: `linear-gradient(to right, #d7bd83 0%, #d7bd83 ${volumePercent}%, #5a4a42 ${volumePercent}%, #5a4a42 100%)`,
                }}
              />
            </div>

            {/* Quick Volume Presets */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setVolume(0)}
                className="flex-1 px-2 py-1 rounded text-xs bg-[#3d2414] hover:bg-[#5a4a42] text-[#d7bd83] transition"
              >
                끔
              </button>
              <button
                onClick={() => setVolume(0.33)}
                className="flex-1 px-2 py-1 rounded text-xs bg-[#3d2414] hover:bg-[#5a4a42] text-[#d7bd83] transition"
              >
                낮음
              </button>
              <button
                onClick={() => setVolume(0.66)}
                className="flex-1 px-2 py-1 rounded text-xs bg-[#3d2414] hover:bg-[#5a4a42] text-[#d7bd83] transition"
              >
                중간
              </button>
              <button
                onClick={() => setVolume(1)}
                className="flex-1 px-2 py-1 rounded text-xs bg-[#3d2414] hover:bg-[#5a4a42] text-[#d7bd83] transition"
              >
                높음
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
