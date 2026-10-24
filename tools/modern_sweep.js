// Sweep Modern's continuous jump: which constant launch speeds land safely on each level.
// node tools/modern_sweep.js [chassis wheels engine] [GRAVITY=.. PILE_GAP=.. CARRIER_GAP=..]
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let src = fs.readFileSync(path.join(root, 'modern-jump.js'), 'utf8');
for (const a of process.argv.slice(2)) {
  const m = a.match(/^([A-Z_]+)=(.+)$/);
  if (m) src = src.replace(new RegExp('const ' + m[1] + ' = [^;]+;'), 'const ' + m[1] + ' = ' + m[2] + ';');
}
const MJ = new Function('module', src + '\nreturn MJ;')({});
const geo = JSON.parse(fs.readFileSync(path.join(root, 'assets/modern/jump-geometry.json')));
const B = JSON.parse(fs.readFileSync(path.join(root, 'assets/classic/bitmaps.json')));
const byName = {};
for (const n of Object.keys(B).sort((a, b) => a - b)) if (!(B[n].name in byName)) byName[B[n].name] = B[n];
byName.dogsm = B['53'];
const meta = name => byName[name];
const car = process.argv.slice(2).filter(a => !a.includes('='));
const [ch, wh, en] = car.length === 3 ? car : ['chair', 'wheel2', 'fan'];
const layout = MJ.carLayout(meta, ch, wh, en);
for (let level = 1; level <= 6; level++) {
  const safe = [], out = {};
  let apex = 0;
  for (let speed = 10; speed <= 80; speed++) {
    const s = MJ.createSim(geo, level, layout);
    s.x = s.L.plank.x0 - 200; s.speed = speed;
    let minY = Infinity;
    for (let i = 0; i < 4000 && s.phase !== 'done'; i++) { s.step(0.25); minY = Math.min(minY, s.y); }
    out[speed] = s.outcome;
    if (s.outcome === 'safe') { safe.push(speed); apex = Math.max(apex, MJ.GROUND_Y - minY); }
  }
  const ranges = [];
  for (const v of safe) { if (ranges.length && ranges[ranges.length - 1][1] === v - 1) ranges[ranges.length - 1][1] = v; else ranges.push([v, v]); }
  const first = Object.entries(out).slice(0, 71).map(([, o]) => (o || '?')[0]).join('');
  console.log('level', level, 'safe', JSON.stringify(ranges), 'apex above ground', Math.round(apex), first);
}
