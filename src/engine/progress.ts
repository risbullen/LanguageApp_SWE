import type { Pack, Unit } from '../content/schema';
import type { Progress } from './store';
import { isDue, isMastered } from './scheduler';

export interface UnitProgress {
  seen: number; // 0..1 share of words met
  stable: number; // 0..1 share of words remembered ≥ 1 week
  due: number; // words ready for review
}

/** How far into a unit the learner is. Song/dialogue-only units count as done after one session. */
export function unitProgress(u: Unit, p: Progress, now = new Date()): UnitProgress {
  if (!u.lexicon_ids.length) {
    const done = (p.sessions[u.id] ?? 0) > 0 ? 1 : 0;
    return { seen: done, stable: done, due: 0 };
  }
  const intro = new Set(p.introduced);
  const n = u.lexicon_ids.length;
  return {
    seen: u.lexicon_ids.filter((id) => intro.has(id)).length / n,
    stable: u.lexicon_ids.filter((id) => isMastered(p.cards[id])).length / n,
    due: u.lexicon_ids.filter((id) => isDue(p.cards[id], now)).length,
  };
}

export interface CourseProgress {
  seen: number; // 0..1
  stable: number; // 0..1
  wordsSeen: number;
  words: number;
}

/** Progress through a whole course, counted in words (units without words count as one item each). */
export function courseProgress(pack: Pack, p: Progress, courseId: string): CourseProgress {
  const course = pack.courses.find((c) => c.id === courseId);
  if (!course) return { seen: 0, stable: 0, wordsSeen: 0, words: 0 };
  let total = 0;
  let seen = 0;
  let stable = 0;
  for (const uid of course.unit_ids) {
    const u = pack.units.find((x) => x.id === uid);
    if (!u) continue;
    const weight = u.lexicon_ids.length || 1;
    const up = unitProgress(u, p);
    total += weight;
    seen += up.seen * weight;
    stable += up.stable * weight;
  }
  return {
    seen: total ? seen / total : 0,
    stable: total ? stable / total : 0,
    wordsSeen: Math.round(seen),
    words: total,
  };
}
