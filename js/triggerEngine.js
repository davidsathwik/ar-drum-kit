// TriggerEngine: pure hit-detection logic. No DOM, no audio, no MediaPipe.
//
// Hit model (the product's core feel — see PRD):
//  - A pad fires the moment a striker ENTERS it from any direction, if the
//    entry speed is at or above the threshold. No deceleration analysis, no
//    drive-by suppression: zero added decision latency.
//  - After any entry (sounding or silent), the pad is disarmed for that
//    striker until the striker exits. Resting a hand inside a pad never
//    machine-guns.
//  - Each striker arms/fires each pad independently; overlapping pads can
//    both fire from one motion.
//  - Between-frame interpolation: if the segment from the previous sample to
//    the current one crosses a pad the striker wasn't inside, that counts as
//    an entry — fast strikes register even at low camera framerates.
//
// Coordinates: x, y in [0,1] (y down). Distances and speeds are computed in
// aspect-corrected space (x scaled by frame aspect) so hit circles match what
// the renderer draws. Pad radius is relative to frame height.

export function velocityForSpeed(speed, config) {
  if (speed < config.strikeSpeedMin) return 0;
  const t = Math.min(1, (speed - config.strikeSpeedMin) /
    (config.strikeSpeedMax - config.strikeSpeedMin));
  return config.velocityFloor + (1 - config.velocityFloor) * t;
}

function segmentIntersectsCircle(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0, dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 0) {
    t = ((cx - x0) * dx + (cy - y0) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const px = x0 + t * dx, py = y0 + t * dy;
  const ddx = cx - px, ddy = cy - py;
  return ddx * ddx + ddy * ddy <= r * r;
}

export class TriggerEngine {
  /**
   * @param {object} opts
   * @param {object} opts.config - see js/config.js
   * @param {(hit: {padId: string|null, instrument: string, velocity: number,
   *               variation?: string, x?: number, y?: number}) => void} opts.onHit
   */
  constructor({ config, onHit }) {
    this.config = config;
    this.onHit = onHit;
    this.muted = false;
    this._pads = [];
    // strikerId -> { x, y } previous aspect-corrected position
    this._prevPos = new Map();
    // `${strikerId}:${padId}` -> true while striker is inside pad (disarmed)
    this._inside = new Map();
  }

  setMuted(muted) { this.muted = muted; }

  /** Forget striker history (e.g. after Edit mode moved pads around, so a
   *  stale pre-edit position can't fabricate an entry). */
  resetState() {
    this._prevPos.clear();
    this._inside.clear();
  }

  /**
   * Per-frame update.
   * @param {Array<{id: string, x: number, y: number, vx: number, vy: number}>} strikers
   *   vx/vy in normalized units/second (not aspect-corrected).
   * @param {Array<{id: string, instrument: string, variation: string,
   *               x: number, y: number, r: number}>} pads
   * @param {number} aspect - frame width / height
   */
  update(strikers, pads, aspect = 16 / 9) {
    this._pads = pads;
    const seen = new Set();

    for (const s of strikers) {
      seen.add(s.id);
      const ax = s.x * aspect, ay = s.y;
      const prev = this._prevPos.get(s.id);
      const speed = Math.hypot(s.vx * aspect, s.vy);

      for (const pad of pads) {
        const key = s.id + ':' + pad.id;
        const cx = pad.x * aspect, cy = pad.y;
        const wasInside = this._inside.get(key) === true;
        const nowInside = Math.hypot(ax - cx, ay - cy) <= pad.r;

        if (wasInside) {
          if (!nowInside) this._inside.delete(key); // exit -> re-arm
          continue;
        }

        // Striker was outside. Entry = endpoint inside, or the inter-frame
        // segment clipped the pad (fast pass-through between samples).
        const crossed = prev
          ? segmentIntersectsCircle(prev.x, prev.y, ax, ay, cx, cy, pad.r)
          : nowInside;
        if (!crossed) continue;

        // First-ever sample inside a pad (tracking just (re)acquired): no
        // entry speed is knowable — disarm silently.
        const velocity = prev ? velocityForSpeed(speed, this.config) : 0;
        if (velocity > 0 && !this.muted) {
          this.onHit({
            padId: pad.id,
            instrument: pad.instrument,
            variation: pad.variation,
            velocity,
            x: pad.x,
            y: pad.y,
          });
        }
        if (nowInside) this._inside.set(key, true);
        // Pass-through (endpoint outside): entered and exited within one
        // frame -> already re-armed.
      }

      this._prevPos.set(s.id, { x: ax, y: ay });
    }

    // Strikers that vanished (hand left the frame): forget their state so a
    // reacquired hand starts fresh.
    for (const id of [...this._prevPos.keys()]) {
      if (!seen.has(id)) {
        this._prevPos.delete(id);
        for (const key of [...this._inside.keys()]) {
          if (key.startsWith(id + ':')) this._inside.delete(key);
        }
      }
    }
  }

  /**
   * Pluggable non-hand trigger sources (keyboard now, foot pedal later).
   * A source is `{ connect(fire) }` where fire(instrument, velocity).
   */
  connectSource(source) {
    source.connect((instrument, velocity) => {
      if (this.muted) return;
      const pad = this._pads.find((p) => p.instrument === instrument) ?? null;
      this.onHit({
        padId: pad ? pad.id : null,
        instrument,
        variation: pad ? pad.variation : undefined,
        velocity,
        x: pad ? pad.x : undefined,
        y: pad ? pad.y : undefined,
      });
    });
  }
}

/**
 * Spacebar -> kick trigger source. `target` is anything with
 * addEventListener (window in the app, a stub in tests).
 */
export function createKeyboardSource(target, config) {
  return {
    connect(fire) {
      target.addEventListener('keydown', (e) => {
        if ((e.code === 'Space' || e.key === ' ') && !e.repeat) {
          if (e.preventDefault) e.preventDefault();
          fire('kick', config.keyboardKickVelocity);
        }
      });
    },
  };
}
