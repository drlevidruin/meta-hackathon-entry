# Coach

Import `startProfile`, `updateProfile`, `ruleNextSet`, `chooseNextSet`, `explain`
and `turnFacts` from `coach/index.js`. No dependencies are required.

```js
const profile = startProfile({ level: 2 });
const next = await chooseNextSet(profile, results, items, {
  elapsedMs: 60_000,
  useModel: false,
});
// Store next.profile. When next.done is true, next.itemIds is empty.
// Only explain(next.decision) belongs in the teacher log.
```

Each item result adds at most one try per item skill. Misses come from
`summary.missedSkills` and verdict `blame`, never from all skills on a wrong
pair. Unblamed skills on a wrong pair count neither as a miss nor a clean read;
a separate ok pair with that skill can supply clean evidence. For example,
two Ashkenazi `sha-vos` lines for שַׁבָּת target `letter:bet` and add no tries
for the unblamed `vowel:kamatz`.
Repeated pairs exercising the same skill in a line count as one try. Unplaced
failures with no pair attribution conservatively miss every item skill.
Uncertain or undecoded pairs with empty blame do not establish clean skills.
An empty results array clones the profile without adding a checkpoint.
Only positive pair counts with every pair ok and no errors or extras are clean.
All checkpoint lines must be clean, including any challenge; at least one line
must be at the current level before a clean checkpoint can cause an increase.

`cleanAtLevel` is `{ clean, held }`: `clean` describes the latest checkpoint,
and `held` contains the skill-id arrays from up to three checkpoints at the
current level. `updateProfile` provisionally records a hold only when at least
one result is at the current level; challenge-only checkpoints add no hold.
`chooseNextSet` clears this state whenever the selected level changes. This bounded state
supports the stop rule after profiles have been serialized to JSON, without
adding an unbounded checkpoint history. A downward selection records each
skill's current try count as `demotedAt`, consuming existing demotion evidence
without erasing recent misses or lifetime counts. Another demotion needs two
fresh consecutive misses of a skill after that count. This survives JSON
serialization and prevents empty selections from repeatedly lowering the level.
Use `chooseNextSet` to apply checkpoint results and select the next set together;
do not pre-apply those same results.

Unseen regular items take precedence over seen items, followed by target focus,
weak-skill coverage and id. A sparse bank returns only its available unique
items. Challenge items are reserved for code to append at even checkpoints when
the selected level is not 4. Eligibility requires a clean read of every skill;
among unseen eligible challenges, unproven focus, skill count and id break ties.

The optional model request uses `META_API_KEY` from the process environment.
The caller loads its environment; the coach never reads key files. Pass
`useModel: false` to disable it or inject `options.fetch` for offline tests.
Only romanized sounds and whitelisted bank metadata enter its prompt. Its
answer must include nonempty `ids:` and `reason:` lines, in either order.
Labels ignore case and surrounding spaces, ids can use commas or spaces, and
blank lines, wrapping code fences and other lines are ignored. Missing labels
fall back to the rule plan. Selection validation still requires two or three
unique candidates at one allowed level. Unseen-item rules still apply.
The 20 second timeout covers both fetch and body parsing, including a replacement
fetch that ignores abort signals.
Provider errors are discarded, and failures use the deterministic rule.

`reason` is private developer trace data. It must never be rendered in child,
teacher or parent views. `explain` reads only the structured `decision`, and
uses fixed templates and known skill labels. `turnFacts` returns skill ids for
the station's end-of-turn templates, with clean totals and recent misses used
to select best and next respectively. `next` is null when no skill has a recent
miss, including a completely clean turn.

Run `node --test coach/coach.test.js` for coach tests, or `node --test` for the
whole repository. All coach tests use fake fetches and require no network.
