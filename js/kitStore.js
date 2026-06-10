// KitStore: the kit model. A list of pads in normalized coordinates,
// persisted to storage on every mutation, restored on load, falling back to
// the default kit when stored data is missing or corrupt.
//
// Pure logic: storage is injected (localStorage in the app, a stub in tests).

import { defaultKit } from './defaultKit.js';

const STORAGE_KEY = 'ar-drums.kit.v1';

function isValidPad(p) {
  return p && typeof p === 'object' &&
    typeof p.id === 'string' &&
    typeof p.instrument === 'string' &&
    typeof p.variation === 'string' &&
    Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.r) &&
    p.r > 0;
}

export class KitStore {
  /**
   * @param {object} opts
   * @param {{getItem(k:string):string|null, setItem(k:string,v:string):void}} opts.storage
   * @param {object} opts.config - for clamping bounds (padEdgeMargin, padMin/MaxRadius)
   */
  constructor({ storage, config }) {
    this.storage = storage;
    this.config = config;
    this.listeners = new Set();
    this.pads = this._load();
  }

  _load() {
    let raw = null;
    try {
      raw = this.storage.getItem(STORAGE_KEY);
    } catch {
      return defaultKit();
    }
    if (raw == null) return defaultKit();
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.every(isValidPad)) return defaultKit();
      return parsed.map((p) => ({
        id: p.id, instrument: p.instrument, variation: p.variation,
        x: p.x, y: p.y, r: p.r,
      }));
    } catch {
      return defaultKit();
    }
  }

  _persist() {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.pads));
    } catch {
      // Storage full/unavailable: the in-memory kit still works this session.
    }
    for (const fn of this.listeners) fn(this.pads);
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getPads() { return this.pads; }

  getPad(id) { return this.pads.find((p) => p.id === id) ?? null; }

  _clampPos(v) {
    const m = this.config.padEdgeMargin;
    return Math.min(1 - m, Math.max(m, v));
  }

  _clampRadius(r) {
    return Math.min(this.config.padMaxRadius, Math.max(this.config.padMinRadius, r));
  }

  /** Returns the new pad. Multiple pads of the same instrument are fine. */
  addPad({ instrument, variation, x, y, r }) {
    const pad = {
      id: 'pad-' + Math.random().toString(36).slice(2, 10),
      instrument, variation,
      x: this._clampPos(x), y: this._clampPos(y),
      r: this._clampRadius(r),
    };
    this.pads = [...this.pads, pad];
    this._persist();
    return pad;
  }

  movePad(id, x, y) {
    this.pads = this.pads.map((p) =>
      p.id === id ? { ...p, x: this._clampPos(x), y: this._clampPos(y) } : p);
    this._persist();
  }

  resizePad(id, r) {
    this.pads = this.pads.map((p) =>
      p.id === id ? { ...p, r: this._clampRadius(r) } : p);
    this._persist();
  }

  removePad(id) {
    this.pads = this.pads.filter((p) => p.id !== id);
    this._persist();
  }

  /** Reset to the default kit (also used by the app's "reset" affordance). */
  reset() {
    this.pads = defaultKit();
    this._persist();
  }
}

export { STORAGE_KEY };
