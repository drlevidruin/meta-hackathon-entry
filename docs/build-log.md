# Build history

Rabbi Dr. Levi Druin designed Kriah Listener and directed the build. Claude Code and Codex wrote the code to his brief. The history below follows `git log --reverse --format='%h %ad %s' --date=iso` and the merge commits. Every commit was made during the event, starting the evening of October 26, 2026.

Work ran on several branches side by side that day. The merge order is not a strict build order. The grader, coach, station and server were built against synthetic voices so the go or no-go test could run once real clips existed. The adult round ran on October 27.

## Rulebook and bank

`3fbef66` added Levi's project brief. `aa6f18d` added the Metsudah Siddur source text. The rulebook and bank specifications followed in `b4f2ee3`.

`05972be` implemented expected sounds, pronunciation presets and skill tags. `f9c5e48` added the item bank. `c6f1b7f` added challenge words, generated spelling restrictions and merged cholam handling. Later fixes covered final kaf, word endings, silent-ending sheva, prefixed divine names, kamatz before final sheva and unpointed short words. The bank branch merged in `144b826`.

AI reviewers checked every distinct siddur word in all three traditions. A second AI review confirmed each finding. Fixes gained regression tests, and every word was compared before and after. No human kriah teacher has reviewed the rulebook yet. [Review record](check/rulebook-review.md), [bank report](check/build-report.md), and [Shema page for the hand check](check/shema.md).

## Ear and synthetic test

`010d6ff` added the prompt. `5304391` added provider calls, parsing, a CLI and offline tests. Subsequent commits fixed the Meta audio payload and the prose heuristic. The ear branch merged in `eb670e7`.

`489c17d` added the synthetic clip script. `660e482` recorded the first test notes. `dd3e3cd` corrected the recorded counts. Levi asked whether Muse Voice Transcribe 1.0 had been tried. That trial ruled it out and showed that minimal reasoning cut Muse Wonder 1.0 from about 15 seconds a clip to 2.4, so `ca9b59b` set minimal reasoning effort for Muse Wonder 1.0.

The script defines 13 clips: 7 planted mistakes and 6 clean controls. The notes report that Muse Wonder 1.0 wrote the plant on 5 of the 7 plants in each of two runs. Complete per-run output is not in the repository. Wonder was chosen after trials of Muse Spark 1.2, Muse Spark 1.3 and Muse Voice Transcribe 1.0. Muse Spark Open through Baseten was wired but did not run until the adult round. [Ear test](ear-test.md).

## Grader

`c513d2c` added word and pair alignment, verdicts, restart handling, other-tradition readings and divine-name substitutions. It merged in `d7371e2`. `ac52d9a` required a complete substitute reading after a prefixed divine name.

The grader was tested with synthetic sound strings and reported synthetic ear outputs. On October 27 it scored the ear's answers for Levi's adult clips.

## Coach

`4358515` added the adapting rule, validated Muse Spark picks, challenges, stop conditions and template explanations. The coach branch merged in `283c18f`.

The first live calls exhausted their 2,000 token limit on reasoning, so the rule always took over. Fix round 2 (`95a163f`) gave the model 16,000 tokens with minimal reasoning and stopped showing it the rule's own pick. In the live run that followed, the model answered all 7 of its checkpoints with valid picks ([live run](live-run.md)). The model parser and selection checks also have offline tests.

## Server

`2f7af7c` included the first server and station loop. `3c5b278` added the roster, saved progress, class groups, maps, packets, parent lines and developer trace. That server branch merged in `6f648b7`.

The server keeps model keys outside the browser. Station audio is processed in memory. The saved store holds roster and progress data without audio, transcripts or coach reasons.

## Station and local recorder

`385cd8a` added the React and Vite dependencies. The first station merged in `8f36dd6`. `11a4a0e` added roster management, teacher screens and the game display; it merged in `6529429`.

`3d67ced` added a separate local recorder for the ear test. `4254f92` improved its layout and mixed Hebrew text display. The recorder branch merged in `1650500`. It deliberately saves local test WAVs, unlike the station.

## Review and fix rounds

`118fba9`, merged in `163ca41`, fixed skill attribution, restart behavior, silent-pair handling, repeated demotions and coach answer parsing. It also fixed parent-line skill selection and server test discovery. [Regression record](reviews/2026-10-26-core-fix-round.md).

`68fe0e2`, merged in `4df3600`, improved the station's mock roster and completion display. `0bf6b09` hid extra heard syllables in the display and removed parent feedback before a first turn. `ca2bf91` tested the mock grouping behavior.

Fix round 2 merged in `95a163f`: turn resets, alignment, packet selection and coach requests. [Record](reviews/2026-10-26-core-fix-round-2.md). The server round merged in `8fd6dff`: stars, retries, startup checks and saved history. [Record](reviews/2026-10-26-server-fix-round.md).

`8fb9c22` and `ea2739e` fixed what a full review of the repo and its docs found. [Record](reviews/2026-10-26-review-fixes.md). `7582c7b` recorded a dress rehearsal of the [demo script](demo-script.md) on the real server. `6598d59` added optional https, because browsers allow the microphone only on https or localhost.

The current offline root and station test suites pass. Their synthetic inputs and model substitutes support implementation checks. They do not replace an adult round, a consented child round or a human kriah teacher's review.

## Adult round

On October 27 Levi recorded the 12 adult clips. In each of three runs the grader marked 9 of the 10 planted mistakes from Muse Wonder 1.0's answers, but the ear wrote Israeli vowels for his Ashkenazi reading, so correct kamatz, tzere and sheva sounds were marked wrong. More reasoning and two prompt changes did not fix it. Muse Spark Open on Baseten, the fallback ear, ran for the first time on the same clips and did worse: 6 of 10, and it filled in a skipped word of Shema from memory. The round did not pass. [Results](ear-test.md#round-1-results-october-27).

## Vowel meter

Levi set the goal after the adult round: fix the Israeli vowels without letting any model see the text. `ffdd81c` added the vowel meter and the voice check card. The reader reads fifteen sounds once, and the meter compares each vowel in a reading with the reader's own vowels. `20a7629` showed the card in the recorder as three rows of five. `ec249f9` put the voice check in the station and made Muse Wonder 1.0 the primary ear, with Muse Spark Open on Baseten as the fallback.

To keep the test honest, `3599591` added Round 1b, eleven new words, and `c843f8c` added Round 1c, eleven more that stay sealed until the settings are final. On Round 1b the first meter left 7 false marks. Measuring Levi's card showed his kamatz and patach nearly tied, because the meter weighed the second formant at half. `90658ef` weighs both formants equally and ignores unvoiced bursts. On the saved answers that left 4 false marks on Round 1 and 3 on Round 1b, against 16 and 11 for the ear alone, with every plant marked. Round 1b helped find that fix, so it no longer counts as a fair test. [Results](ear-test.md#vowel-meter-results-october-27).

Levi then asked what happens to a child who knows only one vowel. He turned down a step where the child repeats a recorded model: if the model were wrong, the child would learn the wrong sound for good. He chose a middle ground. The voice check asks only for vowels the child has learned, and the meter steps aside rather than guess when it cannot tell two of the child's vowels apart.

`bedf11a` let the meter work from a card with only some vowels and added a separation guard: the meter corrects between two of the child's vowels only when the child kept them apart on the card. `8d21013` made it correct only between two vowels the child read on the card. With only a kamatz on the card, a kamatz read as a patach there would otherwise make every real patach-for-kamatz mistake look right. `f0a8bdf` made practice lines, the voice card and the beginner lines follow what each child has learned. `2c064ea` asks for a voice check only where the meter has two vowels to compare. `951cc12` put learned vowels and a teacher's Skip on the station roster. The branch merged in `271b0e3`, after review fixes in `94aa185` and `5f4d082`: a voice card that changes during an upload is refused, and a child whose level has no lines for their vowels starts at the nearest level that has them instead of being reported as dropped.

The sealed Round 1c result came in `2e82266`. The meter caught all four plants but cut false marks only from 17 to 15, because inside words Levi's kamatz measures close to the patach on his card. `d109049` and `b7b4cd2` added card and sheva tests, and `83b554f` recorded the results. The ear hears his kamatz as an open o only when a patach is in the same recording to compare. It writes the same e for a quick sheva and a full eh, so a sheva read as a full eh stays accepted until a test shows the difference can be heard. `6e0da98` added Round 1d, twelve fresh sealed words.

## Voice card to the ear

The card tests pointed to a fix the meter could not make. The ear hears Levi's kamatz as an open o only when a patach is in the same recording, so `0312d8f` plays the primary ear the child's own voice card before each reading, as a separate recording. The fallback ear never gets it. On the 34 clips of Rounds 1 to 1c, the lab runs in `d2f1af2` caught as many plants with the card and cut false marks with the meter from 23, 21 and 23 to 18, 15 and 17.

Levi also read the card wrong on purpose, with every kamatz as a patach, and the ear learned his mistake. So `6e84ae7` sends the card only when the voice check kept each vowel pair apart, by the meter's own rule, and `9bf04e3` adds that a card showing kamatz must show it apart from a patach. On his real cards the right one goes to the ear and the wrong one does not. Levi chose to keep the card in memory only, so the station never writes a child's audio to disk. `a6e0fa6` built that; after a restart the child reads the card again. Reviews found two bugs, fixed in `93768fa` and `9c11ced`: the test runner reported the card on for the fallback ear, and starting a turn failed along with a refused card upload. The branch merged in `00fe6b5`.

The sealed Round 1d ran next, three times with the card and three times without. With the meter the card caught 10 of 12 plants against 9 and left 14 false marks against 20. It did not fix the Israeli vowels: yod and koton came back with an a in every run. It also showed a cost: in 3 of 36 readings the ear wrote o for a patach Levi said, and once that hid the planted yam as yom. [Results](ear-test.md#round-1d-results-october-27).

## Vote and phoneme referee

A vote cannot fix a vowel the ear gets wrong every time, like yad for yod, but the ear's answers also varied from call to call on the same clip: ko-voyd one time, ka-voyd the next. `6d850be` asks the primary ear three times per reading, in parallel, and keeps the most common word count, then the most common word at each position. Replayed over three saved Round 1d runs, the vote caught more plants and left fewer false marks than any single run. `7f6503f` fixed two review findings: an empty answer could outvote a real one, and the recorder loaded the ear at startup. The branch merged in `f8197ca`.

The next judge decodes no words at all. Meta's open phoneme model, `facebook/wav2vec2-lv-60-espeak-cv-ft`, writes the sounds it hears in IPA, with no word list or language model. On the 62 saved adult clips it was right on 90% of kamatz and patach syllables, against 66% for the ear and meter. `6c929d8` sealed twelve new words as Round 1e before the referee was built, and `35e4e6d` added them to the recorder. `696363f` built the referee: the model runs in a service on this computer, and its line comes from the child's own voice card. Reviews found three problems, fixed in `3e6ec1d` and `15ab199`: a WAV with a tiny sample rate could take the service down, a long card could run past the time limit, and waiting readings could pile up after their callers left. The branch merged in `1a9a038`. Replayed over the saved Round 1d runs, the referee cut false marks from 72 to 36 and caught 62 of 66 plants against 60. Those clips shaped its rule, so they were not the test. [Referee](ear-test.md#phoneme-referee-october-27).

## Round 1e and the memory fix

Levi read Round 1e at 3:12 PM, and the first sealed run went from 3:15 to 3:26 PM. In that run the phoneme service gave no answer on one reading, and the runner said nothing. The Mac was short of memory, and macOS had swapped the idle model out. `c6afaac` made the service turn a reading away before reading its upload when the queue is full, and skip a waiting reading only once its caller's own time limit has passed. `7599bd7` pins the model in RAM, and the runner now tries a missed reading once more and names every reading the referee did not check. It merged in `6a18a01`. The same afternoon a cleanup of shared caches deleted the downloaded model, so `fe80790` keeps it in `phonemes/.models`, beside the service.

Runs 2 and 3 used the same settings with the model pinned. Over the three runs the referee caught 10 of 12 plants, as many as without it, and cut false marks from 10 to 6. No run passed. Apart from the reading the service missed, every error left is the ear writing o where Levi said a. [Results](ear-test.md#round-1e-results-october-27).

A threshold set from the card would have undone the one miss of kom for the planted kam. Checked on the design rounds only, it turned four of Levi's real kamatz o's into a and added 43 false marks, so it was dropped without a sealed round. [Undo threshold](ear-test.md#undo-threshold-october-27).

## Round 1f and 1g, and the referee's new rules

Round 1e left one kind of error: the ear writing o where Levi said a. Levi asked why we were satisfied with that and told the work to keep going. `d9aa1e8` added two rounds to read in one sitting, after a second voice card: Round 1f, thirteen design words, and Round 1g, thirteen sealed words. `4d952e4` lets the ear test grade one round (`--round`) or use one card (`--card`), and logs every call's answer. A review found that a mistyped round name in a child run would delete the child's recordings, and that a call that failed vanished from the votes column. `1d93f46` fixed both and grades each round against the card read in its sitting. The branch merged in `f95501e`.

Two cheaper ideas were tested first, on saved design readings. Five calls per reading did no better than three or one, because the ear repeats its mistake on the same recording. Medium reasoning was four times slower and hid more planted mistakes, because the ear wrote the word it recognized. Both were dropped. [Results](ear-test.md#more-calls-and-more-thinking).

`094d028` changed the referee where the phoneme model is unreliable. Before a final l it hears every vowel as back, so there the vowel meter decides. The meter also decides for an ear o in the middle band, where Round 1e's planted kam came back kom. When the ear and the phoneme model hear different numbers of vowels, the referee now lines them up instead of skipping the line. The replay showed a cost: on the Shema line a tied line-up wrote o-do-noy in every set. `d716964` acts only on the pairs every best line-up agrees on, and writes `?` only when the card keeps a and o apart. The branch merged in `a57b30d`. Over 460 saved design readings, false marks fell from 103 to 65, and plants caught rose from 209 to 219 of 220.

`7b5ba7d` added three rules for the readings still wrong. On a word's last open syllable the reader's vowel is reduced, and the phoneme model heard toy-ro's o as front, so there a front verdict hands the choice to the meter instead of lowering the vowel. An o the phoneme model heard as a rounded vowel becomes u, which fixed ko-suv. The ear's ts is read as tz, which fixed tze-do-ko. False marks fell from 65 to 37, with no plant hidden, and toy-ro became `?` once per set.

Reviews of the merged code found two real bugs, fixed in `f4fb12e`. Two line-ups with the same score but different numbers of gaps were not both counted, so a pair one of them disagreed with was still corrected. A plain child run graded readings whose sitting card was missing with every check off, then deleted the audio; it now stops before anything runs. `--no-meter` now keeps the meter out of the referee as well.

A second review found five smaller problems, fixed in `67700d9`. The tz rewrite also turned tshu-vo, a swallowed sheva before shin, into tzhu-vo; before h, ts now stays t, then sh. An o the phoneme model heard as rounded became u even where the meter measured an a, so kol heard for kal would have become kul; the meter's a now wins. Two of the phoneme model's vowel symbols, ʉ and ɵ, were not counted, a `?` could come from a measurement with missing numbers, and one alignment test no longer proved its pairing. The replay of the design readings is unchanged, and the branch merged in `632cdc5`. One finding is still open: a child run whose card file exists but cannot be read grades without the card and then deletes the audio. No child round runs before parent consent and a paid plan.

The replay also turned up a grader bug on the Shema line. When a reader skips אֱלֹהֵינוּ, the grader took the second a-do-noy for a restart of the first יְהֹוָה, so it marked that יְהֹוָה skipped and אֱלֹהֵינוּ not decoded. A child would have seen marks on two words, neither of them the one skipped. `19a6665` treats a later attempt that can begin the word after one skipped word as a separate read, and it merged in `78a8d65`. A review then found that it also let a wrong re-read on such a line be graded from its first try, when the word after next is the same word or a similar one. `cf8ee3e` keeps the skipped-word reading only when the later attempt fits the word after the skipped one at least as well as the word it repeats, and the reader does not go straight on to the skipped word. It merged in `cfc17f7`. On 20,000 generated lines with skips and re-reads it grades 85.1% exactly right, against 81.2% before the Shema fix and 84.7% with it. The Shema plant had been scored against the misplaced marks. Rescored with `19a6665`, the 460 design readings come to 99 false marks as shipped, 61 after `a57b30d` and 33 with every rule, and the rules catch all 220 plants. `cf8ee3e` and the [later fix](#the-grader-on-real-lines) grade every saved design reading the same way. [Rules](ear-test.md#referee-rules-from-the-design-rounds-october-27).

The counts in the ear test came from a scratch script outside the repo. `0611825` added `npm run ear-score`, which grades a saved run with the grader alone, without calling the ear, and applies a pass rule fixed in advance. On 24 saved design replays it gives the scratch script's counts in every column. Reviews found five ways a bad run could pass: a file with no rows, a repeated mark counted once, a run cut off partway, a row cut off after its fifth column, and one file named twice. `b97eb9a`, `6b4ba25`, `9679c93` and `0d3e15b` closed them. A pass now needs every clip of the round exactly once, every row as wide as its header, and a different file for each run. The branch merged in `8961ab9`, and the last two fixes in `1eca548`. [Score a run](../tools/clip-recorder/README.md#score-a-run).

## The vowel probe

`ee1cce4` fixed Round 1g's pass rule before any of its clips were recorded, and Levi approved it: all three runs must pass, each with every clip graded once, the ear answering every one, all four plants caught, no false mark and at most two uncertain syllables.

Levi asked that the work improve how Meta's models listen and reason, since that is what the hackathon judges. Two ideas were tried first on the design clips and dropped. A prompt that asked the ear to compare each a and o with the kamatz and patach of the card it had just heard doubled the false marks after the referee, from 3 to 6, and its own tags disagreed with the vowels it wrote in 23 of 204 syllables. Measuring only the first half of a vowel, where a final l colors it less, placed 42 of 64 a and o syllables against 46 for the whole vowel. [Results](ear-test.md#the-ear-compares-with-the-card-october-27).

`69d00ab` added Round 1h, thirteen more sealed words read in the same sitting, which run only if Round 1g fails, and Voice check 3, a longer card for later work on closed syllables.

The probe asks Meta's phoneme model a second question. Where its letters are unsure, the referee used to ask the formant meter. Now, with `--probe`, it first compares the vowel with the reader's own card inside the model, on the sixth of its 24 layers, and takes the nearer of the card's a and o. Codex built it from a written spec in `1f4d17b`, behind a flag that is off by default. Replayed over nine saved design sets, it caught every plant, added no false mark, and turned the nine uncertain toy-ro marks into the right o. The repo's code matched the lab replay row for row, and a full run of Round 1d with it passed all twelve clips. A review found that `--probe` against an older phoneme service switched the whole referee off without stopping the run, and that four of its rules had no test that wrong code would fail. `a973af8` makes such a run stop before any reading, adds the tests, and counts what the probe chose as well as what it changed. That stop came before the cleanup that deletes a child's clips, so a child run would have lost its recordings without grading them. `a00373e` keeps them when a run stops before the ear hears anything. The branch merged in `0e5e16c`.

The probe's setting was chosen on nine syllables, so the design clips cannot settle it. `3f71dd2` wrote down, before Round 1f was recorded, how Round 1f decides whether it joins Round 1g's rules, and what is expected to go wrong. [Probe](ear-test.md#vowel-probe-october-27).

The rule needs each Round 1f run replayed with the probe off on the same phoneme answers, and that replay was a script outside the repo. `f5881c7` made it a repo tool, `npm run ear-replay`, after the rule was written and before Round 1f was recorded. Replayed with the run's own probe setting, it must reproduce every heard answer, or it fails. Reviews found that a reading with no phoneme tokens stopped it with the wrong message, and that a reading row cut off partway was skipped instead of stopping it; `fa2c11e` and `8ec7187` fixed both. On the Round 1d rehearsal it reproduced all 12 readings. On the nine saved design sets it reproduced all 414, once their saved answers were rewritten with today's ts to tz rule. The branch merged in `ddebd9f`. [Replay a run](../tools/clip-recorder/README.md#replay-a-run).

## The grader on real lines

`cf8ee3e`'s guard came from an earlier review that tested it on four made-up lines. A second review checked it on lines from the practice bank, each read with one made-up event: a word skipped, a word read twice, a word read twice with a wrong vowel in the second try, or a word started and then read in full. Of 15,687 such readings, `cf8ee3e` graded 86.7% exactly right, below the 88.3% of `19a6665` before it: 248 readings worse and 4 better. Its guard was the wrong one. A reader who repeats a word and goes on, as in אֲבוֹתֵינוּ אֱלֹהֵי, אֱלֹהֵי אַבְרָהָם, was marked as skipping אֲבוֹתֵינוּ. The review also found a mistake both versions missed: when a reader re-reads two words and the second try has a wrong vowel, as le-chal for לְכָל, the whole line was graded correct.

`ed82cfa` is the reviewer's fix. It goes back to `19a6665`'s rule for a repeated word, and a try spread over two heard words can no longer hold more sounds than the printed word. Before it takes a repeat as a restart, it checks whether the reader went on to the skipped word. On the same 15,687 readings it grades 88.6% exactly right: 47 better than `19a6665` and none worse, 295 better than `cf8ee3e` and 4 worse. In those 4, on drill lines of one-syllable words, the wrong second try sounds exactly like the next printed word, so the sounds read the same either way. On the same 20,000 generated lines as above, it grades 86.0% exactly right against 85.1% for `cf8ee3e`, better on 184 and worse on none. `157c26c` adds thirteen of the review's readings as tests, and ten of them fail on `cf8ee3e`. Every saved run from the design work, 668 files and 30,117 graded rows, grades the same under `19a6665`, `cf8ee3e` and `ed82cfa`, so no count in the ear test changes.

Still wrong in every version: eyn iyn key key-loy-hey-nu, a wrong second try at אֵין and then a word started and read in full, is graded all correct. Two readings on the רָע lines, a skipped word and then a word started and read in full, grade wrong under `ed82cfa` as under `cf8ee3e`, though `19a6665` got them right; another reading of the same sounds is just as likely.
