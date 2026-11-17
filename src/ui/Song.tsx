import { useEffect, useRef, useState } from 'react';
import type { Step } from '../engine/session';
import { useApp } from '../ctx';
import { speak, stopSpeaking } from '../audio/tts';
import { Continue, English, ScriptText, SpeakerButton, Visual } from './common';
import type { Done } from './exercises';
import { sfx } from '../audio/sfx';

function useSong(unitId: string) {
  const { pack } = useApp();
  return pack.units.find((u) => u.id === unitId)!.song!;
}

/** Hear one line of the song, fill in the missing word, then hear it again. */
export function SongLine({ step, onDone }: { step: Extract<Step, { kind: 'song_line' }>; onDone: Done }) {
  const { script } = useApp();
  const song = useSong(step.unitId);
  const line = song.lines[step.line];
  const [picked, setPicked] = useState<string | null>(null);
  const [before, after] = line.text.split(line.gap);
  const right = picked === line.gap;

  const pick = (o: string) => {
    setPicked(o);
    if (o === line.gap) sfx.correct();
  };

  return (
    <div className="exercise">
      <p className="instruction">
        {song.title} <span className="muted">· line {step.line + 1} of {song.lines.length}</span>
      </p>
      <div className="center">
        <Visual size="lg">{line.visual}</Visual>
        <SpeakerButton audioId={`song.${step.unitId}.${step.line}`} text={line.text} auto />
      </div>
      <div className="card song-card">
        <ScriptText script={script}>
          {before}
          <span className={`blank ${picked ? (right ? 'ok' : 'miss') : ''}`}>{picked ? line.gap : '    '}</span>
          {after}
        </ScriptText>
      </div>
      {!picked ? (
        <div className="row-options">
          {step.options.map((o) => (
            <button type="button" key={o} className="option chip" onClick={() => pick(o)}>
              {o}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className={`reveal ${right ? 'good' : 'fix'}`} role="status">
            <div className="reveal-head">{right ? 'Yes!' : `It's “${line.gap}”.`}</div>
            <English text={line.en} />
            <SpeakerButton audioId={`song.${step.unitId}.${step.line}`} text={line.text} auto label="Hear the line again" />
          </div>
          <Continue onClick={() => onDone(right)} tone={right ? 'good' : 'fix'} />
        </>
      )}
    </div>
  );
}

/** The whole song, line by line with the current line highlighted (karaoke). */
export function SongFull({ step, onDone }: { step: Extract<Step, { kind: 'song_full' }>; onDone: Done }) {
  const { pack, script, settings } = useApp();
  const song = useSong(step.unitId);
  const [current, setCurrent] = useState(-1);
  const [played, setPlayed] = useState(false);
  const stop = useRef(false);

  useEffect(
    () => () => {
      stop.current = true;
      stopSpeaking();
    },
    [],
  );

  const playAll = async () => {
    stop.current = false;
    for (let i = 0; i < song.lines.length && !stop.current; i++) {
      setCurrent(i);
      await speak(song.lines[i].text, pack.tts_lang, { rate: settings.rate });
    }
    setCurrent(-1);
    setPlayed(true);
  };

  return (
    <div className="exercise">
      <p className="instruction">Now the whole song. Sing along!</p>
      <div className="card karaoke">
        {song.lines.map((l, i) => (
          <p key={i} className={`karaoke-line ${i === current ? 'on' : ''}`}>
            <span aria-hidden="true">{l.visual}</span> <ScriptText script={script}>{l.text}</ScriptText>
            {l.en && settings.english !== false && <span className="karaoke-en">{l.en}</span>}
          </p>
        ))}
      </div>
      <div className="center">
        <button type="button" className="secondary" onClick={playAll} disabled={current >= 0}>
          {current >= 0 ? '♪ Playing…' : played ? '▶ Again' : '▶ Play the song'}
        </button>
        <p className="hint">Spoken by the voice, not sung. Hum the tune you know!</p>
      </div>
      <Continue onClick={() => onDone(null)} label="Finish" />
    </div>
  );
}
