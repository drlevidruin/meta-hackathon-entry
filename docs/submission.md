# Submission answers

Answers for the Cerebral Valley form, Meta Global AI Developer Hackathon. Indie Developer track. Solo entry: Rabbi Dr. Levi Druin. Problem statement: Build for Your World.

Lines marked [CHECK] need a fact confirmed before pasting.

## Project name

Kriah Listener

## Tagline

A child reads Hebrew aloud, and every letter and vowel is graded against their own tradition by a model that never sees the page.

## Short description

Kriah Listener is a classroom reading station for children learning to read Hebrew with vowels. A child reads a line aloud. Muse Wonder hears the sounds without seeing the text. Meta's open phoneme model checks the vowels. A rulebook grades each letter and vowel by the child's tradition. Teachers get groups, a map and a practice packet.

## Full description

**The problem.** I am the principal of a Jewish day school, and I teach kriah: reading Hebrew with its vowel marks, the nekudos. Children learn it in the first years of school. A teacher cannot listen to every child read every day. The mistakes that matter are small: one vowel under one letter, a dot that changes b to v. And children read in different traditions. In Ashkenazi reading, שַׁבָּת is sha-bos. In Sephardi reading it is sha-bat. A speech tool that expects one tradition marks the other wrong.

**Who it is for.** Kriah teachers in the first grades of Jewish day schools, and the children in their classes. I built it for my own teachers.

**What it does.** A child taps their animal and reads one line from the screen. The microphone stays on, line after line. Each line comes back marked, letter by letter. Green is right. A wrong letter turns orange. A wrong vowel turns only the vowel points purple, so the child sees which mark they misread. Under each mistake is the syllable that was heard. Stars fill at each checkpoint, and the next set of lines adjusts to what the child got right and wrong.

The teacher sees each child's reading map, every letter with every vowel, marked solid, shaky or untested. Children are grouped by the next skill they need. A printable packet for each child has warm-up lines, practice lines aimed at their weak skill, and one challenge.

**How it works.** It is not a chatbot. There is no chat window and no free-text AI feedback anywhere, for children, teachers or parents. It is a listening and grading pipeline with five stages:

1. **The ear.** Muse Wonder 1.0, through the Meta Model API, gets the audio, the reader's voice card and a sound alphabet. It never sees the printed line, so it cannot fill in the word it expects. It writes syllables, like `sha-vos`.
2. **The vowel meter.** Plain signal code measures each vowel in the audio against how this reader said a, o, e and i on a short voice card read once at the start.
3. **The phoneme referee.** Meta's open wav2vec2 phoneme model runs on the same computer as the server. It writes what it hears in IPA, with no word list behind it. It checks the ear's a, o and e against the reader's own card.
4. **The rulebook and grader.** Plain code knows what every letter and vowel should sound like in Sephardi, Ashkenazi and Chassidish reading. The grader lines up what was heard with what was printed and marks each letter-vowel pair: right, wrong letter, wrong vowel, skipped or extra.
5. **The coach.** At each checkpoint Muse Spark 1.3 picks the next lines by their ids in the item bank. Code checks every pick before a child sees it. If the model fails, a plain rule picks.

Every Hebrew word a child sees comes from the item bank: lines cut from the siddur, and practice syllables and nonsense words built by the rulebook. No model writes Hebrew a child reads.

**What is new.** Three things.

- The ear is text-blind by design. A model that knows the word tends to hear the word: in our tests one Meta model wrote back a word the reader had skipped, from memory alone. So the model gets audio only, and the judgment happens in code that does know the text.
- The model is calibrated to one reader. Before each line, Muse Wonder hears the child's own voice card as a second recording in the same request, so it can compare this child's kamatz and patach in one voice.
- Tradition is a rule, not a guess. Each tradition is a set of accepted sounds per vowel and letter. The same reading can be right for one child and wrong for another, and the grader says so.

## How Meta's models are used

| Job | Meta model | How |
| --- | --- | --- |
| The ear | Muse Wonder 1.0 (`muse-wonder-1.0`), Meta Model API | Audio in, syllables out. At minimal reasoning. The station asks it five times at once and grades as soon as three answers arrive, keeping the most common answer word by word. The reader's voice card goes with each call as a second audio part when the card kept each vowel pair apart. |
| The phoneme referee | wav2vec2 Large LV-60 phonemes (`facebook/wav2vec2-lv-60-espeak-cv-ft`), open weights, on the server computer | Writes IPA phonemes with no word list or language model. Calibrated on the reader's voice card. Checks only the ear's a, o and e. The audio for this check never leaves the computer. |
| Following the reader | The same wav2vec2 model | Every 400 milliseconds the line read so far goes to the phoneme model, audio only. The station counts the vowels heard and enlarges the word being read. It never changes a grade. |
| The coach | Muse Spark 1.3 (`muse-spark-1.3`), Meta Model API | Picks the next bank ids at each checkpoint. Code checks every id and level. Its reason is shown only in a PIN-protected developer trace. |
| The fallback ear | Muse Spark Open (`meta-models/muse-spark-open-1026`), Baseten | Asked once, only when Muse Wonder gives no usable answer and a Baseten key is set. It never hears the voice card. |

**What we tested and rejected.** The ear was chosen by test, not by default. All of this is in `docs/ear-test.md`.

- Muse Spark 1.3 corrected mistakes toward real words. It heard `sha-vos` and wrote `sha-bos`.
- Muse Spark 1.2 answered in English prose on about a third of the synthetic clips with the first prompt.
- Muse Voice Transcribe 1.0 was fast, but it writes words, corrects toward real ones, and drops the vowel marks.
- Muse Spark Open, on an adult reading of Shema, wrote back a word the reader had skipped, without seeing the text. The grader caught 6 of 10 planted mistakes from its answers, against 9 of 10 from Muse Wonder.
- Muse Wonder 1.0 wrote the planted mistake on 5 of 7 synthetic plants in each of two runs, with no prose. Minimal reasoning cut it from about 15 seconds a clip to 2.4.

**What we learned about the models.**

- Muse Wonder writes Israeli vowels for an Ashkenazi reader. On the first adult round the grader caught 9 of 10 planted mistakes, but 7 or 8 correct sounds per run were marked wrong. Prompt changes and more reasoning did not fix it. That finding drove the meter and the referee.
- More thinking hid more mistakes. At medium reasoning the ear wrote the word it recognized and hid 6 of 22 planted mistakes, against 2 at minimal, and took 25 seconds a reading instead of 6.
- More calls did not fix a steady mistake. One, three and five calls per reading left the same false marks, because the ear repeats its mistake on a recording. The vote does fix answers that vary from call to call.
- Hearing the reader's voice card helped. On sealed Round 1d, with the meter, the card caught 10 of 12 planted mistakes against 9 and left 14 false marks against 20 over three runs.
- Meta's open phoneme model is the strongest check on vowels. On the saved adult clips it was right on 90% of kamatz and patach syllables, against 66% for the ear and meter.

**Muse Code.** Muse Code was set up as an outside reviewer. When it was called on this code, its plan quota was used up, so no review in this repo came from it. The code was written by Claude Code and OpenAI Codex to my brief. See "What was built during the event".

Only standard tier is used. No model id ending in `-contributor` is used, and the ear refuses those ids.

## Technical depth

**The text-blind rule.** The ear's prompt tells it that it cannot see what the child is reading, and the request contains no text from the line. The only text the ear gets is the sound alphabet: `b v g d h z ch t y k l m n s p f tz r sh` and `a e i o u oy ey`. Answers in prose count as a failed call. Syllables outside the alphabet become `?`, which is never marked wrong.

**Rulebook presets.** Each tradition maps every vowel to a set of accepted sounds. Ashkenazi kamatz is o; Sephardi kamatz is a; Chassidish kamatz accepts o and u. Ashkenazi cholam accepts o, oy and ey. Grammar cases that depend on reading the word, kamatz katan and sheva na against sheva nach, are flagged, and the grader accepts either reading. When a reading fits another tradition, the grader notes it. AI reviewers checked every distinct siddur word in all three traditions, and a second AI review confirmed each finding. I ruled on two Ashkenazi questions myself: a quiet ה with a sheva nach is not a mistake, and a tzere read as e is not a mistake.

**The vowel meter.** Before a child's first line, the station shows a card of the vowels the child has learned, fifteen sounds for a child who knows them all. The server keeps that child's averages for a, o, e and i. On each line it measures every vowel. Where another of the child's own vowels fits clearly better, it writes that one. It never adds or removes a syllable. It corrects between two vowels only when the child kept them apart on the card, so a card read wrong cannot teach it wrong.

**The phoneme referee.** It writes o where Meta's phoneme model clearly heard a back vowel, and undoes an o where it clearly heard a front one. Where the model is known to mishear, before a final l and on a word's last open syllable, the meter decides instead. When the ear and the phoneme model hear different numbers of vowels, the referee lines them up and acts only where every best line-up agrees.

**Sealed test rounds.** Every result below comes from my own adult voice, reading with mistakes planted on purpose. For a sealed round, the words are recorded, then left unheard by anyone until the rules are frozen and the pass rule is written down. A run passes only when every clip is graded once, the ear answers every clip, every planted mistake is caught, no correct reading is marked wrong, and at most two syllables are uncertain. A round passes only when all three runs pass. Failed rounds are published with the passing one.

| Sealed round | Date | Planted mistakes caught | False marks | Result |
| --- | --- | --- | --- | --- |
| 1c, 11 words, one run | Oct 27 | 4 of 4 | 15, against 17 for the ear alone | Fail |
| 1d, 12 words, three runs | Oct 27 | 10 of 12 | 14, against 20 without the voice card | Fail |
| 1e, 12 words, three runs | Oct 27 | 10 of 12 | 6, against 10 without the referee | Fail |
| 1g, 13 words, three runs | Oct 30 | 12 of 12 | 4, against 23 for the ear alone | Fail |
| 1h, 13 words, three runs | Oct 30 | 12 of 12 | 1, against 24 for the ear alone | Fail, 2 of 3 runs clean |
| 1i, 13 words, three runs | Oct 30 | 12 of 12 | 0, against 17 for the ear alone | Pass, 3 of 3 runs |

On Round 1i, Muse Wonder alone left 6, 5 and 6 false marks in its three runs, mostly an a written for an o, and twice heard a planted kof as kaf. The meter and the phoneme referee cut those to 0, without seeing the printed text.

Round 1k, ten connected prayer lines from the bank, is a design set used for tuning, not a test. Muse Wonder alone left 12 to 19 false marks a run. The phoneme referee cut them to 3, 3 and 5. Fixes found on those lines brought the replay to 2 a run with every planted mistake caught, and my two Ashkenazi rulings cover both of the two left. Because these lines shaped the rules, those numbers prove nothing about new readings.

**Tests and tools.** On November 3, 1,293 server-side tests, 248 station tests and 36 phoneme service tests passed. They cover the rulebook in all three traditions, alignment with restarts, rereads and skips, the vote, the meter, the referee, saved progress, packets and the station screens. `npm run ear-score` grades a saved run against a pass rule fixed in advance. `npm run ear-replay` replays a saved run's referee without calling the ear. On 15,687 practice-bank lines, each read with one made-up skip, reread or restart, the October 27 grader marked 88.6% exactly right.

**Privacy.** The ear never sees the text. Keys stay on the server. By default the station and server grade audio in memory and never write it to disk or a log. The saved store holds first names, avatars, presets, progress and stars, with no audio, transcripts or model reasons. An opt-in setting, `SAVE_ATTEMPTS=1`, saves adult test readings for replay; it is off by default, and off on the live demo.

## What was built during the event

Everything in the repository was built during the event. The first commit, `3fbef66`, is the project brief, made on October 26, 2026 at 9:07 PM Eastern. All 214 commits are from October 26 onward [CHECK: recount at submission time]. Nothing is copied from earlier projects.

I designed it and directed the build. My brief, committed first, set the design: an ear that never sees the page, a rulebook as the answer key, traditions as sets of accepted sounds, a coach that picks from the bank and never writes Hebrew, and no leaderboard. I recorded every adult test reading, set every pass rule before its round ran, and made the rulings on what counts as a mistake. Claude Code and OpenAI Codex wrote the code and tests to the brief, in review rounds recorded in `docs/reviews` and `docs/build-log.md`.

Built during the event: the rulebook and its three presets, the item bank generator, the ear calls and vote, the vowel meter and voice card, the phoneme referee and its local service, the grader, the coach, the server, the child station and teacher screens, the clip recorder, the scoring and replay tools, and every test round.

**Third party.**

- Meta models: Muse Wonder 1.0, Muse Spark 1.3, Muse Spark Open, and the wav2vec2 phoneme weights `facebook/wav2vec2-lv-60-espeak-cv-ft` (Apache 2.0).
- Open-source libraries: React and React DOM; Vite, Vitest, Testing Library and jsdom for building and testing the station; PyTorch, Transformers, NumPy, huggingface_hub, safetensors and tokenizers for the phoneme service. The server uses only Node's standard library.
- Text: Hebrew lines from *The Metsudah Siddur* (1981), via Sefaria, licensed CC-BY. The text was cut into lines and filtered. Section references and source links are in `bank/data/siddur.json`.
- Fonts: Frank Ruhl Libre and Montserrat, under the SIL Open Font License.

The code is MIT licensed. The siddur text keeps its CC-BY license.

## Limitations and what is next

**Limitations.**

- Every real-voice result is one adult reader, me, in Ashkenazi pronunciation. No child has used it yet. Sephardi and Chassidish are tested only offline.
- One sealed round has passed out of six, and it was single words. Connected prayer lines have only been used as design data.
- Muse Wonder still confuses a and o, and the checks behind it carry the grade. Nothing yet checks i against e; that missed one syllable in Round 1h.
- The first live test, on October 31, did not go well: lines ended at the first pause, grading took 6 to 10 seconds a line, and two correct words were marked wrong. The live flow was rebuilt after it. On November 3, through the public link, a short Level 1 line graded in about 4 to 5 seconds and a Level 5 siddur line read on an iPhone in about 11 to 12 seconds. The next line appears while the last one is graded, so the reader does not wait.
- No kriah teacher other than me has checked the rulebook by hand.
- It has not been tested on a classroom tablet over the school network.

**Next.**

- A child round, only with written parent consent, and on a paid Meta plan with free credits off.
- A sealed round of connected prayer lines.
- A hand check of the rulebook by my school's kriah teachers.
- An i and e check that does not break correct readings. The first try changed 21 correct readings and fixed none, so it stays off.
- A pilot station in one first-grade classroom.

## Links

- Repository: https://github.com/drlevidruin/meta-hackathon-entry
- Live demo: https://levis-new-mac-mini.tail8bd372.ts.net
- Video: VIDEO_URL

## Testing instructions

1. Open https://levis-new-mac-mini.tail8bd372.ts.net in Chrome on a computer with a microphone.
2. Allow the microphone when Chrome asks.
3. Tap a reader: Levi reads in Ashkenazi pronunciation, Guest in Sephardi.
4. A new reader first sees a voice card of fifteen sounds. Tap the microphone and read the card right to left, row by row, with a short pause after each sound.
5. Read each line as it appears. The microphone stays on. For Levi, read in Ashkenazi pronunciation: kamatz as o, a sav without a dot as s. For Guest, read in Sephardi pronunciation.
6. To test a mistake, read one kamatz as a patach, a instead of o. Its vowel points should turn purple, with the heard syllable under it. A wrong letter shows orange. Each line takes a few seconds to grade.
7. For the teacher view, tap Teacher and enter the PIN given in the private judge notes of this form. Open Class, then a reader, to see the reading map and turn log. Tap Print packet for the practice packet.

Without a microphone, the repo has a keyless preview with invented children and simulated grades: `npm --prefix station ci`, then `npm run demo`, then open http://localhost:5173/?mock. The grader can be tried alone, with no key: `npm run grade -- --preset ashkenazi --line "שַׁבָּת" --heard "sha-vos"`.
