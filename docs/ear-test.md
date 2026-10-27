# Ear test

The go or no-go. The ear passes when it writes the sound that was said, mistakes included. If it writes the word as it should be, it is correcting, and nothing else gets built on it until that is fixed.

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

Only with a parent's consent. The child reads a line and plants one mistake on purpose, chosen from the table above. These recordings stay in recordings/private/, which never enters the public repo, and are deleted once the test is done.

## Passing

Each planted mistake must come back as the sound that was said. A pass on the adult round is not enough: the gate is a child's voice.

## Round 0: synthetic voices

`recordings/make-synthetic.sh` builds 13 clips with the macOS voices: a Hebrew voice reading pointed text with the mistake written in, and an English voice reading spelled-out sounds ("shah voss") so nothing can be corrected toward a Hebrew word. Run them with `node ear/cli.js recordings/synthetic/<clip>.wav`.

First results, October 26, three runs per model:

- The English-voice plants came back as said from Muse Spark 1.2 and Muse Wonder 1.0: "shah voss" as sha-vas, "vah rook" as va-ruk.
- Muse Spark 1.3 corrected "shah voss" to sha-bos and added "ba-ruch ru-ach", the three example words that were in the prompt. The prompt now uses made-up sounds for its examples.
- Muse Spark 1.2 answered in English prose ("I can't hear audio") on about a third of the clips, the same clips every run. The ear retries once, then fails the line cleanly rather than grading a refusal.
- The Hebrew voice read וָרוּךְ as ba-ruch in every model, so that clip cannot tell a correcting ear from a voice that ignored the planted vav. Recorded voices settle it.

Second results, October 26, with the made-up prompt examples, two runs per model. A plant counts as caught when the ear wrote the mistake the voice said.

| Model | Plants caught (of 7), run 1 and run 2 | Answered in prose, empty, or error | Clips returned as "?" |
| --- | --- | --- | --- |
| Muse Wonder 1.0 | 5 and 5: va-ruk, mu-der, sha-vas, sha-vat, mach or mech, ya-chid | one HTTP 500 | 1 per run |
| Muse Spark 1.2 | 2 and 2: sha-vas, and va-ruch on the Hebrew-voice clip | 3 and 2 in prose | 4 per run |
| Muse Spark 1.3 | 1 and 4 | 0 and 1 empty | 7 and 4 |

Muse Wonder 1.0 is now the default fallback ear (`EAR_FALLBACK_MODEL` still overrides it). It also turned the English voice's "modeh" into mo-der, an r the voice put there.

End to end, Wonder's answers through the real grader, 10 clips: 7 graded exactly as planted. Two words with two wrong sounds each (va-ruk for בָּרוּךְ, ya-chid for אֶחָד) came back as not decoded, because the grader stops blaming single letters once most of a word is off. One false wrong letter came from the English voice's r in mo-der.

### Speed: reasoning effort

The ear has to answer before the child finishes the next line. The same 13 clips through Muse Wonder 1.0 at three `reasoning_effort` settings, one run each:

| Setting | Seconds per clip, average | Plants caught (of 7) |
| --- | --- | --- |
| Not set (default) | about 15 | 5 |
| `low` | 7.8 | 5 |
| `minimal` | 2.4 | 5 |

The answers barely moved, so the ear now asks for `minimal` (`EAR_REASONING_EFFORT` overrides it). One difference to watch in the real-voice rounds: at `minimal` the Hebrew voice's שְׁמַע came back as shma, where the slower settings wrote she-ma.

### Muse Voice Transcribe 1.0

Meta's speech-to-text model (`POST /v1/asr/transcribe`) answered every clip in under a second, so it was tried as the ear, with and without a Hebrew language hint. It does not fit:

- It writes words, not sounds, and pulls toward real words: the English voice's planted "vah rook" came back as Baruch without the hint, and a clean "shah boss" as Shabbat with it.
- When it writes Hebrew it drops the vowels (ברוך, שלום), and the vowels are half of what a kriah teacher checks.
- It invented words on two clips (Hey!, Shallot) and answered one in Arabic script.

An ear for kriah has to report the sounds a child made, mistakes included, so the station uses an audio model that follows a sound alphabet instead.
