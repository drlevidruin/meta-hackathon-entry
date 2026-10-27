import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeLine } from './index.js';

const grade = (text, heard, preset = 'sephardi') => gradeLine({ text, preset,
  heard: heard.split(' ').map(word => word.split('-')) });

for (const [heard, verdict, blame] of [['vo', 'wrong_letter', ['letter:bet']],
  ['bi', 'wrong_vowel', ['vowel:kamatz']], ['bo', 'ok', []]]) {
  test(`round 2.2: one-pair bet heard ${heard} gets ${verdict}`, () => {
    const result = grade('בָּ', heard, 'ashkenazi');
    assert.equal(result.words[0].verdict, null);
    assert.equal(result.words[0].pairs[0].verdict, verdict);
    assert.deepEqual(result.summary.missedSkills, blame);
  });
}
for (const preset of ['ashkenazi', 'sephardi']) {
  test(`round 2.2: two-pair bat heard vat keeps the existing diagnosis in ${preset}`, () => {
    const result = grade('בַּת', 'vat', preset);
    assert.equal(result.words[0].verdict, preset === 'ashkenazi' ? 'not_decoded' : null);
    assert.deepEqual(result.words[0].pairs.map(pair => pair.verdict),
      preset === 'ashkenazi' ? ['not_decoded', 'not_decoded'] : ['wrong_letter', 'ok']);
  });
}

test('round 2.4: not_decoded verdicts blame each sounded pair and union their skills', () => {
  const result = grade('הָעוֹלָם', 'ha-ma-kom', 'ashkenazi');
  assert.equal(result.words[0].verdict, 'not_decoded');
  for (const pair of result.words[0].pairs) assert.deepEqual(pair.blame, pair.skills);
  assert.deepEqual(result.summary.missedSkills,
    [...new Set(result.words[0].pairs.flatMap(pair => pair.skills))].sort());
});

for (const [name, text, heard, wrong] of [
  ['full five-word reread', 'מוֹדֶה אֲנִי לְפָנֶיךָ מֶלֶךְ חַי',
    'mo-de a-ni le-fa-ne-cha me-lech chay mo-de a-ni le-fa-ne-cha me-lech chay', 0],
  ['three-word correction', 'מוֹדֶה אֲנִי לְפָנֶיךָ', 'mo-de a-na le-fa-ne-cha mo-de a-ni le-fa-ne-cha', 0],
  ['later mistake', 'מוֹדֶה אֲנִי לְפָנֶיךָ', 'mo-de a-ni le-fa-ne-cha mo-de a-na le-fa-ne-cha', 1],
  ['cut short first pass', 'מוֹדֶה אֲנִי לְפָנֶיךָ', 'mo-de a-ni le-fa mo-de a-ni le-fa-ne-cha', 0],
  ['restart inside a line', 'חַי מוֹדֶה אֲנִי לְפָנֶיךָ', 'chay mo-de a-na mo-de a-ni le-fa-ne-cha', 0],
]) {
  test(`round 2.5: line restart grades ${name}`, () => {
    const result = grade(text, heard);
    assert.equal(result.summary.extra, 0);
    assert.equal(result.summary.wrong_vowel, wrong);
    assert.equal(result.summary.ok, result.summary.pairs - wrong);
    assert.equal(result.words.length, text.split(' ').length);
  });
}

test('round 2.5: genuinely repeated printed phrases remain separate', () => {
  const result = grade('מוֹדֶה אֲנִי מוֹדֶה אֲנִי', 'mo-de a-ni mo-de a-ni');
  assert.equal(result.words.length, 4);
  assert.equal(result.summary.ok, result.summary.pairs);
  assert.equal(result.summary.extra, 0);
});

for (const heard of ['da-ni', 'tza-ni', 'la-ni']) {
  test(`round 2.6: ${heard} blames the alef consonant plant`, () => {
    const result = grade('אֲנִי', heard);
    assert.equal(result.words[0].pairs[0].verdict, 'wrong_letter');
    assert.deepEqual(result.words[0].pairs[0].blame, ['letter:alef']);
    assert.deepEqual(result.summary.missedSkills, ['letter:alef']);
    assert.equal(result.summary.extra, 0);
  });
}

for (const [text, heard, skill] of [['עֲנִי', 'da-ni', 'letter:ayin'], ['וּבָא', 'du-va', null]]) {
  test(`round 2.6: a consonant fused onto ${text} is a letter mistake`, () => {
    const result = grade(text, heard);
    assert.equal(result.words[0].pairs[0].verdict, 'wrong_letter');
    if (skill) assert.ok(result.summary.missedSkills.includes(skill));
    assert.equal(result.summary.extra, 0);
  });
}

test('round 2.6: a whole extra syllable before alef stays extra', () => {
  const result = grade('אֲנִי', 'da-a-ni');
  assert.equal(result.summary.ok, result.summary.pairs);
  assert.equal(result.summary.extra, 1);
  assert.deepEqual(result.summary.missedSkills, []);
});
