import { useMemo, useRef, useState } from 'react';
import { buildSession, insertRetry, lexOf, mutateForRetry, SCORED, type Step } from '../engine/session';
import { commitSession, ratingFromLatency, type ItemOutcome } from '../engine/scheduler';
import { dayKey, levelOf, saveProgress, XP } from '../engine/store';
import { getVoiceSource } from '../audio/tts';
import { sfx } from '../audio/sfx';
import { Badge } from './common';
import { useApp } from '../ctx';
import { Article, Cloze, ListenPick, MinimalPair, Prime, Rule, Structured, Tiles, type Done } from './exercises';
import { Speak } from './Speak';
import { Dialogue } from './Dialogue';

export function Session({ unitId, onExit }: { unitId: string; onExit: () => void }) {
  const { pack, progress, setProgress } = useApp();
  const initial = useMemo(() => buildSession(pack, unitId, progress, { accentAudio: getVoiceSource() !== 'device' }), [pack, unitId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [queue, setQueue] = useState<Step[]>(initial);
  const [i, setI] = useState(0);
  const [summary, setSummary] = useState<{ words: number; retried: number; firstTry: number; scored: number; xp: number; xpBefore: number } | null>(null);
  const outcomes = useRef<Record<string, ItemOutcome>>({});
  const recent = useRef<boolean[]>([]);
  const shownAt = useRef(Date.now());
  const stats = useRef({ firstTry: 0, scored: 0 });
  const xp = useRef(0);
  const dialoguesDone = useRef<string[]>([]);

  const step = queue[i];

  const finish = (q: Step[]) => {
    const now = new Date();
    const introduced = new Set(progress.introduced);
    for (const s of q) if (s.kind === 'prime') s.lexIds.forEach((id) => introduced.add(id));
    const unit = pack.units.find((u) => u.id === unitId)!;
    const rulesSeen = new Set(progress.rulesSeen);
    if (q.some((s) => s.kind === 'rule')) rulesSeen.add(unit.id);
    const next = {
      ...progress,
      cards: commitSession(progress.cards, outcomes.current, now),
      introduced: [...introduced],
      rulesSeen: [...rulesSeen],
      activeDays: [...new Set([...progress.activeDays, dayKey(now)])].slice(-120),
      recent: [...progress.recent, ...recent.current].slice(-30),
      sessions: { ...progress.sessions, [unitId]: (progress.sessions[unitId] ?? 0) + 1 },
      dialogues: { ...progress.dialogues },
      xp: progress.xp + xp.current + XP.session,
    };
    for (const d of dialoguesDone.current) next.dialogues[d] = (next.dialogues[d] ?? 0) + 1;
    saveProgress(pack.pack_id, next);
    setProgress(next);
    setSummary({
      words: Object.keys(outcomes.current).length,
      retried: Object.values(outcomes.current).filter((o) => o.lapsed).length,
      ...stats.current,
      xp: xp.current + XP.session,
      xpBefore: progress.xp,
    });
    sfx.done();
  };

  const onDone: Done = (correct) => {
    let q = queue;
    const lexId = lexOf(step);
    if (correct !== null && SCORED.has(step.kind) && lexId) {
      const o = (outcomes.current[lexId] ??= { lapsed: false, ratings: [] });
      if (!step.retry) {
        recent.current.push(correct);
        stats.current.scored++;
        if (correct) stats.current.firstTry++;
      }
      if (correct && !step.retry) o.ratings.push(ratingFromLatency(step.kind, Date.now() - shownAt.current));
      if (correct) xp.current += step.retry ? XP.retry : XP.firstTry;
      if (!correct) {
        o.lapsed = true;
        // sticky buffer: comes back a few items later, in a different format
        q = insertRetry(queue, i, mutateForRetry(pack, step));
        setQueue(q);
      }
    }
    if (step.kind === 'dialogue') {
      dialoguesDone.current.push(step.dialogueId ?? `${step.unitId}:capstone`);
      xp.current += XP.dialogue;
    }
    if (i + 1 >= q.length) return finish(q);
    shownAt.current = Date.now();
    setI(i + 1);
  };

  if (summary) {
    const pct = summary.scored ? Math.round((summary.firstTry / summary.scored) * 100) : null;
    return (
      <div className="screen summary">
        <div className="summary-card">
          <div className="big-emoji" aria-hidden="true">🌱</div>
          <h2>Session done</h2>
          <p>
            You practised <strong>{summary.words}</strong> words.
            {pct !== null && <> {pct}% right on the first try.</>}
          </p>
          {summary.retried > 0 && (
            <p className="muted">
              {summary.retried} word{summary.retried > 1 ? 's' : ''} needed a second look. They'll come back sooner. That's how they stick.
            </p>
          )}
          {pct !== null && pct > 95 && <p className="muted">That was easy. Next time the exercises get a bit harder.</p>}
          <XpGain before={summary.xpBefore} gained={summary.xp} />
          <button type="button" className="primary" onClick={onExit}>
            Back
          </button>
        </div>
      </div>
    );
  }

  const progressPct = Math.round((i / queue.length) * 100);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = { step, onDone } as any;
  return (
    <div className="screen session">
      <header className="session-head">
        <button type="button" className="icon-btn" onClick={onExit} aria-label="Leave session">
          ✕
        </button>
        <div className="bar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${progressPct}%` }} />
        </div>
      </header>
      <main key={step.key}>
        <Badge kind={step.kind} retry={step.retry} />
        {step.kind === 'prime' && <Prime {...props} />}
        {step.kind === 'listen_pick' && <ListenPick {...props} />}
        {step.kind === 'structured' && <Structured {...props} />}
        {step.kind === 'rule' && <Rule {...props} />}
        {step.kind === 'minimal_pair' && <MinimalPair {...props} />}
        {step.kind === 'tiles' && <Tiles {...props} />}
        {step.kind === 'cloze' && <Cloze {...props} />}
        {step.kind === 'article' && <Article {...props} />}
        {step.kind === 'speak' && <Speak {...props} />}
        {step.kind === 'dialogue' && <Dialogue {...props} />}
      </main>
    </div>
  );
}

function XpGain({ before, gained }: { before: number; gained: number }) {
  const after = levelOf(before + gained);
  const leveledUp = after.level > levelOf(before).level;
  return (
    <div className="xp-gain">
      <div className="xp-head">
        <strong>+{gained} XP</strong>
        <span className="muted">Level {after.level}{leveledUp ? ' 🎉 level up!' : ''}</span>
      </div>
      <div className="xp-bar" aria-hidden="true">
        <div style={{ width: `${(after.into / after.per) * 100}%` }} />
      </div>
    </div>
  );
}
