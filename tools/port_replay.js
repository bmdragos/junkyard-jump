// Replay a per-frame gas sequence in the Classic port (run in the page via chrome-devtools
// evaluate_script sourcePath). Config: window.REPLAY = { gasUrl, cols: [lingo-ish getters], until }
async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  const J = JJClassic;
  const cfg = window.REPLAY || {};
  const gas = await (await fetch(cfg.gasUrl || '.trace/gas.json')).json();
  if (J.frame !== 267) {
    const key = (k, t) => document.dispatchEvent(new KeyboardEvent(t, { key: k, bubbles: true }));
    for (const ch of 'jumpbest') { key(ch, 'keydown'); await W(30); key(ch, 'keyup'); await W(30); }
    for (let i = 0; i < 4000 && J.frame !== 267; i++) await W(2);
  }
  J.paused = true;
  if (cfg.setup) (new Function('J', cfg.setup))(J);
  const off = () => J.sprites[42].behaviors[0];
  const P = (n, k) => J.sprites[n].prop(k);
  const row = () => [J.frame, J.nv(off().speed), J.nv(off().distanceCounter), P(48, 'rotation'), P(53, 'locV'),
    P(57, 'locH'), P(58, 'locH'), P(59, 'locH'), off().currentState];
  const out = [row()];
  for (let i = 0; i < (cfg.ticks || gas.length + 40); i++) {
    J.G.ggiveItGas = i < gas.length ? gas[i] : 0;
    J.tick();
    out.push(row());
    if (J.frame >= (cfg.until || 300)) break;
  }
  window.portTrace = out;
  return out.length;
}
