import { describe, expect, test } from 'vitest';
import { endsInConsonant, josa, withJosa } from '../src/ui/josa';

describe('Korean particles', () => {
  test('particles follow the last spoken syllable; a note in parentheses is skipped', () => {
    expect(withJosa('모루', '을/를')).toBe('모루를');
    expect(withJosa('천년 징', '을/를')).toBe('천년 징을');
    expect(withJosa('강철이', '이/가')).toBe('강철이가');
    expect(withJosa('천년 징', '이/가')).toBe('천년 징이');
    expect(withJosa('모루', '은/는')).toBe('모루는');
    expect(withJosa('장구·모루', '과/와')).toBe('장구·모루와');
    expect(withJosa('장구·천년 징', '과/와')).toBe('장구·천년 징과');
    // the rule for a trailing (N등급): read the name before it, as it is said aloud
    expect(withJosa('숯다리미(3등급)', '을/를')).toBe('숯다리미(3등급)를');
    expect(withJosa('천년 징(6등급)', '을/를')).toBe('천년 징(6등급)을');
    expect(withJosa('모루 (4등급) (받음)', '이/가')).toBe('모루 (4등급) (받음)가');
    // digits are read as numbers: 일 이 삼 사 오 육 칠 팔 구 영
    expect(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(d => endsInConsonant(`고개 ${d}`)))
      .toEqual([true, false, true, false, false, true, true, true, false, true]);
    // a name it cannot read gets both forms
    expect(josa('Kim', '을', '를')).toBe('을(를)');
    expect(endsInConsonant('')).toBeNull();
  });

  test('the plain form picks between the two given particles', () => {
    expect(josa('모루', '을', '를')).toBe('를');
    expect(josa('천년 징', '을', '를')).toBe('을');
  });
});
