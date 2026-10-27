// Keep this rule in agreement with the station's lineStars fixtures.
export function lineStars(grade, challenge = false) {
  const { pairs = 0, ok = 0 } = grade?.summary || {};
  const sounded = grade?.words?.flatMap(word => word.pairs || []) || [];
  const perfect = sounded.length > 0 &&
    grade.words.every(word => !word.verdict || word.verdict === 'ok') &&
    sounded.every(pair => pair.verdict === 'ok') && !(grade.summary?.extra > 0);
  return (pairs > 0 && ok / pairs >= 0.8 ? 1 : 0) + (challenge && perfect ? 1 : 0);
}
