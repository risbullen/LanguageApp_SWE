/**
 * Browser text-to-speech, rotating through every installed voice for the language.
 * A light stand-in for multi-speaker audio (HVPT) until real recordings exist.
 */
let voices: SpeechSynthesisVoice[] = [];
const rotation: Record<string, number> = {};

function refresh() {
  if (typeof speechSynthesis === 'undefined') return;
  voices = speechSynthesis.getVoices();
}
if (typeof speechSynthesis !== 'undefined') {
  refresh();
  speechSynthesis.addEventListener?.('voiceschanged', refresh);
}

export function voicesFor(lang: string): SpeechSynthesisVoice[] {
  refresh();
  const base = lang.split('-')[0].toLowerCase();
  return voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(base));
}

export function ttsAvailable(lang: string): boolean {
  return typeof speechSynthesis !== 'undefined' && voicesFor(lang).length > 0;
}

/** Speak text. `vary` picks the next voice in rotation (different speaker each time). */
export function speak(text: string, lang: string, opts: { rate?: number; vary?: boolean } = {}): Promise<void> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === 'undefined') return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = opts.rate ?? 0.9;
    const vs = voicesFor(lang);
    if (vs.length) {
      const i = rotation[lang] ?? 0;
      u.voice = vs[i % vs.length];
      if (opts.vary !== false) rotation[lang] = i + 1;
    }
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
    // Safety net: some browsers never fire onend.
    setTimeout(resolve, 1200 + text.length * 180);
  });
}
