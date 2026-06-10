// Tunable constants. Coordinates are normalized: x and y in [0,1] relative to
// the mirrored video frame; distances/speeds are aspect-corrected (x scaled by
// the frame aspect ratio) so a circle on screen is a circle in hit-test space.

export const config = {
  // --- Hit model ---
  // Minimum entry speed (aspect-corrected normalized units / second) for a
  // strike to trigger. Slow drifts through a pad stay silent. If a machine
  // tracks well below 30fps and fast strikes are missed, lower this.
  strikeSpeedMin: 0.9,
  // Entry speed mapped to full velocity (1.0). Between min and max, velocity
  // scales linearly.
  strikeSpeedMax: 4.5,
  // Loudness floor for the softest triggering hit, so threshold hits are audible.
  velocityFloor: 0.25,

  // --- Pinch detection (thumb tip to index tip distance, with hysteresis) ---
  pinchOnDistance: 0.055,
  pinchOffDistance: 0.085,

  // --- Tracking smoothing ---
  // EMA weight of the newest sample. High = responsive, low = smooth.
  positionAlpha: 0.7,
  velocityAlpha: 0.5,

  // --- Audio humanization ---
  pitchJitter: 0.04,       // +/- playbackRate variation per hit
  filterBaseHz: 9000,      // lowpass center for humanization
  filterJitterHz: 3000,    // +/- cutoff variation per hit

  // --- Keyboard trigger ---
  keyboardKickVelocity: 0.85,

  // --- UI ---
  noHandsWarningAfterMs: 2500,
  padMinRadius: 0.04,
  padMaxRadius: 0.28,
  padEdgeMargin: 0.03,     // pads are clamped so centers stay this far inside the frame
};
