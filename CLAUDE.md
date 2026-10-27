# Kriah Listener

Built for the Meta Global AI Developer Hackathon, Oct 26 to Nov 4, 2026. Indie Developer track, solo entrant. All work in this repo starts Oct 26, 2026. Nothing is copied from earlier projects.

## What it is

A classroom reading station. A child reads one line of Hebrew with nekudos from the screen. Meta's model hears the sounds without seeing the line. A rulebook knows what every letter and vowel should sound like. A grader compares the two pair by pair and marks every letter and vowel: right, wrong letter, wrong vowel, skipped, extra. A coach picks the next set of lines, harder or easier, inside guardrails. Teachers get where each child is holding, groups by skill, and targeted practice.

## Non-negotiables

- The ear never sees the text it is grading. It receives audio and a sound alphabet and returns syllables. Nothing else.
- No model ever writes Hebrew that a child reads. Every item a child sees comes from the rulebook and the item bank.
- Standard tier only. Never use a model ID ending in `-contributor`. The station and server grade children's audio in memory and drop it without writing it to disk or logs. Saved data includes first names, avatars, presets, progress profiles, per-letter and vowel read history, stars and turn summaries, but no audio, transcripts or coach reasons.
- API keys live in `.env`, which is gitignored. This repo is public. Never log a key, never ship one in client code, never paste one in a commit or an issue.
- No chat UI anywhere. No free-text AI feedback shown to children, teachers, or parents. Parent and child messages are templates filled from verdicts.
- The ear is tradition-agnostic. It reports raw sounds. The grader applies the child's pronunciation preset.

## Models

| Job | Model ID | Host |
| --- | --- | --- |
| The ear | `meta-models/muse-spark-open-1026` | Baseten, OpenAI-compatible, base URL `https://inference.baseten.co/v1` |
| The ear, fallback | `muse-wonder-1.0` | Meta Model API |
| The coach | `muse-spark-1.3` | Meta Model API |

Muse Wonder 1.0 through the Meta Model API has run as the ear on synthetic clips and, on 2026-10-27, on Levi's adult clips, where it wrote Israeli vowels for an Ashkenazi reading. Muse Spark Open through Baseten ran once on the same adult clips and did worse (docs/ear-test.md). The coach ran live through the server on 2026-10-26 (docs/live-run.md) after max_tokens went to 16000 with minimal reasoning.

Notes on Spark Open: it always reasons. The reasoning comes back in `reasoning_content`, the answer in `content`. `max_tokens` caps both together, so keep it high. There is no JSON mode; ask for one line per word and parse. Audio goes in as an `audio_url` content part, as a `data:` URL. The client accepts WAV, MP3, FLAC, OGG, or M4A, up to 25 MiB per file. Audio is billed as input tokens.

## Layout

- `rulebook/` Pure functions, no network. `expectedSounds(word, preset)` returns the letter-vowel pairs of a word with the accepted sounds for each. `tagSkills(word)` returns the skills a word exercises. Presets: `sephardi`, `ashkenazi`, `chassidish`. Each preset maps every vowel to a set of accepted sounds (Ashkenazi cholam accepts `o`, `oy`, `ey`; Chassidish kamatz also accepts `u`). Grammar-dependent cases (kamatz katan, sheva na versus nach) are flagged, and the grader accepts either reading for them.
- `bank/` The item generator. Levels: 1 letters with vowels, 2 syllables, 3 words, 4 nonsense words, 5 phrases, 6 fluency. Real words come from siddur text. Nonsense words come from the rules. Items with flagged cases are excluded below level 5. Every item carries its level and skills.
- `ear/` One function, `hear(audio) -> syllables[]`. The prompt lives in `ear/prompt.md`. A CLI runs it over a folder of recordings and prints the sounds next to the file names.
- `grader/` `align(heard, expected) -> verdicts[]`, one per pair: `ok`, `wrong_letter`, `wrong_vowel`, `skipped`, `extra`, `uncertain`, `not_decoded`. Keeps the last attempt when a child restarts. Marks a word `not_decoded` when too little matches to place a letter-level verdict.
- `coach/` `chooseNextSet(profile, verdicts, candidates) -> { itemIds, reason }`. Runs at each checkpoint, after two or three regular lines plus an eligible challenge. Code validates that every id is a real bank item at an allowed level before anything is shown. The fallback is the plain rule: hold a level cleanly, step up; miss the same skill twice, step down and target it; pass a nonsense word built from a skill, mark it proven.
- `station/` React. One line in big type, record, light up one line behind, sets of two or three regular lines plus an eligible challenge, a star fills at each checkpoint while the last line grades. Stars, streak, level badge, personal best. No leaderboard. End of turn: one templated sentence the child can understand.
- `server/` A small Node service that holds the keys and calls the models. The browser never talks to Baseten or Meta directly.
- `recordings/` Instructions and the synthetic clip script. The separate local clip recorder saves mono WAV test files under gitignored `recordings/private/`, named for what was planted: `shabbos_va-for-ba.wav`. Child recording requires written parent consent. Its child runner deletes each clip after printing the result, including failures, unless `--keep` is set. Adult clips remain until manually removed. Closing the recorder does not delete saved clips.

## Sound alphabet

Consonants: `b v g d h z ch t y k l m n s p f tz r sh`. Vowels: `a e i o u oy ey`. Sheva na is a short `e`. Silent letters produce nothing. Syllables are joined with hyphens, words separated by spaces, one word per line in the ear's output. Unclear syllable: `?`. Examples: `sha-bos`, `ba-ruch`, `ru-ach`.

## Ear prompt (starting point, iterate from the recordings)

You are listening to a child read Hebrew out loud. You cannot see what they are reading. Write exactly the sounds you hear, syllable by syllable, using only this sound alphabet: (alphabet above). Join syllables with hyphens, put each word on its own line. Children make mistakes and sometimes produce sounds that are not words; write what you heard, never what the word should be. If a syllable is unclear, write `?`. Output the sounds and nothing else.

## Build order

1. Rulebook and bank, tested by hand on one siddur page: does it say what a kriah teacher would say out loud?
2. Ear test. This is the go or no-go. Record a dozen clips with planted mistakes (a `va` where `ba` belongs, a patach for a kamatz, a skipped syllable, a word read completely wrong), then real children with consent reading a line and planting a mistake on purpose. The ear must report `va` when the voice said `va`. If it corrects the mistake, change the prompt, try the fallback model, try a different alphabet. Nothing else gets built until this passes on a child's voice.
3. Grader on the same recordings. Each planted mistake must land on the right letter.
4. Station loop.
5. Coach.
6. Game skin, teacher view, practice packet, parent line.
7. Demo video. Script the voiceover first.

2026-10-26: the grader, coach, station and server were built against synthetic voices while real clips are collected; the real-voice round is still the go or no-go.

The smallest complete demo is steps 1 through 4 with the plain adapting rule and the child's end-of-turn sentence.

## Conventions

- Small commits with plain messages. The judges read the history to see what was built during the event.
- Every rulebook change ships with a test case.
- Every ear or grader change is run against `recordings/` before it is committed.
- Open the repo in a logged-out browser before submitting to confirm it is public.
