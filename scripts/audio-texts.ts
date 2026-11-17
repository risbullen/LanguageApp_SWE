// Collects every piece of target-language text the app can speak, for pre-generating audio.
// Output: audio-texts.json  [{ lang, key, text }]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pack } from '../src/content/schema';
import { audioKey } from '../src/audio/key';

const dir = join(import.meta.dirname, '../src/content/packs');
const out: { lang: string; key: string; text: string }[] = [];
const seen = new Set<string>();
const add = (lang: string, text: string) => {
  const t = text.normalize('NFC').trim();
  if (!t) return;
  const key = audioKey(lang, t);
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ lang: lang.split('-')[0], key, text: t });
};
const words = (lang: string, text: string) =>
  text.split(/\s+/).forEach((w) => {
    const clean = w.replace(/[^\p{L}\p{M}\p{N}'-]/gu, '');
    if (clean) add(lang, clean);
  });

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const pack = Pack.parse(JSON.parse(readFileSync(join(dir, file), 'utf8')));
  const lang = pack.tts_lang;
  for (const l of pack.lexicon) for (const f of l.forms) add(lang, f.text);
  for (const u of pack.units) {
    for (const pair of u.minimal_pairs ?? []) for (const side of pair) add(lang, side.text);
    for (const line of u.song?.lines ?? []) add(lang, line.text);
    for (const d of [...(u.dialogue ? [u.dialogue] : []), ...(u.mini_dialogues ?? [])])
      for (const n of d.nodes) {
        add(lang, n.line);
        words(lang, n.line); // tap-a-word
        for (const c of n.choices) {
          add(lang, c.text);
          if (c.recast) {
            add(lang, c.recast);
            words(lang, c.recast);
          }
        }
      }
  }
  add(lang, lang.startsWith('sv') ? 'Hej! Välkommen.' : 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ'); // settings test phrase
}
writeFileSync(join(import.meta.dirname, '../audio-texts.json'), JSON.stringify(out, null, 1));
const byLang = out.reduce<Record<string, number>>((a, x) => ((a[x.lang] = (a[x.lang] ?? 0) + 1), a), {});
console.log('audio texts:', byLang);
