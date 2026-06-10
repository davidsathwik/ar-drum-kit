# 🥁 AR Drum Kit

A browser-based "magic mirror" drum kit. Stand in front of your webcam, see
yourself mirrored with semi-transparent drums floating over the video, and
strike the pads in the air with your index fingertips. Hits trigger real drum
samples instantly; faster strikes play louder. Spacebar plays the kick.

No build step, no install — a static web app.

## Run it

Serve the folder over HTTP (camera access doesn't work from `file://`):

```
npm run serve        # or: python -m http.server 8000
```

Open http://localhost:8000, click **Start drumming**, and allow camera access.
Use Chrome or Edge for best results. MediaPipe hand tracking and its model
load from CDN, so the first launch needs internet.

## Playing

- Strike any pad with your **index fingertip** — entry from any direction
  counts; speed controls loudness. Slow, gentle movements through a pad don't
  trigger it, so you can reposition between phrases silently.
- A pad re-arms only after your fingertip leaves it (no machine-gunning).
- Both hands work independently. **Spacebar** = kick drum.

## Editing your kit

Click **✎ Edit kit** (sounds are muted while editing). All editing is done by
**pinching** — thumb and index tip together:

- Pinch an instrument in the left dropdown to open its sample variations.
- Pinch a variation and drag it onto the canvas to create a new pad.
- Pinch an existing pad to move it.
- Pinch the same pad with **both hands** and spread/close them to resize.
- While holding a pad, the **Delete** button (top right) arms — drag the pad
  onto it to remove it.
- Multiple pads of the same instrument are fine (two crashes, etc.).

Your layout auto-saves to the browser on every change and is restored on
reload. Corrupt or missing saved data falls back to the default 8-piece kit.

## Tuning

If your machine tracks hands well below 30 fps and fast strikes get missed,
lower `strikeSpeedMin` in [js/config.js](js/config.js). All feel-related
constants (thresholds, smoothing, pinch hysteresis) live there.

## Tests

```
npm test
```

Covers the pure-logic modules (TriggerEngine, KitStore, EditController) with
synthetic striker trajectories and pinch streams. The MediaPipe and canvas
adapters are deliberately untested.

## Samples

Real recorded samples from free packs — see [ATTRIBUTION.md](ATTRIBUTION.md).
