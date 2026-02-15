// ============================================================
// ENGINE AUDIO SYNTHESIZER
// Generates procedural engine sounds driven by speed/RPM.
// Each engine type has a fundamentally different sound character.
// No samples — pure Web Audio API synthesis.
//
// Usage:
//   const engine = createEngine(audioContext, 'blower');
//   engine.start();
//   engine.setSpeed(50);  // 0-100
//   engine.stop();
// ============================================================

// --- Engine personality presets ---
// Each engine emphasizes completely different sound components:
//   blower       → mostly WIND NOISE with a high motor whine
//   airconditioner → deep OSCILLATOR DRONE, heavy bass
//   coffee       → CRACKLE BURSTS (bubbling), very muffled
//   fan          → smooth SINE HUM with rhythmic blade PULSING
//   popcorn      → sharp CRACKLE POPS with crunchy distortion
const ENGINE_PRESETS = {
  blower: {
    name: 'Hair Blower',
    idleFreq: 180,
    maxFreq: 800,
    exhaustType: 'triangle',
    exhaustGain: 0.12,      // motor is QUIET — wind dominates
    harm2Type: 'sine',
    subGain: 0.0,           // no bass at all
    harm2Base: 0.08,
    harm2Max: 0.15,
    noiseBase: 0.5,         // LOTS of wind noise
    noiseMax: 0.9,
    noiseFilterType: 'highpass',  // wind hiss character
    noiseFilterFreq: 1500,
    noiseFilterQ: 0.5,
    crackle: 0,             // no crackle
    crackleGain: 0,
    screamMax: 0.3,
    distortion: 2,
    idleRoughness: 0.03,    // very smooth — steady airflow
    lpfBase: 3000,          // very bright
    lpfRange: 6000,
    volume: 0.18,
    lfoRate: 80,            // fast LFO = motor vibration
  },
  airconditioner: {
    name: 'Air Conditioner',
    idleFreq: 30,
    maxFreq: 85,
    exhaustType: 'square',
    exhaustGain: 0.7,       // drone is the MAIN sound
    harm2Type: 'square',
    subGain: 0.9,           // MASSIVE bass
    harm2Base: 0.2,
    harm2Max: 0.35,
    noiseBase: 0.08,        // some rattle
    noiseMax: 0.2,
    noiseFilterType: 'bandpass',
    noiseFilterFreq: 200,   // low rattle frequency
    noiseFilterQ: 2.0,
    crackle: 0,
    crackleGain: 0,
    screamMax: 0.05,
    distortion: 18,
    idleRoughness: 0.3,     // compressor throb
    lpfBase: 300,           // VERY dark
    lpfRange: 1200,
    volume: 0.25,
    lfoRate: 2.5,           // slow compressor pulse
  },
  coffee: {
    name: 'Coffee Maker',
    idleFreq: 22,
    maxFreq: 60,
    exhaustType: 'sine',
    exhaustGain: 0.06,      // barely audible hum
    harm2Type: 'sine',
    subGain: 0.08,
    harm2Base: 0.02,
    harm2Max: 0.04,
    noiseBase: 0.25,        // water/steam noise
    noiseMax: 0.5,
    noiseFilterType: 'bandpass',
    noiseFilterFreq: 600,   // mid-band water sound
    noiseFilterQ: 0.6,      // wide Q — washy
    crackle: 0.007,         // more frequent bubbles
    crackleGain: 0.85,      // LOUD — bubbles are the sound
    crackleBurstMin: 200,   // long soft bubble bursts
    crackleBurstMax: 800,
    screamMax: 0.0,         // never screams
    hiNoiseMax: 0.55,       // LOUD steam hiss at redline
    distortion: 1,          // very soft
    idleRoughness: 0.7,     // strong gurgling rhythm
    lpfBase: 600,           // slightly less muffled — hear the bubbles
    lpfRange: 1200,
    volume: 0.45,
    lfoRate: 2,             // slow percolating rhythm
  },
  fan: {
    name: 'Ceiling Fan',
    idleFreq: 55,
    maxFreq: 220,
    exhaustType: 'sine',
    exhaustGain: 0.35,      // smooth hum — moderate
    harm2Type: 'sine',
    subGain: 0.4,
    harm2Base: 0.04,
    harm2Max: 0.08,
    noiseBase: 0.01,        // nearly silent noise
    noiseMax: 0.04,
    noiseFilterType: 'bandpass',
    noiseFilterFreq: 300,
    noiseFilterQ: 1.0,
    crackle: 0,
    crackleGain: 0,
    screamMax: 0.08,
    distortion: 1,          // clean
    idleRoughness: 0.95,    // HUGE blade whoosh pulsing
    lpfBase: 600,
    lpfRange: 2500,
    volume: 0.25,
    lfoRate: 3,             // blade passing rate
  },
  popcorn: {
    name: 'Popcorn Popper',
    idleFreq: 70,
    maxFreq: 350,
    exhaustType: 'square',
    exhaustGain: 0.15,      // heating element buzz, quiet
    harm2Type: 'square',
    subGain: 0.05,
    harm2Base: 0.1,
    harm2Max: 0.2,
    noiseBase: 0.1,
    noiseMax: 0.25,
    noiseFilterType: 'highpass',
    noiseFilterFreq: 800,
    noiseFilterQ: 0.5,
    crackle: 0.012,         // dense popping
    crackleGain: 0.8,       // LOUD crackle — this IS the sound
    crackleBurstMin: 30,    // short sharp pops
    crackleBurstMax: 150,
    screamMax: 0.15,
    distortion: 25,         // extreme crunch on the pops
    idleRoughness: 0.4,
    lpfBase: 1500,          // bright — hear the pops
    lpfRange: 5000,
    volume: 0.20,
    lfoRate: 6,
  },
};

const DEFAULT_PRESET = ENGINE_PRESETS.blower;

function createEngine(ctx, engineType) {
  const P = ENGINE_PRESETS[engineType] || DEFAULT_PRESET;

  let running = false;
  let nodes = null;

  function buildGraph() {
    // --- Exhaust fundamental ---
    const exhaust = ctx.createOscillator();
    exhaust.type = P.exhaustType;
    exhaust.frequency.value = P.idleFreq;
    const exhaustGainNode = ctx.createGain();
    exhaustGainNode.gain.value = P.exhaustGain;

    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(P.distortion);
    shaper.oversample = '2x';

    // --- Sub-harmonic ---
    const sub = ctx.createOscillator();
    sub.type = 'sawtooth';
    sub.frequency.value = P.idleFreq / 2;
    const subGain = ctx.createGain();
    subGain.gain.value = P.subGain;

    // --- Second harmonic ---
    const harm2 = ctx.createOscillator();
    harm2.type = P.harm2Type;
    harm2.frequency.value = P.idleFreq * 2;
    const harm2Gain = ctx.createGain();
    harm2Gain.gain.value = P.harm2Base;

    // --- Third harmonic ---
    const harm3 = ctx.createOscillator();
    harm3.type = 'sawtooth';
    harm3.frequency.value = P.idleFreq * 3;
    const harm3Gain = ctx.createGain();
    harm3Gain.gain.value = 0.0;

    // --- Redline scream ---
    const scream = ctx.createOscillator();
    scream.type = 'sawtooth';
    scream.frequency.value = P.idleFreq * 5;
    const screamShaper = ctx.createWaveShaper();
    screamShaper.curve = makeDistortionCurve(20);
    const screamBPF = ctx.createBiquadFilter();
    screamBPF.type = 'bandpass';
    screamBPF.frequency.value = P.idleFreq * 5;
    screamBPF.Q.value = 2.0;
    const screamGain = ctx.createGain();
    screamGain.gain.value = 0.0;

    // --- Mechanical noise ---
    const noiseNode = createNoiseSource(ctx);
    const noiseBPF = ctx.createBiquadFilter();
    noiseBPF.type = P.noiseFilterType;
    noiseBPF.frequency.value = P.noiseFilterFreq;
    noiseBPF.Q.value = P.noiseFilterQ;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = P.noiseBase;

    // --- Crackle source (bubbles / pops) ---
    let crackleNode = null;
    let crackleShaper = null;
    let crackleBPF = null;
    let crackleGainNode = null;
    if (P.crackle > 0) {
      crackleNode = createCrackleSource(ctx, P.crackle, P.crackleBurstMin, P.crackleBurstMax);
      crackleShaper = ctx.createWaveShaper();
      crackleShaper.curve = makeDistortionCurve(P.distortion);
      crackleBPF = ctx.createBiquadFilter();
      crackleBPF.type = 'bandpass';
      crackleBPF.frequency.value = P.noiseFilterFreq;
      crackleBPF.Q.value = 0.8;
      crackleGainNode = ctx.createGain();
      crackleGainNode.gain.value = P.crackleGain;
    }

    // --- High-freq noise hiss ---
    const noiseHi = createNoiseSource(ctx);
    const noiseHiBPF = ctx.createBiquadFilter();
    noiseHiBPF.type = 'highpass';
    noiseHiBPF.frequency.value = 3000;
    const noiseHiGain = ctx.createGain();
    noiseHiGain.gain.value = 0.0;

    // --- Amplitude LFO (blade whoosh / compressor throb) ---
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = P.lfoRate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = P.idleRoughness;

    // --- Mixer ---
    const mixer = ctx.createGain();
    mixer.gain.value = 1.0;

    // --- Master output ---
    const master = ctx.createGain();
    master.gain.value = P.volume;

    // --- Low-pass filter ---
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = P.lpfBase;
    lpf.Q.value = 0.7;

    // --- Wiring ---
    exhaust.connect(shaper);
    shaper.connect(exhaustGainNode);
    exhaustGainNode.connect(mixer);

    sub.connect(subGain);
    subGain.connect(mixer);

    harm2.connect(harm2Gain);
    harm2Gain.connect(mixer);

    harm3.connect(harm3Gain);
    harm3Gain.connect(mixer);

    scream.connect(screamShaper);
    screamShaper.connect(screamBPF);
    screamBPF.connect(screamGain);
    screamGain.connect(mixer);

    noiseNode.connect(noiseBPF);
    noiseBPF.connect(noiseGain);
    noiseGain.connect(mixer);

    if (crackleNode) {
      crackleNode.connect(crackleShaper);
      crackleShaper.connect(crackleBPF);
      crackleBPF.connect(crackleGainNode);
      crackleGainNode.connect(mixer);
    }

    noiseHi.connect(noiseHiBPF);
    noiseHiBPF.connect(noiseHiGain);
    noiseHiGain.connect(mixer);

    lfo.connect(lfoGain);
    lfoGain.connect(mixer.gain);

    mixer.connect(lpf);
    lpf.connect(master);
    master.connect(ctx.destination);

    return {
      exhaust, exhaustGainNode, sub, harm2, harm3, scream,
      noiseNode, noiseHi, lfo,
      crackleNode, crackleShaper, crackleBPF, crackleGainNode,
      shaper, screamShaper, screamBPF, screamGain,
      subGain, harm2Gain, harm3Gain, noiseBPF, noiseGain,
      noiseHiBPF, noiseHiGain, lfoGain,
      mixer, lpf, master
    };
  }

  function setSpeed(speed) {
    if (!nodes || !running) return;
    const t = Math.max(0, Math.min(1, speed / 100));
    const freq = P.idleFreq + t * (P.maxFreq - P.idleFreq);
    const now = ctx.currentTime;
    const ramp = 0.05;

    // Oscillator frequencies
    nodes.exhaust.frequency.setTargetAtTime(freq, now, ramp);
    nodes.sub.frequency.setTargetAtTime(freq / 2, now, ramp);
    nodes.harm2.frequency.setTargetAtTime(freq * 2, now, ramp);
    nodes.harm3.frequency.setTargetAtTime(freq * 3, now, ramp);

    // Exhaust gain stays constant (set by preset)
    // but can swell slightly at high RPM
    nodes.exhaustGainNode.gain.setTargetAtTime(
      P.exhaustGain * (1 + t * 0.3), now, ramp);

    // Scream
    nodes.scream.frequency.setTargetAtTime(freq * 5, now, ramp);
    nodes.screamBPF.frequency.setTargetAtTime(freq * 5, now, ramp);

    // Noise band tracks speed
    nodes.noiseBPF.frequency.setTargetAtTime(
      P.noiseFilterFreq + t * P.noiseFilterFreq * 2, now, ramp);

    // LFO rate increases with speed
    const lfoRate = P.lfoRate * (1 + t * 1.5);
    nodes.lfo.frequency.setTargetAtTime(lfoRate, now, ramp);

    // Roughness fades out at higher speeds (engine smooths out)
    const roughness = P.idleRoughness * (1 - t * 0.7);
    nodes.lfoGain.gain.setTargetAtTime(roughness, now, ramp);

    // Low-pass opens up
    const lpfFreq = P.lpfBase + t * t * P.lpfRange;
    nodes.lpf.frequency.setTargetAtTime(lpfFreq, now, ramp);
    nodes.lpf.Q.setTargetAtTime(0.7 + t * 2, now, ramp);

    // Noise
    const noiseVol = P.noiseBase + t * (P.noiseMax - P.noiseBase);
    nodes.noiseGain.gain.setTargetAtTime(noiseVol, now, ramp);

    // Crackle gets denser/louder at speed
    if (nodes.crackleGainNode) {
      const crackleVol = P.crackleGain * (0.7 + t * 0.8);
      nodes.crackleGainNode.gain.setTargetAtTime(crackleVol, now, ramp);
      nodes.crackleBPF.frequency.setTargetAtTime(
        P.noiseFilterFreq + t * 1000, now, ramp);
    }

    // Second harmonic
    const h2Vol = P.harm2Base + t * (P.harm2Max - P.harm2Base);
    nodes.harm2Gain.gain.setTargetAtTime(h2Vol, now, ramp);

    // Third harmonic fades in above 40%
    const h3 = t > 0.4 ? (t - 0.4) / 0.6 : 0;
    nodes.harm3Gain.gain.setTargetAtTime(h3 * 0.3, now, ramp);

    // Scream fades in above 55%
    const screamT = t > 0.55 ? (t - 0.55) / 0.45 : 0;
    nodes.screamGain.gain.setTargetAtTime(screamT * screamT * P.screamMax, now, ramp);

    // High-freq noise hiss above 50% (steam for coffee, wind for others)
    const hiMax = P.hiNoiseMax || 0.15;
    const hiT = t > 0.5 ? (t - 0.5) / 0.5 : 0;
    nodes.noiseHiGain.gain.setTargetAtTime(hiT * hiMax, now, ramp);

    // Volume swell
    nodes.master.gain.setTargetAtTime(P.volume * (1 + t * 0.4), now, ramp);
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
    if (nodes.crackleNode) nodes.crackleNode.start();
    running = true;
  }

  function stop() {
    if (!running || !nodes) return;
    running = false;
    const now = ctx.currentTime;
    nodes.master.gain.setTargetAtTime(0, now, 0.02);
    const n = nodes;
    setTimeout(() => {
      [n.exhaust, n.sub, n.harm2, n.harm3, n.scream, n.lfo,
       n.noiseNode, n.noiseHi, n.crackleNode].forEach(osc => {
        if (osc) try { osc.stop(); } catch (e) {}
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

// Continuous white noise
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

// Random bursts of noise with silence between — sounds like
// bubbling (long soft bursts) or crackling/popping (short sharp bursts)
function createCrackleSource(ctx, density, burstMin, burstMax) {
  burstMin = burstMin || 40;
  burstMax = burstMax || 300;
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let inBurst = false;
  let burstLen = 0;
  let burstTotal = 0;
  for (let i = 0; i < length; i++) {
    if (!inBurst && Math.random() < density) {
      inBurst = true;
      burstTotal = Math.floor(Math.random() * (burstMax - burstMin) + burstMin);
      burstLen = burstTotal;
    }
    if (inBurst) {
      // Envelope: fade in/out for softer bubbles (longer bursts)
      const pos = 1 - burstLen / burstTotal;
      const env = Math.sin(pos * Math.PI); // hann-ish window
      data[i] = (Math.random() * 2 - 1) * env;
      burstLen--;
      if (burstLen <= 0) inBurst = false;
    } else {
      data[i] = 0;
    }
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}
