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
  const { v } = f.update(0.9, 0);
  assert.equal(v, 0);
});
