// AxisFilter behavior tests: the fingertip filter must report strike-like
// velocities almost immediately (this is what gates every drum hit), while
// still damping jitter at rest. Simulates a 30fps camera (dt = 1/30).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AxisFilter } from '../js/handTracker.js';
import { config } from '../js/config.js';

const DT = 1 / 30;

function run(filter, positions) {
  let out;
  for (const p of positions) out = filter.update(p, DT);
  return out;
}

test('a fast strike reaches near-true velocity within two frames', () => {
  // Finger moving at a constant 3 units/sec (a moderate strike).
  const f = new AxisFilter(config);
  f.update(0.5, 0);                       // first sample (tracking acquired)
  f.update(0.5 + 3 * DT, DT);             // frame 1 of motion
  const { v } = f.update(0.5 + 6 * DT, DT); // frame 2 of motion
  assert.ok(v > 3 * 0.55,
    `velocity after 2 frames must exceed 55% of true speed, got ${(v / 3 * 100).toFixed(0)}%`);
});

test('sustained motion converges close to true velocity', () => {
  const f = new AxisFilter(config);
  const positions = Array.from({ length: 7 }, (_, i) => 0.2 + 3 * DT * i);
  const { v } = run(f, positions);
  assert.ok(v > 3 * 0.85 && v < 3 * 1.15,
    `velocity after 6 frames should be within 15% of true, got ${v.toFixed(2)}`);
});

test('strike velocity clears the trigger threshold (regression: silent kit)', () => {
  // End-to-end sanity for the bug where over-smoothed velocity never crossed
  // strikeSpeedMin and the whole kit went silent: a realistic accelerating
  // strike (~0.45 frame-widths in ~130ms) must register above threshold.
  const f = new AxisFilter(config);
  const positions = [0.5, 0.52, 0.58, 0.70, 0.88]; // accelerating downswing
  const { v } = run(f, positions);
  assert.ok(v >= config.strikeSpeedMin,
    `strike speed ${v.toFixed(2)} must reach strikeSpeedMin ${config.strikeSpeedMin}`);
});

test('hand at rest with sensor jitter stays calm', () => {
  const f = new AxisFilter(config);
  // ±2mm-scale jitter around a fixed point.
  const noise = [0.5, 0.503, 0.498, 0.501, 0.499, 0.502, 0.5, 0.497, 0.501, 0.5];
  let maxV = 0, last;
  for (const p of noise) {
    last = f.update(p, DT);
    maxV = Math.max(maxV, Math.abs(last.v));
  }
  assert.ok(maxV < config.strikeSpeedMin,
    `resting jitter must never look like a strike (peak ${maxV.toFixed(2)})`);
  assert.ok(Math.abs(last.x - 0.5) < 0.01, 'position stays near the true point');
});

test('first sample after tracking acquisition reports zero velocity', () => {
  const f = new AxisFilter(config);
  const { v, vInst } = f.update(0.9, 0);
  assert.equal(v, 0);
  assert.equal(vInst, 0);
});

test('low fps (15): a strike completed in a single frame still reads fast', () => {
  // At 15fps one camera frame can contain the whole strike. The raw
  // per-frame velocity (vInst) must carry it, and the time-based smoothing
  // must converge in wall-clock time, not frame count.
  const dt = 1 / 15;
  const f = new AxisFilter(config);
  f.update(0.5, 0);
  const { v, vInst } = f.update(0.5 + 3 * dt, dt); // 3 units/sec jump
  assert.ok(vInst >= config.strikeSpeedMin,
    `single-frame vInst ${vInst.toFixed(2)} must clear strikeSpeedMin`);
  assert.ok(Math.max(v, vInst) > 3 * 0.5,
    `trigger speed must reach half of true speed in one slow frame, got ${Math.max(v, vInst).toFixed(2)}`);
});

test('velocity smoothing is framerate-independent (same wall-clock convergence)', () => {
  // 100ms of constant 3 u/s motion sampled at 30fps vs 15fps must land on
  // similar smoothed velocities.
  const sample = (fps) => {
    const dt = 1 / fps, f = new AxisFilter(config);
    f.update(0, 0);
    let out;
    for (let i = 1; i <= Math.round(0.1 * fps); i++) out = f.update(3 * dt * i, dt);
    return out.v;
  };
  const v30 = sample(30), v15 = sample(15);
  assert.ok(Math.abs(v30 - v15) < 0.8,
    `30fps (${v30.toFixed(2)}) and 15fps (${v15.toFixed(2)}) should converge similarly`);
});

test('reset() forgets history so reacquisition cannot fake a strike', () => {
  const f = new AxisFilter(config);
  f.update(0.1, 0);
  f.update(0.1 + 3 / 30, 1 / 30); // moving fast
  f.reset();
  const { v, vInst } = f.update(0.9, 0); // reappears far away
  assert.equal(v, 0);
  assert.equal(vInst, 0);
});
