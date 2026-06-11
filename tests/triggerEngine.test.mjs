// TriggerEngine behavior tests: synthetic striker trajectories in, hit events
// out. Aspect is 1 throughout so distances read naturally.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TriggerEngine, createKeyboardSource, velocityForSpeed } from '../js/triggerEngine.js';

const cfg = {
  strikeSpeedMin: 1,
  strikeSpeedMax: 5,
  velocityFloor: 0.25,
  exitHysteresis: 1.15,
  keyboardKickVelocity: 0.85,
};

const PAD = { id: 'p1', instrument: 'snare', variation: 'a', x: 0.5, y: 0.5, r: 0.1 };

function makeEngine() {
  const hits = [];
  const engine = new TriggerEngine({ config: cfg, onHit: (h) => hits.push(h) });
  return { engine, hits };
}

const striker = (x, y, vx = 0, vy = 0, id = 'right') => ({ id, x, y, vx, vy });

test('fires on fast entry from the left', () => {
  const { engine, hits } = makeEngine();
  engine.update([striker(0.30, 0.5, 3, 0)], [PAD], 1);
  engine.update([striker(0.48, 0.5, 3, 0)], [PAD], 1);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].padId, 'p1');
  assert.equal(hits[0].instrument, 'snare');
});

test('fires on fast entry from the right, top, and bottom', () => {
  for (const [p0, p1, v] of [
    [[0.70, 0.5], [0.52, 0.5], [-3, 0]],   // right
    [[0.5, 0.30], [0.5, 0.48], [0, 3]],    // top
    [[0.5, 0.70], [0.5, 0.52], [0, -3]],   // bottom
  ]) {
    const { engine, hits } = makeEngine();
    engine.update([striker(p0[0], p0[1], v[0], v[1])], [PAD], 1);
    engine.update([striker(p1[0], p1[1], v[0], v[1])], [PAD], 1);
    assert.equal(hits.length, 1, `entry from ${p0} should fire`);
  }
});

test('does not fire below the speed threshold (slow drift through a pad)', () => {
  const { engine, hits } = makeEngine();
  engine.update([striker(0.30, 0.5, 0.4, 0)], [PAD], 1);
  engine.update([striker(0.48, 0.5, 0.4, 0)], [PAD], 1);
  engine.update([striker(0.55, 0.5, 0.4, 0)], [PAD], 1);
  engine.update([striker(0.70, 0.5, 0.4, 0)], [PAD], 1);
  assert.equal(hits.length, 0);
});

test('does not re-fire while resting inside a pad', () => {
  const { engine, hits } = makeEngine();
  engine.update([striker(0.30, 0.5, 3, 0)], [PAD], 1);
  engine.update([striker(0.48, 0.5, 3, 0)], [PAD], 1);
  // Keep wiggling fast inside the pad.
  engine.update([striker(0.50, 0.5, 4, 0)], [PAD], 1);
  engine.update([striker(0.46, 0.52, 4, 2)], [PAD], 1);
  assert.equal(hits.length, 1);
});

test('re-arms only after exit, then fires again', () => {
  const { engine, hits } = makeEngine();
  engine.update([striker(0.30, 0.5, 3, 0)], [PAD], 1);
  engine.update([striker(0.48, 0.5, 3, 0)], [PAD], 1); // hit 1
  engine.update([striker(0.30, 0.5, -3, 0)], [PAD], 1); // exit
  engine.update([striker(0.48, 0.5, 3, 0)], [PAD], 1);  // hit 2
  assert.equal(hits.length, 2);
});

test('a silent (slow) entry still disarms until exit', () => {
  const { engine, hits } = makeEngine();
  engine.update([striker(0.35, 0.5, 0.4, 0)], [PAD], 1);
  engine.update([striker(0.45, 0.5, 0.4, 0)], [PAD], 1); // slow entry, silent
  engine.update([striker(0.50, 0.5, 4, 0)], [PAD], 1);   // speeds up inside
  assert.equal(hits.length, 0, 'accelerating inside the pad must not fire');
});

test('two strikers act independently', () => {
  const { engine, hits } = makeEngine();
  // Left hand rests inside the pad the whole time.
  engine.update([striker(0.5, 0.5, 0, 0, 'left')], [PAD], 1);
  engine.update([
    striker(0.5, 0.5, 0, 0, 'left'),
    striker(0.30, 0.5, 3, 0, 'right'),
  ], [PAD], 1);
  engine.update([
    striker(0.5, 0.5, 0, 0, 'left'),
    striker(0.48, 0.5, 3, 0, 'right'),
  ], [PAD], 1);
  assert.equal(hits.length, 1, 'right hand fires despite left resting inside');
  // Right exits and re-enters: fires again; left still silent.
  engine.update([
    striker(0.5, 0.5, 0, 0, 'left'),
    striker(0.30, 0.5, -3, 0, 'right'),
  ], [PAD], 1);
  engine.update([
    striker(0.5, 0.5, 0, 0, 'left'),
    striker(0.48, 0.5, 3, 0, 'right'),
  ], [PAD], 1);
  assert.equal(hits.length, 2);
});

test('one strike fires exactly one pad: the nearest entered (overlap case)', () => {
  const { engine, hits } = makeEngine();
  const padB = { ...PAD, id: 'p2', instrument: 'tom-high', x: 0.55 };
  // Endpoint (0.52, 0.5) is inside both pads; p1's center is nearer.
  engine.update([striker(0.30, 0.5, 3, 0)], [PAD, padB], 1);
  engine.update([striker(0.52, 0.5, 3, 0)], [PAD, padB], 1);
  assert.deepEqual(hits.map((h) => h.padId), ['p1']);
  // The silently-entered overlap pad is disarmed too: it can't fire until
  // after an exit, then it fires when the strike lands nearer to it.
  engine.update([striker(0.80, 0.5, 3, 0)], [PAD, padB], 1);  // exit both
  engine.update([striker(0.57, 0.5, -3, 0)], [PAD, padB], 1); // nearer p2
  assert.deepEqual(hits.map((h) => h.padId), ['p1', 'p2']);
});

test('a strike passing over one pad into another fires only where it lands', () => {
  const { engine, hits } = makeEngine();
  const padA = { id: 'pa', instrument: 'tom-mid', variation: 'a', x: 0.5, y: 0.3, r: 0.1 };
  const padB = { id: 'pb', instrument: 'tom-floor', variation: 'a', x: 0.5, y: 0.7, r: 0.1 };
  // Downward strike: starts above A, ends inside B — the segment fully
  // crosses A on the way. Only B (where the strike lands) may fire.
  engine.update([striker(0.5, 0.10, 0, 6)], [padA, padB], 1);
  engine.update([striker(0.5, 0.65, 0, 6)], [padA, padB], 1);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].padId, 'pb');
});

test('pure pass-through with no landing pad fires the crossed pad nearest the endpoint', () => {
  const { engine, hits } = makeEngine();
  const padA = { id: 'pa', instrument: 'tom-mid', variation: 'a', x: 0.5, y: 0.3, r: 0.1 };
  const padB = { id: 'pb', instrument: 'tom-floor', variation: 'a', x: 0.5, y: 0.6, r: 0.1 };
  // Crosses both pads, ends inside neither; B is nearer the endpoint.
  engine.update([striker(0.5, 0.10, 0, 8)], [padA, padB], 1);
  engine.update([striker(0.5, 0.85, 0, 8)], [padA, padB], 1);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].padId, 'pb');
});

test('edge jitter within the exit hysteresis band cannot re-arm and double-fire', () => {
  const { engine, hits } = makeEngine();
  engine.update([striker(0.30, 0.5, 3, 0)], [PAD], 1);
  engine.update([striker(0.48, 0.5, 3, 0)], [PAD], 1); // hit 1
  // Jitter just past the rim (0.108 > r=0.1, but < r*1.15=0.115)...
  engine.update([striker(0.608, 0.5, 3, 0)], [PAD], 1);
  // ...and fast back in: still "inside", must not fire again.
  engine.update([striker(0.52, 0.5, -3, 0)], [PAD], 1);
  assert.equal(hits.length, 1);
  // A real exit (beyond the hysteresis band) re-arms.
  engine.update([striker(0.65, 0.5, 3, 0)], [PAD], 1);
  engine.update([striker(0.52, 0.5, -3, 0)], [PAD], 1);
  assert.equal(hits.length, 2);
});

test('fast pass-through within a single frame still registers (low fps)', () => {
  const { engine, hits } = makeEngine();
  // One frame to the left of the pad, next frame fully past it on the right.
  engine.update([striker(0.20, 0.5, 8, 0)], [PAD], 1);
  engine.update([striker(0.80, 0.5, 8, 0)], [PAD], 1);
  assert.equal(hits.length, 1);
  // It exited within the same frame, so it is re-armed: another pass fires.
  engine.update([striker(0.20, 0.5, -8, 0)], [PAD], 1);
  assert.equal(hits.length, 2);
});

test('tracking acquired inside a pad does not fire and stays disarmed until exit', () => {
  const { engine, hits } = makeEngine();
  engine.update([striker(0.5, 0.5, 6, 0)], [PAD], 1); // first-ever sample, inside
  assert.equal(hits.length, 0);
  engine.update([striker(0.52, 0.5, 6, 0)], [PAD], 1); // still inside, fast
  assert.equal(hits.length, 0);
  engine.update([striker(0.70, 0.5, 6, 0)], [PAD], 1); // exit
  engine.update([striker(0.52, 0.5, -6, 0)], [PAD], 1); // re-entry fires
  assert.equal(hits.length, 1);
});

test('a vanished striker restarts fresh when it returns', () => {
  const { engine, hits } = makeEngine();
  engine.update([striker(0.30, 0.5, 3, 0)], [PAD], 1);
  engine.update([striker(0.48, 0.5, 3, 0)], [PAD], 1); // hit, now inside
  engine.update([], [PAD], 1);                          // hand lost
  engine.update([striker(0.48, 0.5, 3, 0)], [PAD], 1);  // reacquired inside: silent
  assert.equal(hits.length, 1);
});

test('velocity maps to the expected loudness range', () => {
  assert.equal(velocityForSpeed(0.5, cfg), 0, 'below threshold is silent');
  assert.equal(velocityForSpeed(1, cfg), 0.25, 'threshold hit lands on the floor');
  assert.equal(velocityForSpeed(5, cfg), 1, 'max speed is full velocity');
  assert.equal(velocityForSpeed(50, cfg), 1, 'clamped above max');
  const mid = velocityForSpeed(3, cfg);
  assert.ok(mid > 0.25 && mid < 1, 'mid speed is between floor and full');

  const { engine, hits } = makeEngine();
  engine.update([striker(0.30, 0.5, 3, 0)], [PAD], 1);
  engine.update([striker(0.48, 0.5, 3, 0)], [PAD], 1);
  assert.equal(hits[0].velocity, mid);
});

test('keyboard source triggers the kick pad', () => {
  const { engine, hits } = makeEngine();
  const kickPad = { id: 'pk', instrument: 'kick', variation: 'acoustic', x: 0.5, y: 0.8, r: 0.12 };
  engine.update([], [PAD, kickPad], 1);

  const listeners = [];
  const fakeTarget = { addEventListener: (type, fn) => listeners.push([type, fn]) };
  engine.connectSource(createKeyboardSource(fakeTarget, cfg));
  const fire = (ev) => listeners.forEach(([t, fn]) => t === 'keydown' && fn(ev));

  fire({ code: 'Space', repeat: false });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].padId, 'pk');
  assert.equal(hits[0].instrument, 'kick');
  assert.equal(hits[0].velocity, cfg.keyboardKickVelocity);

  fire({ code: 'Space', repeat: true }); // held key must not machine-gun
  fire({ code: 'KeyA', repeat: false });
  assert.equal(hits.length, 1);
});

test('keyboard kick still sounds with no kick pad in the layout', () => {
  const { engine, hits } = makeEngine();
  engine.update([], [PAD], 1);
  const listeners = [];
  engine.connectSource(createKeyboardSource(
    { addEventListener: (t, fn) => listeners.push(fn) }, cfg));
  listeners.forEach((fn) => fn({ code: 'Space', repeat: false }));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].padId, null);
  assert.equal(hits[0].instrument, 'kick');
});

test('muted engine emits nothing (Edit mode)', () => {
  const { engine, hits } = makeEngine();
  engine.setMuted(true);
  engine.update([striker(0.30, 0.5, 3, 0)], [PAD], 1);
  engine.update([striker(0.48, 0.5, 3, 0)], [PAD], 1);
  assert.equal(hits.length, 0);
});

test('aspect correction: same normalized motion is faster on a wide frame', () => {
  // vx = 0.6/s is sub-threshold at aspect 1 but supra-threshold at 16/9.
  const run = (aspect) => {
    const { engine, hits } = makeEngine();
    engine.update([striker(0.30, 0.5, 0.6, 0)], [PAD], aspect);
    engine.update([striker(0.46, 0.5, 0.6, 0)], [PAD], aspect);
    return hits.length;
  };
  assert.equal(run(1), 0);
  assert.equal(run(16 / 9), 1);
});
