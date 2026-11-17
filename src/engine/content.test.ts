import { describe, expect, it } from 'vitest';
import { PACKS } from '../content/index';
import { canRecordAlongside } from '../audio/listen';
import { versionLabel } from '../version';

const sv = PACKS[0];

describe('content: English confirmation and picture-sentences', () => {
  it('every Swedish word form has an English meaning', () => {
    for (const l of sv.lexicon) for (const f of l.forms) expect(f.en, `${l.id}.${f.tag}`).toBeTruthy();
  });
  it('every Swedish phrase is a picture-sentence (word → emoji)', () => {
    for (const l of sv.lexicon.filter((x) => x.pos === 'phrase')) {
      const parts = l.forms[0].parts;
      expect(parts, l.id).toBeDefined();
      // compound words may be split into their parts (Fart·kontroll), so compare without spaces
      expect(parts!.map(([w]) => w).join('').replace(/\s+/g, '')).toBe(l.forms[0].text.replace(/\s+/g, ''));
    }
  });
  it('every dialogue line, reply and recast has English', () => {
    for (const u of sv.units)
      for (const d of [...(u.dialogue ? [u.dialogue] : []), ...(u.mini_dialogues ?? [])])
        for (const n of d.nodes) {
          expect(n.en, n.line).toBeTruthy();
          for (const c of n.choices) {
            expect(c.en, c.text).toBeTruthy();
            if (c.recast) expect(c.recast_en, c.recast).toBeTruthy();
          }
        }
  });
});

describe('push-to-talk on Android', () => {
  it('never records in parallel on Android (it would block recognition)', () => {
    expect(canRecordAlongside('Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/130')).toBe(false);
  });
});

describe('version label', () => {
  it('shows version and Swedish build time', () => {
    expect(versionLabel('2026-11-17T13:05:00Z', '0.4.0')).toBe('v0.4.0 · built 17 Nov 2026, 14:05');
  });
});
