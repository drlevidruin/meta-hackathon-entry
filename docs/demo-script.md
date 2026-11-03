# Demo video script

Hard limit 3:00. Rabbi Dr. Levi Druin reads and narrates. Only an adult appears or reads: no child's voice, face or name. Every number spoken below is in `docs/ear-test.md`, `docs/live-run.md` or `docs/build-log.md`.

Lines marked [CHECK] need a fact confirmed on the live station before recording.

## The script

### 0:00 to 0:20 | The problem

**Screen:** The live station's Who's reading screen at 1440 by 900. Lower third: "Rabbi Dr. Levi Druin, Principal" and "Built October 26 to November 4, 2026".

**Voiceover:**
"I'm Levi Druin. I run a Jewish day school, and I teach kriah: reading Hebrew with its vowels. A teacher can't hear every child read every day. And the mistakes that matter are tiny. One vowel. One dot. So I built a station that listens."

### 0:20 to 1:05 | A live reading

**Screen:** Tap Levi. Read three lines aloud, one after another, with the microphone on. Keep the reading audible. Keep the first line's grade at normal speed, wait included. Cut the other waits. Hold on line 2 when its marks appear, then zoom on the planted vowel.

**On camera, read:** the three lines the station shows, in Ashkenazi pronunciation. On line 2, read one kamatz as a patach: a instead of o. See "Lines and the planted mistake" below.

**Voiceover, over line 1's marks:**
"Green means I read it right. Every letter, every vowel."

**Voiceover, over line 2's marks:**
"On this line I made a mistake on purpose. This is a kamatz. I read it as a patach: na, not no. The mark lands on that one vowel. Purple means the vowel was wrong. Orange would mean the letter. Underneath is what the ear heard."

**Voiceover, over line 3:**
"The microphone stays on. Each line grades while I read the next one."

If a correctly read syllable is also marked, keep it in the take and add: "This one I read correctly. It still gets marked sometimes. I'll show you how often."

### 1:05 to 1:45 | The ear never sees the text

**Screen:** The How it works diagram in the README, rendered on GitHub at 1440 wide. Highlight each box as it is named: the ear, then the vowel meter and the phoneme model, then the rulebook and grader.

**Voiceover:**
"Here's the part that matters. The ear is Muse Wonder, through the Meta Model API. It gets my audio and a sound alphabet, and never the printed line. A model that knows the word tends to hear the word. So the ear only writes sounds. We ask it five times and grade on the first three answers. Then two checks that also never see the text: a vowel meter, and Meta's open wav2vec2 phoneme model, running on this computer. Both compare my vowels with my own voice card. Last, plain code: a rulebook that knows every letter and vowel."

### 1:45 to 2:00 | One reading, two traditions

**Screen:** Two terminal panes side by side at 1440 wide, large font. Left pane shows the Ashkenazi result, three `ok`. Right pane shows the Sephardi result, `wrong_vowel` and `wrong_letter`.

```bash
npm run grade -- --preset ashkenazi --line "שַׁבָּת" --heard "sha-bos"
npm run grade -- --preset sephardi --line "שַׁבָּת" --heard "sha-bos"
```

**Voiceover:**
"Same sounds, sha-bos. In Ashkenazi reading, that's right. In Sephardi reading, it's two mistakes. The rulebook judges each child by their own tradition."

### 2:00 to 2:25 | The teacher view

**Screen:** Teacher, PIN entered off camera, then Class, then Levi: the reading map with its legend. Then Print packet: Warm up, Practice and Challenge in frame. For a fuller class, cut to the mock teacher view with its gray Demo pill in frame (https://levis-new-mac-mini.tail8bd372.ts.net/?mock#/teacher; any four digits open it).

**Voiceover:**
"The teacher gets a reading map: every letter with every vowel, solid, shaky, or not tested yet. Children are grouped by what to practice next. Muse Spark picks the next lines from the bank, and code checks every pick. The packet has a warm-up, practice and a challenge. No model writes Hebrew a child reads."

If the mock class is on screen, add: "This class is simulated."

### 2:25 to 2:50 | Honest results

**Screen:** A plain results card, white ground, large type, held for the whole section:

> One adult voice, planted mistakes, sealed rounds.
> Six sealed rounds run. Five failed. One passed.
> Round 1i, three of three runs: 12 of 12 planted mistakes caught. No correct reading marked wrong.
> Muse Wonder alone: 5 or 6 false marks a run. With the meter and Meta's phoneme model: 0.
> No child round yet.

**Voiceover:**
"I tested it on my own voice, with mistakes planted on purpose. In a sealed round, nobody hears the answers until the rules are frozen and the pass rule is written down. Five sealed rounds failed. They're all published. Round 1i passed all three runs. Every planted mistake caught. Nothing marked wrong by mistake."

### 2:50 to 3:00 | Close

**Screen:** Back to the live station, Who's reading screen. End card: "Kriah Listener" and the repo URL, github.com/drlevidruin/meta-hackathon-entry.

**Voiceover:**
"Next is a child's voice, with parent consent. Kriah Listener. Built for my teachers."

## Lines and the planted mistake

The station chooses the lines, so the exact lines depend on the set it serves. Before recording, set Levi to Ashkenazi at Level 5 in Roster, so the lines are short siddur phrases.

- **Line 1:** read as printed, Ashkenazi: kamatz as o, cholam as oy, a sav without a dot as s.
- **Line 2:** read one kamatz in the middle of a word as a patach, a instead of o. Pick one inside a word, not on its last syllable. Read the rest as printed.
- **Line 3:** read as printed.

The bank's line `הָעוֹלָם אֲשֶׁר נָתַן לַשֶּׂכְוִי בִינָה` is the model case. Read it ho-oy-lom a-sher na-san la-sech-vi vi-no, with נָתַן read na-san for no-san. The grader marks that kamatz `wrong_vowel` and nothing else in the line:

```bash
npm run grade -- --preset ashkenazi --line "הָעוֹלָם אֲשֶׁר נָתַן לַשֶּׂכְוִי בִינָה" --heard "ho-oy-lom a-sher na-san la-sech-vi vi-no"
```

The same plant was in Round 1k. After the fixes measured on Round 1k, the replay caught it in every run.

## Shot list

| Time | Shot | Source |
| --- | --- | --- |
| 0:00 | Who's reading screen, lower third | Live station, 1440 by 900 |
| 0:20 | Three lines read, marks appear, zoom on the planted vowel | Live station, screen recording with room audio |
| 1:05 | How it works diagram, boxes highlighted in turn | README on GitHub |
| 1:45 | Two grader commands side by side | Terminal |
| 2:00 | Reading map, then practice packet, then mock class | Live teacher view; mock tab with Demo pill |
| 2:25 | Results card | Title card in the editor |
| 2:50 | Station and end card | Live station; title card |

## Recording checklist

- [ ] Chrome, one window, sized to 1440 by 900. Bookmarks bar hidden (Cmd+Shift+B). No other tabs, no extensions in the toolbar.
- [ ] Do Not Disturb on. Notifications off.
- [ ] Quiet room, no fan or music. Same microphone for the voice card and the lines.
- [ ] Microphone allowed for https://levis-new-mac-mini.tail8bd372.ts.net in Chrome's site settings before the take.
- [x] Levi on the live roster, Ashkenazi, Level 5 (set November 3). Do Levi's voice card once before recording.
- [ ] Voice card read off camera before the take, in the same room and on the same microphone. If the server restarts, read it again: the card lives only in memory.
- [ ] Line 2's planted mistake chosen: one kamatz inside a word, read as a.
- [ ] Teacher PIN entered off camera.
- [ ] Terminal font large enough to read at 1440 wide. No keys or `.env` in frame.
- [ ] Mock teacher tab open with its Demo pill in frame, if it is used.
- [ ] Record two or three takes of the live reading. Keep the take as it happened, false marks included. Never edit a mark.
- [ ] Voiceover recorded separately, read from this script, then laid over the footage.
- [ ] Final cut timed at 3:00 or less.
- [ ] No child's voice, face or name anywhere in the video.
- [ ] Video uploaded and the link opened in a logged-out browser before it goes into the form [CHECK: hosting and visibility rules on the submit form].
