import { describe, expect, it } from 'vitest';
import { PACKS } from '../content/index';
import { buildSession, type Step } from './session';
import { emptyProgress } from './store';
import { matchSpeech, passes } from './match';

const sv = PACKS[0];
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/** Rough seconds per exercise, to check the Four Strands balance from the research. */
const SECONDS: Record<string, number> = {
  prime: 15, listen_pick: 10, structured: 10, rule: 20, minimal_pair: 12, tiles: 25, cloze: 15, article: 10,
  speak: 20, dialogue: 60, fluency: 180, song_line: 20, song_full: 40,
};
const NOT_AUDIO = new Set(['tiles', 'cloze', 'article']); // reading/spelling tasks
const LANGUAGE_FOCUS = new Set(['rule', 'structured', 'minimal_pair', 'tiles', 'cloze', 'article']);
const seconds = (s: Step) => (s.kind === 'prime' ? SECONDS.prime * s.lexIds.length : SECONDS[s.kind]);
function budget(steps: Step[]) {
  const total = steps.reduce((a, s) => a + seconds(s), 0);
  const audio = steps.filter((s) => !NOT_AUDIO.has(s.kind)).reduce((a, s) => a + seconds(s), 0);
  const lfl = steps.filter((s) => LANGUAGE_FOCUS.has(s.kind)).reduce((a, s) => a + seconds(s), 0);
  return { audio: audio / total, lfl: lfl / total };
}

describe('Four Strands budget (research: ≥70% listening/speaking, ≤25% explicit language focus)', () => {
  for (const u of sv.units.filter((x) => !x.song)) {
    it(`${u.id}: first session and a later session`, () => {
      for (const p of [emptyProgress(), { ...emptyProgress(), introduced: u.lexicon_ids, rulesSeen: [u.id] }]) {
        const b = budget(buildSession(sv, u.id, p, { rng: seeded(11) }));
        expect(b.audio, 'audio-oral share').toBeGreaterThanOrEqual(0.7);
        expect(b.lfl, 'language-focus share').toBeLessThanOrEqual(0.25);
      }
    });
  }
});

describe('speaking sprint (4-3-2)', () => {
  it('only once all words of the unit are known, right before the final conversation', () => {
    expect(buildSession(sv, 'fika', emptyProgress(), { rng: seeded(2) }).some((s) => s.kind === 'fluency')).toBe(false);
    const known = { ...emptyProgress(), introduced: sv.units[0].lexicon_ids };
    const steps = buildSession(sv, 'fika', known, { rng: seeded(2) });
    const at = steps.findIndex((s) => s.kind === 'fluency');
    expect(at).toBeGreaterThan(0);
    expect(steps[at + 1].kind).toBe('dialogue');
  });
});

describe('sound pairs', () => {
  it('pairs spelled differently (väg/vägg) run with text-to-speech; identical ones (anden) do not', () => {
    const hemma = buildSession(sv, 'hemma', emptyProgress(), { rng: seeded(3) });
    expect(hemma.some((s) => s.kind === 'minimal_pair')).toBe(true);
    const djur = buildSession(sv, 'djur', emptyProgress(), { rng: seeded(3) });
    expect(djur.some((s) => s.kind === 'minimal_pair')).toBe(false);
  });
});

describe('spoken Swedish', () => {
  it('casual speech matches the line it belongs to', () => {
    expect(passes(matchSpeech(['Jag är trött.', 'Ja e trött.'], ['ja e trött']))).toBe(true);
    expect(passes(matchSpeech(['Hur mår du?', 'Humårru?'], ['humårru']))).toBe(true);
  });
  it('the content has casual forms for common lines', () => {
    const n = sv.lexicon.flatMap((l) => l.forms).filter((f) => f.spoken).length;
    expect(n).toBeGreaterThanOrEqual(10);
  });
});
