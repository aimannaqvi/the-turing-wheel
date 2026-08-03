let ctx: AudioContext | null = null;
let wheelBuffer: AudioBuffer | null = null;
let wheelLoad: Promise<AudioBuffer | null> | null = null;
let activeWheel: AudioBufferSourceNode | null = null;
let activeWheelGain: GainNode | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
}

async function resume() {
  const c = getCtx();
  if (c?.state === "suspended") await c.resume();
}

async function loadWheelBuffer(): Promise<AudioBuffer | null> {
  if (wheelBuffer) return wheelBuffer;
  if (wheelLoad) return wheelLoad;
  const c = getCtx();
  if (!c) return null;
  wheelLoad = fetch("/sounds/wheel-spin.m4a?v=6")
    .then((response) => {
      if (!response.ok) throw new Error(`wheel audio ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => c.decodeAudioData(bytes))
    .then((buffer) => {
      wheelBuffer = buffer;
      return buffer;
    })
    .catch((error) => {
      console.error("wheel audio failed", error);
      return null;
    });
  return wheelLoad;
}

/**
 * Synthetic clicky spin + landing ding.
 * Visual land should use SPIN_LAND_AT (ding onset); audio plays full buffer.
 */
export const SPIN_LAND_AT = 5.9;

export async function playWheelSpin(_landAt = SPIN_LAND_AT) {
  await resume();
  const c = getCtx();
  if (!c) return;
  const buffer = await loadWheelBuffer();
  if (!buffer) return;

  stopWheelSpin();

  const t = c.currentTime;
  const source = c.createBufferSource();
  const gain = c.createGain();
  source.buffer = buffer;
  source.playbackRate.setValueAtTime(1, t);
  // Fade out cleanly before any residual hiss at the end of the file.
  const fadeStart = Math.max(0.05, buffer.duration - 0.12);
  const endAt = buffer.duration;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(1.05, t + 0.015);
  gain.gain.setValueAtTime(1.05, t + fadeStart);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + endAt);
  source.connect(gain);
  gain.connect(c.destination);
  activeWheel = source;
  activeWheelGain = gain;
  source.start(t);
  source.stop(t + endAt + 0.02);
}

export function stopWheelSpin() {
  const c = getCtx();
  if (c && activeWheelGain) {
    const t = c.currentTime;
    activeWheelGain.gain.cancelScheduledValues(t);
    activeWheelGain.gain.setValueAtTime(
      Math.max(0.0001, activeWheelGain.gain.value),
      t,
    );
    activeWheelGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  }
  if (activeWheel) {
    try {
      activeWheel.stop((c?.currentTime ?? 0) + 0.05);
    } catch {
      // Already ended.
    }
  }
  activeWheel = null;
  activeWheelGain = null;
}

/** The recording contains its own landing. */
export async function playWheelLand() {
  return;
}

/** Soft chime — correct */
export async function playCorrect() {
  await resume();
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  for (const [i, freq] of [523.25, 659.25, 783.99].entries()) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = t + i * 0.08;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.05, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  }
}

/** Soft thud — incorrect */
export async function playIncorrect() {
  await resume();
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.25);
}
