// Renderer: draws the overlay canvas — stylized semi-transparent pads,
// fingertip dots, hit ripples, and Edit-mode chrome. The canvas is sized to
// exactly cover the displayed (letterboxed) video frame, so normalized kit
// coordinates map straight to canvas pixels.

import {
  dropdownItems, trayItems, DELETE_BUTTON, NEW_PAD_RADIUS,
} from './editLayout.js';

const HUES = {
  'kick': 16, 'snare': 200, 'hihat-closed': 48, 'hihat-open': 40,
  'tom-high': 280, 'tom-mid': 300, 'tom-floor': 320,
  'crash': 52, 'ride': 44, 'cowbell': 90, 'clap': 170,
  'tambourine': 130, 'rimshot': 230,
};

const FLASH_MS = 300;

export class Renderer {
  constructor({ canvas, video, manifest }) {
    this.canvas = canvas;
    this.video = video;
    this.manifest = manifest;
    this.ctx = canvas.getContext('2d');
    this.flashes = []; // { x, y, r, velocity, t0 }
    this.w = 0;
    this.h = 0;
  }

  /** Fit the canvas to the video's letterboxed display rect. */
  layout() {
    const vw = this.video.videoWidth || 1280;
    const vh = this.video.videoHeight || 720;
    const winW = window.innerWidth, winH = window.innerHeight;
    const scale = Math.min(winW / vw, winH / vh);
    const dispW = Math.round(vw * scale), dispH = Math.round(vh * scale);
    const left = Math.round((winW - dispW) / 2);
    const top = Math.round((winH - dispH) / 2);

    for (const el of [this.video, this.canvas]) {
      el.style.left = left + 'px';
      el.style.top = top + 'px';
      el.style.width = dispW + 'px';
      el.style.height = dispH + 'px';
    }
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(dispW * dpr);
    this.canvas.height = Math.round(dispH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = dispW;
    this.h = dispH;
  }

  addFlash(x, y, r, velocity) {
    this.flashes.push({ x, y, r, velocity, t0: performance.now() });
  }

  _px(x) { return x * this.w; }
  _py(y) { return y * this.h; }
  _pr(r) { return r * this.h; }

  draw({ mode, pads, strikers, editState, now }) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    for (const pad of pads) {
      const held = editState && editState.heldPadId === pad.id;
      const hovered = editState && editState.hoverPadId === pad.id;
      this._drawPad(pad, { held, hovered, editMode: mode === 'edit' });
    }

    this._drawFlashes(now);

    if (mode === 'edit' && editState) this._drawEditChrome(editState);

    if (strikers) {
      for (const s of strikers) this._drawFingertip(s);
    }
  }

  _drawPad(pad, { held, hovered, editMode, ghost } = {}) {
    const ctx = this.ctx;
    const cx = this._px(pad.x), cy = this._py(pad.y), r = this._pr(pad.r);
    const def = this.manifest[pad.instrument];
    const style = def?.style ?? 'drum';
    const hue = HUES[pad.instrument] ?? 0;
    const alpha = ghost ? 0.25 : held ? 0.55 : hovered ? 0.45 : 0.35;

    ctx.save();
    const grad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    if (style === 'cymbal') {
      grad.addColorStop(0, `hsla(${hue}, 90%, 75%, ${alpha + 0.15})`);
      grad.addColorStop(1, `hsla(${hue}, 80%, 45%, ${alpha})`);
    } else if (style === 'percussion') {
      grad.addColorStop(0, `hsla(${hue}, 70%, 70%, ${alpha + 0.1})`);
      grad.addColorStop(1, `hsla(${hue}, 60%, 40%, ${alpha})`);
    } else {
      grad.addColorStop(0, `hsla(${hue}, 75%, 65%, ${alpha + 0.1})`);
      grad.addColorStop(1, `hsla(${hue}, 70%, 35%, ${alpha})`);
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = held || hovered ? 4 : 2.5;
    ctx.strokeStyle = `hsla(${hue}, 90%, ${held || hovered ? 80 : 70}%, 0.85)`;
    ctx.stroke();

    if (style === 'cymbal') {
      for (const f of [0.65, 0.35]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * f, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = `hsla(${hue}, 80%, 80%, 0.35)`;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 90%, 85%, 0.6)`;
      ctx.fill();
    } else if (style === 'drum') {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `hsla(${hue}, 60%, 85%, 0.3)`;
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `600 ${Math.max(11, r * 0.28)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 4;
    ctx.fillText(def?.label ?? pad.instrument, cx, cy);
    if (editMode && pad.variation) {
      ctx.font = `400 ${Math.max(9, r * 0.18)}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText(pad.variation, cx, cy + r * 0.32);
    }
    if (hovered && !ghost) {
      ctx.font = `400 ${Math.max(9, r * 0.16)}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('drag to move · scroll to resize', cx, cy + r * 0.55);
    }
    ctx.restore();
  }

  _drawFlashes(now) {
    const ctx = this.ctx;
    this.flashes = this.flashes.filter((f) => now - f.t0 < FLASH_MS);
    for (const f of this.flashes) {
      const t = (now - f.t0) / FLASH_MS; // 0..1
      const cx = this._px(f.x), cy = this._py(f.y);
      const baseR = this._pr(f.r);
      const ringR = baseR * (1 + t * (0.4 + 0.8 * f.velocity));
      const a = (1 - t) * (0.4 + 0.6 * f.velocity);

      ctx.save();
      // bright core flash
      ctx.beginPath();
      ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${a * 0.35})`;
      ctx.fill();
      // expanding ripple ring
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.lineWidth = 3 + 5 * f.velocity * (1 - t);
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawFingertip(s) {
    const ctx = this.ctx;
    const color = s.id.startsWith('left') ? '#27e0ff' : '#ff5ad1';
    const x = this._px(s.x), y = this._py(s.y);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }

  _rect(r) {
    return [this._px(r.x), this._py(r.y), this._px(r.w), this._py(r.h)];
  }

  _drawEditChrome(editState) {
    const ctx = this.ctx;

    // Instrument dropdown
    for (const item of dropdownItems(Object.keys(this.manifest))) {
      const [x, y, w, h] = this._rect(item.rect);
      const selected = item.instrument === editState.selectedInstrument;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8);
      ctx.fillStyle = selected ? 'rgba(80,160,255,0.75)' : 'rgba(20,24,34,0.72)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = selected ? 'rgba(160,210,255,0.95)' : 'rgba(255,255,255,0.25)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `500 ${Math.max(11, h * 0.34)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.manifest[item.instrument].label, x + w * 0.08, y + h / 2);
      ctx.restore();
    }

    // Variations tray
    if (editState.selectedInstrument) {
      const def = this.manifest[editState.selectedInstrument];
      for (const item of trayItems(def.variations.map((v) => v.id))) {
        const [x, y, w, h] = this._rect(item.rect);
        const v = def.variations.find((vv) => vv.id === item.variation);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 8);
        ctx.fillStyle = 'rgba(40,60,50,0.78)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(140,255,190,0.5)';
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = `500 ${Math.max(11, h * 0.34)}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('♪ ' + (v?.label ?? item.variation), x + w * 0.08, y + h / 2);
        ctx.restore();
      }
    }

    // Drag-new ghost pad
    if (editState.dragNew) {
      this._drawPad({
        instrument: editState.dragNew.instrument,
        variation: editState.dragNew.variation,
        x: editState.dragNew.x, y: editState.dragNew.y, r: NEW_PAD_RADIUS,
      }, { ghost: true });
    }

    // Delete button (inert unless a pad is held)
    {
      const [x, y, w, h] = this._rect(DELETE_BUTTON);
      const { deleteActive, deleteHover } = editState;
      ctx.save();
      ctx.globalAlpha = deleteActive ? 1 : 0.35;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 10);
      ctx.fillStyle = deleteHover ? 'rgba(255,60,60,0.9)'
        : deleteActive ? 'rgba(180,40,40,0.8)' : 'rgba(60,60,60,0.6)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = deleteHover ? '#ffd0d0' : 'rgba(255,255,255,0.4)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = `600 ${h * 0.32}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🗑 Delete', x + w / 2, y + h / 2);
      ctx.restore();
    }
  }
}
