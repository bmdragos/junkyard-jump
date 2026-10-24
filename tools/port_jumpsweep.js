// For each pile count 1..6 and launch speed, jump from frame 267 with that speed and report the outcome.
// Uses the best car (chair + knobby + fan). chrome-devtools evaluate_script sourcePath on the Classic page.
async () => {
  const J = JJClassic; J.paused = true;
  const S = await (await fetch('assets/classic/score.json')).json();
  const lab = f => { let best = ''; for (const [fr, l] of S.labels) if (fr <= f) best = l; return best; };
  const out = {};
  for (let piles = 1; piles <= 6; piles++) {
    out[piles] = {};
    for (let speed = 10; speed <= 80; speed += 1) {
      J.G.gselectedPieces = ['chair', 'wheel2', 'fan'];
      J.G.gnumberOfJunkPiles = piles;
      J.go('jumpstart');
      for (let i = 0; i < 200 && J.frame !== 267; i++) J.tick();
      const off = J.sprites[42].behaviors[0];
      off.determinePerformance();
      off.reset(); off.speed = speed; off.distanceCounter = 0; off.moveFlag = 1;
      J.G.ggiveItGas = 0;
      // keep speed constant on the runup: refill the 0.5 decel each tick
      let t = 0;
      while (lab(J.frame) === 'runup' && t++ < 400) { off.speed = speed; J.sprites[48].ovr.rotation = 50; J.tick(); }
      while (/^jump/.test(lab(J.frame)) && t++ < 800) J.tick();
      out[piles][speed] = lab(J.frame);
    }
  }
  const summary = {};
  for (const p in out) summary[p] = Object.entries(out[p]).filter(([, v]) => v === 'safe').map(([k]) => +k);
  return JSON.stringify(summary);
}
