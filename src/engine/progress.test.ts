import { describe, expect, it } from 'vitest';
import { PACKS } from '../content/index';
import { emptyProgress } from './store';
import { courseProgress } from './progress';

const sv = PACKS[0];

describe('journey progress (Beginner → Intermediate → Advanced)', () => {
  it('starts at zero', () => {
    const p = courseProgress(sv, emptyProgress(), 'basics');
    expect(p.seen).toBe(0);
    expect(p.words).toBe(24);
  });
  it('fills by share of words met in that course only', () => {
    const fika = sv.units.find((u) => u.id === 'fika')!.lexicon_ids;
    const p = { ...emptyProgress(), introduced: fika };
    expect(courseProgress(sv, p, 'basics').seen).toBeCloseTo(6 / 24);
    expect(courseProgress(sv, p, 'basics').wordsSeen).toBe(6);
    expect(courseProgress(sv, p, 'intermediate').seen).toBe(0);
  });
  it('unknown course is empty', () => {
    expect(courseProgress(sv, emptyProgress(), 'nope').words).toBe(0);
  });
});
