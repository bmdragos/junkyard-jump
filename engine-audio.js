// ============================================================
// ENGINE AUDIO SYNTHESIZER (Modern mode)
// Procedural engine sounds, one personality per engine part. No samples.
//
// Usage:
//   const engine = createEngine(audioContext, 'blower');
//   engine.start();
//   engine.setRpm(rpm, throttle);  // rpm 0..1 from the tachometer, throttle 0..1
//   engine.blow();                 // sputter, backfire and die (blown engine)
//   engine.stop();
//
// rpm follows the tach (game.js maps idle..full boost to 0..1), so the redline
// scream lines up with the gauge's red zone whatever the car's rating.
// ============================================================

// Engine personalities:
//   blower         -> mostly WIND NOISE with a high motor whine
//   airconditioner -> square-wave compressor DRONE with a slow throb
//   coffee         -> BUBBLING bursts over a mains hum, steam hiss up high
//   fan            -> smooth SINE HUM with rhythmic blade whoosh
//   popcorn        -> sharp crunchy POPS over a heating-element buzz
// `volume` values are loudness-matched by tools/engine_loudness.js (A-weighted RMS
// at mid revs, full throttle), so no engine is much louder than another.
const ENGINE_PRESETS = {
  blower: {
    name: 'Hair Blower',
    idleFreq: 180, maxFreq: 800,
    exhaustType: 'triangle', exhaustGain: 0.12,
    harm2Type: 'sine', harm2Base: 0.08, harm2Max: 0.15,
    subGain: 0.0,
    noiseBase: 0.5, noiseMax: 0.9,
    noiseFilterType: 'highpass', noiseFilterFreq: 1500, noiseFilterQ: 0.5,
    crackle: 0, crackleGain: 0,
    screamMax: 0.3, distortion: 2,
    idleRoughness: 0.03, lfoRate: 80,
    lpfBase: 3000, lpfRange: 6000,
    volume: 0.18,
  },
  airconditioner: {
    name: 'Air Conditioner',
    idleFreq: 45, maxFreq: 120,          // was 30-85 Hz: mostly below small speakers
    exhaustType: 'square', exhaustGain: 0.7,
    harm2Type: 'square', harm2Base: 0.2, harm2Max: 0.35,
    subGain: 0.45,
    noiseBase: 0.08, noiseMax: 0.2,
    noiseFilterType: 'bandpass', noiseFilterFreq: 200, noiseFilterQ: 2.0,
    crackle: 0, crackleGain: 0,
    screamMax: 0.05, distortion: 18,
    idleRoughness: 0.3, lfoRate: 2.5,
    lpfBase: 400, lpfRange: 1400,
    volume: 0.07,
  },
  coffee: {
    name: 'Coffee Maker',
    idleFreq: 60, maxFreq: 130,          // mains-hum range (was 22-60 Hz, inaudible)
    exhaustType: 'sine', exhaustGain: 0.08,
    harm2Type: 'sine', harm2Base: 0.04, harm2Max: 0.07,
    subGain: 0.0,
    noiseBase: 0.25, noiseMax: 0.5,
    noiseFilterType: 'bandpass', noiseFilterFreq: 600, noiseFilterQ: 0.6,
    crackle: 0.007, crackleGain: 0.85, crackleBurstMin: 200, crackleBurstMax: 800,
    screamMax: 0.0, hiNoiseMax: 0.55,    // steam hiss at the redline
    distortion: 1,
    idleRoughness: 0.7, lfoRate: 2,      // percolating rhythm
    lpfBase: 600, lpfRange: 1200,
    volume: 0.45,
  },
  fan: {
    name: 'Ceiling Fan',
    idleFreq: 55, maxFreq: 220,
    exhaustType: 'sine', exhaustGain: 0.35,
    harm2Type: 'sine', harm2Base: 0.04, harm2Max: 0.08,
    subGain: 0.4,
    noiseBase: 0.01, noiseMax: 0.04,
    noiseFilterType: 'bandpass', noiseFilterFreq: 300, noiseFilterQ: 1.0,
    crackle: 0, crackleGain: 0,
    screamMax: 0.08, distortion: 1,
    idleRoughness: 0.95, lfoRate: 3,     // blade passing
    lpfBase: 600, lpfRange: 2500,
    volume: 0.15,
  },
  popcorn: {
    name: 'Popcorn Popper',
    idleFreq: 70, maxFreq: 350,
    exhaustType: 'square', exhaustGain: 0.15,
    harm2Type: 'square', harm2Base: 0.1, harm2Max: 0.2,
    subGain: 0.05,
    noiseBase: 0.1, noiseMax: 0.25,
    noiseFilterType: 'highpass', noiseFilterFreq: 800, noiseFilterQ: 0.5,
    crackle: 0.012, crackleGain: 0.8, crackleBurstMin: 30, crackleBurstMax: 150,
    screamMax: 0.15, distortion: 25,
    idleRoughness: 0.4, lfoRate: 6,
    lpfBase: 1500, lpfRange: 5000,
    volume: 0.244,
  },
};

const DEFAULT_PRESET = ENGINE_PRESETS.blower;
const SCREAM_FROM = 0.65;     // rpm where the redline scream starts (tach ~185 of 270)
const CRACKLE_CHUNK = 2;      // seconds of bubbles/pops generated at a time

// opts.prescheduleSeconds: schedule that much crackle up front instead of with a timer
// (for rendering in an OfflineAudioContext, where timers don't advance audio time)
function createEngine(ctx, engineType, opts = {}) {
  const P = ENGINE_PRESETS[engineType] || DEFAULT_PRESET;
  let running = false;
  let nodes = null;
  let rpm = 0;
  let crackleTimer = null;
  let nextChunkAt = 0;

  function buildGraph() {
    const exhaust = ctx.createOscillator();
    exhaust.type = P.exhaustType;
    exhaust.frequency.value = P.idleFreq;
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(P.distortion);
    shaper.oversample = '2x';
    const exhaustGainNode = ctx.createGain();
    exhaustGainNode.gain.value = P.exhaustGain;

    const sub = ctx.createOscillator();
    sub.type = 'sawtooth';
    sub.frequency.value = P.idleFreq / 2;
    const subGain = ctx.createGain();
    subGain.gain.value = P.subGain;

    const harm2 = ctx.createOscillator();
    harm2.type = P.harm2Type;
    harm2.frequency.value = P.idleFreq * 2;
    const harm2Gain = ctx.createGain();
    harm2Gain.gain.value = P.harm2Base;

    const harm3 = ctx.createOscillator();
    harm3.type = 'sawtooth';
    harm3.frequency.value = P.idleFreq * 3;
    const harm3Gain = ctx.createGain();
    harm3Gain.gain.value = 0;

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
    screamGain.gain.value = 0;

    const noiseNode = createNoiseSource(ctx);
    const noiseBPF = ctx.createBiquadFilter();
    noiseBPF.type = P.noiseFilterType;
    noiseBPF.frequency.value = P.noiseFilterFreq;
    noiseBPF.Q.value = P.noiseFilterQ;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = P.noiseBase;

    // bubbles / pops: freshly generated chunks feed crackleIn (see scheduleCrackle)
    let crackleIn = null, crackleBPF = null, crackleGainNode = null;
    if (P.crackle > 0) {
      crackleIn = ctx.createGain();
      const crackleShaper = ctx.createWaveShaper();
      crackleShaper.curve = makeDistortionCurve(P.distortion);
      crackleBPF = ctx.createBiquadFilter();
      crackleBPF.type = 'bandpass';
      crackleBPF.frequency.value = P.noiseFilterFreq;
      crackleBPF.Q.value = 0.8;
      crackleGainNode = ctx.createGain();
      crackleGainNode.gain.value = P.crackleGain;
      crackleIn.connect(crackleShaper);
      crackleShaper.connect(crackleBPF);
      crackleBPF.connect(crackleGainNode);
    }

    const noiseHi = createNoiseSource(ctx);
    const noiseHiBPF = ctx.createBiquadFilter();
    noiseHiBPF.type = 'highpass';
    noiseHiBPF.frequency.value = 3000;
    const noiseHiGain = ctx.createGain();
    noiseHiGain.gain.value = 0;

    // amplitude LFO: blade whoosh / compressor throb / percolation
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = P.lfoRate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = P.idleRoughness;

    const mixer = ctx.createGain();
    mixer.gain.value = 1.0;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = P.lpfBase;
    lpf.Q.value = 0.7;
    // cut what small speakers can't play anyway, so it doesn't eat headroom
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 35;
    const master = ctx.createGain();
    master.gain.value = P.volume;

    exhaust.connect(shaper); shaper.connect(exhaustGainNode); exhaustGainNode.connect(mixer);
    sub.connect(subGain); subGain.connect(mixer);
    harm2.connect(harm2Gain); harm2Gain.connect(mixer);
    harm3.connect(harm3Gain); harm3Gain.connect(mixer);
    scream.connect(screamShaper); screamShaper.connect(screamBPF); screamBPF.connect(screamGain); screamGain.connect(mixer);
    noiseNode.connect(noiseBPF); noiseBPF.connect(noiseGain); noiseGain.connect(mixer);
    if (crackleGainNode) crackleGainNode.connect(mixer);
    noiseHi.connect(noiseHiBPF); noiseHiBPF.connect(noiseHiGain); noiseHiGain.connect(mixer);
    lfo.connect(lfoGain); lfoGain.connect(mixer.gain);
    mixer.connect(lpf); lpf.connect(hpf); hpf.connect(master); master.connect(opts.destination || ctx.destination);

    return {
      exhaust, exhaustGainNode, sub, harm2, harm3, scream, noiseNode, noiseHi, lfo,
      crackleIn, crackleBPF, crackleGainNode, crackleSources: [],
      screamBPF, screamGain, subGain, harm2Gain, harm3Gain, noiseBPF, noiseGain,
      noiseHiGain, lfoGain, lpf, master,
    };
  }

  // Bubbles and pops are generated a chunk at a time, each one new random audio
  // (a single looped buffer repeated audibly every two seconds), denser at higher rpm.
  function scheduleCrackle() {
    if (!nodes || !nodes.crackleIn) return;
    const ahead = opts.prescheduleSeconds || 1.0;
    while (nextChunkAt < ctx.currentTime + ahead) {
      const src = ctx.createBufferSource();
      src.buffer = makeCrackleBuffer(ctx, CRACKLE_CHUNK, P.crackle * (0.6 + 0.8 * rpm), P.crackleBurstMin, P.crackleBurstMax);
      src.connect(nodes.crackleIn);
      src.start(nextChunkAt);
      nodes.crackleSources.push(src);
      if (nodes.crackleSources.length > 4) nodes.crackleSources.shift();
      nextChunkAt += CRACKLE_CHUNK;
    }
    if (!opts.prescheduleSeconds) crackleTimer = setTimeout(scheduleCrackle, 250);
  }

  // rpm 0..1 (from the tach), throttle 0..1 (gas held)
  function setRpm(t, throttle = 1) {
    if (!nodes || !running) return;
    t = Math.max(0, Math.min(1, t));
    const L = Math.max(0, Math.min(1, throttle));
    rpm = t;
    const freq = P.idleFreq + t * (P.maxFreq - P.idleFreq);
    const now = ctx.currentTime;
    const ramp = 0.05;
    const set = (param, v, r = ramp) => param.setTargetAtTime(v, now, r);

    set(nodes.exhaust.frequency, freq);
    set(nodes.sub.frequency, freq / 2);
    set(nodes.harm2.frequency, freq * 2);
    set(nodes.harm3.frequency, freq * 3);
    set(nodes.scream.frequency, freq * 5);
    set(nodes.screamBPF.frequency, freq * 5);

    // under load the engine is louder and harsher; coasting it goes dull (slower ramp)
    const loadRamp = 0.08;
    set(nodes.exhaustGainNode.gain, P.exhaustGain * (1 + t * 0.3) * (0.8 + 0.4 * L), loadRamp);
    set(nodes.noiseBPF.frequency, P.noiseFilterFreq + t * P.noiseFilterFreq * 2);
    set(nodes.lfo.frequency, P.lfoRate * (1 + t * 1.5));
    set(nodes.lfoGain.gain, P.idleRoughness * (1 - t * 0.7));
    set(nodes.lpf.frequency, (P.lpfBase + t * t * P.lpfRange) * (0.75 + 0.5 * L), loadRamp);
    set(nodes.lpf.Q, 0.7 + t * 2);
    set(nodes.noiseGain.gain, P.noiseBase + t * (P.noiseMax - P.noiseBase));
    if (nodes.crackleGainNode) {
      set(nodes.crackleGainNode.gain, P.crackleGain * (0.7 + t * 0.8));
      set(nodes.crackleBPF.frequency, P.noiseFilterFreq + t * 1000);
    }
    set(nodes.harm2Gain.gain, P.harm2Base + t * (P.harm2Max - P.harm2Base));
    const h3 = t > 0.4 ? (t - 0.4) / 0.6 : 0;
    set(nodes.harm3Gain.gain, h3 * 0.3 * (0.5 + 0.7 * L), loadRamp);
    const sT = t > SCREAM_FROM ? (t - SCREAM_FROM) / (1 - SCREAM_FROM) : 0;
    set(nodes.screamGain.gain, sT * sT * P.screamMax * (0.4 + 0.8 * L), loadRamp);
    const hiT = t > 0.5 ? (t - 0.5) / 0.5 : 0;
    set(nodes.noiseHiGain.gain, hiT * (P.hiNoiseMax || 0.15));
    set(nodes.master.gain, P.volume * (1 + t * 0.4) * (0.8 + 0.3 * L), loadRamp);
  }

  // kept for callers that think in mph: 100 mph = full revs
  function setSpeed(speed) { setRpm(speed / 100, 1); }

  function start() {
    if (running) return;
    nodes = buildGraph();
    for (const o of [nodes.exhaust, nodes.sub, nodes.harm2, nodes.harm3, nodes.scream, nodes.lfo, nodes.noiseNode, nodes.noiseHi]) o.start();
    running = true;
    nextChunkAt = ctx.currentTime;
    scheduleCrackle();
  }

  function teardown(n, afterMs) {
    clearTimeout(crackleTimer);
    setTimeout(() => {
      for (const o of [n.exhaust, n.sub, n.harm2, n.harm3, n.scream, n.lfo, n.noiseNode, n.noiseHi, ...n.crackleSources]) {
        try { o.stop(); } catch (e) { /* not started or already stopped */ }
      }
      n.master.disconnect();
    }, afterMs);
  }

  function stop() {
    if (!nodes) return;
    running = false;
    nodes.master.gain.cancelScheduledValues(ctx.currentTime);
    nodes.master.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
    teardown(nodes, 100);
    nodes = null;
  }

  // Blown engine: the pitch sags, the output stutters as it misfires, a few
  // backfires bang, then it dies (about 1.5 s).
  function blow() {
    if (!nodes) return;
    running = false;
    const n = nodes;
    const now = ctx.currentTime;
    for (const o of [n.exhaust, n.sub, n.harm2, n.harm3, n.scream]) {
      const f = o.frequency.value;
      o.frequency.cancelScheduledValues(now);
      o.frequency.setValueAtTime(f, now);
      o.frequency.exponentialRampToValueAtTime(Math.max(12, f * 0.3), now + 1.4);
    }
    const g = n.master.gain;
    const level = Math.max(P.volume, g.value);
    g.cancelScheduledValues(now);
    for (let t = now; t < now + 1.3; t += 0.03 + Math.random() * 0.09) {
      const fade = 1 - (t - now) / 1.5;
      g.setValueAtTime(Math.random() < 0.6 ? level * fade : 0, t);
    }
    g.setTargetAtTime(0, now + 1.3, 0.08);
    const bangs = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < bangs; i++) backfire(now + 0.1 + Math.random() * 1.1, level);
    teardown(n, 1800);
    nodes = null;
  }

  function backfire(at, level) {
    const len = Math.floor(ctx.sampleRate * 0.07);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.18));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const crunch = ctx.createWaveShaper();
    crunch.curve = makeDistortionCurve(30);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.value = Math.min(0.9, level * 3);
    src.connect(crunch); crunch.connect(lp); lp.connect(gain); gain.connect(opts.destination || ctx.destination);
    src.onended = () => gain.disconnect();
    src.start(at);
  }

  return { start, stop, setRpm, setSpeed, blow, get debugNodes() { return nodes; } };
}

// --- Helpers ---

// An odd length puts a sample exactly at x = 0, so silence stays silence: with an even
// length the shaper turned zero input into a small DC offset (it leaked after backfires).
function makeDistortionCurve(amount) {
  const samples = 257;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

// Continuous white noise. Each source loops its own random 5-8 s buffer: a short shared
// loop (it was 2 s) repeats audibly under the engine.
function createNoiseSource(ctx) {
  const length = Math.floor(ctx.sampleRate * (5 + Math.random() * 3));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

// One chunk of random noise bursts with silence between: bubbling (long soft
// bursts) or crackling/popping (short sharp bursts). density = burst starts per sample.
function makeCrackleBuffer(ctx, seconds, density, burstMin, burstMax) {
  burstMin = burstMin || 40;
  burstMax = burstMax || 300;
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let burstLen = 0, burstTotal = 0;
  for (let i = 0; i < length; i++) {
    if (burstLen <= 0 && Math.random() < density) {
      burstTotal = Math.floor(Math.random() * (burstMax - burstMin) + burstMin);
      burstLen = burstTotal;
    }
    if (burstLen > 0) {
      const pos = 1 - burstLen / burstTotal;
      data[i] = (Math.random() * 2 - 1) * Math.sin(pos * Math.PI);   // soft-edged burst
      burstLen--;
    }
  }
  return buffer;
}

if (typeof module !== 'undefined') module.exports = { ENGINE_PRESETS, createEngine };
