/** Small, friendly sound effects. No "wrong" buzzer: a miss is information, not a penalty. */
let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function notes(freqs: number[], step: number, len: number, type: OscillatorType, vol: number) {
  const c = ac();
  if (!c) return;
  freqs.forEach((f, i) => {
    const t = c.currentTime + i * step;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + len + 0.05);
  });
}

export const sfx = {
  correct: () => notes([659.25, 830.61, 987.77], 0.07, 0.28, 'triangle', 0.12),
  done: () => notes([523.25, 659.25, 783.99, 1046.5], 0.1, 0.55, 'sine', 0.12),
  /** unlock the audio context inside a user gesture (iOS) */
  unlock: () => void ac(),
};
