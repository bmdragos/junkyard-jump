// ============================================================
// JUNKYARD JUMP — Modern mode
// Original: Fox Kids / Jeff Leff, 2000 (Macromedia Director 7)
//
// Modern keeps the original's look — every screen is drawn from the original
// Score (assets/classic/score.json) with the original art, text and font — and
// changes the play:
//   * one continuous run from the start line to the landing: the car climbs the
//     tow truck's plank and flies over the trash piles onto the car carrier
//     (modern-jump.js), with the view rising to follow it;
//   * 60 Hz motion, synthesized engine sound (engine-audio.js), vector gauges
//     (modern-gauges.js), a redline boost, an on-screen GAS button on touch screens;
//   * fairer rules: RETRY / UPGRADE after a crash, prize money paid once,
//     NO on "build this jumper?" really starts over.
// Classic mode (classic.js) is the original game, unchanged.
// ============================================================

const GAME_W = 425;
const GAME_H = 290;
const STEP_MS = 1000 / 60;   // simulation step
const DT = 0.25;             // one step in frames of the original 15 fps tempo

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- data ---------------------------------------------------
let SC = null, TEXT = null, BMETA = null, GEO = null;
const IMG = {};              // member number -> Image (opaque, as extracted)
const HD = {};               // member number -> 4x upscaled image with alpha (assets/modern/hd/)
const CLEAR = {};            // member number -> canvas with white made transparent (ink 36)
const memberByName = {};
const SFX = {};
const SOUND_NAMES = ['assembly', 'bluesharp', 'crane', 'crash', 'crowd', 'fryer', 'hotrod', 'meltdown', 'ramp', 'sewing'];

const CHASSIS_LIST = ['bathtub', 'cart', 'chair', 'toilet', 'washer', 'wagon'];
const WHEEL_LIST = ['wheel1', 'wheel2', 'wheel3', 'wheel4'];
const ENGINE_LIST = ['blower', 'airconditioner', 'coffee', 'fan', 'popcorn'];

// Ratings and costs from the original item and offscreen scripts (105, 128).
// cost[0]: first build (level < 2), cost[1]: later; null = not yet available.
const PARTS = {
  chassis: {
    bathtub: { rating: 35, cost: [null, 21], name: 'Bathtub' },
    cart: { rating: 22, cost: [13, 13], name: 'Shopping Cart' },
    chair: { rating: 40, cost: [null, 25], name: 'Recliner' },
    toilet: { rating: 18, cost: [8, 8], name: 'Toilet' },
    washer: { rating: 30, cost: [null, 17], name: 'Washer' },
    wagon: { rating: 20, cost: [10, 10], name: 'Wagon' },
  },
  wheels: {
    wheel1: { rating: 9, cost: [3, 3], name: 'Go-Cart Tires' },
    wheel2: { rating: 20, cost: [null, 15], name: 'Knobby Tires' },
    wheel3: { rating: 15, cost: [null, 10], name: 'White Walls' },
    wheel4: { rating: 12, cost: [5, 5], name: 'Bicycle Tires' },
  },
  engines: {
    blower: { rating: 17, cost: [null, 12], name: 'Hair Blower' },
    airconditioner: { rating: 18, cost: [null, 15], name: 'Air Conditioner' },
    coffee: { rating: 12, cost: [7, 7], name: 'Coffee Maker' },
    fan: { rating: 20, cost: [null, 19], name: 'Ceiling Fan' },
    popcorn: { rating: 13, cost: [9, 9], name: 'Popcorn Popper' },
  },
};
const UPGRADE_THRESHOLDS = { chassis: 20, wheels: 12, engines: 15 }; // the upgrade buttons' checks
const STARTING_MONEY = 35;
const ACCEL = 1;
const DECEL = 0.5;
const BLOWN_ENGINE_FRAMES = 17;
const CAR_SCREEN_X = 90;      // where the car's chassis centre sits on screen

// --- state --------------------------------------------------
let gameState = 'loading';
let game = {};
const stateEnter = {}, stateUpdate = {}, stateRender = {};
const CONTINUOUS = new Set(['run']); // stepped at 60 Hz; everything else at 15 fps
let debugOverlay = false;

function setState(name) {
  gameState = name;
  if (stateEnter[name]) stateEnter[name]();
}

// --- input --------------------------------------------------
const input = { gas: false, touchGas: false, clicks: [], mouseX: -1, mouseY: -1, keys: '', touch: false };

function canvasCoords(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (GAME_W / r.width), y: (e.clientY - r.top) * (GAME_H / r.height) };
}
document.addEventListener('keydown', e => {
  getAudioCtx();
  if (e.code === 'Space' || e.key === ' ') { input.gas = true; e.preventDefault(); }
  if (e.key && e.key.length === 1 && e.key !== ' ') input.keys = (input.keys + e.key.toLowerCase()).slice(-16);
  if (e.key === 'Enter') input.keys = '';
});
document.addEventListener('keyup', e => { if (e.code === 'Space' || e.key === ' ') input.gas = false; });
canvas.addEventListener('mousedown', e => { getAudioCtx(); input.clicks.push(canvasCoords(e)); });
canvas.addEventListener('mousemove', e => { const c = canvasCoords(e); input.mouseX = c.x; input.mouseY = c.y; });
canvas.addEventListener('mouseleave', () => { input.mouseX = input.mouseY = -1; });

// Touch: the GAS button (during a run) holds the throttle; other touches are clicks.
const GAS_BUTTON = { x: 372, y: 236, r: 34 };
function overGasButton(c) { return Math.hypot(c.x - GAS_BUTTON.x, c.y - GAS_BUTTON.y) <= GAS_BUTTON.r + 6; }
function updateTouchGas(touches) {
  input.touchGas = false;
  if (gameState !== 'run') return;
  for (const t of touches) if (overGasButton(canvasCoords(t))) input.touchGas = true;
}
canvas.addEventListener('touchstart', e => {
  e.preventDefault(); getAudioCtx(); input.touch = true;
  for (const t of e.changedTouches) {
    const c = canvasCoords(t);
    if (!(gameState === 'run' && overGasButton(c))) input.clicks.push(c);
  }
  updateTouchGas(e.touches);
}, { passive: false });
canvas.addEventListener('touchmove', e => { e.preventDefault(); updateTouchGas(e.touches); }, { passive: false });
canvas.addEventListener('touchend', e => { e.preventDefault(); updateTouchGas(e.touches); }, { passive: false });
canvas.addEventListener('touchcancel', e => updateTouchGas(e.touches));

const gasDown = () => input.gas || input.touchGas;

// --- canvas size --------------------------------------------
// Modern renders at the display's resolution (up to 4x the original 425x290) with smoothing,
// drawing the 4x upscaled art (assets/modern/hd/); everything is laid out in original pixels.
let RENDER_SCALE = 1;
function resizeCanvas() {
  const ratio = GAME_W / GAME_H;
  let w = window.innerWidth, h = window.innerHeight;
  if (w / h > ratio) w = Math.floor(h * ratio); else h = Math.floor(w / ratio);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.style.imageRendering = 'auto';
  RENDER_SCALE = Math.max(1, Math.min(4, Math.round(w * (window.devicePixelRatio || 1) / GAME_W)));
  canvas.width = GAME_W * RENDER_SCALE;
  canvas.height = GAME_H * RENDER_SCALE;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ============================================================
// SOUND
// ============================================================
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function playBeep(freq, duration) {
  const a = getAudioCtx();
  const osc = a.createOscillator(), gain = a.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.value = 0.15;
  gain.gain.setTargetAtTime(0, a.currentTime + duration - 0.02, 0.01);
  osc.connect(gain); gain.connect(a.destination);
  osc.start(a.currentTime); osc.stop(a.currentTime + duration);
}
const playing = new Set();
// One-shot, as in the original: only its engine drone looped, and Modern synthesizes the engine.
function playSound(name) {
  const snd = SFX[name];
  if (!snd) return;
  const clone = snd.cloneNode();
  playing.add(clone);
  clone.onended = () => playing.delete(clone);
  clone.play().catch(() => {});
}
let engine = null;
function startEngine() {
  if (!engine) engine = createEngine(getAudioCtx(), game.pieces[2]);
  engine.start();
}
function stopEngine() { if (engine) { engine.stop(); engine = null; } }
function stopAllSounds() {
  for (const s of playing) s.pause();
  playing.clear();
  stopEngine();
}

// ============================================================
// DRAWING: original art, text and Score frames
// ============================================================
const OPAQUE_MEMBERS = new Set([1, 5, 28, 30, 43, 49, 52]); // drawn with copy ink in the Score
const memberNum = ref => (typeof ref === 'number' ? ref : memberByName[String(ref).toLowerCase()] || 0);
const meta = name => BMETA[memberNum(name)];

function clearArt(n) {
  if (CLEAR[n]) return CLEAR[n];
  const img = IMG[n];
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
  for (let i = 0; i < px.length; i += 4) if (px[i] === 255 && px[i + 1] === 255 && px[i + 2] === 255) px[i + 3] = 0;
  g.putImageData(d, 0, 0);
  return (CLEAR[n] = c);
}
const art = (n, ink) => (ink === 0 || (ink === undefined && OPAQUE_MEMBERS.has(n)) ? IMG[n] : clearArt(n));

// draw bitmap member n with its registration point at (x, y)
function drawMember(ref, x, y, o = {}) {
  const n = memberNum(ref);
  const m = BMETA[n];
  if (!m || !IMG[n]) return;
  const w = o.w || m.w, h = o.h || m.h;
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  ctx.drawImage(HD[n] || art(n, o.ink), -m.regX * (w / m.w), -m.regY * (h / m.h), w, h);
  ctx.restore();
}

// text in the original font, wrapped like Director's text members
function textStyle(member) {
  const t = TEXT[memberNum(member)];
  const sp = t.spans[0];
  const col = sp.color >>> 0;
  return { size: sp.size, align: t.align, lineH: t.fixedLineSpace || Math.round(sp.size * 8 / 7),
    color: 'rgb(' + ((col >> 16) & 255) + ',' + ((col >> 8) & 255) + ',' + (col & 255) + ')' };
}
function drawTextBox(str, x, y, w, st) {
  const lines = KidsFont.layout(String(str), st.size, w);
  ctx.fillStyle = st.color || '#fff';
  lines.forEach((line, i) => {
    const lw = KidsFont.width(line, st.size);
    let lx = x;
    if (st.align === 'Center') lx = x + (w - lw) / 2;
    else if (st.align === 'Right') lx = x + w - lw;
    KidsFont.fill(ctx, line, Math.round(lx), Math.round(y + st.size * KidsFont.ASCENT) + i * (st.lineH || st.size), st.size);
  });
}

// Score sprite record: [member, ink, locH, locV, width, height, rotation, blend, fore, back, stretch]
function spriteRect(rec) {
  const m = rec[0];
  if (SC.members[m] && SC.members[m].type === 1) {
    const b = BMETA[m];
    const w = rec[10] ? rec[4] : b.w, h = rec[10] ? rec[5] : b.h;
    return { x: rec[2] - b.regX * (w / b.w), y: rec[3] - b.regY * (h / b.h), w, h };
  }
  return { x: rec[2], y: rec[3], w: rec[4], h: rec[5] };
}
function drawSprite(rec, ov = {}) {
  const m = ov.member ? memberNum(ov.member) : rec[0];
  const x = ov.loc ? ov.loc[0] : rec[2], y = ov.loc ? ov.loc[1] : rec[3];
  const blend = (ov.blend !== undefined ? ov.blend : rec[7]) / 100;
  const type = SC.members[m] ? SC.members[m].type : 0;
  if (type === 1) {
    const b = BMETA[m];
    const stretch = rec[10] && !ov.member;
    drawMember(m, x, y, { w: stretch ? rec[4] : b.w, h: stretch ? rec[5] : b.h,
      rot: ((ov.rot !== undefined ? ov.rot : rec[6]) || 0) * Math.PI / 180, alpha: blend, ink: rec[1] });
  } else if (type === 15) {
    drawTextBox(ov.text !== undefined ? ov.text : TEXT[m].text, x, y, rec[4], textStyle(m));
  } else if (type === 8) {
    if (parseInt(SC.members[m].shape.substr(28, 2), 16) === 0) return; // unfilled boxes draw nothing
    ctx.save();
    ctx.globalAlpha = blend;
    ctx.fillStyle = rec[8] === 0 ? '#fff' : '#000';
    ctx.fillRect(x, y, rec[4], rec[5]);
    ctx.restore();
  }
}
// draw Score frame f; ov[channel] = { member, loc, text, blend, rot, hide }
// ov[ch].rec supplies a sprite for a channel the frame leaves empty (a puppeted sprite)
function drawScoreFrame(f, ov = {}, channels) {
  const fr = SC.frames[f - 1];
  const all = new Set(Object.keys(fr.sprites).map(Number));
  for (const ch of Object.keys(ov)) if (ov[ch].rec) all.add(Number(ch));
  const chs = channels || [...all].sort((a, b) => a - b);
  for (const ch of chs) {
    const rec = (ov[ch] && ov[ch].rec) || fr.sprites[ch];
    const o = ov[ch] || {};
    if (!rec || o.hide) continue;
    drawSprite(rec, o);
  }
}
const scoreRec = (f, ch) => SC.frames[f - 1].sprites[ch];
function hitSprite(f, chs, p) {
  for (const ch of chs) {
    const rec = scoreRec(f, ch);
    if (!rec) continue;
    const r = spriteRect(rec);
    if (p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h) return true;
  }
  return false;
}
// a click on a Score button: its text sprite or its button bitmap
const clicked = (f, chs) => input.clicks.some(p => hitSprite(f, chs, p));

const money = () => '$' + game.money + '.00';
const random = n => 1 + Math.floor(Math.random() * n);

// ============================================================
// GAME DATA
// ============================================================
function newGame() {
  game = {
    money: STARTING_MONEY,
    level: 0,
    pieces: [],
    totalCost: 0,
    prize: 0,
    repairCost: 0,
    upgrading: null,           // 'chassis' | 'wheels' | 'engines' while replacing a part
    newLevelOnRun: false,      // the next run starts a new level (after a landing)
    handFrame: 0,
  };
}
// returns false (and shows the win screen) after the sixth jump
function newLevel() {
  if (game.level >= 6) { setState('win'); return false; }
  game.level++;
  game.prize = random(5) + 12;
  return true;
}
function partCost(type, name) {
  const p = PARTS[type][name];
  return p ? p.cost[game.level < 2 ? 0 : 1] : null;
}
function rating() {
  const [c, w, e] = game.pieces;
  return (PARTS.chassis[c] ? PARTS.chassis[c].rating : 0) + (PARTS.wheels[w] ? PARTS.wheels[w].rating : 0) +
    (PARTS.engines[e] ? PARTS.engines[e].rating : 0);
}
const HANDS = ['hand1', 'hand2', 'hand3', 'hand2', 'hand3', 'hand2']; // dog script 114
function moveDog() { game.handFrame = (game.handFrame + 1) % HANDS.length; }

// sound cues from the Score's sound channels while replaying its frames
let lastCue = [null, null];
function scoreCues(f) {
  const fr = SC.frames[f - 1];
  [fr.sound1, fr.sound2].forEach((m, i) => {
    if (m && m !== lastCue[i]) playSound(SC.members[m].name);
    lastCue[i] = m;
  });
}

// ============================================================
// EASTER EGGS (typed on the splash or build screens; `debug` anywhere)
// ============================================================
function checkEasterEggs() {
  const hit = w => { if (input.keys.endsWith(w)) { input.keys = ''; return true; } return false; };
  if (hit('debug')) { debugOverlay = !debugOverlay; return; }
  if (gameState === 'run') return;
  if (hit('jumpbest')) {
    stopAllSounds(); newGame(); newLevel();
    game.pieces = ['chair', 'wheel2', 'blower'];
    setState('run');
  } else if (hit('win')) setState('win');
  else if (hit('new')) { newGame(); setState('splash'); }
  else if (hit('money')) game.money = 100;
}

// ============================================================
// SPLASH and HELP (Score frames 175 and 182)
// ============================================================
const MODE_TOGGLE = { x: 305, y: 85, w: 105, h: 23 };
stateEnter.splash = function () { stopAllSounds(); playSound('bluesharp'); };
stateRender.splash = function () {
  drawScoreFrame(175);
  const label = '[ MODERN ]', size = 10, x = Math.round(375 - KidsFont.width(label, size) / 2);
  ctx.fillStyle = '#000'; KidsFont.fill(ctx, label, x + 1, 102, size);
  ctx.fillStyle = '#00FF88'; KidsFont.fill(ctx, label, x, 101, size);
};
stateUpdate.splash = function () {
  checkEasterEggs();
  if (gameState !== 'splash') return;
  for (const p of input.clicks) {
    if (p.x >= MODE_TOGGLE.x && p.x <= MODE_TOGGLE.x + MODE_TOGGLE.w && p.y >= MODE_TOGGLE.y && p.y <= MODE_TOGGLE.y + MODE_TOGGLE.h) {
      localStorage.setItem('jj-mode', 'classic');
      location.reload();
      return;
    }
  }
  if (clicked(175, [2])) { newGame(); newLevel(); setState('chassis'); }   // START hotspot
  else if (clicked(175, [3])) setState('help');                           // HOW TO hotspot
};
stateRender.help = function () { drawScoreFrame(182); };
stateUpdate.help = function () { if (input.clicks.length) setState('splash'); };

// ============================================================
// BUILD: conveyor (Score frame 8), crane pickup (45-102), confirm (33)
// ============================================================
const CONVEYOR = {
  chassis: { type: 'chassis', slot: 0, list: CHASSIS_LIST, title: 'CHASSIS SELECTION', prompt: 'Select a chassis' },
  wheels: { type: 'wheels', slot: 1, list: WHEEL_LIST, title: 'TIRE SELECTION', prompt: 'Select tires' },
  engine: { type: 'engines', slot: 2, list: ENGINE_LIST, title: 'ENGINE SELECTION', prompt: 'Select an engine' },
};
// item script 105: two item sprites (12, 13) take turns; each moves 15px a frame, stops on the
// first frame it is already at or past x 278 (so it stops at 270 or 264, not exactly 278), and
// after leaving past x -225 wraps to 639 carrying the next part.
const ITEM_STOP = 278, ITEM_WRAP = 639, ITEM_LEFT = -225, BELT_SPEED = 15;
const CONVEYOR_FRAME = { chassis: 8, wheels: 15, engine: 23 };

function enterConveyor() {
  const cfg = CONVEYOR[gameState];
  // available parts first, cheapest first
  game.list = cfg.list.slice().sort((a, b) => {
    const ca = partCost(cfg.type, a), cb = partCost(cfg.type, b);
    if ((ca !== null) !== (cb !== null)) return ca !== null ? -1 : 1;
    return (ca || 999) - (cb || 999);
  });
  game.conveyor = gameState;
  game.index = 0;
  const f = CONVEYOR_FRAME[gameState];
  // the two item sprites start where the Score puts them (675 and 1125); y is per part type
  game.items = [12, 13].map((ch, i) => ({ ch, x: scoreRec(f, ch)[2], y: scoreRec(f, ch)[3], idx: i % game.list.length, stopped: false }));
  game.nextIdx = 2 % game.list.length;
  game.moving = true;
  // belt sprites 6-7, wheel sprites 3-5 and the hand keep their state through a whole build
  // (their Score span, frames 1-170, lasts until the run); a new build starts them afresh
  if (!game.belt) {
    // the belt and its wheels already ran through frames 2-5 before the parts appear on frame 6
    game.belt = [0 - 4 * BELT_SPEED, 429 - 4 * BELT_SPEED]; game.wheelRot = -4 * BELT_SPEED; game.handFrame = 0;
  }
  game.selectionText = cfg.title;
  game.itemText = cfg.prompt;
  if (!game.upgrading && gameState === 'chassis') { game.pieces = []; game.totalCost = 0; }
  playSound('assembly');
}
stateEnter.chassis = stateEnter.wheels = stateEnter.engine = enterConveyor;

function itemInfo() {
  const cfg = CONVEYOR[game.conveyor];
  const name = game.list[game.index], cost = partCost(cfg.type, name);
  const label = PARTS[cfg.type][name].name;
  return { name, cost, text: cost === null ? label + '\rNot Yet Available' : label + '\rCost: $' + cost };
}

stateUpdate.chassis = stateUpdate.wheels = stateUpdate.engine = function () {
  checkEasterEggs();
  if (!CONVEYOR[gameState]) return;
  if (game.moving) {
    game.belt = game.belt.map(x => (x <= -425 ? 425 : x - BELT_SPEED)); // wrap at -425 to 425
    game.wheelRot -= BELT_SPEED;
    for (const it of game.items) {             // sprite 12, then 13, as the original's exitFrame order
      if (!it.stopped) {
        if (it.x <= ITEM_STOP) {               // stop, and stop everything (sendAllSprites #stop)
          it.stopped = true;
          game.moving = false;
          game.index = it.idx;
          game.itemText = itemInfo().text;
          moveDog();
          return;
        }
        it.x -= BELT_SPEED;
      } else if (it.x > ITEM_LEFT) {
        it.x -= BELT_SPEED;
      } else {                                 // off the left: come round again with the next part
        it.x = ITEM_WRAP;
        it.idx = game.nextIdx;
        game.nextIdx = (game.nextIdx + 1) % game.list.length;
        it.stopped = false;
      }
    }
    return;
  }
  if (clicked(8, [26, 28])) {                    // NEXT
    game.moving = true;
    game.itemText = CONVEYOR[gameState].prompt;
    moveDog();
    playSound('assembly');
  } else if (clicked(8, [27, 29])) {             // SELECT
    const info = itemInfo();
    if (info.cost === null) game.itemText = 'THIS PIECE IS NOT YET AVAILABLE';
    else if (info.cost > game.money) game.itemText = 'YOU DO NOT HAVE ENOUGH MONEY';
    else {
      game.money -= info.cost;
      game.totalCost += info.cost;
      game.pieces[CONVEYOR[gameState].slot] = info.name;
      game.picked = info.name;
      moveDog();
      setState('pickup');
    }
  }
};

// Parts already chosen wait at the end of the belt (the original puppets sprites 8-11 there):
// chassis in sprite 8, wheels in 9-10, engine in 11, at their frame-33 positions.
const PARKED = [[8], [9, 10], [11]];
const SLOT_OF = { chassis: 0, wheels: 1, engine: 2, engines: 2 };
function parkedParts(skipSlot) {
  const ov = {};
  for (let slot = 0; slot < 3; slot++) {
    for (const ch of PARKED[slot]) {
      const piece = game.pieces[slot];
      ov[ch] = piece && slot !== skipSlot ? { member: piece, rec: scoreRec(33, ch) } : { hide: true };
    }
  }
  return ov;
}

function drawConveyorScene(f, ov = {}) {
  drawScoreFrame(f, Object.assign({
    12: { hide: true }, 13: { hide: true },
    3: { rot: game.wheelRot }, 4: { rot: game.wheelRot }, 5: { rot: game.wheelRot },
    6: { loc: [game.belt[0], 218] }, 7: { loc: [game.belt[1], 218] },
    17: { member: HANDS[game.handFrame] },
    21: { text: money() }, 24: { text: game.selectionText }, 25: { text: game.itemText },
  }, ov));
}
// the parts ride item sprites 12 and 13, beneath the terminal (16), the hand (17) and Willy (18)
stateRender.chassis = stateRender.wheels = stateRender.engine = function () {
  const hide = game.moving ? { hide: true } : {};
  const items = {};
  for (const it of game.items) items[it.ch] = { member: game.list[it.idx], loc: [it.x, it.y], rec: scoreRec(CONVEYOR_FRAME[gameState], it.ch) };
  drawConveyorScene(CONVEYOR_FRAME[gameState], Object.assign(parkedParts(SLOT_OF[gameState]), items, { 26: hide, 27: hide, 28: hide, 29: hide }));
};

// crane pickup: Score frames 45-102, played at double speed
stateEnter.pickup = function () { game.f = 45; lastCue = [null, null]; scoreCues(45); };
stateUpdate.pickup = function () {
  for (let i = 0; i < 2; i++) {
    game.f++;
    scoreCues(game.f);
    if (game.f >= 102) {
      if (game.upgrading) { game.upgrading = null; setState('assemble'); return; }
      const n = game.pieces.filter(Boolean).length;
      setState(n === 1 ? 'wheels' : n === 2 ? 'engine' : 'finished');
      return;
    }
  }
};
stateRender.pickup = function () {
  // the picked part rides the crane in sprite 11; the others stay parked
  const ov = parkedParts(SLOT_OF[game.conveyor]);
  if (scoreRec(game.f, 11)) ov[11] = { member: game.picked };
  drawConveyorScene(game.f, ov);
};

// "Do you want to build this jumper?" (frame 33)
stateRender.finished = function () {
  drawConveyorScene(33, Object.assign(parkedParts(-1),
    { 24: { text: 'Do you want to build this jumper?  The total cost is $ ' + game.totalCost + '.00' } }));
};
stateUpdate.finished = function () {
  if (clicked(33, [26, 28])) setState('assemble');                     // YES
  else if (clicked(33, [27, 29])) {                                    // NO: refund and start over
    game.money += game.totalCost;
    game.totalCost = 0;
    game.pieces = [];
    setState('chassis');
  }
};

// ============================================================
// ASSEMBLY: the fryer drops, the car is assembled, "Prepare to Jump!!!",
// fade out (Score frames 120-169; the fryer jitter on frame 134 runs 40 frames)
// ============================================================
const ASSEMBLY = {
  bathtub: [[-94, 25], [77, 25], [-121, -64]], cart: [[-65, 25], [67, 25], [-70, -73]],
  chair: [[-71, 25], [20, 25], [-70, -73]], toilet: [[-27, 25], [56, 25], [-66, -50]],
  washer: [[-45, 25], [30, 25], [-66, -50]], wagon: [[-38, 30], [37, 30], [-49, -26]],
};
const FRYER_POSITIONS = [[224, 95], [225, 95], [226, 95], [223, 95], [222, 95], [225, 96], [225, 97], [223, 94], [223, 96], [223, 93], [224, 93], [224, 95]];
stateEnter.assemble = function () { game.f = 120; game.jitter = 0; lastCue = [null, null]; scoreCues(120); };
stateUpdate.assemble = function () {
  if (game.f === 134 && game.jitter < 40) { game.jitter++; return; }
  game.f++;
  scoreCues(game.f);
  if (game.f > 169) setState('run');
};
stateRender.assemble = function () {
  const f = Math.min(game.f, 169);
  // The chosen parts stay parked on the belt (puppeted sprites 8-11) while the fryer comes down;
  // frame 134's assembly script releases them and assembleCar lays out the big car.
  const ov = f < 134 ? parkedParts(-1) : {};
  const base = scoreRec(f, 9);
  if (base && f >= 134) {                        // assembleCar (movie script 103)
    const [chasis, wheels, engine] = game.pieces;
    const [w1, w2, en] = ASSEMBLY[chasis];
    const [bx, by] = [base[2], base[3]];
    ov[8] = { member: engine, loc: [bx + en[0], by + en[1]] };
    ov[9] = { member: chasis };
    ov[10] = { member: wheels, loc: [bx + w1[0], by + w1[1]] };
    ov[11] = { member: wheels, loc: [bx + w2[0], by + w2[1]] };
  }
  if (f === 134) ov[15] = { loc: FRYER_POSITIONS[(game.jitter * 7) % FRYER_POSITIONS.length] };
  drawConveyorScene(f, ov);
};

// ============================================================
// THE RUN: start line, lights, runup, ramp, flight and landing — one scene
// ============================================================
stateEnter.run = function () {
  stopAllSounds();
  game.belt = null;         // the conveyor's sprites start over at the next build
  if (game.newLevelOnRun) { game.newLevelOnRun = false; if (!newLevel()) return; }
  game.repairCost = random(5) + 5;               // prepareForJump script 142
  game.layout = MJ.carLayout(meta, game.pieces[0], game.pieces[1], game.pieces[2]);
  game.sim = MJ.createSim(GEO, game.level, game.layout);
  game.maxSpeed = rating();
  game.speed = 0;
  game.tach = 27;
  game.maxed = 0;
  game.t = 0;                 // frames since the run began
  game.gasSeen = false;
  game.camY = 0;
  game.outcome = null;        // 'safe' | 'crash' | 'missed' | 'blown'
  game.outcomeT = 0;
  game.tumble = 0;
  game.airborne = false;
  game.light = 0;             // 0 none, 1 red, 2 yellow, 3 green
};

const GREEN_AT = 55;          // frames: HUD slides in, red at 25, yellow at 40, green at 55
stateUpdate.run = function (dt) {
  checkEasterEggs();
  const prevT = game.t;
  game.t += dt;
  const crossed = f => prevT < f && game.t >= f;
  if (crossed(25)) { game.light = 1; playBeep(330, 0.15); }
  if (crossed(40)) { game.light = 2; playBeep(330, 0.15); }
  if (crossed(GREEN_AT)) { game.light = 3; playBeep(660, 0.3); startEngine(); }

  const sim = game.sim;
  if (game.outcome) return finishRun(dt);

  // throttle (from green on, until the car leaves the ramp)
  if (game.t >= GREEN_AT && sim.phase === 'drive') {
    const boostMax = game.maxSpeed * 1.05; // redline boost: up to 5% past the rating
    if (gasDown()) {
      game.gasSeen = true;
      game.speed = game.speed >= game.maxSpeed
        ? Math.min(game.speed + ACCEL * 0.4 * dt, boostMax)
        : Math.min(game.speed + ACCEL * dt, game.maxSpeed);
    } else {
      game.speed = Math.max(game.speed - DECEL * dt, 0);
    }
    // tach: idle 27 -> redline 216 at the rating -> 270 at full boost
    let target = 27 + Math.min(game.speed / game.maxSpeed, 1) * (216 - 27);
    if (game.speed > game.maxSpeed) target = 216 + (game.speed - game.maxSpeed) / (game.maxSpeed * 0.05) * 54;
    game.tach += (target - game.tach) * (1 - Math.pow(game.speed > game.maxSpeed ? 0.75 : 0.7, dt));
    game.tach = Math.max(27, game.tach);
    game.maxed = game.tach >= 266 ? game.maxed + dt : 0;
    if (game.maxed >= BLOWN_ENGINE_FRAMES) {
      game.outcome = 'blown';
      if (engine) { engine.blow(); engine = null; }   // sputters, backfires and dies
      playSound('meltdown');
      return;
    }
  } else if (sim.phase !== 'drive') {
    game.tach = Math.max(27, game.tach - 4 * dt);   // off the throttle in the air
  }
  // engine sound follows the tach (idle 27 .. full boost 270), loaded while the gas is held
  if (engine) engine.setRpm((game.tach - 27) / (270 - 27), sim.phase === 'drive' && gasDown() ? 1 : 0);

  if (sim.phase === 'drive') sim.speed = game.speed;
  sim.step(dt);
  if (sim.phase === 'deck' || (sim.phase === 'done' && sim.outcome === 'safe')) game.speed = sim.speed;
  if (sim.phase === 'air' && !game.airborne) { game.airborne = true; playSound('ramp'); }
  if (sim.phase === 'done') {
    game.outcome = sim.outcome;
    if (game.outcome === 'safe') { playSound('crowd'); game.money += game.prize; }
    else { stopEngine(); playSound('crash'); }
  }
  // camera: the car stays at CAR_SCREEN_X; the view rises when it climbs high
  const target = Math.min(0, sim.y - 150);
  game.camY += (target - game.camY) * (1 - Math.pow(0.6, dt));
};

function finishRun(dt) {
  game.outcomeT += dt;
  const sim = game.sim;
  if (game.outcome === 'crash' || game.outcome === 'missed') {
    // tumble down to the ground
    if (sim.y < MJ.GROUND_Y - 25) {
      sim.vy += 1.7 * dt;
      sim.y = Math.min(MJ.GROUND_Y - 25, sim.y + sim.vy * dt);
      sim.x += sim.vx * 0.3 * dt;
      game.tumble += 0.25 * dt;
    }
    game.camY += (0 - game.camY) * (1 - Math.pow(0.85, dt));
  } else if (game.outcome === 'blown' && sim.phase === 'drive') {
    game.speed = Math.max(0, game.speed - 1.5 * dt);     // coast to a stop
    sim.speed = game.speed;
    sim.step(dt);
  }
  if (game.outcomeT >= 25) {
    stopEngine();
    if (game.outcome === 'safe') { game.newLevelOnRun = true; setState('safe'); }
    else if (game.outcome === 'blown') setState('blownengine');
    else if (game.outcome === 'missed') setState('missedramp');
    else setState('crash');
  }
}

// --- the run scene ---
const SKY_MEMBER = 49;
let skyTopColor = null;
function drawRunWorld() {
  const sim = game.sim, L = sim.L;
  const camX = sim.x - CAR_SCREEN_X, camY = game.camY;
  // sky (Score sprite 35), extended upward from its top row into a deeper red
  if (!skyTopColor) {
    const c = document.createElement('canvas'); c.width = 425; c.height = 1;
    const g = c.getContext('2d'); g.drawImage(IMG[SKY_MEMBER], 0, 0, 425, 1, 0, 0, 425, 1);
    const d = g.getImageData(0, 0, 425, 1).data; const avg = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) avg[k] += d[i + k] / 425;
    skyTopColor = avg.map(Math.round);
  }
  const skyTop = -camY * 0.8;   // its painted junk band sits behind the city: move together
  if (skyTop > 0) {
    const grad = ctx.createLinearGradient(0, skyTop - 400, 0, skyTop);
    grad.addColorStop(0, 'rgb(150,20,0)');
    grad.addColorStop(1, 'rgb(' + skyTopColor.join(',') + ')');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, GAME_W, Math.ceil(skyTop));
  }
  drawMember(SKY_MEMBER, 212, 145 + skyTop);
  // background layers (sprites 36-41): city at 1/15 speed, fence and ground at full speed
  const tile = (member, scroll, y, w, h, dy) => {
    const off = -(((scroll % 850) + 850) % 850);
    for (const x of [off, off + 850]) drawMember(member, x, y + dy, { w, h });
  };
  tile('city', camX / 15, 256, 850, 241, -camY * 0.8);
  tile('fence', camX, 253, 870, 113, -camY);
  tile('ground', camX, 291, 925, 62, -camY);
  // ramp truck (member 62, reg 0,65), trash piles (54, reg 41,42), car carrier (63, reg 49,69)
  const W = (x, y) => [x - camX, y - camY];
  drawMember(62, ...W(L.ramp.x, L.ramp.y + 65));
  for (const p of L.piles) drawMember(54, ...W(p.x + 41, p.y + 42));
  drawMember(63, ...W(L.carrier.x + 49, L.carrier.y + 69));
  // the car, or the wreck (crashscene) once it has come down
  if ((game.outcome === 'crash' || game.outcome === 'missed') && game.outcomeT >= 12) {
    drawMember('crashscene', ...W(sim.x, MJ.GROUND_Y - 20));
  } else {
    drawCar(sim.x - camX, sim.y - camY, sim.a + game.tumble, sim.wheelSpin);
  }
  if (debugOverlay) drawDebugGeometry(camX, camY);
}

function drawCar(cx, cy, angle, spin) {
  const lay = game.layout;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const part = (p, rot) => {
    const m = meta(p.name);
    drawMember(p.name, p.cx - m.w / 2 + m.regX, p.cy - m.h / 2 + m.regY, { rot }); // bitmap centre on (cx, cy)
  };
  part(lay.dog);        // Score order: dog 51, engine 52, chassis 53, wheels 54-55
  part(lay.engine);
  part(lay.chassis);
  part(lay.rear, spin);
  part(lay.front, spin);
  ctx.restore();
}

function drawDebugGeometry(camX, camY) {
  const sim = game.sim, L = sim.L;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#0f0';
  ctx.beginPath(); ctx.moveTo(L.plank.x0 - camX, L.plank.y0 - camY); ctx.lineTo(L.plank.x1 - camX, L.plank.y1 - camY); ctx.stroke();
  ctx.fillStyle = '#f00';
  for (let x = Math.floor(camX); x < camX + GAME_W; x += 2) {
    const y = Math.min(L.pileTopAt(x), L.carrierTopAt(x));
    if (y < 1e6) ctx.fillRect(x - camX, y - camY, 2, 1);
  }
  ctx.fillStyle = '#ff0';
  ctx.font = '9px monospace';
  ctx.fillText(sim.phase + ' x=' + sim.x.toFixed(0) + ' y=' + sim.y.toFixed(0) + ' v=' + game.speed.toFixed(1) +
    ' a=' + (sim.a * 180 / Math.PI).toFixed(0) + ' L' + game.level, 4, GAME_H - 4);
  ctx.restore();
}

// HUD: gauges and light slide in as in Score frames 224-243; the light leaves after green
const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
stateRender.run = function () {
  if (!game.sim) return;
  drawRunWorld();
  const t = game.t, sim = game.sim;
  const slide = (t - 5) / 19;
  const lightY = t < GREEN_AT + 3 ? lerp(-52, 40, slide) : lerp(40, -52, (t - GREEN_AT - 3) / 12);
  drawModernGauges(ctx, game.speed, game.tach, game.tach < 32 && game.light === 3 ? (Math.random() - 0.5) * 6 : 0, lerp(-90, 0, slide));
  if (lightY > -50) {
    drawMember('light', 369, lightY);
    if (game.light) drawMember('lights' + game.light, 383, lightY - 21);
  }
  if (t >= 30) {
    const blue = textStyle('distancetext');
    drawTextBox('Distance to Jump: ' + Math.max(0, Math.round(sim.distanceToRamp())), 178, 7, 175, blue);
    drawTextBox('Performance Rating = ' + game.maxSpeed, 178, 24, 175, blue);
  }
  if (t >= GREEN_AT && !game.gasSeen) {
    drawTextBox(input.touch ? 'Hold GAS to make your racer go!' : 'Press spacebar to make your racer go!',
      130, 264, 290, textStyle('spacebartext'));
  }
  if (input.touch && sim.phase === 'drive' && !game.outcome) {
    ctx.save();
    ctx.globalAlpha = input.touchGas ? 0.85 : 0.55;
    ctx.fillStyle = '#c00';
    ctx.beginPath(); ctx.arc(GAS_BUTTON.x, GAS_BUTTON.y, GAS_BUTTON.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawTextBox('GAS', GAS_BUTTON.x - 30, GAS_BUTTON.y - 9, 60, { size: 14, align: 'Center', color: '#fff' });
  }
  if (t < 10) {   // fade in from black (Score frames 200-209)
    ctx.save(); ctx.globalAlpha = 1 - t / 10; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, GAME_W, GAME_H); ctx.restore();
  }
};

// ============================================================
// RESULT DIALOGS: drawn over the frozen run, laid out as in the Score
// ============================================================
function drawFrozenRun() { if (game.sim) drawRunWorld(); else drawScoreFrame(304); }
const DIALOG_MONEY = () => ({ 69: { text: money() } });

// two-button dialog laid out as Score frame 307 (buttons 60/61, labels 62/63)
function twoButtonDialog(textMember, text, left, right) {
  drawFrozenRun();
  drawScoreFrame(307, Object.assign({ 59: { member: textMember, text }, 62: { text: left }, 63: { text: right } }, DIALOG_MONEY()),
    [57, 58, 59, 60, 61, 62, 63, 69, 70]);
}
const leftButton = () => clicked(307, [60, 62]);
const rightButton = () => clicked(307, [61, 63]);

// safe landing (the prize was paid on touchdown)
stateRender.safe = function () {
  twoButtonDialog('safetext', 'You Made It!\rYou have been awarded $' + game.prize + '.00 for this jump.', 'UPGRADE', 'NEXT JUMP');
};
stateUpdate.safe = function () {
  if (leftButton()) setState('upgrade');
  else if (rightButton()) setState('run');
};

// crash / blown engine / missed landing: pay the repair, then go again or upgrade.
// Each is drawn from its own Score frame (314, 335, 340): that screen's text box and the
// original wording, which fit; Modern adds the two buttons laid out as on frame 307.
function repairDialog(frame, text, left) {
  drawFrozenRun();
  drawScoreFrame(frame, Object.assign({ 59: { text } }, DIALOG_MONEY()), [57, 58, 59, 69, 70]);
  drawScoreFrame(307, { 62: { text: left }, 63: { text: 'UPGRADE' } }, [60, 61, 62, 63]);
}
function repairUpdate() {
  if (game.money < game.repairCost) { setState('crashover'); return; }
  if (leftButton()) { game.money -= game.repairCost; setState('run'); }
  else if (rightButton()) { game.money -= game.repairCost; setState('upgrade'); }
}
const repairCostText = () => '$' + game.repairCost + '.00';
stateRender.crash = () => repairDialog(314,                                       // crash script 140
  'You Crashed!\rYou will have to repair your vehicle.  Repairs will cost ' + repairCostText() + '.  You have ' + money() + '.', 'RETRY');
stateUpdate.crash = repairUpdate;
stateRender.blownengine = () => repairDialog(335,                                 // blown engine script 144
  'You have blown your engine!\rRepairs will cost ' + repairCostText() + '.', 'RETRY');
stateUpdate.blownengine = repairUpdate;
// as in the original, a missed landing still clears the jump: prize paid, next level
stateEnter.missedramp = function () { game.money += game.prize; game.newLevelOnRun = true; };
stateRender.missedramp = () => repairDialog(340,                                  // missed script 143
  'You made the jump, but missed the landing ramp and damaged your vehicle.  Repairs will cost ' + repairCostText() + '.', 'NEXT JUMP');
stateUpdate.missedramp = repairUpdate;

// game over (frame 323)
stateRender.crashover = function () {
  drawFrozenRun();
  drawScoreFrame(323, DIALOG_MONEY(), [57, 58, 59, 60, 61, 69, 70]);
};
stateUpdate.crashover = function () {
  if (clicked(323, [60, 61])) { newGame(); setState('splash'); }
};

// upgrade: the three part buttons plus NEXT JUMP (frame 331's layout)
stateEnter.upgrade = function () { game.upgradeText = TEXT[memberNum('upgradetext')].text; };
stateRender.upgrade = function () {
  drawFrozenRun();
  drawScoreFrame(331, Object.assign({ 59: { text: game.upgradeText } }, DIALOG_MONEY()),
    [57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 69, 70]);
};
stateUpdate.upgrade = function () {
  const parts = [[[60, 63], 'chassis', 'chassis'], [[61, 64], 'wheels', 'wheels'], [[62, 65], 'engines', 'engine']];
  for (const [chs, type, st] of parts) {
    if (!clicked(331, chs)) continue;
    if (game.money < UPGRADE_THRESHOLDS[type]) { game.upgradeText = TEXT[memberNum('noupgrademoneytext')].text; return; }
    game.upgrading = type;
    game.totalCost = 0;
    setState(st);
    return;
  }
  if (clicked(331, [66, 67])) setState('run');   // NEXT JUMP
};

// win (frames 355-356)
stateEnter.win = function () { stopAllSounds(); playSound('bluesharp'); };
stateRender.win = function () { drawScoreFrame(356); };
stateUpdate.win = function () { if (clicked(356, [3])) { newGame(); setState('splash'); } };

// ============================================================
// LOADING
// ============================================================
let loadProgress = 0;
function renderLoading() {
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2;
  ctx.strokeRect(112, 140, 200, 12);
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(114, 142, 196 * loadProgress, 8);
}

async function loadAll() {
  const json = p => fetch(p).then(r => r.json());
  [SC, TEXT, BMETA, GEO] = await Promise.all([json('assets/classic/score.json'), json('assets/classic/texts.json'),
    json('assets/classic/bitmaps.json'), json('assets/modern/jump-geometry.json')]);
  await KidsFont.load('assets/classic/fonts/kids.json');
  for (const n of Object.keys(SC.members).map(Number).sort((a, b) => a - b)) {
    const key = (SC.members[n].name || '').toLowerCase();
    if (key && !(key in memberByName)) memberByName[key] = n;
  }
  memberByName.dogsm = 53;   // the small dog shares its name with the big one (member 8)
  const nums = Object.keys(BMETA);
  let done = 0;
  const total = nums.length * 2 + SOUND_NAMES.length;
  const tick = () => { done++; loadProgress = done / total; };
  await Promise.all(nums.map(n => new Promise(res => {
    const img = new Image();
    img.onload = () => { IMG[n] = img; tick(); res(); };
    img.onerror = () => { tick(); res(); };
    img.src = 'assets/classic/bitmaps/' + n + '.png';
  })));
  await Promise.all(nums.map(n => new Promise(res => {
    const img = new Image();
    img.onload = () => { HD[n] = img; tick(); res(); };
    img.onerror = () => { tick(); res(); };   // falls back to the original bitmap
    img.src = 'assets/modern/hd/' + n + '.webp';
  })));
  await Promise.all(SOUND_NAMES.map(name => new Promise(res => {
    const a = new Audio();
    let fin = false;
    const once = () => { if (!fin) { fin = true; tick(); res(); } };
    a.addEventListener('canplaythrough', once);
    a.addEventListener('error', once);
    setTimeout(once, 3000);
    a.preload = 'auto';
    a.src = 'assets/sounds/' + name + '.wav';
    SFX[name] = a;
  })));
}

// ============================================================
// MAIN LOOP: the run steps at 60 Hz, everything else at the original 15 fps
// ============================================================
let lastTime = 0, acc = 0, frameAcc = 0;
function step() {
  if (CONTINUOUS.has(gameState)) {
    stateUpdate[gameState](DT);
    input.clicks.length = 0;
  }
  frameAcc += DT;
  if (frameAcc >= 1) {
    frameAcc -= 1;
    if (!CONTINUOUS.has(gameState) && stateUpdate[gameState]) stateUpdate[gameState](1);
    input.clicks.length = 0;
  }
}
function render() {
  ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  if (gameState === 'loading') { renderLoading(); return; }
  if (stateRender[gameState]) stateRender[gameState]();
}
let paused = false;
function gameLoop(ts) {
  requestAnimationFrame(gameLoop);
  if (paused) { lastTime = 0; return; }
  if (lastTime === 0) { lastTime = ts; return; }
  acc += ts - lastTime;
  lastTime = ts;
  if (acc > STEP_MS * 20) acc = STEP_MS * 20;
  while (acc >= STEP_MS) { step(); acc -= STEP_MS; }
  render();
}

newGame();
requestAnimationFrame(gameLoop);
loadAll().then(() => setState('splash'));

// test hook (tools/)
window.JJModern = {
  get state() { return gameState; }, get game() { return game; }, setState, step, render, input, newGame, newLevel,
  get paused() { return paused; }, set paused(v) { paused = v; },
};
