// EditController: the Edit-mode gesture state machine. Pure logic — consumes
// pinch events (from HandTracker in the app, synthetic streams in tests) and
// mutates KitStore. The renderer draws from getState() + editLayout geometry.
//
// Gestures:
//  - Pinch a dropdown instrument  -> open its variations tray
//  - Pinch a tray variation, drag onto the canvas, release -> new pad there
//  - Pinch an existing pad, drag  -> move (drops in place on release)
//  - Second hand pinches the held pad -> spread/close both hands to resize
//  - While a pad is held, the delete button arms; release over it -> delete

import {
  dropdownItems, trayItems, pointInRect, pointInPad,
  DELETE_BUTTON, NEW_PAD_RADIUS,
} from './editLayout.js';

export class EditController {
  /**
   * @param {object} opts
   * @param {import('./kitStore.js').KitStore} opts.kitStore
   * @param {object} opts.manifest - instrument -> { variations: [{id}] }
   * @param {number} [opts.aspect]
   */
  constructor({ kitStore, manifest, aspect = 16 / 9 }) {
    this.kitStore = kitStore;
    this.manifest = manifest;
    this.aspect = aspect;
    this.selectedInstrument = null;       // tray open for this instrument
    this.dragNew = null;                  // { hand, instrument, variation, x, y }
    this.holds = new Map();               // hand -> { padId, offX, offY }
    this.resize = null;                   // { padId, hands: [a, b], startDist, startR }
    this.lastPos = new Map();             // hand -> { x, y } latest pinch point
  }

  setAspect(aspect) { this.aspect = aspect; }

  _dist(a, b) {
    return Math.hypot((a.x - b.x) * this.aspect, a.y - b.y);
  }

  _padAt(x, y) {
    const pads = this.kitStore.getPads();
    for (let i = pads.length - 1; i >= 0; i--) { // topmost-drawn first
      if (pointInPad(x, y, pads[i], this.aspect)) return pads[i];
    }
    return null;
  }

  pinchStart(hand, x, y) {
    this.lastPos.set(hand, { x, y });

    // Second hand pinching a pad the other hand already holds -> resize.
    for (const [otherHand, hold] of this.holds) {
      if (otherHand === hand) continue;
      const pad = this.kitStore.getPad(hold.padId);
      if (pad && pointInPad(x, y, pad, this.aspect)) {
        const a = this.lastPos.get(otherHand);
        const startDist = this._dist(a, { x, y });
        if (startDist > 0) {
          this.holds.delete(otherHand);
          this.resize = {
            padId: pad.id, hands: [otherHand, hand], startDist, startR: pad.r,
          };
          return;
        }
      }
    }

    // Dropdown: pinch an instrument to open its variations tray.
    for (const item of dropdownItems(Object.keys(this.manifest))) {
      if (pointInRect(x, y, item.rect)) {
        this.selectedInstrument = item.instrument;
        return;
      }
    }

    // Tray: pinch a variation to start dragging a new pad out.
    if (this.selectedInstrument) {
      const variations = this.manifest[this.selectedInstrument].variations.map((v) => v.id);
      for (const item of trayItems(variations)) {
        if (pointInRect(x, y, item.rect)) {
          this.dragNew = {
            hand, instrument: this.selectedInstrument, variation: item.variation, x, y,
          };
          return;
        }
      }
    }

    // Existing pad: grab it (keep the grab offset so the pad doesn't jump).
    const pad = this._padAt(x, y);
    if (pad) {
      this.holds.set(hand, { padId: pad.id, offX: pad.x - x, offY: pad.y - y });
    }
  }

  pinchMove(hand, x, y) {
    this.lastPos.set(hand, { x, y });

    if (this.resize && this.resize.hands.includes(hand)) {
      const [a, b] = this.resize.hands;
      const pa = this.lastPos.get(a), pb = this.lastPos.get(b);
      if (pa && pb) {
        const d = this._dist(pa, pb);
        this.kitStore.resizePad(this.resize.padId,
          this.resize.startR * (d / this.resize.startDist));
      }
      return;
    }

    const hold = this.holds.get(hand);
    if (hold) {
      this.kitStore.movePad(hold.padId, x + hold.offX, y + hold.offY);
      return;
    }

    if (this.dragNew && this.dragNew.hand === hand) {
      this.dragNew.x = x;
      this.dragNew.y = y;
    }
  }

  pinchEnd(hand, x, y) {
    this.lastPos.set(hand, { x, y });

    if (this.resize && this.resize.hands.includes(hand)) {
      // The remaining hand keeps holding the pad.
      const remaining = this.resize.hands.find((h) => h !== hand);
      const pad = this.kitStore.getPad(this.resize.padId);
      const pos = this.lastPos.get(remaining);
      if (pad && pos) {
        this.holds.set(remaining, {
          padId: pad.id, offX: pad.x - pos.x, offY: pad.y - pos.y,
        });
      }
      this.resize = null;
      return;
    }

    const hold = this.holds.get(hand);
    if (hold) {
      this.holds.delete(hand);
      if (pointInRect(x, y, DELETE_BUTTON)) {
        this.kitStore.removePad(hold.padId);
      }
      // Otherwise the pad simply stays where the live moves left it.
      return;
    }

    if (this.dragNew && this.dragNew.hand === hand) {
      const { instrument, variation } = this.dragNew;
      this.dragNew = null;
      // Releasing back over the chrome cancels; anywhere else creates.
      const overDropdown = dropdownItems(Object.keys(this.manifest))
        .some((i) => pointInRect(x, y, i.rect));
      const overTray = trayItems(this.manifest[instrument].variations.map((v) => v.id))
        .some((i) => pointInRect(x, y, i.rect));
      if (!overDropdown && !overTray && !pointInRect(x, y, DELETE_BUTTON)) {
        this.kitStore.addPad({ instrument, variation, x, y, r: NEW_PAD_RADIUS });
      }
    }
  }

  /** Abandon all in-flight gestures (e.g. a pinching hand left the frame). */
  handLost(hand) {
    if (this.resize && this.resize.hands.includes(hand)) {
      const remaining = this.resize.hands.find((h) => h !== hand);
      const pad = this.kitStore.getPad(this.resize.padId);
      const pos = this.lastPos.get(remaining);
      if (pad && pos) {
        this.holds.set(remaining, {
          padId: pad.id, offX: pad.x - pos.x, offY: pad.y - pos.y,
        });
      }
      this.resize = null;
    }
    this.holds.delete(hand);
    if (this.dragNew && this.dragNew.hand === hand) this.dragNew = null;
    this.lastPos.delete(hand);
  }

  /** Drop every in-flight gesture (used when leaving Edit mode). Pads keep
   *  whatever position/size the gestures already applied. */
  cancelAll() {
    this.holds.clear();
    this.resize = null;
    this.dragNew = null;
  }

  /** Snapshot for the renderer. */
  getState() {
    const heldPadIds = [...this.holds.values()].map((h) => h.padId);
    if (this.resize) heldPadIds.push(this.resize.padId);
    const deleteActive = this.holds.size > 0;
    const deleteHover = deleteActive && [...this.holds.keys()].some((hand) => {
      const p = this.lastPos.get(hand);
      return p && pointInRect(p.x, p.y, DELETE_BUTTON);
    });
    return {
      selectedInstrument: this.selectedInstrument,
      dragNew: this.dragNew
        ? { instrument: this.dragNew.instrument, variation: this.dragNew.variation,
            x: this.dragNew.x, y: this.dragNew.y }
        : null,
      heldPadIds,
      resizingPadId: this.resize ? this.resize.padId : null,
      deleteActive,
      deleteHover,
    };
  }
}
