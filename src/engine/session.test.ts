import { describe, expect, it } from 'vitest';
import { Rating, createEmptyCard, type Card } from "ts-fsrs";
import { PACKS } from '../content/index';
import { buildSession, insertRetry, mutateForRetry, reviewLevel, STICKY_OFFSET } from './session';
import { commitSession } from './scheduler';
import { emptyProgress } from './store';

const sv = PACKS[0];
// deterministic rng
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe('buildSession', () => {
  it('follows the loop: priming first, dialogue last, no text-free gaps', () => {
    const steps = buildSession(sv, 'fika', emptyProgress(), { rng: seeded() });
    expect(steps[0].kind).toBe('prime');
    expect(steps.at(-1)!.kind).toBe('dialogue');
    const kinds = steps.map((s) => s.kind);
    // receptive before productive
    expect(kinds.indexOf('listen_pick')).toBeLessThan(kinds.indexOf('tiles'));
    expect(kinds.indexOf('tiles')).toBeLessThan(kinds.indexOf('speak'));
    // micro-rule only after structured input
    expect(kinds.indexOf('structured')).toBeLessThan(kinds.indexOf('rule'));
  });

  it('does not repeat the rule once seen, and skips priming when nothing is new', () => {
    const p = { ...emptyProgress(), introduced: sv.units[0].lexicon_ids, rulesSeen: ['fika'] };
    const kinds = buildSession(sv, 'fika', p, { rng: seeded() }).map((s) => s.kind);
    expect(kinds).not.toContain('prime');
    expect(kinds).not.toContain('rule');
    expect(kinds.length).toBeGreaterThan(3); // free practice still available
  });

  it('builds a valid session for the Punjabi demo pack', () => {
    const pa = PACKS[1];
    const steps = buildSession(pa, pa.units[0].id, emptyProgress(), { rng: seeded() });
    expect(steps.some((s) => s.kind === 'minimal_pair')).toBe(true);
    expect(steps.at(-1)!.kind).toBe('dialogue');
  });
});

describe('sticky buffer', () => {
  const steps = buildSession(sv, 'fika', emptyProgress(), { rng: seeded(7) });

  it(`re-inserts a failed item ${STICKY_OFFSET} steps later, in a different format`, () => {
    const i = steps.findIndex((s) => s.kind === 'tiles');
    const retry = mutateForRetry(sv, steps[i], seeded());
    const q = insertRetry(steps, i, retry);
    expect(q.length).toBe(steps.length + 1);
    expect(q[i + 1 + STICKY_OFFSET].retry).toBe(true);
    expect(q[i + 1 + STICKY_OFFSET].kind).not.toBe('tiles');
  });

  it('never pushes a retry past the capstone dialogue', () => {
    const last = steps.length - 2; // step right before dialogue
    const q = insertRetry(steps, last, mutateForRetry(sv, steps[last], seeded()));
    expect(q.at(-1)!.kind).toBe('dialogue');
    expect(q.at(-2)!.retry).toBe(true);
  });
});

describe('scheduler', () => {
  it('commits one review per item; a lapse rates Again', () => {
    const now = new Date('2026-01-01T10:00:00Z');
    const cards = commitSession({}, { a: { lapsed: false, ratings: [Rating.Good] }, b: { lapsed: true, ratings: [Rating.Easy] } }, now);
    expect(cards.a.reps).toBe(1);
    expect(cards.b.reps).toBe(1);
    expect(cards.b.lapses + cards.b.reps).toBeGreaterThan(0);
    expect(cards.a.due.getTime()).toBeGreaterThan(cards.b.due.getTime());
  });

  it('a stable card is scheduled further out than a new one', () => {
    const now = new Date('2026-01-01T10:00:00Z');
    let c: Record<string, Card> = { x: createEmptyCard(now) };
    for (let d = 0; d < 4; d++) c = commitSession(c, { x: { lapsed: false, ratings: [Rating.Good] } }, c.x.due);
    expect(c.x.stability).toBeGreaterThan(2);
  });
});

describe('difficulty targeting (~85% success)', () => {
  it('steps up when everything is right, down when struggling', () => {
    expect(reviewLevel(3, Array(10).fill(true))).toBeGreaterThan(reviewLevel(3, []));
    expect(reviewLevel(3, Array(10).fill(false))).toBeLessThan(reviewLevel(3, []));
  });
});
