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

describe('v2: shorter sessions and more conversations', () => {
  it('a first session is about half the old length (≤ 15 steps)', () => {
    for (const u of sv.units) {
      const steps = buildSession(sv, u.id, emptyProgress(), { rng: seeded(3) });
      expect(steps.length).toBeLessThanOrEqual(15);
      expect(steps.filter((s) => s.kind === 'prime')[0]).toMatchObject({ lexIds: expect.any(Array) });
    }
  });

  it('ends the first session with a short conversation that only uses known words', () => {
    const steps = buildSession(sv, 'fika', emptyProgress(), { rng: seeded(3) });
    const last = steps.at(-1)!;
    expect(last.kind).toBe('dialogue');
    const id = (last as { dialogueId?: string }).dialogueId;
    expect(id).toBeDefined(); // not the capstone: not all words known yet
    const known = new Set((steps[0] as { lexIds: string[] }).lexIds);
    const mini = sv.units[0].mini_dialogues!.find((d) => d.id === id)!;
    expect(mini.requires.every((r) => known.has(r))).toBe(true);
  });

  it('once all words are known: a short conversation mid-session and the capstone at the end', () => {
    const p = { ...emptyProgress(), introduced: sv.units[0].lexicon_ids };
    const steps = buildSession(sv, 'fika', p, { rng: seeded(3) });
    const dialogues = steps.filter((s) => s.kind === 'dialogue') as { dialogueId?: string }[];
    expect(dialogues.length).toBe(2);
    expect(dialogues[0].dialogueId).toBeDefined();
    expect(dialogues[1].dialogueId).toBeUndefined();
  });

  it('skips word-melody drills when only device voices are available', () => {
    const steps = buildSession(sv, 'djur', emptyProgress(), { rng: seeded(3), accentAudio: false });
    expect(steps.some((s) => s.kind === 'minimal_pair')).toBe(false);
  });

  it('a missed speaking drill comes back as an easier format', () => {
    const r = mutateForRetry(sv, { kind: 'speak', lexId: 'sv_hund', tag: 'indef_sg' });
    expect(r.kind).toBe('tiles');
  });
});
