# Documentation

- [API](api.md): server routes, teacher access, packets and persistence.
- [Rulebook](rulebook.md): sound rules, pronunciation presets and skill tags.
- [Item bank](bank.md): generated drills, challenge words and siddur attribution.
- [Grader](../grader/README.md): sound alignment, restarts, pair verdicts and skill blame.
- [Coach](../coach/README.md): progress evidence, stop rules, model validation and rule fallback.
- [Ear test](ear-test.md): synthetic observations, model status and real-voice protocol.
- [Demo script](demo-script.md): a shot list built around a live adult reading through the real server, with typed-sound grader shots and mock mode only for class history.
- [Build history](build-log.md): stages and merges from the git history.
- [Rulebook review](check/rulebook-review.md): automated findings and before and after comparisons.
- [Rulebook and bank report](check/build-report.md): item counts, spelling checks and restored siddur segments.
- [Shema check page](check/shema.md): generated readings for a kriah teacher to check by hand; no human review has been completed.
- [Core fix round](reviews/2026-10-26-core-fix-round.md): regression findings, fixes and test names.
- [Core fix round 2](reviews/2026-10-26-core-fix-round-2.md): turn resets, alignment, packet selection and coach requests.
- [Server fix round](reviews/2026-10-26-server-fix-round.md): stars, retries, startup checks and saved history.
- [Review fixes](reviews/2026-10-26-review-fixes.md): changes, regression test names and verification limits.
- [Live run](live-run.md): one full turn through the real server with the coach model on.

[Recording instructions](../recordings/README.md) and the [local recorder](../tools/clip-recorder/README.md) describe test audio storage and deletion. The [main README](../README.md) covers setup, model status and privacy.

Offline checks: 560 root tests and 88 station tests pass. The station production build also passes.
