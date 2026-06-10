// HandTracker: wraps MediaPipe HandLandmarker + getUserMedia. Hides camera
// setup, landmark smoothing, velocity computation, and pinch hysteresis.
// Emits, per processed video frame, one striker state per detected hand:
//   { id, x, y, vx, vy, isPinching, pinchX, pinchY }
// (mirrored coordinates: what the user sees on screen), plus pinch edge
// events and hand-lost events.

const TASKS_VISION_VERSION = '0.10.35';
const WASM_BASE =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const INDEX_TIP = 8;
const THUMB_TIP = 4;

export class HandTracker {
  /**
   * @param {object} opts
   * @param {HTMLVideoElement} opts.video
   * @param {object} opts.config
   * @param {(strikers: Array) => void} opts.onFrame
   * @param {(hand: string, x: number, y: number) => void} [opts.onPinchStart]
   * @param {(hand: string, x: number, y: number) => void} [opts.onPinchMove]
   * @param {(hand: string, x: number, y: number) => void} [opts.onPinchEnd]
   * @param {(hand: string) => void} [opts.onHandLost]
   */
  constructor({ video, config, onFrame, onPinchStart, onPinchMove, onPinchEnd, onHandLost }) {
    this.video = video;
    this.config = config;
    this.onFrame = onFrame;
    this.onPinchStart = onPinchStart;
    this.onPinchMove = onPinchMove;
    this.onPinchEnd = onPinchEnd;
    this.onHandLost = onHandLost;
    this.landmarker = null;
    this.hands = new Map(); // id -> { x, y, vx, vy, t, isPinching }
    this._lastVideoTime = -1;
    this.aspect = 16 / 9;
  }

  /** Throws with a user-presentable .userMessage on camera failure. */
  async init() {
    const vision = await import(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/vision_bundle.mjs`
    );
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
    this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 2,
    });

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

  /** Call every animation frame; processes the video frame if it's new. */
  poll(nowMs) {
    if (!this.landmarker || this.video.readyState < 2) return;
    if (this.video.currentTime === this._lastVideoTime) return;
    this._lastVideoTime = this.video.currentTime;

    const result = this.landmarker.detectForVideo(this.video, nowMs);
    const seen = new Set();
    const strikers = [];

    for (let i = 0; i < result.landmarks.length; i++) {
      const lm = result.landmarks[i];
      const label = result.handedness?.[i]?.[0]?.categoryName ?? 'Hand' + i;
      let id = label.toLowerCase();
      if (seen.has(id)) id += '-' + i; // both hands classified the same
      seen.add(id);

      // Mirror x so coordinates match what the user sees on screen.
      const rawX = 1 - lm[INDEX_TIP].x;
      const rawY = lm[INDEX_TIP].y;
      const thumbX = 1 - lm[THUMB_TIP].x;
      const thumbY = lm[THUMB_TIP].y;

      const prev = this.hands.get(id);
      const a = this.config.positionAlpha;
      const x = prev ? prev.x + a * (rawX - prev.x) : rawX;
      const y = prev ? prev.y + a * (rawY - prev.y) : rawY;

      let vx = 0, vy = 0;
      if (prev) {
        const dt = (nowMs - prev.t) / 1000;
        if (dt > 0) {
          const va = this.config.velocityAlpha;
          vx = prev.vx + va * ((x - prev.x) / dt - prev.vx);
          vy = prev.vy + va * ((y - prev.y) / dt - prev.vy);
        } else {
          vx = prev.vx; vy = prev.vy;
        }
      }

      // Pinch with hysteresis (aspect-corrected thumb-to-index distance).
      const pinchDist = Math.hypot((thumbX - x) * this.aspect, thumbY - y);
      const wasPinching = prev ? prev.isPinching : false;
      const isPinching = wasPinching
        ? pinchDist < this.config.pinchOffDistance
        : pinchDist < this.config.pinchOnDistance;
      const pinchX = (x + thumbX) / 2;
      const pinchY = (y + thumbY) / 2;

      this.hands.set(id, { x, y, vx, vy, t: nowMs, isPinching });
      strikers.push({ id, x, y, vx, vy, isPinching, pinchX, pinchY });

      if (isPinching && !wasPinching && this.onPinchStart) this.onPinchStart(id, pinchX, pinchY);
      else if (isPinching && wasPinching && this.onPinchMove) this.onPinchMove(id, pinchX, pinchY);
      else if (!isPinching && wasPinching && this.onPinchEnd) this.onPinchEnd(id, pinchX, pinchY);
    }

    for (const id of [...this.hands.keys()]) {
      if (!seen.has(id)) {
        const wasPinching = this.hands.get(id).isPinching;
        this.hands.delete(id);
        if (wasPinching && this.onHandLost) this.onHandLost(id);
        else if (this.onHandLost) this.onHandLost(id);
      }
    }

    this.onFrame(strikers);
  }
}
