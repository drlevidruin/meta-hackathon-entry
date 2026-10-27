# Item bank

Every line a child reads comes from here. No model writes Hebrew a child sees.

An item is one line on the screen:

```js
{ id, level, text, words, skills, focus, flags, source }
```

`id` is `L<level>-` plus the first 8 hex characters of the SHA-1 of `level|text`, so ids stay stable when other items change. `skills` is the union of the words' skills from `tagSkills`. `focus` is the skill the line was built to drill, or null. `source` is `{ section, ref }` for siddur text or `{ generated: true }`.

## Levels

| Level | What the child reads | Where it comes from |
| --- | --- | --- |
| 1 | Letters with vowels, one pair per word: בָּ בַּ בֵּ | Rules |
| 2 | One-syllable chunks: בַּת מִן לוֹ בִּי | Rules |
| 3 | Real words | Siddur |
| 4 | Nonsense words, two or three syllables | Rules |
| 5 | Phrases of three to five words | Siddur |
| 6 | Fluency lines of four to nine words | Siddur |

- Levels 1 and 2 build lines around one focus: a vowel across many letters, a letter across many vowels, or a contrast pair (בּ/ב, כּ/כ, פּ/פ, תּ/ת, שׁ/שׂ, kamatz/patach, tzere/segol, chirik/shuruk).
- Level 3 lines are four siddur words that share a focus skill.
- Level 4 words exercise a focus skill and are proven by reading: a child who reads a nonsense word built from a skill has decoded it, not remembered it. A level 4 word never matches a pointed word in the siddur.
- Levels 5 and 6 cut siddur segments at their punctuation, then into lines of the right length, in reading order.

## Rules

- Below level 5, no item may carry any flag. Flagged words (possible kamatz katan, undecided sheva, divine names) appear only in levels 5 and 6, where the grader accepts either reading.
- No level takes an unpointed segment. Siddur instructions in plain letters are dropped whole.
- Generated words never match a skeleton in `bank/blocklist.json` (letters only, final forms folded).
- The build is deterministic: a seeded generator, so building twice gives the same file.

## Source text

`bank/data/siddur.json`: nine sections of The Metsudah Siddur (1981), Hebrew text from Sefaria, licensed CC-BY. Each section keeps its Sefaria ref and link.
