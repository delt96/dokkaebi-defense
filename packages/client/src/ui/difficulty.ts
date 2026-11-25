import { DIFFICULTIES, loadGameData, type Difficulty, type GameData } from '@dorandi/logic';
import { playMinutes } from './first-visit';

const labels: Record<Difficulty, string> = { easy: '쉬움', normal: '보통', hard: '어려움' };

/** The difficulty's name, or '' when the stage has no difficulties. */
export function difficultyLabel(data: GameData, difficulty?: Difficulty): string {
  return data.balance.difficulties ? labels[difficulty ?? 'normal'] : '';
}

export function difficultySuffix(data: GameData, difficulty?: Difficulty): string {
  const label = difficultyLabel(data, difficulty);
  return label ? ` · ${label}` : '';
}

/** What a difficulty changes, read from the 70-round rules: "60라운드 · 약 40분 · 적 체력 80%". */
export function difficultyRuleText(difficulty: Difficulty, data: GameData = loadGameData('stage3')): string {
  const rule = data.balance.difficulties?.[difficulty];
  const rounds = rule?.rounds ?? data.balance.rounds;
  return `${rounds}라운드 · 약 ${playMinutes(data, rounds)}분 · 적 체력 ${Math.round((rule?.hpScale ?? 1) * 100)}%`;
}

export function difficultyNote(difficulty: Difficulty): HTMLElement {
  const note = document.createElement('div');
  note.className = 'difficulty-note';
  note.textContent = difficultyRuleText(difficulty);
  return note;
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
    button.title = difficultyRuleText(d);
    button.setAttribute('aria-pressed', String(d === selected));
    button.disabled = !choose;
    button.addEventListener('click', () => choose?.(d));
    group.append(button);
  }
  return group;
}
