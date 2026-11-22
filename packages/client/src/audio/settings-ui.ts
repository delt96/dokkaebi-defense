import { gameAudio } from './engine';
import { isTrackId, MUSIC_AUTHOR, MUSIC_LICENSE, TRACKS } from './music';

export function musicCreditsHtml(): string {
  const links = TRACKS.map(({ id, name, source }) => `<li><a href="${source}" target="_blank" rel="noopener noreferrer">국악 BGM #${id}</a> · ${name}</li>`).join('');
  return `<details class="music-credits"><summary>음악 출처</summary>
    <p>${MUSIC_AUTHOR} · 공유마당 · <a href="${MUSIC_LICENSE}" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></p>
    <ul>${links}</ul></details>`;
}

export function audioSettingsHtml(): string {
  const options = TRACKS.map(({ id, name }) => `<option value="${id}">${name}</option>`).join('');
  const track = (key: 'normal' | 'boss', label: string) => `<div class="audio-row"><label for="audio-${key}">${label}</label>
    <select id="audio-${key}">${options}</select><button type="button" id="preview-${key}" aria-label="${label} 듣기">듣기</button></div>`;
  const slider = (key: 'effects' | 'music', label: string) => `<div class="audio-row"><label for="audio-${key}">${label}</label>
    <input id="audio-${key}" type="range" min="0" max="100" step="1"><output for="audio-${key}"></output></div>`;
  return `<div class="audio-settings">
    ${slider('effects', '효과음 크기')}${slider('music', '배경음 크기')}
    <label class="audio-row audio-mute" for="audio-muted">소리 끄기 <input type="checkbox" id="audio-muted"></label>
    ${track('normal', '평소 음악')}${track('boss', '보스 음악')}
    ${musicCreditsHtml()}</div>`;
}

const wired = new WeakSet<HTMLElement>();

/** Initialize native controls after the settings HTML is mounted. */
export function wireAudioSettings(modal: HTMLElement): void {
  const panel = modal.querySelector<HTMLElement>('.audio-settings');
  if (!panel || wired.has(panel)) return;
  wired.add(panel);
  for (const key of ['effects', 'music'] as const) {
    const id = `audio-${key}`;
    const input = panel.querySelector<HTMLInputElement>(`#${id}`)!;
    const output = panel.querySelector<HTMLOutputElement>(`output[for="${id}"]`)!;
    input.value = output.value = String(gameAudio.settings[key]);
    input.addEventListener('input', () => {
      output.value = input.value;
      gameAudio.configure({ [key]: Number(input.value) });
    });
  }
  const mute = panel.querySelector<HTMLInputElement>('#audio-muted')!;
  mute.checked = gameAudio.settings.muted;
  mute.addEventListener('change', () => gameAudio.configure({ muted: mute.checked }));
  for (const key of ['normal', 'boss'] as const) {
    const select = panel.querySelector<HTMLSelectElement>(`#audio-${key}`)!;
    select.value = String(gameAudio.settings[key]);
    const preview = () => {
      const id = Number(select.value);
      if (isTrackId(id)) gameAudio.previewTrack(id);
    };
    select.addEventListener('change', () => {
      const id = Number(select.value);
      if (!isTrackId(id)) return;
      // Set the preview before the preference so a single change requests a single track.
      preview();
      gameAudio.configure({ [key]: id });
    });
    panel.querySelector(`#preview-${key}`)!.addEventListener('click', preview);
  }
}
