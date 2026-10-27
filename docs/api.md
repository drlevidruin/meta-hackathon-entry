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
{ id, name, avatar, preset, level, stars, best, vowels, voiceStatus, voiceCheck }
```

Ids are server-generated UUIDs. Child ids are validated before lookup: malformed
ids return 400, unknown ids return 404. Names are first names only, up to 40
characters, allowing Unicode letters, apostrophes and hyphens, without spaces.
New children start at level 1, snapped to a level with eligible regular lines,
with zero stars and best. `stars` is lifetime stars;
`best` is the most stars in one turn. Levels are integers from 1 through 6.

Avatars: `lion`, `owl`, `fox`, `bear`, `rabbit`, `turtle`, `whale`, `bee`, `cat`,
`dog`, `frog`, `panda`, `koala`, `tiger`, `penguin`, `zebra`.
Presets: `sephardi`, `ashkenazi`, `chassidish`.

`vowels` is a nonempty array of learned vowel ids, returned in this order:
`kamatz`, `patach`, `segol`, `tzere`, `chirik`, `cholam`, `shuruk`, `kubutz`,
`sheva`, `chataf`. Duplicate ids, unknown ids, non-string entries and non-arrays
are invalid. Omitting `vowels` on create uses all ten. Old stored children with
no learned-vowel field also use all ten. Invalid stored arrays are dropped on
load or update. `voiceSkipped` is stored only when exactly true; it is not a
public field.

`voiceStatus` is `none` when the child's learned vowels and preset give the meter
no pair to compare, for example kamatz alone without patach in the Ashkenazi
preset. The usable pairs are `a` and `o`, `a` and `e`, and `e` and `i`. Otherwise
it is `done` when a voice profile is saved and either its recording is in memory
or the card would not go to the ear under the rule below. It is `skipped` when
the teacher skipped the check, otherwise `needed`, including when a saved
profile needs a recording that is no longer in memory.
`voiceCheck` is `voiceStatus !== 'needed'`, so only `needed` routes to the check.

An Item is an unchanged bank item:

```js
{ id, level, text, words, skills, focus, flags, source }
```

Only bank items can be returned by the coach. Challenge items have
`source.challenge: true`. No model creates text for a child to read.
Practice, including challenges, the progress map and child packets use only
items whose text and skills require learned vowels. Closing kaf with sheva
does not require learning sheva. Beginner items have `source.beginner: true`
and are included only for children who have not learned all ten vowels.
Children with the full set receive the original bank in its original order.

## Station routes, no PIN

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/children` | None | `[Child]` |
| `POST /api/start` | `{ childId }` | `{ turnId, level, set: [Item] }` |
| `POST /api/grade?turn=<turnId>&item=<itemId>` | Raw `audio/wav` bytes | `{ itemId, words, summary }` |
| `POST /api/next` | `{ turnId, elapsedMs, checkpoint }` | `{ done: false, level, levelUp, set: [Item] }` or `{ done: true, level, levelUp, facts: { best, next, proven } }` |
| `POST /api/finish` | `{ turnId, stars }` | `{ child: Child }` |
| `GET /api/config` | None | `{ trace: boolean }` |
| `POST /api/voice?child=<id>` | Raw `audio/wav` bytes | `{ voiceCheck: true }` |

Start loads the child's saved profile, or calls `startProfile({ level })` for a
new profile, then calls `startTurn(profile)` to reset checkpoint and held-level
counts while preserving learning history and demotion bookkeeping. It calls
`chooseNextSet(profile, [], items, { useModel: false })` on that reset copy and
opens a turn with a random UUID. If the coach answers done, start uses a normal
rule selection from the reset profile. The preset is captured on the turn. Start
waits for pending store writes before loading the profile. Starting ends any
earlier live turn for this child. Its grade, next and finish calls then return
404, so it cannot overwrite newer progress. Finished receipts
remain available until expiry. A start still awaiting the coach is also
superseded by a newer start or a teacher level or learned-vowel change.

Both start selections and next checkpoints pass the child's eligible items to
the coach. Available levels are the levels with regular eligible lines. Start
and mixed checkpoints use the current level if available, else the highest
available below it, else the lowest above. A clean checkpoint moves to the next
available level above, and two misses move to the nearest available level
below. At either boundary the coach holds at the snapped current level. Model
candidates use that level and its nearest available neighbors.

The voice card uses learned kamatz, patach, segol, chirik and cholam columns,
in that order. Five columns use the original 15 syllables on בּ ד מ. Three or
four columns use those three rows. One or two columns use six rows, בּ ד מ ג תּ ק.
No shown columns, or labels with no usable pair for the preset, gives no card.
For example, kamatz alone has no card for Ashkenazi. `POST /api/voice` then returns
409 `{ error: "No voice check" }` before consuming audio. Otherwise it builds
the profile using the child's card and preset. A count mismatch returns 422
`{ error: "count", heard, expected }`, where `expected` is the card's length.
Measured classes with at least two tokens each must also hold a usable pair,
otherwise the audio returns 422 `{ error: "quiet" }`. Malformed WAV or a WAV
outside 16 kHz mono returns 415 `{ error: "Use 16 kHz mono WAV" }`. Success
clears `voiceSkipped`. When the card would go to the ear under the rule below,
the recording stays in the server's memory only. It is never written to disk,
logged or returned. It is dropped when the voice check is cleared, skipped
or made stale by a learned-vowel or preset change, when the child is removed,
and when the server stops. After a restart, a child whose card would go to the
ear reports `voiceStatus` `needed` and reads the card again at their next turn.
Each reading goes to the ear together with the recording only when it is in
memory and the saved profile keeps each usable vowel pair apart by the meter's
separation rule. When the card shows kamatz and the preset gives it any sound
other than `a`, the profile must also
have the reader's kamatz and patach measured apart as `o` and `a`. This excludes
Chassidish, where kamatz can be `o` or `u` and is not measured, and a card with
kamatz but no patach. Otherwise the ear hears only the reading.
Grading also uses the saved profile for the vowel meter when present and the ear
alone when there is none, including after a skip. A failed voice check leaves
any earlier profile and recording unchanged. A voice check cleared, skipped,
replaced or made stale while its upload is open returns 409
`{ error: "Voice card changed" }`, or `{ error: "No voice check" }` if the child
no longer has a card. Neither response saves a profile or changes the recording.

Grade accepts an item only from the turn's current set. An unknown or expired
turn, a finished turn, or an item outside the current set returns 404. The ear
receives audio alone, never the item text, name or preset. With a card recording
in memory and a saved voice profile that keeps each usable vowel pair apart by
the meter's separation rule and passes the kamatz check above, it receives
`{ data, format: 'wav' }` with
`{ reference: { data: card, format: 'wav' } }`. Otherwise it receives only the
reading. The primary ear uses the card; the fallback receives only the reading.
The grader receives `{ heard: ear.words, text: item.text, preset: turn.preset }`.
The response omits the top-level `verdicts` and ear model. `words` is the grader's
word output. Summary is:

```js
{ pairs, ok, wrong_letter, wrong_vowel, skipped, extra,
  uncertain, not_decoded, missedSkills }
```

Every successful grade immediately saves per-cell read history. Regrading a
line replaces its result for the current checkpoint but still records every
pair read. Failed grades do not contribute results. Reading audio is never
saved or logged. Card audio is never saved to disk, logged or returned. Verdict
`heard` strings exist only during the live turn and in the
grader's word response, never on disk.

Next uses the server-held results, in current-set order, and calls:

```js
chooseNextSet(profile, [{ itemId, summary, verdicts }], items,
  { useModel: COACH_MODEL !== 'off', elapsedMs })
```

`checkpoint` is the count of sets the station has completed in this turn,
starting at 1 for the first next request. It must be a positive safe integer.
The server keeps the last answered checkpoint and its exact response in memory.
Sending that checkpoint again returns the saved response without consuming
grades, calling the coach or advancing the turn, including when it answered
done. Only the next number advances the turn. A missing or invalid checkpoint,
a skipped number or an older checkpoint returns 409 `{ error: "Invalid checkpoint" }`.
Concurrent retries are serialized. A failed request does not consume the number.

`elapsedMs` must be a finite, nonnegative number. The server stores the new
profile, level, decision and `explain(decision)` line on the in-memory turn.
`levelUp` compares the new level with the level before that checkpoint. A done
response uses `turnFacts(profile)`; a new checkpoint after done returns 400.
After awaiting the coach, next rechecks that the turn is live and unexpired and
that the child exists. Deletion, a replacement turn or a changed teacher level or vowel set
during that wait returns 404 without changing the turn or saving progress.
The server accepts finishing before a done checkpoint, including
uncheckpointed grades.

The first finish requires a nonnegative safe integer `stars`; negative,
fractional, unsafe or nonnumeric values return 400. The server computes earned
stars from its own grades using the station's per-line rule: one star when a
line has sounded pairs and at least 80 percent are ok, plus one bonus for a
challenge when it has pairs, all word and pair verdicts are ok and there are no
extra sounds. The award is `min(stars, earned)`. Failed and ungraded lines earn
nothing. Only the latest successful grade per item in each set counts, including
uncheckpointed grades; an item read in a later set counts separately.

Finish saves the profile and level, adds the award to lifetime stars, updates
best from the award, and saves one turn record. Repeated finishes return 200 with
the original `{ child }` receipt, even after a later turn changes totals, and
never add stars or history again. Concurrent finishes receive the same receipt.

Turns expire 30 minutes after start, including saved checkpoint responses,
finished receipts and traces. Expiry is checked on requests without a timer.
Open turns and receipts do not survive a restart. Pair history already saved by
grading does survive an unfinished turn. On a grade, next or finish 404, the
station clears its saved turn from session storage and returns to Who's reading.
Other failures retain the existing retry or gray-line behavior.

## Teacher routes

All these routes require the `X-Teacher-Pin` header. The server compares
equal-length buffers with `crypto.timingSafeEqual`. A missing or incorrect PIN
returns 403 `{ error: "Invalid teacher PIN" }`. Startup requires `TEACHER_PIN`
to match `^\d{4,12}$`, the same 4 to 12 digits accepted by the station PIN pad.
A missing or invalid PIN prints one plain explanation without its value and
exits with code 1 before listening. The disabled trace route is always 404.

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /api/teacher/check` | No body required | `{ ok: true }` |
| `POST /api/children` | `{ name, avatar, preset, vowels? }` | Child |
| `PATCH /api/children/<id>` | `{ name?, avatar?, preset?, level?, vowels? }` | Child |
| `DELETE /api/children/<id>` | None | `{ ok: true }` |
| `PUT /api/children/<id>/voice` | Exactly `{ skipped: true }` | Child |
| `DELETE /api/children/<id>/voice` | None | Child |
| `GET /api/class` | None | Class view below |
| `GET /api/children/<id>/detail` | None | Child detail below |
| `GET /api/packet?child=<id>` | None | Packet below |
| `GET /api/packet?skill=<skillId>&level=<n>` | None | Packet below |
| `GET /api/trace?turn=<turnId>` | None | Trace below, only with `TRACE=1` |

Create and patch reject extra fields. Patch must contain at least one field.
Invalid learned-vowel input returns 400 `{ error: "Invalid vowels" }`. A valid
set with no regular eligible item returns 400 `{ error: "No lines for these vowels" }`.
After create or patch, a level with no regular eligible lines snaps to the
highest available level below it, else the lowest above. A saved coach profile's
level stays in step. A PATCH with a different level starts a fresh coach profile at the snapped level and
ends the child's live turn, preserving stars and read history. Sending the same
level, including with name, avatar or preset edits, preserves the saved coach
profile and live turn, provided the vowel set and available level do not change.
Changing learned vowels clears the voice profile, keeps `voiceSkipped` and ends
the live turn, including a start or checkpoint awaiting the coach. Merely
reordering the same vowels preserves the profile and turn. Changing the preset
still clears the voice profile.

PUT voice sets `voiceSkipped: true`, clears the saved voice profile and returns
the child view. Any JSON body other than exactly `{ skipped: true }` returns
400 `{ error: "Invalid voice fields" }`; non-object JSON returns 400
`{ error: "Invalid JSON" }`. DELETE voice clears both the saved profile and
`voiceSkipped`. Both routes require the teacher PIN. Delete child removes the child, every saved turn and all live
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
  turns: [{ id, date, startLevel, endLevel, ok, pairs, stars, log: [string] }],
  parentLine: '...'
}
```

Turns are newest first, limited to 20. Each `id` is the stored turn UUID used by
the trace route. Dates are ISO 8601 UTC strings from the
finish time. Log entries are the coach's English `explain(decision)` sentences,
including the initial selection. Model reason text never appears here.

The map axes include all letter and vowel skills on eligible bank items at or
below the child's level. Cells cover their cross product. Samples are actual pointed
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
no next skill, every sounded pair was ok and there were no extra sounds, it
says ` Every sound was right!`.
With mistakes and no next skill, the line ends after the count. `parentLine` is
`''` until the child has a finished turn. It is also `''` when the latest
finished turn's summary has no sounded pairs. Hints cover every letter, vowel
and pattern in rulebook `SKILLS`, with `practice <label>` as a fallback. Kamatz says a for Sephardi and o for Ashkenazi and Chassidish;
a tav without a dot says t for Sephardi and s for the other presets.

### Practice packets

```js
{ title, sections: [{ heading, items: [{ id, text, level }] }] }
```

Sections, always in this order:

1. `Warm up`: up to two regular items whose letter-vowel cells are all solid.
   If no cells are solid, or the request is by skill, use level 1 items.
   If that selection is empty, use the two lowest-level regular items in the
   bank, with ascending ids breaking ties. Challenges never enter Warm up.
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
eligible bank focus when next is null. All three sections use only that child's
eligible items. Class packets by skill and level use the full learned set,
excluding beginner lines. A request must choose either child or
skill plus level. Unknown skills and invalid levels return 400.

Sections contain fewer items when the bank lacks enough eligible items; items
are never fabricated or duplicated within a section. The current bank has
150 challenge items with `source.challenge: true`. Challenge contains one when
an eligible challenge is available, otherwise it is empty. Warm up and Practice may overlap.

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
route is linked as Coach trace under each teacher Turns entry when `/api/config`
reports `trace: true`. Child screens have no trace links. An expired trace shows
`This trace is no longer available.` in the station.

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
audio, verdicts, heard strings or model reasons. Child profiles are persisted
through an allowlist: `version`, `level`,
`checkpoints`, `cleanAtLevel` (`clean`, `held`), `skills` (known skill ids with
`tries`, `misses`, `recent`, `demotedAt`), `proven` and `seen`. Nested records
and arrays also keep only their expected numbers, booleans and identifiers;
unknown fields never reach disk. The store keeps the newest 60 turns per child,
while detail returns the newest 20. These limits and profile filtering also
apply when loading a store. Read histories keep at most six entries per cell.

`server/index.js` loads `ear/env.js`, imports the real ear, grader and coach,
serves `station/dist` and listens on `HOST` (default `127.0.0.1`) and `PORT`
(default 8787). Browsers allow the microphone only on https or localhost.
Localhost works without https. The server uses http when both `TLS_CERT` and
`TLS_KEY` are empty. Set both to paths to a PEM certificate and key to use https.
Relative paths start at the working directory. If only one path is set or
either file cannot be read, startup prints one plain line naming the variable
and exits with code 1.
File contents are never printed. For a classroom tablet on the same network,
set `HOST=0.0.0.0` and both TLS paths. See [Run it](../README.md#run-it) for the
self-signed certificate command. Open `https://<address>:8787` on the tablet
and accept the browser warning once. This has not been tested on a real tablet yet.
After listening, startup warns only when both `BASETEN_API_KEY` and
`META_API_KEY` are blank: the ear cannot hear and lines show gray. A missing
`station/dist` prints `station/dist is missing; run npm run build.` Startup
also prints the actual address and port it listens on, with https when TLS is on.
No key or part of a key is printed. Configuration:

| Variable | Meaning |
| --- | --- |
| `TEACHER_PIN` | Required teacher header secret, exactly 4 to 12 digits; invalid values stop startup |
| `TRACE` | Exactly `1` enables the protected trace endpoint |
| `COACH_MODEL` | Exactly `off` disables model calls at next checkpoints |
| `COACH_REASONING_EFFORT` | Coach reasoning effort, default `minimal`; requests allow 16000 tokens and time out after 30 seconds |
| `DATA_DIR` | Store directory, default `<repo>/data` |
| `HOST` | Listen address, default `127.0.0.1`; use `0.0.0.0` and TLS for network tablets |
| `PORT` | Server port, default 8787 |
| `TLS_CERT` | Optional PEM certificate path; set with `TLS_KEY` for https, leave both empty for http. An unreadable file stops startup. |
| `TLS_KEY` | Optional PEM private key path; required with `TLS_CERT`. An unreadable file stops startup. |

The ear refuses any configured `EAR_PRIMARY_MODEL` or `EAR_FALLBACK_MODEL` id
ending in `-contributor` before sending a request. That provider counts as a
failed call, so normal fallback may still use an allowed provider. The coach
uses the fixed standard id `muse-spark-1.3`; environment values do not replace
that id, and failed or invalid coach calls fall back to the rule.

The server never logs request bodies, audio or names. Static GET and HEAD
requests support the station's index fallback. Literal and encoded parent
traversal, backslashes, NULs and symlinks outside the static directory are
blocked. Unknown API routes do not fall back to station HTML.

## Offline checks

Run `node --test server/app.test.js` and `node --test` from the repo root.
Server route tests use temporary DATA_DIR directories and inject fake ear,
grader and coach contracts, except the multi-turn regression, which uses the
real grader and coach with the model off. They need no packages or network.

The station checks use installed local packages: `cd station && npx vitest run
--configLoader native`. Build with `cd station && npm run build`. When the
workspace's linked packages prevent Vite from writing its temporary config,
use `cd station && npm run build -- --configLoader native`.
