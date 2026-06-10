// Default 8-piece kit (9 pads: open and closed hi-hat are separate), laid out
// as a right-handed kit seen in a mirror: hi-hats left, ride right, kick low
// center. x/y in [0,1] of the mirrored frame (y down); r relative to frame height.

export function defaultKit() {
  return [
    { id: 'pad-crash', instrument: 'crash', variation: 'linn', x: 0.13, y: 0.22, r: 0.125 },
    { id: 'pad-hh-closed', instrument: 'hihat-closed', variation: 'acoustic', x: 0.10, y: 0.50, r: 0.095 },
    { id: 'pad-hh-open', instrument: 'hihat-open', variation: 'bright', x: 0.25, y: 0.40, r: 0.095 },
    { id: 'pad-snare', instrument: 'snare', variation: 'acoustic', x: 0.34, y: 0.63, r: 0.11 },
    { id: 'pad-tom-high', instrument: 'tom-high', variation: 'acoustic', x: 0.42, y: 0.35, r: 0.10 },
    { id: 'pad-tom-mid', instrument: 'tom-mid', variation: 'acoustic', x: 0.57, y: 0.35, r: 0.105 },
    { id: 'pad-tom-floor', instrument: 'tom-floor', variation: 'acoustic', x: 0.72, y: 0.60, r: 0.115 },
    { id: 'pad-kick', instrument: 'kick', variation: 'acoustic', x: 0.49, y: 0.84, r: 0.125 },
    { id: 'pad-ride', instrument: 'ride', variation: 'linn', x: 0.86, y: 0.27, r: 0.13 },
  ];
}
