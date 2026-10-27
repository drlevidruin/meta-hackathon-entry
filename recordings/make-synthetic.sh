#!/bin/sh
# Rebuilds the synthetic test clips with the macOS voices. No child's voice is
# involved. The clips themselves are not committed; run this to make them.
set -e
cd "$(dirname "$0")"
mkdir -p synthetic
make() {
  say -v "$1" -r "$2" -o "synthetic/$3.aiff" "$4"
  afconvert -f WAVE -d LEI16@16000 -c 1 "synthetic/$3.aiff" "synthetic/$3.wav"
  rm "synthetic/$3.aiff"
}
# Hebrew voice. The planted mistake is written into the text it reads.
make Carmit 150 shalom_clean "שָׁלוֹם"
make Carmit 150 baruch_va-for-ba "וָרוּךְ"
make Carmit 150 shabbat_va-for-ba "שַׁוָּת"
make Carmit 150 melech_skipped-le "מֶךְ"
make Carmit 150 echad_i-for-a "אֶחִיד"
make Carmit 150 shema-line_clean "שְׁמַע יִשְׂרָאֵל"
make Carmit 150 babav_nonsense-clean "בָּבַב"
# English voice reading spelled-out sounds, so nothing can be autocorrected toward Hebrew.
make Samantha 140 en_shabbos_clean "shah boss"
make Samantha 140 en_shabbos_va-for-ba "shah voss"
make Samantha 140 en_baruch_clean "bah rook"
make Samantha 140 en_baruch_va-for-ba "vah rook"
make Samantha 140 en_modeh_clean "moe deh"
make Samantha 140 en_modeh_u-for-o "moo deh"
