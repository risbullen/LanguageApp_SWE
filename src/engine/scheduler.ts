import { fsrs, generatorParameters, Rating, createEmptyCard, type Card, type Grade } from 'ts-fsrs';

const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    maximum_interval: 36500,
    enable_fuzz: true,
    enable_short_term: true,
  }),
);

/** Response-time bands per exercise type (ms): [easy below, hard above]. */
const LATENCY: Record<string, [number, number]> = {
  listen_pick: [1500, 5000],
  structured: [2000, 6000],
  minimal_pair: [2000, 6000],
  article: [1500, 5000],
  cloze: [2500, 8000],
  tiles: [4000, 12000],
};

/** Rating for one correct first attempt, from how quickly it came. No self-grading. */
export function ratingFromLatency(kind: string, ms: number): Grade {
  const [easy, hard] = LATENCY[kind] ?? [2000, 8000];
  if (ms < easy) return Rating.Easy;
  if (ms > hard) return Rating.Hard;
  return Rating.Good;
}

export interface ItemOutcome {
  lapsed: boolean; // failed at least once during the session (sticky buffer was used)
  ratings: Grade[]; // ratings of correct first attempts
}

/**
 * Commit ONE review per item at session end. Errors within the session only feed the
 * sticky buffer; the long-term schedule sees a single outcome (lapse → Again).
 */
export function commitSession(
  cards: Record<string, Card>,
  outcomes: Record<string, ItemOutcome>,
  now = new Date(),
): Record<string, Card> {
  const next = { ...cards };
  for (const [id, o] of Object.entries(outcomes)) {
    const card = next[id] ?? createEmptyCard(now);
    let grade: Grade = Rating.Good;
    if (o.lapsed) grade = Rating.Again;
    else if (o.ratings.length) grade = Math.min(...o.ratings) as Grade; // worst attempt decides
    next[id] = scheduler.next(card, now, grade).card;
  }
  return next;
}

export function isDue(card: Card | undefined, now = new Date()): boolean {
  return !!card && card.due.getTime() <= now.getTime();
}

/** Considered "mastered" once memory is stable for a week or more. */
export const isMastered = (card: Card | undefined) => !!card && card.stability >= 7;
