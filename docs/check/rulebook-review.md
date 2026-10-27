# Rulebook grammar review

AI reviewers checked every distinct cleaned siddur word in all three pronunciation traditions. A second AI review confirmed each finding. The fixes have regression tests and a before and after comparison of every word.

The comparison uses `segmentWords` on every segment of `bank/data/siddur.json`, including excluded instruction segments. It preserves maqaf context. The baseline is the parent of `9f27c9e`, before the grammar fixes.

No human kriah teacher has reviewed the rulebook yet. [shema.md](shema.md) is the page for that hand check.

## Corpus audit

- 749 distinct words, 2247 preset results compared before and after.
- 11 words changed flags or accepted readings. The other 738 kept those flags and readings. The bare four-letter Name also gained `substitute: true` without changing its sounds or flags. Including that metadata change, 12 complete word results changed and 737 stayed identical.
- Four words newly gain `unpointed`: אם, אף, את and על. All four have no vowel point, sheva or shuruk. Their pairs and accepted sounds are unchanged.
- 577 words have a vowel point, sheva or shuruk. None newly gain `unpointed`. The pre-existing mixed instruction token לאֱמֶת retains that flag in both scans.
- 45 of 55 segments remain usable. The same ten instruction segments remain excluded.
- וַיֵּרְא, וַיהֹוָה, לַיהֹוָה and בַּיהֹוָה are absent from this corpus and are covered by explicit regression tests in every preset.

## Every word whose flags changed

These before and after flags are identical across the three presets.

| Word | Before | After |
| --- | --- | --- |
| אֱלוֹהַי | none | `divine_name` |
| אם | none | `unpointed` |
| אף | none | `unpointed` |
| את | none | `unpointed` |
| וֵאלֹהֵי | none | `divine_name` |
| חֵטְא | `sheva` | none |
| לֵאלֹהִים | none | `divine_name` |
| לֵאלֹהֵיכֶם | none | `divine_name` |
| לָךְ | `kamatz_katan` | none |
| על | none | `unpointed` |
| שֶׁיְהֹוָה | none | `divine_name` |

## Before and after accepted readings

Pairs are separated by `·`, alternatives within a pair by `/`. `∅` is an existing silent pair, not a newly added sound. For the prefixed four-letter Name, `pairs` reports the prefix; each `readings` alternative is complete and already includes that prefix once. The new `substitute: true` marker tells consumers to use those alternatives. No child is graded on the literal letters of the Name or on the prefix alone.

| Word | Preset | Before | After |
| --- | --- | --- | --- |
| אֱלוֹהַי | sephardi | `e · lo · ha · y` | `e · lo · ha/ka · y` |
| אֱלוֹהַי | ashkenazi | `e · lo/loy/ley · ha · y` | `e · lo/loy/ley · ha/ka · y` |
| אֱלוֹהַי | chassidish | `e · lo/loy/ley · ha · y` | `e · lo/loy/ley · ha/ka · y` |
| אם | sephardi | `∅ · m` | `∅ · m` |
| אם | ashkenazi | `∅ · m` | `∅ · m` |
| אם | chassidish | `∅ · m` | `∅ · m` |
| אף | sephardi | `∅ · f` | `∅ · f` |
| אף | ashkenazi | `∅ · f` | `∅ · f` |
| אף | chassidish | `∅ · f` | `∅ · f` |
| את | sephardi | `∅ · t` | `∅ · t` |
| את | ashkenazi | `∅ · s` | `∅ · s` |
| את | chassidish | `∅ · s` | `∅ · s` |
| וֵאלֹהֵי | sephardi | `ve/vey · lo · he/hey` | `ve/vey · lo · he/hey/ke/key` |
| וֵאלֹהֵי | ashkenazi | `vey · lo/loy/ley · hey` | `vey · lo/loy/ley · hey/key` |
| וֵאלֹהֵי | chassidish | `vey · lo/loy/ley · hey` | `vey · lo/loy/ley · hey/key` |
| חֵטְא | sephardi | `che/chey · te/t` | `che/chey · t` |
| חֵטְא | ashkenazi | `chey · te/t` | `chey · t` |
| חֵטְא | chassidish | `chey · te/t` | `chey · t` |
| לֵאלֹהִים | sephardi | `le/ley · lo · hi · m` | `le/ley · lo · hi/ki · m` |
| לֵאלֹהִים | ashkenazi | `ley · lo/loy/ley · hi · m` | `ley · lo/loy/ley · hi/ki · m` |
| לֵאלֹהִים | chassidish | `ley · lo/loy/ley · hi · m` | `ley · lo/loy/ley · hi/ki · m` |
| לֵאלֹהֵיכֶם | sephardi | `le/ley · lo · he/hey · che · m` | `le/ley · lo · he/hey/ke/key · che · m` |
| לֵאלֹהֵיכֶם | ashkenazi | `ley · lo/loy/ley · hey · che · m` | `ley · lo/loy/ley · hey/key · che · m` |
| לֵאלֹהֵיכֶם | chassidish | `ley · lo/loy/ley · hey · che · m` | `ley · lo/loy/ley · hey/key · che · m` |
| לָךְ | sephardi | `la/lo · ch` | `la · ch` |
| לָךְ | ashkenazi | `lo · ch` | `lo · ch` |
| לָךְ | chassidish | `lo/lu · ch` | `lo/lu · ch` |
| על | sephardi | `∅ · l` | `∅ · l` |
| על | ashkenazi | `∅ · l` | `∅ · l` |
| על | chassidish | `∅ · l` | `∅ · l` |
| שֶׁיְהֹוָה | sephardi | `she · y · ho · va` | `pairs: she; readings: she · a · do · na · y / she · ha · she/shey · m` |
| שֶׁיְהֹוָה | ashkenazi | `she · y · ho/hoy/hey · vo` | `pairs: she; readings: she · a · do/doy/dey · no · y / she · ha · shey · m` |
| שֶׁיְהֹוָה | chassidish | `she · y · ho/hoy/hey · vo/vu` | `pairs: she; readings: she · a · do/doy/dey · no/nu · y / she · ha · shey · m` |

## Rebuilt bank

675 items in total. Counts are unchanged.

| Level | Items | Added ids | Removed ids | Updated existing ids |
| --- | ---: | ---: | ---: | ---: |
| 1 | 60 | 0 | 0 | 0 |
| 2 | 40 | 40 | 40 | 0 |
| 3 | 80 | 7 | 7 | 0 |
| 4 | 190 | 19 | 19 | 0 |
| 5 | 199 | 0 | 0 | 7 |
| 6 | 106 | 0 | 0 | 5 |

Correctly accepting unflagged kamatz before final sheva adds closed syllables to the generated candidate pool. That changes the seeded selection at level 2 and the subsequent generated selections at level 4. Level 3 admits the newly unflagged corpus words and excludes the newly recognized divine names. Level 5 and 6 text ids stay stable while their flags and skills reflect the corrected rulebook. The builder remains deterministic and its disk output matches a fresh build.

The rebuilt Shema check page still has 252 word rows. לֵאלֹהֵיכֶם and לֵאלֹהִים now carry `divine_name` and accept `k` for the hei. Prefixed four-letter Name rendering is also tested against the Ashrei page generator without writing an extra page.

## Verification

- `node --test` passes, including the golden comparisons and grammar regressions.
- `npm run build:bank` writes 675 items with level counts 60 / 40 / 80 / 190 / 199 / 106.
- `npm run check:page -- shema` writes the 252-word page.
- A fresh comparison with the git baseline checks all 749 words in all three presets. It confirms the changed flags, readings and bank ids shown above. No pointed word newly gains `unpointed`.
- `git diff --check` passes.

Regression tests in `rulebook/rulebook.test.js` include:

- `a final sheva stays nach before silent alef, ayin or hei, but not before a sounded letter`
- `Elokim recognition requires a standard prefix, an eligible alef and a lamed with cholam`
- `final-sheva kamatz is gadol without maqaf and existing katan triggers remain`
- `wholly unpointed short words are flagged without mistaking sheva or shuruk for missing pointing`

`bank/bank.test.js` also checks `prefixed Name readings include the prefix exactly once and never accept a prefix alone`.
