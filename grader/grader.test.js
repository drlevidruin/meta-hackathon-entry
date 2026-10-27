import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedSounds } from '../rulebook/index.js';
import { align, gradeLine } from './index.js';
import { main } from './cli.js';

const wordsHeard = (heard) => heard.trim() ? heard.trim().split(/\s+/u).map((word) => word.split('-')) : [];
const grade = (text, preset, heard, options) => gradeLine({ text, preset, heard: wordsHeard(heard) }, options);
const verdicts = (word) => word.pairs.map((pair) => pair.verdict);
const extras = (result) => result.verdicts.filter((entry) => entry.verdict === 'extra');

test('sha-vos puts the wrong consonant on bet and consumes vo', () => {
  const result = grade('שַׁבָּת', 'ashkenazi', 'sha-vos');
  assert.deepEqual(verdicts(result.words[0]), ['ok', 'wrong_letter', 'ok']);
  assert.equal(result.words[0].pairs[1].heard, 'vo');
  assert.deepEqual(result.words[0].pairs[1].expected, ['bo']);
  assert.deepEqual(result.words[0].pairs[1].skills, ['letter:bet', 'vowel:kamatz']);
});

test('shi-bos puts the wrong vowel on shin', () => {
  assert.deepEqual(verdicts(grade('שַׁבָּת', 'ashkenazi', 'shi-bos').words[0]),
    ['wrong_vowel', 'ok', 'ok']);
});

test('sha-bat preserves the Sephardi explanations instead of not_decoded', () => {
  const result = grade('שַׁבָּת', 'ashkenazi', 'sha-bat');
  assert.equal(result.words[0].verdict, null);
  assert.deepEqual(verdicts(result.words[0]), ['ok', 'wrong_vowel', 'wrong_letter']);
  assert.deepEqual(result.words[0].pairs.map((pair) => pair.otherTradition),
    [undefined, 'sephardi', 'sephardi']);
  assert.deepEqual(result.verdicts.map((pair) => pair.otherTradition),
    [undefined, 'sephardi', 'sephardi']);
  const accepted = grade('שַׁבָּת', 'ashkenazi', 'sha-bat', { acceptOtherTraditions: true });
  assert.deepEqual(verdicts(accepted.words[0]), ['ok', 'ok', 'ok']);
  assert.deepEqual(accepted.words[0].pairs.map((pair) => pair.otherTradition),
    [undefined, 'sephardi', 'sephardi']);
  assert.deepEqual(accepted.summary.missedSkills, []);
});

test('mech skips the middle pair without moving the final chaf', () => {
  const result = grade('מֶלֶךְ', 'sephardi', 'mech');
  assert.deepEqual(verdicts(result.words[0]), ['ok', 'skipped', 'ok']);
  assert.deepEqual(result.words[0].pairs.map((pair) => pair.heard), ['me', '', 'ch']);
});

for (const heard of ['sha sha-bos', 'sha-bos sha-bos', 'sha sha sha-bos', 'sha bos sha-bos']) {
  test(`restart ${heard} keeps only the last attempt`, () => {
    const result = grade('שַׁבָּת', 'ashkenazi', heard);
    assert.equal(result.words.length, 1);
    assert.deepEqual(verdicts(result.words[0]), ['ok', 'ok', 'ok']);
    assert.equal(extras(result).length, 0);
  });
}

test('a restart keeps the last attempt even if the earlier attempt was better', () => {
  const result = grade('שַׁבָּת', 'ashkenazi', 'sha-bos sha-vos');
  assert.deepEqual(verdicts(result.words[0]), ['ok', 'wrong_letter', 'ok']);
  assert.equal(result.words[0].pairs[1].heard, 'vo');
  assert.equal(extras(result).length, 0);
});

for (const heard of ['sha bos', 'sha bo s']) {
  test(`split word ${heard} joins up to three heard words`, () => {
    const result = grade('שַׁבָּת', 'ashkenazi', heard);
    assert.equal(result.words.length, 1);
    assert.deepEqual(verdicts(result.words[0]), ['ok', 'ok', 'ok']);
    assert.equal(extras(result).length, 0);
  });
}

test('printed repeated words remain separate words', () => {
  const result = grade('שַׁבָּת שַׁבָּת', 'ashkenazi', 'sha-bos sha-bos');
  assert.equal(result.words.length, 2);
  assert.equal(result.summary.ok, 6);
  assert.equal(result.summary.extra, 0);
});

for (const [heard, after, sound] of [['e-cho-de', 2, 'e'], ['ba-e-chod', -1, 'ba'], ['e-ba-chod', 0, 'ba']]) {
  test(`extra phonemes in ${heard} are anchored after pair ${after}`, () => {
    const result = grade('אֶחָד', 'ashkenazi', heard);
    assert.deepEqual(verdicts(result.words[0]), ['ok', 'ok', 'ok']);
    assert.deepEqual(extras(result), [{ word: 0, pair: after, text: '', verdict: 'extra',
      heard: sound, expected: [], skills: [] }]);
    assert.equal(result.words[0].pairs.map((pair) => pair.text).join(''), result.words[0].text);
  });
}

test('ha-ma-kom does not decode haolam, including its one matching final pair', () => {
  const result = grade('הָעוֹלָם', 'ashkenazi', 'ha-ma-kom');
  assert.equal(result.words[0].verdict, 'not_decoded');
  assert.deepEqual(verdicts(result.words[0]), Array(4).fill('not_decoded'));
  assert.equal(result.summary.not_decoded, 4);
  assert.deepEqual(result.summary.missedSkills, []);
});

test('a skipped word does not shift the divine name and echad', () => {
  const result = grade('שְׁמַע יִשְׂרָאֵל יְהֹוָה אֶחָד', 'ashkenazi', 'she-ma a-do-noy e-chod');
  assert.deepEqual(result.words.map((word) => word.verdict), [null, 'skipped', null, null]);
  assert.deepEqual(verdicts(result.words[1]), Array(5).fill('skipped'));
  assert.ok(result.words.filter((_, index) => index !== 1).every((word) => verdicts(word).every((v) => v === 'ok')));
  assert.equal(result.summary.skipped, 5);
  assert.equal(result.summary.extra, 0);
});

test('an extra heard word stays between its neighboring expected words', () => {
  const result = grade('שְׁמַע יִשְׂרָאֵל', 'ashkenazi', 'she-ma ba yis-ro-eyl');
  assert.equal(result.words.length, 3);
  assert.deepEqual(result.words[1], { text: 'ba', verdict: 'extra', pairs: [] });
  assert.deepEqual(extras(result), [{ word: 1, pair: -1, text: 'ba', verdict: 'extra',
    heard: 'ba', expected: [], skills: [] }]);
  assert.equal(result.summary.ok, 7);
  assert.equal(result.summary.extra, 1);
  assert.deepEqual(result.summary.missedSkills, []);
});

test('sha-? marks both covered pairs uncertain and retains the known correct pair', () => {
  const result = grade('שַׁבָּת', 'ashkenazi', 'sha-?');
  assert.equal(result.words[0].verdict, null);
  assert.deepEqual(verdicts(result.words[0]), ['ok', 'uncertain', 'uncertain']);
  assert.deepEqual(result.words[0].pairs.map((pair) => pair.heard), ['sha', '?', '?']);
  assert.equal(result.summary.uncertain, 2);
  assert.deepEqual(result.summary.missedSkills, []);
});

test('an entirely unknown word remains uncertain', () => {
  const result = grade('שַׁבָּת', 'ashkenazi', '?');
  assert.equal(result.words[0].verdict, null);
  assert.deepEqual(verdicts(result.words[0]), ['uncertain', 'uncertain', 'uncertain']);
});

for (const heard of ['a-doy-noy', 'ha-shem']) {
  test(`the divine name accepts the reading ${heard}`, () => {
    const result = grade('יְהֹוָה', 'ashkenazi', heard);
    assert.ok(verdicts(result.words[0]).every((verdict) => verdict === 'ok'));
    assert.equal(result.summary.extra, 0);
    assert.equal(result.words[0].text, expectedSounds('יְהֹוָה', 'ashkenazi').word);
    const reading = heard === 'ha-shem' ? 'הַשֵּׁם' : 'אֲדֹנָי';
    assert.equal(result.words[0].pairs.map((pair) => pair.text).join(''), expectedSounds(reading, 'ashkenazi').word);
  });
}

for (const heard of ['choch-ma', 'cha-che-ma']) {
  test(`flagged kamatz and sheva alternatives accept ${heard}`, () => {
    assert.deepEqual(verdicts(grade('חָכְמָה', 'sephardi', heard).words[0]), ['ok', 'ok', 'ok']);
  });
}

for (const heard of ['a-do-nai', 'a-do-nau', 'a-do-nay']) {
  test(`closing glide normalization accepts ${heard}`, () => {
    const result = grade('אֲדֹנָי', 'sephardi', heard);
    assert.deepEqual(verdicts(result.words[0]), ['ok', 'ok', 'ok', 'ok']);
    assert.equal(result.words[0].pairs.at(-1).heard, 'y');
  });
}

test('glide normalization never crosses a heard syllable boundary', () => {
  const result = grade('אֲדֹנָי', 'sephardi', 'a-do-na-i');
  assert.notEqual(result.words[0].pairs.at(-1).verdict, 'ok');
});

test('a missing tzere glide is a vowel error with a Sephardi explanation', () => {
  const result = grade('אֱלֹהֵינוּ', 'ashkenazi', 'e-loy-ke-nu');
  assert.deepEqual(verdicts(result.words[0]), ['ok', 'ok', 'wrong_vowel', 'ok']);
  assert.equal(result.words[0].pairs[2].heard, 'ke');
  assert.equal(result.words[0].pairs[2].otherTradition, 'sephardi');
});

test('both consonant and vowel wrong gives wrong_letter', () => {
  const result = grade('שַׁבָּת', 'ashkenazi', 'sha-vis');
  assert.deepEqual(verdicts(result.words[0]), ['ok', 'wrong_letter', 'ok']);
});

test('furtive patach is aligned vowel first', () => {
  assert.deepEqual(verdicts(grade('רוּחַ', 'sephardi', 'ru-ach').words[0]), ['ok', 'ok']);
  assert.deepEqual(verdicts(grade('רוּחַ', 'sephardi', 'ru-ich').words[0]), ['ok', 'wrong_vowel']);
});

test('the third preset and acceptance of another tradition work', () => {
  const result = grade('שַׁבָּת', 'ashkenazi', 'sha-bus');
  assert.equal(result.words[0].pairs[1].verdict, 'wrong_vowel');
  assert.equal(result.words[0].pairs[1].otherTradition, 'chassidish');
  const accepted = grade('שַׁבָּת', 'ashkenazi', 'sha-bus', { acceptOtherTraditions: true });
  assert.equal(accepted.summary.ok, 3);
  assert.equal(accepted.words[0].pairs[1].otherTradition, 'chassidish');
  assert.equal(grade('שַׁבָּת', 'chassidish', 'sha-bus').summary.ok, 3);
});

test('mixed line summary counts sounded pairs, extras and sorted unique missed skills', () => {
  const result = grade('שַׁבָּת מֶלֶךְ אֶחָד שַׁבָּת אֱלֹהֵינוּ הָעוֹלָם', 'ashkenazi',
    'sha-vos mech e-cho-de ba sha-? e-loy-ke-nu ha-ma-kom');
  assert.deepEqual(result.summary, {
    pairs: 20, ok: 11, wrong_letter: 1, wrong_vowel: 1, skipped: 1,
    extra: 2, uncertain: 2, not_decoded: 4,
    missedSkills: ['letter:bet', 'letter:hei', 'letter:lamed', 'pattern:tzere_male',
      'vowel:kamatz', 'vowel:segol', 'vowel:tzere'],
  });
  for (const [wordIndex, word] of result.words.entries()) {
    if (word.verdict === 'extra') continue;
    assert.equal(word.pairs.map((pair) => pair.text).join(''), word.text);
    for (const [pairIndex, pair] of word.pairs.entries()) {
      assert.deepEqual(result.verdicts.find((v) => v.word === wordIndex
        && v.pair === pairIndex && v.verdict !== 'extra'), { word: wordIndex, pair: pairIndex, ...pair });
    }
  }
});

test('silence skips all sounded pairs while a silent pair stays ok and uncounted', () => {
  const result = grade('שַׁבָּת ה', 'ashkenazi', '');
  assert.deepEqual(result.words.map((word) => word.verdict), ['skipped', 'skipped']);
  assert.deepEqual(verdicts(result.words[0]), ['skipped', 'skipped', 'skipped']);
  assert.deepEqual(verdicts(result.words[1]), ['ok']);
  assert.equal(result.summary.pairs, 3);
  assert.equal(result.summary.skipped, 3);
  assert.equal(result.summary.ok, 0);
});

test('no printed words returns heard words as extras, with their original syllables', () => {
  const result = grade('', 'sephardi', 'sha-bos ba');
  assert.deepEqual(result.words, [
    { text: 'sha-bos', verdict: 'extra', pairs: [] }, { text: 'ba', verdict: 'extra', pairs: [] },
  ]);
  assert.equal(result.summary.pairs, 0);
  assert.equal(result.summary.extra, 2);
  assert.deepEqual(grade('', 'sephardi', '').words, []);
});

test('gradeLine uses cleanup and preserves maqaf-dependent alternatives', () => {
  const result = grade('<b>גָֽד־</b> שַׁבָּת׃', 'sephardi', 'god sha-bat');
  assert.equal(result.summary.ok, 5);
  assert.equal(result.summary.extra, 0);
  assert.equal(result.words[0].pairs.map((pair) => pair.text).join(''), result.words[0].text);
});

test('align matches gradeLine and leaves its inputs unchanged', () => {
  const heard = wordsHeard('sha-bat');
  const expected = [expectedSounds('שַׁבָּת', 'ashkenazi')];
  const before = structuredClone({ heard, expected });
  assert.deepEqual(align(heard, expected), grade('שַׁבָּת', 'ashkenazi', 'sha-bat'));
  assert.deepEqual(align(heard, expected, { acceptOtherTraditions: true }),
    grade('שַׁבָּת', 'ashkenazi', 'sha-bat', { acceptOtherTraditions: true }));
  assert.deepEqual({ heard, expected }, before);
});

test('invalid heard syllables and presets are rejected', () => {
  assert.throws(() => grade('שַׁבָּת', 'unknown', 'sha-bos'), /Unknown preset/u);
  assert.throws(() => grade('', 'toString', ''), /Unknown preset/u);
  for (const heard of ['sha-bwos', 'sha--bos']) {
    assert.throws(() => grade('שַׁבָּת', 'ashkenazi', heard), TypeError);
  }
});

test('CLI prints words, pair verdicts, traditions and summary, and rejects invalid flags', (t) => {
  const logs = [];
  const errors = [];
  t.mock.method(console, 'log', (line) => logs.push(line));
  t.mock.method(console, 'error', (line) => errors.push(line));
  assert.equal(main(['--preset', 'ashkenazi', '--line', 'שַׁבָּת', '--heard', 'sha-bat']), 0);
  assert.ok(logs.some((line) => line.includes('wrong_vowel') && line.includes('otherTradition=sephardi')));
  assert.equal(JSON.parse(logs.at(-1)).wrong_letter, 1);
  assert.equal(main(['--preset', 'ashkenazi', '--line', 'שַׁבָּת', '--heard', 'sha-bat', '--accept-other-traditions']), 0);
  assert.equal(JSON.parse(logs.at(-1)).ok, 3);
  assert.equal(main(['--help']), 0);
  for (const args of [[], ['--line'], ['--unknown'], ['--preset', 'wrong', '--line', 'שַׁבָּת', '--heard', 'sha-bos']]) {
    assert.equal(main(args), 1);
  }
  assert.equal(errors.length, 4);
});

test('a prefixed divine name needs the whole substitute, not the prefix alone', () => {
  const alone = grade('שֶׁיְהֹוָה', 'sephardi', 'she');
  assert.notEqual(alone.summary.ok, alone.summary.pairs);
  for (const [preset, heard] of [['sephardi', 'she-a-do-na-y'], ['ashkenazi', 'she-a-do-noy'],
    ['ashkenazi', 'she-ha-shem'], ['sephardi', 'she-ha-shem']]) {
    const result = grade('שֶׁיְהֹוָה', preset, heard);
    assert.equal(result.summary.ok, result.summary.pairs, `${preset} ${heard}`);
  }
});
