export type SoundName =
  | "join" | "deal" | "play" | "level" | "mistake" | "life"
  | "shuriken" | "gameover" | "win" | "chat";

export type AudioPreferences = {
  enabled: boolean;
  musicVolume: number;
  effectsVolume: number;
};

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  enabled: true,
  musicVolume: 0.2,
  effectsVolume: 0.45,
};

const STORAGE_KEY = "the-mind-audio-settings-v1";
const SOURCES: Record<SoundName | "bgm", string> = {
  join: "/audio/join.wav",
  deal: "/audio/deal.wav",
  play: "/audio/play.wav",
  level: "/audio/level.wav",
  mistake: "/audio/mistake.wav",
  life: "/audio/life.wav",
  shuriken: "/audio/shuriken.wav",
  gameover: "/audio/gameover.wav",
  win: "/audio/win.wav",
  chat: "/audio/chat.wav",
  bgm: "/audio/bgm.wav",
};

let preferences = { ...DEFAULT_AUDIO_PREFERENCES };
let unlocked = false;
let gameActive = false;
let music: HTMLAudioElement | null = null;
const effects = new Map<HTMLAudioElement, SoundName>();
const seenEvents = new Set<string>();

export function loadAudioPreferences(): AudioPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_AUDIO_PREFERENCES };
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_AUDIO_PREFERENCES };
    const parsed = JSON.parse(stored) as Partial<AudioPreferences>;
    return {
      enabled: parsed.enabled !== false,
      musicVolume: clamp(parsed.musicVolume ?? DEFAULT_AUDIO_PREFERENCES.musicVolume),
      effectsVolume: clamp(parsed.effectsVolume ?? DEFAULT_AUDIO_PREFERENCES.effectsVolume),
    };
  } catch {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
}

export function saveAudioPreferences(next: AudioPreferences) {
  preferences = {
    enabled: next.enabled,
    musicVolume: clamp(next.musicVolume),
    effectsVolume: clamp(next.effectsVolume),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Audio remains usable for this session when storage is unavailable.
  }
  for (const [audio, name] of effects) {
    audio.volume = preferences.enabled ? preferences.effectsVolume * effectGain(name) : 0;
  }
  if (music) music.volume = preferences.enabled ? preferences.musicVolume : 0;
  if (preferences.enabled) maybeStartMusic();
  else stopMusic();
}

export function getAudioPreferences() {
  return { ...preferences };
}

export function unlockAudio() {
  unlocked = true;
  maybeStartMusic();
}

export function setGameAudioActive(active: boolean) {
  gameActive = active;
  if (active) maybeStartMusic();
  else stopMusic();
}

export function playSound(name: SoundName, eventId?: string) {
  if (typeof window === "undefined" || !preferences.enabled || preferences.effectsVolume <= 0) return;
  if (eventId) {
    if (seenEvents.has(eventId)) return;
    seenEvents.add(eventId);
    if (seenEvents.size > 160) seenEvents.delete(seenEvents.values().next().value as string);
  }
  const audio = new Audio(SOURCES[name]);
  audio.preload = "auto";
  audio.volume = preferences.effectsVolume * effectGain(name);
  effects.set(audio, name);
  const cleanup = () => {
    effects.delete(audio);
    audio.onended = null;
    audio.onerror = null;
    audio.removeAttribute("src");
    audio.load();
  };
  audio.onended = cleanup;
  audio.onerror = cleanup;
  void audio.play().catch(cleanup);
}

export function stopAllAudio() {
  gameActive = false;
  stopMusic();
  for (const audio of effects.keys()) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  effects.clear();
}

function maybeStartMusic() {
  if (!unlocked || !gameActive || !preferences.enabled || preferences.musicVolume <= 0) return;
  if (!music) {
    music = new Audio(SOURCES.bgm);
    music.loop = true;
    music.preload = "auto";
  }
  music.volume = preferences.musicVolume;
  if (music.paused) void music.play().catch(() => undefined);
}

function stopMusic() {
  if (!music) return;
  music.pause();
  music.currentTime = 0;
}

function effectGain(name: SoundName) {
  return name === "life" || name === "gameover" ? 0.72 : 1;
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
