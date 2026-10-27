# Grader

Import `gradeLine` or `align` from `grader/index.js`. `gradeLine({ heard, text,
preset }, options)` builds the expected words using the rulebook. `align(heard,
expected, options)` accepts those rulebook results directly. Both return the same
`{ words, verdicts, summary }` structure and leave their inputs unchanged.

```sh
node grader/cli.js --preset ashkenazi --line "שַׁבָּת" --heard "sha-vos"
npm run grade -- --preset ashkenazi --line "שַׁבָּת" --heard "sha-bat" --accept-other-traditions
node --test
```

The word and pair alignments use dynamic programming. Phoneme insertion and
deletion cost 1, same-kind substitution costs 1, and consonant/vowel substitution
costs 2. Ties favor more exact sounded pairs. Joining two or three heard words
adds 0.1 per boundary so an independent extra word wins an otherwise tied match.
Restart detection requires two consecutive attempts at a pronunciation prefix,
with edit distance at most half the heard tokens. Attempts can each span up to
three heard words; earlier attempts disappear. A 0.05 restart cost preserves
repeated printed words when both can be aligned. These costs are deterministic
heuristics since the contract does not specify alignment or restart penalties.

Pair indices refer to `words[word].pairs`. Extra phonemes appear only in the flat
`verdicts`, with empty `text` and the preceding pair's index, or -1 initially.
Adjacent extra phonemes at the same position form one entry. An extra heard word
has its syllables joined with hyphens as its `text`, no pairs, and one flat extra
verdict with pair index -1. Other `heard` fields join normalized phonemes.
Silent expected pairs retain text and an ok verdict but do not contribute to
summary pair or verdict counts. Sounded pairs, including skipped words, do.

The requested examples take precedence in three ambiguous cases:

- `sha-?` has only one of three pairs ok, yet must retain two uncertain verdicts.
  Unknown syllables can cover several consecutive pairs, each showing `?`, and
  uncertain pairs are excluded from the decoding threshold's denominator. A
  completely unknown word stays uncertain.
- `sha-bat` also has only one of three pairs ok under Ashkenazi. When every known
  pair is recognizable in the child's preset or another tradition, keep the
  specific tradition verdicts instead of replacing them with not_decoded. A word
  with other mistakes still uses the strict under-40-percent threshold.
- The rulebook's Ashkenazi reading of the substitute הַשֵּׁם uses tzere `ey`, but
  the required `ha-shem` example uses `e`. Substitute readings accept both and
  report both sounds on that reading's pair. Ordinary printed tzere is unchanged.

If several other traditions match, `otherTradition` names the first in rulebook
preset order. `acceptOtherTraditions` makes those matches ok during alignment and
retains that name. For divine names, the best reading supplies pairs and skills;
the word text remains the printed name. Without heard sound, the first reading
supplies the skipped pairs.
