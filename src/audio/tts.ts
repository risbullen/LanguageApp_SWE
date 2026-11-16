/**
 * Speech output. Order of preference:
 *  1. Google Translate voice (always the right language; needs internet). Requires the
 *     page to send no referrer (see <meta name="referrer"> in index.html).
 *  2. A device voice that really is for this language.
 *  3. Nothing — never let an English voice read Swedish. The UI shows a warning instead.
 */
export type VoiceSource = 'google' | 'device' | 'none';

let lastSource: VoiceSource | null = null;
let googleFailures = 0;
const listeners = new Set<(s: VoiceSource) => void>();
export const onVoiceSource = (fn: (s: VoiceSource) => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const getVoiceSource = () => lastSource;
function report(s: VoiceSource) {
  lastSource = s;
  listeners.forEach((f) => f(s));
}

/* ── one shared <audio> element: once unlocked by a tap, iOS lets it play later ── */
let player: HTMLAudioElement | null = null;
function getPlayer(): HTMLAudioElement {
  if (!player) {
    player = new Audio();
    player.preload = 'auto';
  }
  return player;
}
function silentWav(): string {
  // 0.05 s of 8 kHz 8-bit mono silence
  const n = 400;
  const b = new Uint8Array(44 + n);
  const v = new DataView(b.buffer);
  const str = (o: number, t: string) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, n, true);
  b.fill(128, 44);
  return 'data:audio/wav;base64,' + btoa(String.fromCharCode(...b));
}
let unlocked = false;
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  const p = getPlayer();
  p.src = silentWav();
  p.play().catch(() => (unlocked = false));
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices();
}

/* ── device voices ── */
function loadVoices(timeout = 1200): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === 'undefined') return resolve([]);
    const now = speechSynthesis.getVoices();
    if (now.length) return resolve(now);
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener?.('voiceschanged', done, { once: true });
    setTimeout(done, timeout);
  });
}

/** Device voices whose language really matches, e.g. sv-SE / sv_SE / sv. */
export async function deviceVoicesFor(lang: string): Promise<SpeechSynthesisVoice[]> {
  const base = lang.split('-')[0].toLowerCase();
  return (await loadVoices()).filter((v) => v.lang.toLowerCase().replace('_', '-').split('-')[0] === base);
}

/** Ends whatever is currently speaking (so a new word never waits behind an old one). */
let cancelCurrent: (() => void) | null = null;

let rotation = 0;
async function speakDevice(text: string, lang: string, rate: number): Promise<boolean> {
  const voices = await deviceVoicesFor(lang);
  if (!voices.length) return false;
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voices[rotation++ % voices.length]; // several voices → more speaker variety
    u.lang = u.voice.lang;
    u.rate = rate;
    let settled = false;
    const end = () => !settled && ((settled = true), resolve(true));
    u.onend = end;
    u.onerror = end;
    cancelCurrent = () => {
      speechSynthesis.cancel();
      end();
    };
    speechSynthesis.speak(u);
    setTimeout(end, 1500 + text.length * 150);
  });
}

/* ── Google Translate voice ── */
function speakGoogle(text: string, lang: string, rate: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tl = lang.split('-')[0];
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(text.slice(0, 200))}`;
    const p = getPlayer();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      p.onended = p.onerror = null;
      resolve(ok);
    };
    p.onended = () => finish(true);
    p.onerror = () => finish(false);
    cancelCurrent = () => {
      p.pause();
      finish(true);
    };
    p.src = url;
    p.playbackRate = Math.max(0.5, Math.min(1.2, rate + 0.1)); // Google is a bit slow already
    p.play().catch(() => finish(false));
    // if nothing has loaded within 4 s, treat as failed; otherwise allow time to finish
    setTimeout(() => {
      if (!settled && (p.readyState < 2 || p.error)) finish(false);
    }, 4000);
    setTimeout(() => finish(true), 4000 + text.length * 200);
  });
}

/** Speak text in the target language. Resolves when finished (or on failure). */
export function speak(text: string, lang: string, opts: { rate?: number } = {}): Promise<VoiceSource> {
  const rate = opts.rate ?? 0.9;
  const run = async (): Promise<VoiceSource> => {
    if (googleFailures < 3 && (await speakGoogle(text, lang, rate))) {
      googleFailures = 0;
      report('google');
      return 'google';
    }
    googleFailures++;
    if (await speakDevice(text, lang, rate)) {
      report('device');
      return 'device';
    }
    report('none');
    return 'none';
  };
  stopSpeaking();
  return run();
}

/** Stop anything currently playing. */
export function stopSpeaking() {
  const c = cancelCurrent;
  cancelCurrent = null;
  c?.();
}
