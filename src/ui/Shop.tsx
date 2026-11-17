import { useState } from 'react';
import { buyCourse, COINS, saveProgress } from '../engine/store';
import { useApp } from '../ctx';
import { sfx } from '../audio/sfx';
import { celebrate } from './Session';

/** Mini-courses bought with coins earned by learning. Coins can't be lost, only earned. */
export function Shop({ onOpen }: { onOpen: (courseId: string) => void }) {
  const { pack, progress, setProgress } = useApp();
  const [justBought, setJustBought] = useState<string | null>(null);
  const minis = pack.courses.filter((c) => c.level === 'mini');

  const buy = (id: string, price: number) => {
    const next = buyCourse(progress, id, price);
    if (!next) return;
    saveProgress(pack.pack_id, next);
    setProgress(next);
    setJustBought(id);
    sfx.done();
    celebrate();
  };

  return (
    <div className="screen shop">
      <div className="shop-head">
        <h2>🛍️ Mini-courses</h2>
        <span className="coin-pill big">🪙 {progress.coins}</span>
      </div>
      <p className="muted">
        Short, fun courses of a few minutes each. Earn coins by learning: {COINS.session} per session, {COINS.dialogue} per conversation.
      </p>
      {!minis.length && <p className="hint">No mini-courses for this language yet.</p>}
      <ul className="shop-list">
        {minis.map((c) => {
          const owned = progress.owned.includes(c.id);
          const affordable = progress.coins >= (c.price ?? 0);
          const unitCount = c.unit_ids.length;
          return (
            <li key={c.id} className={`shop-item ${justBought === c.id ? 'bought' : ''}`}>
              <span className="shop-emoji" aria-hidden="true">
                {c.emoji}
              </span>
              <div className="shop-body">
                <strong>{c.title}</strong>
                <span className="muted small">{c.tagline}</span>
                <span className="muted small">
                  {unitCount} {unitCount === 1 ? 'lesson' : 'lessons'}
                </span>
              </div>
              {owned ? (
                <button type="button" className="buy owned" onClick={() => onOpen(c.id)}>
                  Open →
                </button>
              ) : (
                <button
                  type="button"
                  className="buy"
                  disabled={!affordable}
                  onClick={() => buy(c.id, c.price!)}
                  aria-label={`Buy ${c.title} for ${c.price} coins`}
                >
                  🪙 {c.price}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {minis.some((c) => !progress.owned.includes(c.id) && progress.coins < (c.price ?? 0)) && (
        <p className="hint">Not enough coins yet? A couple of sessions will get you there.</p>
      )}
    </div>
  );
}
