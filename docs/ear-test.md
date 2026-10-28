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

## Round 1c results, October 27

Levi read Round 1c at 11:25 AM, after the settings were frozen at `d109049`. Muse Wonder 1.0 heard each clip once between 11:28 and 11:36 AM, with the meter from `90658ef` and his voice check. Nobody read these answers before the run.

| Round | Clips | With the meter | Ear alone |
| --- | --- | --- | --- |
| Round 1c | 11 | 4 of 4 plants marked, 15 false marks | 3 of 4 plants marked, 17 false marks |

The meter caught every plant, but it did not carry over to new words. On the words it was built on, it cut false marks from 16 to 4 and from 11 to 3. Here it cut them from 17 to 15. Only one of the seven clean words came out clean.

| File name | Say | Ear wrote | With the meter |
| --- | --- | --- | --- |
| odom_clean | o-dom | a-dam | e-dam, 3 false marks |
| chochom_clean | cho-chom | cha-cham | unchanged, 2 false marks |
| neshomo_clean | ne-sho-mo | ne-sha-ma | unchanged, 2 false marks |
| tzedoko_clean | tze-do-ko | tse-da-ka | unchanged, 3 false marks |
| shono_clean | sho-no | sha-na | unchanged, 2 false marks |
| bonim_clean | bo-nim | ba-nim | bo-nim, clean |
| kosuv_clean | ko-suv | ka-sov | unchanged, 3 false marks |
| cholov_patach-for-kamatz | cha-lov | cha-lav | cha-lov, plant marked |
| bayis_kamatz-for-patach | bo-yis | ba yes | bo yis, plant marked |
| leyv_chirik-for-tzere | liv | liv | liv, plant marked |
| beney_patach-for-sheva | ba-ney | ba-ney | ba-ney, plant marked |

Every syllable formed its own sound island, so the meter measured every vowel. It left the ear's a in place because most of Levi's kamatz vowels in these words measured next to his patach from the card. In tzedoko, the do measured 0.12 Bark from his card patach and 1.25 from his card kamatz. After b and l, kamatz still measured as o, which is why bonim and cholov came out right. On the card he read each kamatz on its own. Inside words the same vowel came out more open. The card did not predict how he reads kamatz in words.

Some false marks are not kamatz at all. The ear wrote ts for tz in tzedoko and o for the shuruk in kosuv. The meter does not handle either.

The meter on the beginner-vowels branch gives the same numbers on these answers: 4 of 4 plants, 15 false marks. Round 1c has now been read, so it no longer counts as a sealed test. A change made from here needs new words.

## Card tests

Read these after Round 1c, syllable by syllable, with a short pause between syllables. The first is the voice check for a reader who has learned only kamatz. The other two are read wrong on purpose, every kamatz as patach, to test that a wrong voice check cannot hide a mistake.

| File name | Hebrew | Say | Planted | The ear should write |
| --- | --- | --- | --- | --- |
| kamatz-card_clean | בָּ דָ מָ גָ תָּ קָ | bo do mo go to ko | nothing | not graded |
| kamatz-card_patach-for-kamatz | בָּ דָ מָ גָ תָּ קָ | ba da ma ga ta ka | every kamatz read as patach | not graded |
| voice-check_patach-for-kamatz | בָּ בַּ בֶּ בִּ בֹּ דָ דַ דֶ דִ דֹ מָ מַ מֶ מִ מֹ | ba ba be bi boy da da de di doy ma ma me mi moy | every kamatz read as patach | not graded |

## Card test results, October 27

The live ear wrote ba da ma ga ta ka for the kamatz-only card in 20 of 20 runs. On that card it hears Levi's kamatz as patach every time, so a kamatz-only voice check gives the ear nothing to compare.

A lab copy of the ear had one more vowel to write, aw, for a rounded open o. Each card ran five times.

| Card | Read | The lab ear wrote | Runs |
| --- | --- | --- | --- |
| kamatz-card_clean | bo do mo go to ko | ba da ma ga ta ka | 5 of 5 |
| kamatz-card_patach-for-kamatz | ba da ma ga ta ka | ba da ma ka ta ka | 5 of 5 |
| voice-check | bo ba be bi boy, and so on | baw ba be bi boy daw da de di doy maw ma me mi moy | 4 of 5; the fifth swapped baw and ba |
| voice-check_patach-for-kamatz | ba ba be bi boy, and so on | ba ba be bi boy ta ta de di doy ma ma me mi moy | 5 of 5 |

The ear heard the open o only when a patach was there to compare it with. It never wrote aw for a patach read in its place.

The meter was also run with the card read wrong, every kamatz as patach. On the saved Round 1 and Round 1b answers it marked 10 of 10 and 3 of 4 plants, with 8 and 10 false marks. With the real card it marked 10 of 10 and 4 of 4, with 4 and 3. The ear alone marked 8 of 10 and 3 of 4, with 16 and 11. A card read wrong costs accuracy, but it did not hide a planted mistake that the ear alone caught.

## Sheva tests

Levi found that the sound alphabet writes a sheva as e, the same letter as segol, so a quick sheva and a full eh look alike. An apostrophe now marks a sheva: n'-sho-mo is a quick n with no full vowel. Each word is read three ways: with a quick sheva, with the sheva as a full segol, and with the sheva as patach. These test whether the ear and the meter can tell a sheva from a full vowel.

| File name | Hebrew | Say | Planted | The ear should write |
| --- | --- | --- | --- | --- |
| sheva-brocho_clean | בְּרָכָה | b'-ro-cho | nothing | not graded |
| sheva-brocho_segol-for-sheva | בְּרָכָה | be-ro-cho | sheva read as a full segol | not graded |
| sheva-brocho_patach-for-sheva | בְּרָכָה | ba-ro-cho | sheva read as patach | not graded |
| sheva-neshomo_clean | נְשָׁמָה | n'-sho-mo | nothing | not graded |
| sheva-neshomo_segol-for-sheva | נְשָׁמָה | ne-sho-mo | sheva read as a full segol | not graded |
| sheva-neshomo_patach-for-sheva | נְשָׁמָה | na-sho-mo | sheva read as patach | not graded |
| sheva-shema_clean | שְׁמַע | sh'-ma | nothing | not graded |
| sheva-shema_segol-for-sheva | שְׁמַע | she-ma | sheva read as a full segol | not graded |
| sheva-shema_patach-for-sheva | שְׁמַע | sha-ma | sheva read as patach | not graded |
| sheva-zman_clean | זְמַן | z'-man | nothing | not graded |
| sheva-zman_segol-for-sheva | זְמַן | ze-man | sheva read as a full segol | not graded |
| sheva-zman_patach-for-sheva | זְמַן | za-man | sheva read as patach | not graded |

## Sheva test results, October 27

Levi recorded the twelve sheva clips at 11:43 AM. He wants a sheva read as a full eh marked wrong, once a test shows the system can hear the difference. These results say it cannot yet.

The live ear heard each clip four times. This is what it wrote for the first syllable.

| Word | Quick sheva | Full eh | Patach |
| --- | --- | --- | --- |
| brocho | be, 4 of 4 | be, 4 of 4 | ba, 4 of 4 |
| neshomo | ne, 4 of 4 | ne, 4 of 4 | na, 4 of 4 |
| shema | she, 4 of 4 | she, 4 of 4 | sha, 4 of 4 |
| zman | za 2, ze 2 | ze, 4 of 4 | za, 4 of 4 |

A lab copy of the ear was told to write a vowel too short to have a full sound as an apostrophe, like k'-lo. It wrote the apostrophe once in 48 answers.

| Word | Quick sheva | Full eh | Patach |
| --- | --- | --- | --- |
| brocho | be, 4 of 4 | ba, 4 of 4 | ba, 4 of 4 |
| neshomo | ne, 4 of 4 | ne, 4 of 4 | na, 4 of 4 |
| shema | she, 4 of 4 | she 3, sha 1 | sha, 4 of 4 |
| zman | za 3, z' 1 | ze, 4 of 4 | za, 4 of 4 |

The ear writes the same e for a quick sheva and a full eh. A patach read for a sheva is caught every time. In zman the live ear also wrote a for a correct quick sheva in 2 of 4 runs, which marks a right reading wrong.

The meter does find a difference in Levi's voice. His full eh is more open than his quick sheva in all four words, by 0.35 to 1.19 Bark in the first formant. But his quick sheva sits 0.25 to 0.56 Bark from the segol on his voice card, closer than his full eh does. A rule that called a sheva near the card's segol a mistake would mark his correct shevas wrong. Length does not help either: he held each sheva as its own syllable for 170 to 340 ms, about as long as his full eh, 250 to 360 ms.

So a sheva read as a full eh is still accepted. Marking it needs a measure that tells a quick sheva from a full eh in the reader's own voice, and a test on fresh recordings that shows it.

## Voice card to the ear, October 27

The card tests showed the ear hears Levi's kamatz as an open o only when a patach is in the same recording to compare. So the lab played the ear his voice card first, as its own recording, then the reading. It also let the ear write aw for a rounded open o, which is read as o.

The ear heard the 34 clips of Rounds 1, 1b and 1c three times in each setup. They hold 18 plants. Each cell lists the three runs.

| Setup | Plants caught of 18 | False marks | False marks in Round 1c |
| --- | --- | --- | --- |
| Live ear | 14, 14, 15 | 41, 40, 41 | 16, 16, 17 |
| aw, no card | 12, 13, 14 | 48, 43, 41 | 17, 16, 17 |
| Card first, with aw | 15, 17, 18 | 28, 25, 26 | 11, 11, 12 |

The same answers with the vowel meter:

| Setup | Plants caught of 18 | False marks | False marks in Round 1c |
| --- | --- | --- | --- |
| Live ear | 17, 18, 18 | 23, 21, 23 | 14, 14, 15 |
| aw, no card | 16, 17, 18 | 29, 23, 22 | 15, 14, 15 |
| Card first, with aw | 17, 18, 18 | 18, 15, 17 | 9, 9, 11 |

The card caught as many plants and cut false marks by about a quarter with the meter, and by about a third without it. The aw letter alone made things worse. Most false marks left with the card and the meter come from a kamatz written as a, in neshomo, tzedoko, kosuv, odom, toyro, shono, dovor and yisroel. In tzedoko and kosuv that vowel, with ts for tz or o for the shuruk, leaves too few right syllables, so the whole word is marked. Most of the rest are in yisroel, where the ear wrote e for the tzere and for the chirik. In one run the meter moved the ear's sha in shomayim to she instead of sho.

Two other tries failed:

- Playing the reading to the ear cut into single syllables, in order or shuffled. The ear joined the syllables back into words.
- Telling kamatz from patach by measuring them inside words. There Levi's kamatz overlaps his patach: first formant 4.8 to 7.3 Bark for kamatz, 6.8 to 7.6 for patach. Even a line drawn knowing the answers misplaced 5 of 41 vowels.

Levi also read the card wrong on purpose, with every kamatz as a patach, and the ear heard the 34 clips twice with that card first. With the meter it caught 14 and 16 of 18 plants, about what the live ear catches with no card. But plant by plant it hid two mistakes the live ear never missed. Once in two runs it wrote cho-lov for the planted cha-lov. In both runs it wrote ha-mo-kom for ha-ma-kom, so the wrong word still got marks, but not on the syllable the plant needs. A wrong card teaches the ear that this reader's kamatz sounds like a patach.

So the card reaches the ear only when the voice check shows it was read right. The server already measures the card's vowels for the meter. The card goes to the ear only when every vowel pair the meter uses was kept apart on it, by the meter's own separation rule. Levi's right card passes: his a and o sit 1.14 Bark apart, where 0.82 is needed. His wrong card fails at 0.08 apart, where 0.80 is needed. The rule follows the child's tradition: under Sephardi, where kamatz is an a, his right card fails and the wrong one passes. A card that shows kamatz must also show it apart from a patach. That leaves out Chassidish, where kamatz can be o or u and the voice check does not measure it, and a beginner who has learned kamatz but not patach. Their readings go to the ear without the card.

The card recording stays in the server's memory and is never written to disk. It is dropped when a teacher clears or skips the voice check, changes the child's vowels or tradition, or removes the child, and when the server stops. After a restart the child reads the card again at their next turn.

## Round 1d: sealed test

Read each clip once, after the sheva tests, in Ashkenazi pronunciation. Round 1c has been read, so these twelve words take its place as the sealed test. Nobody reads the ear's answers on them until the next ear change is final.

| File name | Hebrew | Say | Planted | The ear should write |
| --- | --- | --- | --- | --- |
| yod_clean | יָד | yod | nothing | yod |
| gomol_clean | גָּמָל | go-mol | nothing | go-mol |
| dogim_clean | דָּגִים | do-gim | nothing | do-gim |
| koton_clean | קָטָן | ko-ton | nothing | ko-ton |
| noshim_clean | נָשִׁים | no-shim | nothing | no-shim |
| seyfer_clean | סֵפֶר | sey-fer | nothing | sey-fer |
| chalo_clean | חַלָּה | cha-lo | nothing | cha-lo |
| ovinu_clean | אָבִינוּ | o-vi-nu | nothing | o-vi-nu |
| zohov_patach-for-kamatz | זָהָב | za-hov | the first kamatz read as patach | za-hov |
| yom_patach-for-kamatz | יָם | yam | kamatz read as patach | yam |
| abo_kamatz-for-patach | אַבָּא | o-bo | patach read as kamatz | o-bo |
| nachal_kamatz-for-patach | נַחַל | no-chal | the first patach read as kamatz | no-chal |

## Round 1d results, October 27

Levi read Round 1d at 12:30 PM. The settings were final at `00fe6b5`: the card goes to the primary ear when the gate passes, then the meter runs. His card passed the gate. Muse Wonder 1.0 heard each clip three times with the card and three times without it, between 1:31 and 1:42 PM. Nobody read these answers before the runs.

| Setup | Plants caught of 4 | False marks |
| --- | --- | --- |
| Card and meter | 3, 3, 4 | 2, 7, 5 |
| Meter, no card | 3, 3, 3 | 7, 7, 6 |
| Card, ear alone | 2, 2, 3 | 5, 11, 10 |
| Ear alone, no card | 2, 2, 2 | 13, 13, 11 |

| File name | Say | Card and meter, three runs | Meter, no card, three runs |
| --- | --- | --- | --- |
| yod_clean | yod | yad each run | yad each run |
| gomol_clean | go-mol | clean once, ga-mol twice | ga-mol each run |
| dogim_clean | do-gim | clean twice, da-gim once | da-gim each run |
| koton_clean | ko-ton | ko-tan each run | ka-tan each run, 2 false marks |
| noshim_clean | no-shim | clean twice, na-shim once | na-shim each run |
| seyfer_clean | sey-fer | clean each run | se-fer twice, clean once |
| chalo_clean | cha-lo | clean twice, cho-lo once | clean each run |
| ovinu_clean | o-vi-nu | clean each run | clean each run |
| zohov_patach-for-kamatz | za-hov | plant marked each run | plant marked each run |
| yom_patach-for-kamatz | yam | marked twice, yom once | plant marked each run |
| abo_kamatz-for-patach | o-bo | plant marked each run | plant marked each run |
| nachal_kamatz-for-patach | no-chal | marked twice, no-chol once with 3 false marks | na-chal each run |

On the sealed words the card helped, but it did not fix the Israeli vowels. With the meter it cut false marks from 20 to 14 over three runs and caught 10 of the 12 plants against 9. Kamatz still came out as a in yod and koton in every run, and in gomol, dogim and noshim in one or two.

The runs also showed what the card costs. In 3 of the 36 card readings the ear wrote o for a patach Levi said: cho-lo for cha-lo, no-chol for no-chal, and yom for the planted yam, which hid that mistake. The older rounds in the same runs showed it too: the ear wrote ko-voyd for the planted ka-voyd in two of three runs and sho-loym for sha-loym in one, hiding both. Without the card no patach-for-kamatz plant was hidden in any run, but the planted no-chal came back as na-chal in all three. Yom, ko-voyd and sho-loym are how an Ashkenazi reader says those words. The likely reason is that the card tells the ear the reader is Ashkenazi, and for a word it knows, it sometimes writes that reading instead of the sound. Cho-lo and no-chol have an o that no reading of those words has.

Across all 46 clips with the meter, the card caught 60 of 66 plants against 61 and left 72 false marks against 95. No run passed. Round 1d has now been read, so it no longer counts as a sealed test. A change made from here needs new words.

## Phoneme referee, October 27

The ear knows Hebrew words, and for an Ashkenazi reading it often writes the Israeli vowel of a word it knows. Meta's open phoneme model, wav2vec2 Large LV-60 fine-tuned to write espeak phonemes (`facebook/wav2vec2-lv-60-espeak-cv-ft`, Apache-2.0, revision `ae45363`), writes what it hears in IPA, with no word list or language model behind it. It ran on this Mac on all 62 saved adult clips. No audio left the computer.

It hears Levi's kamatz as a back vowel, `ɑ`, and his patach as a front `a`. On the card tests it was right on all twelve syllables: `bo do mo go to ko` came back as six `ɑ` and `ba da ma ga ta ka` as six `a`. On the readings it was right on 39 of 44 kamatz syllables and 13 of 14 patach syllables. It heard the kamatz as `a` in o-meyn, toy-ro, mitz-vo, bo-nim and bo-ruch, and no-chal's second patach as `ɑ`.

| Judge, same syllables | Kamatz right | Patach right | All |
| --- | --- | --- | --- |
| Phoneme model | 39 of 44 | 13 of 14 | 90% |
| Ear and meter, six Round 1d runs | 152 of 264 | 78 of 84 | 66% |
| Ear alone, six Round 1d runs | 47 of 264 | 78 of 84 | 36% |

The Shema line is left out of these counts, because the model dropped a vowel in it and its syllables do not line up.

The referee runs after the meter and changes only an a, o or e in the ear's answer:

- It pairs each syllable that has a vowel with the phoneme model's vowels in order. When the counts differ, it leaves the reading alone.
- For a vowel the model heard as a front or back a, it takes the back share of the model's probabilities.
- At or above the line, the syllable gets o. Below 0.15, an o becomes a. An e never becomes a.
- The line comes from the child's own voice card: the median back share of the card's a syllables and of its o syllables. Levi's are 0.43 and 0.91. The line is 0.5, or 0.05 above the card's a when that is higher. The referee is on only when the card's o sits at least 0.1 above the line.

On the wrong card, with every kamatz read as patach, the model heard 14 vowels for 15 syllables, so the card did not line up and the referee stayed off.

Replayed over the saved Round 1d runs of all 46 clips, with no new ear calls, and graded with the Ashkenazi preset:

| Setup | Plants caught of 66 | False marks |
| --- | --- | --- |
| Card and meter | 60 | 72 |
| Card, meter and referee | 62 | 36 |
| Meter, no card | 61 | 95 |
| Meter and referee, no card | 61 | 44 |

With the three card runs voted word by word first, 21 of 22 plants were caught with 21 false marks, and 10 with the referee.

It did not fix toy-ro, where the model also heard `a`; tse for tze; so for suv; e for ey in yis-ro-eyl; or the Shema line, which the count rule left alone. It made one clip worse: no-chal came back as no-chol, which hid the planted no in the runs where the ear had it right. The rule was designed on these clips, so these numbers are not a test. Round 1e is.

## Round 1e: sealed test

Read each clip once, in Ashkenazi pronunciation. Round 1d has been read, so these twelve words take its place as the sealed test. They test kamatz in short words the ear knows, patach where the card made the ear write o, and both kinds of planted vowel. Nobody reads the ear's or the phoneme model's answers on them until the vote and the phoneme referee are final.

| File name | Hebrew | Say | Planted | The ear should write |
| --- | --- | --- | --- | --- |
| shom_clean | שָׁם | shom | nothing | shom |
| poro_clean | פָּרָה | po-ro | nothing | po-ro |
| kosav_clean | כָּתַב | ko-sav | nothing | ko-sav |
| nofal_clean | נָפַל | no-fal | nothing | no-fal |
| chag_clean | חַג | chag | nothing | chag |
| kadur_clean | כַּדּוּר | ka-dur | nothing | ka-dur |
| sabo_clean | סַבָּא | sa-bo | nothing | sa-bo |
| kal_clean | קַל | kal | nothing | kal |
| ochal_patach-for-kamatz | אָכַל | a-chal | the kamatz read as patach | a-chal |
| kom_patach-for-kamatz | קָם | kam | kamatz read as patach | kam |
| gan_kamatz-for-patach | גַּן | gon | patach read as kamatz | gon |
| daf_kamatz-for-patach | דַּף | dof | patach read as kamatz | dof |

## Round 1e results, October 27

Levi read Round 1e at 3:12 PM. The settings were final at `1a9a038`: the primary ear asked three times per reading with the card when the gate passes, then the meter, then the phoneme referee. His card passed the gate and calibrated the referee at o 0.91 and a 0.43. Nobody read the answers on these words before the first run, from 3:15 to 3:26 PM.

Runs 2 and 3 used the same settings, from 3:55 to 4:03 PM and from 4:04 to 4:11 PM, after the memory fix described below.

| Judge | Plants caught of 4 | False marks |
| --- | --- | --- |
| Ear, three answers voted | 3, 3, 4 | 6, 3, 1 |
| Ear and meter | 3, 3, 4 | 6, 3, 1 |
| Ear, meter and referee | 3, 3, 4 | 5, 0, 1 |

| File name | Say | Ear and meter, three runs | With the referee, three runs |
| --- | --- | --- | --- |
| shom_clean | shom | sham twice, clean once | clean each run |
| poro_clean | po-ro | clean each run | clean each run |
| kosav_clean | ko-sav | ka-sav twice, clean once | ka-sav in run 1, when the referee got no answer; clean twice |
| nofal_clean | no-fal | na-fal once, clean twice | clean each run |
| chag_clean | chag | clean each run | clean each run |
| kadur_clean | ka-dur | clean each run | clean each run |
| sabo_clean | sa-bo | clean each run | clean each run |
| kal_clean | kal | kol twice, clean once | kol twice, clean once |
| ochal_patach-for-kamatz | a-chal | a-chol once, plant marked twice | a-chol once, plant marked twice |
| kom_patach-for-kamatz | kam | kom once, plant marked twice | kom once, plant marked twice |
| gan_kamatz-for-patach | gon | plant marked each run | plant marked each run |
| daf_kamatz-for-patach | dof | plant marked each run | plant marked each run |

Over the three runs the referee caught 10 of 12 plants, as many as without it, and cut false marks from 10 to 6. The ear wrote a for a kamatz Levi said as o five times on these words, and the referee fixed each of the four it checked. It changed four answers on these words, each to the vowel Levi said, and never wrote o for a patach he said. The meter changed no answer on these words. No run passed: run 2 left no false marks but missed a plant, and run 3 caught every plant with one false mark.

The referee fixed shom, where the ear and the meter wrote sham. In the first run it missed kosav for a reason outside its rule: the phoneme service gave no answer on that reading. The Mac was short of memory, macOS had swapped the idle model out, and the reading took longer than the time limit. The runner did not say so. Asked again later, the model heard kosav's kamatz as a back vowel, 0.95 against the line of 0.5. Swapped out, half a second of audio took 27 to 57 seconds that afternoon. The fix pins the model in RAM: pinned, the 21-second card takes about a second, and short readings under a tenth of a second. The runner now also tries a missed reading once more and names any reading the referee did not check.

With the model pinned, the referee checked 57 of the 58 readings in runs 2 and 3. It skipped only the Shema line, whose vowels did not line up. In run 2 it fixed shom, kosav and nofal. The ear wrote kom for the planted kam, and the referee left it: the phoneme model heard that vowel as a front a, with a back share of 0.37. That is below the line, so the a did not become o, but not below 0.15, where an o becomes a. Levi's card puts his own a at 0.43, so for his voice that undo almost never happens. In run 3 the ear itself wrote every kamatz on these words as Levi said it.

Apart from kosav in run 1, every error left on these words is the ear writing o where Levi said a: kal, a-chal and kom. No judge fixed kal, in two runs, or a-chal, in one. For a patach before a final l, the ear wrote kol and a-chol, and the phoneme model heard that vowel as the diphthong `aʊ`, which the referee leaves alone. In run 1 the planted a of a-chal was heard right, but the grader could not read a-chol as אָכַל, so it marked every letter of the word not decoded instead of marking the kamatz, and the plant does not count as caught.

Across all 58 clips, in the same three runs:

| Judge | Plants caught of 26 | False marks |
| --- | --- | --- |
| Ear, three answers voted | 22, 22, 25 | 43, 38, 28 |
| Ear and meter | 24, 24, 25 | 31, 27, 19 |
| Ear, meter and referee | 24, 24, 25 | 15, 9, 9 |

Rounds 1 to 1d shaped the meter, the card, the vote and the referee's rule, so these totals are not a test. Only Round 1e is. Over the three runs the referee changed 33 answers, and 32 moved a vowel to the one Levi said. One was worse: in run 3 the ear wrote na-chal for the planted no-chal, and the referee made it no-chol, the flaw seen when its rule was designed. The plant was missed either way, but the grader could not read no-chol, so it marked all three letters.

The pin and the retry changed how the service runs, not what the referee decides, so run 1 counts. Round 1e has now been read, so it no longer counts as a sealed test. A change made from here needs new words.

## Undo threshold, October 27

In run 2 of Round 1e the referee left kom for the planted kam, because the phoneme model's back share, 0.37, was not below 0.15. A threshold set from the card, at Levi's own a of 0.43, would have undone it. Round 1e has been read, so the idea was checked on the design rounds only: the 46 clips of Rounds 1 to 1d, in eleven saved sets of answers, seven with the card and four without.

Where the ear wrote o and Levi said a, the model's back share was 0.06 to 0.10, already below 0.15. The one exception was no-chal's second syllable, at 0.84, which no threshold reaches. Where the ear wrote o and Levi said o, four kamatz syllables sat between 0.20 and 0.35: mitz-vo, bo-nim, o-meyn and bo-ruch. A threshold at his a would turn all four into a in every set.

| Undo threshold | Plants caught | False marks |
| --- | --- | --- |
| 0.15, as shipped, with the card | 146 of 154 | 73 |
| 0.43, Levi's a, with the card | 146 of 154 | 100 |
| 0.15, as shipped, no card | 82 of 88 | 55 |
| 0.43, Levi's a, no card | 82 of 88 | 71 |

For Levi's voice the phoneme model cannot tell kom's a from the o of mitz-vo, so the threshold stays at 0.15, and no sealed round is needed to test it.

## Referee rules from the design rounds, October 27

Every rule in this section was designed on the 46 clips of Rounds 1 to 1d, replayed over saved answers: the four Round 1d sets, the answers to those clips from the three Round 1e runs, and three sets from the vote test below. No Round 1e word was used.

### More calls and more thinking

Five calls per reading did no better than three or one: after the shipped referee, each left 10 false marks on the design clips. The ear makes the same mistake on the same recording from call to call, so a vote cannot remove it.

| Ear, three calls voted | Seconds per reading, median | Ear alone: plants caught of 22 | Hidden | Ear alone: false marks |
| --- | --- | --- | --- | --- |
| Minimal reasoning | 5.9 | 20 | 2 | 29 |
| Medium reasoning | 25.1 | 15 | 6 | 26 |

The calls ran in parallel, five per reading at minimal and three at medium. With more thinking, the ear writes the word it recognizes, not the sounds it heard: at medium reasoning it hid 6 of the 22 planted mistakes. At high reasoning one call took 47 seconds and wrote na-chal for the planted no-chal. The ear stays at minimal.

### The rules

The referee still changes only an a, o or e in the ear's answer, and it still never reads the printed line.

- **Before a final l.** In chal or kol the phoneme model hears every a and o as back, so its score no longer turns an a into o there. The vowel meter decides, against the reader's card: an a it measures as o becomes o, an o it measures as a becomes a, and an o it cannot place becomes a whole-syllable `?`, which the grader marks uncertain, never wrong.
- **The middle band.** An ear o whose back share sits between 0.15 and the line gets the same question. That is where Round 1e's planted kam came back kom.
- **A word's last open syllable.** In toy-ro the reader's unstressed vowel is reduced. There the phoneme model's back verdict was right on 9 of 10 design syllables, but it heard toy-ro's o as front. So there it can still turn an a into o, but not an o into a. When it hears a front vowel, the meter decides, and a vowel the meter cannot place becomes `?`. An o in the middle band keeps the ear's o without asking the meter, which measured some of Levi's kamatz vowels next to his patach (the do of tze-do-ko, in the Round 1c results); asking it there changed nothing on the design clips. A one-syllable word is left out, because it carries the stress.
- **u.** An ear o that the phoneme model heard as a rounded vowel, `u`, `ʊ`, `ʉ`, `y`, `ʏ`, `ø` or `œ`, becomes u, unless the meter measures that syllable as a, so a measured a never becomes u. Levi's u was heard that way in 5 of 5 syllables, and none of his 44 o or oy syllables was. The ear wrote ka-sov for ko-suv.
- **Lining up.** When the ear and the phoneme model hear different numbers of vowels, the referee lines them up instead of skipping the line, and acts only on the pairs that every best line-up agrees on. On the Shema line, with two vowels missing, a tied line-up paired the second a-do-noy's a with the first do's vowel and wrote o-do-noy.
- **A `?` needs a card that keeps a and o apart, and a measurement of that syllable.** Without them, the ear's vowel stands.
- **tz.** The ear wrote tse-da-ka for tze-do-ko in 12 of 48 answers, so its ts is read as tz, the alphabet's spelling of tzadi. Before h it stays t, then sh, as in tshu-vo.

Every rule here was designed on one adult reading in Ashkenazi pronunciation. None has been tried with a Sephardi reader or a child.

### A grader fix on the Shema line

The replay also turned up a grader bug. When the reader skips אֱלֹהֵינוּ, the second a-do-noy can be read two ways: as a restart of the first יְהֹוָה, or as a separate read of the second. The grader chose the restart, so it marked the first יְהֹוָה skipped and אֱלֹהֵינוּ not decoded, instead of marking אֱלֹהֵינוּ skipped. The Shema plant in every earlier section was scored against those misplaced marks: it counted as caught when the grader's marks matched them. `19a6665` keeps the separate read open when the repeated word follows one skipped word. The counts below use the fixed grader. Two later grader fixes, `cf8ee3e` and `ed82cfa`, grade every saved reading the same way, so the counts hold for them too.

### Replay

Over the ten saved sets at minimal reasoning, 460 readings:

| Referee | Plants caught of 220 | Hidden | False marks | Uncertain |
| --- | --- | --- | --- | --- |
| As shipped at Round 1e | 210 | 0 | 99 | 0 |
| Final l, band and lining up | 220 | 0 | 61 | 0 |
| All the rules above | 220 | 0 | 33 | 10 |

The 10 uncertain marks are toy-ro, once per set: the ear, the phoneme model and the meter all missed its o. Eight of the ten sets are left with 3 false marks: the tzere of yis-ro-eyl heard as e, in two clips, which stays marked, and yi heard as ye. One set has a fourth, where the ear split o-meyn into two words, and one has five, where it wrote a-do-ney for a-do-noy both times on the Shema line. The rules were designed on these clips, so these numbers are not a test. Round 1f tries them on fresh words, and Round 1g is the sealed test.

## The ear compares with the card, October 27

The ear already hears the reader's card before each reading. A trial prompt asked it to compare every a, aw or o it wrote with the card's first and second vowels, kamatz and patach, and to tag the syllable 1 or 2. On the 46 design clips, three calls each at minimal reasoning:

| Prompt | Ear alone: plants caught of 22 | Ear alone: false marks | After the meter and referee: caught | False marks | Uncertain |
| --- | --- | --- | --- | --- | --- |
| Shipped | 20 | 29 | 22 | 3 | 1 |
| Compare with the card | 17 | 34 | 22 | 6 | 0 |

In 23 of 204 a and o syllables the tag disagreed with the vowel the ear wrote. Reading the tag as the vowel hid one plant and left 5 false marks. The shipped prompt stays.

## Vowel probe, October 27

Written before any Round 1f clip was recorded.

In three places the referee stops trusting the phoneme model's back score and asks the vowel meter: a word's last open syllable, a vowel before a final l, and an ear o in the middle band. The meter is weak for this reader there, because it reads formants and Levi's a and o sit close together. In one design set, the card vowel nearest to the measured vowel was the one Levi said in 46 of 64 a and o syllables, and in 42 when only the first half of the vowel was measured.

The probe asks the phoneme model a second way. Behind its letters, the model computes a vector for every 20 milliseconds of audio at each of its 24 layers. For each vowel it heard, the probe averages the sixth layer's vectors from the end of the sound before it to the start of the sound after it, at most 120 milliseconds on each side. It does the same for the reader's voice card, takes the card's three a syllables and three o syllables, each measured from the centre of all fifteen card vowels, and answers with whichever is nearer by cosine distance. It works from the reading's audio and the reader's own card only. It never sees the printed text, and the vectors are never written to disk. The clip runner's `--probe` flag turns it on. It is off by default.

### Design evidence

On the 59 to 61 a and o syllables of each design set, the phoneme model's back score was right on 53 to 55 and the probe on 51 to 53. The probe is worse overall, but every one of its errors falls where the back score is confident, and there the referee does not ask it.

In the three places where the referee does ask, the design clips hold nine syllables: the bo of bo-ruch and of bo-nim, the planted ga of ga-doyl, the vo of mitz-vo, the o of o-meyn, the ma of she-ma, the ro of toy-ro, the mol of go-mol and the chal of no-chal. The probe placed all nine right. Its answer depends only on the audio and the card, so the 69 times the saved sets sent it one of these syllables are nine decisions, not 69.

Over nine saved sets of the design clips, 414 readings: the four Round 1d sets and five from the vote test, two of them at medium reasoning.

| Referee | Plants caught of 198 | Hidden | False marks | Uncertain |
| --- | --- | --- | --- | --- |
| The rules above | 198 | 0 | 30 | 12 |
| The same rules, probe first | 198 | 0 | 30 | 3 |

The probe removes the nine uncertain toy-ro marks, one per set, and hears its o. The 3 left are the ear's own `?` on one clip. The repo's code, run against the phoneme service, gives these answers row for row, with and without the probe.

This rests on nine syllables, and the setting was chosen on them. Of nine layer and window settings tried, only this one added no false mark: the sixth layer with narrower windows left 47, and layers 9 to 24 left 39 to 65. The design clips cannot settle it.

### The rule for Round 1g, fixed now

Before any round runs, a card check reads Voice check 2: the meter's a and o, the referee's calibration, and the probe's own test on the card, placing each of its six a and o syllables against a card built without it. If the referee is off on Voice check 2, or its line is above 0.55, the card is read again.

Round 1f runs three times with `--probe`. Each run's answers are then replayed through the same referee with the probe off, on the same phoneme answers. The probe joins the Round 1g rules only if, over the three runs, it catches as many planted mistakes, marks no more correct readings wrong, and leaves no more syllables uncertain than the rules without it. Otherwise Round 1g runs without it. The decision is written here before any Round 1g clip is run.

The replay is `npm run ear-replay`, added in `f5881c7` after this rule was written and before Round 1f was recorded. For each run, the replay with the probe on must reproduce the run, and the replay with it off gives the answers without the probe. Both are scored with `npm run ear-score`:

```
npm run -s ear-replay -- --probe on run-1.tsv > run-1.on.tsv
npm run -s ear-replay -- --probe off run-1.tsv > run-1.off.tsv
```

### What could go wrong, written down before the runs

- With the probe on, those three places almost always get an a or an o, so a syllable the meter would have left uncertain is decided, right or wrong.
- In ba-al, in Round 1g, and its twin na-al, in Round 1f, the two vowels run together across a weak ayin, so the meter may find one sound island where there are two syllables. Then it measures nothing in that clip. The word stays in the test.
- The planted dol in Round 1g, and tol in Round 1f: if the ear writes dal and neither the probe nor the meter turns it to o, the plant is hidden, because an ear a before a final l never becomes `?`.
- The tzere of cha-vey-ro may come back e, as the tzere of yis-ro-eyl did. That stays a false mark, and no tzere rule is built for it.

## Voice check 2

Read this card first, in the sitting for Rounds 1f and 1g. Those two rounds use it in place of the first card, so the card and the words come from the same sitting.

| File name | Hebrew | Say | Planted | The ear should write |
| --- | --- | --- | --- | --- |
| voice-check-2 | בָּ בַּ בֶּ בִּ בֹּ דָ דַ דֶ דִ דֹ מָ מַ מֶ מִ מֹ | bo ba be bi boy do da de di doy mo ma me mi moy | nothing | not graded |

## Round 1f: design words

Read each clip once, in Ashkenazi pronunciation, right after Voice check 2 and in the same sitting as Round 1g. These words test a vowel before a final l, kamatz after r, and a kamatz read as patach before m. They are design words: the rules may change after their answers are read. `npm run ear-test -- --round "Round 1f"` grades them against Voice check 2.

| File name | Hebrew | Say | Planted | The ear should write |
| --- | --- | --- | --- | --- |
| gal_clean | גַּל | gal | nothing | gal |
| moyro_clean | מוֹרָה | moy-ro | nothing | moy-ro |
| tal_kamatz-for-patach | טַל | tol | patach read as kamatz | tol |
| chozok_clean | חָזָק | cho-zok | nothing | cho-zok |
| moshol_clean | מָשָׁל | mo-shol | nothing | mo-shol |
| kohol_patach-for-kamatz | קָהָל | ka-hol | the first kamatz read as patach | ka-hol |
| soro_clean | שָׂרָה | so-ro | nothing | so-ro |
| naal_clean | נַעַל | na-al | nothing | na-al |
| omol_patach-for-kamatz | עָמָל | o-mal | the second kamatz read as patach | o-mal |
| chaveyro_clean | חֲבֵרָה | cha-vey-ro | nothing | cha-vey-ro |
| godoyl_clean | גָּדוֹל | go-doyl | nothing | go-doyl |
| chom_patach-for-kamatz | חָם | cham | kamatz read as patach | cham |
| shulchon_clean | שֻׁלְחָן | shul-chon | nothing | shul-chon |

## Round 1g: sealed test

Read each clip once, in the same sitting as Round 1f. Round 1e has been read, so these thirteen words take its place as the sealed test. Nobody reads the ear's or the phoneme model's answers on them until the rules are frozen, and the pass rule is set before the first run. Once they are, `npm run ear-test -- --round "Round 1g"` runs three times, against Voice check 2.

The pass rule, set by Levi on October 27, before any Round 1g clip was recorded: all three runs must pass. A run passes when all thirteen clips are graded once, the ear answers every one, all four planted mistakes are caught, no correct reading is marked wrong, and at most two syllables are marked uncertain. Two are allowed because shi-ro and di-ro end in ro after an r, where toy-ro came back uncertain in every design replay. The scorer checks it:

```bash
npm run -s ear-score -- --round "Round 1g" --max-uncertain 2 --runs-needed 3 run-1.tsv run-2.tsv run-3.tsv
```

| File name | Hebrew | Say | Planted | The ear should write |
| --- | --- | --- | --- | --- |
| sal_clean | סַל | sal | nothing | sal |
| shiro_clean | שִׁירָה | shi-ro | nothing | shi-ro |
| dal_kamatz-for-patach | דַּל | dol | patach read as kamatz | dol |
| bosor_clean | בָּשָׂר | bo-sor | nothing | bo-sor |
| cholol_clean | חָלָל | cho-lol | nothing | cho-lol |
| yofo_patach-for-kamatz | יָפָה | ya-fo | the first kamatz read as patach | ya-fo |
| malko_clean | מַלְכָּה | mal-ko | nothing | mal-ko |
| baal_clean | בַּעַל | ba-al | nothing | ba-al |
| sholol_patach-for-kamatz | שָׁלָל | sho-lal | the second kamatz read as patach | sho-lal |
| diro_clean | דִּירָה | di-ro | nothing | di-ro |
| oylom_clean | עוֹלָם | oy-lom | nothing | oy-lom |
| dom_patach-for-kamatz | דָּם | dam | kamatz read as patach | dam |
| suko_clean | סֻכָּה | su-ko | nothing | su-ko |

## Round 1h: spare sealed test

Read each clip once, right after Round 1g, in the same sitting. These thirteen words are held back: they run only if Round 1g fails, and then only once new rules are frozen, so a second sealed test needs no new sitting. Nobody reads the ear's or the phoneme model's answers on them before that. Their pass rule is set before their first run. `npm run ear-test -- --round "Round 1h"` grades them against Voice check 2.

| File name | Hebrew | Say | Planted | The ear should write |
| --- | --- | --- | --- | --- |
| mazol_clean | מַזָּל | ma-zol | nothing | ma-zol |
| migdol_patach-for-kamatz | מִגְדָּל | mig-dal | kamatz read as patach | mig-dal |
| botzol_patach-for-kamatz | בָּצָל | bo-tzal | the second kamatz read as patach | bo-tzal |
| shuro_clean | שׁוּרָה | shu-ro | nothing | shu-ro |
| simcho_clean | שִׂמְחָה | sim-cho | nothing | sim-cho |
| gam_kamatz-for-patach | גַּם | gom | patach read as kamatz | gom |
| sulom_clean | סֻלָּם | su-lom | nothing | su-lom |
| paam_clean | פַּעַם | pa-am | nothing | pa-am |
| bono_patach-for-kamatz | בָּנָה | ba-no | the first kamatz read as patach | ba-no |
| kad_clean | כַּד | kad | nothing | kad |
| galgal_clean | גַּלְגַּל | gal-gal | nothing | gal-gal |
| naaro_clean | נַעֲרָה | na-a-ro | nothing | na-a-ro |
| matono_clean | מַתָּנָה | ma-to-no | nothing | ma-to-no |

## Voice check 3

Read this card last, in the same sitting. It is Voice check 2 with six closed syllables added, ending in l or m, for later work on this reader's a and o before a final consonant. No rule uses it yet.

| File name | Hebrew | Say | Planted | The ear should write |
| --- | --- | --- | --- | --- |
| voice-check-3 | בָּ בַּ בֶּ בִּ בֹּ דָ דַ דֶ דִ דֹ מָ מַ מֶ מִ מֹ בָּל בַּל פָּל פַּל תָּם תַּם | bo ba be bi boy do da de di doy mo ma me mi moy bol bal pol pal tom tam | nothing | not graded |

## Round 2: a child's voice

The adult round must pass first. Recording a child requires written parent consent. Turn Meta Model API free credits off and use a paid plan before sending children's audio. Meta's free-credit terms allow content to be used for product improvement.

The child reads a line and plants a mistake from the adult table. The local recorder saves these clips in gitignored `recordings/private/`. The child runner deletes each clip after printing its result, including failed calls, unless `--keep` is set. Closing the recorder does not delete files. The recorder's delete button removes saved child WAVs. See the [recorder instructions](../tools/clip-recorder/README.md).

## Passing

Each planted mistake must come back as the sound that was said. Clean controls check whether the ear invents mistakes. A pass on the adult round does not establish accuracy on a child's voice.

`npm run ear-test` compares the returned sounds with the table's `Say` column. It ignores case and spaces within each word. Syllable boundaries, word boundaries, order and word count must match. It prints `PASS` or `MISS` for each recorded clip. It does not call the grader or check letter-level verdicts.

`npm run ear-score` grades a saved run the way the results above are counted: plants caught, hidden or unsure, false marks and uncertain marks, for the final, metered and ear answers. See [Score a run](../tools/clip-recorder/README.md#score-a-run).

The runner defaults to the Meta primary when `META_API_KEY` is nonempty, then the Baseten fallback when only `BASETEN_API_KEY` is nonempty, otherwise the Meta primary. It prints the selected role and model id. `--model primary` or `--model fallback` overrides that choice.
