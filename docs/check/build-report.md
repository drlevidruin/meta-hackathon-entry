# Rulebook and bank build report

Built offline with Node 22, ES modules and no dependencies. No commits, pushes or deployments.

## Result

479 items: level 1 has 60, level 2 has 40, level 3 has 80, level 4 has 40, level 5 has 156, and level 6 has 103.

The corpus has 55 segments. 43 are usable, containing 718 word occurrences and 93 punctuated phrases. 12 segments are dropped whole because they contain unpointed words. That includes mixed instructions and prayers, and two Shema paragraphs with partially pointed words such as וְתִירשְׁךָ, משֶׁה and קְדשִׁים. Their text is left untouched. The Shema review page contains 61 words from its six usable segments.

## Checks

- `node --test`: 153 tests, 151 passed, 0 failures, 2 TODO discrepancies; exit 0. This is not a claim that every golden comparison passes.
- `node bank/build.js`: writes the 479 items in deterministic order with two-space JSON.
- `node bank/check-page.js shema`: writes `docs/check/shema.md`.
- The requested rulebook CLI invocation succeeds; its exact rows appear below.
- Tests verify all generated readings against the blocklist, the full item schema, levels and lengths, focus skills, absence of early flags, all presets, source order, fresh-build equality and reproducibility.
- A separate corpus scan verified letter coverage in 3,540 word/preset analyses. Every non-substituted result's pair texts concatenate to its cleaned word.

## Spec and answer-key conflict

The last entry in `rulebook/golden.json`, נִשְׁמָתִי, has an undageshed tav. `docs/rulebook.md` requires `s` in Ashkenazi and Chassidish; the answer key requires `ti` in both. The implementation returns `si`. The two exact golden comparisons run as TODO tests and expose this discrepancy. Separate passing assertions enforce the written tav rule. The answer key and specs were not edited. All other golden pair alternatives, flags and divine-name readings match as sets.

## Ambiguities and decisions

- Maqaf context is needed by a function that otherwise receives one word. `splitWords` returns the clean word and a separate `maqaf` boolean. Callers pass a trailing maqaf to `expectedSounds` when that boolean is true. Siddur item `words` retain trailing maqafs, and `text` joins them directly to the following word. The returned analysis `word` omits the maqaf. Level 3 uses isolated words and excludes words flagged in their original source context.
- Removing every geresh would erase the divine abbreviation before it can be re-analyzed. Cleanup preserves only the recognized abbreviation ה׳, canonicalizing ASCII or curly apostrophes to the Hebrew geresh. Surrounding punctuation is removed. Other geresh and gershayim marks are stripped. Two yuds are recognized as the stated divine abbreviation regardless of pointing.
- Unicode marks use normalized decomposition order. Pair text and the cleaned word preserve that canonical order rather than the input's order. Cantillation, meteg, rafe and upper/lower puncta are removed. The corpus's upper puncta are editorial marks, not vowels. A rafe first cancels a dagesh on its own letter, even if both occur.
- Silent alef or ayin must remain available to carry a following cholam male or shuruk before they can join the preceding pair. This is necessary for הָעוֹלָם. Likewise, a yud before shuruk takes its vowel before the silent-yud rule is considered. Once that yud carries a vowel, it receives no `pattern:ai` skill.
- Shuruk after a letter that already has its own vowel is not specified explicitly. It becomes its own vowel-only `u` pair. It transfers to the preceding letter only when that letter has no vowel. A vav with dagesh and an explicit vowel remains consonantal.
- The sheva rules run in their listed precedence. Thus a sheva on the first letter is na even in a two-letter word with two shevas. For a sheva that permits both readings, na is the primary reading and nach is also accepted. An uncertain sheva can count as sounded when determining a following dagesh chazak.
- A possible kamatz katan keeps its `kamatz` vowel name and its usual preset sounds, adds `o`, the flag and the katan skill. This preserves the difference from explicitly marked U+05C7, whose vowel name is `kamatz_katan` and which is unflagged. Ordinary kamatz remains long for the following sheva decision, even when it might be katan.
- The `כָל` suffix rule applies to the whole word or to standard prefix letters ו, ב, כ, ל, מ, ש and ה followed by that suffix. A kamatz before a maqaf is in the last syllable when it is the final sounded vowel nucleus. The vav past-tense rule requires the specified prefix and a final kamatz followed by a closing consonant.
- Divine `readings` are full results with the same preset. Written אֲדֹנָי keeps its ordinary pairs and adds הַשֵּׁם as an alternative; a substituted name has no pairs and has both whole-word alternatives. `formatReading` uses the first whole-word alternative when there are no pairs. `formatPairs` formats the result's actual pairs, so it returns an empty string for a substituted name. The check page explicitly shows both whole-word readings and pair alternatives within each reading.
- The Elohim test follows the exact written criterion: after standard prefixes, the letters begin אלה and the alef has chataf segol. Other spellings are not inferred to be divine. אֵל with tzere also supports these prefixes. Only the exact written אֲדֹנָי form gets its substitution rule.
- Letter skills describe the written form and do not change with the preset. An undageshed tav gets `letter:sav`, including in Sephardi. The specified final skill vocabulary has no `final_pei`; final ף uses `final_fei` and its consonant still follows the dagesh rule. Silent alef and ayin retain their letter skills; a mater yud has only its mater pattern. Vowel-only shuruk does not get a consonant-vav skill.
- A solitary unvoweled final letter is not necessarily flagged by the rulebook's internal-letter test. The bank additionally requires a vowel mark or a decoded shuruk. Consequently single-letter instructions cannot enter any level. A solitary unpointed hei is silent, consistent with the final-hei rule.
- Level 1 includes all 22 letters, beged kefet variants, shin/sin and the ordinary dagesh variants of other consonants, with no final forms. Its shuruk examples use a letter followed by וּ. A dageshed bare vav followed by shuruk would have two pairs and is rejected. Levels 1 and 2 use vowel and letter focuses, which are two of the permitted lesson types; contrast lessons are not required to reach the targets.
- Level 4's two or three syllables are counted from the actual primary formatted reading in every preset. Its focus is checked after assembling and re-analyzing each word, since sheva and vowel-carrier behavior can change inside a word. Corpus exclusion uses cleaned, normalized pointed words from every segment, including segments rejected from the bank.
- Lines stay within punctuation boundaries. Undersized phrases are omitted instead of crossing punctuation or violating length limits: two phrases have fewer than three words for level 5, and 13 have fewer than four words for level 6. Longer phrases are rebalanced so their final line also meets the minimum. Maqaf context is retained even across a line break.
- Identical level/text items share the specified stable id and appear once, retaining their first source occurrence. Real-word lines retain source word order within a section and are capped at 80. Other siddur lines retain section, segment and phrase order. Generated lines retain their deterministic lesson order. Different seeds affect only generated levels.

## CLI output

Columns: word, Sephardi, Ashkenazi, Chassidish, flags.

```text
שְׁמַע	she-ma	she-ma	she-ma	-
יִשְׂרָאֵל	yis-ra-el	yis-ro-eyl	yis-ro-eyl	-
יְהֹוָה	a-do-nay	a-do-noy	a-do-noy	divine_name
אֱלֹהֵינוּ	e-lo-he-nu	e-lo-hey-nu	e-lo-hey-nu	divine_name
יְהֹוָה	a-do-nay	a-do-noy	a-do-noy	divine_name
אֶחָד	e-chad	e-chod	e-chod	-
```

## Files

Created:

- `rulebook/analysis.js`, `rulebook/cleanup.js`, `rulebook/cli.js`, `rulebook/grammar.js`, `rulebook/index.js`, `rulebook/letters.js`, `rulebook/pairs.js`, `rulebook/presets.js`, `rulebook/skills.js`, `rulebook/rulebook.test.js`.
- `bank/blocking.js`, `bank/build.js`, `bank/check-page.js`, `bank/corpus.js`, `bank/generate.js`, `bank/random.js`, `bank/bank.test.js`, `bank/items.json`.
- `docs/check/shema.md`, `docs/check/build-report.md`.

Changed: only the `scripts` block in `package.json`.

Not completed: full agreement with the two conflicting golden expectations, and the kriah teacher's manual review of the generated page. No human review is claimed.
