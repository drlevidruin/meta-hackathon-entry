# Local phoneme service

This service hears IPA phonemes without a word prior. The referee uses them to
check the ear's vowels against the child's own voice card after the vowel meter.
It uses `facebook/wav2vec2-lv-60-espeak-cv-ft`, revision
`ae45363bf3413b374fecd9dc8bc1df0e24c3b7f4`, under the Apache-2.0 license.

From the repo root, run `npm run phonemes:setup` once to install the pinned Python
packages and download the model. Setup needs a network connection. Then run
`npm run phonemes`. Normal startup uses only the local model snapshot.

The model downloads into `phonemes/.models`, about 1.3 GB, which git ignores. A
cleanup of shared caches cannot remove it there. Set `HF_HOME` to keep it
somewhere else.

The service pins the model in RAM while it runs, about 1.2 GB, so it stays fast
when the Mac is short of memory. Stop it when not grading.

It listens on `127.0.0.1` only, on port 8791 by default. `PHONEME_PORT` changes
the port. Set the app's `PHONEME_URL` to the same local address when changing it.
Audio stays in memory on this computer. The service writes no audio files and
logs nothing per request. It never sees the printed text. It accepts 16-bit PCM
WAV, mono or stereo, at 8 to 96 kHz and up to 60 seconds. One recording runs at a
time and three may wait. A fifth gets a busy reply before its upload is read,
and the app grades that reading without the referee. The app sends how long it
will wait in `X-Timeout-Ms`; a recording still queued past that time is skipped.

The app works without this service. The referee is then off. `PHONEME_URL=off`
also disables it. Run `npm run test:phonemes` for the model-free Python tests.
