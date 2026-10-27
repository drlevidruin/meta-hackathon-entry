# API v2

The Node 22 server serves `station/dist` and the routes below. All API responses
are JSON. Errors have the shape `{ error: "short message" }`. JSON request bodies
must use `application/json` and are limited to 1 MiB. Audio request bodies must
use `audio/wav` and are limited to 25 MiB. Empty audio and malformed JSON return
400, oversized bodies return 413, and unsupported content types return 415.
Unexpected failures return 500 `{ error: "Request failed" }`, without details.
Unknown routes return 404. API responses use `Cache-Control: no-store`.

## Children and items

A public child record is exactly:

```js
{ id, name, avatar, preset, level, stars, best }
```

Ids are server-generated UUIDs. Child ids are validated before lookup: malformed
ids return 400, unknown ids return 404. Names are first names only, up to 40
characters, allowing Unicode letters, apostrophes and hyphens, without spaces.
New children start at level 1 with zero stars and best. `stars` is lifetime stars;
`best` is the most stars in one turn. Levels are integers from 1 through 6.

Avatars: `lion`, `owl`, `fox`, `bear`, `rabbit`, `turtle`, `whale`, `bee`, `cat`,
`dog`, `frog`, `panda`, `koala`, `tiger`, `penguin`, `zebra`.
Presets: `sephardi`, `ashkenazi`, `chassidish`.

An Item is an unchanged bank item:

```js
{ id, level, text, words, skills, focus, flags, source }
```

Only bank items can be returned by the coach. Challenge items have
`source.challenge: true`. No model creates text for a child to read.

## Station routes, no PIN

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/children` | None | `[Child]` |
| `POST /api/start` | `{ childId }` | `{ turnId, level, set: [Item] }` |
| `POST /api/grade?turn=<turnId>&item=<itemId>` | Raw `audio/wav` bytes | `{ itemId, words, summary }` |
| `POST /api/next` | `{ turnId, elapsedMs }` | `{ done: false, level, levelUp, set: [Item] }` or `{ done: true, level, levelUp, facts: { best, next, proven } }` |
| `POST /api/finish` | `{ turnId, stars }` | `{ child: Child }` |
| `GET /api/config` | None | `{ trace: boolean }` |

Start loads the child's saved profile, or calls `startProfile({ level })` for a
new profile, then calls `startTurn(profile)` to reset checkpoint and held-level
counts while preserving learning history and demotion bookkeeping. It calls
`chooseNextSet(profile, [], items, { useModel: false })` on that reset copy and
opens a turn with a random UUID. If the coach answers done, start uses a normal
rule selection from the reset profile. The preset is captured on the turn.

Grade accepts an item only from the turn's current set. An unknown or expired
turn, a finished turn, or an item outside the current set returns 404. The ear
receives only `{ data, format: 'wav' }`, never the item text, name or preset.
The grader receives `{ heard: ear.words, text: item.text, preset: turn.preset }`.
The response omits the top-level `verdicts` and ear model. `words` is the grader's
word output. Summary is:

```js
{ pairs, ok, wrong_letter, wrong_vowel, skipped, extra,
  uncertain, not_decoded, missedSkills }
```

Every successful grade immediately saves per-cell read history. Regrading a
line replaces its result for the current checkpoint but still records every
pair read. Failed grades do not contribute results. Audio is never saved or
logged. Verdict `heard` strings exist only during the live turn and in the
grader's word response, never on disk.

Next uses the server-held results, in current-set order, and calls:

```js
chooseNextSet(profile, [{ itemId, summary, verdicts }], items,
  { useModel: COACH_MODEL !== 'off', elapsedMs })
```

`elapsedMs` must be a finite, nonnegative number. The server stores the new
profile, level, decision and `explain(decision)` line on the in-memory turn.
`levelUp` compares the new level with the level before that checkpoint. A done
response uses `turnFacts(profile)`; further next calls return 400. The server
accepts finishing before a done checkpoint, including uncheckpointed grades.

Finish requires a nonnegative safe integer `stars`. It saves the profile and
level, adds stars to the lifetime total, updates best, and saves a turn record.
The most recent grade per item per set contributes to the saved turn summary.
A repeated finish returns 404 and cannot add stars again. Turns expire 30
minutes after start, including retained traces of finished turns. Expiry is
checked on requests without a background timer. Open turns do not survive a
restart. Pair history already saved by grading does survive an unfinished turn.

## Teacher routes

All these routes require the `X-Teacher-Pin` header. The server compares
equal-length buffers with `crypto.timingSafeEqual`. A missing or incorrect PIN
returns 403 `{ error: "Invalid teacher PIN" }`. When `TEACHER_PIN` is unset or
empty, teacher routes return 403 `{ error: "Teacher PIN not set" }`.
The disabled trace route is always 404.

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /api/teacher/check` | No body required | `{ ok: true }` |
| `POST /api/children` | `{ name, avatar, preset }` | Child |
| `PATCH /api/children/<id>` | `{ name?, avatar?, preset?, level? }` | Child |
| `DELETE /api/children/<id>` | None | `{ ok: true }` |
| `GET /api/class` | None | Class view below |
| `GET /api/children/<id>/detail` | None | Child detail below |
| `GET /api/packet?child=<id>` | None | Packet below |
| `GET /api/packet?skill=<skillId>&level=<n>` | None | Packet below |
| `GET /api/trace?turn=<turnId>` | None | Trace below, only with `TRACE=1` |

Create and patch reject extra fields. Patch must contain at least one field.
A teacher level edit starts a fresh coach profile at that level and preserves
stars and read history. Delete removes the child, every saved turn and all live
turns and traces about that child.

### Class view

```js
{
  children: [{ id, name, avatar, level, next, lastTurn }],
  groups: [{ skill, label, childIds }]
}
```

`next` is the next skill id from `turnFacts(profile)`, or null. With no saved
profile the server uses `startProfile({ level })`. `lastTurn` is
`{ date, ok, pairs, stars }` for the latest finished turn, or null.
Groups include children sharing a non-null next skill, ordered by descending
group size, then by the skill's label from `SKILLS`.

### Child detail and map

```js
{
  child: Child,
  map: {
    letters: [letterSkillId],
    vowels: [vowelSkillId],
    cells: { '<letterSkill>|<vowelSkill>': 'solid' /* or shaky, untested */ },
    sample: { '<letterSkill>|<vowelSkill>': '<pointed pair text>' }
  },
  turns: [{ date, startLevel, endLevel, ok, pairs, stars, log: [string] }],
  parentLine: '...'
}
```

Turns are newest first, limited to 20. Dates are ISO 8601 UTC strings from the
finish time. Log entries are the coach's English `explain(decision)` sentences,
including the initial selection. Model reason text never appears here.

The map axes include all letter and vowel skills on bank items at or below the
child's level. Cells cover their cross product. Samples are actual pointed
pairs from eligible bank words, analyzed by the rulebook using the child's
preset; a sample is absent for combinations that never appear in those words.
No new Hebrew text is generated for samples.

Each graded pair with exactly one letter skill and exactly one vowel skill adds
1 for `ok` or 0 for every other verdict to that cell's last six reads. A cell is
solid when its last three reads are all 1, shaky when any of its last three reads
is 0. A cell is untested when it has fewer than three reads and none missed.
This treats one or two correct reads as untested until there is enough evidence
for solid.

Parent lines are templates in `server/hints.js`, based on the latest saved turn:

`<name> read <ok> of <pairs> sounds right today.`

This is followed by ` One to practice: <hint>.` using `turnFacts(profile).next`
for the child, the same skill used by the end-of-turn sentence. When there is
no next skill, it says ` Every sound was right!`. `parentLine` is `''` until the
child has a finished turn. It is also `''` when the latest finished turn's
summary has no sounded pairs. Hints cover every letter, vowel and pattern in rulebook `SKILLS`, with `practice <label>`
as a fallback. Kamatz says a for Sephardi and o for Ashkenazi and Chassidish;
a tav without a dot says t for Sephardi and s for the other presets.

### Practice packets

```js
{ title, sections: [{ heading, items: [{ id, text, level }] }] }
```

Sections, always in this order:

1. `Warm up`: up to two regular items whose letter-vowel cells are all solid.
   If no cells are solid, or the request is by skill, use level 1 items.
2. `Practice`: fill up to six regular items, first with target-focus items at
   or below the requested level (nearest level first), then remaining items at
   or below that level whose `skills` include the target (nearest level first),
   then items above that level whose focus or skills include it (nearest level
   first). If no regular item teaches the skill, use the nearest-level regular
   items to the requested level. Challenges never enter Practice.
3. `Challenge`: one bank item with `source.challenge`, preferring the target
   focus, then the nearest level. Challenges may be above the current level.

All ties use ascending bank item id. The same inputs produce the same packet.
Child packets use the child's level and next skill, falling back to the first
eligible bank focus when next is null. A request must choose either child or
skill plus level. Unknown skills and invalid levels return 400.

Sections contain fewer items when the bank lacks enough eligible items; items
are never fabricated or duplicated within a section. The current bank has no
`source.challenge` items, so its Challenge sections are empty until those bank
items are supplied. Warm up and Practice may overlap.

### Developer trace

```js
{ decisions: [{ checkpoint, source, decision, explain, reason }] }
```

Without `TRACE=1`, this route returns 404 even with a valid PIN. With tracing
on, the PIN is required and unknown or expired turns return 404. Checkpoint 0
is the initial selection. Later checkpoints are numbered in order. A decision
has `{ move, from, level, target, focus, recentMisses, why, misses, challengeId }`
from the coach. `target` is the plan's skill, `focus` is the first chosen item's
focus, and `recentMisses` counts target misses in the last six reads. Teacher
retry and practice wording names a target only when it has a recent miss.
Only this response includes the coach's `reason`. Reasons remain in memory,
including after finish until expiry, and disappear on restart. This developer
route is never linked from child or teacher screens.

## Persistence and configuration

`server/store.js` maintains one JSON file, `store.json`, in `DATA_DIR`, default
`<repo>/data`. The directory is gitignored. Every update writes a temporary file
with mode 0600 and renames it atomically. Updates are serialized; failed writes
leave the prior state intact. This is a single-process server, not a shared
multi-process database.

```js
{
  version: 1,
  children: {
    '<id>': { ...child, profile, pairs: { '<letterSkill>|<vowelSkill>': [1, 0] } }
  },
  turns: { '<childId>': [turn] }
}
```

Saved turns contain their id, date, start and end levels, ok and pair totals,
stars, per-item summaries, decisions and explain lines. They do not contain
audio, verdicts, heard strings or model reasons. Profile fields are otherwise
opaque to the server. Read histories keep at most six entries per cell.

`server/index.js` loads `ear/env.js`, imports the real ear, grader and coach,
serves `station/dist` and listens on `PORT` (default 8787). Configuration:

| Variable | Meaning |
| --- | --- |
| `TEACHER_PIN` | Teacher header secret, required to enable teacher routes |
| `TRACE` | Exactly `1` enables the protected trace endpoint |
| `COACH_MODEL` | Exactly `off` disables model calls at next checkpoints |
| `COACH_REASONING_EFFORT` | Coach reasoning effort, default `minimal`; requests allow 16000 tokens and time out after 30 seconds |
| `DATA_DIR` | Store directory, default `<repo>/data` |
| `PORT` | HTTP port, default 8787 |

The server never logs request bodies, audio or names. Static GET and HEAD
requests support the station's index fallback. Literal and encoded parent
traversal, backslashes, NULs and symlinks outside the static directory are
blocked. Unknown API routes do not fall back to station HTML.

## Offline checks

Run `node --test server/app.test.js` and `node --test` from the repo root.
Server route tests use temporary DATA_DIR directories and inject fake ear,
grader and coach contracts, except the multi-turn regression, which uses the
real grader and coach with the model off. They need no packages or network.
