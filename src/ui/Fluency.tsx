import { useEffect, useMemo, useRef, useState } from 'react';
import type { Step } from '../engine/session';
import { FLUENCY_ROUNDS } from '../engine/session';
import { formVisual, lexMap } from '../content/index';
import { listenContinuous, recognitionSupported } from '../audio/listen';
import { stopSpeaking } from '../audio/tts';
import { normalize, levenshtein } from '../engine/match';
import { useApp } from '../ctx';
import { Continue, FaintText, useText } from './common';
import type { Done } from './exercises';

const AUDIENCES = ['to a friend', 'to a neighbour', 'on the phone, in a hurry'];

interface Round {
  seconds: number;
  text: string;
}

const close = (a: string, b: string) => 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1) >= 0.8;

/**
 * Speaking sprint (Paul Nation's 4-3-2, scaled for beginners): tell the same short story
 * about the pictures three times, faster each time. Only known words, no corrections
 * during the rounds; a short summary comes at the end.
 */
export function Fluency({ step, onDone }: { step: Extract<Step, { kind: 'fluency' }>; onDone: Done }) {
  const { pack } = useApp();
  const t = useText();
  const unit = pack.units.find((u) => u.id === step.unitId)!;
  const lex = useMemo(() => lexMap(pack), [pack]);
  const words = unit.lexicon_ids.map((id) => lex.get(id)!).filter(Boolean);
  const canListen = recognitionSupported();

  const [phase, setPhase] = useState<'intro' | 'round' | 'between' | 'summary'>('intro');
  const [round, setRoundState] = useState(0);
  const roundRef = useRef(0); // the timer callback must see the current round
  const setRound = (r: number) => {
    roundRef.current = r;
    setRoundState(r);
  };
  const [left, setLeft] = useState<number>(FLUENCY_ROUNDS[0]);
  const [live, setLive] = useState('');
  const [rounds, setRounds] = useState<Round[]>([]);
  const session = useRef<ReturnType<typeof listenContinuous> | null>(null);
  const startedAt = useRef(0);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      session.current?.stop();
    },
    [],
  );

  const finishRound = async () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    const seconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    const text = session.current ? await session.current.stop() : '';
    session.current = null;
    setRounds((r) => [...r, { seconds, text }]);
    setPhase(roundRef.current + 1 < FLUENCY_ROUNDS.length ? 'between' : 'summary');
  };

  const startRound = () => {
    stopSpeaking();
    const total = FLUENCY_ROUNDS[roundRef.current];
    setLeft(total);
    setLive('');
    setPhase('round');
    startedAt.current = Date.now();
    if (canListen) session.current = listenContinuous(pack.tts_lang, setLive);
    timer.current = window.setInterval(() => {
      const remaining = total - Math.floor((Date.now() - startedAt.current) / 1000);
      setLeft(Math.max(0, remaining));
      if (remaining <= 0 && timer.current) finishRound();
    }, 250);
  };

  // which unit words were used in any round (delayed feedback, not during speaking)
  const used = useMemo(() => {
    const tokens = new Set(rounds.flatMap((r) => normalize(r.text)));
    return words.filter((l) => l.forms.some((f) => normalize(f.text).every((w) => [...tokens].some((x) => close(w, x)))));
  }, [rounds, words]);

  const pictures = (
    <div className="sprint-pictures">
      {words.map((l) => (
        <span key={l.id} className="sprint-pic">
          <span aria-hidden="true">{formVisual(pack, l, l.forms[0].tag)}</span>
          <FaintText text={t(l.forms[0])} />
        </span>
      ))}
    </div>
  );

  if (phase === 'intro')
    return (
      <div className="exercise">
        <p className="instruction">Talk about these pictures, three times.</p>
        <p className="muted">
          Same little talk each time, a bit faster: {FLUENCY_ROUNDS.join(' → ')} seconds. Only words you know. Nobody corrects you while you talk.
          Take a moment to plan what you'll say.
        </p>
        {pictures}
        <Continue onClick={startRound} label="I'm ready: start round 1" />
      </div>
    );

  if (phase === 'round')
    return (
      <div className="exercise">
        <p className="instruction">
          Round {round + 1}: talk {AUDIENCES[round]}
        </p>
        <div className={`sprint-timer ${left <= 10 ? 'low' : ''}`} role="timer" aria-live="off">
          {left}s
        </div>
        {pictures}
        {canListen ? (
          <p className="sprint-live" aria-live="polite">
            {live || 'Listening… start talking.'}
          </p>
        ) : (
          <p className="hint">Speak out loud. (This browser can't follow along, so the timer just keeps time.)</p>
        )}
        <Continue onClick={finishRound} label="Done early" />
      </div>
    );

  if (phase === 'between') {
    const last = rounds[rounds.length - 1];
    const n = normalize(last.text).length;
    return (
      <div className="exercise">
        <p className="instruction">Nice! Round {round + 1} done.</p>
        {canListen && (
          <p className="sprint-stat">
            {n} words · {Math.round((n / last.seconds) * 60)} words per minute
          </p>
        )}
        <p className="muted">
          Now the same talk again, {AUDIENCES[round + 1]}: only {FLUENCY_ROUNDS[round + 1]} seconds.
        </p>
        <Continue
          onClick={() => {
            setRound(round + 1);
            setTimeout(startRound, 0);
          }}
          label={`Start round ${round + 2}`}
        />
      </div>
    );
  }

  // summary
  const wpm = rounds.map((r) => Math.round((normalize(r.text).length / r.seconds) * 60));
  const faster = wpm.length === 3 && wpm[2] > wpm[0];
  const missing = words.filter((l) => !used.includes(l));
  return (
    <div className="exercise">
      <p className="instruction">Sprint done! 🏁</p>
      {canListen ? (
        <>
          <table className="sprint-table">
            <thead>
              <tr>
                <th>Round</th>
                <th>Words</th>
                <th>Per minute</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((r, i) => (
                <tr key={i}>
                  <td>
                    {i + 1} ({FLUENCY_ROUNDS[i]}s)
                  </td>
                  <td>{normalize(r.text).length}</td>
                  <td>{wpm[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {faster && <p className="goal-hit">Faster each round: that's fluency growing.</p>}
          {used.length > 0 && (
            <p>
              <strong>Words you used:</strong> {used.map((l) => t(l.forms[0])).join(', ')}
            </p>
          )}
          {missing.length > 0 && (
            <p className="muted">
              Next time, try to include: {missing.map((l) => `${formVisual(pack, l, l.forms[0].tag)} ${t(l.forms[0])}`).join(', ')}
            </p>
          )}
        </>
      ) : (
        <p className="muted">Three rounds of speaking done. Each time a little faster is the goal.</p>
      )}
      <Continue onClick={() => onDone(null)} />
    </div>
  );
}
