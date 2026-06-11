// EditController behavior tests: synthetic mouse streams in, KitStore
// mutations out. Aspect is 1 so distances read naturally. The kit starts
// with a single known pad seeded through storage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditController } from '../js/editController.js';
import { KitStore, STORAGE_KEY } from '../js/kitStore.js';
import {
  dropdownItems, trayItems, DELETE_BUTTON, NEW_PAD_RADIUS,
} from '../js/editLayout.js';

const cfg = {
  padEdgeMargin: 0.03, padMinRadius: 0.01, padMaxRadius: 1,
  wheelResizeFactor: 1.5,
};

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
  const ec = new EditController({ kitStore, manifest: stubManifest, config: cfg, aspect: 1 });
  return { kitStore, ec };
}

const center = (rect) => [rect.x + rect.w / 2, rect.y + rect.h / 2];
const approx = (actual, expected, msg) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, msg ?? `${actual} ≈ ${expected}`);
const DD = dropdownItems(Object.keys(stubManifest));
const TRAY_KICK = trayItems(stubManifest.kick.variations.map((v) => v.id));
const DEL = center(DELETE_BUTTON);

function click(ec, x, y) {
  ec.mouseDown(x, y);
  ec.mouseUp(x, y);
}

test('clicking a dropdown instrument opens its tray; clicking again closes it', () => {
  const { ec } = setup();
  assert.equal(ec.getState().selectedInstrument, null);
  click(ec, ...center(DD[1].rect));
  assert.equal(ec.getState().selectedInstrument, 'snare');
  click(ec, ...center(DD[0].rect)); // switch
  assert.equal(ec.getState().selectedInstrument, 'kick');
  click(ec, ...center(DD[0].rect)); // toggle off
  assert.equal(ec.getState().selectedInstrument, null);
});

test('dragging a variation out of the tray creates a pad at the release point', () => {
  const { ec, kitStore } = setup();
  click(ec, ...center(DD[0].rect)); // open kick tray

  const [tx, ty] = center(TRAY_KICK[1].rect); // variation 'b'
  ec.mouseDown(tx, ty);
  ec.mouseMove(0.45, 0.4);
  assert.deepEqual(
    { x: ec.getState().dragNew.x, y: ec.getState().dragNew.y },
    { x: 0.45, y: 0.4 });
  ec.mouseMove(0.6, 0.7);
  ec.mouseUp(0.6, 0.7);

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
  click(ec, dx, dy);
  const [tx, ty] = center(TRAY_KICK[0].rect);

  ec.mouseDown(tx, ty);
  ec.mouseUp(dx, dy); // released over the dropdown
  assert.equal(kitStore.getPads().length, 1);

  ec.mouseDown(tx, ty);
  ec.mouseUp(...DEL); // released over the delete button
  assert.equal(kitStore.getPads().length, 1);
});

test('dragging a pad moves it and drops it in place on release', () => {
  const { ec, kitStore } = setup();
  ec.mouseDown(0.45, 0.5); // grab off-center: offset (+0.05, 0)
  ec.mouseMove(0.7, 0.8);
  let pad = kitStore.getPad('pad-1');
  approx(pad.x, 0.75);
  approx(pad.y, 0.8);
  ec.mouseUp(0.7, 0.8); // nowhere near delete
  pad = kitStore.getPad('pad-1');
  approx(pad.x, 0.75);
  approx(pad.y, 0.8);
  assert.equal(kitStore.getPads().length, 1, 'still exists');
});

test('scroll wheel over a pad resizes it', () => {
  const { ec, kitStore } = setup();
  ec.wheel(0.5, 0.5, -100); // scroll up = grow
  approx(kitStore.getPad('pad-1').r, 0.3);
  ec.wheel(0.5, 0.5, 100);  // scroll down = shrink
  approx(kitStore.getPad('pad-1').r, 0.2);
});

test('scroll wheel away from any pad does nothing', () => {
  const { ec, kitStore } = setup();
  ec.wheel(0.9, 0.9, -100);
  approx(kitStore.getPad('pad-1').r, 0.2);
});

test('scroll wheel while dragging resizes the held pad', () => {
  const { ec, kitStore } = setup();
  ec.mouseDown(0.5, 0.5);
  ec.mouseMove(0.6, 0.6);
  ec.wheel(0.6, 0.6, -100);
  approx(kitStore.getPad('pad-1').r, 0.3);
  ec.mouseUp(0.6, 0.6);
  assert.equal(kitStore.getPads().length, 1);
});

test('delete button is active only while a pad is held', () => {
  const { ec } = setup();
  assert.equal(ec.getState().deleteActive, false);
  ec.mouseDown(0.5, 0.5);
  assert.equal(ec.getState().deleteActive, true);
  assert.equal(ec.getState().deleteHover, false);
  ec.mouseMove(...DEL);
  assert.equal(ec.getState().deleteHover, true);
  ec.mouseUp(...DEL);
  assert.equal(ec.getState().deleteActive, false);
});

test('dragging a pad onto the delete button removes it', () => {
  const { ec, kitStore } = setup();
  ec.mouseDown(0.5, 0.5);
  ec.mouseMove(...DEL);
  ec.mouseUp(...DEL);
  assert.equal(kitStore.getPads().length, 0);
});

test('releasing outside the delete button keeps the pad', () => {
  const { ec, kitStore } = setup();
  ec.mouseDown(0.5, 0.5);
  ec.mouseMove(...DEL);          // hover delete...
  ec.mouseMove(0.6, 0.6);        // ...then move away
  ec.mouseUp(0.6, 0.6);
  assert.equal(kitStore.getPads().length, 1);
  assert.equal(kitStore.getPad('pad-1').x, 0.6);
});

test('hover state reflects the pad under the cursor', () => {
  const { ec } = setup();
  ec.mouseMove(0.5, 0.5);
  assert.equal(ec.getState().hoverPadId, 'pad-1');
  ec.mouseMove(0.9, 0.9);
  assert.equal(ec.getState().hoverPadId, null);
  // No hover highlight mid-drag (the held pad already highlights).
  ec.mouseDown(0.5, 0.5);
  assert.equal(ec.getState().hoverPadId, null);
  assert.equal(ec.getState().heldPadId, 'pad-1');
});

test('cancelAll drops in-flight drags (leaving Edit mode)', () => {
  const { ec, kitStore } = setup();
  // Mid pad-drag.
  ec.mouseDown(0.5, 0.5);
  assert.equal(ec.getState().deleteActive, true);
  ec.cancelAll();
  assert.equal(ec.getState().deleteActive, false);
  ec.mouseUp(...DEL); // stale release must not delete anything
  assert.equal(kitStore.getPads().length, 1);

  // Mid tray-drag: nothing is created on a stale release.
  click(ec, ...center(DD[0].rect));
  ec.mouseDown(...center(TRAY_KICK[0].rect));
  ec.cancelAll();
  ec.mouseUp(0.6, 0.6);
  assert.equal(kitStore.getPads().length, 1);
});
