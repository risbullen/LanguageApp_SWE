# Språk: language-learning prototype

A prototype built from two deep-research documents on language acquisition. It teaches **Swedish** first, because you can judge the content as a native speaker. The engine itself is language-neutral, and Punjabi is just another content file (a small demo pack is included).

**Run it:** open the GitHub Pages link (Settings → Pages) in any browser, phone included. No install needed.

## What the research says, and where it is in the app

| Research principle | In the app |
|---|---|
| **Session loop**: priming → structured input → scaffolded retrieval → speaking → recast → capstone | `src/engine/session.ts` builds every session in that order |
| **No translation**: meaning comes from picture + sound, not from English | Pictures and audio only. English is used just for instructions and the scene goal |
| **Progressive disclosure**: text only after you've heard it | "Listen first" mode hides spelling until you've answered or tapped *Show* |
| **Processing Instruction (VanPatten)**: only the ending tells you the answer | "Listen to the ending" tasks (🐕 vs 🐕🐕🐕, 🐕 vs 👉🐕), with a short rule shown afterwards, never before |
| **Scaffolding**: tiles → partial cloze → speaking, no keyboard | Tile builder, ending-cloze (`hund__` → `-ar`), en/ett cloze |
| **Sticky buffer**: a failed item comes back about 4 steps later in a different format; the session can't end until it's right | `insertRetry` + `mutateForRetry` |
| **FSRS spaced repetition**, one long-term update per session, rated from response time instead of self-grading | `src/engine/scheduler.ts` (ts-fsrs) |
| **~85% success target** | Review difficulty steps up or down based on your last 20 answers |
| **HVPT (many voices)** | Rotates through all device voices, plus your own recordings (several takes per word) |
| **Immediate contrastive feedback** | After speaking: native model → your voice, plus a pitch-melody chart (YIN pitch tracker). With a native recording, the two melodies are overlaid |
| **Pitch accent / tone** | Minimal pairs: *anden* 🦆/👻, *tanken* ⛽/💭; Punjabi ਘੋੜਾ/ਕੋੜਾ |
| **Communicative capstone** | Branching micro-dialogue per unit; the other person recasts your mistakes |
| **No hearts, no streaks** | Mistakes never lock you out. Progress is shown as active days in the last 30, not a streak |
| **Script-aware typography** | Gurmukhi and Shahmukhi (RTL, Nastaliq) with their own line heights from the research |

## Not built yet (too heavy for a prototype)
- Phoneme-level pronunciation scoring (GOP with sherpa-onnx / wav2vec2) and Silero VAD. Speaking is currently ungraded: you compare by ear and by the melody chart.
- Offline neural TTS (piper). Real multi-speaker audio packs.
- SQLite storage. Progress lives in the browser (localStorage), and recordings in IndexedDB, on that device only.

## Adding or changing content
Everything language-specific lives in `src/content/packs/*.json`, validated by `src/content/schema.ts`. `npm run build` refuses to build a pack that doesn't match the schema. To make a Punjabi course, extend `pa.json` (have a native speaker check it; the demo is **not verified**).

## Development (optional)
```bash
npm install
npm run dev      # local dev server
npm test         # engine unit tests
npm run build    # validate packs + typecheck + build
```
