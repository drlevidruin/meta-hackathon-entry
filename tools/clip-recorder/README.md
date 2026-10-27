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

After `Voice card to the ear:`, the runner prints `Phoneme referee:` and its status. The referee calibrates once from the recorded voice check using the local [phoneme service](../../phonemes/README.md). It is on only when the card's o and a stay apart in that model. An on line looks like `Phoneme referee: on (o 0.91, a 0.43, line 0.50)`. An off line explains whether the service gave no answer (not running, or slower than the time limit), the card is missing, its vowels did not line up, or its o and a did not stay apart. A phoneme failure leaves the metered answer.

To turn the referee off for a run:

```bash
npm run ear-test -- --no-referee
```

This prints `Phoneme referee: off (--no-referee)`. The flag is independent of `--no-meter` and `--no-card`. The referee can use the recorded voice check even when both are off.

Each row has six columns: `clip`, `said`, `heard`, `result`, `ear`, and `metered`. `ear` is the ear's original answer. `metered` is the answer after the vowel meter, before the referee. `heard` is the final answer after the referee, and `result` is its `PASS` or `MISS`. When the referee is off or changes nothing, `metered` and `heard` are equal. Comparison ignores case and spaces within each word. It preserves syllable boundaries, word boundaries, order and count. Only audio reaches the ear. The phoneme service runs on this computer and never sees the printed text. The runner does not call the grader. It exits with status 1 if any clip misses, a call fails, or no clips are recorded.

## Offline checks

```bash
node --test tools/clip-recorder/recorder.test.js
```

The tests use generated WAV bytes and fake ear and phoneme calls. They cover saves, playback, deletion, filename validation, model selection, printed status lines, sound comparison and the order of the meter and referee.
