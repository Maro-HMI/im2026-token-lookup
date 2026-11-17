/* Short chase cues share a bounded, cancellable Web Audio bus. */
function createChaseAudio(ctx) {
  const voices = new Set();
  let bus = null, compressor = null;
  const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.3), ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

  function ensureBus() {
    if (bus) return;
    bus = ctx.createGain(); bus.gain.value = 0.65;
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -13; compressor.knee.value = 16; compressor.ratio.value = 4;
    compressor.attack.value = 0.004; compressor.release.value = 0.12;
    bus.connect(compressor); compressor.connect(ctx.destination);
  }

  function releaseBus() {
    if (voices.size || !bus) return;
    bus.disconnect(); compressor.disconnect(); bus = compressor = null;
  }

  function register(sources, nodes, at, end) {
    const entry = { sources, nodes };
    voices.add(entry);
    sources[0].onended = () => {
      for (const node of nodes) node.disconnect();
      voices.delete(entry); releaseBus();
    };
    for (const source of sources) { source.start(at); source.stop(end); }
  }

  function tone(freq, { at = ctx.currentTime, duration = 0.16, release = 0.1, gain = 0.12, type = 'triangle', pan = 0, endFreq = null, purr = false } = {}) {
    ensureBus();
    const source = ctx.createOscillator(); source.type = type;
    source.frequency.setValueAtTime(freq, at);
    if (endFreq) source.frequency.exponentialRampToValueAtTime(endFreq, at + duration);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = purr ? 650 : 3500;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(gain, at + 0.012);
    envelope.gain.setValueAtTime(gain * 0.8, at + duration);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration + release);
    const stereo = ctx.createStereoPanner(); stereo.pan.value = pan;
    source.connect(filter); filter.connect(envelope); envelope.connect(stereo); stereo.connect(bus);
    const sources = [source], nodes = [source, filter, envelope, stereo];
    if (purr) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = 24;
      const depth = ctx.createGain(); depth.gain.value = 28;
      lfo.connect(depth); depth.connect(source.frequency);
      sources.push(lfo); nodes.push(lfo, depth);
    }
    register(sources, nodes, at, at + duration + release + 0.01);
  }

  function shimmer(at, gain = 0.08, low = false) {
    ensureBus();
    const source = ctx.createBufferSource(); source.buffer = noise;
    const filter = ctx.createBiquadFilter(); filter.type = low ? 'bandpass' : 'highpass';
    filter.frequency.value = low ? 1300 : 4200;
    const envelope = ctx.createGain(); envelope.gain.setValueAtTime(gain, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
    source.connect(filter); filter.connect(envelope); envelope.connect(bus);
    register([source], [source, filter, envelope], at, at + 0.17);
  }

  function stop() {
    for (const entry of voices) {
      for (const source of entry.sources) { try { source.stop(); } catch (_) {} }
      for (const node of entry.nodes) node.disconnect();
    }
    voices.clear(); releaseBus();
  }

  return {
    nearMiss(side = 0) {
      side = Math.max(-1, Math.min(1, side));
      const at = ctx.currentTime;
      tone(180, { at, endFreq: 650, duration: 0.2, release: 0.12, gain: 0.12, type: 'sine', pan: side * 0.8 });
      tone(1100, { at: at + 0.06, endFreq: 1800, duration: 0.1, gain: 0.055, pan: -side * 0.5 });
      shimmer(at, 0.1, true);
    },
    lock(progress) {
      const note = [493.88, 622.25, 739.99, 830.61, 987.77][Math.max(0, Math.min(4, Math.floor(progress * 4)))];
      tone(note, { duration: 0.07, release: 0.08, gain: 0.07, type: 'sine' });
    },
    descent() {
      ensureBus();
      const at = ctx.currentTime;
      const source = ctx.createBufferSource(); source.buffer = noise; source.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass';
      filter.frequency.setValueAtTime(650, at); filter.frequency.exponentialRampToValueAtTime(4000, at + 2.8);
      const gain = ctx.createGain(); gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.18, at + 0.2); gain.gain.linearRampToValueAtTime(0.26, at + 2.8);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 3.2);
      source.connect(filter); filter.connect(gain); gain.connect(bus);
      register([source], [source, filter, gain], at, at + 3.22);
      tone(95, { at, endFreq: 55, duration: 2.9, release: 0.2, gain: 0.1, type: 'sine' });
    },
    landing() {
      const at = ctx.currentTime;
      tone(180, { at, endFreq: 32, duration: 0.45, release: 0.25, gain: 0.36, type: 'sine' });
      tone(48, { at: at + 0.06, duration: 0.5, release: 0.2, gain: 0.18, type: 'triangle' });
      shimmer(at, 0.32, true);
      [987.77, 1244.51, 1479.98].forEach((freq, i) => tone(freq, { at: at + 0.08 + i * 0.04, duration: 0.12, release: 0.2, gain: 0.06, pan: (i - 1) * 0.4 }));
    },
    pickup(boosts) {
      const at = ctx.currentTime;
      const root = 493.88 * Math.pow(2, [0, 2, 4, 7, 12][Math.max(0, Math.min(4, boosts - 1))] / 12);
      [1, 1.25, 1.5].forEach((ratio, i) => tone(root * ratio, { at: at + i * 0.035, gain: 0.1, pan: (i - 1) * 0.35 }));
      tone(85, { at, endFreq: 170, duration: 0.13, gain: 0.12, type: 'sine' });
      shimmer(at, 0.06);
    },
    collision() {
      const at = ctx.currentTime;
      tone(170, { at, endFreq: 42, duration: 0.18, gain: 0.26, type: 'sine' });
      tone(720, { at, endFreq: 290, duration: 0.065, release: 0.05, gain: 0.08 });
      shimmer(at, 0.22, true);
    },
    caught() {
      const at = ctx.currentTime;
      // B-major ascent, followed by a warm Bmaj9 resolution and a cat purr.
      [739.99, 830.61, 932.33, 987.77].forEach((freq, i) => tone(freq, { at: at + i * 0.1, duration: 0.16, gain: 0.13, pan: (i - 1.5) * 0.2 }));
      [246.94, 311.13, 369.99, 466.16, 554.37].forEach((freq, i) => tone(freq, { at: at + 0.32, duration: 0.65, release: 0.5, gain: 0.09, pan: (i - 2) * 0.3 }));
      tone(130, { at: at + 0.6, duration: 0.7, gain: 0.13, type: 'sine', purr: true });
      tone(780, { at: at + 0.72, endFreq: 430, duration: 0.27, release: 0.18, gain: 0.07 });
      shimmer(at + 0.3, 0.07);
    },
    stop,
    status: () => ({ voices: voices.size, active: bus !== null })
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createChaseAudio };
