// Headless-ish autoplay of the Classic port (chrome-devtools evaluate_script sourcePath).
// window.AUTO = { targets: [speed for jump1, jump2, ...], maxTicks }
// Builds the car through the real UI (first affordable item each step), holds each target speed
// on the runup, then clicks NEXT JUMP after a safe landing. Returns the label trail.
async () => {
  const J = JJClassic; J.paused = true;
  const cfg = window.AUTO || { targets: [27] };
  const labels = {}; // frame -> label for reporting
  const S = await (await fetch('assets/classic/score.json')).json();
  for (const [f, l] of S.labels) labels[f] = l;
  const lab = f => { let best = ''; for (const [fr, l] of S.labels) if (fr <= f) best = l; return best; };
  const click = (x, y) => { J.events.push({ type: 'down', x, y }); J.events.push({ type: 'up', x, y }); };
  const trail = []; let lastLab = '';
  const run = n => { for (let i = 0; i < n; i++) { J.tick(); const l = lab(J.frame); if (l !== lastLab) { trail.push(l + '@' + J.frame); lastLab = l; } } };
  const waitLab = (l, max = 3000) => { for (let i = 0; i < max && lab(J.frame) !== l; i++) run(1); return lab(J.frame) === l; };
  const txt = n => (J.sprites[n].prop('member') ? null : null);
  J.go('splash'); run(2);
  click(375, 160); run(3);
  // pick parts: wait until buttons visible, choose first item whose text has a cost we can pay
  const pick = () => {
    for (let tries = 0; tries < 10; tries++) {
      for (let i = 0; i < 300 && !J.sprites[28].visible; i++) run(1);
      const before = J.G.gselectedPieces.length;
      const cost = J.G.gpieceCost;
      if (cost !== 'NOT AVAILABLE' && cost <= J.G.guserMoney) { click(143, 82); run(2); if (J.G.gselectedPieces.length > before || lab(J.frame) === 'pickup') return true; }
      click(55, 82); run(3);
    }
    return false;
  };
  for (let p = 0; p < 3; p++) { pick(); for (let i = 0; i < 400 && !['wheels', 'engine', 'finished'].includes(lab(J.frame)) ; i++) run(1); if (lab(J.frame) === 'pickup') run(1); while (lab(J.frame) === 'pickup') run(1); }
  waitLab('finished'); run(5);
  click(54, 85);
  const results = [];
  for (let lvl = 0; lvl < cfg.targets.length; lvl++) {
    if (!waitLab('runup', 5000)) { results.push('no runup: ' + lab(J.frame)); break; }
    const target = cfg.targets[lvl];
    const off = () => J.sprites[42].behaviors[0];
    let t = 0;
    while (lab(J.frame) === 'runup' && t++ < 3000) {
      const sp = J.nv(off().speed), tach = J.sprites[48].prop('rotation');
      J.G.ggiveItGas = (sp < target && tach < 300) ? 1 : 0;
      run(1);
    }
    J.G.ggiveItGas = 0;
    for (let i = 0; i < 300 && /^jump/.test(lab(J.frame)); i++) run(1);
    const outcome = lab(J.frame);
    results.push({ level: J.G.gnumberOfJunkPiles, target, outcome, money: J.G.guserMoney, pieces: J.G.gselectedPieces.slice() });
    run(20);
    if (outcome === 'safe') { click(273, 214); run(3); } else break;
  }
  return JSON.stringify({ results, trail: trail.slice(-40) });
}
