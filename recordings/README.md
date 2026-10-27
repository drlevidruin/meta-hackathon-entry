# Recordings

This folder contains the synthetic clip script and recording instructions. No audio is committed. Audio files are ignored throughout the repository.

`make-synthetic.sh` uses the macOS Carmit and Samantha voices to create 13 WAV clips in `recordings/synthetic/`. Seven contain planted mistakes and six are clean controls. It removes each intermediate AIFF after conversion. The [ear test](../docs/ear-test.md) lists the clips and recorded observations.

The adult round ran on October 27 with Muse Wonder 1.0 and Muse Spark Open, and did not pass with either; see the [results](../docs/ear-test.md#round-1-results-october-27). The child round has not run.

The separate [local recorder](../tools/clip-recorder/README.md) saves mono WAVs in gitignored `recordings/private/`. Adult files use the names in the ear-test table. Child files add `child_` to those names. Re-recording replaces the file. Closing the page or server does not delete saved clips.

Recording a child requires written parent consent. The adult round must pass first. Before sending child clips to Meta, turn free credits off and use a paid plan. Meta's free-credit terms allow content to be used for product improvement.

`npm run ear-test -- --set child` prints each result, then deletes that child's clip, including failed calls. Its final cleanup removes remaining `child_*.wav` files. `--keep` disables this deletion. The recorder's delete button removes saved child WAVs. Adult clips remain until manually removed.

The station and its grading server handle audio in memory and never write it to disk or logs. This recorder is a local test tool that deliberately saves audio for playback and testing.
