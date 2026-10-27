# Rulebook

The rulebook knows what every letter and vowel in a pointed Hebrew word should sound like. It is pure code: no network, no model. The grader compares what the ear heard against it, pair by pair.

## Sound alphabet

Consonants: `b v g d h z ch t y k l m n s p f tz r sh`. Vowels: `a e i o u oy ey`. A silent letter produces nothing (`''`).

## Presets

| Vowel | Sephardi | Ashkenazi | Chassidish |
| --- | --- | --- | --- |
| patach, chataf patach | a | a | a |
| kamatz | a | o | o, u |
| kamatz katan, chataf kamatz | o | o | o |
| segol, chataf segol | e | e | e |
| tzere | e, ey | ey | ey |
| chirik | i | i | i |
| cholam | o | o, oy, ey | o, oy, ey |
| kubutz, shuruk | u | u | u |
| sheva na | e | e | e |

Consonants are the same in every preset except tav without a dagesh: `t` in Sephardi, `s` in Ashkenazi and Chassidish.

## Pairs

A word splits into pairs. A pair is one sounding letter plus its vowel. Silent letters that only carry a vowel (matres) join the pair before them, so every letter belongs to exactly one pair.

| Letters | Sound |
| --- | --- |
| א, ע | silent consonant (`''`); their vowel still sounds. With no vowel they are silent and join the pair before. |
| בּ / ב | b / v |
| גּ ג | g |
| דּ ד | d |
| ה | h. Last letter, no vowel, no mappik: silent, joins the pair before. הּ (mappik) is h. |
| ו | v, except as cholam male or shuruk (below) |
| ז | z |
| ח | ch |
| ט | t |
| י | y, except as a mater (below) |
| כּ ךּ / כ ך | k / ch |
| ל | l |
| מ ם | m |
| נ ן | n |
| ס | s |
| פּ ףּ / פ ף | p / f |
| צ ץ | tz |
| ק | k |
| ר | r |
| שׁ / שׂ | sh / s. A shin with no dot: sh, flagged `no_shin_dot`. |
| תּ / ת | t / preset (t or s) |

Dagesh chazak (doubling) does not change the sound. A rafe means no dagesh.

### Vav

- **Cholam male.** ו with a cholam and no dagesh, after a letter with no vowel of its own: the letter before takes the cholam and the vav is silent (שָׁלוֹם: `sha` `lo` `m`; עוֹ is `o`).
- After a letter that already has a vowel, including a sheva, ו with a cholam is a consonant: `v` plus cholam (מִצְוֹת: `mi` `tz` `vo` `t`). U+05BA (cholam haser for vav) is always consonant vav plus cholam.
- **Shuruk.** ו with a dagesh and no vowel mark: after a letter with no vowel, that letter takes `u` and the vav is silent (בָּרוּךְ: `ba` `ru` `ch`). As the first letter of a word it is a pair of its own, `u` (וּבְכָל).
- ו with a dagesh and a vowel is consonant `v` with that vowel (מְצַוְּךָ: `me` `tza` `ve` `cha`).

### Yud

- After chirik, tzere or segol, a yud with no vowel and no dagesh is silent and joins the pair before (בִּי, בֵּית, נֶיךָ).
- After patach or kamatz, a yud with no vowel is consonant `y` closing the syllable (חַי: `cha` `y`; אֲדֹנָי: `a` `do` `na` `y`).
- Kamatz, yud, vav at the end of a word (ָיו): the yud is silent and the vav is `v` (יָדָיו: `ya` `da` `v`).
- A yud with no vowel followed by a shuruk takes the `u` (וְהָיוּ: `ve` `ha` `yu`).

### Patach genuvah

A final ח, ע or הּ with a patach is read vowel first: רוּחַ is `ru` `ach`, גָּבֹהַּ is `ga` `vo` `ah`. The pair's sound is vowel then consonant and it carries `furtive: true`.

### Sheva

Decided in this order:

1. First letter of the word: na.
2. Last letter of the word: nach. Two shevas on the last two letters: both nach.
3. Two shevas in a row inside the word: the first is nach, the second is na (נַפְשְׁךָ: `na` `f` `she` `cha`).
4. Under a letter with a dagesh chazak: na (הַדְּבָרִים: `ha` `de` `va` `ri` `m`). A dagesh is chazak in any letter outside בגדכפת (except shuruk and mappik), and in a בגדכפת letter that follows a sounded vowel. A בגדכפת dagesh at the start of a word or after a sheva nach is kal.
5. Right after a word-initial shuruk: na (וּבְכָל: `u` `ve`).
6. Under the first of two identical letters: either reading, flagged `sheva` (הַלְלוּ).
7. After a long vowel (kamatz not marked katan, tzere, cholam, shuruk, chirik with yud, tzere with yud): either reading, flagged `sheva`.
8. Anything else (after patach, segol, chirik without yud, kubutz, a marked kamatz katan, a chataf): nach.

Na sounds `e`. Nach sounds nothing. A flagged sheva accepts both.

### Kamatz katan

- U+05C7 (kamatz katan) is always `o`, unflagged.
- These kamatzes may be katan and are flagged `kamatz_katan`. The grader accepts either reading.
  - The next letter has a sheva (חָכְמָה, בָּרְכוּ).
  - The next letter has a chataf kamatz (צָהֳרַיִם).
  - The next letter has a dagesh chazak (חָנֵּנִי, בָּתִּים).
  - The word is joined to the next word by a maqaf and the kamatz is in its last syllable (כָּל־).
  - The word is כָּל or ends in כָל or כָּל with prefixes (בְּכָל, וּבְכָל, לְכָל).
  - The word starts with וַ followed by a letter with a dagesh (or וָא), and its last vowel is a kamatz before a closing consonant (וַיָּקָם).

### Divine names

Flagged `divine_name`. The bank keeps them out of levels 1 to 4.

- The four-letter name (any pointing of יהוה, also יְיָ and ה׳): no pairs. `readings` holds the expected sounds of אֲדֹנָי and of הַשֵּׁם under the same preset; the grader accepts either.
- אֱלֹהִים and its forms (any word whose letters, after prefixes, start with אלה and that has a chataf segol under the alef): the ה accepts `h` or `k` (`e-lo-key-nu`).
- אֲדֹנָי written out: decoded normally, and `readings` also holds הַשֵּׁם.
- אֵל with a tzere: the alef accepts `''` or `k`.

### Cleanup and unpointed words

Before splitting: remove HTML tags, cantillation (U+0591 to U+05AF), meteg (U+05BD), paseq, sof pasuq, geresh and gershayim (after checking for ה׳), punctuation, and Unicode presentation forms (decompose them). Order of marks on a letter does not matter.

A letter other than the last one, with no vowel, that is not a silent mater or a closing yud as described above, means the word is unpointed: flag `unpointed`. Siddur instructions in plain letters (יחיד אומר) are caught this way.

## Output

`expectedSounds(word, preset)` returns:

```js
{
  word,            // the cleaned word
  preset,
  pairs: [{
    text,          // the letters and marks this pair covers
    letter,        // the sounding letter
    consonants,    // accepted consonant sounds, '' for silent
    vowels,        // accepted vowel sounds, '' for none
    sounds,        // accepted sounds for the pair, e.g. ['bo', 'bu']
    vowel,         // vowel name: kamatz, kamatz_katan, patach, chataf_patach, chataf_kamatz,
                   // segol, chataf_segol, tzere, chirik, cholam, kubutz, shuruk,
                   // sheva_na, sheva_nach, sheva (undecided), none
    furtive,       // true for patach genuvah
    flags,         // kamatz_katan, sheva, divine_name, unpointed, no_shin_dot
    skills,        // see below
  }],
  flags,           // union of pair flags plus word flags
  skills,          // union of pair skills
  readings,        // null, or alternative whole-word results (divine names)
}
```

`tagSkills(word)` returns the sorted skill ids a word exercises. Skills do not depend on the preset.

- Letters: `letter:alef` through `letter:tav`, with `bet`/`vet`, `kaf`/`chaf`, `pei`/`fei`, `tav`/`sav`, `shin`/`sin`, and the finals `final_chaf`, `final_kaf`, `final_mem`, `final_nun`, `final_fei`, `final_tzadi`. Every sounding consonant gets its letter skill. Alef and ayin get theirs too.
- Vowels: `vowel:kamatz`, `vowel:kamatz_katan`, `vowel:patach`, `vowel:chataf_patach`, `vowel:chataf_kamatz`, `vowel:segol`, `vowel:chataf_segol`, `vowel:tzere`, `vowel:chirik`, `vowel:cholam`, `vowel:kubutz`, `vowel:shuruk`, `vowel:sheva_na`.
- Patterns: `pattern:closed_syllable` (a consonant with no vowel, sheva nach or none), `pattern:two_shevas`, `pattern:cholam_male`, `pattern:chirik_male`, `pattern:tzere_male`, `pattern:segol_yud`, `pattern:ai` (patach or kamatz with a closing consonant yud), `pattern:av` (ָיו), `pattern:silent_alef`, `pattern:silent_hei`, `pattern:silent_ayin` (each only for that letter when it sounds nothing), `pattern:mappik`, `pattern:patach_genuvah`, `pattern:vav_consonant`.

A mater yud is never a silent-letter skill, and `pattern:ai` never fires on a tzere with yud.
