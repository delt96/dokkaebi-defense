// Korean particles after a name: 을/를, 이/가, 은/는, 과/와 depend on whether the last spoken syllable ends in a consonant.

/** How the digits 0-9 are read (영 일 이 삼 사 오 육 칠 팔 구): true when the reading ends in a consonant. */
const DIGIT_FINAL = [true, true, false, true, false, false, true, true, true, false];

/**
 * True when `word` is read ending in a consonant, false when not, null when it cannot tell (Latin letters, symbols).
 * A trailing note in parentheses is skipped, as it is when read aloud: "숲다리미(3등급)" is read as "숲다리미".
 */
export function endsInConsonant(word: string): boolean | null {
  const spoken = word.replace(/(\s*\([^()]*\))+\s*$/, '').trimEnd();
  const last = spoken.charCodeAt(spoken.length - 1);
  if (last >= 0xac00 && last <= 0xd7a3) return (last - 0xac00) % 28 !== 0;
  if (last >= 0x30 && last <= 0x39) return DIGIT_FINAL[last - 0x30]!;
  return null;
}

/** The particle for `word`: the first form after a final consonant, the second otherwise; both when it cannot tell. */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  const final = endsInConsonant(word);
  return final === null ? `${withFinal}(${withoutFinal})` : final ? withFinal : withoutFinal;
}

export type JosaPair = '을/를' | '이/가' | '은/는' | '과/와';

/** `word` followed by its particle, e.g. withJosa('모루', '을/를') → '모루를'. */
export function withJosa(word: string, pair: JosaPair): string {
  const [withFinal, withoutFinal] = pair.split('/') as [string, string];
  return word + josa(word, withFinal, withoutFinal);
}

/** `word` followed by 으로/로: 로 after a vowel or a final ㄹ, 으로 after any other final consonant. */
export function withRo(word: string): string {
  const spoken = word.replace(/(\s*\([^()]*\))+\s*$/, '').trimEnd();
  const last = spoken.charCodeAt(spoken.length - 1);
  if (last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 === 8) return `${word}로`;
  return word + josa(word, '으로', '로');
}
