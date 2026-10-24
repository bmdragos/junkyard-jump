// Drive the original (dirplayer page) through a normal build and the level-1 jump, tracing every
// frame from the runup on. Run with chrome-devtools evaluate_script sourcePath on the dirplayer page.
async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  const c = document.querySelector('canvas'); const v = window.__vm;
  const ev = async e => { let r = v.mcp_eval_lingo(e); if (r && r.then) r = await r; const j = JSON.parse(r); return j.success ? j.result_value : null; };
  const mouse = (type, x, y) => { const o = { clientX: x, clientY: y, bubbles: true, button: 0, buttons: type === 'mousedown' ? 1 : 0, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    c.dispatchEvent(new PointerEvent(type.replace('mouse', 'pointer'), o)); c.dispatchEvent(new MouseEvent(type, o)); };
  const click = async (x, y) => { mouse('mousemove', x, y); mouse('mousedown', x, y); await W(80); mouse('mouseup', x, y); await W(100); };
  const key = (k, type) => { const t = document.querySelector('[tabindex]') || c; t.focus(); const kc = k === ' ' ? 32 : k.toUpperCase().charCodeAt(0);
    t.dispatchEvent(new KeyboardEvent(type, { key: k, code: k === ' ' ? 'Space' : 'Key' + k.toUpperCase(), keyCode: kc, which: kc, bubbles: true })); };
  const frame = async () => +(await ev('_movie.frame'));
  const waitFor = async (pred, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await pred()) return true; await W(20); } return false; };
  const log = [];
  await waitFor(async () => (await frame()) >= 175);
  await click(375, 160);
  const pick = async () => {
    for (let tries = 0; tries < 8; tries++) {
      await waitFor(async () => (await ev('sprite(28).visible')) === '1');
      const txt = await ev('member("itemtext").text');
      log.push(txt);
      if (txt && !/not/i.test(txt)) { await click(143, 82); return; }
      await click(55, 82); await W(200);
    }
  };
  for (const label of ['chasis', 'wheels', 'engine']) { await pick(); await W(500); await waitFor(async () => { const f = await frame(); return f === 15 || f === 23 || f === 33; }); }
  await waitFor(async () => (await frame()) === 33);
  await click(54, 85);
  await waitFor(async () => (await frame()) === 267, 60000);
  window.samples = []; let down = false; let last = null;
  const cfg = window.DRIVE || { tachLimit: 230 };
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const f = await frame();
    const s = [f, await ev('sprite(42).scriptInstanceList[1].speed'), await ev('sprite(42).scriptInstanceList[1].distanceCounter'),
      await ev('sprite(48).rotation'), await ev('sprite(53).locV'), await ev('sprite(57).locH'), await ev('sprite(58).locH'),
      await ev('sprite(59).locH'), await ev('sprite(42).scriptInstanceList[1].currentState'), down ? 1 : 0];
    const k = s.slice(0, 9).join('|'); if (k !== last) { samples.push(s); last = k; }
    if (f >= 300 || (f > 267 && f < 277)) { if (f >= 300) break; }
    if (f <= 267) {
      const want = (+s[3]) < cfg.tachLimit;
      if (want && !down) { key(' ', 'keydown'); down = true; } else if (!want && down) { key(' ', 'keyup'); down = false; } else if (down) key(' ', 'keydown');
    } else if (down) { key(' ', 'keyup'); down = false; }
    await W(3);
  }
  if (down) key(' ', 'keyup');
  await W(1500);
  samples.push(['end', await frame(), log]);
  return samples.length;
}
