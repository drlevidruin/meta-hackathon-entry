# Demo video script

Length 2:59.10, under the 3:00 limit. Rabbi Dr. Levi Druin records the voiceover to the timed script. Only an adult appears or reads: no child's voice, face or name. Every number in the video is in `docs/ear-test.md`, `docs/live-run.md` or `docs/build-log.md`; the sources are listed under "Where each number lives".

## How the video is built

The video is built from still screens with ffmpeg: crossfades, one slow zoom, a slow push-in on every still screen (3.5 percent, 2 percent on the title and end cards), a title card, and burned-in subtitles of every voiceover line. Nothing is a screen recording. Every screen is real station output or a page rendered from the repo's own text, and every screen from the mock class carries the label "Simulated class".

The only audio is Levi's own recorded reading in scene 2. To fit the time limit, four voiceover lines were cut: "Orange would mean the letter.", "This class is simulated." (the label stays on screen), "Every line comes back marked, letter by letter." (line 3's graded screen holds in silence for 1.5 seconds) and the longer version of the sealed-round sentence. The voiceover is recorded separately, to the timed script, and mixed in afterwards. Two cuts are made: one with the voiceover subtitles burned in, and one without them. Labels stay in both.

## The scenes

Times are from the final cut.

### 0:00 | 1. The problem

**Screen:** The Who's reading screen from the simulated class, with a "Simulated class" label. Lower third for the first sentence: "Rabbi Dr. Levi Druin, Principal" and "Built October 26 to November 4, 2026". On "Until now." (0:20.47) the screen crossfades to a navy "Kriah Listener" title card in the style of the end card, then into the reading scene at 0:24.73.

**Voiceover:**
"I'm Rabbi Dr. Levi Druin, principal of a Jewish day school. I've never studied coding. Our children learn kriah in the first grades: reading Hebrew with its vowels. A teacher can't hear every child read every day, and the mistakes that matter are tiny. One vowel. One dot. So kriah is taught only in person, and almost nothing gets tracked. Until now. Using Muse, I built a station that listens."

### 0:24.73 | 2. Reading

**Screen:** The real reading screen, for Levi, Ashkenazi, with the Demo pill from demo mode. A label stays at the top of the screen: "Levi's recorded reading, Oct 30. Graded Nov 4."

The reading is three of Levi's adult recordings from October 30: `line01_modeh-ani_clean`, `line07_anochi_segol-for-chirik` and `line02_shehechezarta_clean`. They were run on November 4 through the ear, the vowel meter and Meta's phoneme model, with Voice check 4 as the card. The run is recorded in `docs/ear-test.md`, "A fresh run, November 4", and in `docs/ear-test.md`, Round 1k. Each line plays with its real audio and no subtitles. The grades on screen come from the same grader function the server uses, with the Ashkenazi preset.

The planted mistake is on line 2: the chirik under the כ in אָנֹכִי, read as che. The grader marks that one vowel purple, with the struck-through "che" and the right sound "chi" under it. The screen slowly zooms toward it. Lines 1 and 3 are all green.

| Start | What is on screen |
| --- | --- |
| 0:24.73 | Line 1 big. Levi's recording plays, 0:25.13 to 0:32.75. |
| 0:32.87 | Line 1 marked, all green. A card reads "Muse Wonder heard: le-fa-ne-cha" and "After the vowel checks: le-fo-ne-cho". Then line 2 big, and Levi's recording plays, 0:44.50 to 0:54.58. |
| 0:54.67 | Line 2 marked, with the zoom on כִי. A tag reads "Heard by Muse Wonder. Vowels checked by Meta's phoneme model." Then line 3 big, and Levi's recording plays, 1:10.80 to 1:17.70. |
| 1:17.80 | Line 3 marked, all green, held in silence for 1.5 seconds. |

**Voiceover, after line 1:**
"Green means I read it right. Every letter, every vowel. The ear first heard fa here, the Israeli way. The vowel checks compared it with my own voice and set it back to fo."

**Voiceover, after line 2:**
"On this line I made a mistake on purpose. Under this kaf is a chirik: ki. I read it che. The mark lands on that one vowel. Purple means the vowel was wrong. Crossed out is what I said. Under it, what it should have been."

### 1:19.30 | 3a. The ear never sees the text

**Screen:** The How it works diagram from the README, drawn as a still page with the README's own boxes and wording. Only the ear box is highlighted. Top caption: "Muse Wonder hears. It never sees the text."

**Voiceover:**
"Here's the part that matters. The ear is Muse Wonder, through the Meta Model API. It gets my audio and a sound alphabet, and never the printed line. A model that knows the word tends to hear the word. So the ear only writes sounds."

### 1:34.43 | 3b. Four Meta models, four jobs

**Screen:** A card titled "Four Meta models, four jobs". Four rows fade in one after another as the voiceover names them, each with the model name, its host and its job:

| Model | Host | Job |
| --- | --- | --- |
| Muse Wonder 1.0 | Meta Model API | The ear. Hears the sounds, never the text. |
| wav2vec2 phoneme model | Meta open weights, on this Mac | Checks every vowel against the reader's voice card. |
| Muse Spark 1.3 | Meta Model API | Picks the next lines. Code checks every pick. |
| Muse Spark Open | Baseten | Tested as the ear. Wired in as the backup. |

**Voiceover:**
"I use four Meta models, each picked by testing. Muse Wonder is the ear. We ask it five times at once and grade the first answer back. Meta's open wav2vec2 phoneme model runs on this Mac and checks every vowel against my own voice. Muse Spark picks the next lines. Muse Spark Open, on Baseten, was tested as the ear and is wired in as the backup."

### 1:56.93 | 4. One reading, two traditions

**Screen:** Two terminal panes side by side, with the real commands and their real output. Left pane: Ashkenazi, three `ok`. Right pane: Sephardi, `wrong_vowel` and `wrong_letter`.

```bash
npm run grade -- --preset ashkenazi --line "שַׁבָּת" --heard "sha-bos"
npm run grade -- --preset sephardi --line "שַׁבָּת" --heard "sha-bos"
```

**Voiceover:**
"Same sounds, sha-bos. In Ashkenazi reading, that's right. In Sephardi reading, it's two mistakes. The rulebook judges each child by their own tradition."

### 2:04.73 | 5. The teacher view

**Screen:** Three screens from the simulated class, each with the labels "Simulated class" and "Next lines picked by Muse Spark 1.3": a child's reading map with its legend, the Class view with its practice groups, and the practice packet, panned from its top to its Challenge.

**Voiceover:**
"The teacher gets a reading map: every letter with every vowel, solid, shaky, or not tested yet. Children are grouped by what to practice next. Muse Spark picks the next lines from the bank, and code checks every pick. The packet has a warm-up, practice and a challenge. No model writes Hebrew a child reads."

### 2:23.47 | 6. Honest results

**Screen:** A plain results card, white ground, large navy type, held for the whole section:

> One adult voice, planted mistakes, sealed rounds.
> Six sealed rounds run. Five failed. One passed.
> Round 1i, three of three runs: all 4 planted mistakes caught in each run. No correct reading marked wrong.
> Muse Wonder alone: 5 or 6 false marks a run. With the meter and Meta's phoneme model: 0.
> Muse Wonder caught 9 of 10 planted mistakes where Muse Spark Open caught 6. Minimal reasoning took it from 15 s a clip to 2.4 s.
> No child round yet.

**Voiceover:**
"I tested it on my own voice, with mistakes planted on purpose. No child's voice without a parent's consent. In a sealed round, the rules are frozen before anyone hears the answers. Five sealed rounds failed. They're all published. Round 1i passed all three runs. Every planted mistake caught. Nothing marked wrong by mistake."

### 2:41.63 | 7. Close

**Screen:** The Who's reading screen from the simulated class with its label (2:41.63). At 2:46.10 a card reads, timed to the sentence about a new rulebook, "Any language" in large type, with a row of three boxes joined by arrows: "Sounds in", "Rulebook", "Every letter graded". At 2:49.57, on "A tenth of any prize", an end card: "Kriah Listener", "github.com/drlevidruin/meta-hackathon-entry", and a small line "Built with Muse Wonder, Muse Spark and Meta's wav2vec2".

**Voiceover:**
"Every child who reads Hebrew deserves a listener who catches the one dot. With a new rulebook, it could listen in any language. A tenth of any prize goes to tzedakah, charity. The rest brings it to the world. Only possible with Muse. Every child deserves to be heard. Kriah Listener."

The any-language sentence is a design claim, not something tested, which is why it says "could".

## Where each number lives

- Round 1i, three runs, 4 planted mistakes caught, no correct reading marked wrong, and Muse Wonder alone leaving 5 or 6 false marks a run: `docs/build-log.md`, the Round 1i paragraph, and `docs/ear-test.md`, "Round 1i: sealed test" and "Round 1i results".
- Muse Wonder catching 9 of 10 planted mistakes: `docs/ear-test.md` line 112 and `README.md` line 73.
- Muse Spark Open catching 6 of the 10: `docs/ear-test.md` line 113.
- 15 seconds a clip down to 2.4 with minimal reasoning: `docs/ear-test.md` lines 45 to 53, on 13 synthetic clips.
- The ear's first answer for line 1, `le-fa-ne-cha`, and the checked answer, `le-fo-ne-cho`, and the mark on כִי: `docs/ear-test.md`, "A fresh run, November 4".
- Five calls at once and the first answer graded: `README.md`, "How it works", step 1.
- The Round 1i planted mistakes are listed in `docs/ear-test.md`, "Round 1i: sealed test".

## Recording the voiceover

- [ ] Read from `kriah-demo-voiceover-script.txt`, which lists every line with its start and end time. The video leaves silence for each line and plays Levi's recorded reading by itself at 0:25.13, 0:44.50 and 1:10.80.
- [ ] Quiet room, no fan or music. One microphone for the whole voiceover.
- [ ] Say nothing during the three reading windows.
- [ ] Each line fits its window. If a line runs long, re-record it faster; do not shorten the words.
- [ ] Mix the voiceover over the clean cut, keeping Levi's reading at natural volume.
- [ ] Final cut timed at 3:00 or less.
- [ ] No child's voice, face or name anywhere in the video.
- [ ] Every mock screen carries "Simulated class".
- [ ] Video uploaded to YouTube as Unlisted (the form asks for a video link) and opened in a logged-out browser before it goes into the form.
