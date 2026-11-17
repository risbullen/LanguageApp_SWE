import type { Course } from '../content/schema';
import { DAILY_GOAL, levelOf, todayXp } from '../engine/store';
import { courseProgress, unitProgress } from '../engine/progress';
import { useApp } from '../ctx';
import { versionLabel } from '../version';

const LEVEL_LABEL: Record<Course['level'], string> = { basic: 'Basics', intermediate: 'Intermediate', hard: 'Hard', mini: 'Mini-course' };

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

      <Journey />

      <p className="version">{versionLabel()}</p>
    </div>
  );
}

const STAGES = [
  { id: 'basics', label: 'Beginner', emoji: '🌱' },
  { id: 'intermediate', label: 'Intermediate', emoji: '⏪' },
  { id: 'hard', label: 'Advanced', emoji: '🔥' },
];

/** One bar, three stages: how far through Beginner → Intermediate → Advanced you are. */
function Journey() {
  const { pack, progress } = useApp();
  const stages = STAGES.filter((s) => pack.courses.some((c) => c.id === s.id)).map((s) => ({ ...s, p: courseProgress(pack, progress, s.id) }));
  if (!stages.length) return null;
  return (
    <section className="journey" aria-label="Your journey">
      <div className="journey-head">
        <span>Your journey</span>
      </div>
      <div className="journey-bar">
        {stages.map((s) => (
          <div
            key={s.id}
            className="journey-seg"
            role="progressbar"
            aria-label={`${s.label}: ${s.p.wordsSeen} of ${s.p.words} words`}
            aria-valuenow={Math.round(s.p.seen * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span className="seen" style={{ width: `${s.p.seen * 100}%` }} />
            <span className="stable" style={{ width: `${s.p.stable * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="journey-labels">
        {stages.map((s) => (
          <span key={s.id}>
            <span aria-hidden="true">{s.emoji}</span> {s.label}
            <small>
              {s.p.wordsSeen}/{s.p.words}
            </small>
          </span>
        ))}
      </div>
    </section>
  );
}
