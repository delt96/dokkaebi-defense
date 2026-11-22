import { DIFFICULTIES, type Difficulty, type GameData } from '@dorandi/logic';

const labels: Record<Difficulty, string> = { easy: '쉬움', normal: '보통', hard: '어려움' };

export function difficultySuffix(data: GameData, difficulty?: Difficulty): string {
  return data.balance.difficulties ? ` · ${labels[difficulty ?? 'normal']}` : '';
}

export function difficultyPicker(selected: Difficulty, choose?: (d: Difficulty) => void): HTMLElement {
  const group = document.createElement('div');
  group.className = 'difficulty-picker';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', '난이도');
  for (const d of DIFFICULTIES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.difficulty = d;
    button.textContent = labels[d];
    button.setAttribute('aria-pressed', String(d === selected));
    button.disabled = !choose;
    button.addEventListener('click', () => choose?.(d));
    group.append(button);
  }
  return group;
}
