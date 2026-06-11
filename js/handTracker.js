// HandTracker: wraps MediaPipe HandLandmarker + getUserMedia. Hides camera
// setup, landmark filtering, velocity computation, and latency compensation.
// Emits, per processed camera frame, one striker per detected hand:
//   { id, x, y, vx, vy }
// in mirrored coordinates (what the user sees on screen).
//
// Filtering (AxisFilter, one per axis per hand):
//  - Position: One Euro filter — heavy smoothing at rest (stable dots),
//    minimal lag during fast strikes (accurate hits).
//  - Strike velocity: EMA over the filtered-position derivative, weighted to
//    reach true speed within a frame or two — this is what the TriggerEngine
//    compares against the strike threshold, so it must not lag.
// The emitted position is extrapolated forward along the velocity by
// latencyCompMs to compensate camera + inference delay, so hits land where
// the finger IS, not where it was.
//
// Frames are processed via requestVideoFrameCallback when available (fires
// exactly once per camera frame, ahead of rAF), falling back to rAF polling.

const TASKS_VISION_VERSION = '0.10.35';
const WASM_BASE =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const INDEX_TIP = 8;

class OneEuro {
  constructor({ minCutoff, beta, dCutoff }) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xHat = null;
    this.dxHat = 0;
  }

  static _alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x, dt) {
    if (this.xHat === null || dt <= 0) {
      this.xHat = x;
      return x;
    }
    const dx = (x - this.xHat) / dt;
    const aD = OneEuro._alpha(this.dCutoff, dt);
    this.dxHat = this.dxHat + aD * (dx - this.dxHat);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxHat);
    const a = OneEuro._alpha(cutoff, dt);
    this.xHat = this.xHat + a * (x - this.xHat);
    return this.xHat;
  }
}

/**
 * Per-axis fingertip filter: One Euro position + velocity estimation.
 * Pure math — exported for tests.
 *
 * Velocity smoothing uses a wall-clock time constant (velocityTauMs), so it
 * converges in the same real time regardless of camera framerate. The raw
 * per-frame velocity is also returned (vInst): at low fps an entire strike
 * can be one inter-frame jump, and any smoothing would dilute it.
 */
export class AxisFilter {
  constructor(config) {
    this.config = config;
    this.tau = config.velocityTauMs / 1000;
    this.euro = null;
    this.reset();
  }

  /** Forget all history (tracking reacquired after a gap). */
  reset() {
    this.euro = new OneEuro({
      minCutoff: this.config.oneEuroMinCutoff,
      beta: this.config.oneEuroBeta,
      dCutoff: this.config.oneEuroDCutoff,
    });
    this.prevX = null;
    this.v = 0;
  }

  /** @returns {{x: number, v: number, vInst: number}} filtered position,
   *  smoothed velocity, and raw per-frame velocity (units/sec). */
  update(raw, dt) {
    const x = this.euro.filter(raw, dt);
    if (this.prevX === null || dt <= 0) {
      this.prevX = x;
      return { x, v: 0, vInst: 0 };
    }
    const vInst = (x - this.prevX) / dt;
    const alpha = 1 - Math.exp(-dt / this.tau);
    this.v = this.v + alpha * (vInst - this.v);
    this.prevX = x;
    return { x, v: this.v, vInst };
  }
}

export class HandTracker {
  /**
   * @param {object} opts
   * @param {HTMLVideoElement} opts.video
   * @param {object} opts.config
   * @param {(strikers: Array<{id:string,x:number,y:number,vx:number,vy:number}>) => void} opts.onFrame
   */
  constructor({ video, config, onFrame }) {
    this.video = video;
    this.config = config;
    this.onFrame = onFrame;
    this.landmarker = null;
    this.hands = new Map(); // id -> { fx: AxisFilter, fy: AxisFilter, t }
    this._lastVideoTime = -1;
    this._running = false;
    this.aspect = 16 / 9;
  }

  /** Throws with a user-presentable .userMessage on camera failure. */
  async init() {
    const vision = await import(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/vision_bundle.mjs`
    );
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
    const make = (delegate) => vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: this.config.minHandDetectionConfidence,
      minHandPresenceConfidence: this.config.minHandPresenceConfidence,
      minTrackingConfidence: this.config.minTrackingConfidence,
    });
    try {
      this.landmarker = await make('GPU');
    } catch (err) {
      // Some browsers (notably iOS Safari) reject the GPU delegate.
      console.warn('GPU delegate unavailable, falling back to CPU:', err);
      this.landmarker = await make('CPU');
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
    } catch (err) {
      const e = new Error('camera: ' + err.name);
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        e.userMessage = 'Camera permission was denied. Click the camera icon in ' +
          'your browser\'s address bar, allow access, then reload the page.';
      } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
        e.userMessage = 'No camera was found. Connect a webcam and reload the page.';
      } else {
        e.userMessage = 'Could not start the camera (' + err.name + '). ' +
          'Close other apps using the camera and reload.';
      }
      throw e;
    }
    this.video.srcObject = stream;
    await this.video.play();
    this.aspect = this.video.videoWidth / this.video.videoHeight || 16 / 9;
  }

  /** Begin processing camera frames (one detection per camera frame). */
  start() {
    if (this._running || !this.landmarker) return;
    this._running = true;
    // A single bad frame must never kill the loop (and with it, all sound).
    const safeProcess = (now) => {
      try {
        this._process(now);
      } catch (err) {
        console.error('hand tracking frame failed:', err);
      }
    };
    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
      const loop = (now) => {
        if (!this._running) return;
        safeProcess(now);
        this.video.requestVideoFrameCallback(loop);
      };
      this.video.requestVideoFrameCallback(loop);
    } else {
      const loop = (now) => {
        if (!this._running) return;
        if (this.video.currentTime !== this._lastVideoTime) {
          this._lastVideoTime = this.video.currentTime;
          safeProcess(now);
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  stop() { this._running = false; }

  _process(nowMs) {
    if (this.video.readyState < 2) return;
    const result = this.landmarker.detectForVideo(this.video, nowMs);
    const seen = new Set();
    const strikers = [];
    const lead = this.config.latencyCompMs / 1000;

    for (let i = 0; i < result.landmarks.length; i++) {
      const lm = result.landmarks[i];
      const label = result.handedness?.[i]?.[0]?.categoryName ?? 'Hand' + i;
      let id = label.toLowerCase();
      if (seen.has(id)) id += '-' + i; // both hands classified the same
      seen.add(id);

      // Mirror x so coordinates match what the user sees on screen.
      const rawX = 1 - lm[INDEX_TIP].x;
      const rawY = lm[INDEX_TIP].y;

      let hand = this.hands.get(id);
      if (!hand) {
        hand = {
          fx: new AxisFilter(this.config),
          fy: new AxisFilter(this.config),
          t: nowMs,
        };
        this.hands.set(id, hand);
      }
      let dt = (nowMs - hand.t) / 1000;
      hand.t = nowMs;
      // A long gap means tracking dropped out: restart the filters so the
      // jump to the reacquired position can't read as a monster strike.
      if (dt * 1000 > this.config.trackingGapResetMs) {
        hand.fx.reset();
        hand.fy.reset();
        dt = 0;
      }
      const { x, v: vx, vInst: vix } = hand.fx.update(rawX, dt);
      const { x: y, v: vy, vInst: viy } = hand.fy.update(rawY, dt);

      // Latency compensation: report where the finger is now, not where the
      // camera saw it (slower cameras lag more, so part of the lead scales
      // with the frame interval). The same point is rendered, so sight and
      // sound agree.
      const handLead = lead + this.config.latencyCompFrameFraction * dt;
      strikers.push({
        id, x: x + vx * handLead, y: y + vy * handLead, vx, vy, vix, viy,
      });
    }

    for (const id of [...this.hands.keys()]) {
      if (!seen.has(id)) this.hands.delete(id);
    }

    this.onFrame(strikers);
  }
}
