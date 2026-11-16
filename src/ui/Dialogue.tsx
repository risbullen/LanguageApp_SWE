import { useEffect, useState } from 'react';
import type { Step } from '../engine/session';
import { useApp } from '../ctx';
import { Continue, ScriptText, SpeakerButton, usePlayer, useText } from './common';
import type { Done } from './exercises';
import { speak } from '../audio/tts';

interface Line {
  who: 'them' | 'me';
  text: string;
  shown: string;
  audio: string;
  visual?: string;
  speaker?: string;
  note?: string;
  fit?: 'ok' | 'meh' | 'no';
}

/* ───────────── 6 · Communicative capstone: a short branching conversation ───────────── */
export function Dialogue({ step, onDone }: { step: Extract<Step, { kind: 'dialogue' }>; onDone: Done }) {
  const { pack, script, settings } = useApp();
  const t = useText();
  const { play } = usePlayer();
  const unit = pack.units.find((u) => u.id === step.unitId)!;
  const dlg = unit.dialogue!;
  const nodes = new Map(dlg.nodes.map((n) => [n.id, n]));
  const [nodeId, setNodeId] = useState<string | null>(dlg.start);
  const [log, setLog] = useState<Line[]>([]);
  const [revealed, setRevealed] = useState(settings.mode === 'analytical');
  const node = nodeId ? nodes.get(nodeId) : undefined;
  const nodeAudio = (id: string) => `dlg.${unit.id}.${id}`;

  // interlocutor speaks when a node becomes active
  useEffect(() => {
    if (!node) return;
    setLog((l) => [...l, { who: 'them', text: node.line, shown: t({ text: node.line, alt: node.alt }), audio: nodeAudio(node.id), visual: node.visual, speaker: node.speaker }]);
    setRevealed(settings.mode === 'analytical');
    const tm = setTimeout(() => play(nodeAudio(node.id), node.line), 300);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  const choose = async (i: number) => {
    const c = node!.choices[i];
    const me: Line = { who: 'me', text: c.text, shown: t(c), audio: `${nodeAudio(node!.id)}.${i}`, note: c.feedback, fit: c.fit };
    setLog((l) => [...l, me]);
    if (c.recast) {
      // the interlocutor reformulates correctly, as a real person would (corrective recast)
      setLog((l) => [...l, { who: 'them', text: c.recast!, shown: c.recast!, audio: `recast.${unit.id}.${node!.id}.${i}` }]);
      await speak(c.recast, pack.tts_lang, { rate: settings.rate });
    }
    setNodeId(c.next);
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
                  <ScriptText script={script}>{line.shown}</ScriptText>
                )}
                {line.who === 'them' && <SpeakerButton audioId={line.audio} text={line.text} />}
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
        </div>
      )}
      {finished && (
        <>
          <p className="center-text done-line">{lastMine?.fit === 'ok' ? 'Conversation complete 🎉' : 'Conversation complete. Nice work getting through it.'}</p>
          <Continue onClick={() => onDone(null)} label="Finish" />
        </>
      )}
    </div>
  );
}
