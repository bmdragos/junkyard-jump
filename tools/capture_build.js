// Capture the build sequence (conveyors, crane pickups, confirm, assembly) as data URLs,
// in Classic (JJClassic) or Modern (JJModern), picking the parts in window.PICKS.
// Used to compare Modern's screens against the original's (chrome-devtools evaluate_script).
async () => {
  const picks = window.PICKS || ['cart', 'wheel4', 'coffee'];
  const shots = {};
  const canvas = document.getElementById('game');
  const snap = name => { shots[name] = canvas.toDataURL('image/png'); };
  if (window.JJClassic) {
    const J = JJClassic; J.paused = true;
    const label = f => { let best = ''; for (const [fr, l] of J.labels) if (fr <= f) best = l; return best; };
    const click = (x, y) => { J.events.push({ type: 'down', x, y }); J.events.push({ type: 'up', x, y }); J.tick(); };
    J.go('splash'); J.tick(); click(375, 160);
    const stage = ['chasis', 'wheels', 'engine'];
    for (let s = 0; s < 3; s++) {
      for (let tries = 0; tries < 8; tries++) {
        for (let i = 0; i < 300 && !J.sprites[28].visible; i++) J.tick();
        if (J.G.gselectedItem === picks[s]) break;
        if (tries === 0) { J.render(); snap(stage[s] + '_stopped_first'); }
        click(55, 82);
        for (let i = 0; i < 6; i++) J.tick();
        if (tries === 0) { J.render(); snap(stage[s] + '_next_mid'); }
      }
      J.render(); snap(stage[s] + '_stopped');
      click(143, 82);
      for (const f of [50, 62, 75, 95]) { while (J.frame < f && J.frame >= 45) J.tick(); J.render(); snap(stage[s] + '_pickup' + f); }
      for (let i = 0; i < 400 && J.frame >= 45 && J.frame < 103; i++) J.tick();
      for (let i = 0; i < 3; i++) J.tick();
    }
    for (let i = 0; i < 300 && J.frame !== 33; i++) J.tick();
    J.render(); snap('finished');
    click(54, 85);
    for (const f of [125, 132, 134, 140, 150, 160, 165]) { for (let i = 0; i < 400 && J.frame < f; i++) J.tick(); J.render(); snap('assemble' + f); }
    return JSON.stringify({ picks: J.G.gselectedPieces, shots });
  }
  const M = JJModern; M.paused = true;
  const frames = n => { for (let i = 0; i < n * 4; i++) M.step(); };
  const click = (x, y) => { M.input.clicks.push({ x, y }); frames(1); };
  M.newGame(); M.setState('splash'); frames(2); click(370, 140);
  const stage = ['chasis', 'wheels', 'engine'];
  for (let s = 0; s < 3; s++) {
    for (let tries = 0; tries < 8; tries++) {
      for (let i = 0; i < 300 && M.game.moving; i++) frames(1);
      if (M.game.list[M.game.index] === picks[s]) break;
      if (tries === 0) { M.render(); snap(stage[s] + '_stopped_first'); }
      click(55, 82);
      frames(5);
      if (tries === 0) { M.render(); snap(stage[s] + '_next_mid'); }
    }
    M.render(); snap(stage[s] + '_stopped');
    click(143, 82);
    for (const f of [50, 62, 75, 95]) { for (let i = 0; i < 400 && M.state === 'pickup' && M.game.f < f; i++) M.step(); M.render(); snap(stage[s] + '_pickup' + f); }
    for (let i = 0; i < 4000 && M.state === 'pickup'; i++) M.step();
    frames(1);
  }
  for (let i = 0; i < 4000 && M.state !== 'finished'; i++) M.step();
  M.render(); snap('finished');
  click(54, 85);
  for (const f of [125, 132, 134, 140, 150, 160, 165]) { for (let i = 0; i < 4000 && M.state === 'assemble' && M.game.f < f; i++) M.step(); M.render(); snap('assemble' + f); }
  return JSON.stringify({ picks: M.game.pieces, shots });
}
