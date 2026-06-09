"use client";

/**
 * Lightweight audio manager for v3 scene SFX/BGM.
 *
 * - Maintains a singleton <audio> element per named clip so playOnce()
 *   restarts cleanly without piling up duplicate Audio() objects.
 * - playOnce() — fire-and-forget short SFX (paper / pen / chime / etc.).
 * - startLoop() / stopLoop() — long-running BGM (train cabin, station
 *   platform). Idempotent: starting an already-playing loop is a no-op.
 * - Browsers block audio playback until the user has interacted with the
 *   page (autoplay policy). Every play() is wrapped in .catch() so a
 *   blocked autoplay never throws — the audio just silently no-ops until
 *   the next user gesture lands. The intro envelope click is the first
 *   gesture, so SFX after that point work cleanly.
 */

const AUDIO_FILES = {
  paper: "/vision_express/floraphonic-handle-paper-foley-1-172688.mp3",
  station:
    "/vision_express/freesound_community-train_station_outdoor_platform_birds_people-30576.mp3",
  horn: "/vision_express/kauasilbershlachparodes-train-493986.mp3",
  // amplified 4x via ffmpeg — 원본은 너무 잔잔해서 사용자가 안 들린다고 함
  pen: "/vision_express/writing-with-pen-loud.mp3",
  trainLoop: "/vision_express/kokoreli777-inside-old-train-169418.mp3",
  switchOn: "/vision_express/dragon-studio-light-switch-on-382714.mp3",
  card: "/vision_express/freesound_community-flipcard-91468.mp3",
  transition: "/vision_express/benkirb-shine-10-268906.mp3",
  chime: "/vision_express/freesound_community-subway-station-chime-100558.mp3",
} as const;

export type AudioName = keyof typeof AUDIO_FILES;

const elements: Partial<Record<AudioName, HTMLAudioElement>> = {};

// Per-clip last-played timestamp. Used to enforce "play only once" within a
// short window — guards against React strict-mode double-fire and rapid
// re-renders that would otherwise replay the same horn/chime/switch SFX.
const lastPlayedAt: Partial<Record<AudioName, number>> = {};
const PLAY_COOLDOWN_MS = 1500;
// 사용자 클릭에 직접 묶이는 SFX 는 짧은 쿨다운 + 재생 중에도 재시작 허용.
// 카드/페이퍼 처럼 연속 탭이 자연스러운 음원은 여기에 추가.
const CLIP_COOLDOWN_MS: Partial<Record<AudioName, number>> = {
  card: 80,
  paper: 80,
};

// 클립별 기본 볼륨 오버라이드 (0~1). 미지정 시 DEFAULT_SFX_VOL 사용.
const CLIP_VOLUME: Partial<Record<AudioName, number>> = {
  card: 1.0, // 배경 기차 소리 위에서도 또렷이 들리도록 max
};

function get(name: AudioName): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!elements[name]) {
    const a = new Audio(AUDIO_FILES[name]);
    // preload="none" — defer the byte download until an actual .play() call,
    // not on element creation. Browsers download a preload="auto" clip in full
    // the moment the Audio() is constructed; "none" keeps these mp3s off the
    // cold-load critical path so they only cost bytes when the user actually
    // triggers them (gesture/scene event). play() still streams + plays fine.
    a.preload = "none";
    elements[name] = a;
  }
  return elements[name] ?? null;
}

const DEFAULT_SFX_VOL = 0.7;
const DEFAULT_LOOP_VOL = 0.55;

// 글로벌 SFX/Loop volume multiplier — BGMContext의 setVolume에서 호출되어
// BGM 볼륨 조절이 효과음에도 동일하게 적용되도록 한다. (음소거 = 0, 최대 = 1)
let _volumeMultiplier = 1;

export function setGlobalVolume(multiplier: number): void {
  _volumeMultiplier = Math.max(0, Math.min(1, multiplier));
  // 현재 재생 중인 모든 오디오의 볼륨도 즉시 업데이트
  for (const name of Object.keys(elements) as AudioName[]) {
    const el = elements[name];
    if (!el) continue;
    const baseVol = el.loop ? DEFAULT_LOOP_VOL : DEFAULT_SFX_VOL;
    el.volume = baseVol * _volumeMultiplier;
  }
}

export function playOnce(name: AudioName, volume = CLIP_VOLUME[name] ?? DEFAULT_SFX_VOL): void {
  const el = get(name);
  if (!el) return;
  // 글로벌 볼륨이 0이면 (음소거) 재생 자체를 스킵
  if (_volumeMultiplier === 0) return;
  const cooldown = CLIP_COOLDOWN_MS[name] ?? PLAY_COOLDOWN_MS;
  const isClickDriven = CLIP_COOLDOWN_MS[name] !== undefined;
  // 클릭-기반 SFX(card/paper) 는 이전 재생을 자르고 새로 시작. 그 외는
  // 이미 재생 중이면 무시 (호른·스위치·전환음 중복 방지).
  if (!isClickDriven && !el.paused && !el.ended) return;
  // Cooldown: 같은 클립을 짧은 시간 안에 다시 호출하면 무시.
  // (StrictMode 이중 mount / fast refresh / 빠른 리렌더로 인한 중복 재생 방지)
  const now = Date.now();
  const last = lastPlayedAt[name] ?? 0;
  if (now - last < cooldown) return;
  lastPlayedAt[name] = now;
  el.loop = false;
  el.volume = volume * _volumeMultiplier;
  try {
    el.currentTime = 0;
  } catch {
    /* ignore — currentTime can throw if metadata isn't loaded yet */
  }
  el.play().catch(() => {
    /* autoplay blocked or no user gesture yet — ignore */
  });
}

export function startLoop(name: AudioName, volume = DEFAULT_LOOP_VOL): void {
  const el = get(name);
  if (!el) return;
  // Idempotent: if already playing the same loop, just adjust volume.
  if (!el.paused && el.loop) {
    el.volume = volume * _volumeMultiplier;
    return;
  }
  el.loop = true;
  el.volume = volume * _volumeMultiplier;
  el.play().catch(() => {
    /* autoplay blocked — ignore */
  });
}

export function stopLoop(name: AudioName): void {
  const el = get(name);
  if (!el) return;
  el.pause();
  try {
    el.currentTime = 0;
  } catch {
    /* ignore */
  }
}

// 일회성 효과음(playOnce로 재생된 것)을 즉시 정지하는 함수.
// 사용 예: 편지 첫 페이지에서 paper/pen 재생 후 다음 페이지로 넘기면 정지.
export function stop(name: AudioName): void {
  const el = get(name);
  if (!el) return;
  el.pause();
  try {
    el.currentTime = 0;
  } catch {
    /* ignore */
  }
}

export function stopAll(): void {
  for (const name of Object.keys(elements) as AudioName[]) {
    const el = elements[name];
    if (!el) continue;
    el.pause();
    try {
      el.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
}
