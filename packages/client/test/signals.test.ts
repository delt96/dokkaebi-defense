import { expect, test } from 'vitest';
import { NO_SIDES } from '../src/ui/windows';
import {
  BANNER_LATE_MS, END_SCENE_MS, END_SCENE_SUB, EndScene, OneShots, SLOT_RANK, TopSlot, coinSpot, endSceneText, loopOwner, refusalPos, refusalSpot,
  slotSpan, type EndKind, type SlotItem,
} from '../src/ui/signals';

const note = (text: string, ms = 1500): SlotItem => ({ kind: 'note', text, ms });
const birth = (text: string): SlotItem => ({ kind: 'birth', text, ms: 2000 });

test('ranks: countdown, birth, banner, fallen, note', () => {
  expect(SLOT_RANK).toEqual({ countdown: 1, birth: 2, banner: 3, fallen: 4, note: 5 });
});

test('one at a time; the waiting one with the best rank goes next', () => {
  const s = new TopSlot();
  s.push(note('a'), 0);
  expect(s.current(0, false)?.item?.text).toBe('a');
  s.push({ kind: 'fallen', text: 'f', ms: 3000 }, 10); s.push({ kind: 'banner', text: 'b', ms: 1800 }, 20);
  expect(s.current(1500, false)).toMatchObject({ kind: 'banner', until: 1500 + BANNER_LATE_MS });   // waited, so short
  expect(s.current(2700, false)?.kind).toBe('fallen');
});

test('a banner that did not wait keeps its full length even if the slot is read a little later', () => {
  const s = new TopSlot();
  s.push({ kind: 'banner', text: 'b', ms: 1800 }, 0);
  expect(s.current(40, false)).toMatchObject({ kind: 'banner', start: 40, until: 40 + 1800 });
});

test('a note that waited over 3 s is dropped, a fallen notice never is', () => {
  const s = new TopSlot();
  s.push({ kind: 'fallen', text: 'f', ms: 3000 }, 0); s.push(note('late'), 0);
  expect(s.current(0, false)?.kind).toBe('fallen');
  expect(s.current(3001, false)).toBeNull();       // "over 3 s": 3000 exactly still shows
});

test('a note that waited exactly 3 s still shows', () => {
  const s = new TopSlot();
  s.push({ kind: 'fallen', text: 'f', ms: 3000 }, 0); s.push(note('edge'), 0);
  s.current(0, false);
  expect(s.current(3000, false)?.item?.text).toBe('edge');
});

test('the countdown holds the slot and gives the banner back afterwards', () => {
  const s = new TopSlot();
  s.push({ kind: 'banner', text: 'b', ms: 1800 }, 0);
  s.current(0, false);
  expect(s.current(500, true)?.kind).toBe('countdown');
  s.push(note('n'), 600);
  expect(s.current(9000, false)?.kind).toBe('banner');      // the note waited over 3 s and is gone
});

test('a banner given back by the countdown shows its first length again', () => {
  const s = new TopSlot();
  s.push({ kind: 'banner', text: 'b', ms: 1800 }, 0);
  s.current(0, false);
  s.current(500, true);
  expect(s.current(2000, false)).toMatchObject({ kind: 'banner', start: 2000, until: 2000 + 1800 });
});

test('a note pushed off by the countdown is dropped', () => {
  const s = new TopSlot();
  s.push(note('n'), 0);
  s.current(0, false);
  s.current(100, true);
  expect(s.current(200, false)).toBeNull();
});

test('nothing else shows while the countdown holds the slot', () => {
  const s = new TopSlot();
  s.push({ kind: 'fallen', text: 'f', ms: 3000 }, 0);
  expect(s.current(0, true)).toMatchObject({ kind: 'countdown', item: null });
  expect(s.current(5000, true)?.kind).toBe('countdown');
  expect(s.current(5100, false)?.item?.text).toBe('f');
});

test('births wait four deep at most', () => {
  const s = new TopSlot();
  s.push(birth('b1'), 0);
  expect(s.current(0, false)?.item?.text).toBe('b1');
  for (const t of ['b2', 'b3', 'b4', 'b5', 'b6']) s.push(birth(t), 0);
  const seen: (string | undefined)[] = [];
  for (let now = 2000; now <= 10000; now += 2000) seen.push(s.current(now, false)?.item?.text);
  expect(seen).toEqual(['b3', 'b4', 'b5', 'b6', undefined]);
});

test('same rank goes first come first served', () => {
  const s = new TopSlot();
  s.push({ kind: 'fallen', text: 'f1', ms: 3000 }, 0); s.push({ kind: 'fallen', text: 'f2', ms: 3000 }, 0);
  expect(s.current(0, false)?.item?.text).toBe('f1');
  expect(s.current(3000, false)?.item?.text).toBe('f2');
});

test('clear empties the slot and the queue', () => {
  const s = new TopSlot();
  s.push(note('a'), 0); s.push(note('b'), 0);
  s.current(0, false);
  s.clear();
  expect(s.current(1, false)).toBeNull();
});

test('slotSpan', () => { expect([slotSpan(false), slotSpan(true)]).toEqual([{ x: 128, w: 400 }, { x: 200, w: 254 }]); });

test('refusal spot: the button, else the same button in the window, else the slot', () => {
  const vis = (...on: string[]) => (sel: string) => on.includes(sel);
  expect(refusalSpot({ type: 'summon' }, vis('#right [data-action="summon"]'))).toEqual({ at: 'button', selector: '#right [data-action="summon"]' });
  expect(refusalSpot({ type: 'summon' }, vis('#win-right .win-summon'))).toEqual({ at: 'win', side: 'right', selector: '#win-right .win-summon' });
  expect(refusalSpot({ type: 'combine' }, vis())).toEqual({ at: 'slot' });
  expect(refusalSpot({ type: 'upgrade', arg: 'physical' }, vis('#win-right [data-action="upgrade"][data-arg="physical"]')).at).toBe('win');
});

test('refusal spot for the other buttons', () => {
  const vis = (...on: string[]) => (sel: string) => on.includes(sel);
  expect(refusalSpot({ type: 'convertToken' }, vis('#right [data-action="convert"]'))).toEqual({ at: 'button', selector: '#right [data-action="convert"]' });
  expect(refusalSpot({ type: 'convertToken' }, vis())).toEqual({ at: 'slot' });
  expect(refusalSpot({ type: 'sell' }, vis('#bottom [data-action="sell"]'))).toEqual({ at: 'button', selector: '#bottom [data-action="sell"]' });
  expect(refusalSpot({ type: 'sell' }, vis('#win-left [data-action="sell"]'))).toEqual({ at: 'win', side: 'left', selector: '#win-left [data-action="sell"]' });
  expect(refusalSpot({ type: 'upgrade', arg: 'physical' }, vis())).toEqual({ at: 'slot' });
  expect(refusalSpot({ type: 'summon' }, vis('#right [data-action="summon"]', '#win-right .win-summon')).at).toBe('button');
});

test('refusalPos sits 20 px over the button and stays inside', () => {
  expect(refusalPos({ left: 560, top: 100, width: 60 }, { w: 120 }, 640)).toEqual({ left: 518, top: 80 });
  expect(refusalPos({ left: 0, top: 100, width: 40 }, { w: 120 }, 640).left).toBe(2);
  expect(refusalPos({ left: 200, top: 50, width: 80 }, { w: 120 }, 640)).toEqual({ left: 180, top: 30 });
});

test('coinSpot', () => {
  expect(coinSpot('inside', { left: null, right: 'market', last: 'right' })).toBe('win');
  expect(coinSpot('inside', { left: null, right: 'quests', last: 'right' })).toBe('slot');
  expect(coinSpot('outside', { left: null, right: 'quests', last: 'right' })).toBe('right');
  expect(coinSpot('inside', NO_SIDES)).toBe('right');
});

test('one looping motion on the board, by rank', () => {
  expect(loopOwner({ countdownPulse: true, over: true, danger: true })).toBe('countdown');
  expect(loopOwner({ countdownPulse: false, over: true, danger: false })).toBe('jangseung');
  expect(loopOwner({ countdownPulse: false, over: false, danger: true })).toBe('edge');
  expect(loopOwner({ countdownPulse: false, over: false, danger: false })).toBe('triangle');
});

test('two one-shot motions at once at most', () => {
  const o = new OneShots();
  expect([o.begin(0, 1000), o.begin(10, 1000), o.begin(20, 1000), o.begin(1001, 1000)]).toEqual([true, true, false, true]);
});

test('end scene texts and timing', () => {
  expect(endSceneText('gate', '첫째')).toBe('관문 실패 · 역신(첫째)을 막지 못했습니다');
  expect(endSceneText('gate')).toBe('관문 실패 · 역신을 막지 못했습니다');
  expect(['wipe', 'clear', 'soloDefeat', 'soloClear'].map(k => endSceneText(k as EndKind)))
    .toEqual(['모두 쓰러졌습니다', '고개를 지켜 냈습니다', '장승이 쓰러졌습니다', '고개를 지켜 냈습니다']);
  expect([END_SCENE_MS, END_SCENE_SUB]).toEqual([1500, '곧 결과 화면 · 누르면 바로']);
  const e = new EndScene();
  expect([e.kind, e.active(0)]).toEqual([null, false]);
  e.start('wipe', 'x', 0);
  expect([e.active(1499), e.active(1500), e.kind]).toEqual([true, false, 'wipe']);
  e.start('wipe', 'x', 0); e.skip(); expect(e.active(1)).toBe(false);
});
