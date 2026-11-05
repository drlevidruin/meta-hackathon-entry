# Demo video script

Length 2:59.33, under the 3:00 limit. Rabbi Dr. Levi Druin narrates in his own voice. Only an adult appears or reads: no child's voice, face or name. Every number in the video is in `docs/ear-test.md`, `docs/live-run.md` or `docs/build-log.md`; the sources are listed under "Where each number lives".

## How the video is built

The video is built from still screens with ffmpeg: crossfades, one slow zoom, a slow push-in on every still screen (3.5 percent, 2 percent on the title and end cards), a title card, and burned-in subtitles of every voiceover line. Nothing is a screen recording. Every screen is real station output or a page rendered from the repo's own text, and every screen from the mock class carries the label "Simulated class".

The voiceover is Levi's own voice. The first voiced cut was recorded through earbuds, which save audio at phone-call quality, and it sounded thin. On November 4 Levi recorded the whole script again in one take on the iPhone's own microphone. Then he re-recorded three lines: "One letter. One vowel. One dot.", the Shabbos line, and the line about Meta's phoneme model, which now says "on my Mac". Each paragraph is cut from the last clean read of it: a Whisper transcript is matched to the script, and the cuts fall in the pauses of the audio. Where the transcript was unsure of a word, Meta's phoneme model settled it: Levi said "learn kriah", not "learned". Whisper is used only to edit the video; it is not part of the station. The scene times follow his voice. Pauses longer than 0.34 seconds were shortened and the voice runs 7 percent faster, so the cut fits three minutes. The voice track has a light EQ and compression and is mixed to -16 LUFS; the earbud memos were 16 kHz audio, and this take is full band.

What changed after Levi watched the first voiced cut:

- The third reading is gone. After the second reading the video shows the station's finished screen, with a line about what a student sees when they finish.
- "Same sounds, sha-bos." became "Here we see the word Shabbos, read as sha-bos.", and the line goes on: "In Ashkenazi reading, it's marked correct. However, in Sephardic reading, it's two mistakes."
- The planted mistake is named for what it is, a chof: "Under this chof is a chirik: chi. I read it che."
- The opening now defines kriah: "From their first days in elementary school, our children learn kriah, which means reading Hebrew with its vowels."
- "No model writes Hebrew a child reads" became "The AI never writes the Hebrew. Every line a child reads comes from the siddur or our own rulebook."
- The results card and its voiceover are in Levi's words, in the first person.
- The closing line about a tenth of any prize going to tzedakah was replaced with "If I win, I hope to use part of the prize to bring this to the world."

To fit the time limit, two lines were left out of the new take: "Here's the part that matters." and "We ask it five times at once and grade the first answer back." Two teacher-view lines were cut earlier: "Children are grouped by what to practice next." and "The packet has a warm-up, practice and a challenge." The class view and the packet are still on screen.

Levi's two recorded readings play with no voice over them. Two cuts exist: one with the subtitles burned in, which is the one uploaded, and one without them. Labels stay in both.

## The scenes

Times are from the final cut.

### 0:00 | 1. The problem

**Screen:** The Who's reading screen from the simulated class, with a "Simulated class" label. Lower third for the first sentence: "Rabbi Dr. Levi Druin, Principal" and "Built October 26 to November 4, 2026". At 0:25.41, on "Until now.", the screen crossfades to a navy "Kriah Listener" title card in the style of the end card, then into the reading scene at 0:29.63.

**Voiceover:**
"I'm Rabbi Dr. Levi Druin, principal of a Jewish day school. I've never studied coding. From their first days in elementary school, our children learn kriah, which means reading Hebrew with its vowels. A teacher can't hear every child read every day, and the mistakes that matter are tiny. One letter. One vowel. One dot. So kriah is taught only in person, and nothing is tracked automatically. Until now. Using Muse, I built a station that listens."

### 0:29.63 | 2. Reading

**Screen:** The real reading screen, for Levi, Ashkenazi, with the Demo pill from demo mode. A label stays at the top of the screen: "Levi's recorded reading, Oct 30. Graded Nov 4." While each recording plays, the station shows its microphone on: the green "Listening" button.

The reading is two of Levi's adult recordings from October 30: `line01_modeh-ani_clean` and `line07_anochi_segol-for-chirik`. They were run on November 4 through the ear, the vowel meter and Meta's phoneme model, with Voice check 4 as the card. The run is recorded in `docs/ear-test.md`, "A fresh run, November 4", and in `docs/ear-test.md`, Round 1k. Each line plays with its real audio and no subtitles. The grades on screen come from the same grader function the server uses, with the Ashkenazi preset. The finished screen is the station's end of that turn, which also had a third line, `line02_shehechezarta_clean`, all green.

The planted mistake is on line 2: the chirik under the chof (כ) in אָנֹכִי, read as che. The grader marks that one vowel purple, with the struck-through "che" and the right sound "chi" under it. The screen slowly zooms toward it. Line 1 is all green.

| Start | What is on screen |
| --- | --- |
| 0:29.63 | Line 1 big, microphone on. Levi's recording plays, 0:29.91 to 0:37.53. |
| 0:37.75 | Line 1 marked, all green. A card reads "Muse Wonder heard: le-fa-ne-cha" and "After the vowel checks: le-fo-ne-cho". |
| 0:49.05 | Line 2 big, microphone on. Levi's recording plays, 0:49.33 to 0:59.41. |
| 0:59.63 | Line 2 marked, with the zoom on כִי. A tag reads "Heard by Muse Wonder. Vowels checked by Meta's phoneme model." |
| 1:15.09 | The station's finished screen: three stars and its end-of-turn sentence, "You nailed the lamed (ל) today! Next time we practice the chirik with a yud." The sentence comes from `station/src/messages.js`. |

**Voiceover, after line 1:**
"Green means I read it right. Every letter, every vowel. The ear first heard fa here, the Israeli way. The vowel checks compared it with my own voice and set it back to fo."

**Voiceover, after line 2:**
"On this line I made a mistake on purpose. Under this chof is a chirik: chi. I read it che. The mark lands on that one vowel. Purple means the vowel was wrong. Crossed out is what I said. Under it, what it should have been."

**Voiceover, on the finished screen:**
"Here's what a student sees when they finish: their stars, and what to practice next."

### 1:19.78 | 3a. The ear never sees the text

**Screen:** The How it works diagram from the README, drawn as a still page with the README's own boxes and wording. Only the ear box is highlighted. Top caption: "Muse Wonder hears. It never sees the text."

**Voiceover:**
"The ear is Muse Wonder, through the Meta Model API. It gets my audio and a sound alphabet, and never the printed line. A model that knows the word tends to hear the word. So the ear only writes sounds."

### 1:32.89 | 3b. Four Meta models, four jobs

**Screen:** A card titled "Four Meta models, four jobs". Four rows fade in one after another as the voiceover names them (1:36.24, 1:38.06, 1:45.47 and 1:47.65), each with the model name, its host and its job:

| Model | Host | Job |
| --- | --- | --- |
| Muse Wonder 1.0 | Meta Model API | The ear. Hears the sounds, never the text. |
| wav2vec2 phoneme model | Meta open weights, on my Mac | Checks every vowel against the reader's voice card. |
| Muse Spark 1.3 | Meta Model API | Picks the next lines. Code checks every pick. |
| Muse Spark Open | Baseten | Tested as the ear. Wired in as the backup. |

**Voiceover:**
"I used four Meta models, each picked by testing. Muse Wonder is the ear. Meta's open wav2vec2 phoneme model runs on my Mac and checks every vowel against my voice. Muse Spark picks the next lines. Muse Spark Open, on Baseten, was tested as the ear and is wired in as the backup."

### 1:53.55 | 4. One reading, two traditions

**Screen:** Two terminal panes side by side, with the real commands and their real output. Left pane: Ashkenazi, three `ok`. Right pane: Sephardi, `wrong_vowel` and `wrong_letter`.

```bash
npm run grade -- --preset ashkenazi --line "שַׁבָּת" --heard "sha-bos"
npm run grade -- --preset sephardi --line "שַׁבָּת" --heard "sha-bos"
```

**Voiceover:**
"Here we see the word Shabbos, read as sha-bos. In Ashkenazi reading, it's marked correct. However, in Sephardic reading, it's two mistakes. The rulebook judges each child by their own tradition."

### 2:06.63 | 5. The teacher view

**Screen:** Three screens from the simulated class, each with the labels "Simulated class" and "Next lines picked by Muse Spark 1.3": a child's reading map with its legend (2:06.63), the Class view with its practice groups (2:12.45), and the practice packet, panned from its top to its Challenge (2:16.68).

**Voiceover:**
"The teacher gets a reading map: every letter with every vowel, solid, shaky, or not tested yet. Muse Spark picks the next lines from the bank, and code checks every pick. The AI never writes the Hebrew. Every line a child reads comes from the siddur or our own rulebook."

The bank's real words come from siddur text and its nonsense words are built from the rulebook's rules (`bank/`).

### 2:22.96 | 6. Honest results

**Screen:** A plain results card, white ground, large navy type, held for the whole section:

> Five rounds failed.
> The sixth was perfect.
> I locked the rules before every test, so I couldn't fool myself, and I published every failure.
> In round six, every planted mistake was caught in all three runs, and nothing was marked wrong.
> On its own, Muse Wonder made 5 or 6 false marks a run. With the vowel meter and Meta's phoneme model checking its vowels, there were none.
> Next, I'll test it with children, once their parents consent.

**Voiceover:**
"I tested it on my own voice, with mistakes planted on purpose. I didn't use a child's voice, to protect their privacy. Before every test, I locked the rules, so I couldn't fool myself. The first five rounds failed, and I published every one. I fixed what each one taught me, and the sixth round was perfect. Every planted mistake was caught, and nothing was marked wrong."

The sixth sealed round is Round 1i. "Perfect" is its result in all three runs: 4 of 4 planted mistakes caught, 0 false marks and 0 uncertain syllables.

### 2:42.65 | 7. Close

**Screen:** The Who's reading screen from the simulated class with its label (2:42.65). At 2:46.97 a card reads "Any language" in large type, with a row of three boxes joined by arrows: "Sounds in", "Rulebook", "Every letter graded". At 2:50.56, on "If I win", an end card: "Kriah Listener", "github.com/drlevidruin/meta-hackathon-entry", and a small line "Built with Muse Wonder, Muse Spark and Meta's wav2vec2".

**Voiceover:**
"Every child who reads Hebrew deserves a listener who catches the one dot. With a new rulebook, it could listen in any language. If I win, I hope to use part of the prize to bring this to the world. Kriah Listener was only possible with Muse. Every child deserves to be heard. Thank you!"

The any-language sentence is a design claim, not something tested, which is why it says "could".

## Where each number lives

- Six sealed rounds, five failed: Rounds 1c, 1d, 1e, 1g and 1h failed and Round 1i passed, all in `docs/ear-test.md`.
- Round 1i, three runs, 4 of 4 planted mistakes caught in each, no correct reading marked wrong, nothing uncertain, and Muse Wonder alone leaving 5 or 6 false marks a run: `docs/ear-test.md`, "Round 1i results", and `docs/build-log.md`, the Round 1i paragraph.
- The ear's first answer for line 1, `le-fa-ne-cha`, and the checked answer, `le-fo-ne-cho`, and the mark on כִי: `docs/ear-test.md`, "A fresh run, November 4".
- The Round 1i planted mistakes are listed in `docs/ear-test.md`, "Round 1i: sealed test".

## Before it goes in the form

- [x] Final cut timed at 3:00 or less: 2:59.33.
- [x] No child's voice, face or name anywhere in the video.
- [x] Every mock screen carries "Simulated class".
- [x] Uploaded to YouTube, https://youtu.be/VbqpDTlsqT0, and opened without signing in, November 4, before the link went into the form.
