import type { Card } from 'ts-fsrs';

/** Per-pack learner progress. Kept in localStorage (prototype; SQLite later). */
export interface Progress {
  cards: Record<string, Card>;
  introduced: string[]; // lexeme ids that have been primed at least once
  rulesSeen: string[]; // unit ids whose micro-rule was revealed
  activeDays: string[]; // YYYY-MM-DD, for 30-day habit density (no streaks)
  recent: boolean[]; // last ~30 scored first attempts, to steer toward ~85% success
  sessions: Record<string, number>; // unit id → completed sessions
  dialogues: Record<string, number>; // dialogue id → times completed
  xp: number;
  coins: number; // earned by learning, spent on mini-courses
  owned: string[]; // bought mini-course ids
  daily: { day: string; xp: number }; // today's XP for the daily goal (no streak to lose)
}

export interface Settings {
  packId: string;
  mode: 'associative' | 'analytical';
  script: string; // ScriptId for current pack
  rate: number; // TTS speaking rate
}

const safe = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode etc. — app keeps working, just doesn't persist */
    }
  },
};

export const emptyProgress = (): Progress => ({
  cards: {},
  introduced: [],
  rulesSeen: [],
  activeDays: [],
  recent: [],
  sessions: {},
  dialogues: {},
  xp: 0,
  coins: 150,
  owned: [],
  daily: { day: '', xp: 0 },
});

/** Light progress points (no coins, no streaks). 200 XP per level. */
export const XP = { firstTry: 10, retry: 5, dialogue: 15, session: 20 };
export const COINS = { session: 10, dialogue: 5 };
export const DAILY_GOAL = 50;

/** Today's XP so far (resets each day). */
export const todayXp = (p: Progress, now = new Date()) => (p.daily.day === dayKey(now) ? p.daily.xp : 0);

/** Buy a mini-course. Returns the new progress, or null if not enough coins / already owned. */
export function buyCourse(p: Progress, courseId: string, price: number): Progress | null {
  if (p.owned.includes(courseId) || p.coins < price) return null;
  return { ...p, coins: p.coins - price, owned: [...p.owned, courseId] };
}
export const levelOf = (xp: number) => ({ level: Math.floor(xp / 200) + 1, into: xp % 200, per: 200 });

function reviveCard(c: Card): Card {
  return { ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review) : undefined };
}

export function loadProgress(packId: string): Progress {
  const raw = safe.get(`lang:progress:${packId}`);
  if (!raw) return emptyProgress();
  try {
    const p = { ...emptyProgress(), ...(JSON.parse(raw) as Progress) };
    for (const k of Object.keys(p.cards)) p.cards[k] = reviveCard(p.cards[k]);
    return p;
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(packId: string, p: Progress) {
  safe.set(`lang:progress:${packId}`, JSON.stringify(p));
}

export function loadSettings(defaults: Settings): Settings {
  const raw = safe.get('lang:settings');
  if (!raw) return defaults;
  try {
    return { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return defaults;
  }
}

export function saveSettings(s: Settings) {
  safe.set('lang:settings', JSON.stringify(s));
}

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Active days in the last 30 — a forgiving habit metric instead of an all-or-nothing streak. */
export function habitDensity(p: Progress, now = new Date()): { active: number; days: boolean[] } {
  const set = new Set(p.activeDays);
  const days: boolean[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(set.has(dayKey(d)));
  }
  return { active: days.filter(Boolean).length, days };
}
