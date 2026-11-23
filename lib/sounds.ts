// Звуки интерфейса Tosto. Синтезируются прямо в браузере (Web Audio), файлов не нужно.
export type SoundName = "send" | "receive" | "like" | "post" | "error";

const KEY = "tosto:sound";
let ctx: AudioContext | null = null;
let enabled = true;

try {
  enabled = localStorage.getItem(KEY) !== "off";
} catch {
  // хранилище недоступно, звук включён по умолчанию
}

export function isSoundEnabled() {
  return enabled;
}

export function setSoundEnabled(value: boolean) {
  enabled = value;
  try {
    localStorage.setItem(KEY, value ? "on" : "off");
  } catch {
    // игнорируем
  }
}

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Одна нота: частота (можно плавно менять), старт, длительность, громкость. */
function tone(
  c: AudioContext,
  { from, to = from, at = 0, dur, vol = 0.12, type = "sine" }: {
    from: number; to?: number; at?: number; dur: number; vol?: number; type?: OscillatorType;
  },
) {
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function playSound(name: SoundName) {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;
  switch (name) {
    case "send":
      tone(c, { from: 520, to: 880, dur: 0.11, vol: 0.1 });
      break;
    case "receive":
      tone(c, { from: 880, dur: 0.16, vol: 0.12 });
      tone(c, { from: 1318, at: 0.09, dur: 0.22, vol: 0.1 });
      break;
    case "like":
      tone(c, { from: 600, to: 1000, dur: 0.08, vol: 0.1 });
      tone(c, { from: 1200, at: 0.05, dur: 0.1, vol: 0.06 });
      break;
    case "post":
      tone(c, { from: 523, dur: 0.12, vol: 0.1 });
      tone(c, { from: 659, at: 0.08, dur: 0.12, vol: 0.1 });
      tone(c, { from: 784, at: 0.16, dur: 0.22, vol: 0.1 });
      break;
    case "error":
      tone(c, { from: 220, to: 160, dur: 0.18, vol: 0.12, type: "triangle" });
      break;
  }
}
