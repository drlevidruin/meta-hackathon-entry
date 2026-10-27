# Demo video shot list

Three minutes after editing. Only an adult appears or reads. No child's voice or face. All names are invented. Record complete turns, then cut between the shots below. Keep one real grade's wait visible at normal speed.

The committed bank has no שַׁבָּת item, and the server grades only its current bank set. The live take therefore plants the same bet-to-vet mistake in בּוֹס. The שַׁבָּת read as `sha-vos` example uses typed sounds in a separate terminal shot.

## Before recording

Use Node 22.12 or newer and the installed station dependencies. Desktop viewports are 1440 pixels wide. Phone viewports are 390 pixels wide. Use browser device emulation on localhost for phone shots so the microphone remains available.

Keep `.env`, PIN entry and request headers outside the recording. In the root `.env`, set `META_API_KEY` to the Meta Model API key and `TEACHER_PIN` to 4 to 12 digits. Missing or invalid PINs stop startup. A missing Meta key leaves the ear unavailable; gray lines are failed calls. The env loader preserves exported variables, so use a terminal without exported key or PIN overrides.

From the repo root, build and start the real server in the foreground:

```bash
npm --prefix station run build -- --configLoader native
mkdir -p data
DEMO_DATA_DIR="$(mktemp -d "$PWD/data/demo-XXXXXX")"
DATA_DIR="$DEMO_DATA_DIR" BASETEN_API_KEY= COACH_MODEL=on TRACE=1 \
  COACH_REASONING_EFFORT=minimal EAR_FALLBACK_MODEL=muse-wonder-1.0 \
  EAR_REASONING_EFFORT=minimal HOST=127.0.0.1 PORT=8787 \
  node server/index.js
```

`DATA_DIR` points to a new, empty folder under the ignored `data/` directory. Existing data stays intact. `COACH_MODEL=on` enables calls to the fixed Muse Spark 1.3 coach; only `off` disables them. `TRACE=1` enables the PIN-protected trace. The blank Baseten key selects the Muse Wonder 1.0 fallback ear. These are standard model ids. `HOST=127.0.0.1` and `PORT=8787` match the startup defaults. Configuration is defined in [startup](../server/startup.js), [server entry](../server/index.js) and [.env.example](../.env.example).

Open `http://127.0.0.1:8787/`, without `?mock`. Tap Teacher, enter the PIN, tap Enter, then Roster. Under Add child, enter each invented first name, choose its avatar and Preset, and tap Add child:

| First name | Avatar | Preset |
| --- | --- | --- |
| Bim | lion | Ashkenazi |
| Zuzu | turtle | Ashkenazi |
| Nubo | owl | Ashkenazi |

New children start at level 1. Complete two adult warm-up turns: wordmark → Bim → Start, then wordmark → Zuzu → Start. For each line, tap Record, read, then tap Stop recording. Read some sounds correctly and plant a vowel mistake in each turn. Continue through the automatic checkpoints until the done screen, then tap Next friend. This saves real turn logs and map reads. The resulting groups depend on what the ear returns.

In Teacher → Roster, tap Edit for Nubo, choose Level 2, then Save. Leave Nubo unread until the live take. Its first set is:

1. `סָץ שֻׁס בּוֹס סוּם סֵית` (`L2-0393cbe1`). Say `sotz shus vos sum seys`, planting v for b in the third word.
2. `בֻּץ בִּיךְ בִּן בֵּין בִּיל` (`L2-03b06cdd`). Read as printed.
3. `דָן אָץ דָךְ רָן לָם` (`L2-05f8a320`). Read as printed.

Allow microphone access before capture. Open browser developer tools → Network with Preserve log enabled. After the first grade, its Response contains `words[2].pairs`: the bet pair should show `heard: "vo"`, `expected: ["bo", "boy", "bey"]`, `verdict: "wrong_letter"`. The live voiceover below applies only to that observed response and amber mark. If the ear returns something else, keep its actual result and describe that result. The adult demo is not a completed real-voice test round.

Record the checkpoint, trace and teacher log within 30 minutes of starting Nubo's turn, without restarting the server or starting another Nubo turn. The trace lives only in memory. The initial selection is from rules; checkpoint 1 follows the first completed set. Capture a trace entry with `source: "model"` for the coach shot. A `rule` entry is a fallback, not a model answer.

For the fuller teacher history only, prepare a separate tab at `http://127.0.0.1:8787/?mock#/teacher`. Any 4 to 12 digit PIN opens it. Add a fixed, clearly visible **Demo** recording overlay to every mock frame, including transitions. The app has no built-in Demo badge. Keep the overlay through the class and map shots; remove it only after cutting back to a real screen.

## 0:00 to 0:20 | The problem

**Screen:** Real Who's reading? screen at 1440 wide, showing Bim, Zuzu and Nubo.

**Path:** `http://127.0.0.1:8787/#/`.

**Voiceover:** “One teacher cannot listen to every child read every day. And the mistakes that matter can be small: one letter, or one vowel. Kriah Listener listens to a line and marks the sounds to practice.”

**Setup:** Invented roster loaded. No mock query. Only the adult operates the station.

## 0:20 to 0:55 | A real reading

**Screen:** Station at 390 wide. Adult taps Nubo and reads the three-line set. Hold on the first line's marks, with amber under the bet in בּוֹס and the next line below. Briefly show the first grade's Response, cropped to the bet's `text`, `heard`, `expected` and `verdict` fields.

**Path:** Nubo → Start → Record. Say `sotz shus vos sum seys` → Stop recording. Wait for the first grade before recording the second line. Record → read the second line → Stop recording. Repeat for the third line.

**Voiceover:** “This is an adult reading on an invented profile. I read the b as v. The Meta ear returned the v sound. The grader compared vo with bo for this Ashkenazi reader. The amber mark is under the bet.”

**Setup:** Fresh level 2 Nubo profile and real server. Capture the first line's marks before submitting the second line, since the previous-line display then changes. Save the third line's checkpoint footage for 1:40. Use the actual returned fields, not a prepared transcript. Leave the adult's planted reading audible without voiceover over it.

## 0:55 to 1:10 | Isolate the mistake

**Screen:** Terminal at 1440 wide. Typed sounds for שַׁבָּת, with the bet's `wrong_letter`, `heard=vo`, `expected=bo` visible.

**Command, from the repo root:**

```bash
npm run grade -- --preset ashkenazi --line "שַׁבָּת" --heard "sha-vos"
```

**Voiceover:** “Here is the same letter mistake in Shabbos: sha-vos. These sounds are typed. The printed bet needs b, and the grader marks v as the wrong letter. This checks the grader on its own.”

**Setup:** Separate terminal. This command does not call the ear or need a key. The current bank cannot supply this word in the station.

## 1:10 to 1:20 | The route through the system

**Screen:** Rendered How it works diagram in [README](../README.md#how-it-works), at 1440 wide. Point from audio to the Meta ear, then from syllables and printed line to the grader.

**Path:** Open README.md in a Markdown preview → How it works.

**Voiceover:** “The ear gets audio and a sound alphabet. It never sees the printed line. Code compares the heard sounds with the rulebook.”

**Setup:** Diagram rendered before capture. Keep its labels readable.

## 1:20 to 1:40 | One reading, two traditions

**Screen:** Terminal outputs side by side or one above the other. Highlight the three `ok` marks for Ashkenazi, then Sephardi's `wrong_vowel` and `wrong_letter`.

**Commands, from the repo root:**

```bash
npm run grade -- --preset ashkenazi --line "שַׁבָּת" --heard "sha-bos"
npm run grade -- --preset sephardi --line "שַׁבָּת" --heard "sha-bos"
```

**Voiceover:** “Now both commands get the same typed sha-bos. Ashkenazi accepts all three sounds. Sephardi expects sha-bat, so the vowel and final letter are marked. The pronunciation tradition changes the verdict.”

**Setup:** Leave other-tradition acceptance off. The Sephardi output identifies the Ashkenazi alternatives, but still flags them for the selected preset.

## 1:40 to 1:52 | The checkpoint

**Screen:** Real station at 390 wide, using the saved end-of-set footage. Show the checkpoint star, then the next set.

**Path:** Use the checkpoint captured after Nubo's third line → Stop recording. The checkpoint runs automatically after all three grades return.

**Voiceover:** “After the set, Muse Spark 1.3 chooses bank ids. Code checks every pick. In the synthetic server run, it answered all seven coach checkpoints.”

**Setup:** Keep the same turn open. Use its first completed checkpoint, not the initial rule selection. The recorded seven-of-seven result is in [live-run.md](live-run.md).

## 1:52 to 2:01 | The developer trace

**Screen:** Terminal at 1440 wide, showing the real checkpoint number, `source: "model"`, model reason and templated `explain` line. No key or PIN appears.

**Path and command:** Off camera, open the station's developer tools → Console and evaluate:

```js
JSON.parse(sessionStorage.getItem('kriah.turn.v2')).turnId
```

In a second terminal at the repo root, run `read -r TURN_ID`, paste that UUID, then press Enter. Run:

```bash
node --input-type=module - "$TURN_ID" <<'NODE'
import './ear/env.js';
const response = await fetch(
  `http://127.0.0.1:8787/api/trace?turn=${encodeURIComponent(process.argv[2])}`,
  { headers: { 'X-Teacher-Pin': process.env.TEACHER_PIN } }
);
if (!response.ok) throw new Error(`Trace HTTP ${response.status}`);
const trace = await response.json();
const decision = trace.decisions.find(entry => entry.checkpoint > 0 && entry.source === 'model');
if (!decision) throw new Error('No model checkpoint in this turn');
console.log(JSON.stringify({
  checkpoint: decision.checkpoint, source: decision.source,
  reason: decision.reason, explain: decision.explain
}, null, 2));
NODE
```

**Voiceover:** “The model's reason is here, in a PIN-protected developer trace. Children and teachers never see the model's words.”

**Setup:** `TRACE=1` on the real server. Terminal loads the PIN privately from `.env`. Record the current response, not the example reason in the run notes.

## 2:01 to 2:10 | What the teacher sees

**Screen:** Real Nubo child detail at 1440 wide. Show the same checkpoint's templated sentence under Turns.

**Path:** Finish the remaining sets in the existing turn → Next friend → Teacher → enter PIN if needed → Enter → Class → Nubo → Turns.

**Voiceover:** “The teacher sees a fixed sentence from decision fields. If the model fails, a rule chooses the practice.”

**Setup:** Finish before this shot so the turn log is saved. Cut out the intervening reading. Match the sentence to `explain` in the trace.

## 2:10 to 2:20 | Practice groups

**Screen:** Fuller class view at 1440 wide, with **Demo** visible throughout.

**Path:** Prepared mock tab at `http://127.0.0.1:8787/?mock#/teacher` → Class.

**Voiceover:** “These groups and the next map use simulated history. Two warm-up turns give little history. The teacher view groups children by their next skill to practice.”

**Setup:** Mock is limited to these two history shots. The live warm-up results stay in the real data folder. The Demo overlay stays visible across the cut to the map.

## 2:20 to 2:30 | Letter and vowel map

**Screen:** Bim's letter and vowel map, at 1440 wide. Pan across Solid, Shaky and Untested. **Demo** remains visible.

**Path:** Mock Class → Bim → Reading map.

**Voiceover:** “The map pairs letters with vowels. Real cells use recent graded reads. Untested means there is not enough evidence yet.”

**Setup:** Keep the map legend and Demo overlay in frame. This is simulated history, not evidence from children.

## 2:30 to 2:40 | Packet preview

**Screen:** Real Nubo packet at 1440 wide. Show Warm up, Practice and Challenge. Remove Demo only after the real tab is visible.

**Path:** Real tab → Teacher → Class → Nubo → Print packet. Scroll to Challenge. This is the packet preview; the Print button opens the browser print dialog.

**Voiceover:** “Each packet includes a challenge from the bank. No model writes the Hebrew a child reads.”

**Setup:** Real tab has no `?mock`. Frame the Challenge heading and its item together.

## 2:40 to 3:00 | Evidence and next rounds

**Screen:** At 1440 wide, show [ear-test.md](ear-test.md#round-0-synthetic-voices), then the results table and limits in [live-run.md](live-run.md). End on the real station. Keep a short card visible: “Synthetic clips: 5/7 plants in each of two runs; no prose reported. Synthetic server run: 25/25 lines; 3.8 s average including speech-file creation; coach 7/7. Real-voice accuracy not established.”

**Path:** Ear test → Round 0 results table → Live run → What happened and What it does not show → real station Home.

**Voiceover:** “Synthetic clips: five of seven planted mistakes in each of two runs. No prose answers. A separate synthetic server run graded all twenty-five lines, averaging 3.8 seconds including speech creation. Adult and child test rounds are next. Audio is graded in memory and dropped; standard tier only.”

**Setup:** Use the recorded observations, not an accuracy percentage. The 25-of-25 count measures completed grades, not correct verdicts. The saved synthetic notes do not establish a grader accuracy rate. The child round follows a passing adult round, written parent consent and a paid Meta plan with free credits off. No claim of classroom use or real-voice accuracy appears in the video.
