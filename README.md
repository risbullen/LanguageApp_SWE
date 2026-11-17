# SvenskaKul: language-learning prototype

A prototype built from two deep-research documents on language acquisition. It teaches **Swedish** first, because you can judge the content as a native speaker. The engine itself is language-neutral, and Punjabi is just another content file (a small demo pack is included).

**Run it:** https://risbullen.github.io/LanguageApp_SWE/ in any browser, phone included. To get an app icon: in the browser menu choose *Add to Home Screen* (iPhone: Share → Add to Home Screen). It then works offline too.

## Courses
| Course | Level | Content |
|---|---|---|
| 🌱 Grunderna | Basics | Fika, Djur, Hemma, Familj: 24 nouns, en/ett, plural and "the" endings |
| ⏪ Igår & idag | Intermediate | Verbs now vs. past (äter/åt, dansar/dansade…), opinions and feelings |
| 🔥 Svenska på riktigt | Hard | Verb-second word order (sentence builder), idioms, casual spoken Swedish. Text hidden, full speed |
| 🛍️ Mini-courses | Shop (coins) | 👵 Svärmor · 🎵 Barnsånger (Imse vimse spindel, Bä bä vita lamm) · ❤️ Kärleksord · 🤡 Roliga ord · 🍓 Midsommar |

Every lesson ends with a short conversation using words you just learnt; recurring characters (Bosse the barista, Birgitta the mother-in-law…) keep it feeling real. Coins: start with 150, +10 per session, +5 per conversation. No streaks, no hearts.

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
| **Immediate contrastive feedback** | Push-to-talk: after you speak, you hear the native model, then your own attempt (kept in memory only, never stored) |
| **Pitch accent / tone** | Minimal pairs (*anden* 🦆/👻, Punjabi ਘੋੜਾ/ਕੋੜਾ) run **only with real recordings**: text-to-speech pronounces both sides identically, so a TTS drill would teach nothing |
| **Communicative tasks** | Short conversations using only words you know (mid-session and at the end), plus a capstone conversation once the whole unit is known. Answer by speaking or tapping; the other person recasts your mistakes |
| **No hearts, no streaks** | Mistakes never lock you out. Light XP/levels; activity shown as active days in the last 30, not a streak |
| **Script-aware typography** | Gurmukhi and Shahmukhi (RTL, Nastaliq) with their own line heights from the research |

## Voice and speech
- **Google Cloud voices (optional, recommended):** add the GitHub secret `GOOGLE_TTS_API_KEY` and the deploy generates every line with 4 Google Chirp 3 HD voices (2 female, 2 male) instead of Piper. A full run is ~31k characters, inside Google's free monthly tier; cached, so only new lines are ever billed.
- **Voice:** pre-generated audio files first (made with **Piper**, free and offline, several Swedish speakers, generated in the deploy workflow by `scripts/gen_audio.py`), then Google Translate's voice online, then a device voice *only* if it is really Swedish. An English voice never reads Swedish; if no voice is available a warning shows instead.
- **Push-to-talk:** hold the mic button and speak (or tap once; it stops when you go quiet). Uses the browser's speech recognition, so it works best in Chrome. It checks that you were *understood*, not your accent: speech-to-text auto-corrects towards real words.

## Not built yet
- **Accent scoring:** Microsoft Azure Pronunciation Assessment (acoustic, phoneme-level; not an LLM) is the best ready-made candidate. Needs a paid key and a small backend.
- **Punjabi audio:** Piper has no Punjabi voice; AI4Bharat Indic-Speak is the candidate. Aksharamukha for Gurmukhi↔Shahmukhi conversion.
- Real recordings for tone/accent pairs. Real payments. Sync between devices (progress lives in the browser).

## Tools considered and skipped
Full-stack Duolingo clones (Next.js + Postgres + auth + Stripe): too heavy for a local-first prototype; we borrowed their course/unit and shop patterns instead. AI voice tutors and LLM prompt kits: no AI engine by design. SM-2 schedulers: FSRS is better and already in use.

## Adding or changing content
Everything language-specific lives in `src/content/packs/*.json`, validated by `src/content/schema.ts`. `npm run build` refuses to build a pack that doesn't match the schema. To make a Punjabi course, extend `pa.json` (have a native speaker check it; the demo is **not verified**).

## Curriculum
`docs/curriculum-prompt.md` is a ready prompt for Gemini Deep Research: a language-neutral, CEFR-anchored curriculum that each language pack fills in with its own words, grammar and culture.

## Development (optional)
```bash
npm install
npm run dev      # local dev server
npm test         # engine unit tests
npm run build    # validate packs + typecheck + build
```
