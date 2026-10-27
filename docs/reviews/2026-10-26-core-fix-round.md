# Core fix round, 2026-10-26

This round fixed skill attribution, restart handling, repeated demotions and model answer parsing. Regression tests cover each change. The offline checks run on Node 22.23.4.

## 1. Blame

Pair and flat verdicts now carry `blame`; summaries union blame
only. Wrong letters blame letter skills and consonant patterns, wrong vowels
blame vowel skills and the remaining patterns, skipped pairs blame all skills,
and the other verdicts blame nothing. The coach falls back to verdict blame
when summary attribution is absent. Unblamed skills on a wrong pair receive
neither a miss nor clean credit. Separate ok pairs can still supply clean
evidence for the same skill. The grader and coach READMEs describe this attribution.

Tests in `grader/review.test.js`:

- `blame: sha-vos blames only letter:bet`
- `blame: shi-bos blames only vowel:patach`
- `blame: a skipped pair blames every skill`
- `blame: consonant patterns and vowel patterns belong to their respective errors`
- `blame: ok, extra, uncertain and not_decoded entries have empty blame`

Coach integration tests in `coach/coach.test.js`:

- `blame: two sha-vos lines target bet without crediting kamatz, summary true`
- `blame: two sha-vos lines target bet without crediting kamatz, summary false`
- `unplaced failures do not establish clean skills, and blame fills missing summary skills`

## 2. Review findings

| Finding | Verification and change | Regression test names |
| --- | --- | --- |
| 1. Silent pair consumes sound | Reproduced with separate silent א, ה and ע pairs, including `?`. Silent pairs now take only empty spans and stay ok. For מֹשֶׁה / `mo-she-ba`, the rulebook already merges its final hei into the preceding sounded pair and reports `ba` as extra. That behavior was left alone and its test kept. | `review 1: mo-she-ba leaves the final ba extra`; `review 1: silent א cannot consume ba or an unknown token`; corresponding tests for ה and ע |
| 2. Reused demotion evidence | Reproduced: empty selections continued 4 to 3 to 2 to 1. Each downward selection now records each skill's try count as `demotedAt`. Two fresh consecutive misses are required for another drop; recent and lifetime miss history remain available. Consumption includes simultaneous weaknesses and survives JSON serialization. | `review 2: demotion consumes evidence across empty calls and needs two fresh misses`; `review 2: one demotion consumes simultaneous miss evidence for other skills` |
| 3. Split final restart attempt | Reproduced with `sha-bos vo bos`. Both attempts now check spans of one, two and three heard words. The test covers all nine earlier/final span combinations. | `review 3: both restart attempts can span one to three heard words` |
| 4. Earlier completed attempt wins | Reproduced with `sha-bos sha`. A detected restart takes precedence over matching its earlier attempt. When later sounds can also begin the next printed word, separate matches remain available, preserving repetitions and similar neighboring words. The final attempt determines the verdict. | `review 4: a final incomplete restart replaces an earlier completed attempt`; `review 4: repeated printed words match separately even with an incomplete second read`; `review 4: similar neighboring printed words remain separate reads` |
| 5. not_decoded overwrites silent and uncertain pairs | Reproduced with a synthetic word containing a silent pair, a wrong pair and an unknown pair. Only sounded, non-uncertain pairs now convert, with empty blame. The word still reports not decoded. | `review 5: not_decoded preserves silent ok pairs and uncertain pairs` |
| 6. Challenge-only holds | Reproduced: a challenge-only checkpoint appended a third hold and stopped the turn. Holds now append only when a result is at the current level. | `review 6: challenge-only checkpoints do not append holds or stop the turn early` |
| 7. Arbitrary next skill | Reproduced on a clean profile. `turnFacts.next` now requires at least one recent miss and otherwise returns null. | `review 7: clean turns and skills with no recent misses have no next skill` |
| 8. Missing tradition counterpart | Reproduced as a TypeError through `align` with a supplied expected result containing an additional pair. Missing counterparts now contribute an empty alternatives array. The supplied input is unchanged. No ordinary rulebook-generated mismatch was established. | `review 8: a missing tradition counterpart has no alternatives` |

Grader review tests are in `grader/review.test.js`; coach review tests are in
`coach/coach.test.js`.

## 3. Model answer parsing

The parser accepts label order changes, label case changes, extra spaces, code fences, surrounding commentary and space-separated ids. It reads the labeled lines independently and splits ids on commas or whitespace. Candidate membership,
allowed levels, single-level selection, uniqueness, count limits, unseen-item
rules and rule fallback remain enforced.

Tests in `coach/coach.test.js`:

- `model parse: accepts reversed labels`
- `model parse: accepts mixed case labels`
- `model parse: accepts extra spaces`
- `model parse: accepts surrounding blank lines`
- `model parse: accepts wrapping code fence`
- `model parse: accepts surrounding commentary`
- `model parse: accepts space-separated ids`
- `model parse: accepts mixed separators and CRLF`
- `model parse: no ids line falls back to the rule plan`

Surrounding blank lines and a missing ids line already had the expected behavior. Their regression tests remain. Existing invalid-selection, unseen-item,
provider-failure and timeout tests still pass.

## 4. Server and API documentation

| Item | Verification and change | Test names in `server/app.test.js` |
| --- | --- | --- |
| Parent skill | Reproduced with a summary whose first miss differs from the coach's next skill. The detail route now passes `turnFacts(profile).next` to the hint template. A null next skill retains the celebration template. | `parent line follows the coach next skill rather than the first summary miss`; `parent line says every sound was right when the coach has no next skill` |
| Test-context import | Confirmed in source and removed. The app test file is discovered directly from the root and also runs by explicit path. No server is started by the root test command. | `server entry point has no test-context import`, plus direct and root test discovery |
| Untested map cells | Wording clarified to say fewer than three reads and none missed. Runtime behavior already matched; no map code changed. The documented focused test command now names `server/app.test.js`. | `API documents untested map cells with fewer than three reads and none missed`; existing map-history tests |

## Checks and remaining limits

- `node --test` passes, including the grader, coach and server regressions named above.
- `npm run test:station` passes.
- `git diff --check` passes.

Restart detection uses a pronunciation-prefix heuristic. Later sounds can sometimes begin either the current word or the next printed word. The alignment keeps separate matches available while resolving that ambiguity.

A null coach next skill selects "Every sound was right!" even when the latest saved summary contains errors. A regression test covers that behavior; it is a limit of the current template.

Only Muse Wonder 1.0 through the Meta Model API has run as the ear, on synthetic clips. Muse Spark Open through Baseten is wired and has never run. The coach model is wired; a live answer is pending. An earlier call exhausted its token limit on reasoning and always used the rule fallback. A fix is in progress. These offline checks use model substitutes and do not establish live model behavior. The real-voice round has not run.
