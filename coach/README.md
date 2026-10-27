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

Each item result adds one try per item skill, with a miss for each missed skill.
Repeated pairs exercising the same skill in a line count as one try. Unknown or
unplaced failures with no skill attribution conservatively miss every item
skill. An empty results array clones the profile without adding a checkpoint.
Only positive pair counts with every pair ok and no errors or extras are clean.
All checkpoint lines must be clean, including any challenge; at least one line
must be at the current level before a clean checkpoint can cause an increase.

`cleanAtLevel` is `{ clean, held }`: `clean` describes the latest checkpoint,
and `held` contains the skill-id arrays from up to three checkpoints at the
current level. `updateProfile` provisionally records a hold; `chooseNextSet`
clears this state whenever the selected level changes. This bounded state
supports the stop rule after profiles have been serialized to JSON, without
adding fields to the profile contract. Use `chooseNextSet` to apply checkpoint
results and select the next set together; do not pre-apply those same results.

Unseen regular items take precedence over seen items, followed by target focus,
weak-skill coverage and id. A sparse bank returns only its available unique
items. Challenge items are reserved for code to append at even checkpoints when
the selected level is not 4. Eligibility requires a clean read of every skill;
among unseen eligible challenges, unproven focus, skill count and id break ties.

The optional model request uses `META_API_KEY` from the process environment.
The caller loads its environment; the coach never reads key files. Pass
`useModel: false` to disable it or inject `options.fetch` for offline tests.
Only romanized sounds and whitelisted bank metadata enter its prompt. Its
two-line answer must select two or three unique candidates at one allowed
level. Unseen-item rules still apply. The 20 second timeout covers both fetch
and body parsing, including a replacement fetch that ignores abort signals.
Provider errors are discarded, and failures use the deterministic rule.

`reason` is private developer trace data. It must never be rendered in child,
teacher or parent views. `explain` reads only the structured `decision`, and
uses fixed templates and known skill labels. `turnFacts` returns skill ids for
the station's end-of-turn templates, with clean totals and recent misses used
to select best and next respectively.

Run `node --test coach/coach.test.js` for coach tests, or `node --test` for the
whole repository. All coach tests use fake fetches and require no network.
