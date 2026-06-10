// EditController behavior tests: synthetic pinch streams in, KitStore
// mutations out. Aspect is 1 so distances read naturally. The kit starts
// with a single known pad seeded through storage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditController } from '../js/editController.js';
import { KitStore, STORAGE_KEY } from '../js/kitStore.js';
import {
  dropdownItems, trayItems, DELETE_BUTTON, NEW_PAD_RADIUS,
} from '../js/editLayout.js';

const cfg = { padEdgeMargin: 0.03, padMinRadius: 0.01, padMaxRadius: 1 };

const stubManifest = {
  kick: { label: 'Kick', variations: [{ id: 'a' }, { id: 'b' }] },
  snare: { label: 'Snare', variations: [{ id: 'a' }] },
};

const SEED_PAD = { id: 'pad-1', instrument: 'kick', variation: 'a', x: 0.5, y: 0.5, r: 0.2 };

function setup() {
  const storage = (() => {
    const map = new Map([[STORAGE_KEY, JSON.stringify([SEED_PAD])]]);
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  })();
  const kitStore = new KitStore({ storage, config: cfg });
  const ec = new EditController({ kitStore, manifest: stubManifest, aspect: 1 });
  return { kitStore, ec };
}

const center = (rect) => [rect.x + rect.w / 2, rect.y + rect.h / 2];
const approx = (actual, expected, msg) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, msg ?? `${actual} ≈ ${expected}`);
const DD = dropdownItems(Object.keys(stubManifest));
const TRAY_KICK = trayItems(stubManifest.kick.variations.map((v) => v.id));
const DEL = center(DELETE_BUTTON);

test('pinching a dropdown instrument opens its variations tray', () => {
  const { ec } = setup();
  assert.equal(ec.getState().selectedInstrument, null);
  const [x, y] = center(DD[1].rect);
  ec.pinchStart('right', x, y);
  ec.pinchEnd('right', x, y);
  assert.equal(ec.getState().selectedInstrument, 'snare');
});

test('dragging a variation out of the tray creates a pad at the release point', () => {
  const { ec, kitStore } = setup();
  const [dx, dy] = center(DD[0].rect);
  ec.pinchStart('right', dx, dy); // open kick tray
  ec.pinchEnd('right', dx, dy);

  const [tx, ty] = center(TRAY_KICK[1].rect); // variation 'b'
  ec.pinchStart('right', tx, ty);
  ec.pinchMove('right', 0.45, 0.4);
  assert.deepEqual(
    { x: ec.getState().dragNew.x, y: ec.getState().dragNew.y },
    { x: 0.45, y: 0.4 });
  ec.pinchMove('right', 0.6, 0.7);
  ec.pinchEnd('right', 0.6, 0.7);

  const pads = kitStore.getPads();
  assert.equal(pads.length, 2);
  const added = pads[1];
  assert.equal(added.instrument, 'kick');
  assert.equal(added.variation, 'b');
  assert.equal(added.x, 0.6);
  assert.equal(added.y, 0.7);
  assert.equal(added.r, NEW_PAD_RADIUS);
  assert.equal(ec.getState().dragNew, null);
});

test('releasing a tray drag back over the chrome cancels it', () => {
  const { ec, kitStore } = setup();
  const [dx, dy] = center(DD[0].rect);
  ec.pinchStart('right', dx, dy);
  ec.pinchEnd('right', dx, dy);
  const [tx, ty] = center(TRAY_KICK[0].rect);
  ec.pinchStart('right', tx, ty);
  ec.pinchMove('right', dx, dy);
  ec.pinchEnd('right', dx, dy); // released over the dropdown
  assert.equal(kitStore.getPads().length, 1);

  ec.pinchStart('right', tx, ty);
  ec.pinchEnd('right', ...DEL); // released over the delete button
  assert.equal(kitStore.getPads().length, 1);
});

test('pinch-dragging a pad moves it and drops it in place on release', () => {
  const { ec, kitStore } = setup();
  ec.pinchStart('right', 0.45, 0.5); // grab off-center: offset (+0.05, 0)
  ec.pinchMove('right', 0.7, 0.8);
  let pad = kitStore.getPad('pad-1');
  assert.equal(pad.x, 0.75);
  assert.equal(pad.y, 0.8);
  ec.pinchEnd('right', 0.7, 0.8); // nowhere near delete
  pad = kitStore.getPad('pad-1');
  assert.equal(pad.x, 0.75);
  assert.equal(pad.y, 0.8);
  assert.equal(kitStore.getPads().length, 1, 'still exists');
});

test('two-hand pinch on the same pad resizes it with hand spread', () => {
  const { ec, kitStore } = setup();
  ec.pinchStart('left', 0.45, 0.5);  // hold
  ec.pinchStart('right', 0.55, 0.5); // second pinch on same pad -> resize
  assert.equal(ec.getState().resizingPadId, 'pad-1');
  ec.pinchMove('right', 0.65, 0.5);  // spread: 0.1 -> 0.2 apart
  approx(kitStore.getPad('pad-1').r, 0.4);
  ec.pinchMove('right', 0.5, 0.5);   // close: 0.05 apart
  approx(kitStore.getPad('pad-1').r, 0.1);
});

test('releasing one resize hand returns to a single-hand hold', () => {
  const { ec, kitStore } = setup();
  ec.pinchStart('left', 0.45, 0.5);
  ec.pinchStart('right', 0.55, 0.5);
  ec.pinchEnd('right', 0.55, 0.5);
  assert.equal(ec.getState().resizingPadId, null);
  assert.deepEqual(ec.getState().heldPadIds, ['pad-1']);
  // The remaining hand can keep moving the pad.
  ec.pinchMove('left', 0.35, 0.6);
  const pad = kitStore.getPad('pad-1');
  approx(pad.x, 0.4); // grab offset from pad center preserved
  approx(pad.y, 0.6);
});

test('delete button is active only while a pad is held', () => {
  const { ec } = setup();
  assert.equal(ec.getState().deleteActive, false);
  ec.pinchStart('right', 0.5, 0.5);
  assert.equal(ec.getState().deleteActive, true);
  assert.equal(ec.getState().deleteHover, false);
  ec.pinchMove('right', ...DEL);
  assert.equal(ec.getState().deleteHover, true);
  ec.pinchEnd('right', ...DEL);
  assert.equal(ec.getState().deleteActive, false);
});

test('dragging a pad onto the delete button removes it', () => {
  const { ec, kitStore } = setup();
  ec.pinchStart('right', 0.5, 0.5);
  ec.pinchMove('right', ...DEL);
  ec.pinchEnd('right', ...DEL);
  assert.equal(kitStore.getPads().length, 0);
});

test('releasing outside the delete button keeps the pad', () => {
  const { ec, kitStore } = setup();
  ec.pinchStart('right', 0.5, 0.5);
  ec.pinchMove('right', ...DEL);          // hover delete...
  ec.pinchMove('right', 0.6, 0.6);        // ...then move away
  ec.pinchEnd('right', 0.6, 0.6);
  assert.equal(kitStore.getPads().length, 1);
  assert.equal(kitStore.getPad('pad-1').x, 0.6);
});

test('a lost hand abandons its gesture without side effects', () => {
  const { ec, kitStore } = setup();
  // Lost mid tray-drag: nothing is created.
  const [dx, dy] = center(DD[0].rect);
  ec.pinchStart('right', dx, dy);
  ec.pinchEnd('right', dx, dy);
  const [tx, ty] = center(TRAY_KICK[0].rect);
  ec.pinchStart('right', tx, ty);
  ec.handLost('right');
  assert.equal(ec.getState().dragNew, null);
  assert.equal(kitStore.getPads().length, 1);

  // Lost mid move: pad stays wherever it was.
  ec.pinchStart('left', 0.5, 0.5);
  ec.pinchMove('left', 0.3, 0.3);
  ec.handLost('left');
  assert.equal(ec.getState().heldPadIds.length, 0);
  assert.equal(kitStore.getPad('pad-1').x, 0.3);
});

test('cancelAll drops in-flight gestures (leaving Edit mode)', () => {
  const { ec } = setup();
  ec.pinchStart('right', 0.5, 0.5);
  assert.equal(ec.getState().deleteActive, true);
  ec.cancelAll();
  assert.equal(ec.getState().deleteActive, false);
  assert.equal(ec.getState().heldPadIds.length, 0);
});
