// Tunable constants. Coordinates are normalized: x and y in [0,1] relative to
// the mirrored video frame; distances/speeds are aspect-corrected (x scaled by
// the frame aspect ratio) so a circle on screen is a circle in hit-test space.

export const config = {
  // --- Hit model ---
  // Minimum entry speed (aspect-corrected normalized units / second) for a
  // strike to trigger. Near-presence tuning: ANY deliberate movement into a
  // pad fires, from any direction — no hard downward swing needed. The floor
  // exists only so tracking jitter on a stationary hand can't ghost-fire
  // (resting inside a pad stays silent; re-arm on exit still applies).
  strikeSpeedMin: 0.18,
  // Entry speed mapped to full velocity (1.0). Between min and max, velocity
  // scales linearly.
  strikeSpeedMax: 3.0,
  // Loudness floor for the softest triggering hit, so gentle taps are
  // clearly audible, not whispers.
  velocityFloor: 0.45,
  // A striker counts as "exited" (re-armed) only beyond radius * this factor,
  // so jitter at the pad edge can't re-arm and double-fire.
  exitHysteresis: 1.15,

  // --- Tracking filter (One Euro: smooth at rest, responsive in motion) ---
  oneEuroMinCutoff: 1.5,  // Hz; lower = smoother when still
  oneEuroBeta: 2.5,       // higher = less lag during fast strikes
  oneEuroDCutoff: 1.5,    // adaptation-derivative smoothing cutoff
  // Strike-speed smoothing time constant, in wall-clock ms — framerate
  // independent, so a 15fps camera converges in the same real time as 30fps.
  // (The trigger additionally uses the raw per-frame speed, whichever is
  // larger, so a strike completed within a single slow frame still counts.)
  velocityTauMs: 18,
  // Hit-test (and display) position is extrapolated forward along the
  // velocity: a fixed lead for inference latency plus a fraction of the
  // measured frame interval (slower cameras lag more).
  latencyCompMs: 30,
  latencyCompFrameFraction: 0.5,
  // A tracking gap longer than this resets a hand's filters: a dropout must
  // reacquire silently instead of fabricating a huge displacement.
  trackingGapResetMs: 250,

  // --- MediaPipe confidence thresholds ---
  minHandDetectionConfidence: 0.6,
  minHandPresenceConfidence: 0.6,
  minTrackingConfidence: 0.6,

  // --- Audio ---
  gainExponent: 1.3,       // velocity -> gain curve (1 = linear)
  pitchJitter: 0.04,       // +/- playbackRate variation per hit
  filterBaseHz: 9000,      // lowpass center for humanization
  filterJitterHz: 3000,    // +/- cutoff variation per hit

  // --- Keyboard trigger ---
  keyboardKickVelocity: 0.85,

  // --- Edit mode (mouse) ---
  wheelResizeFactor: 1.08, // radius scale per scroll notch

  // --- UI ---
  noHandsWarningAfterMs: 2500,
  padMinRadius: 0.04,
  padMaxRadius: 0.28,
  padEdgeMargin: 0.03,     // pads are clamped so centers stay this far inside the frame
};
