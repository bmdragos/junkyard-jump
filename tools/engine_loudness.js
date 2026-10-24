// Loudness-match the Modern engine sounds (run in the Modern page with chrome-devtools
// evaluate_script sourcePath). Renders each preset offline at rpm 0.2 / 0.5 / 0.85, full
// throttle, through a K-weighting filter (ITU BS.1770: high-pass ~38 Hz + high shelf +4 dB),
// and returns each engine's loudness and the `volume` that brings it to the median.
async () => {
  const SR = 44100, SECONDS = 2.5;
  const out = {};
  for (const type of Object.keys(ENGINE_PRESETS)) {
    const levels = [];
    for (const rpm of [0.2, 0.5, 0.85]) {
      const oc = new OfflineAudioContext(1, SR * SECONDS, SR);
      const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.5;
      const shelf = oc.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 1681; shelf.gain.value = 4;
      hp.connect(shelf); shelf.connect(oc.destination);
      const e = createEngine(oc, type, { prescheduleSeconds: SECONDS, destination: hp });
      e.start();
      e.setRpm(rpm, 1);
      const buf = await oc.startRendering();
      const d = buf.getChannelData(0);
      let sum = 0, n = 0;
      for (let i = Math.floor(SR * 0.8); i < d.length; i++) { sum += d[i] * d[i]; n++; }
      levels.push(-0.691 + 10 * Math.log10(sum / n));
    }
    out[type] = { lufs: levels.map(v => +v.toFixed(1)), mean: levels.reduce((a, b) => a + b) / levels.length, volume: ENGINE_PRESETS[type].volume };
  }
  const means = Object.values(out).map(o => o.mean).sort((a, b) => a - b);
  const target = means[Math.floor(means.length / 2)];
  for (const o of Object.values(out)) o.matchedVolume = +(o.volume * Math.pow(10, (target - o.mean) / 20)).toFixed(3);
  return JSON.stringify({ target: +target.toFixed(1), engines: out });
}
