/** Saving the finished lane as a picture: the lane copy with one caption line under it. */

/** The lane canvas is small pixel art; the saved picture is this many times larger, with hard pixel edges. */
const SCALE = 3;
const STRIP = 28 * SCALE;

/** "2026-11-26" in the player's own time zone. */
export function captureDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The lane with `caption` on a dark strip under it. */
export function withCaption(lane: HTMLCanvasElement, caption: string): HTMLCanvasElement {
  const w = lane.width * SCALE;
  const h = lane.height * SCALE;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h + STRIP;
  const ctx = out.getContext('2d');
  if (!ctx) return lane;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0d0a14';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(lane, 0, 0, w, h);
  ctx.fillStyle = '#ffe08a';
  ctx.font = `${13 * SCALE}px 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(caption, w / 2, h + STRIP / 2, w - 16 * SCALE);
  return out;
}

/**
 * Hands the picture to the phone's share sheet (save to photos, messengers), or downloads it on a desktop
 * or where sharing files is not offered. 'cancelled' when the player closed the share sheet.
 */
export async function savePicture(canvas: HTMLCanvasElement, fileName: string): Promise<'shared' | 'saved' | 'cancelled' | 'failed'> {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return 'failed';
  const file = new File([blob], fileName, { type: 'image/png' });
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // any other refusal falls through to a plain download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}

/** Takes the lane picture with `caption` and saves it; the button shows progress and the outcome. */
export async function captureLane(
  capture: () => Promise<HTMLCanvasElement | null>, caption: string, fileName: string, button?: HTMLButtonElement | null,
): Promise<void> {
  const label = button?.textContent ?? '';
  if (button) { button.disabled = true; button.textContent = '찍는 중…'; }
  let outcome: Awaited<ReturnType<typeof savePicture>> = 'failed';
  try {
    const lane = await capture();
    if (lane) outcome = await savePicture(withCaption(lane, caption), fileName);
  } catch {
    outcome = 'failed';
  }
  if (!button) return;
  button.textContent = outcome === 'failed' ? '저장 실패' : outcome === 'cancelled' ? label : '저장함';
  setTimeout(() => { button.disabled = false; button.textContent = label; }, outcome === 'cancelled' ? 0 : 1500);
}
