// Sample manifest: every instrument, its display label, render style, and the
// downloaded sample variations. AudioEngine pre-decodes every file listed here
// at startup. See ATTRIBUTION.md for sources.

export const manifest = {
  'kick': {
    label: 'Kick',
    style: 'drum',
    variations: [
      { id: 'acoustic', label: 'Acoustic', url: 'samples/kick/acoustic.mp3' },
      { id: 'punchy', label: 'Punchy', url: 'samples/kick/punchy.wav' },
      { id: 'linn', label: 'Linn', url: 'samples/kick/linn.m4a' },
    ],
  },
  'snare': {
    label: 'Snare',
    style: 'drum',
    variations: [
      { id: 'acoustic', label: 'Acoustic', url: 'samples/snare/acoustic.mp3' },
      { id: 'tight', label: 'Tight', url: 'samples/snare/tight.wav' },
      { id: 'linn', label: 'Linn', url: 'samples/snare/linn.m4a' },
    ],
  },
  'hihat-closed': {
    label: 'Hi-Hat (closed)',
    style: 'cymbal',
    variations: [
      { id: 'acoustic', label: 'Acoustic', url: 'samples/hihat-closed/acoustic.mp3' },
      { id: 'crisp', label: 'Crisp', url: 'samples/hihat-closed/crisp.wav' },
      { id: 'linn', label: 'Linn', url: 'samples/hihat-closed/linn.m4a' },
    ],
  },
  'hihat-open': {
    label: 'Hi-Hat (open)',
    style: 'cymbal',
    variations: [
      { id: 'bright', label: 'Bright', url: 'samples/hihat-open/bright.wav' },
      { id: 'linn', label: 'Linn', url: 'samples/hihat-open/linn.m4a' },
      { id: 'vintage', label: 'Vintage', url: 'samples/hihat-open/vintage.m4a' },
    ],
  },
  'tom-high': {
    label: 'High Tom',
    style: 'drum',
    variations: [
      { id: 'acoustic', label: 'Acoustic', url: 'samples/tom-high/acoustic.mp3' },
      { id: 'linn', label: 'Linn', url: 'samples/tom-high/linn.m4a' },
      { id: 'punchy', label: 'Punchy', url: 'samples/tom-high/punchy.wav' },
    ],
  },
  'tom-mid': {
    label: 'Mid Tom',
    style: 'drum',
    variations: [
      { id: 'acoustic', label: 'Acoustic', url: 'samples/tom-mid/acoustic.mp3' },
      { id: 'linn', label: 'Linn', url: 'samples/tom-mid/linn.m4a' },
    ],
  },
  'tom-floor': {
    label: 'Floor Tom',
    style: 'drum',
    variations: [
      { id: 'acoustic', label: 'Acoustic', url: 'samples/tom-floor/acoustic.mp3' },
      { id: 'linn', label: 'Linn', url: 'samples/tom-floor/linn.m4a' },
      { id: 'deep', label: 'Deep', url: 'samples/tom-floor/deep.wav' },
    ],
  },
  'crash': {
    label: 'Crash',
    style: 'cymbal',
    variations: [
      { id: 'linn', label: 'Linn', url: 'samples/crash/linn.m4a' },
      { id: 'vintage', label: 'Vintage', url: 'samples/crash/vintage.m4a' },
    ],
  },
  'ride': {
    label: 'Ride',
    style: 'cymbal',
    variations: [
      { id: 'bright', label: 'Bright', url: 'samples/ride/bright.wav' },
      { id: 'linn', label: 'Linn', url: 'samples/ride/linn.m4a' },
      { id: 'vintage', label: 'Vintage', url: 'samples/ride/vintage.m4a' },
    ],
  },
  'cowbell': {
    label: 'Cowbell',
    style: 'percussion',
    variations: [
      { id: 'linn', label: 'Linn', url: 'samples/cowbell/linn.m4a' },
      { id: 'vintage', label: 'Vintage', url: 'samples/cowbell/vintage.m4a' },
    ],
  },
  'clap': {
    label: 'Clap',
    style: 'percussion',
    variations: [
      { id: 'linn', label: 'Linn', url: 'samples/clap/linn.m4a' },
      { id: 'studio', label: 'Studio', url: 'samples/clap/studio.wav' },
      { id: 'vintage', label: 'Vintage', url: 'samples/clap/vintage.m4a' },
    ],
  },
  'tambourine': {
    label: 'Tambourine',
    style: 'percussion',
    variations: [
      { id: 'linn', label: 'Linn', url: 'samples/tambourine/linn.m4a' },
    ],
  },
  'rimshot': {
    label: 'Rimshot',
    style: 'percussion',
    variations: [
      { id: 'linn', label: 'Linn', url: 'samples/rimshot/linn.m4a' },
      { id: 'tink', label: 'Tink', url: 'samples/rimshot/tink.wav' },
    ],
  },
};

export function defaultVariation(instrument) {
  return manifest[instrument]?.variations[0]?.id ?? null;
}

export function instrumentIds() {
  return Object.keys(manifest);
}
