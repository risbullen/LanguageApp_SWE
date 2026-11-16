/**
 * Pitch (F0) contour extraction with the YIN algorithm, normalised to semitones around
 * the speaker's median, so a man's and a woman's voice can be compared shape-to-shape.
 * Used to show Swedish word accents (1 vs 2) and Punjabi tones.
 */

export async function decode(blob: Blob): Promise<{ data: Float32Array; rate: number }> {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    return { data: buf.getChannelData(0).slice(), rate: buf.sampleRate };
  } finally {
    ctx.close();
  }
}

function yinFrame(x: Float32Array, start: number, size: number, rate: number, minF = 70, maxF = 450): number | null {
  const maxTau = Math.min(Math.floor(rate / minF), size - 1);
  const minTau = Math.floor(rate / maxF);
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0;
    for (let i = 0; i < size - maxTau; i++) {
      const diff = x[start + i] - x[start + i + tau];
      s += diff * diff;
    }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  let running = 0;
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    cmnd[tau] = running ? (d[tau] * tau) / running : 1;
  }
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (cmnd[tau] < 0.15) {
      while (tau + 1 <= maxTau && cmnd[tau + 1] < cmnd[tau]) tau++;
      // parabolic interpolation
      const a = cmnd[tau - 1] ?? cmnd[tau];
      const b = cmnd[tau];
      const c = cmnd[tau + 1] ?? cmnd[tau];
      const denom = a + c - 2 * b;
      const shift = denom ? (a - c) / (2 * denom) : 0;
      return rate / (tau + shift);
    }
  }
  return null;
}

/** Returns semitone values (NaN = unvoiced) at ~100 frames/second. */
export function contour(data: Float32Array, rate: number): number[] {
  const size = Math.floor(rate * 0.04);
  const hop = Math.floor(rate * 0.01);
  // energy gate: skip silence (a crude stand-in for voice-activity detection)
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const gate = peak * 0.08;
  const hz: number[] = [];
  for (let s = 0; s + size < data.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + size; i++) e = Math.max(e, Math.abs(data[i]));
    hz.push(e < gate ? NaN : (yinFrame(data, s, size, rate) ?? NaN));
  }
  const voiced = hz.filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
  if (!voiced.length) return [];
  const median = voiced[Math.floor(voiced.length / 2)];
  // trim leading/trailing unvoiced frames
  let a = 0;
  let b = hz.length - 1;
  while (a < b && Number.isNaN(hz[a])) a++;
  while (b > a && Number.isNaN(hz[b])) b--;
  return hz.slice(a, b + 1).map((f) => {
    if (Number.isNaN(f)) return NaN;
    const st = 12 * Math.log2(f / median);
    return Math.abs(st) > 12 ? NaN : st; // drop octave errors
  });
}

/** Dynamic-time-warping distance between two contours (mean semitone gap). */
export function dtw(a: number[], b: number[]): number {
  const A = a.filter((v) => !Number.isNaN(v));
  const B = b.filter((v) => !Number.isNaN(v));
  if (!A.length || !B.length) return Infinity;
  const n = A.length;
  const m = B.length;
  let prev = new Float64Array(m + 1).fill(Infinity);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    const cur = new Float64Array(m + 1).fill(Infinity);
    for (let j = 1; j <= m; j++) {
      cur[j] = Math.abs(A[i - 1] - B[j - 1]) + Math.min(prev[j], cur[j - 1], prev[j - 1]);
    }
    prev = cur;
  }
  return prev[m] / (n + m);
}

export async function contourOf(blob: Blob): Promise<number[]> {
  const { data, rate } = await decode(blob);
  // downsample to ~16 kHz (box filter) — plenty for speech pitch, ~9x faster YIN
  const k = Math.max(1, Math.floor(rate / 16000));
  if (k === 1) return contour(data, rate);
  const out = new Float32Array(Math.floor(data.length / k));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += data[i * k + j];
    out[i] = s / k;
  }
  return contour(out, rate / k);
}
