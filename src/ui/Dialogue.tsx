import { useEffect, useState } from 'react';
import type { Step } from '../engine/session';
import { useApp } from '../ctx';
import { Continue, PushToTalk, ScriptText, SpeakerButton, TapWords, usePlayer, useText } from './common';
import type { Done } from './exercises';
import { speak } from '../audio/tts';
import { recognitionSupported, type ListenResult } from '../audio/listen';
import { pickChoice } from '../engine/match';

interface Line {
  who: 'them' | 'me';
  text: string;
  shown: string;
  audio: string;
  visual?: string;
  speaker?: string;
  note?: string;
  heard?: string;
  register?: string;
  fit?: 'ok' | 'meh' | 'no';
}

/* ───────────── 6 · Communicative capstone: a short branching conversation ───────────── */
export function Dialogue({ step, onDone }: { step: Extract<Step, { kind: 'dialogue' }>; onDone: Done }) {
  const { pack, script, settings } = useApp();
  const t = useText();
  const { play } = usePlayer();
  const unit = pack.units.find((u) => u.id === step.unitId)!;
  const dlg = (step.dialogueId ? unit.mini_dialogues?.find((d) => d.id === step.dialogueId) : undefined) ?? unit.dialogue!;
  const dlgKey = step.dialogueId ?? unit.id;
  const nodes = new Map(dlg.nodes.map((n) => [n.id, n]));
  const [nodeId, setNodeId] = useState<string | null>(dlg.start);
  const [log, setLog] = useState<Line[]>([]);
  const [revealed, setRevealed] = useState(settings.mode === 'analytical');
  const [turn, setTurn] = useState(0); // re-run the speaker's line even when a choice loops back
  const [miss, setMiss] = useState<string | null>(null);
  const canTalk = recognitionSupported();
  const node = nodeId ? nodes.get(nodeId) : undefined;
  const nodeAudio = (id: string) => `dlg.${dlgKey}.${id}`;

  // interlocutor speaks when a node becomes active
  useEffect(() => {
    if (!node) return;
    setLog((l) => [...l, { who: 'them', text: node.line, shown: t({ text: node.line, alt: node.alt }), audio: nodeAudio(node.id), visual: node.visual, speaker: node.speaker }]);
    setRevealed(settings.mode === 'analytical');
    const tm = setTimeout(() => play(nodeAudio(node.id), node.line), 300);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, turn]);

  const choose = async (i: number, heard?: string) => {
    const c = node!.choices[i];
    setMiss(null);
    const me: Line = { who: 'me', text: c.text, shown: t(c), audio: `${nodeAudio(node!.id)}.${i}`, note: c.feedback, fit: c.fit, heard, register: c.register };
    setLog((l) => [...l, me]);
    if (c.recast) {
      // the interlocutor reformulates correctly, as a real person would (corrective recast)
      setLog((l) => [...l, { who: 'them', text: c.recast!, shown: c.recast!, audio: `recast.${dlgKey}.${node!.id}.${i}`, speaker: node!.speaker }]);
      await speak(c.recast, pack.tts_lang, { rate: settings.rate });
    }
    setNodeId(c.next);
    setTurn((n) => n + 1);
  };

  /** Spoken answer → whichever offered reply it matches best. */
  const onSpoken = (r: ListenResult) => {
    if (r.error === 'not-allowed') return setMiss('The microphone is blocked. Tap an answer instead.');
    if (r.error && r.error !== 'no-speech') return setMiss('Speech recognition isn’t working right now. Tap an answer instead.');
    const picked = pickChoice(
      node!.choices.map((c) => c.text),
      r.transcripts,
    );
    if (!picked) return setMiss(r.transcripts[0] ? `Heard “${r.transcripts[0]}”, which doesn’t match an answer. Try again or tap one.` : 'Didn’t catch that. Try again or tap an answer.');
    choose(picked.index, picked.match.heard);
  };

  const finished = nodeId === null;
  const lastMine = [...log].reverse().find((l) => l.who === 'me');

  return (
    <div className="exercise dialogue">
      <p className="scene">{dlg.scene}</p>
      <div className="chat" aria-live="polite">
        {log.map((line, i) => {
          const isCurrent = line.who === 'them' && i === log.length - 1 && !finished;
          const hide = isCurrent && !revealed;
          return (
            <div key={i} className={`bubble-row ${line.who}`}>
              {line.who === 'them' && <span className="avatar" aria-hidden="true">{line.speaker ?? dlg.nodes[0].speaker}</span>}
              <div className={`bubble ${line.fit ?? ''}`}>
                {line.visual && <div className="bubble-visual" aria-hidden="true">{line.visual}</div>}
                {hide ? (
                  <button type="button" className="link" onClick={() => setRevealed(true)}>
                    Show text
                  </button>
                ) : (
                  <>
                    {line.who === 'them' && pack.characters[line.speaker ?? dlg.nodes[0].speaker] && (
                      <span className="speaker-name">{pack.characters[line.speaker ?? dlg.nodes[0].speaker]}</span>
                    )}
                    {line.who === 'them' ? <TapWords text={line.shown} /> : <ScriptText script={script}>{line.shown}</ScriptText>}
                  </>
                )}
                {line.who === 'them' && <SpeakerButton audioId={line.audio} text={line.text} />}
                {line.heard && <p className="bubble-note">🎤 “{line.heard}”</p>}
                {line.register && <span className="register-tag">{line.register}</span>}
                {line.note && <p className="bubble-note">{line.note}</p>}
              </div>
            </div>
          );
        })}
      </div>
      {node && (
        <div className="choices">
          {node.choices.map((c, i) => (
            <div key={i} className="choice-row">
              <button type="button" className="option choice" onClick={() => choose(i)}>
                <ScriptText script={script}>{t(c)}</ScriptText>
              </button>
              <SpeakerButton audioId={`${nodeAudio(node.id)}.${i}`} text={c.text} label="Hear this answer" />
            </div>
          ))}
          {canTalk && <PushToTalk onResult={onSpoken} label="Hold and say your answer" />}
          {miss && <p className="hint">{miss}</p>}
        </div>
      )}
      {finished && (
        <>
          <p className="center-text done-line">{lastMine?.fit === 'ok' ? 'Conversation complete 🎉' : 'Conversation complete. Nice work getting through it.'}</p>
          <Continue onClick={() => onDone(null)} />
        </>
      )}
    </div>
  );
}
