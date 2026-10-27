# Rulebook and bank build report

The rulebook and bank use ES modules and Node built-ins. The offline checks run on Node 22.23.4.

AI reviewers checked every distinct siddur word in all three traditions. A second AI review confirmed each finding. Fixes have regression tests and a before and after comparison of every word. See the [rulebook review](rulebook-review.md). No human kriah teacher has reviewed it yet. The [Shema page](shema.md) is the page for that hand check.

## Counts

675 items in total:

| Level | Items |
| --- | ---: |
| 1 | 60 |
| 2 | 40 |
| 3 | 80 |
| 4 | 190 |
| 5 | 199 |
| 6 | 106 |

Level 4 contains 40 regular lines of two or three words and 150 single-word challenges. Challenges contain 112 two-syllable words and 38 three-syllable words, each with at most six skills. Thirty close an internal syllable with sheva nach. The other 120 focus on eight vowels (eight items each) and eight consonant variants (seven items each).

Level 3 retains 80 four-word lines with no word occurring in more than two lines. No drill line repeats a word. Level 6 excludes 24 candidate texts that already appear at level 5, leaving 106 distinct fluency lines.

## Restored segments

The corpus has 55 segments, of which 45 are now usable, containing 909 word occurrences and 107 punctuated phrases. Previously 43 segments were usable and twelve were rejected. Merged cholam restores two of those twelve, both in Shema:

| Section segment, numbered from 1 | Opening | Words | Repaired words |
| --- | --- | ---: | --- |
| Shema 7 | וְהָיָה אִם־שָׁמֹעַ | 122 | וְתִירשְׁךָ |
| Shema 8 | וַיֹּאמֶר יְהֹוָה אֶל־משֶׁה | 69 | משֶׁה, קְדשִׁים |

The Shema check page now contains 252 words across eight usable segments, up from 61 words across six segments. The 191 restored words are included without changing the corpus text or inserting missing vowel marks.

Ten segments remain excluded because they contain instructions, abbreviations or other unpointed text: Torah Blessings 2; Morning Blessings 5; Shema 1, 4, 9 and 11; Ashrei 1; Avot 1, 4 and 5. The remaining exclusions follow the rule that drops an entire unpointed segment.

## Implementation and verification

- The rulebook infers merged cholam only after resolving matres and silent letters. The pair retains the printed substring in the existing canonical cleanup order, with `vowel: cholam` and the preset's ordinary alternatives. Regression tests cover משֶׁה, קְדשִׁים, וְתִירשְׁךָ and שׂנְאַי in all three presets. They also cover preserved pair text, explicit vowels, matres, silent alef, final letters and still-unpointed remainders. Existing sheva uncertainty is preserved.
- The generator restricts consonants, dagesh kal placement, final forms, vowel carriers, gutturals, alef position, word endings and sheva. No generated word has mappik, patach genuvah, chataf vowels or final hei. Level 4 contains no dagesh chazak.
- An independent disk scan in `bank/orthography.test.js` checks every generated item against each orthography rule, line length, syllable count, repetition limit, challenge skill budget, focus distribution and level 5/6 text exclusion. Existing tests verify blocklist readings in every preset, siddur exclusion, stable ids, item shape, exact fresh-build equality and seeded reproducibility.
- `node --test` passes, including the golden comparisons and orthography regressions.
- `node bank/build.js`: exit 0, writes all 675 items with deterministic two-space JSON.
- `node bank/check-page.js shema`: exit 0, writes the 252-word check page.
- `git diff --check` passes.

## Alphabet interpretation

The twelve most frequent letters, counting cleaned corpus occurrences with final forms folded, are ו י ה ל מ א כ ב ר ת נ ש. The letter פ is outside that set, but pei and fei still need practice items. The implementation uses the twelve-letter core and adds פ only to the fourteen pei/fei focus items. Tests enforce that exception and reject any other out-of-core challenge letter. This decision is also documented in `docs/bank.md`.

## Sample Ashkenazi readings

These are ten regular level 4 words and ten challenge words from the rebuilt bank. Readings show the preset's first accepted sound; cholam also accepts `oy` and `ey`.

| Regular level 4 word | Ashkenazi | Challenge word | Ashkenazi |
| --- | --- | --- | --- |
| וָטֵף | vo-teyf | שֶׂשְׂרֹשַׂ | ses-ro-sa |
| יָלוֹ | yo-lo | לֻלְהִי | lul-hi |
| שִׁעַקוֹ | shi-a-ko | הַכְיֵ | hach-yey |
| בֹּשֻׂפַח | bo-su-fach | אַשְׂיָ | as-yo |
| חוּחֵבוּ | chu-chey-vu | שַׁשְׁתֹּרַ | shash-to-ra |
| פֵּנֵשָׁ | pey-ney-sho | רִשְׂרִ | ris-ri |
| פֶּכוּלִ | pe-chu-li | תֶּלְרֵ | tel-rey |
| קָחֶ | ko-che | הִנְהַת | hin-has |
| בֻּדֻיִ | bu-du-yi | שֶׂשְׁלֶשׁוּ | sesh-le-shu |
| סָוִ | so-vi | הֶיְשָׂ | hey-so |

Regression tests include `merged cholam restores exactly the two Shema paragraphs while instructions remain excluded` in `bank/bank.test.js`. The rulebook tests include `merged cholam keeps printed text and preset readings: <preset>` and `merged cholam leaves matres, silent alef, explicit vowels and unpointed remainders alone`.
