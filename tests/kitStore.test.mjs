// KitStore behavior tests: mutations, persistence round-trips, and fallback
// to the default kit on missing/corrupt storage. Storage is a fake.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitStore, STORAGE_KEY } from '../js/kitStore.js';
import { defaultKit } from '../js/defaultKit.js';

const cfg = { padEdgeMargin: 0.03, padMinRadius: 0.04, padMaxRadius: 0.28 };

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    dump: () => Object.fromEntries(map),
  };
}

test('empty storage yields the default 9-pad kit', () => {
  const store = new KitStore({ storage: fakeStorage(), config: cfg });
  assert.equal(store.getPads().length, 9);
  const instruments = store.getPads().map((p) => p.instrument);
  for (const wanted of ['kick', 'snare', 'hihat-closed', 'hihat-open',
    'tom-high', 'tom-mid', 'tom-floor', 'crash', 'ride']) {
    assert.ok(instruments.includes(wanted), wanted + ' present in default kit');
  }
});

test('add / move / resize / remove round-trips', () => {
  const store = new KitStore({ storage: fakeStorage(), config: cfg });
  const pad = store.addPad({ instrument: 'cowbell', variation: 'linn', x: 0.6, y: 0.4, r: 0.1 });
  assert.equal(store.getPad(pad.id).instrument, 'cowbell');

  store.movePad(pad.id, 0.25, 0.75);
  assert.equal(store.getPad(pad.id).x, 0.25);
  assert.equal(store.getPad(pad.id).y, 0.75);

  store.resizePad(pad.id, 0.2);
  assert.equal(store.getPad(pad.id).r, 0.2);

  store.removePad(pad.id);
  assert.equal(store.getPad(pad.id), null);
});

test('every mutation persists and a new store restores the same kit', () => {
  const storage = fakeStorage();
  const a = new KitStore({ storage, config: cfg });
  const pad = a.addPad({ instrument: 'clap', variation: 'studio', x: 0.7, y: 0.3, r: 0.09 });
  a.movePad('pad-snare', 0.4, 0.7);
  a.removePad('pad-ride');

  const b = new KitStore({ storage, config: cfg });
  assert.deepEqual(b.getPads(), a.getPads());
  assert.equal(b.getPad(pad.id).instrument, 'clap');
  assert.equal(b.getPad('pad-ride'), null);
});

test('corrupt JSON falls back to the default kit', () => {
  const storage = fakeStorage({ [STORAGE_KEY]: '{not json!!' });
  const store = new KitStore({ storage, config: cfg });
  assert.deepEqual(store.getPads(), defaultKit());
});

test('valid JSON with the wrong shape falls back to the default kit', () => {
  for (const bad of ['42', '{"pads":[]}', '[{"id":"x"}]',
    '[{"id":"x","instrument":"kick","variation":"a","x":0.5,"y":"oops","r":0.1}]',
    '[{"id":"x","instrument":"kick","variation":"a","x":0.5,"y":0.5,"r":0}]']) {
    const store = new KitStore({ storage: fakeStorage({ [STORAGE_KEY]: bad }), config: cfg });
    assert.deepEqual(store.getPads(), defaultKit(), 'fallback for: ' + bad);
  }
});

test('a throwing storage neither crashes nor loses the session kit', () => {
  const store = new KitStore({
    storage: {
      getItem() { throw new Error('storage unavailable'); },
      setItem() { throw new Error('quota exceeded'); },
    },
    config: cfg,
  });
  assert.equal(store.getPads().length, 9);
  const pad = store.addPad({ instrument: 'kick', variation: 'punchy', x: 0.5, y: 0.5, r: 0.1 });
  assert.equal(store.getPad(pad.id).instrument, 'kick'); // in-memory still works
});

test('positions are clamped so pads cannot be lost off-screen', () => {
  const store = new KitStore({ storage: fakeStorage(), config: cfg });
  const pad = store.addPad({ instrument: 'ride', variation: 'linn', x: 5, y: -2, r: 0.1 });
  assert.equal(pad.x, 1 - cfg.padEdgeMargin);
  assert.equal(pad.y, cfg.padEdgeMargin);
  store.movePad(pad.id, -0.5, 1.7);
  assert.equal(store.getPad(pad.id).x, cfg.padEdgeMargin);
  assert.equal(store.getPad(pad.id).y, 1 - cfg.padEdgeMargin);
});

test('radius is clamped to sane bounds', () => {
  const store = new KitStore({ storage: fakeStorage(), config: cfg });
  const pad = store.addPad({ instrument: 'crash', variation: 'linn', x: 0.5, y: 0.5, r: 9 });
  assert.equal(pad.r, cfg.padMaxRadius);
  store.resizePad(pad.id, 0.000001);
  assert.equal(store.getPad(pad.id).r, cfg.padMinRadius);
});

test('multiple pads of the same instrument coexist', () => {
  const store = new KitStore({ storage: fakeStorage(), config: cfg });
  store.addPad({ instrument: 'crash', variation: 'linn', x: 0.2, y: 0.2, r: 0.1 });
  store.addPad({ instrument: 'crash', variation: 'vintage', x: 0.8, y: 0.2, r: 0.1 });
  const crashes = store.getPads().filter((p) => p.instrument === 'crash');
  assert.equal(crashes.length, 3); // default kit already has one
  assert.equal(new Set(crashes.map((p) => p.id)).size, 3);
});

test('coordinates are stored normalized (resolution-independent)', () => {
  const storage = fakeStorage();
  const store = new KitStore({ storage, config: cfg });
  store.movePad('pad-kick', 0.5, 0.9);
  const saved = JSON.parse(storage.dump()[STORAGE_KEY]);
  for (const p of saved) {
    assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1,
      'no pixel coordinates in storage');
    assert.ok(p.r > 0 && p.r <= 1);
  }
});
