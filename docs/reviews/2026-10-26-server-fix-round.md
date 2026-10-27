# Server and station reliability, 2026-10-26

The server owns star awards and turn identity. Checkpoint and finish responses
can be retried after a lost response. Learning history survives ordinary roster
edits, while new turns and teacher level changes end earlier live turns.

## Regression coverage

1. **Star awards: reproduced.** A safe integer supplied by the browser could
   become the entire lifetime award. The server now scores each successful
   grade with the station's 80 percent rule and perfect-challenge bonus, keeps
   only the latest grade per item in each set, and awards the smaller of the
   requested and earned totals. Negative, fractional and unsafe values already
   returned 400 and retain that behavior. Tests:
   `finish caps browser stars at the stars earned by the latest server grades`;
   `finish awards the smaller client count and never awards ungraded or failed lines`;
   `finish counts challenge bonuses and repeated items in separate sets from server grades`;
   `next and finish validate their input and unknown turns`;
   `server line stars cover regular, challenge, extra and uncertain grades`;
   `server and station line star rules agree on the same grade fixtures`.

2. **Finish retries: reproduced.** A second finish returned 404. A finished turn
   now keeps its original public child receipt until expiry. Sequential and
   concurrent retries return that receipt without another award or history row,
   including after a newer turn changes the child's totals. Tests:
   `finish retries return the original receipt even after another turn changes totals`;
   `concurrent child writes preserve both records and concurrent finish cannot count stars twice`.

3. **Checkpoint retries: reproduced.** Retrying next called the coach again and
   consumed another checkpoint. The station now sends its completed-set count
   as `checkpoint`, starting at 1. The server saves the last answered number and
   response. The same number replays; only its successor advances; other numbers
   return 409. Failed selections preserve both grades and checkpoint identity.
   Done responses replay too. Tests:
   `checkpoint retries replay the saved response without coaching or consuming current grades`;
   `concurrent checkpoint retries coach once and done checkpoints replay too`;
   `next requires an integer checkpoint identity`;
   `an invalid next selection preserves the pending grades for a retry`;
   `retries a lost checkpoint response with the same completed-set count after reload`;
   `sends only the API v2 turn fields and raw WAV`.

4. **Unknown restored turns: reproduced.** A grade 404 became a gray line, and
   next or finish 404 left a retry error. All three now clear session storage
   and replace the route with Who's reading. A late response for an earlier turn
   cannot clear a newer turn. Tests:
   `clears an unknown saved turn on grade 404 and returns to Who’s reading`;
   `clears an unknown saved turn on next 404 and returns to Who’s reading`;
   `clears an unknown saved turn on finish 404 and returns to Who’s reading`;
   `a late unknown-turn response does not clear a newer turn`.

5. **One live turn per child: reproduced.** Earlier turns could finish after a
   replacement start or teacher level change. New starts invalidate earlier live
   turns. A successfully saved level change also invalidates them. Pending
   starts cannot reopen a superseded turn. Start waits for pending store writes
   so it loads the latest committed profile. A failed teacher write preserves
   the earlier live turn. Finished receipts remain available. Tests:
   `a new turn and a changed teacher level invalidate earlier live turns`;
   `a start during a teacher level write waits for the saved profile`;
   `a pending start cannot reopen a turn after a newer start`;
   `a pending start cannot reopen a turn after a newer level`;
   `a failed teacher level write preserves the live turn as well as the saved profile`;
   `pending checkpoint returns 404 after start invalidates the turn`;
   `pending checkpoint returns 404 after level invalidates the turn`.

6. **Unchanged level in roster edits: reproduced.** Including the current level
   discarded skill history, seen items and checkpoint history. Reset now happens
   only when the level differs. Name, avatar and preset edits with the same
   level preserve the profile and live turn. Test:
   `roster edits with the same level preserve the saved coach profile and live turn`.

7. **Deletion during a checkpoint: reproduced.** A delayed coach response could
   return 200 after deletion. Next now rechecks turn identity, expiry and child
   existence immediately after the await, before changing the turn. Grade and
   finish also check liveness before store mutations. Tests:
   `pending checkpoint returns 404 after delete invalidates the turn`;
   `pending checkpoint returns 404 after expiry invalidates the turn`.

8. **Startup PIN validation: reproduced.** Missing or unusable PINs previously
   allowed startup. The PIN check now accepts exactly 4 to 12 digits. Failure
   prints one plain explanation without the supplied value and exits with code
   1 before listening. Test:
   `startup PIN check rejects missing, non-digit, short and long PINs without echoing them`.

9. **Startup messages: reproduced.** Startup omitted the missing ear key and
   station build notices. It now prints one plain line for each missing resource
   and the actual listen address. The build notice names
   `cd station && npm run build`; messages never include key material. Test:
   `startup lines describe a missing ear key, missing station build and actual listen address`.

10. **Listen address: reproduced.** The server did not specify a listen host.
    It now defaults to `127.0.0.1`; `HOST` overrides it and `PORT` defaults to
    8787. Both variables are documented in the API and `.env.example`, including
    `HOST=0.0.0.0` for classroom tablets. Test:
    `listen options default to loopback and let HOST and PORT override it`.

11. **Store hygiene: reproduced.** Unknown profile fields passed through the
    private-field denylist, and turn arrays grew without a limit. Profiles now
    persist only the coach's version, level, checkpoint counts, clean and held
    state, skill statistics including demotion counts, proven skills and seen
    item ids. Nested values have their own allowlists. Each child's newest 60
    turns are retained; detail still exposes 20. Filtering and retention apply
    on load and write. Tests:
    `profile persistence allows only coach fields at every profile depth`;
    `the store retains the last sixty turns separately for each child`.

12. **Contributor models: reproduced for the ear; not reproduced for the
    coach.** Both ear environment overrides could select contributor models.
    The ear now refuses these ids before fetch and treats the provider as a
    failed call, allowing an eligible fallback. The coach already uses the fixed
    standard id `muse-spark-1.3`; contributor environment values cannot replace
    it. Its implementation is unchanged. Failed coach calls already fall back
    to the rule. Tests:
    `ear refuses a contributor primary model before fetch`;
    `ear refuses a contributor fallback model before fetch`;
    `coach model id stays on the standard tier despite contributor environment overrides`.

13. **Parent line: reproduced for mistakes without a next skill.** The count
    incorrectly ended with “Every sound was right!” in that case. It now ends
    after the count. A nonempty summary with every sounded pair ok and no extra sounds retains
    the celebration. The empty-summary case already returned an empty string and
    its behavior is unchanged. Tests:
    `parent line celebrates only a nonempty summary with every sounded pair ok`;
    `parent line stops after the count when there are mistakes and no next skill`;
    `parent line is empty when the summary has no pairs`;
    `parent line stops after the count when extra sounds were heard and there is no next skill`;
    `parent line stops after the count when the coach has no next skill and there are misses`.

14. **API documentation: reproduced.** The bank contains 150 challenge items,
    and a packet includes one. The earlier statement that Challenge was empty
    was incorrect. The API now documents this and the scoring, receipt,
    checkpoint, expiry, live-turn, roster, startup, listen, persistence and model
    behavior above. Test:
    `API documentation describes the 150 bank challenges and a packet challenge`.

Reproduced regressions were observed failing before the corresponding code
changed. The coach model selection and empty-summary parent line passed before
any implementation change and retain their existing behavior.

## Offline validation

- `node --test`: 493 passed, no failures.
- `cd station && npx --no-install vitest run --configLoader native`: 73 passed
  across 8 files, no failures. Installed local packages only.
- `cd station && npm run build`: blocked by EPERM while Vite tried to write
  temporary config under the linked `node_modules` outside the workspace.
- `cd station && npm run build -- --configLoader native`: passed, 29 modules
  transformed. This avoids the temporary config write.
- `git diff --check`: passed.

Live model and classroom tablet calls were not exercised offline. No dependency,
bank, rulebook or grader changes are needed for these regressions.
