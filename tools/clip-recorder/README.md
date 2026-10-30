# Local clip recorder

This tool records the real-voice ear test. It is separate from the classroom station. It reads the adult clip table in [docs/ear-test.md](../../docs/ear-test.md). The child set uses the same readings with `child_` prefixed to each filename.

The adult round ran on October 27 with Muse Wonder 1.0 through the Meta Model API and did not pass; see the [results](../../docs/ear-test.md#round-1-results-october-27). Muse Spark Open through Baseten ran once on the same clips and did worse. The child round has not run.

## Record

From the repo root:

```bash
npm run record
```

The command starts a local server and prints its address. Open that address in a browser. It defaults to `http://127.0.0.1:8790`. `--port` changes the port.

Each card shows the Hebrew, the sounds to say, and the planted mistake. Record stops when tapped again. Play replays the saved clip. Again records a replacement. Next moves to the next card. Fonts are bundled locally.

The cards run in this order: the voice check, the Round 1b new words, the Round 1c sealed words, the card tests, the sheva tests, the Round 1d sealed words, then Round 1.

For the child set:

```bash
npm run record -- --set child
```

Recording a child requires written parent consent. Pass the adult round first. Before sending children's audio to Meta, turn free credits off and use a paid plan. Meta's free-credit terms allow content to be used for product improvement.

## Files and deletion

The browser converts each recording to mono, 16 kHz, signed 16-bit PCM WAV. The local server saves it as `recordings/private/<clip-name>.wav`. The directory is gitignored. A replacement is written through a temporary file and renamed over the old clip. The server limits uploads to 10 MiB. It does not keep a transcript or a results file.

Closing the recorder does not delete files. The Delete child recordings button removes `child_*.wav` files in that directory. Adult files remain until manually removed.

The child test runner deletes each clip after printing its result, including failures. A final cleanup removes remaining child WAVs. `--keep` disables automatic deletion and leaves those files for manual removal.

The classroom station and grading server never save audio to disk or logs. Their saved progress is separate from these local test files.

## Test recorded clips

From the repo root:

```bash
npm run ear-test
npm run ear-test -- --set child
```

The runner loads `.env`. With a nonempty `META_API_KEY`, it defaults to the Meta primary. Otherwise a nonempty `BASETEN_API_KEY` selects the Baseten fallback; with neither key, it selects primary. The selected role and model id are printed before the results. `EAR_PRIMARY_MODEL` and `EAR_FALLBACK_MODEL` override their ids.

The next line prints `Ear votes: N`. The primary ear is asked in parallel with the same audio and voice card, when present. The most common word count is kept, then each word is chosen by the most votes at that position. The earliest answer breaks ties. `EAR_VOTES` sets the default to a whole number from 1 to 5; missing or invalid values use 3. `--votes N` overrides it for this run:

```bash
npm run ear-test -- --votes 1
```

The fallback ear is asked once, without a voice card. It always prints `Ear votes: 1 (fallback ear)` and uses one vote, including when `--votes` is given.

To choose a provider explicitly:

```bash
npm run ear-test -- --model fallback
npm run ear-test -- --model primary
```

After `Voice card to the ear:`, the runner prints `Phoneme referee:` and its status. The referee calibrates once from the recorded voice check using the local [phoneme service](../../phonemes/README.md). Its a/o and i/e checks turn on separately when the card keeps those vowels apart in that model. An on line looks like `Phoneme referee: on (o 0.91, a 0.43, line 0.50); i/e on (i 0.90, e 0.10, line 0.50)`. An off line explains whether the service gave no answer (not running, or slower than the time limit), the card is missing, its vowels did not line up, or its vowels did not stay apart. A phoneme failure leaves the metered answer.

The i/e check needs at least two usable card syllables of each vowel and an i score at least 0.30 above the e score. Its line is their midpoint. It changes e to i at least 0.10 above the line and i to e at least 0.10 below it, unless the vowel meter chooses the other vowel. It leaves ey alone. Older calibrations without i/e scores keep the a/o check and report `i/e off (card i and e unavailable)`.

The runner tries a recording the phoneme service missed once more and prints which readings the referee checked.

To turn the referee off for a run:

```bash
npm run ear-test -- --no-referee
```

This prints `Phoneme referee: off (--no-referee)`. The flag is independent of `--no-meter` and `--no-card`. The referee can use the recorded voice check even when both are off. With `--no-meter` the referee does not ask the meter either; where its rules would, the ear's vowel stands unless the probe chooses a vowel.

The `--probe` flag enables a per-reader vowel probe and is off by default. Run `npm run ear-test -- --probe` to compare the phoneme model's hidden states with the recorded voice card before asking the meter at open ends, before final l and in the middle band. The probe works with `--no-meter` and requires the referee to be on. After the referee status, `Card probe:` reports whether the probe is on and how many a and o card vowels it used. The TSV columns stay the same.

`--probe` needs the phoneme service started from this version. If the service answers the voice card without the probe but does not return probe vectors, the run stops before sending any reading to the ear and asks you to restart the service from this checkout.

With `--probe` and the referee on, the final `Probe chose N syllables and changed M.` line counts every syllable where the probe chose a or o, including choices that kept the vowel, and how many of those choices changed it.

Each row has seven columns: `clip`, `said`, `heard`, `result`, `ear`, `metered` and `votes`. `ear` is the ear's answer after the vote, and `votes` lists each call's answer, separated by ` | `, with `ERROR` for a call that did not answer. `metered` is the answer after the vowel meter, before the referee. `heard` is the final answer after the referee, and `result` is its `PASS` or `MISS`. When the referee is off or changes nothing, `metered` and `heard` are equal. Comparison ignores case and spaces within each word. It preserves syllable boundaries, word boundaries, order and count. Only audio reaches the ear. The phoneme service runs on this computer and never sees the printed text. The runner does not call the grader. It exits with status 1 if any clip misses, a call fails, or no clips are recorded.

## One round, and its card

Each table in `docs/ear-test.md` names the voice card read in its sitting: Rounds 1 to 1e use `voice-check`, and Rounds 1f and 1g use `voice-check-2`. The runner grades each reading against its own card and prints a `Voice card:` block for each card it uses. `--round` grades one table, and `--card` uses one card for every reading:

```bash
npm run ear-test -- --round "Round 1f"
npm run ear-test -- --card voice-check
```

A round whose card is not recorded stops before any call to the ear. With `--set child`, `--round` needs `--keep`, because the run deletes the child's recordings when it ends, including rounds it did not grade. A child run without `--keep` also stops before any call when a reading's card is not recorded, since it would grade without the card and then delete the audio.

## Score a run

The runner checks sounds. The scorer checks what the grader marks. Save a run, then score it:

```bash
npm run -s ear-test -- --round "Round 1g" > run-1.tsv
npm run -s ear-score -- --round "Round 1g" run-1.tsv
```

For each reading it grades the said sounds and each answer with the Ashkenazi preset; `--preset` changes it. A planted mistake is caught when the answer gets every mark the said sounds get. Any other mark is a false mark, or an uncertain mark when the grader marks a syllable uncertain. The final, metered and ear answers are counted separately, and `--detail` lists each clip. The scorer reads only the saved file and the clip tables. It never calls the ear.

`--max-uncertain N --runs-needed K` applies a pass rule to the final answers. A run passes when every clip of each round it scores appears once, with no ear error, every plant caught, no false mark and at most N uncertain marks. The rule passes when K runs pass, and the exit status is 1 when it fails. A row cut short is an error and a missing clip fails the run, so an interrupted run cannot pass. Naming one file twice is an error, so one run cannot count as two.

## Replay a run

```bash
npm run -s ear-replay -- --probe off run-1.tsv > run-1.off.tsv
npm run -s ear-replay -- --probe on run-1.tsv > run-1.on.tsv
```

With the same probe setting as the saved run, the faithfulness check requires every replayed heard answer to match and exits 1 if any differ.
The off replay shows what the referee would have heard without the probe on the same metered words, so the scorer can check whether the probe catches as many plants with no more false or uncertain marks.
Both replays rebuild and report the i/e settings from the recorded card. Replaying a run made before the i/e check can change heard answers even with the same probe setting.

## Offline checks

```bash
node --test tools/clip-recorder/recorder.test.js
```

The tests use generated WAV bytes and fake ear and phoneme calls. They cover saves, playback, deletion, filename validation, model selection, printed status lines, sound comparison and the order of the meter and referee. `node --test tools/clip-recorder/score.test.js` checks the scorer.
