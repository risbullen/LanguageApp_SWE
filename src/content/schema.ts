import { z } from 'zod';

/**
 * Universal language content pack.
 * Simplified from the research "UniversalLanguageContentPack" schema: one engine,
 * many languages. Everything language-specific lives in the pack, never in code.
 */

export const ScriptId = z.enum(['Latin', 'Gurmukhi', 'Shahmukhi']);
export type ScriptId = z.infer<typeof ScriptId>;

/** A written form: canonical text in the pack's primary script, plus optional alternates. */
const Form = z.object({
  tag: z.string(), // e.g. indef_sg, def_sg, indef_pl, def_pl, direct_sg, oblique_sg
  text: z.string(), // primary script
  alt: z
    .object({
      Shahmukhi: z.string().optional(),
      Latin: z.string().optional(), // pedagogical transliteration
    })
    .partial()
    .optional(),
  ipa: z.string().optional(),
  /** Length (in grapheme clusters) of the stem; the rest is the inflection ("bent form"). */
  stem: z.number().int().nonnegative().optional(),
});
export type Form = z.infer<typeof Form>;

const Lexeme = z.object({
  id: z.string(),
  visual: z.string(), // emoji / image key — meaning comes from this, never from an L1 gloss
  pos: z.enum(['noun', 'verb', 'adjective', 'phrase', 'particle', 'pronoun', 'adverb']),
  gender: z.string().optional(),
  article: z.string().optional(), // e.g. "en" / "ett"
  forms: z.array(Form).min(1),
  prosodic_class: z
    .enum(['accent_1', 'accent_2', 'level', 'low_rising', 'high_falling'])
    .optional(),
  note: z.string().optional(), // analytical-mode only
});
export type Lexeme = z.infer<typeof Lexeme>;

const MinimalPairSide = z.object({
  id: z.string(),
  text: z.string(),
  alt: Form.shape.alt,
  visual: z.string(),
  label: z.string(), // e.g. "Accent 1", "low-rising tone"
});

const DialogueChoice = z.object({
  text: z.string(),
  alt: Form.shape.alt,
  next: z.string().nullable(), // null = dialogue ends
  /** ok = pragmatically appropriate; "meh" = understood but off; "no" = breaks the exchange */
  fit: z.enum(['ok', 'meh', 'no']),
  feedback: z.string().optional(), // English UI explanation, shown after choice
  recast: z.string().optional(), // interlocutor's corrective recast in target language
});

const DialogueNode = z.object({
  id: z.string(),
  speaker: z.string(), // emoji of interlocutor
  visual: z.string().optional(), // what the speaker is pointing at / showing
  line: z.string(),
  alt: Form.shape.alt,
  choices: z.array(DialogueChoice).min(1),
});

const Dialogue = z.object({
  scene: z.string(), // English goal for the task, e.g. "You're at a café"
  start: z.string(),
  nodes: z.array(DialogueNode).min(1),
});
export type Dialogue = z.infer<typeof Dialogue>;

const Unit = z.object({
  id: z.string(),
  title: z.string(),
  visual: z.string(),
  lexicon_ids: z.array(z.string()).min(1),
  grammar_focus: z
    .object({
      contrast: z.tuple([z.string(), z.string()]), // two form tags to contrast
      rule: z.string(), // micro-rule revealed AFTER structured input, never before
    })
    .optional(),
  article_cloze: z.boolean().optional(), // drill the article (en/ett) as a cloze
  minimal_pairs: z.array(z.tuple([MinimalPairSide, MinimalPairSide])).optional(),
  /** Capstone: needs every word of the unit. */
  dialogue: Dialogue.optional(),
  /** Short conversations that only need a few words — used mid-session and early on. */
  mini_dialogues: z.array(Dialogue.extend({ id: z.string(), requires: z.array(z.string()).min(1) })).optional(),
});
export type Unit = z.infer<typeof Unit>;

export const Pack = z
  .object({
    pack_id: z.string().regex(/^[a-z]{2,3}-[a-z]{2,3}-\d+\.\d+\.\d+$/),
    name: z.string(),
    flag: z.string(),
    source_language: z.string(),
    target_language: z.string(),
    tts_lang: z.string(), // BCP-47 for speechSynthesis, e.g. sv-SE
    verified_by_native: z.boolean(),
    script_metadata: z.object({
      primary_script: ScriptId,
      supported_scripts: z.array(ScriptId).min(1),
      has_pitch_or_tone: z.boolean(),
      tone_type: z.enum(['none', 'lexical_pitch_accent', 'contour_tone']),
    }),
    /** How each form tag is shown visually, with {v} replaced by the lexeme visual. */
    form_visuals: z.record(z.string(), z.string()),
    lexicon: z.array(Lexeme).min(1),
    units: z.array(Unit).min(1),
  })
  .superRefine((pack, ctx) => {
    const ids = new Set(pack.lexicon.map((l) => l.id));
    if (ids.size !== pack.lexicon.length) ctx.addIssue({ code: 'custom', message: 'duplicate lexeme id' });
    for (const u of pack.units) {
      for (const id of u.lexicon_ids)
        if (!ids.has(id)) ctx.addIssue({ code: 'custom', message: `unit ${u.id}: unknown lexeme ${id}` });
      if (u.grammar_focus)
        for (const tag of u.grammar_focus.contrast)
          if (!pack.form_visuals[tag])
            ctx.addIssue({ code: 'custom', message: `unit ${u.id}: no form_visual for ${tag}` });
      const dialogues = [...(u.dialogue ? [{ id: 'capstone', ...u.dialogue }] : []), ...(u.mini_dialogues ?? [])];
      for (const d of dialogues) {
        const nodeIds = new Set(d.nodes.map((n) => n.id));
        if (!nodeIds.has(d.start)) ctx.addIssue({ code: 'custom', message: `unit ${u.id}/${d.id}: dialogue start missing` });
        for (const n of d.nodes)
          for (const c of n.choices)
            if (c.next && !nodeIds.has(c.next))
              ctx.addIssue({ code: 'custom', message: `unit ${u.id}/${d.id}: bad dialogue link ${c.next}` });
        for (const id of ('requires' in d ? (d.requires as string[]) : []))
          if (!ids.has(id)) ctx.addIssue({ code: 'custom', message: `unit ${u.id}/${d.id}: unknown required word ${id}` });
      }
    }
    for (const l of pack.lexicon)
      for (const f of l.forms)
        if (!pack.form_visuals[f.tag])
          ctx.addIssue({ code: 'custom', message: `lexeme ${l.id}: no form_visual for ${f.tag}` });
  });
export type Pack = z.infer<typeof Pack>;
