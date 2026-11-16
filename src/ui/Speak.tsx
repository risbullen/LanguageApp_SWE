import { useEffect, useRef, useState } from 'react';
import { audioId, formVisual, lexMap } from '../content/index';
import { clipsFor, playBlob, startRecording } from '../audio/recordings';
import { contourOf, dtw } from '../audio/pitch';
import type { Step } from '../engine/session';
import { useApp } from '../ctx';
import { Continue, Details, ScriptText, SpeakerButton, Visual, usePlayer, useText } from './common';
import type { Done } from './exercises';

/** Draws one or two pitch contours (semitones) as lines. */
export function ContourChart({ learner, model }: { learner: number[]; model?: number[] }) {
  const W = 300;
  const H = 120;
  const line = (c: number[]) => {
    if (!c.length) return '';
    let d = '';
    let pen = false;
    c.forEach((v, i) => {
      if (Number.isNaN(v)) return void (pen = false);
      const x = (i / Math.max(1, c.length - 1)) * W;
      const y = H / 2 - (v / 8) * (H / 2);
      d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${Math.max(2, Math.min(H - 2, y)).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  return (
    <figure className="contour">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pitch melody of your recording">
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="axis" />
        {model && <path d={line(model)} className="model" />}
        <path d={line(learner)} className="learner" />
      </svg>
      <figcaption>
        <span className="key learner">you</span>
        {model && <span className="key model">native recording</span>}
        <span className="muted">pitch melody, high ↑ low ↓</span>
      </figcaption>
    </figure>
  );
}

/* ───────────── 4–5 · Speak, then hear native vs. yourself (contrastive recast) ───────────── */
export function Speak({ step, onDone }: { step: Extract<Step, { kind: 'speak' }>; onDone: Done }) {
  const { pack, script, settings } = useApp();
  const t = useText();
  const l = lexMap(pack).get(step.lexId)!;
  const f = l.forms.find((x) => x.tag === step.tag) ?? l.forms[0];
  const id = audioId(l.id, f.tag);
  const { play } = usePlayer();
  const [state, setState] = useState<'idle' | 'rec' | 'compare' | 'error'>('idle');
  const [mine, setMine] = useState<Blob | null>(null);
  const [learnerC, setLearnerC] = useState<number[]>([]);
  const [modelC, setModelC] = useState<number[] | undefined>();
  const [match, setMatch] = useState<number | null>(null);
  const rec = useRef<{ stop: () => Promise<Blob> } | null>(null);
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  useEffect(() => () => void rec.current?.stop(), []);

  const start = async () => {
    try {
      rec.current = await startRecording();
      setState('rec');
    } catch {
      setState('error');
    }
  };
  const stop = async () => {
    const blob = await rec.current!.stop();
    rec.current = null;
    setMine(blob);
    setState('compare');
    // immediate contrast: native model first, then the learner's own voice
    await play(id, f.text);
    await playBlob(blob);
    const c = await contourOf(blob).catch(() => []);
    setLearnerC(c);
    const natives = await clipsFor(pack.pack_id, id);
    if (natives.length) {
      const m = await contourOf(natives[0].blob).catch(() => []);
      setModelC(m);
      const dist = dtw(c, m);
      setMatch(Number.isFinite(dist) ? Math.max(0, Math.round(100 - dist * 25)) : null);
    }
  };

  return (
    <div className="exercise">
      <p className="instruction">Say it out loud.</p>
      <div className="center">
        <Visual size="lg">{formVisual(pack, l, f.tag)}</Visual>
        <SpeakerButton audioId={id} text={f.text} auto />
        {(settings.mode === 'analytical' || state === 'compare') && (
          <ScriptText script={script} big>
            {t(f)}
          </ScriptText>
        )}
        <Details lex={l} form={f} />
      </div>
      {!supported || state === 'error' ? (
        <>
          <p className="hint">No microphone available. Say it aloud anyway, then compare with the model.</p>
          <Continue onClick={() => onDone(null)} />
        </>
      ) : state === 'compare' ? (
        <>
          <div className="compare">
            <button type="button" className="secondary" onClick={() => play(id, f.text)}>
              ▶ Native
            </button>
            <button type="button" className="secondary" onClick={() => mine && playBlob(mine)}>
              ▶ You
            </button>
            <button type="button" className="secondary" onClick={() => setState('idle')}>
              ↻ Try again
            </button>
          </div>
          {learnerC.length > 0 && <ContourChart learner={learnerC} model={modelC} />}
          {match !== null && <p className="muted center-text">Melody match: {match}%</p>}
          {!modelC && pack.script_metadata.has_pitch_or_tone && (
            <p className="hint">Record a native speaker for this word under Recordings to compare melodies.</p>
          )}
          <Continue onClick={() => onDone(null)} />
        </>
      ) : (
        <div className="center">
          <button type="button" className={`record ${state === 'rec' ? 'on' : ''}`} onClick={state === 'rec' ? stop : start}>
            {state === 'rec' ? '■ Stop' : '● Record'}
          </button>
          <button type="button" className="link" onClick={() => onDone(null)}>
            Skip speaking this time
          </button>
        </div>
      )}
    </div>
  );
}
