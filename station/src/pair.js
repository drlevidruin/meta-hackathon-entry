export function pairLetter(text) {
  const first = text.match(/^.\p{M}*/u)?.[0] ?? '';
  return first.replace(/(?![\u05bc\u05c1\u05c2])\p{M}/gu, '');
}
