// App shell: wires the modules together, owns the Play/Edit mode toggle,
// the start/permission flow, and the error/empty/no-hands states.
// Playing is hands-in-the-air; editing is plain mouse.

import { config } from './config.js';
import { manifest } from './manifest.js';
import { TriggerEngine, createKeyboardSource } from './triggerEngine.js';
import { AudioEngine } from './audioEngine.js';
import { KitStore } from './kitStore.js';
import { HandTracker } from './handTracker.js';
import { Renderer } from './renderer.js';
import { EditController } from './editController.js';

const $ = (id) => document.getElementById(id);
const video = $('video');
const canvas = $('overlay');
const startOverlay = $('start-overlay');
const startBtn = $('start-btn');
const startStatus = $('start-status');
const errorOverlay = $('error-overlay');
const errorText = $('error-text');
const modeBtn = $('mode-btn');
const noHandsEl = $('no-hands');
const emptyHintEl = $('empty-hint');

let mode = 'play';
let lastHandsSeenAt = performance.now();
let running = false;
let latestStrikers = [];

const kitStore = new KitStore({ storage: window.localStorage, config });
const audio = new AudioEngine({ manifest, config });
const renderer = new Renderer({ canvas, video, manifest });
const editController = new EditController({ kitStore, manifest, config });

const engine = new TriggerEngine({
  config,
  onHit(hit) {
    audio.play(hit.instrument, hit.variation, hit.velocity);
    if (hit.x != null) {
      const pad = hit.padId ? kitStore.getPad(hit.padId) : null;
      renderer.addFlash(hit.x, hit.y, pad ? pad.r : 0.1, hit.velocity);
    }
  },
});
engine.connectSource(createKeyboardSource(window, config));

const tracker = new HandTracker({
  video,
  config,
  onFrame(strikers) {
    latestStrikers = strikers;
    if (strikers.length > 0) lastHandsSeenAt = performance.now();
    if (mode === 'play') {
      engine.update(strikers, kitStore.getPads(), tracker.aspect);
    }
  },
});

function setMode(next) {
  mode = next;
  engine.setMuted(mode === 'edit');
  if (mode === 'play') {
    editController.cancelAll();
    engine.resetState(); // pads may have moved; don't fire off stale positions
  }
  modeBtn.textContent = mode === 'edit' ? '✓ Done — back to playing' : '✎ Edit kit';
  modeBtn.classList.toggle('editing', mode === 'edit');
  document.body.classList.toggle('edit-mode', mode === 'edit');
}

modeBtn.addEventListener('click', () => setMode(mode === 'edit' ? 'play' : 'edit'));

// --- Edit-mode mouse wiring (normalized canvas coordinates) ---

function toNorm(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) / rect.height,
  };
}

canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'edit' || e.button !== 0) return;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
  const { x, y } = toNorm(e);
  editController.mouseDown(x, y);
});
canvas.addEventListener('pointermove', (e) => {
  if (mode !== 'edit') return;
  const { x, y } = toNorm(e);
  editController.mouseMove(x, y);
});
canvas.addEventListener('pointerup', (e) => {
  if (mode !== 'edit' || e.button !== 0) return;
  const { x, y } = toNorm(e);
  editController.mouseUp(x, y);
});
canvas.addEventListener('wheel', (e) => {
  if (mode !== 'edit') return;
  e.preventDefault();
  const { x, y } = toNorm(e);
  editController.wheel(x, y, e.deltaY);
}, { passive: false });

// --- Render loop (tracking runs on camera frames inside HandTracker) ---

function frame(now) {
  if (!running) return;
  editController.setAspect(tracker.aspect);

  noHandsEl.classList.toggle('visible',
    now - lastHandsSeenAt > config.noHandsWarningAfterMs);
  emptyHintEl.classList.toggle('visible',
    mode === 'play' && kitStore.getPads().length === 0);

  renderer.draw({
    mode,
    pads: kitStore.getPads(),
    strikers: latestStrikers,
    editState: mode === 'edit' ? editController.getState() : null,
    now,
  });
  requestAnimationFrame(frame);
}

async function start() {
  startBtn.disabled = true;
  try {
    startStatus.textContent = 'Loading drum samples…';
    await audio.init((done, total) => {
      startStatus.textContent = `Loading drum samples… ${done}/${total}`;
    });
    await audio.resume();

    // ?nocam skips the camera (debug / no-webcam preview of the kit).
    if (!new URLSearchParams(location.search).has('nocam')) {
      startStatus.textContent = 'Starting camera & hand tracking…';
      await tracker.init();
      tracker.start();
    }

    startOverlay.classList.add('hidden');
    renderer.layout();
    running = true;
    requestAnimationFrame(frame);
  } catch (err) {
    startOverlay.classList.add('hidden');
    errorText.textContent = err.userMessage ??
      ('Something went wrong while starting: ' + err.message);
    errorOverlay.classList.remove('hidden');
    console.error(err);
  }
}

startBtn.addEventListener('click', start);
window.addEventListener('resize', () => { if (running) renderer.layout(); });
// Spacebar is the kick pedal — don't let it scroll or re-click focused buttons.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
});
