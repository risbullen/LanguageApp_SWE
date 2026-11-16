import { habitDensity } from '../engine/store';
import { isDue, isMastered } from '../engine/scheduler';
import { useApp } from '../ctx';

export function Home({ onStart }: { onStart: (unitId: string) => void }) {
  const { pack, progress } = useApp();
  const now = new Date();
  const { active, days } = habitDensity(progress, now);
  const introduced = new Set(progress.introduced);
  const due = pack.lexicon.filter((l) => isDue(progress.cards[l.id], now)).length;
  const learned = pack.lexicon.filter((l) => introduced.has(l.id)).length;
  const mastered = pack.lexicon.filter((l) => isMastered(progress.cards[l.id])).length;
  // suggested unit: first one with unseen words, else the one with most due
  const suggested =
    pack.units.find((u) => u.lexicon_ids.some((id) => !introduced.has(id)))?.id ??
    [...pack.units].sort(
      (a, b) =>
        b.lexicon_ids.filter((id) => isDue(progress.cards[id], now)).length - a.lexicon_ids.filter((id) => isDue(progress.cards[id], now)).length,
    )[0].id;

  return (
    <div className="screen home">
      {!pack.verified_by_native && pack.target_language !== 'sv' && (
        <p className="banner">Demo content, not yet checked by a native speaker.</p>
      )}
      <section className="stats" aria-label="Your progress">
        <div className="stat">
          <span className="num">{learned}</span>
          <span className="lbl">words met</span>
        </div>
        <div className="stat">
          <span className="num">{mastered}</span>
          <span className="lbl">stable ≥ 1 week</span>
        </div>
        <div className="stat">
          <span className="num">{due}</span>
          <span className="lbl">ready to review</span>
        </div>
      </section>
      <section className="habit" aria-label={`Active ${active} of the last 30 days`}>
        <div className="habit-head">
          <span>Last 30 days</span>
          <span className="muted">{active} active days</span>
        </div>
        <div className="habit-dots">
          {days.map((d, i) => (
            <span key={i} className={d ? 'on' : ''} />
          ))}
        </div>
      </section>
      <section className="units">
        {pack.units.map((u) => {
          const seen = u.lexicon_ids.filter((id) => introduced.has(id)).length;
          const stable = u.lexicon_ids.filter((id) => isMastered(progress.cards[id])).length;
          const dueHere = u.lexicon_ids.filter((id) => isDue(progress.cards[id], now)).length;
          const total = u.lexicon_ids.length;
          const status = seen < total ? (seen ? 'New words left' : 'Start') : dueHere ? `${dueHere} to review` : 'Practise again';
          return (
            <button type="button" key={u.id} className={`unit ${u.id === suggested ? 'suggested' : ''}`} onClick={() => onStart(u.id)}>
              <span className="unit-visual" aria-hidden="true">{u.visual}</span>
              <span className="unit-body">
                <span className="unit-title">{u.title}</span>
                <span className="unit-status">{status}</span>
                <span className="unit-bar" aria-hidden="true">
                  <span className="seen" style={{ width: `${(seen / total) * 100}%` }} />
                  <span className="stable" style={{ width: `${(stable / total) * 100}%` }} />
                </span>
              </span>
              {u.id === suggested && <span className="pill">Up next</span>}
            </button>
          );
        })}
      </section>
    </div>
  );
}
