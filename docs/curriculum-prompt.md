# Prompt for Gemini Deep Research: a language-neutral curriculum

Paste everything below the line into Gemini Deep Research. The output is designed to map 1:1 onto
this app's content packs (`src/content/packs/*.json`): one curriculum, instantiated per language
(Swedish first, then Punjabi), with the same communicative goals but language-specific words,
grammar and culture.

---

I am building a language-learning app for adult English speakers. The same curriculum skeleton
must work for any target language (first Swedish, then Punjabi). Each language fills it in with
its own words, grammar and cultural context. Please research and design that skeleton.

**Ground it in existing standards, don't invent from scratch:**
- CEFR Companion Volume (2020) "can-do" descriptors, levels A1 → C1.
- The Council of Europe functional-notional syllabi: *Breakthrough*, *Waystage* (A2) and *Threshold* (B1).
  These list language functions and notions independent of any language.
- Frequency-based core vocabulary research (e.g. the Kelly project word lists, which exist for Swedish
  with CEFR levels; and general findings on the 1,000–3,000 most frequent words).
- Task-Based Language Teaching and Processing Instruction (VanPatten) for how grammar is introduced:
  grammar is woven into conversation from the start through meaning-based input, never taught as
  upfront tables.

**Order of the curriculum (my starting idea; challenge it with evidence):**
1. Survival conversation (greetings, food, family, home, shopping, directions)
2. Grammar made explicit, but only for patterns already met in conversation
3. Short fiction / graded readers and stories
4. News and factual texts (simplified, then authentic)
5. Advanced: opinions, debate, work, culture, humour, idioms, regional variety

**For every unit, give:**
| field | meaning |
|---|---|
| `id`, `level` | e.g. `A1.03`, CEFR level |
| `title` | short, situation-based ("At the café") |
| `can_do` | 1–2 CEFR-style can-do statements |
| `situation` | where the conversation happens, who with (recurring characters welcome) |
| `functions` | communicative functions (greet, order, refuse politely, describe the past…) |
| `notions` | general notions (time, quantity, location…) |
| `grammar_focus` | at most one new pattern, phrased language-neutrally ("past vs present of common verbs", "definiteness", "politeness register") |
| `vocab_domains` | semantic fields + approximate count of new words (6–10 per unit) |
| `dialogues` | 2–3 short dialogue *outlines* (turns, intents, possible wrong-but-understandable replies) |
| `culture` | one cultural point to localise per language |
| `review_of` | earlier units whose words/patterns are recycled |

**Also deliver:**
- ~40 units for A1–A2 in full detail, and outlines for B1–C1.
- A justification of the sequence with sources (why this order, how often to recycle, unit size).
- How the same unit should be adapted for a tonal, two-script language like Punjabi
  (Gurmukhi + Shahmukhi; formal/informal pronouns ਤੂੰ/ਤੁਸੀਂ/ਆਪ) versus Swedish (pitch accent, en/ett, V2 word order).
- Ideas for short "mini-courses" outside the main path (in-laws, baby songs, romance, holidays, humour).
- Output the unit table as JSON (array of objects with the fields above) at the end.
