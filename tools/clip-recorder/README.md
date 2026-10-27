# Local clip recorder

This tool records the real-voice ear test. It is separate from the classroom station. It reads the adult clip table in [docs/ear-test.md](../../docs/ear-test.md). The child set uses the same readings with `child_` prefixed to each filename.

Neither real-voice round has run. Only Muse Wonder 1.0 through the Meta Model API has run as the ear on synthetic clips. Muse Spark Open through Baseten is wired and has never run.

## Record

From the repo root:

```bash
npm run record
```

The command starts a local server and prints its address. Open that address in a browser. It defaults to `http://127.0.0.1:8790`. `--port` changes the port.

Each card shows the Hebrew, the sounds to say, and the planted mistake. Record stops when tapped again. Play replays the saved clip. Again records a replacement. Next moves to the next card. Fonts are bundled locally.

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

The runner loads `.env`. With a nonempty `BASETEN_API_KEY`, it defaults to the Baseten primary. Otherwise it defaults to the Meta fallback, so a `META_API_KEY` alone is enough. The selected role and model id are printed before the results. `EAR_PRIMARY_MODEL` and `EAR_FALLBACK_MODEL` override their ids.

To choose a provider explicitly:

```bash
npm run ear-test -- --model fallback
npm run ear-test -- --model primary
```

Each row shows the clip, scripted sounds, heard sounds, and `PASS` or `MISS`. Comparison ignores case and spaces within each word. It preserves syllable boundaries, word boundaries, order and count. Only audio reaches the ear. The runner does not call the grader. It exits with status 1 if any clip misses, a call fails, or no clips are recorded.

## Offline checks

```bash
node --test tools/clip-recorder/recorder.test.js
```

The tests use generated WAV bytes and fake ear calls. They cover saves, playback, deletion, filename validation, model selection, printed model ids and sound comparison.
