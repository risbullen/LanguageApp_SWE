import { useState } from 'react';
import { audioId, formVisual, lexMap } from '../content/index';
import { playBlob, recognitionSupported, type ListenResult } from '../audio/listen';
import { matchSpeech, passes, type MatchResult } from '../engine/match';
import { sfx } from '../audio/sfx';
import type { Step } from '../engine/session';
import { useApp } from '../ctx';
import { Continue, Details, English, PushToTalk, ScriptText, SpeakerButton, Visual, usePlayer, useText } from './common';
import type { Done } from './exercises';

/** What was heard, word by word: green = understood, amber = not caught. */
export function HeardLine({ m }: { m: MatchResult }) {
  return (
    <div className="heard">
      <span className="heard-label">Heard:</span> “{m.heard || '…'}”
      <div className="word-chips">
        {m.words.map((w, i) => (
          <span key={i} className={`chip ${w.ok ? 'ok' : 'miss'}`}>
            {w.word}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ───────────── 4–5 · Say it (push-to-talk), then native vs. you ───────────── */
export function Speak({ step, onDone }: { step: Extract<Step, { kind: 'speak' }>; onDone: Done }) {
  const { pack, script, settings } = useApp();
  const t = useText();
  const l = lexMap(pack).get(step.lexId)!;
  const f = l.forms.find((x) => x.tag === step.tag) ?? l.forms[0];
  const id = audioId(l.id, f.tag);
  const { play } = usePlayer();
  const [first, setFirst] = useState<boolean | null>(null); // first attempt decides the score
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [mine, setMine] = useState<Blob | null>(null); // in memory only, gone after this screen
  const [problem, setProblem] = useState<string | null>(null);
  const [showWord, setShowWord] = useState(settings.mode === 'analytical');
  const [fails, setFails] = useState(0); // after 2 failed listens, offer "I said it"

  const supported = recognitionSupported();

  const onResult = async (r: ListenResult) => {
    const code = r.rawError ? ` (${r.rawError})` : '';
    if (r.error) setFails((n) => n + 1);
    if (r.error === 'no-speech') return setProblem(`Didn’t hear anything${code}. Wait for “Speak now…”, then talk.`);
    if (r.error === 'not-allowed') return setProblem(`The microphone is blocked${code}. Allow it in the browser’s site settings.`);
    if (r.error === 'network') return setProblem(`Speech recognition needs an internet connection${code}.`);
    if (r.error) return setProblem(`That didn’t work${code}. Try again.`);
    setProblem(null);
    const m = matchSpeech(f.text, r.transcripts);
    const ok = passes(m);
    setMatch(m);
    setMine(r.recording);
    setShowWord(true);
    if (first === null) setFirst(ok);
    if (ok) sfx.correct();
    // contrast while it's fresh: native model, then the learner's own attempt
    await play(id, f.text);
    if (r.recording) await playBlob(r.recording);
  };

  const ok = match ? passes(match) : null;

  return (
    <div className="exercise">
      <p className="instruction">Say it out loud.</p>
      <div className="center">
        <Visual size="lg">{formVisual(pack, l, f.tag)}</Visual>
        <SpeakerButton audioId={id} text={f.text} auto />
        {showWord ? (
          <ScriptText script={script} big>
            {t(f)}
          </ScriptText>
        ) : (
          <button type="button" className="link" onClick={() => setShowWord(true)}>
            Show the word
          </button>
        )}
        <Details lex={l} form={f} />
      </div>

      {!supported ? (
        <>
          <p className="hint">This browser can’t check speech (Chrome can). Say it aloud anyway and compare with the voice.</p>
          <Continue onClick={() => onDone(null)} label="I said it" />
        </>
      ) : (
        <>
          {ok === null && <PushToTalk onResult={onResult} />}
          {problem && <p className="banner">{problem}</p>}
          {match && (
            <div className={`reveal ${ok ? 'good' : 'fix'}`} role="status">
              <div className="reveal-head">{ok ? 'Yes, understood!' : 'Not quite. Listen and try again.'}</div>
              <HeardLine m={match} />
              <English text={f.en} />
              <div className="compare">
                <button type="button" className="secondary" onClick={() => play(id, f.text)}>
                  ▶ Native
                </button>
                {mine && (
                  <button type="button" className="secondary" onClick={() => playBlob(mine)}>
                    ▶ You
                  </button>
                )}
              </div>
              {!ok && <PushToTalk onResult={onResult} label="Try again" compact />}
            </div>
          )}
          {match ? (
            <Continue onClick={() => onDone(first)} tone={ok ? 'good' : 'fix'} />
          ) : fails >= 2 ? (
            <Continue onClick={() => onDone(null)} label="I said it, continue" />
          ) : (
            <button type="button" className="link center-text" onClick={() => onDone(null)}>
              Can’t talk right now
            </button>
          )}
        </>
      )}
    </div>
  );
}
