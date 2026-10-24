// ============================================================
// MODERN MODE — continuous runup, ramp and jump (no cut scene)
//
// One world from the start line to the landing: the car drives up the tow truck's
// plank, leaves its top end with the plank's slope, flies ballistically over the
// trash piles and lands on the car carrier's deck. Geometry is measured from the
// original bitmaps (tools/make_modern_geometry.py -> assets/modern/jump-geometry.json).
//
// Units: pixels and frames of the original 15 fps tempo. step(dt) takes dt in
// frames (0.25 when stepping at 60 Hz). World y grows downward; the ground line
// is GROUND_Y. Pure simulation, no DOM: tools/modern_sweep.js runs it in Node.
// ============================================================

const MJ = (function () {
  const GROUND_Y = 271;          // bottom of the trucks and piles in the original Score
  const DISTANCE = 5000;         // "Distance to Jump", as in the original
  const GRAVITY = 1.7;           // px / frame^2 (tuned with tools/modern_sweep.js)
  const PILE_GAP = 150;          // plank top end -> first pile
  const PILE_SPACING = 83;       // original Score spacing
  const CARRIER_GAP = 40;        // last pile -> carrier deck
  const PILES_PER_LEVEL = [3, 6, 10, 13, 17, 21]; // sprites 59.. in frames jump1..jump6

  // Car geometry from the assembled big car (assembleCar offsets), scaled to the small parts.
  const ASSEMBLY = {
    bathtub: [[-94, 25], [77, 25], [-121, -64]], cart: [[-65, 25], [67, 25], [-70, -73]],
    chair: [[-71, 25], [20, 25], [-70, -73]], toilet: [[-27, 25], [56, 25], [-66, -50]],
    washer: [[-45, 25], [30, 25], [-66, -50]], wagon: [[-38, 30], [37, 30], [-49, -26]],
  };

  // meta(name) -> { w, h, regX, regY } of a bitmap member
  function carLayout(meta, chassis, wheels, engine) {
    const cb = meta(chassis), cs = meta(chassis + 'sm');
    const k = cs.w / cb.w;
    const part = (name, off) => {
      const pb = meta(name), ps = meta(name + 'sm');
      return {
        name: name + 'sm', w: ps.w, h: ps.h,
        cx: (off[0] - pb.regX + pb.w / 2 + cb.regX - cb.w / 2) * k,
        cy: (off[1] - pb.regY + pb.h / 2 + cb.regY - cb.h / 2) * k,
      };
    };
    const [w1, w2, en] = ASSEMBLY[chassis];
    const rear = part(wheels, w1), front = part(wheels, w2), eng = part(engine, en);
    const dog = meta('dogsm');
    return {
      chassis: { name: chassis + 'sm', w: cs.w, h: cs.h, cx: 0, cy: 0 },
      engine: eng, rear, front,
      dog: { name: 'dogsm', w: dog.w, h: dog.h, cx: 6, cy: -dog.h / 2 }, // sits half-way into the chassis
      wheelR: rear.w / 2,
    };
  }

  function profileFn(arr, missing) {
    return lx => {
      const i = Math.floor(lx);
      if (i < 0 || i >= arr.length) return missing;
      const v = arr[i];
      return v === null ? missing : v;
    };
  }

  function createLevel(geo, level, startX = 0) {
    const piles = PILES_PER_LEVEL[Math.max(0, Math.min(5, level - 1))];
    const r = geo.ramp, [px0, py0, px1, py1] = r.plank;
    const rampX = startX + DISTANCE;           // world x of the tow truck's left edge
    const rampTop = GROUND_Y - r.h;            // world y of its bitmap top
    const plank = {
      x0: rampX + px0, y0: rampTop + py0, x1: rampX + px1, y1: rampTop + py1,
    };
    plank.slope = (plank.y1 - plank.y0) / (plank.x1 - plank.x0); // negative: rises to the right
    const pileTop = profileFn(geo.pile.top, Infinity);
    const pileList = [];
    let x = plank.x1 + PILE_GAP;
    for (let i = 0; i < piles; i++) { pileList.push({ x, y: GROUND_Y - geo.pile.h }); x += PILE_SPACING; }
    const lastPileEnd = x - PILE_SPACING + geo.pile.w;
    const carrier = { x: lastPileEnd + CARRIER_GAP - 16, y: GROUND_Y - geo.carrier.h };
    const carrierTop = profileFn(geo.carrier.top, Infinity);
    return {
      level, piles: pileList, plank, ramp: { x: rampX, y: rampTop }, carrier, lastPileEnd,
      rampTopAt: x => {                         // the plank's upper edge
        if (x < plank.x0 || x > plank.x1) return Infinity;
        return plank.y0 + (x - plank.x0) * plank.slope;
      },
      pileTopAt: x => {
        for (const p of pileList) if (x >= p.x && x < p.x + geo.pile.w) return p.y + pileTop(x - p.x);
        return Infinity;
      },
      carrierTopAt: x => carrier.y + carrierTop(x - carrier.x),
      carrierSpan: [carrier.x, carrier.x + geo.carrier.w],
    };
  }

  // A rigid car: chassis centre (x, y), rotation a (radians, clockwise; nose-up is negative).
  // the car starts with its chassis centre at x = 0, its front wheel DISTANCE short of the ramp
  function createSim(geo, level, layout) {
    const L = createLevel(geo, level, layout.front.cx + layout.wheelR);
    const s = {
      L, layout,
      x: 0, y: 0, a: 0, vx: 0, vy: 0, speed: 0,
      phase: 'drive',      // drive -> air -> deck -> done
      outcome: null,       // 'safe' | 'crash' | 'missed'
      deckDecel: 0, wheelSpin: 0,
    };
    const R = layout.wheelR;
    const pt = (cx, cy) => {             // car-frame point -> world
      const c = Math.cos(s.a), si = Math.sin(s.a);
      return [s.x + cx * c - cy * si, s.y + cx * si + cy * c];
    };
    const wheelBottom = w => { const [x, y] = pt(w.cx, w.cy); return [x, y + R]; };
    const body = () => {
      const c = layout.chassis, hw = c.w / 2, hh = c.h / 2;
      return [pt(-hw, -hh), pt(hw, -hh), pt(hw, hh * 0.6), pt(-hw, hh * 0.6), pt(layout.engine.cx, layout.engine.cy)];
    };
    // surface the wheels ride on before take-off: ground or plank
    const roadAt = x => Math.min(GROUND_Y, L.rampTopAt(x));

    // place the car so both wheels touch the given surface
    function settle(surfaceAt) {
      const rx = s.x + layout.rear.cx, fx = s.x + layout.front.cx;
      const yr = surfaceAt(rx), yf = surfaceAt(fx);
      s.a = Math.atan2(yf - yr, fx - rx);
      const c = Math.cos(s.a), si = Math.sin(s.a);
      // rear wheel centre in world = (s.x, s.y) + R(a) * (rear.cx, rear.cy); its bottom touches yr
      s.y = yr - R - (layout.rear.cx * si + layout.rear.cy * c);
    }
    settle(roadAt);

    s.frontX = () => s.x + layout.front.cx + R;
    s.distanceToRamp = () => L.plank.x0 - s.frontX();

    s.step = function (dt) {
      s.wheelSpin += (s.phase === 'deck' || s.phase === 'drive' ? s.speed : s.vx) * dt / Math.max(1, R);
      if (s.phase === 'drive') {
        s.x += s.speed * dt;
        const onPlank = s.x + layout.front.cx >= L.plank.x1 - s.speed * dt;
        settle(onPlank ? x => Math.min(GROUND_Y, L.plank.y0 + (x - L.plank.x0) * L.plank.slope) : roadAt);
        // leave the plank when the front wheel rolls off its top end, keeping the plank's angle
        if (s.x + layout.front.cx >= L.plank.x1) {
          s.phase = 'air';
          s.vx = s.speed;
          s.vy = s.speed * L.plank.slope;      // keeps the plank's direction
        }
        return;
      }
      if (s.phase === 'air') {
        const prev = [wheelBottom(layout.rear), wheelBottom(layout.front)];
        s.vy += GRAVITY * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const target = Math.max(-0.6, Math.min(0.6, Math.atan2(s.vy, s.vx)));
        s.a += (target - s.a) * Math.min(1, 0.08 * dt);
        const wheels = [wheelBottom(layout.rear), wheelBottom(layout.front)];
        // trash piles: any body point or wheel inside a pile's outline
        for (const [x, y] of wheels.concat(body())) {
          if (y >= L.pileTopAt(x)) { return finish('crash'); }
        }
        // carrier: wheels coming down onto the deck land; anything else inside it crashes
        const [c0, c1] = L.carrierSpan;
        for (let i = 0; i < 2; i++) {
          const [x, y] = wheels[i];
          if (x < c0 || x >= c1) continue;
          const top = L.carrierTopAt(x);
          if (y >= top) {
            const [px, py] = prev[i];
            if (s.vy > 0 && py <= L.carrierTopAt(px) + 1) return land();
            return finish('crash');
          }
        }
        for (const [x, y] of body()) {
          if (x >= c0 && x < c1 && y > L.carrierTopAt(x) + 3) return finish('crash');
        }
        // the ground: past the piles it is a missed landing, among them a crash
        for (const [x, y] of wheels) {
          if (y >= GROUND_Y) {
            s.y -= y - GROUND_Y;
            return finish(x > L.lastPileEnd ? 'missed' : 'crash');
          }
        }
        return;
      }
      if (s.phase === 'deck') {
        s.speed = Math.max(0, s.speed - s.deckDecel * dt);
        s.x += s.speed * dt;
        settle(x => Math.min(GROUND_Y, L.carrierTopAt(x)));
        if (s.speed <= 0) finish('safe');
      }
    };

    function land() {
      s.phase = 'deck';
      s.speed = s.vx;
      // brake to a stop around the middle of the deck (well before its tail ramp)
      const remaining = Math.max(30, L.carrierSpan[0] + 260 - (s.x + layout.front.cx));
      s.deckDecel = Math.max(1, (s.speed * s.speed) / (2 * remaining));
      settle(x => Math.min(GROUND_Y, L.carrierTopAt(x)));
    }
    function finish(outcome) { s.phase = 'done'; s.outcome = outcome; }
    return s;
  }

  return { GROUND_Y, DISTANCE, GRAVITY, PILES_PER_LEVEL, carLayout, createLevel, createSim };
})();

if (typeof module !== 'undefined') module.exports = MJ;
