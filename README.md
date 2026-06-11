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
  counts, no hard downward swing needed: any deliberate movement into a pad
  fires it, and speed controls loudness. Only a near-stationary hand drifting
  in stays silent.
- One strike fires one pad — the pad where the strike lands, not the pads it
  passes over on the way.
- A pad re-arms only after your fingertip leaves it (no machine-gunning).
- Both hands work independently. **Spacebar** = kick drum.

## Editing your kit

Click **✎ Edit kit** (sounds are muted while editing). Editing uses the mouse:

- Click an instrument in the left dropdown to open its sample variations.
- Drag a variation onto the canvas to create a new pad where you release.
- Drag an existing pad to move it.
- Scroll the mouse wheel over a pad to resize it.
- While dragging a pad, the **Delete** button (top right) arms — drop the pad
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
