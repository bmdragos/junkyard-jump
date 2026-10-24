// Autoplay Modern through its real UI (chrome-devtools evaluate_script sourcePath).
// window.AUTO = { targets: [launch speed per level], shotAt: 'state name to stop at' }
async () => {
  const M = JJModern; M.paused = true;
  const cfg = window.AUTO || { targets: [34] };
  const trail = [];
  let last = '';
  const run = n => { for (let i = 0; i < n; i++) { M.step(); if (M.state !== last) { trail.push(M.state); last = M.state; } } };
  const frames = n => run(n * 4);
  const click = (x, y) => { M.input.clicks.push({ x, y }); frames(1); };
  const until = (pred, max = 20000) => { for (let i = 0; i < max && !pred(); i++) run(1); return pred(); };
  M.setState('splash'); frames(2);
  click(370, 140);                                      // START
  for (const slot of [0, 1, 2]) {
    for (let tries = 0; tries < 6; tries++) {
      until(() => !M.game.moving);
      frames(1);
      const before = M.game.pieces.filter(Boolean).length;
      click(143, 82);                                   // SELECT
      if (M.state === 'pickup') break;
      click(55, 82);                                    // NEXT
    }
    until(() => M.state !== 'pickup');
  }
  until(() => M.state === 'finished');
  if (cfg.shotAt === 'finished') { M.render(); return JSON.stringify({ trail, game: M.game.pieces }); }
  click(54, 85);                                        // YES
  until(() => M.state === 'run');
  const results = [];
  for (const target of cfg.targets) {
    until(() => M.state === 'run' && M.game.t >= 55);
    const g = M.game;
    while (M.state === 'run' && !g.outcome) { M.input.gas = g.speed < target; run(1); }
    M.input.gas = false;
    until(() => M.state !== 'run');
    results.push({ level: g.level, target, outcome: g.outcome, money: g.money, state: M.state });
    if (cfg.shotAt === M.state) break;
    if (M.state === 'safe') click(273, 214);            // NEXT JUMP
    else break;
  }
  M.render();
  return JSON.stringify({ results, trail: trail.slice(-30) });
}
