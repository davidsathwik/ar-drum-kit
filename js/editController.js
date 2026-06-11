// EditController: the Edit-mode interaction state machine, driven by the
// mouse. Pure logic — consumes normalized mouse events (from the canvas in
// the app, synthetic streams in tests) and mutates KitStore. The renderer
// draws from getState() + editLayout geometry.
//
// Interactions:
//  - Click a dropdown instrument        -> open (or toggle) its variations tray
//  - Drag a tray variation onto canvas  -> new pad where released
//  - Drag an existing pad               -> move (drops in place on release)
//  - Scroll wheel over a pad            -> resize it
//  - While a pad is dragged, the delete button arms; release over it -> delete

import {
  dropdownItems, trayItems, pointInRect, pointInPad,
  DELETE_BUTTON, NEW_PAD_RADIUS,
} from './editLayout.js';

export class EditController {
  /**
   * @param {object} opts
   * @param {import('./kitStore.js').KitStore} opts.kitStore
   * @param {object} opts.manifest - instrument -> { variations: [{id}] }
   * @param {object} opts.config - wheelResizeFactor
   * @param {number} [opts.aspect]
   */
  constructor({ kitStore, manifest, config, aspect = 16 / 9 }) {
    this.kitStore = kitStore;
    this.manifest = manifest;
    this.config = config;
    this.aspect = aspect;
    this.selectedInstrument = null;  // tray open for this instrument
    this.dragNew = null;             // { instrument, variation, x, y }
    this.hold = null;                // { padId, offX, offY }
    this.cursor = { x: -1, y: -1 };
  }

  setAspect(aspect) { this.aspect = aspect; }

  _padAt(x, y) {
    const pads = this.kitStore.getPads();
    for (let i = pads.length - 1; i >= 0; i--) { // topmost-drawn first
      if (pointInPad(x, y, pads[i], this.aspect)) return pads[i];
    }
    return null;
  }

  mouseDown(x, y) {
    this.cursor = { x, y };

    // Dropdown: click an instrument to open (or toggle closed) its tray.
    for (const item of dropdownItems(Object.keys(this.manifest))) {
      if (pointInRect(x, y, item.rect)) {
        this.selectedInstrument =
          this.selectedInstrument === item.instrument ? null : item.instrument;
        return;
      }
    }

    // Tray: press a variation to start dragging a new pad out.
    if (this.selectedInstrument) {
      const variations = this.manifest[this.selectedInstrument].variations.map((v) => v.id);
      for (const item of trayItems(variations)) {
        if (pointInRect(x, y, item.rect)) {
          this.dragNew = {
            instrument: this.selectedInstrument, variation: item.variation, x, y,
          };
          return;
        }
      }
    }

    // Existing pad: grab it (keep the grab offset so the pad doesn't jump).
    const pad = this._padAt(x, y);
    if (pad) {
      this.hold = { padId: pad.id, offX: pad.x - x, offY: pad.y - y };
    }
  }

  mouseMove(x, y) {
    this.cursor = { x, y };
    if (this.hold) {
      this.kitStore.movePad(this.hold.padId, x + this.hold.offX, y + this.hold.offY);
    } else if (this.dragNew) {
      this.dragNew.x = x;
      this.dragNew.y = y;
    }
  }

  mouseUp(x, y) {
    this.cursor = { x, y };

    if (this.hold) {
      const { padId } = this.hold;
      this.hold = null;
      if (pointInRect(x, y, DELETE_BUTTON)) {
        this.kitStore.removePad(padId);
      }
      // Otherwise the pad simply stays where the live moves left it.
      return;
    }

    if (this.dragNew) {
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

  /** Scroll wheel resizes the pad under the cursor (or the one being dragged). */
  wheel(x, y, deltaY) {
    this.cursor = { x, y };
    const pad = this.hold ? this.kitStore.getPad(this.hold.padId) : this._padAt(x, y);
    if (!pad || deltaY === 0) return;
    const f = this.config.wheelResizeFactor;
    this.kitStore.resizePad(pad.id, deltaY < 0 ? pad.r * f : pad.r / f);
  }

  /** Drop any in-flight drag (used when leaving Edit mode). Pads keep
   *  whatever position the drag already applied. */
  cancelAll() {
    this.hold = null;
    this.dragNew = null;
  }

  /** Snapshot for the renderer. */
  getState() {
    const hoverPad = (!this.hold && !this.dragNew)
      ? this._padAt(this.cursor.x, this.cursor.y) : null;
    const deleteActive = this.hold !== null;
    return {
      selectedInstrument: this.selectedInstrument,
      dragNew: this.dragNew ? { ...this.dragNew } : null,
      heldPadId: this.hold ? this.hold.padId : null,
      hoverPadId: hoverPad ? hoverPad.id : null,
      deleteActive,
      deleteHover: deleteActive && pointInRect(this.cursor.x, this.cursor.y, DELETE_BUTTON),
    };
  }
}
