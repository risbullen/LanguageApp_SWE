import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Form, Lexeme, ScriptId } from '../content/schema';
import { inScript } from '../content/index';
import { speak, stopSpeaking } from '../audio/tts';
import { listen, recognitionSupported, type ListenResult } from '../audio/listen';
import { useApp } from '../ctx';

/** Text in a target-language script, with the right direction, font and line height. */
export function ScriptText({
  children,
  script,
  className = '',
  big,
}: {
  children: ReactNode;
  script: ScriptId;
  className?: string;
  big?: boolean;
}) {
  return (
    <span
      className={`script-text ${big ? 'big' : ''} ${className}`}
      data-script={script}
      dir={script === 'Shahmukhi' ? 'rtl' : 'ltr'}
      lang={script === 'Gurmukhi' ? 'pa-Guru' : script === 'Shahmukhi' ? 'pa-Arab' : undefined}
    >
      {children}
    </span>
  );
}

/** Returns a function that plays an item and a flag for "currently playing". */
export function usePlayer() {
  const { pack, settings } = useApp();
  const [playing, setPlaying] = useState(false);
  // audioId is kept as a stable key for future recorded audio packs
  const play = async (_audioId: string, text: string) => {
    setPlaying(true);
    try {
      await speak(text, pack.tts_lang, { rate: settings.rate });
    } finally {
      setPlaying(false);
    }
  };
  return { play, playing };
}

export function SpeakerButton({ audioId, text, auto, label }: { audioId: string; text: string; auto?: boolean; label?: string }) {
  const { play, playing } = usePlayer();
  const done = useRef(false);
  useEffect(() => {
    if (auto && !done.current) {
      done.current = true;
      const t = setTimeout(() => play(audioId, text), 250);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioId, auto]);
  return (
    <button
      type="button"
      className={`speaker ${playing ? 'playing' : ''}`}
      onClick={() => play(audioId, text)}
      aria-label={label ?? 'Listen'}
    >
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
        <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/** Written form in the learner's chosen script. */
export function useText() {
  const { pack, script } = useApp();
  return (f: { text: string; alt?: Form['alt'] }) => inScript(f, script, pack.script_metadata.primary_script);
}

/** Extra layer shown only on demand: transliteration + IPA + notes (progressive disclosure). */
export function Details({ lex, form }: { lex?: Lexeme; form: { text: string; alt?: Form['alt']; ipa?: string } }) {
  const { settings, pack } = useApp();
  const [open, setOpen] = useState(settings.mode === 'analytical');
  const latin = pack.script_metadata.primary_script !== 'Latin' ? form.alt?.Latin : undefined;
  const ipa = form.ipa ?? lex?.forms[0].ipa;
  if (!latin && !ipa && !lex?.note && !lex?.prosodic_class) return null;
  if (!open)
    return (
      <button type="button" className="link" onClick={() => setOpen(true)}>
        How it sounds
      </button>
    );
  return (
    <div className="details">
      {latin && <span className="translit">{latin}</span>}
      {ipa && <span className="ipa">{ipa}</span>}
      {lex?.prosodic_class && <span className="tag">{lex.prosodic_class.replace('_', ' ')}</span>}
      {lex?.note && <p className="note">{lex.note}</p>}
    </div>
  );
}

export function Visual({ children, size = 'xl' }: { children: ReactNode; size?: 'xl' | 'lg' | 'md' }) {
  return (
    <div className={`visual visual-${size}`} aria-hidden="true">
      {children}
    </div>
  );
}

export function Continue({ onClick, label = 'Continue', tone }: { onClick: () => void; label?: string; tone?: 'good' | 'fix' }) {
  return (
    <div className={`continue-bar ${tone ?? ''}`}>
      <button type="button" className="primary" onClick={onClick} autoFocus>
        {label}
      </button>
    </div>
  );
}

/** Highlight the inflection ("bent form") after the stem. */
export function Inflected({ text, stem, script }: { text: string; stem?: number; script: ScriptId }) {
  const chars = [...text];
  if (stem === undefined || stem >= chars.length) return <ScriptText script={script}>{text}</ScriptText>;
  return (
    <ScriptText script={script}>
      {chars.slice(0, stem).join('')}
      <mark>{chars.slice(stem).join('')}</mark>
    </ScriptText>
  );
}

const BADGES: Record<string, [string, string]> = {
  prime: ['Listen', 'blue'],
  listen_pick: ['Listen & choose', 'yellow'],
  structured: ['Listen to the ending', 'yellow'],
  rule: ['Pattern', 'purple'],
  minimal_pair: ['Word melody', 'purple'],
  tiles: ['Build the word', 'blue'],
  cloze: ['Finish the word', 'purple'],
  article: ['En or ett?', 'purple'],
  speak: ['Say it', 'green'],
  dialogue: ['Conversation', 'green'],
};
export function Badge({ kind, retry }: { kind: string; retry?: boolean }) {
  const [label, tone] = BADGES[kind] ?? [kind, 'blue'];
  return (
    <div className="badges">
      <span className={`badge ${tone}`}>{label}</span>
      {retry && <span className="badge amber">Again</span>}
    </div>
  );
}

/**
 * Push-to-talk. Hold to speak and release to finish, or tap once to start (it stops by
 * itself when you go quiet; tap again to stop early).
 */
export function PushToTalk({
  onResult,
  label = 'Hold to talk',
  compact,
}: {
  onResult: (r: ListenResult) => void;
  label?: string;
  compact?: boolean;
}) {
  const { pack } = useApp();
  const [state, setState] = useState<'idle' | 'listening' | 'thinking'>('idle');
  const [partial, setPartial] = useState('');
  const session = useRef<ReturnType<typeof listen> | null>(null);
  const pressedAt = useRef(0);
  const holdMode = useRef(false);

  useEffect(() => () => session.current?.stop(), []);

  if (!recognitionSupported()) return null;

  const begin = () => {
    stopSpeaking();
    setPartial('');
    setState('listening');
    const s = listen(pack.tts_lang, setPartial);
    session.current = s;
    s.result.then((r) => {
      if (session.current !== s) return;
      session.current = null;
      setState('idle');
      onResult(r);
    });
  };
  const end = () => {
    if (!session.current) return;
    setState('thinking');
    session.current.stop();
  };

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    if (state === 'listening') {
      // second tap in tap-mode
      holdMode.current = false;
      return end();
    }
    if (state !== 'idle') return;
    pressedAt.current = Date.now();
    holdMode.current = true;
    begin();
  };
  const up = () => {
    if (!holdMode.current) return;
    holdMode.current = false;
    // a long press = push-to-talk; a short tap keeps listening until silence
    if (Date.now() - pressedAt.current > 400) end();
  };

  return (
    <div className={`ptt ${compact ? 'compact' : ''}`}>
      <button
        type="button"
        className={`ptt-btn ${state}`}
        onPointerDown={down}
        onPointerUp={up}
        onPointerLeave={up}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && state === 'idle') {
            e.preventDefault();
            begin();
          }
        }}
        aria-label={state === 'listening' ? 'Listening. Release or tap to stop' : label}
      >
        <svg viewBox="0 0 24 24" width={compact ? 26 : 40} height={compact ? 26 : 40} aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      <span className="ptt-label" aria-live="polite">
        {state === 'listening' ? partial || 'Listening…' : state === 'thinking' ? 'One moment…' : label}
      </span>
    </div>
  );
}
