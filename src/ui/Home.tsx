import type { Course, Unit } from '../content/schema';
import { DAILY_GOAL, habitDensity, levelOf, todayXp, type Progress } from '../engine/store';
import { isDue, isMastered } from '../engine/scheduler';
import { useApp } from '../ctx';

const LEVEL_LABEL: Record<Course['level'], string> = { basic: 'Basics', intermediate: 'Intermediate', hard: 'Hard', mini: 'Mini-course' };

/** 0..1: how far into a unit the learner is (words met, or song sessions done). */
function unitProgress(u: Unit, p: Progress): { seen: number; stable: number; due: number } {
  if (!u.lexicon_ids.length) {
    const done = (p.sessions[u.id] ?? 0) > 0 ? 1 : 0;
    return { seen: done, stable: done, due: 0 };
  }
  const now = new Date();
  const intro = new Set(p.introduced);
  const n = u.lexicon_ids.length;
  return {
    seen: u.lexicon_ids.filter((id) => intro.has(id)).length / n,
    stable: u.lexicon_ids.filter((id) => isMastered(p.cards[id])).length / n,
    due: u.lexicon_ids.filter((id) => isDue(p.cards[id], now)).length,
  };
}

function Ring({ value, size = 76, children }: { value: number; size?: number; children: React.ReactNode }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" />
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - value)} />
      </svg>
      <span className="ring-inner">{children}</span>
    </span>
  );
}

export function Home({
  courseId,
  onCourse,
  onStart,
  onShop,
}: {
  courseId: string;
  onCourse: (id: string) => void;
  onStart: (unitId: string) => void;
  onShop: () => void;
}) {
  const { pack, progress } = useApp();
  const available = pack.courses.filter((c) => c.level !== 'mini' || progress.owned.includes(c.id));
  const course = available.find((c) => c.id === courseId) ?? available[0];
  const units = course.unit_ids.map((id) => pack.units.find((u) => u.id === id)!);
  const lvl = levelOf(progress.xp);
  const today = todayXp(progress);
  const { active, days } = habitDensity(progress);
  const prog = units.map((u) => unitProgress(u, progress));
  const nextIdx = Math.max(
    0,
    prog.findIndex((p) => p.seen < 1),
  );
  const suggested = prog.every((p) => p.seen >= 1) ? prog.reduce((best, p, i) => (p.due > prog[best].due ? i : best), 0) : nextIdx;

  return (
    <div className="screen home">
      {!pack.verified_by_native && pack.target_language !== 'sv' && <p className="banner">Demo content, not yet checked by a native speaker.</p>}

      <section className="hero" aria-label="Your progress">
        <div className="hero-top">
          <span className="hero-flag" aria-hidden="true">
            {pack.flag}
          </span>
          <div className="hero-mid">
            <div className="hero-title">{pack.name}</div>
            <div className="hero-pills">
              <span className="level-pill">Level {lvl.level}</span>
              <button type="button" className="coin-pill" onClick={onShop} aria-label={`${progress.coins} coins. Open the shop`}>
                🪙 {progress.coins}
              </button>
            </div>
          </div>
          <Ring value={Math.min(1, today / DAILY_GOAL)} size={64}>
            <span className="goal-num">{today >= DAILY_GOAL ? '🎯' : today}</span>
          </Ring>
        </div>
        <div className="xp-head">
          <span>XP · daily goal {Math.min(today, DAILY_GOAL)}/{DAILY_GOAL}</span>
          <span>
            {lvl.into} / {lvl.per}
          </span>
        </div>
        <div className="xp-bar" aria-hidden="true">
          <div style={{ width: `${(lvl.into / lvl.per) * 100}%` }} />
        </div>
      </section>

      <nav className="course-chips" aria-label="Courses">
        {available.map((c) => (
          <button type="button" key={c.id} className={`course-chip ${c.id === course.id ? 'on' : ''}`} onClick={() => onCourse(c.id)}>
            <span aria-hidden="true">{c.emoji}</span> {c.title}
          </button>
        ))}
        <button type="button" className="course-chip shop" onClick={onShop}>
          🛍️ More
        </button>
      </nav>

      <section className={`course-head level-${course.level}`}>
        <span className="course-level">{LEVEL_LABEL[course.level]}</span>
        <h2>
          {course.emoji} {course.title}
        </h2>
        <p className="muted">{course.tagline}</p>
      </section>

      <ol className="path">
        {units.map((u, i) => {
          const p = prog[i];
          const status = u.song
            ? p.seen
              ? 'Sing it again'
              : 'Learn the song'
            : p.seen < 1
              ? p.seen > 0
                ? 'New words left'
                : 'Start'
              : p.due
                ? `${p.due} to review`
                : 'Practise again';
          const offset = ['0%', '22%', '0%', '-22%'][i % 4];
          return (
            <li key={u.id} className="path-item" style={{ transform: `translateX(${offset})` }}>
              <button type="button" className={`path-node ${i === suggested ? 'next' : ''} ${p.seen >= 1 ? 'done' : ''}`} onClick={() => onStart(u.id)}>
                <Ring value={p.seen}>
                  <span className="node-emoji" aria-hidden="true">
                    {u.visual}
                  </span>
                </Ring>
                <span className="node-title">{u.title}</span>
                <span className="node-status">{i === suggested ? `▶ ${status}` : status}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <section className="habit" aria-label={`Active ${active} of the last 30 days`}>
        <div className="habit-head">
          <span>Last 30 days</span>
          <span className="muted">
            {active} active {active === 1 ? 'day' : 'days'}
          </span>
        </div>
        <div className="habit-dots">
          {days.map((d, k) => (
            <span key={k} className={d ? 'on' : ''} />
          ))}
        </div>
      </section>
    </div>
  );
}
