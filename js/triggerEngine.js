// TriggerEngine: pure hit-detection logic. No DOM, no audio, no MediaPipe.
//
// Hit model (reworked for accuracy):
//  - A pad fires the moment a striker ENTERS it from any direction, if the
//    entry speed is at or above the threshold. No deceleration analysis:
//    zero added decision latency.
//  - One strike fires exactly ONE pad — the pad where the strike LANDS.
//    Among pads entered this frame, that's the one containing the striker's
//    endpoint (nearest center wins on overlap); pads the inter-frame segment
//    merely passed over on the way are not fired (no drive-by mis-hits).
//    If the endpoint is inside no pad (a full pass-through between two
//    samples at low fps), the crossed pad nearest the endpoint fires, so
//    fast strikes still register on slow cameras.
//  - After any entry (sounding or silent), the pad is disarmed for that
//    striker until the striker exits. Exit requires leaving radius *
//    exitHysteresis, so edge jitter can't re-arm and double-fire. Resting a
//    hand inside a pad never machine-guns.
//  - Each striker arms/fires pads independently of the other.
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

      // Collect every pad this striker entered or crossed this frame.
      const candidates = [];
      for (const pad of pads) {
        const key = s.id + ':' + pad.id;
        const cx = pad.x * aspect, cy = pad.y;
        const dist = Math.hypot(ax - cx, ay - cy);

        if (this._inside.get(key) === true) {
          // Exit needs clearance beyond the rim so edge jitter can't re-arm.
          if (dist > pad.r * this.config.exitHysteresis) this._inside.delete(key);
          continue;
        }

        const nowInside = dist <= pad.r;
        const crossed = prev
          ? segmentIntersectsCircle(prev.x, prev.y, ax, ay, cx, cy, pad.r)
          : nowInside;
        if (!crossed) continue;

        // Every entered pad disarms until exit, fired or not (silent slow
        // entries included). Pass-through pads already exited: stay armed.
        if (nowInside) this._inside.set(key, true);
        candidates.push({ pad, nowInside, dist });
      }

      // Fire the single pad where the strike landed. First-ever sample
      // (tracking just acquired) has no knowable entry speed: stay silent.
      const velocity = prev ? velocityForSpeed(speed, this.config) : 0;
      if (candidates.length > 0 && velocity > 0 && !this.muted) {
        const landed = candidates.filter((c) => c.nowInside);
        const pool = landed.length > 0 ? landed : candidates;
        const best = pool.reduce((a, b) => (b.dist < a.dist ? b : a));
        this.onHit({
          padId: best.pad.id,
          instrument: best.pad.instrument,
          variation: best.pad.variation,
          velocity,
          x: best.pad.x,
          y: best.pad.y,
        });
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
