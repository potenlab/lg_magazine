"use client";

import { createContext, useContext, useRef, useEffect, useState, ReactNode } from "react";
import { setGlobalVolume as setSfxGlobalVolume } from "@/lib/v3/audio";

interface BGMContextType {
  isPlaying: boolean;
  volume: number;
  toggle: () => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  setScene: (bgmPath?: string, chapter?: number) => void;
}

const BGMContext = createContext<BGMContextType | undefined>(undefined);

// Base volume levels for different sound types (will be multiplied by user
// volume preference). Bumped 2026-05-18 — previous values were so low that
// even at user volume = 100% the BGM was barely audible under SFX.
const VOLUME_LEVELS: Record<string, number> = {
  // Ambient/looping tracks
  "kokoreli777-inside-old-train-169418.mp3": 0.32,
  "freesound_community-train_station_outdoor_platform_birds_people-30576.mp3": 0.6,
  // Sound effects (single play or loop)
  "writing-with-pen-loud.mp3": 1.0,
  "freesound_community-flipcard-91468.mp3": 0.7,
  "dragon-studio-light-switch-on-382714.mp3": 0.75,
  "kauasilbershlachparodes-train-493986.mp3": 0.65,
  "benkirb-shine-10-268906.mp3": 0.7,
  "freesound_community-subway-station-chime-100558.mp3": 0.75,
  "floraphonic-handle-paper-foley-1-172688.mp3": 0.65,
};

// 일회성 효과음(one-shot SFX) 파일들. 씬의 `bgm:` 필드로 들어와도 loop=false로
// 재생해서 한 번만 울리고 끝나야 함. 이전엔 모두 loop=true로 깔려서 경적/스위치/
// 알림음/전환음이 씬 내내 반복 재생됐음.
const ONE_SHOT_BGMS = new Set<string>([
  "kauasilbershlachparodes-train-493986.mp3", // 기차 경적
  "dragon-studio-light-switch-on-382714.mp3", // 스위치 켜는 소리
  "benkirb-shine-10-268906.mp3", // 전환 효과음
  "freesound_community-subway-station-chime-100558.mp3", // 지하철 알림음
]);

export function BGMProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // audio.src는 절대 URL로 변환되어 비교가 어렵기 때문에, 마지막으로 설정한
  // BGM 파일명을 ref에 직접 저장해서 "트랙이 정말 바뀐 경우"만 감지한다.
  // 이게 없으면 volume 토글마다 일회성 SFX가 다시 울린다.
  const lastBgmRef = useRef<string | undefined>(undefined);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [mounted, setMounted] = useState(false);
  const [currentBGM, setCurrentBGM] = useState<string | undefined>();

  useEffect(() => {
    setMounted(true);
    // Restore saved preference from localStorage
    const saved = typeof window !== "undefined" ? localStorage.getItem("bgm-enabled") : null;
    const shouldPlay = saved === null ? true : saved === "true"; // Default to on
    setIsPlaying(shouldPlay);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (!audioRef.current) {
      audioRef.current = new Audio();
      // preload="none" — defer the byte download until play() instead of when
      // src is assigned. Even though this Audio() is created without a src (so
      // nothing downloads on cold load), once a scene supplies a track we set
      // audio.src below; "none" ensures that assignment alone doesn't eagerly
      // pull the full 2.7 MB train BGM. The download happens on play(), which
      // only runs after the user gesture that unblocks autoplay.
      audioRef.current.preload = "none";
    }

    const audio = audioRef.current;

    // currentBGM이 지정되지 않은 씬(예: intro chapter 0)에서는 BGM 재생 안 함.
    // 이전엔 기본값으로 기차음을 틀어서 편지지(letter) 같은 조용한 장면도 기차음이 깔렸음.
    if (!currentBGM) {
      audio.pause();
      localStorage.setItem("bgm-enabled", String(isPlaying));
      return;
    }

    const bgmPath = `/vision_express/${currentBGM}`;
    const isOneShot = ONE_SHOT_BGMS.has(currentBGM);
    const isNewTrack = lastBgmRef.current !== currentBGM;

    if (isNewTrack) {
      audio.src = bgmPath;
      lastBgmRef.current = currentBGM;
    }
    audio.loop = !isOneShot;
    audio.volume = (VOLUME_LEVELS[currentBGM] ?? 0.2) * volume;

    if (isPlaying) {
      // 일회성 SFX는 트랙이 새로 바뀐 경우에만 재생 — volume 슬라이드나
      // isPlaying 토글로 effect가 다시 돌 때 SFX가 매번 재생되는 것을 방지.
      // 루프 BGM은 매번 play() 호출해도 이미 재생 중이면 no-op이므로 OK.
      if (!isOneShot || isNewTrack) {
        audio.play().catch((err) => {
          console.log("BGM autoplay prevented:", err);
        });
      }
    } else {
      audio.pause();
    }

    localStorage.setItem("bgm-enabled", String(isPlaying));
  }, [isPlaying, currentBGM, mounted, volume]);

  // 효과음(SFX) 글로벌 볼륨 동기화 — slider 값만 따라간다.
  // 이전엔 isPlaying=false (BGM 토글 꺼짐)면 효과음도 함께 음소거됐는데,
  // VolumeControl UI에는 isPlaying 토글이 노출돼 있지 않아서 사용자는
  // 음량만 100%로 올린 채로 효과음이 안 들리는 상태를 디버깅할 길이 없었다.
  // 음소거하고 싶으면 슬라이더를 0으로 내리면 된다.
  useEffect(() => {
    if (!mounted) return;
    setSfxGlobalVolume(volume);
  }, [volume, mounted]);

  const toggle = () => {
    setIsPlaying((prev) => !prev);
  };

  const setMuted = (muted: boolean) => {
    setIsPlaying(!muted);
  };

  const setScene = (bgmPath?: string, chapter?: number) => {
    // 씬에서 bgm이 지정되지 않았을 경우 챕터별 기본값 사용
    if (!bgmPath && chapter !== undefined) {
      const chapterDefaults: Record<number, string> = {
        2: "kokoreli777-inside-old-train-169418.mp3", // Ch2: 기차 소리
        3: "kokoreli777-inside-old-train-169418.mp3", // Ch3: 기차 소리
        4: "kokoreli777-inside-old-train-169418.mp3", // Ch4: 기차 소리
      };
      bgmPath = chapterDefaults[chapter];
    }
    setCurrentBGM(bgmPath);
  };

  return (
    <BGMContext.Provider value={{ isPlaying, volume, toggle, setMuted, setVolume, setScene }}>
      {children}
    </BGMContext.Provider>
  );
}

export function useBGM() {
  const ctx = useContext(BGMContext);
  if (!ctx) {
    throw new Error("useBGM must be used within BGMProvider");
  }
  return ctx;
}
