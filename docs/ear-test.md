# Ear test

The ear must report the sounds that were spoken, including mistakes. It receives audio and a sound alphabet. It never sees the printed line. It can still mishear or replace a mistake with a familiar word.

Muse Wonder 1.0 was chosen after the synthetic trials below. The adult round ran on October 27 and did not pass with either ear. Wonder kept the planted consonants, syllables and words, but wrote Israeli vowels for an Ashkenazi reading. Muse Spark Open did worse and filled in a skipped word of Shema from memory. The child round has not run.

## Round 0: synthetic voices

`recordings/make-synthetic.sh` defines 13 clips from macOS Hebrew and English voices. Seven contain a planted mistake and six are clean controls. The Hebrew voice reads text with the mistake written in. The English voice reads spelled-out sounds.

| Voice | Planted clips | Clean controls |
| --- | --- | --- |
| Hebrew, Carmit | `baruch_va-for-ba`, `shabbat_va-for-ba`, `melech_skipped-le`, `echad_i-for-a` | `shalom_clean`, `shema-line_clean`, `babav_nonsense-clean` |
| English, Samantha | `en_shabbos_va-for-ba`, `en_baruch_va-for-ba`, `en_modeh_u-for-o` | `en_shabbos_clean`, `en_baruch_clean`, `en_modeh_clean` |

The October 26 notes record these results for Muse Wonder 1.0:

| Run | Plants reported as spoken | Plants in the set |
| --- | --- | --- |
| First | 5 | 7 |
| Second | 5 | 7 |

The notes report no prose answers from Wonder. They also mention an HTTP error and unclear answers, but do not map those outcomes to every clip and run. The original list of successful readings combined outputs without identifying their runs. It cannot establish which plants succeeded in each run.

The Hebrew voice's planted vav in וָרוּךְ was reported as `ba-ruch`. Without listening to the source clip, that result cannot distinguish a voice synthesis error from an ear correction. The English voice also added an r to its clean reading of Modeh, which came back as `mo-der`.

A separate grader replay described `va-ruk` for בָּרוּךְ and `ya-chid` for אֶחָד as `not_decoded`. It also described a wrong-letter verdict for the r in `mo-der`. The saved notes do not list the full replay subset or its expected verdicts. They do not support an exact grader success rate, or a split between successful plants and clean controls.

These are recorded observations, not a fresh replay. The repository contains the generation script but no audio or complete per-run output. The clip definitions can be counted offline. The live results cannot be reproduced without regenerating the clips and calling the API.

### Other Meta ear trials

Earlier October 26 notes record three runs per model with the first prompt. Muse Spark 1.2 and Muse Wonder 1.0 reported the English plants, including `sha-vas` and `va-ruk`. Muse Spark 1.3 corrected `sha-vos` toward `sha-bos` and copied the prompt's real-word examples. The prompt then switched to made-up sounds. Spark 1.2 answered in prose on about a third of clips.

With those made-up examples, the notes report two runs per model:

| Model | Plants reported as spoken, of 7, run 1 and run 2 | Other answers |
| --- | --- | --- |
| Muse Wonder 1.0 | 5 and 5 | No prose; an HTTP 500 and unclear answers are noted. |
| Muse Spark 1.2 | 2 and 2 | 3 and 2 prose answers; 4 `?` clips per run. |
| Muse Spark 1.3 | 1 and 4 | 7 and 4 `?` clips; 0 and 1 empty answers. |

These are the notes' counts, not a complete per-clip record. Wonder is the primary ear. Muse Spark Open on Baseten is wired as the fallback ear. It first ran on October 27, on the adult clips.

### Speed: reasoning effort

The same 13 synthetic clips went through Muse Wonder 1.0 once per setting:

| Setting | Seconds per clip, average | Plants reported as spoken, of 7 |
| --- | --- | --- |
| Not set, default | About 15 | 5 |
| `low` | 7.8 | 5 |
| `minimal` | 2.4 | 5 |

The ear now requests `minimal`; `EAR_REASONING_EFFORT` overrides it. At minimal reasoning the Hebrew voice's שְׁמַע came back as `shma`, while slower settings wrote `she-ma`. Real voices must check that difference. These timings are recorded observations, not a fresh benchmark.

### Muse Voice Transcribe 1.0

Meta's transcription endpoint, `POST /v1/asr/transcribe`, was tried with and without a Hebrew language hint. Every clip answered in under a second, but it writes words rather than raw sounds. The planted English `va-ruk` became Baruch without the hint; a clean `sha-bos` became Shabbat with it. Hebrew output dropped nikud, including ברוך and שלום. It also invented words on two clips and answered one in Arabic script. It was rejected as the ear.

The prose check removes outer wrappers, list markers and a known heading such as `Sounds:`. In lowercase readings, trailing commas and periods separate words and are stripped before parsing. Capitals with punctuation, internal apostrophes and other punctuation count as prose. Capitals alone can be readings, such as `Sha-vos` or `SHA-BOS`. Listed English refusal words count as prose at any length, including `silent`, `inaudible` and `unclear`. Longer answers also fail on a listed refusal phrase or two distinct listed prose words. A prose answer is retried once, then counts as a failed call. Prose made entirely of allowed characters can still escape these checks.

## Voice check

Each reader reads this card once before Round 1. Its vowels give the vowel meter the reader's own a, o, e and i. Read it syllable by syllable, with a short pause between syllables, in the same pronunciation as the clips.

| File name | Hebrew | Say | Planted | The ear should write |
| --- | --- | --- | --- | --- |
| voice-check | בָּ בַּ בֶּ בִּ בֹּ דָ דַ דֶ דִ דֹ מָ מַ מֶ מִ מֹ | bo ba be bi boy do da de di doy mo ma me mi moy | nothing | not graded |

## Round 1: an adult voice

Read each clip once, at a normal pace, in Ashkenazi pronunciation. One clip per recording, with the [local clip recorder](../tools/clip-recorder/README.md).

| File name | Hebrew | Say | Planted | The ear should write |
| --- | --- | --- | --- | --- |
| shabbos_va-for-ba | שַׁבָּת | sha-vos | בּ read as v | sha-vos |
| baruch_clean | בָּרוּךְ | bo-ruch | nothing | bo-ruch |
| shalom_patach-for-kamatz | שָׁלוֹם | sha-loym | kamatz read as patach | sha-loym |
| melech_skipped-syllable | מֶלֶךְ | mech | לֶ skipped | mech |
| haolam_wrong-word | הָעוֹלָם | ha-ma-kom | a different word | ha-ma-kom |
| yisrael_shin-for-sin | יִשְׂרָאֵל | yish-ro-eyl | שׂ read as שׁ | yish-ro-eyl |
| elokeinu_segol-for-tzere | אֱלֹהֵינוּ | e-loy-ke-nu | tzere read as segol | e-loy-ke-nu |
| echad_extra-syllable | אֶחָד | e-cho-de | an extra syllable | e-cho-de |
| modeh_shuruk-for-cholam | מוֹדֶה | mu-de | cholam read as shuruk | mu-de |
| ani_clean | אֲנִי | a-ni | nothing | a-ni |
| lefanecha_pei-for-fei | לְפָנֶיךָ | le-po-ne-cho | פ read as פּ | le-po-ne-cho |
| shema-line_skipped-word | שְׁמַע יִשְׂרָאֵל יְהֹוָה אֱלֹהֵינוּ יְהֹוָה אֶחָד | she-ma yis-ro-eyl a-do-noy a-do-noy e-chod | אֱלֹהֵינוּ skipped | five words, no e-loy-key-nu |

## Round 1 results, October 27

Levi read all 12 clips into the local recorder on an iMac, in Ashkenazi pronunciation. Muse Wonder 1.0 heard them through the Meta Model API at minimal reasoning. The grader then scored each answer with the Ashkenazi preset. First run:

| Clip | Said | Ear wrote | Grader, Ashkenazi preset |
| --- | --- | --- | --- |
| shabbos_va-for-ba | sha-vos | sha-vas | Plant marked |
| baruch_clean | bo-ruch | ba-ruch | False mark: kamatz |
| shalom_patach-for-kamatz | sha-loym | sha-loym | Plant marked |
| melech_skipped-syllable | mech | mech | Plant marked |
| haolam_wrong-word | ha-ma-kom | ha-ma-kom | Plant marked |
| yisrael_shin-for-sin | yish-ro-eyl | yesh ro el | Plant marked; false marks: chirik, tzere |
| elokeinu_segol-for-tzere | e-loy-ke-nu | e-lo-ke-nu | Plant marked |
| echad_extra-syllable | e-cho-de | a-cha-da | Plant marked; rest of the word not decoded |
| modeh_shuruk-for-cholam | mu-de | mu-de | Plant marked |
| ani_clean | a-ni | a-ni | Clean |
| lefanecha_pei-for-fei | le-po-ne-cho | la-pa-na-cha | Plant missed; word not decoded |
| shema-line_skipped-word | she-ma yis-ro-eyl a-do-noy a-do-noy e-chod | sha-ma yis-ra-el a-do-noy a-do-noy e-chad | Plant marked; false marks: sheva, kamatz, tzere, kamatz |

Two more runs on the committed prompt, one at minimal and one at low reasoning, gave nearly the same answers. In all three runs the grader marked 9 of the 10 planted mistakes, and the strict check above passed 5, 5 and 4 of 12. The ear wrote Israeli vowels where Levi said Ashkenazi ones: kamatz said as o came back as a, tzere said as ey came back as e, and a sheva said as e came back as a. That put 7 or 8 false wrong-vowel marks in each run, including the clean baruch, and left one or two words undecoded. In lefanecha every vowel came back as a, so the grader could not decode the word and missed its planted פ.

Two prompt changes were tried in a scratch copy and not committed: a sentence telling the ear never to change vowels to Israeli or any other pronunciation, and an added `aw` vowel. Neither changed the vowels.

Muse Spark Open, the fallback ear, then heard the same 12 clips once through Baseten. It was the first time it had run. It did worse than Wonder: the grader marked 6 of the 10 planted mistakes, the strict check passed 2 of 12, and there were 23 false marks. It wrote the same Israeli vowels, including a-do-nay where Levi said a-do-noy. It often split syllables with spaces instead of hyphens, which the parser reads as separate words. On the Shema line Levi skipped אֱלֹהֵינוּ, and Spark Open wrote e-lo-hey-nu anyway: without seeing the text, it filled in the verse from memory.

Round 1 does not pass for Ashkenazi vowels with either ear. Sephardi readings have not been tested.

## Round 1b: new words

Read each clip once, after the voice check, in Ashkenazi pronunciation. None of these words was used to choose the vowel meter's first settings. Their results then led to a fix, so Round 1b is no longer a fair test (see the next section).

| File name | Hebrew | Say | Planted | The ear should write |
| --- | --- | --- | --- | --- |
| omein_clean | אָמֵן | o-meyn | nothing | o-meyn |
| brocho_clean | בְּרָכָה | be-ro-cho | nothing | be-ro-cho |
| shomayim_clean | שָׁמַיִם | sho-ma-yim | nothing | sho-ma-yim |
| dovor_clean | דָּבָר | do-vor | nothing | do-vor |
| emes_clean | אֱמֶת | e-mes | nothing | e-mes |
| toyro_clean | תּוֹרָה | toy-ro | nothing | toy-ro |
| mitzvo_clean | מִצְוָה | mitz-vo | nothing | mitz-vo |
| godol_patach-for-kamatz | גָּדוֹל | ga-doyl | kamatz read as patach | ga-doyl |
| kovod_patach-for-kamatz | כָּבוֹד | ka-voyd | kamatz read as patach | ka-voyd |
| sheym_chirik-for-tzere | שֵׁם | shim | tzere read as chirik | shim |
| ato_kamatz-for-patach | אַתָּה | o-to | patach read as kamatz | o-to |

## Vowel meter results, October 27

The ear's Israeli vowels led to the vowel meter ([README](../README.md), step 2). The meter measures each vowel in the audio and compares it with the reader's own vowels from the voice check card. It changes the ear's a or e only when another of the reader's vowels fits clearly better. Like the ear, it never sees the text.

Levi read the voice check card and Round 1b at 9:49 AM, after the Round 1 clips from 8:15 AM. Muse Wonder 1.0 then heard all 23 clips once. The first meter weighed the second formant at half. It helped, but not enough:

| Round | Clips | With the meter | Ear alone |
| --- | --- | --- | --- |
| Round 1 | 12 | 9 of 10 plants marked, 9 false marks | 8 of 10 plants marked, 16 false marks |
| Round 1b | 11 | 3 of 4 plants marked, 7 false marks | 3 of 4 plants marked, 11 false marks |

Measuring Levi's card showed why. His kamatz and patach differ by about the same amount in both formants, so the half weight left them nearly tied. Short unvoiced bursts also counted as syllables and broke the syllable count. Commit `90658ef` weighs both formants equally and drops sound islands that are mostly unvoiced. Applied to the same saved answers:

| Round | Clips | With the meter | Ear alone |
| --- | --- | --- | --- |
| Round 1 | 12 | 10 of 10 plants marked, 4 false marks | 8 of 10 plants marked, 16 false marks |
| Round 1b | 11 | 4 of 4 plants marked, 3 false marks | 3 of 4 plants marked, 11 false marks |

These numbers are not a fair test. Round 1 runs were used to choose the settings, and Round 1b was used to find the fix. That is why Round 1c exists: its answers stay unread until the settings are final.

The false marks that remain:

- Yisroel, in its own clip: the ear wrote yesh and el. Its chirik and tzere both came back as e, and the meter does not handle ey.
- Yisroel, in the Shema line: the kamatz stayed ra and the tzere came back as e.
- Shomayim: the first kamatz came back as she. After sh, Levi's unstressed o sits close to his e.
- Dovor: the first kamatz stayed da.
- Toyro: the kamatz stayed ra.

In ato the plant was marked, but the meter wrote e where Levi said o.

## Round 1c: sealed test

Read each clip once, after Round 1b, in Ashkenazi pronunciation. Their results stay unread until the vowel meter's settings are final.

| File name | Hebrew | Say | Planted | The ear should write |
| --- | --- | --- | --- | --- |
| odom_clean | אָדָם | o-dom | nothing | o-dom |
| chochom_clean | חָכָם | cho-chom | nothing | cho-chom |
| neshomo_clean | נְשָׁמָה | ne-sho-mo | nothing | ne-sho-mo |
| tzedoko_clean | צְדָקָה | tze-do-ko | nothing | tze-do-ko |
| shono_clean | שָׁנָה | sho-no | nothing | sho-no |
| bonim_clean | בָּנִים | bo-nim | nothing | bo-nim |
| kosuv_clean | כָּתוּב | ko-suv | nothing | ko-suv |
| cholov_patach-for-kamatz | חָלָב | cha-lov | kamatz read as patach | cha-lov |
| bayis_kamatz-for-patach | בַּיִת | bo-yis | patach read as kamatz | bo-yis |
| leyv_chirik-for-tzere | לֵב | liv | tzere read as chirik | liv |
| beney_patach-for-sheva | בְּנֵי | ba-ney | sheva read as patach | ba-ney |

## Card tests

Read these after Round 1c, syllable by syllable, with a short pause between syllables. The first is the voice check for a reader who has learned only kamatz. The other two are read wrong on purpose, every kamatz as patach, to test that a wrong voice check cannot hide a mistake.

| File name | Hebrew | Say | Planted | The ear should write |
| --- | --- | --- | --- | --- |
| kamatz-card_clean | בָּ דָ מָ גָ תָּ קָ | bo do mo go to ko | nothing | not graded |
| kamatz-card_patach-for-kamatz | בָּ דָ מָ גָ תָּ קָ | ba da ma ga ta ka | every kamatz read as patach | not graded |
| voice-check_patach-for-kamatz | בָּ בַּ בֶּ בִּ בֹּ דָ דַ דֶ דִ דֹ מָ מַ מֶ מִ מֹ | ba ba be bi boy da da de di doy ma ma me mi moy | every kamatz read as patach | not graded |

## Round 2: a child's voice

The adult round must pass first. Recording a child requires written parent consent. Turn Meta Model API free credits off and use a paid plan before sending children's audio. Meta's free-credit terms allow content to be used for product improvement.

The child reads a line and plants a mistake from the adult table. The local recorder saves these clips in gitignored `recordings/private/`. The child runner deletes each clip after printing its result, including failed calls, unless `--keep` is set. Closing the recorder does not delete files. The recorder's delete button removes saved child WAVs. See the [recorder instructions](../tools/clip-recorder/README.md).

## Passing

Each planted mistake must come back as the sound that was said. Clean controls check whether the ear invents mistakes. A pass on the adult round does not establish accuracy on a child's voice.

`npm run ear-test` compares the returned sounds with the table's `Say` column. It ignores case and spaces within each word. Syllable boundaries, word boundaries, order and word count must match. It prints `PASS` or `MISS` for each recorded clip. It does not call the grader or check letter-level verdicts.

The runner defaults to the Meta primary when `META_API_KEY` is nonempty, then the Baseten fallback when only `BASETEN_API_KEY` is nonempty, otherwise the Meta primary. It prints the selected role and model id. `--model primary` or `--model fallback` overrides that choice.
