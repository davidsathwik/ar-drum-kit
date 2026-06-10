// Edit-mode chrome geometry, in normalized [0,1] coordinates. Shared by
// EditController (pinch hit-testing) and Renderer (drawing) so what you see
// is exactly what you can pinch.

export const DROPDOWN = { x: 0.015, w: 0.155, top: 0.10, itemH: 0.058, gap: 0.006 };
export const TRAY = { x: 0.185, w: 0.145, top: 0.10, itemH: 0.058, gap: 0.006 };
export const DELETE_BUTTON = { x: 0.855, y: 0.03, w: 0.13, h: 0.10 };

export const NEW_PAD_RADIUS = 0.09;

export function dropdownItems(instrumentIds) {
  return instrumentIds.map((instrument, i) => ({
    instrument,
    rect: {
      x: DROPDOWN.x,
      y: DROPDOWN.top + i * (DROPDOWN.itemH + DROPDOWN.gap),
      w: DROPDOWN.w,
      h: DROPDOWN.itemH,
    },
  }));
}

export function trayItems(variationIds) {
  return variationIds.map((variation, i) => ({
    variation,
    rect: {
      x: TRAY.x,
      y: TRAY.top + i * (TRAY.itemH + TRAY.gap),
      w: TRAY.w,
      h: TRAY.itemH,
    },
  }));
}

export function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function pointInPad(x, y, pad, aspect) {
  return Math.hypot((x - pad.x) * aspect, y - pad.y) <= pad.r;
}
