import { Pack, type Lexeme, type Form, type ScriptId } from './schema';
import sv from './packs/sv.json';
import pa from './packs/pa.json';

export const PACKS: Pack[] = [Pack.parse(sv), Pack.parse(pa)];

export function getPack(id: string): Pack {
  return PACKS.find((p) => p.pack_id === id) ?? PACKS[0];
}

export function lexMap(pack: Pack): Map<string, Lexeme> {
  return new Map(pack.lexicon.map((l) => [l.id, l]));
}

/** Text of a form (or anything with text/alt) in the chosen script. */
export function inScript(f: { text: string; alt?: Form['alt'] }, script: ScriptId, primary: ScriptId): string {
  if (script === primary) return f.text;
  return f.alt?.[script as 'Shahmukhi' | 'Latin'] ?? f.text;
}

export function formVisual(pack: Pack, lex: Lexeme, tag: string): string {
  return (pack.form_visuals[tag] ?? '{v}').split('{v}').join(lex.visual);
}

/** Split text into user-perceived characters (keeps Gurmukhi akhar+matra together). */
export function graphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) return [...new Seg(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => s.segment);
  return Array.from(text);
}

/** Stable id for the audio of a specific form — used as key for user recordings. */
export const audioId = (lexId: string, tag: string) => `${lexId}.${tag}`;
