# Ear test

The ear must report the sounds that were spoken, including mistakes. It receives audio and a sound alphabet. It never sees the printed line. It can still mishear or replace a mistake with a familiar word.

Only Muse Wonder 1.0 through the Meta Model API has run as the ear. Muse Spark Open through Baseten is wired and has never run. Neither the adult nor child round has run. The real-voice test is still the go or no-go.

## Round 1: an adult voice

Read each clip once, at a normal pace, in Ashkenazi pronunciation. One clip per recording. Any phone voice memo works.

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

## Round 2: a child's voice

The adult round must pass first. Recording a child requires written parent consent. Turn Meta Model API free credits off and use a paid plan before sending children's audio. Meta's free-credit terms allow content to be used for product improvement.

The child reads a line and plants a mistake from the adult table. The local recorder saves these clips in gitignored `recordings/private/`. The child runner deletes each clip after printing its result, including failed calls, unless `--keep` is set. Closing the recorder does not delete files. The recorder's delete button removes saved child WAVs. See the [recorder instructions](../tools/clip-recorder/README.md).

## Passing

Each planted mistake must come back as the sound that was said. Clean controls check whether the ear invents mistakes. A pass on the adult round does not establish accuracy on a child's voice.

`npm run ear-test` compares the returned sounds with the table's `Say` column. It ignores case and spaces within each word. Syllable boundaries, word boundaries, order and word count must match. It prints `PASS` or `MISS` for each recorded clip. It does not call the grader or check letter-level verdicts.

The runner defaults to the Baseten primary when `BASETEN_API_KEY` is nonempty. Otherwise it uses the Meta fallback. It prints the selected role and model id. `--model primary` or `--model fallback` overrides that choice.

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

The ear currently requests `minimal` reasoning effort from the Meta fallback. `EAR_REASONING_EFFORT` overrides it. The code uses a heuristic to detect some prose refusals and retries those answers once. It does not reject every possible prose answer.
