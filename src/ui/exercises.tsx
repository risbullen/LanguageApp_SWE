import { useEffect, useMemo, useState } from 'react';
import type { Lexeme } from '../content/schema';
import { audioId, formVisual, graphemes, lexMap } from '../content/index';
import type { Step } from '../engine/session';
import { useApp } from '../ctx';
import { sfx } from '../audio/sfx';
import { Continue, Details, English, FaintText, Inflected, PictureSentence, ScriptText, SpeakerButton, Visual, usePlayer, useText, visualClass } from './common';

export type Done = (correct: boolean | null) => void;
type P<K extends Step['kind']> = { step: Extract<Step, { kind: K }>; onDone: Done };

function useLex() {
  const { pack } = useApp();
  return useMemo(() => lexMap(pack), [pack]);
}

const formOf = (l: Lexeme, tag: string) => l.forms.find((f) => f.tag === tag) ?? l.forms[0];

/** Shown after every scored answer: the correct form, heard again (immediate recast). */
function Reveal({ lex, tag, correct, onDone, extra }: { lex: Lexeme; tag: string; correct: boolean; onDone: Done; extra?: React.ReactNode }) {
  const { pack, script } = useApp();
  const t = useText();
  const f = formOf(lex, tag);
  useEffect(() => {
    if (correct) sfx.correct();
  }, [correct]);
  return (
    <>
      <div className={`reveal ${correct ? 'good' : 'fix'}`} role="status">
        <div className="reveal-head">{correct ? 'Yes!' : 'This one:'}</div>
        {f.parts && script === pack.script_metadata.primary_script ? (
          <div className="reveal-body">
            <PictureSentence parts={f.parts} />
            <SpeakerButton audioId={audioId(lex.id, tag)} text={f.text} auto />
          </div>
        ) : (
          <div className="reveal-body">
            <span className="reveal-visual" aria-hidden="true">
              {formVisual(pack, lex, tag)}
            </span>
            <Inflected text={t(f)} stem={script === pack.script_metadata.primary_script && f !== lex.forms[0] ? f.stem : undefined} script={script} />
            <SpeakerButton audioId={audioId(lex.id, tag)} text={f.text} auto />
          </div>
        )}
        <English text={f.en} />
        <Details lex={lex} form={f} />
        {extra}
      </div>
      <Continue onClick={() => onDone(correct)} tone={correct ? 'good' : 'fix'} />
    </>
  );
}

/* ───────────── 1 · Priming: just listen and look ───────────── */
export function Prime({ step, onDone }: P<'prime'>) {
  const lex = useLex();
  const { pack, settings, script } = useApp();
  const t = useText();
  const [i, setI] = useState(0);
  const [showText, setShowText] = useState(settings.mode === 'analytical');
  const l = lex.get(step.lexIds[i])!;
  const f = l.forms[0];
  useEffect(() => setShowText(settings.mode === 'analytical'), [i, settings.mode]);
  return (
    <div className="exercise">
      <p className="instruction">Listen and look. Nothing to answer yet.</p>
      <div className="card prime" key={l.id}>
        <Visual>{formVisual(pack, l, f.tag)}</Visual>
        <SpeakerButton audioId={audioId(l.id, f.tag)} text={f.text} auto />
        {showText ? (
          <>
            {f.parts && script === pack.script_metadata.primary_script ? (
              <PictureSentence parts={f.parts} />
            ) : (
              <ScriptText script={script} big>
                {t(f)}
              </ScriptText>
            )}
            <English text={f.en} />
            <Details lex={l} form={f} />
          </>
        ) : (
          <FaintText text={t(f)} onReveal={() => setShowText(true)} />
        )}
      </div>
      <div className="dots" aria-label={`${i + 1} of ${step.lexIds.length}`}>
        {step.lexIds.map((id, k) => (
          <span key={id} className={k <= i ? 'on' : ''} />
        ))}
      </div>
      <Continue onClick={() => (i + 1 < step.lexIds.length ? setI(i + 1) : onDone(null))} label={i + 1 < step.lexIds.length ? 'Next' : 'Start practising'} />
    </div>
  );
}

/* ───────────── 2 · Referential: hear → pick the picture ───────────── */
export function ListenPick({ step, onDone }: P<'listen_pick'>) {
  const lex = useLex();
  const { pack, settings, script } = useApp();
  const t = useText();
  const target = lex.get(step.lexId)!;
  const f = formOf(target, step.tag);
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="exercise">
      <p className="instruction">Which one do you hear?</p>
      <div className="center">
        <SpeakerButton audioId={audioId(target.id, f.tag)} text={f.text} auto />
      </div>
      <div className="grid-options">
        {step.options.map((id) => {
          const l = lex.get(id)!;
          const state = picked && (id === step.lexId ? 'right' : id === picked ? 'wrong' : 'dim');
          return (
            <button type="button" key={id} className={`option pic ${visualClass(formVisual(pack, l, l.forms[0].tag))} ${state || ''}`} disabled={!!picked} onClick={() => setPicked(id)}>
              {formVisual(pack, l, l.forms[0].tag)}
              <span className={`faint ${settings.mode === 'analytical' ? 'full' : ''}`}>
                <ScriptText script={script}>{t(l.forms[0])}</ScriptText>
              </span>
            </button>
          );
        })}
      </div>
      {picked && <Reveal lex={target} tag={f.tag} correct={picked === step.lexId} onDone={onDone} />}
    </div>
  );
}

/* ───────────── 2b · Structured input: only the ending tells you ───────────── */
export function Structured({ step, onDone }: P<'structured'>) {
  const lex = useLex();
  const { pack } = useApp();
  const l = lex.get(step.lexId)!;
  const tag = step.tags[step.answer];
  const f = formOf(l, tag);
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className="exercise">
      <p className="instruction">Listen to the ending. Which picture matches?</p>
      <div className="center">
        <SpeakerButton audioId={audioId(l.id, tag)} text={f.text} auto />
      </div>
      <div className="grid-options two">
        {step.tags.map((t, k) => {
          const state = picked !== null && (k === step.answer ? 'right' : k === picked ? 'wrong' : 'dim');
          return (
            <button type="button" key={t} className={`option pic ${state || ''}`} disabled={picked !== null} onClick={() => setPicked(k)}>
              {formVisual(pack, l, t)}
            </button>
          );
        })}
      </div>
      {picked !== null && <Reveal lex={l} tag={tag} correct={picked === step.answer} onDone={onDone} />}
    </div>
  );
}

/* ───────────── Micro-rule, revealed after the learner has met the pattern ───────────── */
export function Rule({ step, onDone }: P<'rule'>) {
  const { pack, script } = useApp();
  const lex = useLex();
  const t = useText();
  const unit = pack.units.find((u) => u.id === step.unitId)!;
  const gf = unit.grammar_focus;
  if (!gf)
    return (
      <div className="exercise">
        <p className="instruction">A quick tip.</p>
        <div className="card rule">
          <p>{unit.tip}</p>
        </div>
        <Continue onClick={() => onDone(null)} label="Got it" />
      </div>
    );
  const examples = unit.lexicon_ids
    .map((id) => lex.get(id)!)
    .filter((l) => gf.contrast.every((tag) => l.forms.some((f) => f.tag === tag)))
    .slice(0, 3);
  const showStem = script === pack.script_metadata.primary_script;
  return (
    <div className="exercise">
      <p className="instruction">You've been hearing a pattern.</p>
      <div className="card rule">
        <p>{gf.rule}</p>
        <table>
          <tbody>
            {examples.map((l) => (
              <tr key={l.id}>
                {gf.contrast.map((tag) => {
                  const f = formOf(l, tag);
                  return (
                    <td key={tag}>
                      <span className="mini-visual" aria-hidden="true">
                        {formVisual(pack, l, tag)}
                      </span>
                      <Inflected text={t(f)} stem={showStem ? f.stem : undefined} script={script} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Continue onClick={() => onDone(null)} label="Got it" />
    </div>
  );
}

/* ───────────── Minimal pair: word accent / tone discrimination ───────────── */
export function MinimalPair({ step, onDone }: P<'minimal_pair'>) {
  const { pack, script } = useApp();
  const t = useText();
  const unit = pack.units.find((u) => u.minimal_pairs?.[step.pair] && u.id === step.unitId) ?? pack.units.find((u) => u.minimal_pairs);
  const pair = unit!.minimal_pairs![step.pair];
  const target = pair[step.answer];
  const [picked, setPicked] = useState<number | null>(null);
  const { play } = usePlayer();
  return (
    <div className="exercise">
      <p className="instruction">Same letters, different melody. Which one is it?</p>
      <div className="center">
        <SpeakerButton audioId={target.id} text={target.text} auto />
      </div>
      <div className="grid-options two">
        {pair.map((side, k) => {
          const state = picked !== null && (k === step.answer ? 'right' : k === picked ? 'wrong' : 'dim');
          return (
            <button type="button" key={side.id} className={`option pic ${state || ''}`} disabled={picked !== null} onClick={() => setPicked(k)}>
              {side.visual}
              {picked !== null && <small>{side.label}</small>}
            </button>
          );
        })}
      </div>
      <p className="hint">Browser voices often get word melody wrong. For this drill, record a native speaker under Recordings.</p>
      {picked !== null && (
        <>
          <div className={`reveal ${picked === step.answer ? 'good' : 'fix'}`} role="status">
            <div className="reveal-head">{picked === step.answer ? 'Yes!' : 'Listen to both:'}</div>
            <div className="pair-compare">
              {pair.map((side) => (
                <button type="button" key={side.id} className="pair-btn" onClick={() => play(side.id, side.text)}>
                  <span aria-hidden="true">{side.visual}</span>
                  <ScriptText script={script}>{t(side)}</ScriptText>
                  <small>{side.label}</small>
                </button>
              ))}
            </div>
          </div>
          <Continue onClick={() => onDone(picked === step.answer)} tone={picked === step.answer ? 'good' : 'fix'} />
        </>
      )}
    </div>
  );
}

/* ───────────── 3 · Tile scramble: build the word, no keyboard ───────────── */
export function Tiles({ step, onDone }: P<'tiles'>) {
  const { pack, script } = useApp();
  const lex = useLex();
  const t = useText();
  const l = lex.get(step.lexId)!;
  const f = formOf(l, step.tag);
  // phrases are built from word tiles (sentence builder), single words from letters
  const wordMode = t(f).trim().includes(' ');
  const split = (s: string) => (wordMode ? s.trim().split(/\s+/) : graphemes(s));
  const target = useMemo(() => split(t(f)), [f, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const tiles = useMemo(() => {
    // distractors: pieces of other words/phrases in the pack that aren't in this one
    const pool = new Set<string>();
    const lower = new Set(target.map((x) => x.toLowerCase()));
    for (const o of pack.lexicon)
      if (o.id !== l.id && (o.pos === 'phrase') === (l.pos === 'phrase'))
        for (const g of split(t(o.forms[0]))) if (!lower.has(g.toLowerCase())) pool.add(g);
    const extra = [...pool].sort(() => Math.random() - 0.5).slice(0, wordMode ? 1 : 2);
    return [...target, ...extra].map((g, i) => ({ g, i })).sort(() => Math.random() - 0.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.key]);
  const [placed, setPlaced] = useState<number[]>([]);
  const [result, setResult] = useState<boolean | null>(null);

  const tap = (i: number) => {
    if (result !== null) return;
    const next = [...placed, i];
    setPlaced(next);
    if (next.length === target.length) {
      const sep = wordMode ? ' ' : '';
      const word = next.map((k) => tiles.find((x) => x.i === k)!.g).join(sep);
      setResult(word === target.join(sep));
    }
  };
  const unplace = (k: number) => result === null && setPlaced(placed.filter((_, idx) => idx !== k));

  return (
    <div className="exercise">
      <p className="instruction">{wordMode ? 'Put the words in order.' : 'Build the word.'}</p>
      <div className="center">
        <Visual size="lg">{formVisual(pack, l, step.tag)}</Visual>
        <SpeakerButton audioId={audioId(l.id, step.tag)} text={f.text} />
      </div>
      <div className={`slots ${wordMode ? "words" : ""}`} data-script={script} dir={script === 'Shahmukhi' ? 'rtl' : 'ltr'}>
        {target.map((_, k) => {
          const tile = placed[k] !== undefined ? tiles.find((x) => x.i === placed[k]) : undefined;
          return (
            <button type="button" key={k} className={`slot ${tile ? 'filled' : ''}`} onClick={() => tile && unplace(k)} disabled={!tile || result !== null}>
              <ScriptText script={script}>{tile?.g ?? ''}</ScriptText>
            </button>
          );
        })}
      </div>
      <div className="tiles" dir={script === 'Shahmukhi' ? 'rtl' : 'ltr'}>
        {tiles.map(({ g, i }) => (
          <button type="button" key={i} className="tile" disabled={placed.includes(i) || result !== null} onClick={() => tap(i)}>
            <ScriptText script={script}>{g}</ScriptText>
          </button>
        ))}
      </div>
      {result !== null && <Reveal lex={l} tag={step.tag} correct={result} onDone={onDone} />}
    </div>
  );
}

/* ───────────── 3b · Morphological cloze: only the ending is missing ───────────── */
export function Cloze({ step, onDone }: P<'cloze'>) {
  const { pack, script } = useApp();
  const lex = useLex();
  const l = lex.get(step.lexId)!;
  const f = formOf(l, step.tag);
  const stem = [...f.text].slice(0, f.stem).join('');
  const right = [...f.text].slice(f.stem).join('');
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="exercise">
      <p className="instruction">Finish the word so it matches the picture.</p>
      <div className="center">
        <Visual size="lg">{formVisual(pack, l, step.tag)}</Visual>
        <div className="cloze-line">
          <ScriptText script={script} big>
            {stem}
            <span className="blank">{picked ?? '   '}</span>
          </ScriptText>
        </div>
      </div>
      <div className="row-options">
        {step.options.map((o) => {
          const state = picked && (o === right ? 'right' : o === picked ? 'wrong' : 'dim');
          return (
            <button type="button" key={o} className={`option chip ${state || ''}`} disabled={!!picked} onClick={() => setPicked(o)}>
              <ScriptText script={script}>-{o}</ScriptText>
            </button>
          );
        })}
      </div>
      {picked && <Reveal lex={l} tag={step.tag} correct={picked === right} onDone={onDone} />}
    </div>
  );
}

/* ───────────── 3c · Article cloze (en / ett) ───────────── */
export function Article({ step, onDone }: P<'article'>) {
  const { pack, script } = useApp();
  const lex = useLex();
  const l = lex.get(step.lexId)!;
  const f = l.forms[0];
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="exercise">
      <p className="instruction">Which little word goes in front?</p>
      <div className="center">
        <Visual size="lg">{formVisual(pack, l, f.tag)}</Visual>
        <div className="cloze-line">
          <ScriptText script={script} big>
            <span className="blank">{picked ?? '   '}</span> {f.text}
          </ScriptText>
        </div>
      </div>
      <div className="row-options">
        {step.options.map((o) => {
          const state = picked && (o === l.article ? 'right' : o === picked ? 'wrong' : 'dim');
          return (
            <button type="button" key={o} className={`option chip ${state || ''}`} disabled={!!picked} onClick={() => setPicked(o)}>
              {o}
            </button>
          );
        })}
      </div>
      {picked && (
        <Reveal
          lex={l}
          tag={f.tag}
          correct={picked === l.article}
          onDone={onDone}
          extra={
            <p className="note">
              <strong>
                {l.article} {f.text}
              </strong>
            </p>
          }
        />
      )}
    </div>
  );
}
