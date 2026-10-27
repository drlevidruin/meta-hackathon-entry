# Demo video shot list

Three minutes after editing. Only an adult appears or reads. No child's voice or face. All names are invented. Record a complete turn, then cut between the shots below. Keep one real grade's wait visible at normal speed.

The live shots use the real server. The terminal shots use typed sounds to check the grader alone. Mock mode is only for the fuller class history. Its built-in gray Demo pill must stay visible, so keep the header in frame on every mock shot.

## Before recording

Use Node 22.12 or newer and the installed station dependencies. Use a desktop view at 1440 pixels wide and a phone view at 390 pixels wide. Keep both on the computer running the server, at localhost, so the microphone works.

Keep `.env` and PIN entry out of frame. In the root `.env`, set `META_API_KEY` and a `TEACHER_PIN` of 4 to 12 digits. Leave the ear model and reasoning settings at their `.env.example` defaults. Use a terminal with no exported key, PIN or model overrides. The blank Baseten key in the command below selects the Meta fallback ear. Missing or invalid PINs stop startup. Without a Meta key, this demo command cannot hear; failed lines stay gray.

Copy this one block from the repo root. It builds the station and starts the server with an empty temporary data folder:

```bash
npm --prefix station run build -- --configLoader native
DATA_DIR="$(mktemp -d)" BASETEN_API_KEY= TRACE=1 COACH_MODEL=on \
  HOST=127.0.0.1 PORT=8787 npm start
```

Leave that terminal running. Open `http://localhost:8787/`, without `?mock`. Tap Teacher, enter the PIN, then Roster. Add these three invented children for the Who's reading shot:

| First name | Avatar | Preset |
| --- | --- | --- |
| Bim | lion | Ashkenazi |
| Zuzu | turtle | Ashkenazi |
| Nubo | owl | Ashkenazi |

In Roster, tap Edit for Nubo, choose Level 2, then Save. Leave all three unread until filming. Nubo's first set is:

1. `סָץ שֻׁס בּוֹס סוּם סֵית`. Say `sotz shus vos sum seys`, reading v for b in the third word.
2. `בֻּץ בִּיךְ בִּן בֵּין בִּיל`. Read as printed.
3. `דָן אָץ דָךְ רָן לָם`. Read as printed.

Read every other sound in Ashkenazi pronunciation, the preset Nubo uses. A sound read another way gets its own amber mark. In a rehearsal with an Israeli synthetic voice, line 1 showed three extra amber marks for that reason. The October 27 adult round found the same with a real Ashkenazi voice: the ear wrote Israeli vowels, so correct Ashkenazi vowels may show amber until an ear passes. See the [ear test](ear-test.md#round-1-results-october-27).

Allow microphone access before capture. For each line, tap the microphone, read the whole line without a long pause, then stay quiet. Recording stops by itself about a second after speech ends, with a 20 second maximum. Never tap again after it stops. Wait for the marks before reading the next line.

A full turn is eight sets, about 25 lines, and ends on its own after the eighth checkpoint. In the synthetic rehearsal each line took about 4 seconds to grade and the whole turn took about 2.5 minutes. A person reading aloud takes longer. Tap Start only when ready. A set left open for four minutes ends the turn at its next checkpoint, if it has a graded line, before the model can pick another set. This includes time spent waiting for grades. Film the whole turn and its trace within 30 minutes of Start. The server expires the turn then. Do not restart the server or start another Nubo turn before capturing its trace.

The marks on the reading screen are the live shot. Keep the actual result. If the bet is not amber, describe the marks that appear. This adult demo is not the planned real-voice test round.

Finish the full turn before filming the trace and saved teacher log. After the done screen, tap Next friend, Teacher, Class, Nubo, then look under Turns. Tap Coach trace on the newest turn. Checkpoint 0 comes from rules. For the model shot, choose a middle row whose Source is `model`. The last row is the stop rule. If all rows say `rule`, the coach used its fallback. Describe that result instead of claiming a model answer. If the trace is no longer available, record a new full turn and use its saved link.

For class history only, open a separate tab at `http://localhost:8787/?mock#/teacher`. Any PIN of 4 to 12 digits opens it. Keep its header and gray Demo pill in frame, including during the cut between class and map.

## 0:00 to 0:20 | The problem

**Screen:** Real Who's reading? screen at 1440 wide, showing Bim, Zuzu and Nubo.

**Path:** `http://localhost:8787/#/`.

**Voiceover:** “One teacher cannot listen to every child read every day. And the mistakes that matter can be small: one letter, or one vowel. Kriah Listener listens to a line and marks the sounds to practice.”

## 0:20 to 0:55 | A real reading

**Screen:** Real station at 390 wide. Keep the adult's planted reading audible. Hold on the first line's marks while the next line is below it. Keep the first grade's wait at normal speed.

**Path:** Nubo → Start. For each of the three lines, tap the microphone, read the whole line without a long pause, then stay quiet. It stops by itself. Never tap again after it stops. Wait for each grade. Save the end-of-set footage for the checkpoint shot.

**Voiceover:** “This is an adult reading on an invented profile. I read the b as v. These are the marks returned through the real server.”

If the bet is amber, add: “The bet is amber.” Do not claim the exact sounds returned by the ear from the mark alone. Keep the actual marks in the take.

## 0:55 to 1:10 | Isolate the mistake

**Screen:** Terminal at 1440 wide. Show the bet's `wrong_letter`, `heard=vo` and `expected=bo`.

**Command, from the repo root:**

```bash
npm run grade -- --preset ashkenazi --line "שַׁבָּת" --heard "sha-vos"
```

**Voiceover:** “Here is the same letter mistake in Shabbos: sha-vos. These sounds are typed. The printed bet needs b, and the grader marks v as the wrong letter. This checks the grader on its own.”

This command needs no key. The committed bank has no שַׁבָּת item, so the live station uses בּוֹס for the letter mistake.

## 1:10 to 1:20 | The route through the system

**Screen:** The rendered How it works diagram in [README](../README.md#how-it-works), at 1440 wide. Point from audio to the ear, then from syllables and printed line to the grader.

**Voiceover:** “The ear gets audio and a sound alphabet. It never sees the printed line. Code compares the heard sounds with the rulebook.”

## 1:20 to 1:40 | One reading, two traditions

**Screen:** Terminal outputs side by side. Show three `ok` marks for Ashkenazi, then Sephardi's `wrong_vowel` and `wrong_letter`.

**Commands, from the repo root:**

```bash
npm run grade -- --preset ashkenazi --line "שַׁבָּת" --heard "sha-bos"
npm run grade -- --preset sephardi --line "שַׁבָּת" --heard "sha-bos"
```

**Voiceover:** “Both commands get the same typed sha-bos. Ashkenazi accepts all three sounds. Sephardi expects sha-bat, so the vowel and final letter are marked. The pronunciation tradition changes the verdict.”

## 1:40 to 1:52 | The checkpoint

**Screen:** Saved footage from the real turn at 390 wide. Show the checkpoint star after the third line stops and all grades return, then the next set.

**Voiceover, when the trace confirms that checkpoint's Source is `model`:** “After the set, Muse Spark 1.3 picks bank ids. Code checks every pick. In the synthetic server run, it answered all seven coach checkpoints.”

If the live checkpoint used a rule, say: “After the set, a rule picked the next practice. In the recorded synthetic server run, Muse Spark 1.3 answered all seven coach checkpoints.”

The seven-of-seven count comes from [live-run.md](live-run.md). Finish the remaining sets off camera before recording the next two shots.

## 1:52 to 2:01 | The coach trace

**Screen:** Real Coach trace at 1440 wide. Frame the checkpoint number, Source, Explain and Reason. Use a later model row if one is available.

**Path:** After finishing, Next friend → Teacher → Class → Nubo → Turns → Coach trace on the newest turn. Enter the PIN off camera if asked.

**Voiceover:** “The model's reason is in this PIN-protected trace. The child's screen and the teacher's turn log use fixed sentences.”

Use the current trace, not the example reason in the run notes. If only rule rows are available, say: “This turn used the rule fallback. Its decisions are in the PIN-protected trace.”

## 2:01 to 2:10 | What the teacher sees

**Screen:** Real Nubo child detail at 1440 wide. Show the same checkpoint's fixed sentence under Turns. Match it to Explain in the trace.

**Path:** Use the browser's Back button to return from the trace to Nubo's Turns.

**Voiceover:** “The turn log uses a fixed sentence from decision fields. If the model fails, a rule chooses the practice.”

## 2:10 to 2:20 | Practice groups

**Screen:** Fuller class view in the mock tab at 1440 wide. Keep the header and Demo pill in frame.

**Path:** `http://localhost:8787/?mock#/teacher` → Class.

**Voiceover:** “These groups and the next map use simulated history. The teacher view groups children by their next skill to practice.”

## 2:20 to 2:30 | Letter and vowel map

**Screen:** Mock Bim's reading map at 1440 wide. Show Solid, Shaky and Untested. Keep the header, Demo pill and map legend in frame.

**Path:** Mock Class → Bim → Reading map.

**Voiceover:** “The map pairs letters with vowels. Real cells use recent graded reads. Untested means there is not enough evidence yet.”

This is simulated history, not evidence from children.

## 2:30 to 2:40 | Packet preview

**Screen:** Real Nubo packet at 1440 wide. Show Warm up, Practice and Challenge, with the challenge item in frame.

**Path:** Real tab → Teacher → Class → Nubo → Print packet. This is the preview. The Print button opens the print dialog.

**Voiceover:** “Each packet includes a challenge from the bank. No model writes the Hebrew a child reads.”

## 2:40 to 3:00 | Evidence and next rounds

**Screen:** At 1440 wide, show the Round 0 results in [ear-test.md](ear-test.md#round-0-synthetic-voices), then the results and limits in [live-run.md](live-run.md). End on the real station. Keep this card readable: “Synthetic clips: 5/7 plants in each of two runs; no prose reported. Synthetic server run: 25/25 lines; 3.8 s average including speech-file creation; coach 7/7. Real-voice accuracy not established.”

**Voiceover:** “Synthetic clips: five of seven planted mistakes in each of two runs. No prose was reported. A separate synthetic server run graded all twenty-five lines, averaging 3.8 seconds including speech creation. The planned adult and child test rounds are next. Audio is graded in memory and dropped; standard tier only.”

These are recorded observations. Completed grades do not measure correct verdicts. The saved notes do not establish a grader accuracy rate. The child round requires a passing adult round, written parent consent and a paid Meta plan with free credits off. Make no claim of classroom use or real-voice accuracy.
