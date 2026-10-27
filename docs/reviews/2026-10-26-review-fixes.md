# Review fixes, 2026-10-26

Regression tests were added and run before each code fix. The first focused runs failed on the reported behavior. The final suites pass.

## Code

| Item | Change | Regression test names |
| --- | --- | --- |
| 1. Teacher trace links | Child detail now returns each stored turn's `id`. With trace enabled, each teacher turn links to that id. Mock history also has ids. Missing traces show `This trace is no longer available.` | `child detail returns the stored turn id for each trace link`; `links every teacher turn to its stored id only with trace enabled: %s`; `gives saved and sample turns ids for teacher trace links`; `shows a plain message when a saved turn trace has left memory`; `keeps coach trace links off child screens: %s` |
| 2. Demo pill at 320 px | Below 370 px, both headers use smaller branding and a smaller visible pill. Header items stay on one row. | `has compact header classes and styles for 320 px on %s (jsdom has no layout)` for child and teacher headers. This checks classes and responsive CSS, not measured overflow. |
| 3. Ear separators and refusals | Lowercase trailing commas and periods are stripped before parsing. Capitals with punctuation and internal apostrophes remain prose. Refusal words fail at any length. Known headings and wrappers still work. The old `1. sha-vos.` case now belongs with readings. The prompt is unchanged. | `prose characters fail the ear call: ...`; `a short refusal word is prose: ...`; `reading keeps the clean syllables: ...`. These include every requested example and all listed refusal words. All existing ear coverage passes under the revised separator rule. |
| 4. Missing build message | Startup says `station/dist is missing; run npm run build.` The API documentation uses that root command. | `startup lines describe a missing ear key, missing station build and actual listen address` |
| 5. Store fixtures | Fixtures use `fs.mkdtempSync(path.join(os.tmpdir(), 'kriah-store-test-'))` and remove their directories. | `store fixtures use the system temp folder and clean up` |
| 6. Failed deletes | Live turns and pending starts are invalidated only after the store update succeeds. Failed writes preserve the child and its usable live turn. | `a failed delete writeFile preserves the saved child and its usable live turn`; `a failed delete rename preserves the saved child and its usable live turn` |
| 7. Malformed stores | State containers, children and turn lists are checked inside the controlled load path. Invalid input raises `Could not load store`. | `a malformed turn list (object) gives a controlled load error`; `a malformed turn list (number) gives a controlled load error`; `a null child gives a controlled load error` |
| 8. Ear key warning | Startup warns only when both provider keys are blank. The warning names both. The server entry passes both keys to the check. | `startup warns about the ear only when both provider keys are blank`; `the server entry passes the Baseten key to startup messages` |

## README and documentation index

1. Added the required mock screenshot caption directly below the images. Image files are unchanged.
2. Linked the ear prompt, grader README and coach README from Layout. Linked the grader and coach from How it works and the documentation index. Read both READMEs. The grader description still matches the code and passing tests. Updated the coach's trace privacy wording for teacher access to the separate protected trace.
3. Replaced vague model-table descriptions with the made-up-example prompt's run 1 and run 2 counts from `docs/ear-test.md`. Wonder's speed numbers name the separate reasoning-effort trial.
4. README, API documentation and `.env.example` now explain https for a network tablet, plain http on the server and `http://localhost:8787` on the server computer. They state that tablet setup is untested.
5. The documentation index describes a live adult demo, typed-sound grader shots and mock class history.
6. Both READMEs now record the measured counts: 553 root tests and 88 station tests.

These are documentation edits. Links, counts and claims were checked against local files and test output. No separate tests were added for wording. `API documentation describes the 150 bank challenges and a packet challenge` still passes.

## Demo script

1. Uses the built-in Demo pill. Every mock shot keeps the header in frame. Removed instructions for a recording overlay.
2. Describes tapping the microphone, reading without a long pause and waiting quietly for automatic stop. `useRecorder.js` sets a 20 second maximum. `silence.js` uses 1.2 seconds of quiet after speech. Existing station test `uses an AnalyserNode to stop after speech and 1.2 seconds of quiet and releases audio` passes.
3. Removed both warm-up turns. Kept the three invented children for Who's reading.
4. Warns before Start about the four minute set limit and the 30 minute turn expiry. Checked the elapsed-time path in `useTurn.js`, `server/app.js` and the coach stop rule. Existing tests `round 2.1: six clean four-minute turns through the real app and coach all start and end by time` and `turns expire thirty minutes after start without a background timer` pass.
5. Removed browser inspection and scripting steps. The reading marks are the live shot. The trace path is Teacher, Class, Nubo, Turns, Coach trace. It follows a completed turn so a saved link exists. Startup is one short block from the repo root.
6. Matched every numerical voiceover claim to `docs/ear-test.md` or `docs/live-run.md`. Live claims depend on the actual marks and that checkpoint's Source. The script provides wording for a rule fallback. The live-run privacy paragraph now distinguishes the protected trace from ordinary teacher logs.

## Checks run

- `node --test`: 553 passed, 0 failed, 0 skipped.
- `npm run test:station`: 88 passed across 8 files.
- `npm --prefix station run build -- --configLoader native`: passed.
- All three typed-sound grader commands in the demo: passed. Ashkenazi `sha-vos` marks the bet `wrong_letter`. Ashkenazi `sha-bos` has three `ok` verdicts. Sephardi `sha-bos` has a wrong vowel and wrong final letter.
- Offline bank and coach inspection: Nubo's listed first three lines match a fresh level 2 selection. The bank has no שַׁבָּת item. Typed `vos` for בּוֹס marks the bet `wrong_letter`.
- `git diff --check`: passed.

## Not verified

- jsdom cannot measure layout. Actual 320 px header overflow has not been measured in a browser.
- No network calls were made. The synthetic trial counts and timings match the saved notes but were not reproduced. The repository lacks complete per-clip results and audio for those historical runs.
- No live adult demo was filmed. Its exact ear output, marks, wait time and coach Source still depend on the actual take. The script makes those claims conditional.
- Baseten ear behavior, adult and child accuracy, classroom use and network tablet microphone access were not tested. No human kriah review was performed.
- Fresh dependency installation and the root build script were not run because installing packages is excluded. The installed station packages built successfully with the requested offline command.

No packages, images or restricted source files were changed. No commit, push or deployment was made.
