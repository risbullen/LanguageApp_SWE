import { useEffect, useRef, useState } from 'react';
import { audioId, formVisual } from '../content/index';
import { allClipKeys, clipsFor, deleteClips, onClipsChanged, playBlob, saveClip, startRecording } from '../audio/recordings';
import { useApp } from '../ctx';
import { ScriptText, useText } from './common';

interface Row {
  id: string;
  text: string;
  shown: string;
  visual: string;
  group: string;
}

/** Record native audio for any item. Recordings replace browser TTS everywhere. */
export function Recorder() {
  const { pack, script } = useApp();
  const t = useText();
  const [have, setHave] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [recording, setRecording] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<{ stop: () => Promise<Blob> } | null>(null);

  const rows: Row[] = [];
  for (const u of pack.units) {
    for (const id of u.lexicon_ids) {
      const l = pack.lexicon.find((x) => x.id === id)!;
      for (const f of l.forms) rows.push({ id: audioId(l.id, f.tag), text: f.text, shown: t(f), visual: formVisual(pack, l, f.tag), group: u.title });
    }
    u.minimal_pairs?.forEach((pair) =>
      pair.forEach((s) => rows.push({ id: s.id, text: s.text, shown: t(s), visual: `${s.visual} ${s.label}`, group: `${u.title}: melody pairs` })),
    );
    u.dialogue?.nodes.forEach((n) => {
      rows.push({ id: `dlg.${u.id}.${n.id}`, text: n.line, shown: t({ text: n.line, alt: n.alt }), visual: n.speaker, group: `${u.title}: conversation` });
      n.choices.forEach((c, i) => rows.push({ id: `dlg.${u.id}.${n.id}.${i}`, text: c.text, shown: t(c), visual: '🙂', group: `${u.title}: conversation` }));
    });
  }

  const refresh = async () => {
    const keys = await allClipKeys(pack.pack_id);
    setHave(keys);
    const c: Record<string, number> = {};
    for (const k of keys) c[k] = (await clipsFor(pack.pack_id, k)).length;
    setCounts(c);
  };
  useEffect(() => {
    refresh();
    return onClipsChanged(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack.pack_id]);

  const toggle = async (row: Row) => {
    setError(null);
    if (recording === row.id) {
      const blob = await rec.current!.stop();
      rec.current = null;
      setRecording(null);
      if (blob.size > 1000) await saveClip(pack.pack_id, row.id, blob);
      return;
    }
    if (recording) return;
    try {
      rec.current = await startRecording();
      setRecording(row.id);
    } catch {
      setError('Microphone not available. Check the browser permission.');
    }
  };

  let lastGroup = '';
  const done = rows.filter((r) => have.has(r.id)).length;
  return (
    <div className="screen recorder">
      <h2>Recordings</h2>
      <p className="muted">
        Record a native speaker (you, or someone else) saying each item. Recordings replace the browser voice. Several people recording the same word is even better, because the
        app rotates between them. {done}/{rows.length} recorded.
      </p>
      {error && <p className="banner">{error}</p>}
      <ul className="rec-list">
        {rows.map((r) => {
          const header = r.group !== lastGroup ? ((lastGroup = r.group), <li className="rec-group" key={`g-${r.id}`}>{r.group}</li>) : null;
          return [
            header,
            <li key={r.id} className={`rec-row ${recording === r.id ? 'on' : ''}`}>
              <span className="rec-visual" aria-hidden="true">{r.visual}</span>
              <ScriptText script={script} className="rec-text">
                {r.shown}
              </ScriptText>
              <span className="rec-count">{counts[r.id] ? `${counts[r.id]}×` : ''}</span>
              {have.has(r.id) && (
                <>
                  <button type="button" className="icon-btn" aria-label="Play" onClick={async () => (await clipsFor(pack.pack_id, r.id)).forEach((c, i) => setTimeout(() => playBlob(c.blob), i * 1500))}>
                    ▶
                  </button>
                  <button type="button" className="icon-btn" aria-label="Delete recordings" onClick={() => deleteClips(pack.pack_id, r.id)}>
                    🗑
                  </button>
                </>
              )}
              <button type="button" className={`rec-btn ${recording === r.id ? 'on' : ''}`} onClick={() => toggle(r)} disabled={!!recording && recording !== r.id}>
                {recording === r.id ? '■' : '●'}
              </button>
            </li>,
          ];
        })}
      </ul>
    </div>
  );
}
