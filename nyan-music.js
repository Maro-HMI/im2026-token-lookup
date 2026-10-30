/* Nyan Cat (Nyanyanyanyanyanyanya!) — daniwell.
 * Chiptune arrangement, main loop referenced against Zorsy's piano transcription:
 * https://web.mit.edu/cesium/Public/nyan.pdf
 * Composer's noncommercial game/web reuse terms (credit required):
 * https://aidn.jp/about/ and https://aidn.jp/nyancatsong/
 * Pitch names below sound one octave below the printed main melody.
 */
function nyanTempoForBoosts(boosts) {
  return [142, 152, 162, 172, 182, 196][Math.max(0, Math.min(5, Number.isFinite(boosts) ? Math.floor(boosts) : 0))];
}

function createNyanMusic(ctx) {
  const bars = [
    'F#4:2 G#4:2 D#4 D#4 R B3 D4 C#4 B3 R B3:2 C#4:2',
    'D4:2 D4 C#4 B3 C#4 D#4 F#4 G#4 D#4 F#4 C#4 D#4 B3 C#4 B3',
    'D#4:2 F#4:2 G#4 D#4 F#4 C#4 D#4 B3 D4 D#4 D4 C#4 B3 C#4',
    'D4:2 B3 C#4 D#4 F#4 C#4 D4 C#4 B3 C#4:2 B3:2 C#4:2',
    'B3:2 F#3 G#3 B3:2 F#3 G#3 B3 C#4 D#4 B3 E4 D#4 E4 F#4',
    'B3:2 B3:2 F#3 G#3 B3 F#3 E4 D#4 C#4 B3 F#3 D#3 E3 F#3',
    'B3:2 F#3 G#3 B3:2 F#3 G#3 B3 B3 C#4 D#4 B3 F#3 G#3 F#3',
    'B3:2 B3 A#3 B3 F#3 G#3 B3 E4 D#4 E4 F#4 B3:2 A#3:2',
    'B3:2 B3 A#3 B3 F#3 G#3 B3 E4 D#4 E4 F#4 B3:2 C#4:2'
  ];
  const form = [0, 1, 2, 3, 0, 1, 2, 3, 4, 5, 6, 7, 4, 5, 6, 8];
  const bassBars = [
    'E2 E3 F#2 F#3 D#2 D#3 G#2 G#3',
    'C#2 C#3 F#2 F#3 B1 B2 B1 B2',
    'E3 G#3 B3 E4 D#3 F#3 B3 D#4',
    'C#3 E3 G#3 C#4 B2 D#3 F#3 B3'
  ];
  const noteOffsets = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function frequency(note) {
    if (note === 'R') return 0;
    const [, letter, sharp, octave] = /^([A-G])(#?)(\d)$/.exec(note);
    const midi = (Number(octave) + 1) * 12 + noteOffsets[letter] + Number(sharp === '#');
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  const lead = form.map(index => {
    const steps = Array(16).fill(null);
    let tick = 0;
    for (const token of bars[index].split(' ')) {
      const [note, duration = '1'] = token.split(':');
      steps[tick] = { frequency: frequency(note), duration: Number(duration) };
      tick += Number(duration);
    }
    if (tick !== 16) throw new Error('Nyan Cat measure must contain 16 steps.');
    return steps;
  }).flat();
  const bass = form.map((_, bar) => bassBars[(bar < 8 ? 0 : 2) + bar % 2].split(' ').map(frequency));
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  const voices = new Set();
  const effects = [];
  let echoSend = null;
  let echoDelay = null;
  let master = null, clock = null, step = 0, nextTime = 0, scheduled = 0;
  let bpm = 142;
  let stepSeconds = 60 / bpm / 4;

  function voice(freq, type, at, duration, volume, { pan = 0, detune = 0, sustain = 0.75, release = 0.045, echo = false, sweep = null } = {}) {
    if (!freq) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const stereo = ctx.createStereoPanner();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    osc.detune.value = detune;
    if (sweep) osc.frequency.exponentialRampToValueAtTime(sweep, at + duration);
    filter.type = 'lowpass'; filter.frequency.value = type === 'sawtooth' ? 2400 : 4200;
    stereo.pan.value = pan;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.007);
    gain.gain.linearRampToValueAtTime(volume * sustain, at + Math.min(0.035, duration * 0.5));
    gain.gain.setValueAtTime(Math.max(0.0001, volume * sustain), at + duration);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration + release);
    osc.connect(filter); filter.connect(gain); gain.connect(stereo); stereo.connect(master);
    if (echo) stereo.connect(echoSend);
    const entry = { source: osc, gain, filter, stereo };
    voices.add(entry);
    osc.onended = () => { osc.disconnect(); filter.disconnect(); gain.disconnect(); stereo.disconnect(); voices.delete(entry); };
    osc.start(at); osc.stop(at + duration + release + 0.01);
  }

  function percussion(at, snare = false, open = false) {
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = noise;
    filter.type = snare ? 'bandpass' : 'highpass'; filter.frequency.value = snare ? 1800 : 6500;
    const duration = snare ? 0.13 : open ? 0.08 : 0.025;
    gain.gain.setValueAtTime(snare ? 0.32 : open ? 0.07 : 0.045, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter); filter.connect(gain); gain.connect(master);
    const entry = { source, gain, filter };
    voices.add(entry);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); voices.delete(entry); };
    source.start(at); source.stop(at + duration + 0.01);
  }

  // Quiet sustained chord voices fill out the arrangement without masking the lead.
  const chordSets = [
    ['E2 G#2 B2', 'F#2 A#2 C#3', 'D#2 F#2 A#2', 'G#2 B2 D#3'],
    ['C#2 E2 G#2', 'F#2 A#2 C#3', 'B1 D#2 F#2', 'B1 D#2 F#2'],
    ['E2 G#2 B2', 'E2 G#2 B2', 'D#2 F#2 B2', 'D#2 F#2 B2'],
    ['C#2 E2 G#2', 'C#2 E2 G#2', 'B1 D#2 F#2', 'B1 D#2 F#2']
  ].map(set => set.map(chord => chord.split(' ').map(frequency)));

  function schedule() {
    // The AudioContext clock keeps note timing independent of drawing frames.
    if (nextTime < ctx.currentTime - 0.1) nextTime = ctx.currentTime + 0.025;
    while (master && nextTime < ctx.currentTime + 0.1) {
      const note = lead[step];
      if (note) {
        const duration = note.duration * stepSeconds * 0.96;
        voice(note.frequency, 'square', nextTime, duration, 0.14, { pan: -0.32, detune: -5, echo: true });
        voice(note.frequency, 'sawtooth', nextTime, duration, 0.12, { pan: 0.32, detune: 5, echo: true });
        voice(note.frequency * 2, 'triangle', nextTime, duration, 0.035, { sustain: 0.65 });
      }
      if (step % 2 === 0) {
        voice(bass[Math.floor(step / 16)][(step % 16) / 2], 'triangle', nextTime, stepSeconds * 1.9, 0.36);
      }
      percussion(nextTime, false, step % 4 === 2);
      if (step % 4 === 0) {
        const bar = Math.floor(step / 16);
        const chord = chordSets[(bar < 8 ? 0 : 2) + bar % 2][(step % 16) / 4];
        chord.forEach((freq, index) => voice(freq * 2, 'triangle', nextTime, stepSeconds * 3.8, 0.055, { pan: (index - 1) * 0.6, release: 0.07 }));
        voice(chord[0] / 2, 'sine', nextTime, stepSeconds * 3.6, 0.15, { sustain: 0.85 });
        voice(145, 'sine', nextTime, 0.14, 0.48, { sweep: 43, sustain: 0.05, release: 0.045 });
      }
      if (step % 8 === 4) {
        percussion(nextTime, true);
        voice(180, 'triangle', nextTime, 0.065, 0.13, { sustain: 0.1 });
      }
      scheduled++;
      step = (step + 1) % lead.length;
      nextTime += stepSeconds;
    }
  }

  function stop() {
    if (clock !== null) clearInterval(clock);
    clock = null;
    // Cancel already scheduled notes as well as the scheduler.
    for (const entry of voices) {
      try { entry.source.stop(); } catch (_) {}
      entry.source.disconnect(); entry.gain.disconnect(); entry.filter?.disconnect(); entry.stereo?.disconnect();
    }
    voices.clear();
    if (master) { master.disconnect(); master = null; }
    for (const effect of effects) effect.disconnect();
    effects.length = 0;
    echoSend = null;
    echoDelay = null;
  }

  return {
    duck(amount = 0.7, duration = 0.25) {
      if (!master) return;
      const at = ctx.currentTime;
      const current = master.gain.value;
      const level = 0.52 * Math.max(0.25, Math.min(1, amount));
      master.gain.cancelScheduledValues(at);
      master.gain.setValueAtTime(current, at);
      master.gain.linearRampToValueAtTime(level, at + 0.015);
      master.gain.setValueAtTime(level, at + 0.05);
      master.gain.linearRampToValueAtTime(0.52, at + Math.max(0.08, duration));
    },
    setBoosts(boosts) {
      const nextBpm = nyanTempoForBoosts(boosts);
      if (nextBpm === bpm) return;
      bpm = nextBpm;
      stepSeconds = 60 / bpm / 4;
      // Keep the score cursor and already scheduled notes intact. Only future
      // notes change tempo; ease the short echo to the new beat length.
      if (echoDelay) echoDelay.delayTime.setTargetAtTime(stepSeconds * 3, ctx.currentTime, 0.06);
    },
    start() {
      if (master || ctx.state !== 'running') return;
      master = ctx.createGain(); master.gain.value = 0.52;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14; compressor.knee.value = 18; compressor.ratio.value = 4;
      compressor.attack.value = 0.006; compressor.release.value = 0.14;
      master.connect(compressor); compressor.connect(ctx.destination);
      echoSend = ctx.createGain(); echoSend.gain.value = 0.2;
      const delay = ctx.createDelay(1); delay.delayTime.value = stepSeconds * 3;
      echoDelay = delay;
      const feedback = ctx.createGain(); feedback.gain.value = 0.18;
      const echoFilter = ctx.createBiquadFilter(); echoFilter.type = 'lowpass'; echoFilter.frequency.value = 2200;
      echoSend.connect(delay); delay.connect(echoFilter); echoFilter.connect(master);
      echoFilter.connect(feedback); feedback.connect(delay);
      effects.push(compressor, echoSend, delay, feedback, echoFilter);
      nextTime = ctx.currentTime + 0.03;
      schedule();
      clock = setInterval(schedule, 25);
    },
    stop,
    status: () => ({ playing: master !== null, voices: voices.size, scheduled, nextStep: step, measures: lead.length / 16, bpm })
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createNyanMusic, nyanTempoForBoosts };
