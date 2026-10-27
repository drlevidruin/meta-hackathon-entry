# Core fix round 2, 2026-10-26

All work ran offline on Node v22.23.4. Tests were added and run before fixes.
The first targeted regression run had 42 passing and 34 failing tests.
Already supported cases stayed as passing regressions. No agents, background
tasks, package installs, commits, pushes or deployments were used. Changes are
limited to grader/, coach/, server/, docs/api.md and this report.

## 1. Turn counters and start lockout

Reproduced. The multi-turn regression reached checkpoint eight during turn 3
and ended at 160000 ms instead of four minutes. A separate start regression
received HTTP 500 when the coach returned done.

`startTurn(profile)` now returns an independent copy, preserving learning
history, seen items, proven skills and each skill's demotion bookkeeping. It
resets only `checkpoints` and `cleanAtLevel`. Empty-result selections cannot
return done under any stop rule. The server resets the saved profile before
selection and falls back to a deterministic rule selection if the coach still
returns done. The entry point passes the new function to the app.

Tests in `coach/round-2.test.js`:

- `round 2.1: startTurn resets only per-turn state and returns an independent copy`
- `round 2.1: empty results never return done even with old stop state`
- `round 2.1: challenge cadence starts again at checkpoint two of each turn`

Tests in `server/app.test.js`:

- `round 2.1: six clean four-minute turns through the real app and coach all start and end by time`
- `round 2.1: a done answer at start falls back to a normal rule start set`

The integration test uses the real app, coach and grader, a small bank fixture,
a fake audio ear and model off. All six starts return 200 with sets, all six
turns end by the time rule, and every finished profile has three checkpoints.

## 2. One-pair diagnoses

Reproduced for both planted mistakes on בָּ. The decoding threshold now requires
at least two known sounded pairs. `vo` gives wrong_letter and blames bet, `bi`
gives wrong_vowel and blames kamatz, and `bo` remains ok under Ashkenazi.

Tests in `grader/round-2.test.js`:

- `round 2.2: one-pair bet heard vo gets wrong_letter`
- `round 2.2: one-pair bet heard bi gets wrong_vowel`
- `round 2.2: one-pair bet heard bo gets ok`
- `round 2.2: two-pair bat heard vat keeps the existing diagnosis in ashkenazi`
- `round 2.2: two-pair bat heard vat keeps the existing diagnosis in sephardi`

The two-pair cases already behaved as requested and were left alone: Ashkenazi
reports not_decoded, while Sephardi keeps wrong_letter followed by ok.

## 3. Extras and uncertainty without misses

Partly reproduced. Both real-grader cases already passed after the first
round: extra-only lines added clean-pair tries without misses, and uncertain
pairs added no misses. That attribution path was left alone.

Summary-only inputs still triggered the all-skills fallback. It now requires
an actual wrong letter, wrong vowel, skip or decoding failure. A summary with
every sounded pair ok and an extra adds tries without misses, but cannot step
up. Unplaced uncertainty adds neither misses nor attributable clean evidence.
The existing genuine-unplaced-failure regression still passes.

Tests in `coach/round-2.test.js`, each with summary-only false and true:

- `round 2.3: two extra-only lines add tries without misses, summary only false`
- `round 2.3: two extra-only lines add tries without misses, summary only true`
- `round 2.3: uncertain-only lines add no misses, summary only false`
- `round 2.3: uncertain-only lines add no misses, summary only true`

## 4. Consistent not_decoded blame

Reproduced. Every sounded pair converted to not_decoded now blames its own
skills. Pair and flat verdicts agree, and summary missedSkills includes that
blame even when another word has a wrong vowel. Silent pairs remain ok with
empty blame, and uncertain pairs remain uncertain with empty blame. Both
READMEs document the updated contract.

Tests:

- `round 2.4: not_decoded verdicts blame each sounded pair and union their skills`
  in `grader/round-2.test.js`
- `round 2.4: not_decoded and a wrong vowel elsewhere both record misses`
  in `coach/round-2.test.js`, with and without summary attribution

Older assertions expecting empty not_decoded blame were updated. The first
round's silent/uncertain preservation fixture now has two known sounded pairs,
so it still exercises decoding failure under the threshold from item 2.

## 5. Whole-line rereads

Reproduced. On this checkout the five-word example had two extras, rather than
the three reported on the earlier commit. The three-word correction retained
the first pass's vowel mistake, and a correct first pass hid a later mistake.

The word alignment now has line restart edges for in-order attempts at two or
more printed words. Earlier words must be complete attempts; the last may be
cut short. Each word may span one to three heard words. An abandoned span costs
0.05 per printed word, disappears from verdicts, and leaves the later reading
to grade. Separate printed repetitions remain available. Multi-word attempts
also keep separate word matches available under the existing word-restart
heuristic. The grader README documents these rules.

Tests in `grader/round-2.test.js`:

- `round 2.5: line restart grades full five-word reread`
- `round 2.5: line restart grades three-word correction`
- `round 2.5: line restart grades later mistake`
- `round 2.5: line restart grades cut short first pass`
- `round 2.5: line restart grades restart inside a line`
- `round 2.5: genuinely repeated printed phrases remain separate`

The inside-line example already passed and is retained. Existing word restart,
split-attempt, repeated-word, similar-neighbor and mixed-error tests pass. The
mixed-error test caught an overly broad intermediate heuristic: unrelated
neighboring heard words could form a supposed cut-short word. Line attempts
now cannot exceed that printed word's longest pronunciation in phonemes.
Restart detection remains a deterministic pronunciation heuristic, not proof
of intent. Insertions that exceed that length are graded normally rather than
treated as an abandoned line attempt.

## 6. Consonants fused to vowel-only pairs

Reproduced for alef, ayin and initial shuruk. Heard phonemes now carry syllable
ids into pair alignment. Inserting a consonant from the same syllable as a
following vowel costs 1.1 before a sounded pair accepting an empty consonant.
Dropping that whole syllable retains the ordinary insertion cost, preserving
independent extras. The existing exact-pair tie break is unchanged.

Tests in `grader/round-2.test.js`:

- `round 2.6: da-ni blames the alef consonant plant`
- `round 2.6: tza-ni blames the alef consonant plant`
- `round 2.6: la-ni blames the alef consonant plant`
- `round 2.6: a consonant fused onto עֲנִי is a letter mistake`
- `round 2.6: a consonant fused onto וּבָא is a letter mistake`
- `round 2.6: a whole extra syllable before alef stays extra`

The existing e-cho-de, ba-e-chod and e-ba-chod tests pass unchanged. A whole
extra syllable before alef already behaved correctly and remains a regression.
The shuruk fixture initially assumed letter:vav was a rulebook skill on initial
shuruk; inspection showed that pair carries only vowel:shuruk. Its test therefore
checks wrong_letter and no extras, without inventing a consonant skill or
changing the rulebook. Alef and ayin retain their existing letter skills and
blame them specifically.

## 7. Teacher log target

Reproduced for both a retry and a step down when the first item's focus differed
from the missed skill, and for practice wording with no recent miss. Decisions
now carry the plan's `target`, the first chosen item's `focus` and the target's
`recentMisses` separately. Retry and practice templates name the target only
with recent miss evidence. Without it they use plain wording. A level-1
clamped step down already said held; its regression is retained.

Tests in `coach/round-2.test.js`:

- `round 2.7: a step down names the missed skill even when the first focus differs`
- `round 2.7: a retry names the recent miss rather than the first focus`
- `round 2.7: a hold without a recent miss uses plain wording`
- `round 2.7: a model step down without a recent miss uses plain wording`
- `round 2.7: a clamped step down says held at level one`

Older structured-decision tests now assert the separate fields. The existing
model-selection integration test also verifies the plain step-down wording.

## 8. Parent line before a finished turn

Reproduced. `parentLine` now returns an empty string for a zero-pair summary.
The API docs state that it is empty until a finished turn, and also for a
finished turn with no sounded pairs. station/ was not changed.

Test in `server/app.test.js`:

- `round 2.8: parent line stays empty until a finished turn has sounded pairs`

This covers a new child, an empty finished turn, live unsaved grades and a
finished turn containing a read.

## 9. Practice packet fallback

Reproduced with level 1 chirik male: Practice was empty. Practice now takes up
to six regular items in the requested order: focus at or below level, skill
coverage at or below level, then focus or coverage above level. Distance and
ids provide deterministic ordering within each group. If no regular item
teaches the skill, it takes the nearest-level regular items instead. Sparse
banks remain sparse without unrelated filler for a skill they do teach.

Tests in the new `server/packet.test.js`:

- `round 2.9: level one chirik male practice fills six real-bank items`
- `round 2.9: practice ranks focus below, coverage below, then above by distance and id`
- `round 2.9: a skill with no items falls back to six nearest regular items`
- `round 2.9: sparse practice stays unique and never takes unrelated filler for a taught skill`

Tests also verify challenge exclusion, bank-only output, stable ordering,
unique ids and unchanged inputs. The API packet description was updated.

## 10. Coach model request

Reproduced offline in captured requests: 2000 tokens, no reasoning effort,
rule-answer lines in the prompt and a 20 second timeout. Requests now send
16000 tokens and `COACH_REASONING_EFFORT || 'minimal'`, omit Rule pick and Rule
reason, and use a 30 second timeout. Profile, allowed levels and candidates
remain in the prompt. Selection validation and deterministic fallback remain
unchanged. The coach README and API configuration table document the settings.
No permitted docs Models table contained the old token or timeout numbers.

Tests in the new `coach/model.test.js`:

- `round 2.10: model request uses 16000 tokens and effort minimal`
- `round 2.10: model request uses 16000 tokens and effort low`
- `round 2.10: prompt supplies profile, levels and candidates without the rule answer`
- `round 2.10: model timeout is thirty seconds and still aborts stalled requests`

Existing fake-provider tests continue to cover stalled body parsing, malformed
answers, invalid ids and levels, repeated ids, unseen-item rules, provider
failures and hidden credentials. Live answer availability and latency could
not be measured without network access.

## Checks and remaining limits

- Baseline root `node --test --test-reporter=dot`: passed.
- Initial targeted regression run: 42 passed, 34 failed, before fixes.
- Focused red-to-green runs covered each reproduced item. Passing cases from
  the first round were retained without changing their working code paths.
- Final `node --test --test-reporter=spec grader/*.test.js coach/*.test.js server/*.test.js`:
  190 passed, zero failed.
- Final root `node --test`: 462 passed, zero failed, zero skipped.
- `git diff --check`: passed.

One intermediate command used directory arguments instead of test-file globs:
`node --test --test-reporter=spec grader/ coach/ server/`. Node resolved the
server directory to its entry point and attempted to listen on port 8787; the
sandbox rejected the listener with EPERM. That command failed and was corrected
to explicit test-file globs. No service remained running. Normal root discovery
does not run server/index.js and passes.

Live model and audio replay checks were not performed: there is no network,
and recordings/ supplies no audio clips. Existing stored learning history is
preserved as requested; this change does not rewrite misses from earlier turns.
