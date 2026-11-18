/**
 * Lenient matching of what speech recognition heard against what the learner should say.
 * Speech-to-text tends to "auto-correct" towards real words, so this checks that the
 * learner was understood, not fine pronunciation.
 */

export function normalize(s: string): string[] {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function levenshtein(a: string, b: string): number {
  const A = [...a];
  const B = [...b];
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    for (let j = 1; j <= B.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[B.length];
}

const similarity = (a: string, b: string) => 1 - levenshtein(a, b) / Math.max([...a].length, [...b].length, 1);

export interface WordMatch {
  word: string;
  ok: boolean;
}
export interface MatchResult {
  score: number; // 0..1 share of target words heard
  words: WordMatch[];
  heard: string; // the transcript that matched best
}

/** Word is "heard" when some recognised word is close enough (beginner-lenient). */
const WORD_OK = 0.7;

function matchOne(target: string, transcript: string): MatchResult {
  const t = normalize(target);
  const h = normalize(transcript);
  const joined = h.join('');
  const words = t.map((w) => ({
    word: w,
    // also accept when recognition glued/split words ("smörgås" vs "smör gås")
    ok: h.some((x) => similarity(w, x) >= WORD_OK) || (w.length > 4 && joined.includes(w)),
  }));
  return { score: words.length ? words.filter((w) => w.ok).length / words.length : 0, words, heard: transcript };
}

/**
 * Best match over all recognition alternatives. `target` may list several acceptable
 * forms (written + casual spoken, e.g. "Jag är trött" / "Ja e trött"): the best one counts.
 */
export function matchSpeech(target: string | string[], transcripts: string[]): MatchResult {
  const targets = (Array.isArray(target) ? target : [target]).filter(Boolean);
  let best: MatchResult = { score: 0, words: normalize(targets[0] ?? '').map((word) => ({ word, ok: false })), heard: transcripts[0] ?? '' };
  for (const t of targets)
    for (const tr of transcripts) {
      const m = matchOne(t, tr);
      if (m.score > best.score) best = m;
    }
  return best;
}

/** Pass if every word of a short target was heard, or ~70 % of a longer phrase. */
export function passes(m: MatchResult): boolean {
  return m.words.length <= 2 ? m.score === 1 : m.score >= 0.7;
}

/** Which of several possible answers did the learner say? null if none clearly. */
export function pickChoice(choices: (string | string[])[], transcripts: string[]): { index: number; match: MatchResult } | null {
  const scored = choices.map((c, index) => ({ index, match: matchSpeech(c, transcripts) }));
  scored.sort((a, b) => b.match.score - a.match.score);
  const [first, second] = scored;
  if (!first || first.match.score < 0.5) return null;
  // if two answers are equally good (e.g. "En kaka" vs "Ett kaka"), prefer the exact-ish one
  if (second && second.match.score === first.match.score) {
    const exact = scored.filter((s) => s.match.score === first.match.score);
    const primary = (c: string | string[]) => (Array.isArray(c) ? c[0] : c);
    const best = exact.reduce((a, b) =>
      levenshtein(normalize(primary(choices[a.index])).join(' '), normalize(a.match.heard).join(' ')) <=
      levenshtein(normalize(primary(choices[b.index])).join(' '), normalize(b.match.heard).join(' '))
        ? a
        : b,
    );
    return best;
  }
  return first;
}
