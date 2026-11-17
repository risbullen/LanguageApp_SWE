import type { Pack, Lexeme, Unit } from '../content/schema';
import { lexMap } from '../content/index';
import type { Progress } from './store';
import { isDue } from './scheduler';

/**
 * The session loop from the research, in order:
 *  1 priming (listen + look, no task)  2 referential / structured input
 *  3 scaffolded retrieval (tiles → cloze)  4 speaking  5 recast (inside each exercise)
 *  6 communicative capstone (dialogue)
 */
export type Exercise =
  | { kind: 'prime'; lexIds: string[] }
  | { kind: 'listen_pick'; lexId: string; tag: string; options: string[] } // options = lexIds
  | { kind: 'structured'; lexId: string; tags: [string, string]; answer: 0 | 1 }
  | { kind: 'rule'; unitId: string }
  | { kind: 'minimal_pair'; pair: number; answer: 0 | 1 }
  | { kind: 'tiles'; lexId: string; tag: string }
  | { kind: 'cloze'; lexId: string; tag: string; options: string[] } // options = suffixes
  | { kind: 'article'; lexId: string; options: string[] }
  | { kind: 'speak'; lexId: string; tag: string }
  | { kind: 'dialogue'; unitId: string; dialogueId?: string } // no id = the unit's capstone
  | { kind: 'song_line'; line: number; options: string[] } // hear a line, fill the missing word
  | { kind: 'song_full' }; // whole song, karaoke-style

export type Step = Exercise & { key: string; retry?: boolean; unitId: string };

export const SCORED = new Set(['listen_pick', 'structured', 'minimal_pair', 'tiles', 'cloze', 'article', 'speak']);

/** How far back a failed item is re-inserted: far enough that it leaves working memory. */
export const STICKY_OFFSET = 4;

export type Rng = () => number;

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample<T>(arr: T[], n: number, rng: Rng): T[] {
  return shuffle(arr, rng).slice(0, n);
}

const firstForm = (l: Lexeme) => l.forms[0];

/** Can this form be used for a suffix cloze? (stem known and the form actually starts with it) */
function clozeable(l: Lexeme, tag: string): boolean {
  const f = l.forms.find((x) => x.tag === tag);
  const base = firstForm(l);
  return !!f && f.stem !== undefined && f.stem < [...f.text].length && f.text.startsWith([...base.text].slice(0, f.stem).join(''));
}

function suffixOf(l: Lexeme, tag: string): string {
  const f = l.forms.find((x) => x.tag === tag)!;
  return [...f.text].slice(f.stem).join('');
}

function listenPick(pack: Pack, lexId: string, rng: Rng): Exercise {
  const lex = lexMap(pack).get(lexId)!;
  const unit = pack.units.find((u) => u.lexicon_ids.includes(lexId));
  const pool = (unit?.lexicon_ids ?? pack.lexicon.map((l) => l.id)).filter((id) => id !== lexId);
  return { kind: 'listen_pick', lexId, tag: firstForm(lex).tag, options: shuffle([lexId, ...sample(pool, 3, rng)], rng) };
}

function cloze(pack: Pack, lexId: string, rng: Rng): Exercise | null {
  const lex = lexMap(pack).get(lexId)!;
  const tags = lex.forms.map((f) => f.tag).filter((t, i) => i > 0 && clozeable(lex, t));
  if (!tags.length) return null;
  const tag = tags[Math.floor(rng() * tags.length)];
  const right = suffixOf(lex, tag);
  // distractors: suffixes other words take, so the choice hinges on this word's pattern
  const others = new Set<string>();
  for (const l of pack.lexicon)
    for (const f of l.forms) if (l.id !== lexId && clozeable(l, f.tag)) others.add(suffixOf(l, f.tag));
  others.delete(right);
  return { kind: 'cloze', lexId, tag, options: shuffle([right, ...sample([...others], 2, rng)], rng) };
}

function article(pack: Pack, lexId: string, rng: Rng): Exercise | null {
  const lex = lexMap(pack).get(lexId)!;
  if (!lex.article) return null;
  const all = [...new Set(pack.lexicon.map((l) => l.article).filter(Boolean) as string[])];
  return { kind: 'article', lexId, options: shuffle(all, rng) };
}

/** Exercise ladder for reviews, easiest → hardest. */
const LADDER = ['listen_pick', 'tiles', 'cloze', 'speak'] as const;

/** Pick a review format: harder as memory gets stable, adjusted to keep success near 85%. */
export function reviewLevel(stability: number, recent: boolean[]): number {
  let lvl = stability < 2 ? 0 : stability < 7 ? 1 : 2;
  const last = recent.slice(-20);
  if (last.length >= 8) {
    const rate = last.filter(Boolean).length / last.length;
    if (rate > 0.92) lvl++;
    else if (rate < 0.75) lvl--;
  }
  return Math.max(0, Math.min(LADDER.length - 1, lvl));
}

function reviewExercise(pack: Pack, lexId: string, level: number, rng: Rng): Exercise {
  const lex = lexMap(pack).get(lexId)!;
  const kind = LADDER[level];
  if (kind === 'cloze') return cloze(pack, lexId, rng) ?? { kind: 'tiles', lexId, tag: firstForm(lex).tag };
  if (kind === 'tiles') return { kind: 'tiles', lexId, tag: firstForm(lex).tag };
  if (kind === 'speak') return { kind: 'speak', lexId, tag: firstForm(lex).tag };
  return listenPick(pack, lexId, rng);
}

export interface BuildOptions {
  maxNew?: number;
  maxReview?: number;
  now?: Date;
  rng?: Rng;
  /** false when only device voices are available — they can't render Swedish word accents */
  accentAudio?: boolean;
}

/** Short conversations whose words the learner knows; ones using today's new words first. */
export function eligibleMinis(unit: Unit, known: Set<string>, fresh: string[], done: Record<string, number> = {}) {
  return (unit.mini_dialogues ?? [])
    .filter((d) => d.requires.every((id) => known.has(id)))
    .sort((a, b) => {
      const fa = a.requires.some((id) => fresh.includes(id)) ? 0 : 1;
      const fb = b.requires.some((id) => fresh.includes(id)) ? 0 : 1;
      return fa - fb || (done[a.id] ?? 0) - (done[b.id] ?? 0);
    });
}

export function buildSession(pack: Pack, unitId: string, progress: Progress, opts: BuildOptions = {}): Step[] {
  const { maxNew = 3, maxReview = 5, now = new Date(), rng = Math.random, accentAudio = true } = opts;
  const unit = pack.units.find((u) => u.id === unitId)!;
  const lex = lexMap(pack);
  const introduced = new Set(progress.introduced);

  // songs: line by line, then the whole song
  if (unit.song) {
    const gaps = unit.song.lines.map((l) => l.gap);
    const steps: Exercise[] = unit.song.lines.map((l, line) => ({
      kind: 'song_line',
      line,
      options: shuffle([l.gap, ...sample(gaps.filter((g) => g !== l.gap), 2, rng)], rng),
    }));
    steps.push({ kind: 'song_full' });
    return steps.map((e, i) => ({ ...e, key: `s${i}`, unitId }));
  }

  const fresh = unit.lexicon_ids.filter((id) => !introduced.has(id)).slice(0, maxNew);
  let due = pack.lexicon
    .map((l) => l.id)
    .filter((id) => !fresh.includes(id) && isDue(progress.cards[id], now))
    .sort((a, b) => progress.cards[a].due.getTime() - progress.cards[b].due.getTime())
    .slice(0, maxReview);
  // nothing new or due → free practice on this unit (learner autonomy: always allowed)
  if (!fresh.length && !due.length) due = sample(unit.lexicon_ids, Math.min(4, unit.lexicon_ids.length), rng);

  const ex: Exercise[] = [];

  // 1 · priming
  if (fresh.length) ex.push({ kind: 'prime', lexIds: fresh });

  // 2 · referential input: hear → pick the picture (new words)
  for (const id of shuffle(fresh, rng)) ex.push(listenPick(pack, id, rng));

  // 2b · structured input on the unit's grammar contrast, then the micro-rule (once)
  const gf = unit.grammar_focus;
  if (gf) {
    const cands = unit.lexicon_ids.filter((id) => {
      const l = lex.get(id)!;
      return (introduced.has(id) || fresh.includes(id)) && gf.contrast.every((t) => l.forms.some((f) => f.tag === t));
    });
    for (const id of sample(cands, 2, rng))
      ex.push({ kind: 'structured', lexId: id, tags: gf.contrast, answer: rng() < 0.5 ? 0 : 1 });
    if (cands.length && !progress.rulesSeen.includes(unit.id)) ex.push({ kind: 'rule', unitId: unit.id });
  } else if (unit.tip && !progress.rulesSeen.includes(unit.id)) {
    ex.push({ kind: 'rule', unitId: unit.id });
  }

  // pitch accent / tone minimal pairs (perception before production)
  // (one pair per session, and only with a voice that can actually produce the accent)
  // Text-to-speech says both sides of a pair identically, so only pairs with real recordings.
  const recorded = (unit.minimal_pairs ?? []).map((p, i) => [p, i] as const).filter(([p]) => p.every((side) => side.audio));
  if (accentAudio && recorded.length)
    ex.push({ kind: 'minimal_pair', pair: recorded[Math.floor(rng() * recorded.length)][1], answer: rng() < 0.5 ? 0 : 1 });

  // reviews, format chosen by memory stability + recent success
  for (const id of due) {
    const card = progress.cards[id];
    ex.push(reviewExercise(pack, id, reviewLevel(card?.stability ?? 0, progress.recent), rng));
  }

  // 3 · scaffolded retrieval for new words: tiles first, then cloze / article
  for (const id of shuffle(fresh, rng)) ex.push({ kind: 'tiles', lexId: id, tag: firstForm(lex.get(id)!).tag });
  for (const id of shuffle(fresh, rng)) {
    const c = (unit.article_cloze ? article(pack, id, rng) : null) ?? cloze(pack, id, rng);
    if (c) {
      ex.push(c);
      break; // one cloze per session keeps it short
    }
  }

  // conversations: the capstone needs every word of the unit; otherwise a short one
  const known = new Set([...introduced, ...fresh]);
  const capstoneReady = !!unit.dialogue && unit.lexicon_ids.every((id) => known.has(id));
  const minis = eligibleMinis(unit, known, fresh, progress.dialogues);
  if (capstoneReady && minis.length) ex.push({ kind: 'dialogue', unitId: unit.id, dialogueId: minis[0].id });

  // 4 · speaking
  const speakPool = fresh.length ? fresh : due;
  for (const id of sample(speakPool, 1, rng)) ex.push({ kind: 'speak', lexId: id, tag: firstForm(lex.get(id)!).tag });

  // 6 · capstone (or a short conversation while the unit is still being learnt)
  if (capstoneReady) ex.push({ kind: 'dialogue', unitId: unit.id });
  else if (minis.length) ex.push({ kind: 'dialogue', unitId: unit.id, dialogueId: minis[0].id });

  return ex.map((e, i) => ({ ...e, key: `s${i}`, unitId }));
}

/** Lexeme id an exercise trains (for scheduling), if any. */
export function lexOf(e: Exercise): string | null {
  return 'lexId' in e ? e.lexId : null;
}

/**
 * After a failure, the item comes back in a DIFFERENT format (constrained / receptive),
 * so the retry is real retrieval and not pattern-matching on the same screen.
 */
export function mutateForRetry(pack: Pack, e: Exercise, rng: Rng = Math.random): Exercise {
  switch (e.kind) {
    case 'cloze':
    case 'article':
      return { kind: 'tiles', lexId: e.lexId, tag: e.kind === 'cloze' ? e.tag : firstForm(lexMap(pack).get(e.lexId)!).tag };
    case 'tiles':
      return listenPick(pack, e.lexId, rng);
    case 'speak':
      return { kind: 'tiles', lexId: e.lexId, tag: e.tag };
    case 'listen_pick': {
      const l = lexMap(pack).get(e.lexId)!;
      return { kind: 'tiles', lexId: e.lexId, tag: firstForm(l).tag };
    }
    case 'structured':
      return { ...e, answer: e.answer === 0 ? 1 : 0 };
    case 'minimal_pair':
      return { ...e, answer: e.answer === 0 ? 1 : 0 };
    default:
      return e;
  }
}

/**
 * Insert a retry STICKY_OFFSET steps after the current one — but always before the
 * capstone dialogue. The session can't end until every retry has been answered right.
 */
export function insertRetry(queue: Step[], index: number, retry: Exercise): Step[] {
  const q = [...queue];
  const last = q.length - 1;
  const limit = q[last]?.kind === 'dialogue' && last > index ? last : q.length;
  const at = Math.min(index + 1 + STICKY_OFFSET, limit);
  q.splice(at, 0, { ...retry, key: `${queue[index].key}r${index}`, retry: true, unitId: queue[index].unitId });
  return q;
}
