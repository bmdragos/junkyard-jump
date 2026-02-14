// ============================================================
// ENGINE AUDIO SYNTHESIZER
// Generates a procedural engine sound driven by speed/RPM.
// No samples — pure Web Audio API synthesis.
//
// Usage:
//   const engine = createEngine(audioContext);
//   engine.start();
//   engine.setSpeed(50);  // 0-100
//   engine.stop();
// ============================================================

function createEngine(ctx) {
  // --- Tuning ---
  const IDLE_FREQ = 22;      // Hz — low chug at rest
  const MAX_FREQ = 240;      // Hz — high-revving redline
  const IDLE_ROUGHNESS = 0.4; // LFO depth at idle (0-1)
  const VOLUME = 0.30;

  let running = false;
  let nodes = null;

  function buildGraph() {
    // --- Exhaust fundamental (sawtooth → waveshaper for grit) ---
    const exhaust = ctx.createOscillator();
    exhaust.type = 'sawtooth';
    exhaust.frequency.value = IDLE_FREQ;

    // Waveshaper for distortion/crunch
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(8);
    shaper.oversample = '2x';

    // --- Sub-harmonic (one octave below, adds low-end thump) ---
    const sub = ctx.createOscillator();
    sub.type = 'sawtooth';
    sub.frequency.value = IDLE_FREQ / 2;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;

    // --- Second harmonic (adds buzz) ---
    const harm2 = ctx.createOscillator();
    harm2.type = 'square';
    harm2.frequency.value = IDLE_FREQ * 2;
    const harm2Gain = ctx.createGain();
    harm2Gain.gain.value = 0.15;

    // --- Third harmonic (extra bite at high RPM) ---
    const harm3 = ctx.createOscillator();
    harm3.type = 'sawtooth';
    harm3.frequency.value = IDLE_FREQ * 3;
    const harm3Gain = ctx.createGain();
    harm3Gain.gain.value = 0.0; // silent at idle, fades in

    // --- Redline scream (high-pitched whine that fades in above 60%) ---
    const scream = ctx.createOscillator();
    scream.type = 'sawtooth';
    scream.frequency.value = IDLE_FREQ * 5;
    const screamShaper = ctx.createWaveShaper();
    screamShaper.curve = makeDistortionCurve(20);
    const screamBPF = ctx.createBiquadFilter();
    screamBPF.type = 'bandpass';
    screamBPF.frequency.value = 1200;
    screamBPF.Q.value = 2.0;
    const screamGain = ctx.createGain();
    screamGain.gain.value = 0.0; // silent until high RPM

    // --- Mechanical noise (bandpass-filtered white noise) ---
    const noiseNode = createNoiseSource(ctx);
    const noiseBPF = ctx.createBiquadFilter();
    noiseBPF.type = 'bandpass';
    noiseBPF.frequency.value = IDLE_FREQ * 6;
    noiseBPF.Q.value = 1.5;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.12;

    // --- High-freq noise layer (hiss at redline) ---
    const noiseHi = createNoiseSource(ctx);
    const noiseHiBPF = ctx.createBiquadFilter();
    noiseHiBPF.type = 'highpass';
    noiseHiBPF.frequency.value = 3000;
    const noiseHiGain = ctx.createGain();
    noiseHiGain.gain.value = 0.0; // fades in at top end

    // --- Idle roughness LFO (amplitude wobble at low RPM) ---
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = IDLE_FREQ / 2;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = IDLE_ROUGHNESS;

    // --- Mixer ---
    const mixer = ctx.createGain();
    mixer.gain.value = 1.0;

    // --- Master output ---
    const master = ctx.createGain();
    master.gain.value = VOLUME;

    // --- Low-pass to shape overall tone ---
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 800;
    lpf.Q.value = 0.7;

    // --- Wiring ---
    // Exhaust chain
    exhaust.connect(shaper);
    shaper.connect(mixer);

    // Sub
    sub.connect(subGain);
    subGain.connect(mixer);

    // Second harmonic
    harm2.connect(harm2Gain);
    harm2Gain.connect(mixer);

    // Third harmonic
    harm3.connect(harm3Gain);
    harm3Gain.connect(mixer);

    // Scream chain (own distortion + bandpass for focused whine)
    scream.connect(screamShaper);
    screamShaper.connect(screamBPF);
    screamBPF.connect(screamGain);
    screamGain.connect(mixer);

    // Noise chain
    noiseNode.connect(noiseBPF);
    noiseBPF.connect(noiseGain);
    noiseGain.connect(mixer);

    // High noise
    noiseHi.connect(noiseHiBPF);
    noiseHiBPF.connect(noiseHiGain);
    noiseHiGain.connect(mixer);

    // LFO modulates mixer amplitude for idle chug
    lfo.connect(lfoGain);
    lfoGain.connect(mixer.gain);

    // Mixer → filter → output
    mixer.connect(lpf);
    lpf.connect(master);
    master.connect(ctx.destination);

    return {
      exhaust, sub, harm2, harm3, scream, noiseNode, noiseHi, lfo,
      shaper, screamShaper, screamBPF, screamGain,
      subGain, harm2Gain, harm3Gain, noiseBPF, noiseGain,
      noiseHiBPF, noiseHiGain, lfoGain,
      mixer, lpf, master
    };
  }

  function setSpeed(speed) {
    if (!nodes || !running) return;
    const t = Math.max(0, Math.min(1, speed / 100));
    const freq = IDLE_FREQ + t * (MAX_FREQ - IDLE_FREQ);
    const now = ctx.currentTime;
    const ramp = 0.05; // 50ms smoothing

    // Oscillator frequencies
    nodes.exhaust.frequency.setTargetAtTime(freq, now, ramp);
    nodes.sub.frequency.setTargetAtTime(freq / 2, now, ramp);
    nodes.harm2.frequency.setTargetAtTime(freq * 2, now, ramp);
    nodes.harm3.frequency.setTargetAtTime(freq * 3, now, ramp);

    // Scream oscillator tracks at 5x fundamental
    nodes.scream.frequency.setTargetAtTime(freq * 5, now, ramp);
    nodes.screamBPF.frequency.setTargetAtTime(freq * 5, now, ramp);

    // Noise filter tracks engine frequency
    nodes.noiseBPF.frequency.setTargetAtTime(freq * 6, now, ramp);

    // LFO rate follows engine
    nodes.lfo.frequency.setTargetAtTime(freq / 2, now, ramp);

    // Idle roughness fades out at higher RPM
    const roughness = IDLE_ROUGHNESS * (1 - t * 0.8);
    nodes.lfoGain.gain.setTargetAtTime(roughness, now, ramp);

    // Open up the low-pass filter as RPM rises (much wider at top end)
    const lpfFreq = 800 + t * t * 5200;
    nodes.lpf.frequency.setTargetAtTime(lpfFreq, now, ramp);
    // Add resonance at high RPM for edge
    nodes.lpf.Q.setTargetAtTime(0.7 + t * 3, now, ramp);

    // Noise gets louder at high RPM
    const noiseVol = 0.12 + t * 0.2;
    nodes.noiseGain.gain.setTargetAtTime(noiseVol, now, ramp);

    // Second harmonic more prominent at high RPM
    nodes.harm2Gain.gain.setTargetAtTime(0.15 + t * 0.25, now, ramp);

    // Third harmonic fades in above 40%
    const h3 = t > 0.4 ? (t - 0.4) / 0.6 : 0;
    nodes.harm3Gain.gain.setTargetAtTime(h3 * 0.3, now, ramp);

    // Scream fades in above 55% — exponential curve for dramatic entrance
    const screamT = t > 0.55 ? (t - 0.55) / 0.45 : 0;
    nodes.screamGain.gain.setTargetAtTime(screamT * screamT * 0.35, now, ramp);

    // High-freq noise hiss above 50%
    const hiT = t > 0.5 ? (t - 0.5) / 0.5 : 0;
    nodes.noiseHiGain.gain.setTargetAtTime(hiT * 0.15, now, ramp);

    // Overall volume boost at high RPM (perceived loudness increase)
    nodes.master.gain.setTargetAtTime(VOLUME * (1 + t * 0.5), now, ramp);
  }

  function start() {
    if (running) return;
    nodes = buildGraph();
    nodes.exhaust.start();
    nodes.sub.start();
    nodes.harm2.start();
    nodes.harm3.start();
    nodes.scream.start();
    nodes.lfo.start();
    nodes.noiseNode.start();
    nodes.noiseHi.start();
    running = true;
  }

  function stop() {
    if (!running || !nodes) return;
    running = false;
    // Fade out briefly to avoid click
    const now = ctx.currentTime;
    nodes.master.gain.setTargetAtTime(0, now, 0.02);
    const n = nodes;
    setTimeout(() => {
      [n.exhaust, n.sub, n.harm2, n.harm3, n.scream, n.lfo, n.noiseNode, n.noiseHi].forEach(osc => {
        try { osc.stop(); } catch (e) {}
      });
      n.master.disconnect();
    }, 100);
    nodes = null;
  }

  return { start, stop, setSpeed };
}

// --- Helpers ---

function makeDistortionCurve(amount) {
  const samples = 256;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function createNoiseSource(ctx) {
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}
