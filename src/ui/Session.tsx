import { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { buildSession, insertRetry, lexOf, mutateForRetry, SCORED, type Step } from '../engine/session';
import { commitSession, ratingFromLatency, type ItemOutcome } from '../engine/scheduler';
import { COINS, DAILY_GOAL, dayKey, levelOf, saveProgress, todayXp, XP } from '../engine/store';
import { getVoiceSource } from '../audio/tts';
import { sfx } from '../audio/sfx';
import { Badge } from './common';
import { Ctx, useApp } from '../ctx';
import { Article, Cloze, ListenPick, MinimalPair, Prime, Rule, Structured, Tiles, type Done } from './exercises';
import { Speak } from './Speak';
import { Dialogue } from './Dialogue';
import { SongFull, SongLine } from './Song';
import { Fluency } from './Fluency';
import { lexMap } from '../content/index';

const buzz = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
};

export function celebrate() {
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  confetti({ particleCount: 90, spread: 75, origin: { y: 0.7 }, colors: ['#005293', '#fecb00', '#10b981', '#ffffff'] });
}

export function Session({ unitId, onExit }: { unitId: string; onExit: () => void }) {
  const app = useApp();
  const { pack, progress, setProgress, settings } = app;
  const course = pack.courses.find((c) => c.unit_ids.includes(unitId));
  const hard = course?.level === 'C1' || course?.level === 'B2';
  // Hard courses: text hidden until asked for, natural speed
  const ctx = useMemo(
    () => (hard ? { ...app, settings: { ...settings, mode: 'associative' as const, rate: Math.max(settings.rate, 1) } } : app),
    [app, hard, settings],
  );

  const initial = useMemo(() => buildSession(pack, unitId, progress, { accentAudio: getVoiceSource() !== 'device' }), [pack, unitId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [queue, setQueue] = useState<Step[]>(initial);
  const [i, setI] = useState(0);
  const [combo, setCombo] = useState(0);
  const [summary, setSummary] = useState<{
    words: number;
    retried: number;
    firstTry: number;
    scored: number;
    xp: number;
    xpBefore: number;
    coins: number;
    bestCombo: number;
    dailyBefore: number;
  } | null>(null);
  const outcomes = useRef<Record<string, ItemOutcome>>({});
  const recent = useRef<boolean[]>([]);
  const shownAt = useRef(Date.now());
  const stats = useRef({ firstTry: 0, scored: 0 });
  const xp = useRef(0);
  const coins = useRef(0);
  const bestCombo = useRef(0);
  const dialoguesDone = useRef<string[]>([]);

  useEffect(() => {
    if (summary) celebrate();
  }, [summary]);

  const step = queue[i];

  const finish = (q: Step[]) => {
    const now = new Date();
    const introduced = new Set(progress.introduced);
    for (const s of q) if (s.kind === 'prime') s.lexIds.forEach((id) => introduced.add(id));
    const unit = pack.units.find((u) => u.id === unitId)!;
    const rulesSeen = new Set(progress.rulesSeen);
    if (q.some((s) => s.kind === 'rule')) rulesSeen.add(unit.id);
    const gained = xp.current + XP.session;
    const earned = coins.current + COINS.session;
    const dailyBefore = todayXp(progress, now);
    const next = {
      ...progress,
      cards: commitSession(progress.cards, outcomes.current, now),
      introduced: [...introduced],
      rulesSeen: [...rulesSeen],
      activeDays: [...new Set([...progress.activeDays, dayKey(now)])].slice(-120),
      recent: [...progress.recent, ...recent.current].slice(-30),
      sessions: { ...progress.sessions, [unitId]: (progress.sessions[unitId] ?? 0) + 1 },
      dialogues: { ...progress.dialogues },
      xp: progress.xp + gained,
      coins: progress.coins + earned,
      daily: { day: dayKey(now), xp: dailyBefore + gained },
    };
    for (const d of dialoguesDone.current) next.dialogues[d] = (next.dialogues[d] ?? 0) + 1;
    saveProgress(pack.pack_id, next);
    setProgress(next);
    setSummary({
      words: Object.keys(outcomes.current).length,
      retried: Object.values(outcomes.current).filter((o) => o.lapsed).length,
      ...stats.current,
      xp: gained,
      xpBefore: progress.xp,
      coins: earned,
      bestCombo: bestCombo.current,
      dailyBefore,
    });
    sfx.done();
  };

  const onDone: Done = (correct) => {
    let q = queue;
    const lexId = lexOf(step);
    if (correct !== null) {
      // XP and combo for every right answer (songs too); a miss just resets the combo
      if (correct) {
        xp.current += step.retry ? XP.retry : XP.firstTry;
        buzz(15);
        setCombo((c) => {
          const n = c + 1;
          bestCombo.current = Math.max(bestCombo.current, n);
          return n;
        });
      } else setCombo(0);
    }
    if (correct !== null && SCORED.has(step.kind) && lexId) {
      const o = (outcomes.current[lexId] ??= { lapsed: false, ratings: [] });
      if (!step.retry) {
        recent.current.push(correct);
        stats.current.scored++;
        if (correct) stats.current.firstTry++;
      }
      if (correct && !step.retry) o.ratings.push(ratingFromLatency(step.kind, Date.now() - shownAt.current));
      if (!correct) {
        o.lapsed = true;
        // sticky buffer: comes back a few items later, in a different format, at most once
        // per session (a second miss is left to the long-term scheduler, no endless loops)
        if (!step.retry) {
          q = insertRetry(queue, i, mutateForRetry(pack, step));
          setQueue(q);
        }
      }
    }
    if (step.kind === 'fluency') {
      xp.current += XP.dialogue;
      coins.current += COINS.dialogue;
    }
    if (step.kind === 'dialogue') {
      dialoguesDone.current.push(step.dialogueId ?? `${step.unitId}:capstone`);
      xp.current += XP.dialogue;
      coins.current += COINS.dialogue;
    }
    if (i + 1 >= q.length) return finish(q);
    shownAt.current = Date.now();
    setI(i + 1);
  };

  if (summary) {
    const pct = summary.scored ? Math.round((summary.firstTry / summary.scored) * 100) : null;
    const isSong = !!pack.units.find((u) => u.id === unitId)?.song;
    return (
      <div className="screen summary">
        <div className="summary-card">
          <div className="big-emoji" aria-hidden="true">
            {isSong ? '🎵' : '🌱'}
          </div>
          <h2>{isSong ? 'You learnt a song!' : 'Session done'}</h2>
          {!isSong && (
            <p>
              You practised <strong>{summary.words}</strong> {summary.words === 1 ? 'word' : 'words'}.
              {pct !== null && <> {pct}% right on the first try.</>}
            </p>
          )}
          {summary.retried > 0 && (
            <p className="muted">
              {summary.retried} word{summary.retried > 1 ? 's' : ''} needed a second look. They'll come back sooner. That's how they stick.
            </p>
          )}
          {pct !== null && pct > 95 && <p className="muted">That was easy. Next time the exercises get a bit harder.</p>}
          <div className="rewards">
            <span className="reward">⭐ +{summary.xp} XP</span>
            <span className="reward">🪙 +{summary.coins}</span>
            {summary.bestCombo >= 3 && <span className="reward">🔥 {summary.bestCombo} in a row</span>}
          </div>
          <XpGain before={summary.xpBefore} gained={summary.xp} />
          <DailyGoalLine before={summary.dailyBefore} gained={summary.xp} />
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
  const sentence = step.kind === 'tiles' && (lexMap(pack).get(step.lexId)?.pos === 'phrase' || false);
  return (
    <Ctx.Provider value={ctx}>
      <div className="screen session">
        <header className="session-head">
          <button type="button" className="icon-btn" onClick={onExit} aria-label="Leave session">
            ✕
          </button>
          <div className="bar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${progressPct}%` }} />
          </div>
          {combo >= 3 && (
            <span className="combo" key={combo} aria-label={`${combo} in a row`}>
              🔥 {combo}
            </span>
          )}
        </header>
        <main key={step.key}>
          <Badge kind={sentence ? 'sentence' : step.kind} retry={step.retry} hard={hard} />
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
          {step.kind === 'song_line' && <SongLine {...props} />}
          {step.kind === 'song_full' && <SongFull {...props} />}
          {step.kind === 'fluency' && <Fluency {...props} />}
        </main>
      </div>
    </Ctx.Provider>
  );
}

function XpGain({ before, gained }: { before: number; gained: number }) {
  const after = levelOf(before + gained);
  const leveledUp = after.level > levelOf(before).level;
  return (
    <div className="xp-gain">
      <div className="xp-head">
        <strong>Level {after.level}</strong>
        <span className="muted">{leveledUp ? '🎉 level up!' : `${after.into} / ${after.per} XP`}</span>
      </div>
      <div className="xp-bar" aria-hidden="true">
        <div style={{ width: `${(after.into / after.per) * 100}%` }} />
      </div>
    </div>
  );
}

function DailyGoalLine({ before, gained }: { before: number; gained: number }) {
  const GOAL = DAILY_GOAL;
  const now = before + gained;
  if (before >= GOAL) return <p className="muted small">Daily goal already reached today. Everything extra is a bonus.</p>;
  if (now >= GOAL) return <p className="goal-hit">🎯 Daily goal reached!</p>;
  return <p className="muted small">Daily goal: {now} / {GOAL} XP</p>;
}
