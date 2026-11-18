import { describe, expect, it } from 'vitest';
import { PACKS } from '../content/index';
import { emptyProgress } from './store';
import { courseProgress } from './progress';

const sv = PACKS[0];

describe('journey progress (Beginner → Intermediate → Advanced)', () => {
  it('starts at zero', () => {
    const p = courseProgress(sv, emptyProgress(), 'a1');
    expect(p.seen).toBe(0);
    expect(p.words).toBe(29); // 24 nouns + 5 word-order phrases
  });
  it('fills by share of words met in that course only', () => {
    const fika = sv.units.find((u) => u.id === 'fika')!.lexicon_ids;
    const p = { ...emptyProgress(), introduced: fika };
    expect(courseProgress(sv, p, 'a1').seen).toBeCloseTo(6 / 29);
    expect(courseProgress(sv, p, 'a1').wordsSeen).toBe(6);
    expect(courseProgress(sv, p, 'a2').seen).toBe(0);
  });
  it('unknown course is empty', () => {
    expect(courseProgress(sv, emptyProgress(), 'nope').words).toBe(0);
  });
});
