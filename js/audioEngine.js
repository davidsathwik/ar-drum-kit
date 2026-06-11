// AudioEngine: Web Audio playback. All samples in the manifest are fetched
// and decoded to AudioBuffers up front, so triggering a hit costs zero decode
// time. Velocity maps to gain; each hit gets slight random pitch and lowpass
// variation so rolls don't sound robotic.

export class AudioEngine {
  constructor({ manifest, config }) {
    this.manifest = manifest;
    this.config = config;
    this.ctx = null;
    this.buffers = new Map(); // `${instrument}/${variation}` -> AudioBuffer
    this.master = null;
  }

  /**
   * Create the context and start it INSIDE the user gesture, before any
   * await. iOS Safari ties audio permission to the gesture itself: resuming
   * after seconds of sample loading is too late and the kit stays mute.
   */
  unlock() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({
        latencyHint: 'interactive',
      });
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
    // Play one silent sample now — the canonical iOS in-gesture unlock.
    const tick = this.ctx.createBufferSource();
    tick.buffer = this.ctx.createBuffer(1, 1, 22050);
    tick.connect(this.ctx.destination);
    tick.start(0);
  }

  /** Fetch and decode every sample. Call once at startup, after unlock(). */
  async init(onProgress) {
    this.unlock();

    const jobs = [];
    for (const [instrument, def] of Object.entries(this.manifest)) {
      for (const v of def.variations) {
        jobs.push({ key: instrument + '/' + v.id, url: v.url });
      }
    }
    let done = 0;
    await Promise.all(jobs.map(async (job) => {
      const res = await fetch(job.url);
      if (!res.ok) throw new Error('Failed to load sample: ' + job.url);
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(job.key, buf);
      done++;
      if (onProgress) onProgress(done, jobs.length);
    }));
  }

  /** Must be called from a user gesture before sound can play. */
  async resume() {
    if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume();
  }

  play(instrument, variation, velocity) {
    if (!this.ctx) return;
    // Browsers can (re)suspend the context behind our back (tab switches,
    // autoplay policy); a hit is a fine moment to claw it back.
    if (this.ctx.state === 'suspended') this.ctx.resume();
    let key = instrument + '/' + (variation ?? '');
    let buffer = this.buffers.get(key);
    if (!buffer) {
      // Unknown variation (e.g. keyboard kick with no kick pad): first available.
      const fallback = this.manifest[instrument]?.variations[0];
      if (!fallback) return;
      buffer = this.buffers.get(instrument + '/' + fallback.id);
      if (!buffer) return;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * this.config.pitchJitter;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.config.filterBaseHz +
      (Math.random() * 2 - 1) * this.config.filterJitterHz;

    const gain = this.ctx.createGain();
    // Perceptual-ish curve: soft hits noticeably quieter, hard hits full.
    gain.gain.value = Math.pow(Math.max(0, Math.min(1, velocity)), this.config.gainExponent);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
  }
}
