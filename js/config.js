// Tunable constants. Coordinates are normalized: x and y in [0,1] relative to
// the mirrored video frame; distances/speeds are aspect-corrected (x scaled by
// the frame aspect ratio) so a circle on screen is a circle in hit-test space.

export const config = {
  // --- Hit model ---
  // Minimum entry speed (aspect-corrected normalized units / second) for a
  // strike to trigger. Slow drifts through a pad stay silent. If a machine
  // tracks well below 30fps and fast strikes are missed, lower this.
  strikeSpeedMin: 0.7,
  // Entry speed mapped to full velocity (1.0). Between min and max, velocity
  // scales linearly.
  strikeSpeedMax: 4.0,
  // Loudness floor for the softest triggering hit, so threshold hits are audible.
  velocityFloor: 0.35,
  // A striker counts as "exited" (re-armed) only beyond radius * this factor,
  // so jitter at the pad edge can't re-arm and double-fire.
  exitHysteresis: 1.15,

  // --- Tracking filter (One Euro: smooth at rest, responsive in motion) ---
  oneEuroMinCutoff: 1.5,  // Hz; lower = smoother when still
  oneEuroBeta: 2.5,       // higher = less lag during fast strikes
  oneEuroDCutoff: 1.5,    // adaptation-derivative smoothing cutoff
  // Strike-speed estimator: EMA weight per frame on the filtered-position
  // derivative. High = tracks fast strikes within a frame or two.
  velocityAlpha: 0.6,
  // Hit-test (and display) position is extrapolated forward along the
  // velocity by this much, compensating camera + inference latency.
  latencyCompMs: 35,

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
