# Item bank

Every line a child reads comes from here. No model writes Hebrew a child sees.

An item is one line on the screen:

```js
{ id, level, text, words, skills, focus, flags, source }
```

`id` is `L<level>-` plus the first 8 hex characters of the SHA-1 of `level|text`, so ids stay stable when other items change. `skills` is the union of the words' skills from `tagSkills`. `focus` is the skill the line was built to drill, or null. `source` is `{ section, ref }` for siddur text, `{ generated: true }` for regular drills, or `{ generated: true, challenge: true }` for a single-word level 4 challenge. No other item fields change.

## Levels

| Level | What the child reads | Where it comes from |
| --- | --- | --- |
| 1 | Letters with vowels, one pair per word: בָּ בַּ בֵּ | Rules |
| 2 | One-syllable chunks: בַּת מִן לוֹ בִּי | Rules |
| 3 | Real words | Siddur |
| 4 | Two or three nonsense words per line, or a single challenge word; each word has two or three syllables | Rules |
| 5 | Phrases of three to five words | Siddur |
| 6 | Fluency lines of four to nine words | Siddur |

- Levels 1 and 2 build lines around one focus: a vowel across many letters, a letter across many vowels, or a contrast pair (בּ/ב, כּ/כ, פּ/פ, תּ/ת, שׁ/שׂ, kamatz/patach, tzere/segol, chirik/shuruk).
- Level 3 lines are four siddur words that share a focus skill. A pointed word appears in at most two lines across the whole level.
- Level 4 words exercise a focus skill and are proven by reading: a child who reads a nonsense word built from a skill has decoded it, not remembered it. A level 4 word never matches a pointed word in the siddur.
- Levels 5 and 6 cut siddur segments at their punctuation, then into lines of the right length, in reading order. Any level 6 line whose exact text appears at level 5 is omitted, including matches from a different section.

## Rules

- Below level 5, no item may carry any flag. Flagged words (possible kamatz katan, undecided sheva, divine names) appear only in levels 5 and 6, where the grader accepts either reading.
- No level takes an unpointed segment. Siddur instructions in plain letters are dropped whole.
- Generated words never match a skeleton in `bank/blocklist.json` (letters only, final forms folded).
- No drill line at levels 1 to 4 repeats a word. Siddur phrases at levels 5 and 6 retain their source wording, including intentional repetition.
- The build is deterministic: a seeded generator, so building twice gives the same file.

## Generated orthography

These restrictions apply to every generated word at levels 1, 2 and 4. They are intentionally narrower than the rulebook's treatment of real siddur text.

- Levels 1 and 2 allow consonantal dagesh only in בּ כּ פּ תּ. Shin and sin always have their respective dots. וּ is exclusively a shuruk vowel carrier.
- At level 4, word-initial ב כ פ ת have dagesh kal. Medial ב כ פ ת have a dagesh immediately after a sheva nach, and none after a vowel. No other consonant has a dagesh, and no final consonant has one. The dot in vowel-carrier וּ is shuruk, not consonantal dagesh.
- ך ם ן ף ץ appear only at the end. At the end, כ מ נ פ צ must take those final forms. Final kaf always carries sheva (ךְ) when closing the word, or kamatz (ךָ); bare ך is forbidden. Other finals have no vowel. A word ends on a sounded vowel or a closing consonant without a vowel; ךְ counts as a closing consonant. A medial-form כ מ נ פ צ cannot be the last letter even with a vowel. Level 1 can practice those consonants in one sounding pair by adding a mater, as in מִי or פּוּ.
- A word of two or more letters never ends with kubutz or cholam without a vav. An open final u/o syllable uses וּ or וֹ instead. Single-letter drills may retain kubutz or cholam, including at level 1, and these vowels may still appear before a closing consonant.
- Consonantal ו has only patach, kamatz, segol, tzere or chirik. It never has kubutz, cholam or sheva. וֹ and וּ follow a letter without a vowel of its own and supply that letter's cholam male or shuruk.
- No mappik, patach genuvah, chataf vowels, dagesh in ה, or word-final ה. א ה ח ע ר never have sheva or dagesh. א appears only at the beginning.
- Level 4 has internal sheva only in a `pattern:closed_syllable` lesson. Every such sheva is nach, closes a syllable inside the word, and is unambiguous under the rulebook. The builder uses a short preceding vowel and avoids identical following consonants. Final ךְ is also permitted in any lesson; its sheva is always nach. Other level 4 lessons contain no internal sheva, and no other final letter carries sheva.

The generator checks spelling before accepting a word, then analyzes the complete word in every preset. `bank/orthography.test.js` independently scans every generated item in the checked-in `bank/items.json`, including all challenges, for these rules, syllable counts and repetition limits.

## Challenge words

There are 150 single-word level 4 challenges: 112 have two syllables and 38 have three. Each has at most six distinct skills. Thirty focus on `pattern:closed_syllable` and contain an internal sheva nach. The rest distribute focus across kamatz, patach, tzere, segol, chirik, cholam, shuruk and kubutz, and the bet/vet, kaf/chaf, pei/fei and shin/sin contrasts. Each vowel has eight focus items and each consonant variant has seven.

The core alphabet is the twelve most frequent Hebrew letters in the corpus, counting occurrences after cleanup and folding final forms: ו י ה ל מ א כ ב ר ת נ ש. Since פ is outside those twelve, it is added only to pei/fei focus items to provide the requested contrast. This is an explicit exception to a strictly twelve-letter vocabulary. All other challenge items use the twelve-letter core. Vowel-carrier vavs follow the same orthography restrictions as other generated words.

Challenges use the regular stable id rule and share the regular level 4 blocklist, exclusion of normalized pointed siddur words (including words in rejected segments), and duplicate-word tracking. They use the ordinary `words`, `skills`, `focus` and `flags` fields; only `source.challenge` distinguishes them.

## Merged cholam in printed siddur text

A shin or sin dot can also serve as a cholam dot. Before the unpointed check, the rulebook infers cholam on a nonfinal letter without a vowel or sheva immediately before שׁ, or on a nonfinal שׂ without a vowel or sheva. Mater vav, mater yud and silent alef retain their existing roles. Pair text retains the printed letters and marks in the normal cleanup order; no cholam mark is inserted into the text. The inferred vowel has the usual preset cholam sounds and skill.

Examples include משֶׁה (`mo-she`), קְדשִׁים (`ke-do-shim`), וְתִירשְׁךָ (Sephardi `ve-ti-ro-she-cha`) and שׂנְאַי (accepted `so-nay`). Ordinary sheva uncertainty still applies after an inferred long vowel, so the latter two can retain a `sheva` flag and accept either sheva reading. Any remaining unpointed letters still exclude the whole segment. This restores Shema segments 7 and 8; the ten segments containing instructions or other unpointed text remain excluded.

## Source text

`bank/data/siddur.json`: nine sections of The Metsudah Siddur (1981), Hebrew text from Sefaria, licensed CC-BY. Each section keeps its Sefaria ref and link.
