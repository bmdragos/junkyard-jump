// ============================================================
// JUNKYARD JUMP - HTML5 Canvas Rebuild
// Original: Fox Kids / Jeff Leff, 2000 (Macromedia Director 7)
// ============================================================

// --- CONSTANTS ---
const GAME_W = 425;
const GAME_H = 290;
const FPS = 15;
const FRAME_MS = 1000 / FPS;

const CHASSIS_LIST = ['bathtub', 'cart', 'chair', 'toilet', 'washer', 'wagon'];
const WHEEL_LIST = ['wheel1', 'wheel2', 'wheel3', 'wheel4'];
const ENGINE_LIST = ['blower', 'airconditioner', 'coffee', 'fan', 'popcorn'];

const PARTS = {
  chassis: {
    bathtub:  { rating: 35, cost: [null, 21], name: 'Bathtub',         wheelOff: [[-83,61],[81,65]],  engineOff: [-116,-17] },
    cart:     { rating: 22, cost: [13, 13],   name: 'Shopping Cart',   wheelOff: [[-66,52],[62,51]],  engineOff: [-76,-57] },
    chair:    { rating: 40, cost: [null, 25], name: 'Recliner',        wheelOff: [[-63,68],[34,74]],  engineOff: [-103,-55] },
    toilet:   { rating: 18, cost: [8, 8],     name: 'Toilet',          wheelOff: [[-13,54],[54,54]],  engineOff: [-51,-48] },
    washer:   { rating: 30, cost: [null, 17], name: 'Washer',          wheelOff: [[-51,62],[30,62]],  engineOff: [-66,-50] },
    wagon:    { rating: 20, cost: [10, 10],   name: 'Wagon',           wheelOff: [[-28,40],[37,40]],  engineOff: [-68,-30] },
  },
  wheels: {
    wheel1: { rating: 9,  cost: [3, 3],     name: 'Go-Cart Tires' },
    wheel2: { rating: 20, cost: [null, 15], name: 'Knobby Tires' },
    wheel3: { rating: 15, cost: [null, 10], name: 'White Walls' },
    wheel4: { rating: 12, cost: [5, 5],     name: 'Bicycle Tires' },
  },
  engines: {
    blower:          { rating: 17, cost: [null, 12], name: 'Hair Blower' },
    airconditioner:  { rating: 18, cost: [null, 15], name: 'Air Conditioner' },
    coffee:          { rating: 12, cost: [7, 7],     name: 'Coffee Maker' },
    fan:             { rating: 20, cost: [null, 19], name: 'Ceiling Fan' },
    popcorn:         { rating: 13, cost: [9, 9],     name: 'Popcorn Popper' },
  }
};

const UPGRADE_THRESHOLDS = { chassis: 20, wheels: 12, engines: 15 };
const STARTING_MONEY = 35;
const GRAVITY = 0.7;
const JUMP_VSPEED = 15;
const ACCEL = 1;
const DECEL = 0.5;
const CONVEYOR_SPEED = 15;
const CONVEYOR_STOP_X = 278;
const BLOWN_ENGINE_FRAMES = 17;

// --- IMAGE AND SOUND LISTS ---
const IMAGE_NAMES = [
  'splashpage', 'background', 'winscreen',
  'city', 'fence', 'ground',
  'textframe', 'button', 'terminal',
  'converyortop', 'converyorwheel',
  'speedometer', 'tachometer',
  'light', 'lights1', 'lights2', 'lights3',
  'bigtruck', 'trucklt', 'trashpile', 'crashscene',
  'crane1', 'crane2', 'fryer',
  'dog', 'hand1', 'hand2', 'hand3',
  'bathtub', 'bathtubsm', 'cart', 'cartsm', 'chair', 'chairsm',
  'toilet', 'toiletsm', 'washer', 'washersm', 'wagon', 'wagonsm',
  'wheel1', 'wheel1sm', 'wheel2', 'wheel2sm', 'wheel3', 'wheel3sm', 'wheel4', 'wheel4sm',
  'blower', 'blowersm', 'airconditioner', 'airconditionersm',
  'coffee', 'coffeesm', 'fan', 'fansm', 'popcorn', 'popcornsm',
];
const SOUND_NAMES = ['assembly', 'bluesharp', 'crane', 'crash', 'crowd', 'fryer', 'hotrod', 'meltdown', 'ramp', 'sewing'];

// --- GLOBALS ---
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const IMG = {};
const SFX = {};
let gameState = 'loading';
let prevState = '';

// Input
const input = { spaceDown: false, clicked: false, clickX: 0, clickY: 0, mouseX: 0, mouseY: 0, keys: '', mouseDown: false, mouseDownX: 0, mouseDownY: 0 };

// Game state
let game = {};

// --- ASSET LOADING ---
function loadAssets(onProgress, onDone) {
  const total = IMAGE_NAMES.length + SOUND_NAMES.length;
  let loaded = 0;

  function tick() {
    loaded++;
    onProgress(loaded / total);
    if (loaded >= total) onDone();
  }

  IMAGE_NAMES.forEach(name => {
    const img = new Image();
    img.onload = tick;
    img.onerror = () => { console.warn('Failed to load image:', name); tick(); };
    img.src = 'assets/bitmaps/' + name + '.png';
    IMG[name] = img;
  });

  SOUND_NAMES.forEach(name => {
    const audio = new Audio();
    let done = false;
    const onceDone = () => { if (!done) { done = true; tick(); } };
    audio.addEventListener('canplaythrough', onceDone);
    audio.addEventListener('error', () => { console.warn('Failed to load sound:', name); onceDone(); });
    // Fallback: if canplaythrough never fires, count it after 3s
    setTimeout(onceDone, 3000);
    audio.preload = 'auto';
    audio.src = 'assets/sounds/' + name + '.wav';
    SFX[name] = audio;
  });
}

// --- SOUND MANAGER ---
let currentLoop = null;
let currentLoopName = '';

function playSound(name, loop) {
  const snd = SFX[name];
  if (!snd) return;
  if (loop) {
    if (currentLoopName === name) return; // already playing this loop
    stopLoop();
    currentLoop = snd;
    currentLoopName = name;
    snd.loop = true;
    snd.currentTime = 0;
    snd.play().catch(() => {});
  } else {
    // For one-shot sounds, clone to allow overlapping
    const clone = snd.cloneNode();
    clone.volume = snd.volume;
    clone.play().catch(() => {});
  }
}

function stopLoop() {
  if (currentLoop) {
    currentLoop.pause();
    currentLoop.currentTime = 0;
    currentLoop.loop = false;
    currentLoop = null;
    currentLoopName = '';
  }
}

function stopAllSounds() {
  stopLoop();
}

// --- INPUT ---
function canvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (GAME_W / rect.width),
    y: (e.clientY - rect.top) * (GAME_H / rect.height)
  };
}

document.addEventListener('keydown', e => {
  if (e.code === 'Space') { input.spaceDown = true; e.preventDefault(); }
  if (e.key.length === 1) input.keys += e.key.toLowerCase();
  if (e.key === 'Enter') input.keys = '';
});
document.addEventListener('keyup', e => {
  if (e.code === 'Space') input.spaceDown = false;
});
canvas.addEventListener('click', e => {
  const c = canvasCoords(e);
  input.clicked = true;
  input.clickX = c.x;
  input.clickY = c.y;
});
canvas.addEventListener('mousemove', e => {
  const c = canvasCoords(e);
  input.mouseX = c.x;
  input.mouseY = c.y;
});
canvas.addEventListener('mousedown', e => {
  const c = canvasCoords(e);
  input.mouseDown = true;
  input.mouseDownX = c.x;
  input.mouseDownY = c.y;
});
document.addEventListener('mouseup', () => { input.mouseDown = false; });
// Touch support
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const touch = e.touches[0];
  const c = canvasCoords(touch);
  input.clicked = true;
  input.clickX = c.x;
  input.clickY = c.y;
  input.mouseDown = true;
  input.mouseDownX = c.x;
  input.mouseDownY = c.y;
});
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const c = canvasCoords(e.touches[0]);
  input.mouseX = c.x;
  input.mouseY = c.y;
});
canvas.addEventListener('touchend', () => { input.mouseDown = false; });

// --- CANVAS RESIZE ---
function resizeCanvas() {
  const ratio = GAME_W / GAME_H;
  let w = window.innerWidth;
  let h = window.innerHeight;
  if (w / h > ratio) {
    w = Math.floor(h * ratio);
  } else {
    h = Math.floor(w / ratio);
  }
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- TEXT & UI HELPERS ---
const FONT_BOLD = 'bold 13px "Trebuchet MS", "Arial Black", sans-serif';
const FONT_NORMAL = '11px "Trebuchet MS", Arial, sans-serif';
const FONT_SMALL = '10px "Trebuchet MS", Arial, sans-serif';

function drawText(text, x, y, opts = {}) {
  const { font = FONT_BOLD, color = '#FFFFFF', align = 'center', shadow = true, maxWidth, baseline = 'middle' } = opts;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (shadow) {
    ctx.fillStyle = '#000000';
    ctx.fillText(text, x + 1, y + 1, maxWidth);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y, maxWidth);
}

function drawButton(text, x, y, w, h) {
  w = w || 127;
  h = h || 35;
  ctx.drawImage(IMG.button, x, y, w, h);
  drawText(text, x + w / 2, y + h / 2, { color: '#FFFFFF', font: FONT_BOLD });
  return { x, y, w, h };
}

function hitTest(rect) {
  if (!input.clicked) return false;
  return input.clickX >= rect.x && input.clickX <= rect.x + rect.w &&
         input.clickY >= rect.y && input.clickY <= rect.y + rect.h;
}

function drawWrappedText(text, x, y, maxWidth, lineHeight, opts = {}) {
  const words = text.split(' ');
  let line = '';
  const { font = FONT_NORMAL, color = '#FFFFFF', align = 'center' } = opts;
  ctx.font = font;
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + ' ';
    if (ctx.measureText(test).width > maxWidth && line.length > 0) {
      drawText(line.trim(), x, y, { font, color, align, shadow: true });
      line = words[i] + ' ';
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line.trim().length > 0) {
    drawText(line.trim(), x, y, { font, color, align, shadow: true });
  }
  return y;
}

// --- STATE MACHINE ---
function setState(name) {
  prevState = gameState;
  gameState = name;
  if (stateEnter[name]) stateEnter[name]();
}

const stateEnter = {};
const stateUpdate = {};
const stateRender = {};

// --- GAME INIT ---
function newGame() {
  game = {
    money: STARTING_MONEY,
    level: 0,          // number of successful jumps (0-6)
    junkPiles: 0,      // same as level, used for display
    selectedPieces: [], // [chassisName, wheelsName, engineName]
    totalCost: 0,
    pieceCost: 0,
    crashed: 0,
    repairCost: 0,
    prizeMoney: 0,
    upgrading: null,    // null, 'chassis', 'wheels', 'engines'
    // Conveyor
    conveyorList: [],
    conveyorIndex: 0,
    conveyorItemX: 0,
    conveyorStopped: false,
    conveyorBeltOffset: 0,
    conveyorWheelAngle: 0,
    dogFrame: 0,
    currentItem: '',
    // Driving
    speed: 0,
    maxSpeed: 80,
    distance: 5000,
    tachAngle: 0,
    prevSpeed: 0,
    maxedFrames: 0,
    wheelRotation: 0,
    scrollCity: 0,
    scrollFence: 0,
    scrollGround: 0,
    // Jump
    carX: 0,
    carY: 0,
    vSpeed: 0,
    goingUp: true,
    jumpHSpeed: 0,
    groundY: 228,
    // Animation counters
    timer: 0,
    craneY: 0,
    fadeAlpha: 0,
    lightPhase: 0,
  };
}

function newLevel() {
  if (game.junkPiles >= 6) { setState('win'); return; }
  game.junkPiles++;
  game.totalCost = 0;
  game.pieceCost = 0;
  game.crashed = 0;
  game.repairCost = Math.floor(Math.random() * 3) + 4;
  game.prizeMoney = Math.floor(Math.random() * 5) + 13;
}

function getPartCost(type, name) {
  const part = PARTS[type][name];
  if (!part) return null;
  const tier = game.junkPiles >= 2 ? 1 : 0;
  return part.cost[tier];
}

function getMaxSpeed() {
  if (game.selectedPieces.length < 3) return 40;
  const c = PARTS.chassis[game.selectedPieces[0]];
  const w = PARTS.wheels[game.selectedPieces[1]];
  const e = PARTS.engines[game.selectedPieces[2]];
  return (c ? c.rating : 0) + (w ? w.rating : 0) + (e ? e.rating : 0);
}

// --- DRAWING HELPERS ---
function drawScrollLayer(img, scrollX, y) {
  const w = img.naturalWidth || img.width;
  const drawX = -(scrollX % w);
  ctx.drawImage(img, drawX, y);
  if (drawX + w < GAME_W) ctx.drawImage(img, drawX + w, y);
  if (drawX > 0) ctx.drawImage(img, drawX - w, y);
}

function drawNeedle(cx, cy, angleDeg) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((angleDeg - 90) * Math.PI / 180);
  // Red tapered pointer (extends upward from pivot)
  ctx.beginPath();
  ctx.moveTo(0, -28);        // tip
  ctx.lineTo(-2, -6);        // left base near hub
  ctx.lineTo(2, -6);         // right base near hub
  ctx.closePath();
  ctx.fillStyle = '#e01010';
  ctx.fill();
  // Black circular hub
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();
  ctx.restore();
}

function drawAssembledCar(cx, cy, small) {
  if (game.selectedPieces.length < 3) return;
  const suffix = small ? 'sm' : '';
  const chassisName = game.selectedPieces[0];
  const wheelsName = game.selectedPieces[1];
  const engineName = game.selectedPieces[2];
  const chassisImg = IMG[chassisName + suffix];
  const wheelImg = IMG[wheelsName + suffix];
  const engineImg = IMG[engineName + suffix];
  const offsets = PARTS.chassis[chassisName];
  if (!chassisImg || !wheelImg || !engineImg || !offsets) return;

  const cw = chassisImg.naturalWidth || chassisImg.width;
  const ch = chassisImg.naturalHeight || chassisImg.height;
  const ew = engineImg.naturalWidth || engineImg.width;
  const eh = engineImg.naturalHeight || engineImg.height;
  const ww = wheelImg.naturalWidth || wheelImg.width;
  const wh = wheelImg.naturalHeight || wheelImg.height;

  // Scale offsets for small sprites
  const scale = small ? 0.45 : 1;

  // Draw engine
  ctx.drawImage(engineImg,
    cx + offsets.engineOff[0] * scale - ew / 2,
    cy + offsets.engineOff[1] * scale - eh / 2);

  // Draw chassis centered
  ctx.drawImage(chassisImg, cx - cw / 2, cy - ch / 2);

  // Draw wheels with rotation
  const drawWheel = (ox, oy) => {
    const wx = cx + ox * scale;
    const wy = cy + oy * scale;
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(game.wheelRotation);
    ctx.drawImage(wheelImg, -ww / 2, -wh / 2);
    ctx.restore();
  };
  drawWheel(offsets.wheelOff[0][0], offsets.wheelOff[0][1]);
  drawWheel(offsets.wheelOff[1][0], offsets.wheelOff[1][1]);
}

function drawDrivingBackground() {
  // Sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 150);
  grad.addColorStop(0, '#D4600A');
  grad.addColorStop(0.7, '#C41A04');
  grad.addColorStop(1, '#8B0000');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  drawScrollLayer(IMG.city, game.scrollCity, 49);
  drawScrollLayer(IMG.fence, game.scrollFence, 177);
  drawScrollLayer(IMG.ground, game.scrollGround, GAME_H - 62);
}

function drawMoneyCounter() {
  drawText('$' + game.money + '.00', GAME_W - 10, 12, { align: 'right', color: '#00FF00', font: FONT_BOLD });
}

// ============================================================
// STATE: LOADING
// ============================================================
let loadProgress = 0;

function renderLoading() {
  ctx.fillStyle = '#1a0a00';
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  drawText('LOADING...', GAME_W / 2, GAME_H / 2 - 20, { color: '#FFD700', font: 'bold 18px "Trebuchet MS", sans-serif' });
  // Progress bar
  const bw = 200, bh = 16;
  const bx = (GAME_W - bw) / 2, by = GAME_H / 2 + 5;
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(bx + 2, by + 2, (bw - 4) * loadProgress, bh - 4);
}

// ============================================================
// STATE: SPLASH
// ============================================================
stateEnter.splash = function() {
  playSound('bluesharp', true);
  input.keys = '';
};

stateRender.splash = function() {
  ctx.drawImage(IMG.splashpage, 0, 0, GAME_W, GAME_H);
  // Blinking "Click to Start" hint
  if (Math.floor(Date.now() / 500) % 2 === 0) {
    drawText('Click anywhere to start!', GAME_W / 2, GAME_H - 15, { font: FONT_SMALL, color: '#FFD700' });
  }
};

stateUpdate.splash = function() {
  // Easter eggs
  checkEasterEggs();

  if (input.clicked) {
    // START button (~y=140-175)
    if (input.clickX > 340 && input.clickX < 420 && input.clickY > 140 && input.clickY < 175) {
      stopAllSounds();
      newGame();
      setState('chassis');
      return;
    }
    // HOW TO button (~y=205-245)
    if (input.clickX > 340 && input.clickX < 420 && input.clickY > 205 && input.clickY < 245) {
      setState('help');
      return;
    }
    // Click anywhere else to start
    stopAllSounds();
    newGame();
    setState('chassis');
  }
};

// ============================================================
// STATE: HELP
// ============================================================
stateRender.help = function() {
  ctx.drawImage(IMG.splashpage, 0, 0, GAME_W, GAME_H);
  // Overlay
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  const fx = (GAME_W - 361) / 2;
  const fy = (GAME_H - 225) / 2;
  ctx.drawImage(IMG.textframe, fx, fy);

  drawText('HOW TO PLAY', GAME_W / 2, fy + 25, { color: '#FFD700', font: 'bold 16px "Trebuchet MS", sans-serif' });

  const lines = [
    '1. Select parts from the conveyor belt:',
    '   chassis, wheels, and engine.',
    '2. Hold SPACEBAR to accelerate.',
    '   Don\'t redline the tachometer!',
    '3. Launch off the ramp and clear',
    '   the junk piles to land safely.',
    '4. Earn prize money for safe landings.',
    '5. Upgrade your vehicle between jumps.',
    '6. Clear 6 levels of junk to win!',
  ];
  lines.forEach((line, i) => {
    drawText(line, GAME_W / 2, fy + 50 + i * 16, { font: FONT_SMALL, color: '#FFFFFF', align: 'center' });
  });

  drawButton('BACK', (GAME_W - 100) / 2, fy + 195, 100, 25);
};

stateUpdate.help = function() {
  if (input.clicked) {
    setState('splash');
  }
};

// ============================================================
// STATE: EASTER EGGS
// ============================================================
function checkEasterEggs() {
  if (input.keys.endsWith('jumpbest')) {
    input.keys = '';
    newGame();
    game.selectedPieces = ['chair', 'wheel2', 'blower'];
    game.junkPiles = 1;
    game.maxSpeed = getMaxSpeed();
    stopAllSounds();
    setState('lightrun');
  } else if (input.keys.endsWith('win')) {
    input.keys = '';
    setState('win');
  } else if (input.keys.endsWith('new')) {
    input.keys = '';
    newGame();
    setState('splash');
  } else if (input.keys.endsWith('money')) {
    input.keys = '';
    game.money = 100;
  } else if (input.keys.endsWith('debug')) {
    input.keys = '';
    setState('debug');
  }
}

// ============================================================
// STATE: DEBUG / DEV MODE
// ============================================================
const DEBUG_TABS = ['parts', 'gauges', 'jump', 'consts'];
const DEBUG_FONT = '9px "Trebuchet MS", Arial, sans-serif';
const DEBUG_FONT_BOLD = 'bold 9px "Trebuchet MS", Arial, sans-serif';
const TAB_H = 18;
const HANDLE_SIZE = 8;

let debug = {
  tab: 'parts',
  // Parts tab
  chassisIndex: 0, wheelIndex: 0, engineIndex: 0,
  offsets: {},
  dragging: null,
  // Gauges tab
  speedBaseAngle: 270, speedMultiplier: 3,
  speedPivotX: 125, speedPivotY: 40,
  tachBaseAngle: 330, tachMaxSweep: 270,
  tachPivotX: 40, tachPivotY: 40,
  simSpeed: 0, simTach: 0,
  gaugeDragging: null,
  // Jump tab
  gravity: GRAVITY, jumpVSpeed: JUMP_VSPEED, groundY: 228,
  pileStartX: 130, pileSpacing: 65, numPiles: 3, launchSpeed: 80,
  simRunning: false, simCarX: 0, simCarY: 0, simVSpeed: 0, simGoingUp: true,
  // Consts tab
  accel: ACCEL, decel: DECEL, distance: 5000,
  blownFrames: BLOWN_ENGINE_FRAMES, startingMoney: STARTING_MONEY,
  // UI state
  exportFlash: 0
};

// --- Debug UI Primitives ---

function drawDebugTabBar() {
  const tabW = GAME_W / DEBUG_TABS.length;
  for (let i = 0; i < DEBUG_TABS.length; i++) {
    const x = i * tabW;
    const active = debug.tab === DEBUG_TABS[i];
    ctx.fillStyle = active ? '#333' : '#1a1a1a';
    ctx.fillRect(x, 0, tabW, TAB_H);
    ctx.strokeStyle = '#555';
    ctx.strokeRect(x, 0, tabW, TAB_H);
    drawText(DEBUG_TABS[i].toUpperCase(), x + tabW / 2, TAB_H / 2,
      { font: active ? DEBUG_FONT_BOLD : DEBUG_FONT, color: active ? '#FFD700' : '#888' });
  }
}

function handleTabClick() {
  if (!input.clicked || input.clickY > TAB_H) return;
  const tabW = GAME_W / DEBUG_TABS.length;
  const idx = Math.floor(input.clickX / tabW);
  if (idx >= 0 && idx < DEBUG_TABS.length) {
    debug.tab = DEBUG_TABS[idx];
    debug.dragging = null;
    debug.gaugeDragging = null;
  }
}

function drawHandle(x, y, color, label) {
  ctx.fillStyle = color;
  ctx.fillRect(x - HANDLE_SIZE / 2, y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
  ctx.strokeStyle = '#FFF';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - HANDLE_SIZE / 2, y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
  if (label) drawText(label, x, y - 8, { font: DEBUG_FONT, color: color });
}

function isOverHandle(hx, hy) {
  return Math.abs(input.mouseX - hx) < HANDLE_SIZE && Math.abs(input.mouseY - hy) < HANDLE_SIZE;
}

function drawStepper(label, value, x, y, decimals) {
  const fmt = decimals ? value.toFixed(decimals) : String(value);
  ctx.fillStyle = '#600'; ctx.fillRect(x, y - 6, 14, 12);
  drawText('-', x + 7, y, { font: DEBUG_FONT_BOLD, color: '#FFF' });
  ctx.fillStyle = '#060'; ctx.fillRect(x + 18, y - 6, 14, 12);
  drawText('+', x + 25, y, { font: DEBUG_FONT_BOLD, color: '#FFF' });
  drawText(label + ': ' + fmt, x + 38, y, { font: DEBUG_FONT, color: '#CCC', align: 'left' });
  return {
    minus: { x: x, y: y - 6, w: 14, h: 12 },
    plus: { x: x + 18, y: y - 6, w: 14, h: 12 }
  };
}

function handleStepper(btns, prop, step, min, max) {
  if (hitTest(btns.minus)) debug[prop] = Math.max(debug[prop] - step, min);
  if (hitTest(btns.plus)) debug[prop] = Math.min(debug[prop] + step, max);
}

function drawSlider(label, value, min, max, x, y, w) {
  drawText(label, x - 4, y, { font: DEBUG_FONT, color: '#888', align: 'right' });
  ctx.fillStyle = '#333'; ctx.fillRect(x, y - 3, w, 6);
  const pct = (value - min) / (max - min);
  ctx.fillStyle = '#FFD700'; ctx.fillRect(x, y - 3, w * pct, 6);
  ctx.fillStyle = '#FFF'; ctx.fillRect(x + w * pct - 2, y - 5, 4, 10);
  drawText(String(Math.round(value)), x + w + 5, y, { font: DEBUG_FONT, color: '#FFF', align: 'left' });
  return { x, y: y - 5, w, h: 10, min, max };
}

function handleSlider(rect, prop) {
  if (input.mouseDown && input.mouseX >= rect.x && input.mouseX <= rect.x + rect.w &&
      input.mouseY >= rect.y && input.mouseY <= rect.y + rect.h + 4) {
    debug[prop] = rect.min + ((input.mouseX - rect.x) / rect.w) * (rect.max - rect.min);
    debug[prop] = Math.max(rect.min, Math.min(rect.max, debug[prop]));
  }
}

function drawPartSelector(label, list, index, y) {
  drawText(label + ':', 5, y, { font: DEBUG_FONT, color: '#888', align: 'left' });
  drawText('<', 60, y, { font: DEBUG_FONT_BOLD, color: '#FFD700' });
  drawText(list[index], 95, y, { font: DEBUG_FONT, color: '#FFF' });
  drawText('>', 130, y, { font: DEBUG_FONT_BOLD, color: '#FFD700' });
  return {
    left: { x: 53, y: y - 6, w: 14, h: 12 },
    right: { x: 123, y: y - 6, w: 14, h: 12 }
  };
}

function exportDebugValues() {
  let out = '// === EXPORTED DEBUG VALUES ===\n\n';
  out += '// Part offsets (wheelOff, engineOff):\n';
  for (const name of CHASSIS_LIST) {
    const off = debug.offsets[name];
    if (!off) continue;
    out += `// ${name}: wheelOff: [[${off.wheelOff[0]}],[${off.wheelOff[1]}]], engineOff: [${off.engineOff}]\n`;
  }
  out += '\n// Gauge calibration:\n';
  out += `// Speedometer: speed * ${debug.speedMultiplier} + ${debug.speedBaseAngle}, pivot: (gx+${debug.speedPivotX}, gy+${debug.speedPivotY})\n`;
  out += `// Tachometer: tachAngle + ${debug.tachBaseAngle}, pivot: (gx+${debug.tachPivotX}, gy+${debug.tachPivotY})\n`;
  out += '\n// Physics:\n';
  out += `const GRAVITY = ${debug.gravity};\nconst JUMP_VSPEED = ${debug.jumpVSpeed};\n`;
  out += `const ACCEL = ${debug.accel};\nconst DECEL = ${debug.decel};\n`;
  out += `const BLOWN_ENGINE_FRAMES = ${debug.blownFrames};\n`;
  out += `// groundY: ${debug.groundY}, distance: ${debug.distance}\n`;
  out += `// pileStartX: ${debug.pileStartX}, pileSpacing: ${debug.pileSpacing}\n`;
  console.log(out);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(out).then(() => { debug.exportFlash = 15; }).catch(() => { debug.exportFlash = 15; });
  } else {
    debug.exportFlash = 15;
  }
}

// --- Parts Tab ---

function renderPartsTab() {
  const chassisName = CHASSIS_LIST[debug.chassisIndex];
  const wheelsName = WHEEL_LIST[debug.wheelIndex];
  const engineName = ENGINE_LIST[debug.engineIndex];
  const off = debug.offsets[chassisName];
  if (!off) return;

  drawPartSelector('Chassis', CHASSIS_LIST, debug.chassisIndex, 28);
  drawPartSelector('Wheels', WHEEL_LIST, debug.wheelIndex, 40);
  drawPartSelector('Engine', ENGINE_LIST, debug.engineIndex, 52);

  const cx = GAME_W / 2, cy = 148;

  // Crosshair
  ctx.strokeStyle = 'rgba(255,255,0,0.2)';
  ctx.beginPath();
  ctx.moveTo(cx, TAB_H + 2); ctx.lineTo(cx, 250);
  ctx.moveTo(0, cy); ctx.lineTo(GAME_W, cy);
  ctx.stroke();

  // Engine
  const eImg = IMG[engineName];
  if (eImg) {
    const ew = eImg.naturalWidth || eImg.width, eh = eImg.naturalHeight || eImg.height;
    ctx.drawImage(eImg, cx + off.engineOff[0] - ew / 2, cy + off.engineOff[1] - eh / 2);
  }

  // Chassis
  const cImg = IMG[chassisName];
  if (cImg) {
    const cw = cImg.naturalWidth || cImg.width, ch = cImg.naturalHeight || cImg.height;
    ctx.drawImage(cImg, cx - cw / 2, cy - ch / 2);
  }

  // Wheels
  const wImg = IMG[wheelsName];
  if (wImg) {
    const ww = wImg.naturalWidth || wImg.width, wh = wImg.naturalHeight || wImg.height;
    ctx.drawImage(wImg, cx + off.wheelOff[0][0] - ww / 2, cy + off.wheelOff[0][1] - wh / 2);
    ctx.drawImage(wImg, cx + off.wheelOff[1][0] - ww / 2, cy + off.wheelOff[1][1] - wh / 2);
  }

  // Drag handles
  drawHandle(cx + off.wheelOff[0][0], cy + off.wheelOff[0][1], '#00FF00', 'LW');
  drawHandle(cx + off.wheelOff[1][0], cy + off.wheelOff[1][1], '#00FF00', 'RW');
  drawHandle(cx + off.engineOff[0], cy + off.engineOff[1], '#FF4444', 'ENG');

  // Readout
  drawText('LW:[' + off.wheelOff[0][0] + ',' + off.wheelOff[0][1] + ']  ' +
    'RW:[' + off.wheelOff[1][0] + ',' + off.wheelOff[1][1] + ']  ' +
    'ENG:[' + off.engineOff[0] + ',' + off.engineOff[1] + ']',
    GAME_W / 2, 258, { font: DEBUG_FONT, color: '#0F0' });
}

function updatePartsTab() {
  const chassisName = CHASSIS_LIST[debug.chassisIndex];
  const off = debug.offsets[chassisName];
  if (!off) return;
  const cx = GAME_W / 2, cy = 148;

  if (input.clicked) {
    // Part selectors
    const cs = { left: { x: 53, y: 22, w: 14, h: 12 }, right: { x: 123, y: 22, w: 14, h: 12 } };
    const ws = { left: { x: 53, y: 34, w: 14, h: 12 }, right: { x: 123, y: 34, w: 14, h: 12 } };
    const es = { left: { x: 53, y: 46, w: 14, h: 12 }, right: { x: 123, y: 46, w: 14, h: 12 } };
    if (hitTest(cs.left)) debug.chassisIndex = (debug.chassisIndex - 1 + CHASSIS_LIST.length) % CHASSIS_LIST.length;
    if (hitTest(cs.right)) debug.chassisIndex = (debug.chassisIndex + 1) % CHASSIS_LIST.length;
    if (hitTest(ws.left)) debug.wheelIndex = (debug.wheelIndex - 1 + WHEEL_LIST.length) % WHEEL_LIST.length;
    if (hitTest(ws.right)) debug.wheelIndex = (debug.wheelIndex + 1) % WHEEL_LIST.length;
    if (hitTest(es.left)) debug.engineIndex = (debug.engineIndex - 1 + ENGINE_LIST.length) % ENGINE_LIST.length;
    if (hitTest(es.right)) debug.engineIndex = (debug.engineIndex + 1) % ENGINE_LIST.length;
  }

  // Drag handles
  if (input.mouseDown && !debug.dragging) {
    const lx = cx + off.wheelOff[0][0], ly = cy + off.wheelOff[0][1];
    const rx = cx + off.wheelOff[1][0], ry = cy + off.wheelOff[1][1];
    const ex = cx + off.engineOff[0], ey = cy + off.engineOff[1];
    if (isOverHandle(lx, ly)) debug.dragging = 'leftWheel';
    else if (isOverHandle(rx, ry)) debug.dragging = 'rightWheel';
    else if (isOverHandle(ex, ey)) debug.dragging = 'engine';
  }
  if (debug.dragging && input.mouseDown) {
    const dx = Math.round(input.mouseX - cx), dy = Math.round(input.mouseY - cy);
    if (debug.dragging === 'leftWheel') { off.wheelOff[0][0] = dx; off.wheelOff[0][1] = dy; }
    else if (debug.dragging === 'rightWheel') { off.wheelOff[1][0] = dx; off.wheelOff[1][1] = dy; }
    else if (debug.dragging === 'engine') { off.engineOff[0] = dx; off.engineOff[1] = dy; }
  }
  if (!input.mouseDown) debug.dragging = null;
}

// --- Gauges Tab ---

function renderGaugesTab() {
  const tachGX = 60, speedGX = 230, gaugeY = 35;
  ctx.drawImage(IMG.tachometer, tachGX, gaugeY);
  ctx.drawImage(IMG.speedometer, speedGX, gaugeY);

  const speedAngle = debug.simSpeed * debug.speedMultiplier + debug.speedBaseAngle;
  const tachAngle = debug.simTach + debug.tachBaseAngle;
  drawNeedle(speedGX + debug.speedPivotX, gaugeY + debug.speedPivotY, speedAngle);
  drawNeedle(tachGX + debug.tachPivotX, gaugeY + debug.tachPivotY, tachAngle);

  drawHandle(speedGX + debug.speedPivotX, gaugeY + debug.speedPivotY, '#FFD700', 'S');
  drawHandle(tachGX + debug.tachPivotX, gaugeY + debug.tachPivotY, '#FFD700', 'T');

  drawSlider('Spd', debug.simSpeed, 0, 100, 55, 128, 150);
  drawSlider('Tach', debug.simTach, 0, 270, 55, 143, 150);

  drawStepper('Spd Base', debug.speedBaseAngle, 10, 163, 0);
  drawStepper('Spd Mult', debug.speedMultiplier, 10, 178, 1);
  drawStepper('Tach Base', debug.tachBaseAngle, 220, 163, 0);
  drawStepper('Tach Max', debug.tachMaxSweep, 220, 178, 0);

  drawText('Spd Pivot:(' + debug.speedPivotX + ',' + debug.speedPivotY + ')  ' +
    'Tach Pivot:(' + debug.tachPivotX + ',' + debug.tachPivotY + ')',
    GAME_W / 2, 198, { font: DEBUG_FONT, color: '#0F0' });

  // Angle readout
  drawText('Spd Angle: ' + Math.round(speedAngle) + '   Tach Angle: ' + Math.round(tachAngle),
    GAME_W / 2, 210, { font: DEBUG_FONT, color: '#AAA' });
}

function updateGaugesTab() {
  const tachGX = 60, speedGX = 230, gaugeY = 35;

  // Sliders
  const spdRect = { x: 55, y: 123, w: 150, h: 10, min: 0, max: 100 };
  const tachRect = { x: 55, y: 138, w: 150, h: 10, min: 0, max: 270 };
  handleSlider(spdRect, 'simSpeed');
  handleSlider(tachRect, 'simTach');

  if (input.clicked) {
    const s1 = { minus: { x: 10, y: 157, w: 14, h: 12 }, plus: { x: 28, y: 157, w: 14, h: 12 } };
    const s2 = { minus: { x: 10, y: 172, w: 14, h: 12 }, plus: { x: 28, y: 172, w: 14, h: 12 } };
    const s3 = { minus: { x: 220, y: 157, w: 14, h: 12 }, plus: { x: 238, y: 157, w: 14, h: 12 } };
    const s4 = { minus: { x: 220, y: 172, w: 14, h: 12 }, plus: { x: 238, y: 172, w: 14, h: 12 } };
    handleStepper(s1, 'speedBaseAngle', 5, 0, 360);
    handleStepper(s2, 'speedMultiplier', 0.1, 0.5, 10);
    handleStepper(s3, 'tachBaseAngle', 5, 0, 360);
    handleStepper(s4, 'tachMaxSweep', 5, 90, 360);
  }

  // Drag pivots
  if (input.mouseDown && !debug.gaugeDragging) {
    if (isOverHandle(speedGX + debug.speedPivotX, gaugeY + debug.speedPivotY)) debug.gaugeDragging = 'speed';
    else if (isOverHandle(tachGX + debug.tachPivotX, gaugeY + debug.tachPivotY)) debug.gaugeDragging = 'tach';
  }
  if (debug.gaugeDragging && input.mouseDown) {
    if (debug.gaugeDragging === 'speed') {
      debug.speedPivotX = Math.round(input.mouseX - speedGX);
      debug.speedPivotY = Math.round(input.mouseY - gaugeY);
    } else {
      debug.tachPivotX = Math.round(input.mouseX - tachGX);
      debug.tachPivotY = Math.round(input.mouseY - gaugeY);
    }
  }
  if (!input.mouseDown) debug.gaugeDragging = null;
}

// --- Jump Tab ---

function computeJumpArc() {
  const points = [];
  let x = 50, y = debug.groundY - 30;
  let vSpeed = debug.jumpVSpeed;
  let goingUp = true;
  const hSpeed = debug.launchSpeed * 0.2;
  for (let t = 0; t < 300; t++) {
    points.push({ x, y });
    if (goingUp) {
      if (vSpeed <= 0) { goingUp = false; vSpeed += debug.gravity; y += vSpeed; }
      else { vSpeed -= debug.gravity; y -= vSpeed; }
    } else { vSpeed += debug.gravity; y += vSpeed; }
    x += hSpeed;
    if (y > debug.groundY + 30) break;
  }
  return points;
}

function renderJumpTab() {
  const scaleX = 0.5, scaleY = 0.65;
  const yOff = 25;

  ctx.save();
  ctx.translate(0, yOff);
  ctx.scale(scaleX, scaleY);

  // Ground
  ctx.fillStyle = '#5C3D1E';
  ctx.fillRect(0, debug.groundY, 900, 100);

  // Ramp
  ctx.fillStyle = '#8B6914';
  ctx.beginPath();
  ctx.moveTo(10, debug.groundY); ctx.lineTo(60, debug.groundY); ctx.lineTo(60, debug.groundY - 50);
  ctx.closePath(); ctx.fill();

  // Piles
  for (let i = 0; i < debug.numPiles; i++) {
    const px = debug.pileStartX + i * debug.pileSpacing;
    ctx.drawImage(IMG.trashpile, px, debug.groundY - 75);
    ctx.strokeStyle = 'rgba(255,0,0,0.5)'; ctx.lineWidth = 2;
    ctx.strokeRect(px, debug.groundY - 75, 60, 70);
  }

  // Landing
  const lastEnd = debug.pileStartX + (debug.numPiles - 1) * debug.pileSpacing + 70;
  ctx.drawImage(IMG.bigtruck, lastEnd + 20, debug.groundY - 55);
  ctx.strokeStyle = 'rgba(0,255,0,0.5)'; ctx.lineWidth = 2;
  ctx.strokeRect(lastEnd + 20, debug.groundY - 55, 200, 55);

  // Arc
  const arc = computeJumpArc();
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
  ctx.beginPath();
  arc.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
  ctx.stroke(); ctx.setLineDash([]);

  // Sim car
  if (debug.simRunning && debug.simCarX > 0) {
    ctx.fillStyle = '#FF0'; ctx.fillRect(debug.simCarX - 10, debug.simCarY - 8, 20, 16);
  }

  ctx.restore();

  // Steppers
  drawStepper('Gravity', debug.gravity, 10, 205, 1);
  drawStepper('VSpeed', debug.jumpVSpeed, 10, 218, 0);
  drawStepper('GroundY', debug.groundY, 10, 231, 0);
  drawStepper('Speed', debug.launchSpeed, 10, 244, 0);
  drawStepper('StartX', debug.pileStartX, 220, 205, 0);
  drawStepper('Spacing', debug.pileSpacing, 220, 218, 0);
  drawStepper('Piles', debug.numPiles, 220, 231, 0);

  // SIM / RESET
  drawButton('SIM', 140, GAME_H - 22, 50, 20);
  drawButton('RESET', 195, GAME_H - 22, 55, 20);
}

function updateJumpTab() {
  if (input.clicked) {
    const s1 = { minus: { x: 10, y: 199, w: 14, h: 12 }, plus: { x: 28, y: 199, w: 14, h: 12 } };
    const s2 = { minus: { x: 10, y: 212, w: 14, h: 12 }, plus: { x: 28, y: 212, w: 14, h: 12 } };
    const s3 = { minus: { x: 10, y: 225, w: 14, h: 12 }, plus: { x: 28, y: 225, w: 14, h: 12 } };
    const s4a = { minus: { x: 10, y: 238, w: 14, h: 12 }, plus: { x: 28, y: 238, w: 14, h: 12 } };
    const s4 = { minus: { x: 220, y: 199, w: 14, h: 12 }, plus: { x: 238, y: 199, w: 14, h: 12 } };
    const s5 = { minus: { x: 220, y: 212, w: 14, h: 12 }, plus: { x: 238, y: 212, w: 14, h: 12 } };
    const s6 = { minus: { x: 220, y: 225, w: 14, h: 12 }, plus: { x: 238, y: 225, w: 14, h: 12 } };
    handleStepper(s1, 'gravity', 0.1, 0.1, 5);
    handleStepper(s2, 'jumpVSpeed', 1, 1, 30);
    handleStepper(s3, 'groundY', 2, 150, 280);
    handleStepper(s4a, 'launchSpeed', 5, 10, 100);
    handleStepper(s4, 'pileStartX', 5, 50, 300);
    handleStepper(s5, 'pileSpacing', 5, 20, 120);
    handleStepper(s6, 'numPiles', 1, 1, 6);

    if (hitTest({ x: 140, y: GAME_H - 22, w: 50, h: 20 })) {
      debug.simRunning = true; debug.simCarX = 50; debug.simCarY = debug.groundY - 30;
      debug.simVSpeed = debug.jumpVSpeed; debug.simGoingUp = true;
    }
    if (hitTest({ x: 195, y: GAME_H - 22, w: 55, h: 20 })) {
      debug.simRunning = false; debug.simCarX = 0;
    }
  }

  // Step sim
  if (debug.simRunning) {
    if (debug.simGoingUp) {
      if (debug.simVSpeed <= 0) {
        debug.simGoingUp = false; debug.simVSpeed += debug.gravity; debug.simCarY += debug.simVSpeed;
      } else { debug.simVSpeed -= debug.gravity; debug.simCarY -= debug.simVSpeed; }
    } else { debug.simVSpeed += debug.gravity; debug.simCarY += debug.simVSpeed; }
    debug.simCarX += debug.launchSpeed * 0.2;
    if (debug.simCarY > debug.groundY + 30) debug.simRunning = false;
  }
}

// --- Constants Tab ---

function renderConstsTab() {
  drawText('DRIVING CONSTANTS', GAME_W / 2, 38, { font: DEBUG_FONT_BOLD, color: '#FFD700' });
  drawStepper('Acceleration', debug.accel, 30, 60, 1);
  drawStepper('Deceleration', debug.decel, 30, 78, 1);
  drawStepper('Distance to Ramp', debug.distance, 30, 96, 0);
  drawStepper('Blown Engine Frames', debug.blownFrames, 30, 114, 0);
  drawStepper('Tach Max Sweep', debug.tachMaxSweep, 30, 132, 0);
  drawStepper('Starting Money', debug.startingMoney, 30, 150, 0);
}

function updateConstsTab() {
  if (input.clicked) {
    const s1 = { minus: { x: 30, y: 54, w: 14, h: 12 }, plus: { x: 48, y: 54, w: 14, h: 12 } };
    const s2 = { minus: { x: 30, y: 72, w: 14, h: 12 }, plus: { x: 48, y: 72, w: 14, h: 12 } };
    const s3 = { minus: { x: 30, y: 90, w: 14, h: 12 }, plus: { x: 48, y: 90, w: 14, h: 12 } };
    const s4 = { minus: { x: 30, y: 108, w: 14, h: 12 }, plus: { x: 48, y: 108, w: 14, h: 12 } };
    const s5 = { minus: { x: 30, y: 126, w: 14, h: 12 }, plus: { x: 48, y: 126, w: 14, h: 12 } };
    const s6 = { minus: { x: 30, y: 144, w: 14, h: 12 }, plus: { x: 48, y: 144, w: 14, h: 12 } };
    handleStepper(s1, 'accel', 0.1, 0.1, 5);
    handleStepper(s2, 'decel', 0.1, 0.1, 5);
    handleStepper(s3, 'distance', 100, 500, 20000);
    handleStepper(s4, 'blownFrames', 1, 1, 60);
    handleStepper(s5, 'tachMaxSweep', 5, 90, 360);
    handleStepper(s6, 'startingMoney', 5, 5, 200);
  }
}

// --- Debug Master State ---

stateEnter.debug = function() {
  stopAllSounds();
  debug.tab = 'parts';
  debug.dragging = null;
  debug.gaugeDragging = null;
  debug.offsets = {};
  for (const name of CHASSIS_LIST) {
    const p = PARTS.chassis[name];
    debug.offsets[name] = {
      wheelOff: [[p.wheelOff[0][0], p.wheelOff[0][1]], [p.wheelOff[1][0], p.wheelOff[1][1]]],
      engineOff: [p.engineOff[0], p.engineOff[1]]
    };
  }
};

stateRender.debug = function() {
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  drawDebugTabBar();
  if (debug.tab === 'parts') renderPartsTab();
  else if (debug.tab === 'gauges') renderGaugesTab();
  else if (debug.tab === 'jump') renderJumpTab();
  else if (debug.tab === 'consts') renderConstsTab();
  drawButton('EXPORT', 5, GAME_H - 22, 60, 20);
  drawButton('BACK', GAME_W - 65, GAME_H - 22, 60, 20);
  if (debug.exportFlash > 0) {
    drawText('Copied!', GAME_W / 2, GAME_H - 12, { font: DEBUG_FONT, color: '#0F0' });
  }
};

stateUpdate.debug = function() {
  handleTabClick();
  if (debug.tab === 'parts') updatePartsTab();
  else if (debug.tab === 'gauges') updateGaugesTab();
  else if (debug.tab === 'jump') updateJumpTab();
  else if (debug.tab === 'consts') updateConstsTab();
  if (input.clicked) {
    if (hitTest({ x: 5, y: GAME_H - 22, w: 60, h: 20 })) exportDebugValues();
    if (hitTest({ x: GAME_W - 65, y: GAME_H - 22, w: 60, h: 20 })) setState('splash');
  }
  if (debug.exportFlash > 0) debug.exportFlash--;
};

// ============================================================
// STATE: CHASSIS / WHEELS / ENGINE (conveyor selection)
// ============================================================
function getConveyorConfig() {
  if (gameState === 'chassis') return { type: 'chassis', list: CHASSIS_LIST, title: 'CHASSIS SELECTION', prompt: 'Select a chassis' };
  if (gameState === 'wheels') return { type: 'wheels', list: WHEEL_LIST, title: 'TIRE SELECTION', prompt: 'Select tires' };
  if (gameState === 'engine') return { type: 'engines', list: ENGINE_LIST, title: 'ENGINE SELECTION', prompt: 'Select an engine' };
  return null;
}

function enterConveyor() {
  const cfg = getConveyorConfig();
  if (!cfg) return;
  // Sort: available items first (cheapest to most expensive), then unavailable
  const sorted = cfg.list.slice().sort((a, b) => {
    const ca = getPartCost(cfg.type, a);
    const cb = getPartCost(cfg.type, b);
    if ((ca !== null) !== (cb !== null)) return ca !== null ? -1 : 1;
    return (ca || 999) - (cb || 999);
  });
  game.conveyorList = sorted;
  game.conveyorIndex = 0;
  game.conveyorItemX = GAME_W + 50;
  game.conveyorStopped = false;
  game.currentItem = sorted[0];
  game.conveyorBeltOffset = 0;
  game.conveyorWheelAngle = 0;
  game.dogFrame = 0;
  playSound('assembly', true);
}

stateEnter.chassis = function() {
  game.totalCost = 0;
  enterConveyor();
};
stateEnter.wheels = enterConveyor;
stateEnter.engine = enterConveyor;

stateUpdate.chassis = stateUpdate.wheels = stateUpdate.engine = function() {
  const cfg = getConveyorConfig();
  if (!cfg) return;

  checkEasterEggs();

  if (!game.conveyorStopped) {
    // Move item left
    game.conveyorItemX -= CONVEYOR_SPEED;
    game.conveyorBeltOffset = (game.conveyorBeltOffset + CONVEYOR_SPEED) % 425;
    game.conveyorWheelAngle -= CONVEYOR_SPEED * 0.3;

    if (game.conveyorItemX <= CONVEYOR_STOP_X) {
      game.conveyorItemX = CONVEYOR_STOP_X;
      game.conveyorStopped = true;
      game.currentItem = game.conveyorList[game.conveyorIndex];
      game.dogFrame = (game.dogFrame + 1) % 6;
    }
  }

  if (game.conveyorStopped && input.clicked) {
    const nextBtn = { x: 30, y: 250, w: 100, h: 28 };
    const selectBtn = { x: 160, y: 250, w: 100, h: 28 };

    if (hitTest(nextBtn)) {
      // Advance to next item
      game.conveyorIndex = (game.conveyorIndex + 1) % game.conveyorList.length;
      game.currentItem = game.conveyorList[game.conveyorIndex];
      game.conveyorItemX = GAME_W + 50;
      game.conveyorStopped = false;
      game.dogFrame = (game.dogFrame + 1) % 6;
      playSound('sewing');
    }

    if (hitTest(selectBtn)) {
      const cost = getPartCost(cfg.type, game.currentItem);
      if (cost === null) {
        // Not available
      } else if (cost > game.money) {
        // Can't afford
      } else {
        // Purchase
        game.money -= cost;
        game.totalCost += cost;
        game.pieceCost = cost;
        game.dogFrame = (game.dogFrame + 1) % 6;

        if (game.upgrading) {
          // Replace existing part
          const idx = game.upgrading === 'chassis' ? 0 : game.upgrading === 'wheels' ? 1 : 2;
          game.selectedPieces[idx] = game.currentItem;
          game.upgrading = null;
          setState('assemble');
        } else {
          game.selectedPieces.push(game.currentItem);
          if (game.selectedPieces.length === 1) setState('wheels');
          else if (game.selectedPieces.length === 2) setState('engine');
          else setState('finished');
        }
      }
    }
  }
};

stateRender.chassis = stateRender.wheels = stateRender.engine = function() {
  const cfg = getConveyorConfig();
  if (!cfg) return;

  ctx.drawImage(IMG.background, 0, 0, GAME_W, GAME_H);

  // Belt
  const beltY = 195;
  drawScrollLayer(IMG.converyortop, game.conveyorBeltOffset, beltY);

  // Conveyor wheels
  const wheelPositions = [[50, beltY + 14], [210, beltY + 14], [370, beltY + 14]];
  wheelPositions.forEach(([wx, wy]) => {
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(game.conveyorWheelAngle);
    const wimg = IMG.converyorwheel;
    ctx.drawImage(wimg, -12, -12);
    ctx.restore();
  });

  // Item on belt
  const itemImg = IMG[game.currentItem];
  if (itemImg) {
    const iw = itemImg.naturalWidth || itemImg.width;
    const ih = itemImg.naturalHeight || itemImg.height;
    const itemX = game.conveyorItemX - iw / 2;
    const itemY = beltY - ih;
    ctx.drawImage(itemImg, itemX, itemY);
  }

  // Dog
  const dogHands = ['hand1', 'hand2', 'hand3', 'hand2', 'hand3', 'hand2'];
  const handImg = IMG[dogHands[game.dogFrame]];
  ctx.drawImage(IMG.dog, 380, 140);
  if (handImg) ctx.drawImage(handImg, 355, 170);

  // Terminal
  ctx.drawImage(IMG.terminal, 15, 15);

  // Terminal text
  drawText(cfg.title, 77, 40, { font: 'bold 10px "Trebuchet MS", sans-serif', color: '#00FF00' });

  if (game.conveyorStopped) {
    const cost = getPartCost(cfg.type, game.currentItem);
    const part = PARTS[cfg.type][game.currentItem];
    const partName = part ? part.name : game.currentItem;
    drawText(partName, 77, 70, { font: FONT_SMALL, color: '#FFFFFF' });
    if (cost === null) {
      drawText('Not Yet Available', 77, 90, { font: FONT_SMALL, color: '#FF6666' });
    } else if (cost > game.money) {
      drawText('Cost: $' + cost, 77, 90, { font: FONT_SMALL, color: '#FFFFFF' });
      drawText('Not Enough Money!', 77, 110, { font: FONT_SMALL, color: '#FF6666' });
    } else {
      drawText('Cost: $' + cost, 77, 90, { font: FONT_SMALL, color: '#00FF00' });
    }
  } else {
    drawText(cfg.prompt, 77, 70, { font: FONT_SMALL, color: '#FFFFFF' });
  }

  // Already selected parts display
  if (game.selectedPieces.length > 0 && !game.upgrading) {
    let py = 120;
    game.selectedPieces.forEach((p, i) => {
      const t = i === 0 ? 'chassis' : i === 1 ? 'wheels' : 'engines';
      const pdata = PARTS[t][p];
      drawText((pdata ? pdata.name : p), 77, py, { font: FONT_SMALL, color: '#AAAAAA' });
      py += 14;
    });
  }

  // Buttons
  if (game.conveyorStopped) {
    drawButton('NEXT', 30, 250, 100, 28);
    drawButton('SELECT', 160, 250, 100, 28);
  }

  // Money
  drawMoneyCounter();
};

// ============================================================
// STATE: FINISHED (confirm build)
// ============================================================
stateEnter.finished = function() {
  stopAllSounds();
};

stateRender.finished = function() {
  ctx.drawImage(IMG.background, 0, 0, GAME_W, GAME_H);
  const fx = (GAME_W - 361) / 2;
  const fy = (GAME_H - 225) / 2;
  ctx.drawImage(IMG.textframe, fx, fy);

  drawText('BUILD THIS JUMPER?', GAME_W / 2, fy + 25, { color: '#FFD700', font: 'bold 14px "Trebuchet MS", sans-serif' });
  drawText('Total cost: $' + game.totalCost + '.00', GAME_W / 2, fy + 50, { font: FONT_NORMAL, color: '#FFFFFF' });

  // Show selected parts
  let py = fy + 75;
  game.selectedPieces.forEach((p, i) => {
    const t = i === 0 ? 'chassis' : i === 1 ? 'wheels' : 'engines';
    const pdata = PARTS[t][p];
    drawText((pdata ? pdata.name : p), GAME_W / 2, py, { font: FONT_NORMAL, color: '#CCCCCC' });
    py += 18;
  });

  drawText('Performance: ' + getMaxSpeed(), GAME_W / 2, py + 5, { font: FONT_BOLD, color: '#FFD700' });

  drawButton('YES', GAME_W / 2 - 110, fy + 175, 100, 30);
  drawButton('NO', GAME_W / 2 + 10, fy + 175, 100, 30);
  drawMoneyCounter();
};

stateUpdate.finished = function() {
  if (input.clicked) {
    const fx = (GAME_W - 361) / 2;
    const fy = (GAME_H - 225) / 2;
    if (hitTest({ x: GAME_W / 2 - 110, y: fy + 175, w: 100, h: 30 })) {
      // YES - build it
      setState('assemble');
    }
    if (hitTest({ x: GAME_W / 2 + 10, y: fy + 175, w: 100, h: 30 })) {
      // NO - refund
      game.money += game.totalCost;
      game.totalCost = 0;
      game.selectedPieces = [];
      setState('chassis');
    }
  }
};

// ============================================================
// STATE: ASSEMBLE (fryer animation)
// ============================================================
stateEnter.assemble = function() {
  game.timer = 0;
  playSound('fryer', true);
};

stateRender.assemble = function() {
  ctx.drawImage(IMG.background, 0, 0, GAME_W, GAME_H);

  // Fryer vibration
  const jx = (Math.random() * 6) - 3;
  const jy = (Math.random() * 6) - 3;
  const fryer = IMG.fryer;
  const fw = fryer.naturalWidth || fryer.width;
  const fh = fryer.naturalHeight || fryer.height;
  ctx.drawImage(fryer, (GAME_W - fw) / 2 + jx, 30 + jy);

  // Small assembled car above fryer
  if (game.timer > 20) {
    drawAssembledCar(GAME_W / 2, 80, true);
  }

  drawText('ASSEMBLING...', GAME_W / 2, GAME_H - 30, { color: '#FFD700', font: 'bold 16px "Trebuchet MS", sans-serif' });
  drawMoneyCounter();
};

stateUpdate.assemble = function() {
  game.timer++;
  if (game.timer >= 65) {
    setState('fadeout');
  }
};

// ============================================================
// STATE: FADEOUT
// ============================================================
stateEnter.fadeout = function() {
  game.fadeAlpha = 0;
  stopAllSounds();
};

stateRender.fadeout = function() {
  ctx.drawImage(IMG.background, 0, 0, GAME_W, GAME_H);
  ctx.fillStyle = `rgba(0,0,0,${game.fadeAlpha})`;
  ctx.fillRect(0, 0, GAME_W, GAME_H);
};

stateUpdate.fadeout = function() {
  game.fadeAlpha += 1 / 15;
  if (game.fadeAlpha >= 1) {
    if (game.junkPiles === 0) {
      game.junkPiles = 1;
      game.prizeMoney = Math.floor(Math.random() * 5) + 13;
      game.repairCost = Math.floor(Math.random() * 3) + 4;
    }
    game.maxSpeed = getMaxSpeed();
    setState('lightrun');
  }
};

// ============================================================
// STATE: LIGHTRUN (traffic light countdown)
// ============================================================
stateEnter.lightrun = function() {
  game.timer = 0;
  game.lightPhase = 0;
  game.speed = 0;
  game.distance = 5000;
  game.maxedFrames = 0;
  game.tachAngle = 0;
  game.prevSpeed = 0;
  game.wheelRotation = 0;
  game.scrollCity = 0;
  game.scrollFence = 0;
  game.scrollGround = 0;
};

stateRender.lightrun = function() {
  drawDrivingBackground();

  // Car at starting position
  drawAssembledCar(100, game.groundY - 10, true);

  // Dog in car
  ctx.drawImage(IMG.dog, 85, game.groundY - 50);

  // Traffic light
  const lcx = GAME_W / 2;
  const lcy = GAME_H / 2 - 40;
  ctx.drawImage(IMG.light, lcx - 29, lcy);
  if (game.lightPhase === 0) ctx.drawImage(IMG.lights1, lcx + 5, lcy + 13);
  else if (game.lightPhase === 1) ctx.drawImage(IMG.lights2, lcx + 5, lcy + 13);
  else ctx.drawImage(IMG.lights3, lcx + 5, lcy + 13);

  // HUD
  drawText('Distance to Jump: 5000', GAME_W / 2, 12, { font: FONT_SMALL, color: '#FFFF00' });
  drawMoneyCounter();

  // Press spacebar hint
  if (game.lightPhase < 2) {
    drawText('GET READY!', GAME_W / 2, GAME_H - 20, { color: '#FFD700', font: FONT_BOLD });
  } else {
    drawText('HOLD SPACEBAR TO GO!', GAME_W / 2, GAME_H - 20, { color: '#00FF00', font: FONT_BOLD });
  }
};

stateUpdate.lightrun = function() {
  game.timer++;
  if (game.timer === 15) game.lightPhase = 1;
  if (game.timer === 30) game.lightPhase = 2;
  if (game.timer >= 45) {
    playSound('hotrod', true);
    setState('driving');
  }
};

// ============================================================
// STATE: DRIVING
// ============================================================
stateEnter.driving = function() {
  // Speed etc already set by lightrun
};

stateUpdate.driving = function() {
  // Acceleration
  if (input.spaceDown) {
    game.speed = Math.min(game.speed + ACCEL, game.maxSpeed);
  } else {
    game.speed = Math.max(game.speed - DECEL, 0);
  }

  // Parallax
  game.scrollCity = (game.scrollCity + Math.abs(game.speed) / 15) % 850;
  game.scrollFence = (game.scrollFence + game.speed) % 850;
  game.scrollGround = (game.scrollGround + game.speed) % 850;

  // Wheel rotation
  game.wheelRotation += game.speed * 0.1;

  // Distance
  game.distance -= game.speed;

  // Tachometer - matches original Lingo: needle rises when accelerating/holding,
  // drops when decelerating (even while still moving)
  if (game.speed >= game.prevSpeed) {
    game.tachAngle = Math.min(game.tachAngle + Math.round(game.speed / 3), 270);
  } else {
    game.tachAngle = Math.max(game.tachAngle - 15, 0);
  }
  game.prevSpeed = game.speed;

  // Blown engine check
  if (game.tachAngle >= 270) {
    game.maxedFrames++;
    if (game.maxedFrames >= BLOWN_ENGINE_FRAMES) {
      game.speed = 0;
      stopAllSounds();
      playSound('meltdown');
      setState('blownengine');
      return;
    }
  } else {
    game.maxedFrames = 0;
  }

  // Ramp trigger
  if (game.distance <= 0) {
    if (game.speed > 5) {
      stopAllSounds();
      playSound('ramp');
      setState('jump');
    }
  }
};

stateRender.driving = function() {
  drawDrivingBackground();

  // Car
  drawAssembledCar(100, game.groundY - 10, true);
  // Dog
  ctx.drawImage(IMG.dog, 85, game.groundY - 50);

  // Gauges
  const gx = GAME_W - 170;
  const gy = GAME_H - 90;
  ctx.drawImage(IMG.tachometer, gx, gy);
  ctx.drawImage(IMG.speedometer, gx + 85, gy);
  drawNeedle(gx + 40, gy + 40, game.tachAngle + 330);
  drawNeedle(gx + 125, gy + 40, game.speed * 3 + 270);

  // Distance
  drawText('Distance to Jump: ' + Math.max(0, Math.floor(game.distance)), GAME_W / 2, 12, { font: FONT_SMALL, color: '#FFFF00' });
  drawMoneyCounter();

  // Spacebar hint
  if (game.speed === 0) {
    drawText('HOLD SPACEBAR', GAME_W / 2, GAME_H - 20, { color: '#FFFF00', font: FONT_SMALL });
  }
};

// ============================================================
// STATE: JUMP
// ============================================================
stateEnter.jump = function() {
  game.vSpeed = JUMP_VSPEED;
  game.goingUp = true;
  game.carX = 50;
  game.carY = game.groundY - 30;
  game.jumpHSpeed = game.speed * 0.2;
  game.timer = 0;
};

function getJumpLayout() {
  const piles = [];
  const startX = 130;
  const spacing = 65;
  for (let i = 0; i < game.junkPiles; i++) {
    piles.push({
      x: startX + i * spacing,
      y: game.groundY - 75,
      w: 60,
      h: 70
    });
  }
  const lastPileEnd = startX + (game.junkPiles - 1) * spacing + 70;
  const landing = {
    x: lastPileEnd + 20,
    y: game.groundY - 55,
    w: 200,
    h: 55
  };
  return { piles, landing };
}

stateUpdate.jump = function() {
  game.timer++;

  // Collision check BEFORE movement (matches original Lingo ordering)
  const layout = getJumpLayout();
  const carBounds = {
    x: game.carX - 30,
    y: game.carY - 25,
    w: 60,
    h: 40
  };

  // Check trash piles
  for (const pile of layout.piles) {
    if (rectsOverlap(carBounds, pile)) {
      stopAllSounds();
      playSound('crash');
      game.crashed = 1;
      setState('crash');
      return;
    }
  }

  // Check landing zone
  if (!game.goingUp && rectsOverlap(carBounds, layout.landing)) {
    stopAllSounds();
    playSound('crowd');
    setState('safe');
    return;
  }

  // Missed - fell below ground
  if (game.carY > game.groundY + 20) {
    stopAllSounds();
    playSound('crash');
    setState('missedramp');
    return;
  }

  // Physics — match original Lingo phase transition:
  // when vSpeed hits 0, switch to falling on the SAME frame
  if (game.goingUp) {
    if (game.vSpeed <= 0) {
      game.goingUp = false;
      game.vSpeed += GRAVITY;
      game.carY += game.vSpeed;
    } else {
      game.vSpeed -= GRAVITY;
      game.carY -= game.vSpeed;
    }
  } else {
    game.vSpeed += GRAVITY;
    game.carY += game.vSpeed;
  }

  // Horizontal movement
  game.carX += game.jumpHSpeed;
  game.wheelRotation += game.jumpHSpeed * 0.3;
};

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

stateRender.jump = function() {
  // Sky
  const grad = ctx.createLinearGradient(0, 0, 0, 150);
  grad.addColorStop(0, '#D4600A');
  grad.addColorStop(0.7, '#C41A04');
  grad.addColorStop(1, '#8B0000');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // Ground
  ctx.fillStyle = '#5C3D1E';
  ctx.fillRect(0, game.groundY, GAME_W, GAME_H - game.groundY);

  // Camera
  const cameraX = Math.max(0, game.carX - 80);
  ctx.save();
  ctx.translate(-cameraX, 0);

  // Ramp
  ctx.fillStyle = '#8B6914';
  ctx.beginPath();
  ctx.moveTo(20, game.groundY);
  ctx.lineTo(80, game.groundY);
  ctx.lineTo(80, game.groundY - 50);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#6B4E12';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Trash piles
  const layout = getJumpLayout();
  layout.piles.forEach(pile => {
    ctx.drawImage(IMG.trashpile, pile.x, pile.y);
  });

  // Landing truck
  ctx.drawImage(IMG.bigtruck, layout.landing.x, layout.landing.y);

  // Car
  drawAssembledCar(game.carX, game.carY, true);
  // Dog
  ctx.drawImage(IMG.dog, game.carX - 15, game.carY - 40);

  ctx.restore();

  // HUD
  drawMoneyCounter();
  drawText('JUMP!', GAME_W / 2, 15, { color: '#FFD700', font: 'bold 16px "Trebuchet MS", sans-serif' });
};

// ============================================================
// STATE: SAFE LANDING
// ============================================================
stateEnter.safe = function() {
  game.crashed = 0;
};

stateRender.safe = function() {
  ctx.drawImage(IMG.background, 0, 0, GAME_W, GAME_H);
  const fx = (GAME_W - 361) / 2;
  const fy = (GAME_H - 225) / 2;
  ctx.drawImage(IMG.textframe, fx, fy);

  drawText('SAFE LANDING!', GAME_W / 2, fy + 25, { color: '#00FF00', font: 'bold 16px "Trebuchet MS", sans-serif' });
  drawText('You earned $' + game.prizeMoney + '.00!', GAME_W / 2, fy + 55, { font: FONT_NORMAL, color: '#FFFFFF' });
  drawText('Jumps completed: ' + game.junkPiles + '/6', GAME_W / 2, fy + 80, { font: FONT_NORMAL, color: '#CCCCCC' });

  // Show car
  drawAssembledCar(GAME_W / 2, fy + 120, true);

  drawButton('UPGRADE', GAME_W / 2 - 130, fy + 165, 120, 30);
  drawButton('NEXT JUMP', GAME_W / 2 + 10, fy + 165, 120, 30);
  drawMoneyCounter();
};

stateUpdate.safe = function() {
  if (input.clicked) {
    const fx = (GAME_W - 361) / 2;
    const fy = (GAME_H - 225) / 2;

    if (hitTest({ x: GAME_W / 2 - 130, y: fy + 165, w: 120, h: 30 })) {
      // Upgrade
      game.money += game.prizeMoney;
      setState('upgrade');
    }
    if (hitTest({ x: GAME_W / 2 + 10, y: fy + 165, w: 120, h: 30 })) {
      // Next jump
      game.money += game.prizeMoney;
      newLevel();
      if (gameState !== 'win') {
        game.maxSpeed = getMaxSpeed();
        setState('lightrun');
      }
    }
  }
};

// ============================================================
// STATE: CRASH
// ============================================================
stateEnter.crash = function() {
  game.crashed = 1;
  game.repairCost = Math.floor(Math.random() * 5) + 6;
};

stateRender.crash = function() {
  ctx.drawImage(IMG.background, 0, 0, GAME_W, GAME_H);
  const fx = (GAME_W - 361) / 2;
  const fy = (GAME_H - 225) / 2;
  ctx.drawImage(IMG.textframe, fx, fy);

  drawText('YOU CRASHED!', GAME_W / 2, fy + 25, { color: '#FF4444', font: 'bold 16px "Trebuchet MS", sans-serif' });

  if (game.money >= game.repairCost) {
    drawWrappedText('Repairs will cost $' + game.repairCost + '.00. You have $' + game.money + '.00.',
      GAME_W / 2, fy + 60, 300, 16, { font: FONT_NORMAL, color: '#FFFFFF' });
    ctx.drawImage(IMG.crashscene, GAME_W / 2 - 50, fy + 100);
    drawButton('RETRY', GAME_W / 2 - 125, fy + 170, 115, 30);
    drawButton('UPGRADE', GAME_W / 2 + 10, fy + 170, 115, 30);
  } else {
    drawWrappedText('You don\'t have enough money for repairs!',
      GAME_W / 2, fy + 60, 300, 16, { font: FONT_NORMAL, color: '#FF6666' });
    drawButton('GAME OVER', (GAME_W - 120) / 2, fy + 170, 120, 30);
  }
  drawMoneyCounter();
};

stateUpdate.crash = function() {
  if (input.clicked) {
    const fy = (GAME_H - 225) / 2;
    if (game.money >= game.repairCost) {
      if (hitTest({ x: GAME_W / 2 - 125, y: fy + 170, w: 115, h: 30 })) {
        game.money -= game.repairCost;
        game.maxSpeed = getMaxSpeed();
        setState('lightrun');
      } else if (hitTest({ x: GAME_W / 2 + 10, y: fy + 170, w: 115, h: 30 })) {
        game.money -= game.repairCost;
        setState('upgrade');
      }
    } else {
      if (hitTest({ x: (GAME_W - 120) / 2, y: fy + 170, w: 120, h: 30 })) {
        setState('crashover');
      }
    }
  }
};

// ============================================================
// STATE: MISSED RAMP
// ============================================================
stateEnter.missedramp = function() {
  game.crashed = 1;
  game.money += game.prizeMoney; // still get prize for making the jump
  game.repairCost = Math.floor(Math.random() * 5) + 6;
};

stateRender.missedramp = function() {
  ctx.drawImage(IMG.background, 0, 0, GAME_W, GAME_H);
  const fx = (GAME_W - 361) / 2;
  const fy = (GAME_H - 225) / 2;
  ctx.drawImage(IMG.textframe, fx, fy);

  drawText('MISSED THE RAMP!', GAME_W / 2, fy + 25, { color: '#FF8800', font: 'bold 14px "Trebuchet MS", sans-serif' });

  if (game.money >= game.repairCost) {
    drawWrappedText('You made the jump but missed the landing ramp. Repairs cost $' + game.repairCost + '.00.',
      GAME_W / 2, fy + 55, 300, 16, { font: FONT_NORMAL, color: '#FFFFFF' });
    drawButton('RETRY', GAME_W / 2 - 125, fy + 170, 115, 30);
    drawButton('UPGRADE', GAME_W / 2 + 10, fy + 170, 115, 30);
  } else {
    drawText('Not enough money for repairs!', GAME_W / 2, fy + 60, { font: FONT_NORMAL, color: '#FF6666' });
    drawButton('GAME OVER', (GAME_W - 120) / 2, fy + 170, 120, 30);
  }
  drawMoneyCounter();
};

stateUpdate.missedramp = function() {
  if (input.clicked) {
    const fy = (GAME_H - 225) / 2;
    if (game.money >= game.repairCost) {
      if (hitTest({ x: GAME_W / 2 - 125, y: fy + 170, w: 115, h: 30 })) {
        game.money -= game.repairCost;
        game.maxSpeed = getMaxSpeed();
        setState('lightrun');
      } else if (hitTest({ x: GAME_W / 2 + 10, y: fy + 170, w: 115, h: 30 })) {
        game.money -= game.repairCost;
        setState('upgrade');
      }
    } else {
      if (hitTest({ x: (GAME_W - 120) / 2, y: fy + 170, w: 120, h: 30 })) {
        setState('crashover');
      }
    }
  }
};

// ============================================================
// STATE: BLOWN ENGINE
// ============================================================
stateEnter.blownengine = function() {
  game.crashed = 1;
  game.repairCost = Math.floor(Math.random() * 5) + 6;
};

stateRender.blownengine = function() {
  ctx.drawImage(IMG.background, 0, 0, GAME_W, GAME_H);
  const fx = (GAME_W - 361) / 2;
  const fy = (GAME_H - 225) / 2;
  ctx.drawImage(IMG.textframe, fx, fy);

  drawText('ENGINE BLOWN!', GAME_W / 2, fy + 25, { color: '#FF4444', font: 'bold 16px "Trebuchet MS", sans-serif' });

  if (game.money >= game.repairCost) {
    drawWrappedText('You blew your engine! Repairs cost $' + game.repairCost + '.00.',
      GAME_W / 2, fy + 55, 300, 16, { font: FONT_NORMAL, color: '#FFFFFF' });
    drawButton('RETRY', GAME_W / 2 - 125, fy + 170, 115, 30);
    drawButton('UPGRADE', GAME_W / 2 + 10, fy + 170, 115, 30);
  } else {
    drawText('Not enough money for repairs!', GAME_W / 2, fy + 60, { font: FONT_NORMAL, color: '#FF6666' });
    drawButton('GAME OVER', (GAME_W - 120) / 2, fy + 170, 120, 30);
  }
  drawMoneyCounter();
};

stateUpdate.blownengine = function() {
  if (input.clicked) {
    const fy = (GAME_H - 225) / 2;
    if (game.money >= game.repairCost) {
      if (hitTest({ x: GAME_W / 2 - 125, y: fy + 170, w: 115, h: 30 })) {
        game.money -= game.repairCost;
        game.maxSpeed = getMaxSpeed();
        setState('lightrun');
      } else if (hitTest({ x: GAME_W / 2 + 10, y: fy + 170, w: 115, h: 30 })) {
        game.money -= game.repairCost;
        setState('upgrade');
      }
    } else {
      if (hitTest({ x: (GAME_W - 120) / 2, y: fy + 170, w: 120, h: 30 })) {
        setState('crashover');
      }
    }
  }
};

// ============================================================
// STATE: UPGRADE
// ============================================================
stateRender.upgrade = function() {
  ctx.drawImage(IMG.background, 0, 0, GAME_W, GAME_H);
  const fx = (GAME_W - 361) / 2;
  const fy = (GAME_H - 225) / 2;
  ctx.drawImage(IMG.textframe, fx, fy);

  drawText('UPGRADE YOUR VEHICLE', GAME_W / 2, fy + 25, { color: '#FFD700', font: 'bold 14px "Trebuchet MS", sans-serif' });
  drawText('Choose a part to upgrade:', GAME_W / 2, fy + 50, { font: FONT_NORMAL, color: '#FFFFFF' });

  // Show current car stats
  drawText('Current rating: ' + getMaxSpeed(), GAME_W / 2, fy + 72, { font: FONT_SMALL, color: '#AAAAAA' });

  const bx = (GAME_W - 120) / 2;
  const canChassis = game.money >= UPGRADE_THRESHOLDS.chassis;
  const canWheels = game.money >= UPGRADE_THRESHOLDS.wheels;
  const canEngine = game.money >= UPGRADE_THRESHOLDS.engines;

  if (canChassis) drawButton('CHASSIS', bx, fy + 95, 120, 28);
  else { ctx.globalAlpha = 0.4; drawButton('CHASSIS', bx, fy + 95, 120, 28); ctx.globalAlpha = 1; }

  if (canWheels) drawButton('WHEELS', bx, fy + 130, 120, 28);
  else { ctx.globalAlpha = 0.4; drawButton('WHEELS', bx, fy + 130, 120, 28); ctx.globalAlpha = 1; }

  if (canEngine) drawButton('ENGINE', bx, fy + 165, 120, 28);
  else { ctx.globalAlpha = 0.4; drawButton('ENGINE', bx, fy + 165, 120, 28); ctx.globalAlpha = 1; }

  drawButton('SKIP', bx, fy + 200, 120, 22);
  drawMoneyCounter();
};

stateUpdate.upgrade = function() {
  if (input.clicked) {
    const fx = (GAME_W - 361) / 2;
    const fy = (GAME_H - 225) / 2;
    const bx = (GAME_W - 120) / 2;

    if (hitTest({ x: bx, y: fy + 95, w: 120, h: 28 }) && game.money >= UPGRADE_THRESHOLDS.chassis) {
      game.upgrading = 'chassis';
      setState('chassis');
    }
    if (hitTest({ x: bx, y: fy + 130, w: 120, h: 28 }) && game.money >= UPGRADE_THRESHOLDS.wheels) {
      game.upgrading = 'wheels';
      setState('wheels');
    }
    if (hitTest({ x: bx, y: fy + 165, w: 120, h: 28 }) && game.money >= UPGRADE_THRESHOLDS.engines) {
      game.upgrading = 'engines';
      setState('engine');
    }
    if (hitTest({ x: bx, y: fy + 200, w: 120, h: 22 })) {
      // Skip upgrade, go to next jump
      newLevel();
      if (gameState !== 'win') {
        game.maxSpeed = getMaxSpeed();
        setState('lightrun');
      }
    }
  }
};

// ============================================================
// STATE: CRASHOVER (game over)
// ============================================================
stateRender.crashover = function() {
  ctx.drawImage(IMG.background, 0, 0, GAME_W, GAME_H);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  const fx = (GAME_W - 361) / 2;
  const fy = (GAME_H - 225) / 2;
  ctx.drawImage(IMG.textframe, fx, fy);

  drawText('GAME OVER', GAME_W / 2, fy + 40, { color: '#FF4444', font: 'bold 20px "Trebuchet MS", sans-serif' });
  drawText('You ran out of money!', GAME_W / 2, fy + 75, { font: FONT_NORMAL, color: '#FFFFFF' });
  drawText('Jumps completed: ' + Math.max(0, game.junkPiles - 1), GAME_W / 2, fy + 100, { font: FONT_NORMAL, color: '#CCCCCC' });

  drawButton('PLAY AGAIN', (GAME_W - 130) / 2, fy + 150, 130, 35);
};

stateUpdate.crashover = function() {
  if (input.clicked) {
    const fy = (GAME_H - 225) / 2;
    if (hitTest({ x: (GAME_W - 130) / 2, y: fy + 150, w: 130, h: 35 })) {
      newGame();
      setState('splash');
    }
  }
};

// ============================================================
// STATE: NOMONEY
// ============================================================
stateRender.nomoney = function() {
  ctx.drawImage(IMG.background, 0, 0, GAME_W, GAME_H);
  const fx = (GAME_W - 361) / 2;
  const fy = (GAME_H - 225) / 2;
  ctx.drawImage(IMG.textframe, fx, fy);

  drawText('NOT ENOUGH MONEY', GAME_W / 2, fy + 30, { color: '#FF8800', font: 'bold 14px "Trebuchet MS", sans-serif' });
  drawText('You can\'t afford any upgrades.', GAME_W / 2, fy + 60, { font: FONT_NORMAL, color: '#FFFFFF' });

  drawButton('NEXT JUMP', (GAME_W - 120) / 2, fy + 130, 120, 30);
  drawMoneyCounter();
};

stateUpdate.nomoney = function() {
  if (input.clicked) {
    const fy = (GAME_H - 225) / 2;
    if (hitTest({ x: (GAME_W - 120) / 2, y: fy + 130, w: 120, h: 30 })) {
      newLevel();
      if (gameState !== 'win') {
        game.maxSpeed = getMaxSpeed();
        setState('lightrun');
      }
    }
  }
};

// ============================================================
// STATE: WIN
// ============================================================
stateEnter.win = function() {
  stopAllSounds();
};

stateRender.win = function() {
  ctx.drawImage(IMG.winscreen, 0, 0, GAME_W, GAME_H);

  drawText('YOU WIN!', GAME_W / 2, 30, { color: '#FFD700', font: 'bold 24px "Trebuchet MS", sans-serif' });
  drawText('You cleared all 6 junk piles!', GAME_W / 2, 60, { font: FONT_BOLD, color: '#FFFFFF' });

  drawButton('PLAY AGAIN', (GAME_W - 130) / 2, GAME_H - 50, 130, 35);
};

stateUpdate.win = function() {
  if (input.clicked) {
    if (hitTest({ x: (GAME_W - 130) / 2, y: GAME_H - 50, w: 130, h: 35 })) {
      newGame();
      setState('splash');
    }
  }
};

// ============================================================
// MAIN GAME LOOP
// ============================================================
let lastTime = 0;
let accumulator = 0;

function update() {
  const handler = stateUpdate[gameState];
  if (handler) handler();
  // Clear click input after processing
  input.clicked = false;
}

function render() {
  // Clear
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  if (gameState === 'loading') {
    renderLoading();
    return;
  }

  const handler = stateRender[gameState];
  if (handler) handler();
}

function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop);

  if (lastTime === 0) { lastTime = timestamp; return; }
  const dt = timestamp - lastTime;
  lastTime = timestamp;
  accumulator += dt;

  // Cap accumulator to prevent spiral of death
  if (accumulator > FRAME_MS * 5) accumulator = FRAME_MS * 5;

  while (accumulator >= FRAME_MS) {
    update();
    accumulator -= FRAME_MS;
  }

  render();
}

// ============================================================
// BOOT
// ============================================================
newGame();

loadAssets(
  progress => { loadProgress = progress; },
  () => { setState('splash'); }
);

requestAnimationFrame(gameLoop);
