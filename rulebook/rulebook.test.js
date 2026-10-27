import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanWord, expectedSounds, formatPairs, formatReading, PRESETS, SKILLS, splitWords, tagSkills } from './index.js';

const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const presets = Object.keys(PRESETS);
const alternatives = (pairs) => pairs.map((pair) => new Set(pair.sounds));
const answerPairs = (pairs) => pairs.map((pair) => new Set(pair.split('|')));

for (const entry of golden.words) {
  for (const preset of presets) {
    test(`golden ${entry.word} ${preset}`, () => {
      const result = expectedSounds(entry.word, preset);
      assert.deepEqual(new Set(result.flags), new Set(entry.flags));
      assert.deepEqual(alternatives(result.pairs), answerPairs(entry[preset]));
      if (entry.readings) {
        assert.deepEqual(result.readings.map((reading) => alternatives(reading.pairs)),
          entry.readings[preset].map(answerPairs));
      }
    });
  }
}

for (const entry of golden.flagOnly) for (const preset of presets) {
  test(`golden flags ${entry.word} ${preset}`, () => {
    assert.deepEqual(new Set(expectedSounds(entry.word, preset).flags), new Set(entry.flags));
  });
}

test('cleanup strips HTML, punctuation, cantillation, meteg and decomposes presentation forms', () => {
  assert.deepEqual(splitWords('<b>שְׁמַ֖ע</b>,יִשְׂרָאֵֽל.בִּי:מִן;חַי׃רוּחַ־שָׁלוֹם'), [
    ...['שְׁמַע', 'יִשְׂרָאֵל', 'בִּי', 'מִן', 'חַי'].map((word) => ({ word: cleanWord(word), maqaf: false })),
    { word: cleanWord('רוּחַ'), maqaf: true }, { word: cleanWord('שָׁלוֹם'), maqaf: false },
  ]);
  assert.equal(cleanWord('\ufb2a\ufb35'), cleanWord('שׁוּ'));
  assert.deepEqual(expectedSounds('\ufb2aוּ', 'sephardi'), expectedSounds('שׁוּ', 'sephardi'));
  assert.deepEqual(expectedSounds('וּבְכָל', 'sephardi'), expectedSounds('וּבְכָל', 'sephardi'));
  assert.equal(cleanWord('מֶֽלֶךְ׀׳״׃'), cleanWord('מֶלֶךְ'));
  assert.equal(cleanWord('בַּֿ'), cleanWord('בַ'));
  assert.deepEqual(splitWords('בִּי־ מִן־חַי'), [
    { word: cleanWord('בִּי'), maqaf: true }, { word: 'מִן', maqaf: true }, { word: 'חַי', maqaf: false },
  ]);
});

test('skill tags are sorted, unique, documented and independent of the preset', () => {
  const examples = {
    'בִּי': ['letter:bet', 'vowel:chirik', 'pattern:chirik_male'],
    'בֵּית': ['vowel:tzere', 'pattern:tzere_male', 'letter:sav'],
    'נֶיךָ': ['vowel:segol', 'pattern:segol_yud', 'letter:final_chaf'],
    'חַי': ['pattern:ai', 'letter:yud'],
    'יָדָיו': ['pattern:av', 'pattern:vav_consonant'],
    'וּבְכָל': ['vowel:shuruk', 'vowel:sheva_na'],
    'בְּרֵאשִׁית': ['pattern:silent_alef', 'pattern:chirik_male'],
    'שְׁמַע': ['letter:ayin', 'pattern:silent_ayin'],
    'גָּבֹהַּ': ['pattern:mappik', 'pattern:patach_genuvah'],
  };
  for (const [word, required] of Object.entries(examples)) {
    const skills = tagSkills(word);
    for (const skill of required) assert.ok(skills.includes(skill), `${word}: ${skill}`);
    assert.deepEqual(skills, [...new Set(skills)].sort());
    for (const skill of skills) assert.ok(SKILLS[skill], skill);
    for (const preset of presets) assert.deepEqual(expectedSounds(word, preset).skills, skills);
  }
  for (const word of ['בִּי', 'בֵּית', 'נֶיךָ']) {
    assert.ok(!tagSkills(word).some((skill) => skill.includes('silent_')));
    assert.ok(!tagSkills(word).includes('letter:yud'));
  }
  assert.ok(!tagSkills('בֵּית').includes('pattern:ai'));
  assert.ok(!tagSkills('וְהָיוּ').includes('pattern:ai'));
});

test('sheva precedence, chazak and long vowels', () => {
  const vowelNames = (word) => expectedSounds(word, 'sephardi').pairs.map((pair) => pair.vowel);
  assert.deepEqual(vowelNames('בְּכְ'), ['sheva_na', 'sheva_nach']);
  assert.deepEqual(vowelNames('נַפְשְׁךָ'), ['patach', 'sheva_nach', 'sheva_na', 'kamatz']);
  assert.deepEqual(vowelNames('בַּרְךְ'), ['patach', 'sheva_nach', 'sheva_nach']);
  assert.deepEqual(vowelNames('הַדְּבָרִים'), ['patach', 'sheva_na', 'kamatz', 'chirik', 'none']);
  assert.deepEqual(vowelNames('לִימְדָה'), ['chirik', 'sheva', 'kamatz']);
  for (const word of ['בַרְמַ', 'בֶרְמַ', 'בִרְמַ', 'בֻרְמַ', 'בׇרְמַ', 'בֲרְמַ']) {
    assert.equal(vowelNames(word)[1], 'sheva_nach', word);
  }
});

test('all possible kamatz katan contexts keep both readings', () => {
  for (const word of ['חָכְמָה', 'צָהֳרַיִם', 'חָנֵּנִי', 'בָּתִּים', 'גָד־', 'לְכָל', 'וַיָּקָם', 'וָאָקָם']) {
    const result = expectedSounds(word, 'sephardi');
    assert.ok(result.flags.includes('kamatz_katan'), word);
    for (const pair of result.pairs.filter((pair) => pair.flags.includes('kamatz_katan'))) {
      assert.deepEqual(new Set(pair.vowels), new Set(['a', 'o']));
    }
  }
  assert.ok(!expectedSounds('נַכָל', 'sephardi').flags.includes('kamatz_katan'));
  assert.ok(!expectedSounds('גָד', 'sephardi').flags.length);
  assert.ok(!expectedSounds('חׇכְמָה', 'sephardi').flags.length);
  assert.ok(expectedSounds('<b>גָד־</b>', 'sephardi').flags.includes('kamatz_katan'));
});

test('vav, yud, matres and furtive patach preserve every letter exactly once', () => {
  for (const word of ['עוֹ', 'הָעוֹלָם', 'בִּי', 'בֵּית', 'נֶיךָ', 'וְהָיוּ', 'רוּחַ', 'יָדוּעַ', 'גָּבֹהַּ']) {
    const result = expectedSounds(word, 'sephardi');
    assert.equal(result.pairs.map((pair) => pair.text).join(''), cleanWord(word));
  }
  assert.deepEqual(expectedSounds('בְוֹ', 'sephardi').pairs.map((pair) => pair.sounds), [['ve'], ['vo']]);
  assert.deepEqual(expectedSounds('בוֺ', 'sephardi').pairs.map((pair) => pair.sounds), [['v'], ['vo']]);
  assert.ok(expectedSounds('בוֺ', 'sephardi').flags.includes('unpointed'));
  assert.equal(formatReading(expectedSounds('רוּחַ', 'sephardi')), 'ru-ach');
  assert.equal(formatReading(expectedSounds('חַי', 'sephardi')), 'chay');
  assert.equal(expectedSounds('גָּבֹהַּ', 'sephardi').pairs.at(-1).furtive, true);
  assert.equal(expectedSounds('שַׁבָּת', 'sephardi').pairs[1].consonants[0], 'b');
});

test('divine names accept substitute readings and prefixed forms', () => {
  for (const word of ['יהוה', 'יְהֹוָה', 'יְיָ', 'ה׳', "ה'", '(ה׳),']) {
    for (const preset of presets) {
      const result = expectedSounds(word, preset);
      assert.deepEqual(result.pairs, []);
      assert.deepEqual(result.flags, ['divine_name']);
      assert.equal(formatPairs(result), '');
      assert.equal(result.readings.length, 2);
      assert.ok(formatReading(result).length);
    }
  }
  const spelled = expectedSounds('אֲדֹנָי', 'sephardi');
  assert.equal(formatReading(spelled), 'a-do-nay');
  assert.equal(formatReading(spelled.readings[0]), 'ha-shem');
  assert.deepEqual(expectedSounds('בֵּאלֹ', 'sephardi').flags, []);
  assert.deepEqual(expectedSounds('לֵאל', 'sephardi').flags, []);
  assert.ok(expectedSounds('לֵאֵל', 'sephardi').flags.includes('divine_name'));
  assert.ok(expectedSounds('בֵּאֱלֹהִים', 'sephardi').pairs.some((pair) => pair.consonants.includes('k')));
});

test('formatting and undageshed tav follow the written preset rule', () => {
  assert.equal(formatReading(expectedSounds('שַׁבָּת', 'ashkenazi')), 'sha-bos');
  assert.equal(formatPairs(expectedSounds('בֵּית', 'sephardi')), 'be/bey · t');
  assert.equal(formatReading(expectedSounds('נִשְׁמָתִי', 'ashkenazi')), 'nish-mo-si');
  assert.equal(formatReading(expectedSounds('נִשְׁמָתִי', 'chassidish')), 'nish-mo-si');
  assert.equal(expectedSounds('שָ', 'sephardi').flags.includes('no_shin_dot'), true);
  assert.throws(() => expectedSounds('בַּת', 'unknown'), /Unknown preset/u);
  assert.throws(() => expectedSounds('בַּת', 'toString'), /Unknown preset/u);
});

test('all consonants, finals, rafe, mappik and dagesh variants', () => {
  const cases = [
    ['אָ', 'a'], ['בָּ', 'ba'], ['בָ', 'va'], ['גָּ', 'ga'], ['גָ', 'ga'],
    ['דָּ', 'da'], ['דָ', 'da'], ['הָ', 'ha'], ['וָ', 'va'], ['וָּ', 'va'],
    ['זָ', 'za'], ['חָ', 'cha'], ['טָ', 'ta'], ['יָ', 'ya'], ['כָּ', 'ka'],
    ['כָ', 'cha'], ['לָ', 'la'], ['מָ', 'ma'], ['נָ', 'na'], ['סָ', 'sa'],
    ['עָ', 'a'], ['פָּ', 'pa'], ['פָ', 'fa'], ['צָ', 'tza'], ['קָ', 'ka'],
    ['רָ', 'ra'], ['שָׁ', 'sha'], ['שָׂ', 'sa'], ['תָּ', 'ta'], ['תָ', 'ta'],
    ['ךָּ', 'ka'], ['ךָ', 'cha'], ['םָ', 'ma'], ['ןָ', 'na'], ['ףָּ', 'pa'],
    ['ףָ', 'fa'], ['ץָ', 'tza'], ['בָּֿ', 'va'], ['מָּ', 'ma'],
  ];
  for (const [word, reading] of cases) assert.equal(formatReading(expectedSounds(word, 'sephardi')), reading, word);
  assert.equal(formatReading(expectedSounds('בַהּ', 'sephardi')), 'vah');
  assert.equal(formatReading(expectedSounds('בַה', 'sephardi')), 'va');
  assert.deepEqual(expectedSounds('ה', 'sephardi').pairs[0].sounds, ['']);
  assert.equal(formatReading(expectedSounds('בַּוּ', 'sephardi')), 'ba-u');
  assert.ok(tagSkills('בַהּ').includes('pattern:mappik'));
  assert.ok(!tagSkills('הַהְּלָה').includes('pattern:mappik'));
  assert.equal(expectedSounds('הַהְּלָה', 'sephardi').pairs[1].vowel, 'sheva_na');
});

for (const preset of presets) {
  test(`merged cholam keeps printed text and preset readings: ${preset}`, () => {
    const cases = [
      ['משֶׁה', ['mo', 'she'], 'moshe'],
      ['קְדשִׁים', ['ke', 'do', 'shi', 'm'], 'kedoshim'],
      ['וְתִירשְׁךָ', ['ve', preset === 'sephardi' ? 'ti' : 'si', 'ro', 'she', preset === 'sephardi' ? 'cha' : 'cho'],
        preset === 'sephardi' ? 'vetiroshecha' : 'vesiroshecho'],
      ['שׂנְאַי', ['so', 'ne', 'a', 'y'], 'sonay'],
    ];
    for (const [word, primary, reading] of cases) {
      const result = expectedSounds(word, preset);
      assert.ok(!result.flags.includes('unpointed'), word);
      assert.deepEqual(result.pairs.map(pair => pair.sounds[0]), primary, word);
      assert.equal(result.pairs.map(pair => pair.text).join(''), cleanWord(word));
      const cholam = result.pairs.find(pair => pair.vowel === 'cholam');
      assert.ok(cholam, word);
      assert.deepEqual(cholam.vowels, PRESETS[preset].cholam);
      assert.ok(!cholam.text.includes('ֹ'), word);
      const readings = result.pairs.reduce((before, pair) => before.flatMap(prefix => pair.sounds.map(sound => prefix + sound)), ['']);
      assert.ok(readings.includes(reading), word);
      assert.ok(result.skills.includes('vowel:cholam'));
    }
  });
}

test('merged cholam leaves matres, silent alef, explicit vowels and unpointed remainders alone', () => {
  for (const word of ['בִּישֶׁ', 'בּוּשֶׁ', 'בּוֹשֶׁ', 'בֵאשֶׁ']) {
    const result = expectedSounds(word, 'sephardi');
    assert.equal(result.pairs.length, 2, word);
    assert.equal(result.pairs[0].text, cleanWord(word).slice(0, -cleanWord('שֶׁ').length));
    assert.equal(result.pairs.at(-1).sounds[0], 'she');
  }
  for (const word of ['מְשֶׁה', 'מַשֶׁה', 'שְׂמַ', 'שַׂמַ', 'מַשׂ', 'מַשׁ']) {
    assert.ok(!expectedSounds(word, 'sephardi').pairs.some(pair => pair.vowel === 'cholam'), word);
  }
  for (const word of ['משֶׁהמל', 'קְדשִׁיםמל', 'יחיד', 'משר']) {
    assert.ok(expectedSounds(word, 'sephardi').flags.includes('unpointed'), word);
  }
  assert.equal(expectedSounds('וּשֶׁ', 'sephardi').pairs[0].vowel, 'shuruk');
});
