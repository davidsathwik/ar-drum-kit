# PRD: AR Webcam Drum Kit — In-Air Percussion with Customizable Pads

**Status:** ready-for-agent
**Date:** 2026-06-10

---

## Problem Statement

Practicing or playing drums requires a physical kit: expensive, loud, immobile, and
impossible in a small room or shared space. Existing virtual alternatives (keyboard
drum apps, touchscreen pads) lose the physicality of drumming — the arm motion, the
spatial layout, the dynamics of striking harder or softer. The user wants to *drum*,
with real drumming motions, anywhere their PC and webcam are, and wants the kit
arranged exactly the way they would arrange a physical kit — every pad placed, sized,
and chosen by them.

## Solution

A browser-based "magic mirror" application. The user stands in front of their PC
webcam and sees themselves mirrored on screen with stylized, semi-transparent drum
and cymbal graphics floating over the video. They strike the pads in the air with
their index fingertips (invisible-drumstick style); hits are detected in real time
from hand tracking and trigger real recorded drum samples instantly, with strike
speed controlling loudness.

An explicit Edit mode turns the kit fully customizable without touching the mouse:
the user pinches pads in the air to move them, uses both hands to resize them,
drags new instruments out of an on-screen tray, and drags unwanted pads onto a
delete button. The layout persists across sessions automatically.

## User Stories

1. As a player, I want to grant camera access once and see my mirrored webcam feed with drum pads overlaid, so that the kit feels like a mirror in front of me.
2. As a player, I want a default standard 8-piece kit (kick, snare, closed hi-hat, open hi-hat, high tom, mid tom, floor tom, crash, ride) laid out sensibly on first launch, so that I can play immediately without setup.
3. As a player, I want a hit to sound the instant my index fingertip enters a pad from any direction at sufficient speed, so that the kit responds like real percussion regardless of where I've placed the pads.
4. As a player, I want harder strikes to sound louder and softer strikes quieter, so that I can play with dynamics.
5. As a player, I want a pad to re-arm only after my fingertip leaves it, so that resting my hand inside a pad doesn't machine-gun the sound.
6. As a player, I want to play with both hands simultaneously and independently, so that I can play realistic patterns.
7. As a player, I want repeated hits on the same pad to vary subtly in tone, so that rolls don't sound robotic.
8. As a player, I want to see a fingertip dot on each tracked hand, so that I always know where my strike points are.
9. As a player, I want a visible flash/ripple on a pad when it's hit, scaled to strike force, so that I get visual confirmation of every hit and its intensity.
10. As a player, I want to trigger the kick drum with the spacebar as an alternative to its hand pad, so that I can approximate foot-pedal playing.
11. As a player, I want slow, gentle hand movements through a pad to *not* trigger it, so that repositioning my hands between phrases doesn't make noise.
12. As a player, I want the app to keep working when one hand leaves the frame and recover when it returns, so that tracking dropouts don't crash or mute the kit.
13. As a player, I want a clear on-screen indication if my hands aren't being detected, so that I can adjust lighting or position instead of assuming the app is broken.
14. As a player, I want to be told clearly if camera permission is denied or no camera exists, with instructions to fix it, so that I'm not staring at a black screen.
15. As a customizer, I want to enter Edit mode only by clicking an explicit Edit button, so that I can never mangle my kit accidentally mid-song.
16. As a customizer, I want all pad sounds muted while in Edit mode, so that editing gestures don't trigger noise.
17. As a customizer, I want an instrument dropdown to appear when Edit mode activates, so that I can browse every instrument category available.
18. As a customizer, I want to pinch (thumb + index together) as the universal select/grab gesture for all Edit-mode interactions, so that I never need the mouse once I'm editing.
19. As a customizer, I want pinching an instrument in the dropdown to reveal a tray of its downloaded sample variations, so that I can choose the exact sound I want.
20. As a customizer, I want to pinch a variation in the tray and drag it onto the canvas to create a new pad where I release, so that adding instruments is one continuous gesture.
21. As a customizer, I want to pinch an existing pad and drag it anywhere on screen, so that my kit layout is entirely my own.
22. As a customizer, I want to pinch the same pad with both hands and spread/close them to resize it, so that I can make targets as big or precise as I like.
23. As a customizer, I want a delete button at the top-right that activates only while I'm holding a pad, and deletes the pad when I drag it there, so that deletion is deliberate and unambiguous.
24. As a customizer, I want my layout auto-saved continuously and restored on reload, so that I never lose my kit.
25. As a customizer, I want to place multiple pads of the same instrument (e.g., two crashes), so that my kit isn't limited to one of each.
26. As a customizer, I want pads I drag partially off-screen to be clamped or recoverable, so that I can't lose a pad beyond reach.
27. As a customizer, I want Edit mode to exit cleanly back to Play mode with my changes live, so that I can iterate on layout quickly: tweak, play, tweak.
28. As a customizer with an empty kit (all pads deleted), I want Play mode to show a hint pointing me to Edit mode, so that an empty state isn't a dead end.
29. As a player on a modest laptop, I want hit detection to remain usable at lower camera framerates, so that the app degrades gracefully rather than missing every fast strike silently.
30. As a returning user, I want corrupted or missing saved-layout data to fall back to the default kit instead of crashing, so that storage problems never lock me out.

## Implementation Decisions

- **Platform:** static browser web app, no build step. MediaPipe Hands (CDN) for tracking; Web Audio API for sound; canvas/SVG overlay for rendering. Mirrored video.
- **Modules** (all new; the system is greenfield):
  - **HandTracker** — wraps MediaPipe; hides camera setup, landmark smoothing, and velocity computation. Emits per-frame `{ hand, tipPosition, tipVelocity, isPinching }` per detected hand. Pinch = thumb tip and index tip within a distance threshold, with hysteresis to prevent flicker.
  - **TriggerEngine** — pure logic. Consumes striker states + pad layout; emits `onHit(padId, strikeVelocity)`. Encodes the hit model: trigger on pad entry from any direction when entry speed ≥ threshold; re-arm only on exit; per-striker, per-pad arm state. Accepts pluggable trigger sources (keyboard spacebar→kick now; foot-pedal source later) behind the same event interface.
  - **AudioEngine** — loads a sample manifest, pre-decodes all samples to buffers at startup (zero decode cost at hit time), plays `(instrument, variation, velocity)` with velocity→gain mapping and slight per-hit pitch/filter humanization.
  - **KitStore** — kit model: list of pads, each `{ instrument, variation, position, size }` in normalized coordinates (resolution-independent). Mutations: add/move/resize/remove. Persists to localStorage on every mutation; loads on startup; falls back to the default 8-piece kit on missing/corrupt data.
  - **Renderer** — draws video, stylized semi-transparent SVG instrument graphics, fingertip dots, hit flash/ripple animations, and Edit-mode chrome (dropdown, variations tray, delete button).
  - **EditController** — state machine consuming pinch events and mutating KitStore. States: browsing dropdown → variation tray open → dragging-new-pad → holding-existing-pad (move) → two-hand-resize → over-delete-button. Delete button is inert unless a pad is held.
  - **App shell** — wiring, Play/Edit mode toggle, camera permission flow, error/empty states.
- **Hit model invariants (the product's core feel):** zero added decision latency — no deceleration analysis or drive-by suppression; pass-through hits are accepted behavior, mitigated by user layout. Strike point is the index fingertip only. MediaPipe z-depth is not used for triggering.
- **Sounds:** real recorded samples from CC0/free packs, multiple variations per instrument where available. Open and closed hi-hat are separate pads.
- **Audio latency:** request a low-latency AudioContext; all buffers resident in memory before Play mode activates.

## Testing Decisions

A good test for this feature exercises **external behavior of the pure-logic
modules with synthetic inputs**: feed fabricated striker trajectories or pinch
sequences and assert on emitted events and resulting state — never on internal
counters or private state. The MediaPipe and canvas adapters are deliberately
untested; they fail only in ways unit tests can't observe.

Modules with tests:

- **TriggerEngine** — the highest-value tests in the project: fires on fast entry from each direction; does not fire below speed threshold; does not re-fire while inside a pad; re-arms on exit; two strikers act independently; overlapping pads both fire; keyboard source triggers kick; velocity maps to expected loudness range.
- **KitStore** — add/move/resize/remove round-trips; persistence round-trip; corrupt/missing storage falls back to default kit; normalized coordinates survive resolution changes.
- **EditController** — full gesture state machine via synthetic pinch streams: tray drag-out creates a pad at release point; pinch-drag moves a pad; two-hand pinch resizes; delete button activates only while holding; drag-to-delete removes; releasing outside delete drops the pad in place.

No prior art exists in the repository (greenfield).

## Out of Scope

- Foot-pedal kick via body-pose tracking (architecture leaves a trigger-source seam for it; not built in v1)
- Metronome, loop recorder, or any practice tooling
- In-app backing tracks for selected songs (explicit v2 request)
- Real drumstick tracking; whole-palm/multi-finger strikers
- Headset (Quest/WebXR) or phone AR targets
- Drive-by/pass-through hit suppression of any kind
- Multi-velocity sample layers (single sample per variation, gain-scaled, in v1)
- Cloud sync, accounts, sharing of layouts
- MIDI output

## Further Notes

- **Primary project risk:** whether webcam-based hit detection *feels* tight on the
  user's actual hardware. Build order should front-load this: HandTracker +
  TriggerEngine + one hardcoded snare pad first; validate feel; then build outward.
- Webcam framerate caps timing precision (~33ms sampling at 30fps); velocity
  interpolation between frames is the mitigation. If the user's machine tracks
  well below 30fps, the speed threshold may need tuning — expose it as a config
  constant.
- Sample sourcing: pick CC0/public-domain kits with several variations per
  instrument; record attribution in the repo even where licenses don't require it.
- v2 candidates in priority order per user: backing tracks, foot pedal, then
  practice tooling.
