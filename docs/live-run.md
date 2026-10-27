# Live run through the server, 2026-10-26

One full turn through the real server with the coach model on, run at 22:50 Eastern on commit `ea99a36`.

## Setup

- The server ran locally with `COACH_MODEL` on, `TRACE=1` and a fresh data folder.
- A script created one invented child (Sephardi, level 1), started a turn, and read every line the server sent.
- Each line was spoken by the macOS Hebrew voice Carmit, saved as a 16 kHz WAV, and posted to `/api/grade`. No person was recorded.
- The ear was Muse Wonder 1.0 through the Meta Model API, with minimal reasoning. The coach was Muse Spark 1.3 through the Meta Model API.

## What happened

| Check | Result |
| --- | --- |
| Lines graded | 25 of 25, none failed |
| Time per line, speech file plus ear plus grader | 3.8 seconds on average, 2.0 to 9.0 |
| Coach checkpoints answered by the model | 7 of 7 between the start and the stop rule |
| Coach picks that failed validation | 0 |
| Turn length | 8 checkpoints, then the stop rule ended it |
| Coach reasons outside the developer trace | none |
| Files in the data folder afterwards | `store.json` only, no audio |

The model's reasons named the child's actual confusions. For example: "Misses cluster on chirik and chirik-male across varied letters so these lines rebuild that vowel-pattern skill at level 1." Reasons appear only in the protected trace. The ordinary teacher turn log uses the templated line, here "Held level 1 and gave the pattern chirik with a mater yud another try."

## What it does not show

- The score, 64 of 130 sounds, says nothing about the ear's accuracy. A synthetic voice reading isolated level 1 syllables is a poor stand-in for a child, and the run had no planted mistakes to check against.
- Real voices have not been tested. The adult round and the child round are next.
