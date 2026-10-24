// ============================================================
// JUNKYARD JUMP - Classic mode
// A small Director 7 runtime that plays the original Score
// (assets/classic/score.json, exported from junkyard.dir by tools/export_score.py)
// with the original Lingo scripts ported 1:1 below.
// Every number here comes from the Score, the cast or the decompiled Lingo;
// see docs/fidelity.md for the evidence and the remaining unknowns.
// ============================================================
(function () {
'use strict';

const STAGE_W = 425, STAGE_H = 290;
const TEMPO = 15; // Score frame 1 tempo channel: 15 fps
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Director keeps a channel puppeted after puppetSound(n, member) until
// puppetSound(n, 0); this movie never releases channel 1. Unverified against
// a real Shockwave player (dirplayer-rs does not model it) — see docs/fidelity.md.
const STICKY_PUPPET_SOUND = true;

let SC, TEXT, BMP;            // score.json, texts.json, bitmaps.json
const IMG = {}, TRANSPARENT = {}, SND = {};
const memberByName = {};
const labelFrame = {};
let audioCtx = null;

// ------------------------------------------------------------
// Lingo numbers: integers and floats are distinct types.
// int / int truncates; assigning a float to an integer sprite
// property truncates; integer() rounds half away from zero.
// ------------------------------------------------------------
class LF { constructor(v) { this.v = v; } }
const isF = x => x instanceof LF;
const nv = x => (isF(x) ? x.v : (typeof x === 'number' ? x : 0)); // VOID counts as 0
const flt = v => new LF(v);
const add = (a, b) => (isF(a) || isF(b) ? flt(nv(a) + nv(b)) : nv(a) + nv(b));
const sub = (a, b) => (isF(a) || isF(b) ? flt(nv(a) - nv(b)) : nv(a) - nv(b));
const mul = (a, b) => (isF(a) || isF(b) ? flt(nv(a) * nv(b)) : nv(a) * nv(b));
const div = (a, b) => (isF(a) || isF(b) ? flt(nv(a) / nv(b)) : Math.trunc(nv(a) / nv(b)));
const lingoAbs = a => (isF(a) ? flt(Math.abs(a.v)) : Math.abs(nv(a)));
const integer = a => (isF(a) ? Math.sign(a.v) * Math.round(Math.abs(a.v)) : nv(a));
const toInt = a => Math.trunc(nv(a));
const random = n => 1 + Math.floor(Math.random() * n);
const string = v => (v === undefined || v === null ? '' : isF(v) ? v.v.toFixed(4) : String(v));
const lingoEq = (a, b) => (typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a === b);
const RETURN = '\r', SPACE = ' ';

// ------------------------------------------------------------
// Player state
// ------------------------------------------------------------
const G = {};                 // Lingo globals
const sprites = [];           // channel 0 = frame script, 1..150 = sprite channels
let spanTable;                // spanTable[ch] = [[start, end, behaviors], ...]
let curFrame = 0;
let frameChanged = false;     // a go() moved the playhead during this tick
let stayOnFrame = false;      // go(the frame) during this tick
let lastScoreSound = [null, null, null];
const soundChan = [null, { src: null, member: null, puppet: false }, { src: null, member: null, puppet: false }];
const events = [];
let mouseX = -1, mouseY = -1, mouseDownSprite = 0, hoverSprite = 0;
let theKey = '';

class Channel {
  constructor(n) {
    this.n = n;
    this.span = -1;
    this.behaviors = [];
    this.base = null;       // score data for the current frame
    this.ovr = {};          // properties set by Lingo during the current span
    this.puppet = null;     // full property set while puppetSprite(n, TRUE)
    this.visible = 1;       // channel property; survives span changes
  }
  prop(k) {
    if (this.puppet) return this.puppet[k];
    if (k in this.ovr) return this.ovr[k];
    return this.base ? this.base[k] : undefined;
  }
  setProp(k, v) {
    if (this.puppet) this.puppet[k] = v; else this.ovr[k] = v;
  }
  effective() {
    if (this.puppet) return this.puppet;
    return this.base ? Object.assign({}, this.base, this.ovr) : (Object.keys(this.ovr).length ? Object.assign({}, this.ovr) : null);
  }
}

function baseFromScore(rec) {
  if (!rec) return null;
  return { member: rec[0], ink: rec[1], locH: rec[2], locV: rec[3], width: rec[4], height: rec[5],
    rotation: rec[6], blend: rec[7], foreColor: rec[8], backColor: rec[9], stretch: rec[10] };
}

// ------------------------------------------------------------
// Members
// ------------------------------------------------------------
function memberNum(ref) {
  if (typeof ref === 'number') return ref;
  if (typeof ref === 'string') return memberByName[ref.toLowerCase()] || 0;
  return 0;
}
const memberType = n => (SC.members[n] ? SC.members[n].type : 0);

const member = ref => {
  const n = memberNum(ref);
  return {
    get text() { return TEXT[n] ? TEXT[n].text : ''; },
    set text(v) { if (TEXT[n]) TEXT[n].text = String(v); },
  };
};

// Sprite reference as seen by Lingo
const spriteProxyCache = {};
function sprite(n) {
  if (spriteProxyCache[n]) return spriteProxyCache[n];
  const ch = sprites[n];
  const p = {
    get spriteNum() { return n; },
    get member() { return ch.prop('member') || 0; },
    set member(v) { ch.setProp('member', memberNum(v)); },
    get locH() { return ch.prop('locH') || 0; },
    set locH(v) { ch.setProp('locH', toInt(v)); },
    get locV() { return ch.prop('locV') || 0; },
    set locV(v) { ch.setProp('locV', toInt(v)); },
    set loc(pt) { ch.setProp('locH', toInt(pt[0])); ch.setProp('locV', toInt(pt[1])); },
    get rotation() { return flt(ch.prop('rotation') || 0); },
    set rotation(v) { ch.setProp('rotation', nv(v)); },
    get visible() { return ch.visible; },
    set visible(v) { ch.visible = v ? 1 : 0; },
  };
  spriteProxyCache[n] = p;
  return p;
}

function puppetSprite(n, on) {
  const ch = sprites[n];
  if (on) { if (!ch.puppet) ch.puppet = ch.effective() || {}; }
  else { ch.puppet = null; ch.ovr = {}; }
}

// Sprite geometry: Director rect from loc, reg point and size; quad rotated about loc.
function spriteGeom(n) {
  const ch = sprites[n];
  const s = ch.effective();
  if (!s || !s.member) return null;
  const m = s.member;
  let w = s.width, h = s.height, rx = 0, ry = 0;
  if (memberType(m) === 1 && BMP[m]) {
    const b = BMP[m];
    if (!s.stretch) { w = b.w; h = b.h; }
    rx = b.regX * (w / b.w); ry = b.regY * (h / b.h);
  }
  const left = s.locH - rx, top = s.locV - ry;
  const corners = [[left, top], [left + w, top], [left + w, top + h], [left, top + h]];
  let quad = corners;
  if (s.rotation) {
    const a = s.rotation * Math.PI / 180, c = Math.cos(a), si = Math.sin(a);
    quad = corners.map(([x, y]) => {
      const dx = x - s.locH, dy = y - s.locV;
      return [s.locH + dx * c - dy * si, s.locV + dx * si + dy * c];
    });
  }
  return { s, m, w, h, rx, ry, left, top, quad };
}

// D7 `intersects`: the two sprites' quads overlap (separating-axis test on convex quads).
function intersects(a, b) {
  const ga = spriteGeom(a), gb = spriteGeom(b);
  if (!ga || !gb) return false;
  const axes = [];
  for (const q of [ga.quad, gb.quad]) {
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % 4];
      axes.push([y1 - y2, x2 - x1]);
    }
  }
  for (const [ax, ay] of axes) {
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (const [x, y] of ga.quad) { const p = x * ax + y * ay; minA = Math.min(minA, p); maxA = Math.max(maxA, p); }
    for (const [x, y] of gb.quad) { const p = x * ax + y * ay; minB = Math.min(minB, p); maxB = Math.max(maxB, p); }
    if (maxA <= minB + 1e-9 || maxB <= minA + 1e-9) return false;
  }
  return true;
}

// ------------------------------------------------------------
// Messages
// ------------------------------------------------------------
function callChannel(n, msg, args) {
  let handled = false;
  for (const b of sprites[n].behaviors.slice()) {
    if (typeof b[msg] === 'function') { b[msg](...args); handled = true; }
  }
  return handled;
}
const sendSprite = (n, msg, ...args) => callChannel(n, msg, args);
function sendAllSprites(msg, ...args) {
  for (let n = 1; n <= 150; n++) callChannel(n, msg, args);
}

// ------------------------------------------------------------
// Playhead
// ------------------------------------------------------------
function spanAt(frame, ch) {
  const list = spanTable[ch];
  for (let i = 0; i < list.length; i++) if (list[i][0] <= frame && frame <= list[i][1]) return i;
  return -1;
}

function resolveFrame(target) {
  if (typeof target === 'number') return target;
  if (target === '#next') {
    for (const [f] of SC.labels) if (f > curFrame) return f;
    return curFrame;
  }
  return labelFrame[target.toLowerCase()] || curFrame;
}

function go(target) {
  const f = resolveFrame(target);
  if (f === curFrame) { stayOnFrame = true; return; }
  enterFrameNum(f);
  frameChanged = true;
}
const theFrame = () => curFrame;

function enterFrameNum(f) {
  f = Math.max(1, Math.min(SC.frameCount, f));
  curFrame = f;
  const fr = SC.frames[f - 1];
  const changed = [];
  for (let ch = 0; ch <= 150; ch++) {
    const c = sprites[ch];
    const span = spanAt(f, ch);
    if (span !== c.span) {
      if (c.span >= 0) callChannel(ch, 'endSprite', []);
      for (const b of c.behaviors) b.detached = true;
      c.behaviors = [];
      c.ovr = {};
      c.span = span;
      if (span >= 0) changed.push(ch);
    }
    c.base = ch === 0 ? null : baseFromScore(fr.sprites[ch]);
  }
  for (const ch of changed) {
    for (const scriptMember of spanTable[ch][sprites[ch].span][2]) {
      const Cls = BEHAVIORS[scriptMember];
      if (!Cls) continue;
      const inst = new Cls();
      inst.spriteNum = ch;
      sprites[ch].behaviors.push(inst);
    }
  }
  for (const ch of changed) callChannel(ch, 'beginSprite', []);
  scoreSounds(fr);
}

// ------------------------------------------------------------
// Sound: score channels 1/2 start a sound when the playhead enters a frame whose
// channel holds a different member than the previously played frame; a sound is
// cut when its channel goes empty. Only 'sewing' has the member loop flag.
// ------------------------------------------------------------
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function soundStop(c) {
  const ch = soundChan[c];
  if (ch.src) { try { ch.src.stop(); } catch (e) { /* already stopped */ } }
  ch.src = null; ch.member = null;
}
function soundPlay(c, m) {
  soundStop(c);
  const buf = SND[m];
  if (!buf || !audioCtx) return;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.loop = !!SC.members[m].loop;
  src.connect(audioCtx.destination);
  src.start();
  const ch = soundChan[c];
  ch.src = src; ch.member = m;
  src.onended = () => { if (ch.src === src) { ch.src = null; ch.member = null; } };
}
function scoreSounds(fr) {
  for (const c of [1, 2]) {
    const m = c === 1 ? fr.sound1 : fr.sound2;
    const prev = lastScoreSound[c];
    lastScoreSound[c] = m;
    if (soundChan[c].puppet) continue;
    if (!m) { if (prev) soundStop(c); continue; }
    if (m !== prev) soundPlay(c, m);
  }
}
function puppetSound(c, ref) {
  const m = memberNum(ref);
  if (!m) { soundChan[c].puppet = false; soundStop(c); return; }
  soundChan[c].puppet = STICKY_PUPPET_SOUND;
  soundPlay(c, m);
}

// ------------------------------------------------------------
// Cursor
// ------------------------------------------------------------
function cursor(id) {
  canvas.style.cursor = id === 280 ? 'pointer' : 'default';
}

// ============================================================
// LINGO — movie script (cast member 103), ported line for line
// ============================================================
const MOVIE = {
  prepareMovie() {
    G.gdefaultCursor = 258;
    G.grolloverCursor = 280;
    cursor(G.gdefaultCursor);
    MOVIE.newGame();
  },
  newGame() {
    G.gchasisList = ['bathtub', 'cart', 'chair', 'toilet', 'washer', 'wagon'];
    G.gtireList = ['wheel1', 'wheel2', 'wheel3', 'wheel4'];
    G.gengineList = ['blower', 'airconditioner', 'coffee', 'fan', 'popcorn'];
    G.gselectedPieces = [];
    G.gwhichListToUse = 1;
    G.gdogHandSprite = 17;
    G.gnumberOfJunkPiles = 0;
    G.goffScreenSprite = 42;
    G.gchasisSprite = 53;
    G.gwhichPartToUpgrade = '#none';
    G.guserMoney = 35;
    G.gprizeMoney = 20;
    G.gselectedItem = 0;
    G.gnumberSelected = 0;
    G.gtotalCost = 0;
    G.gpieceCost = 0;
    G.glistCounter = 1;
    G.gperformanceValue = 0;
    G.gcrashed = 0;
    member('selectiontext').text = 'blank';
    member('itemtext').text = 'blank';
  },
  newLEvel() {
    if (G.gnumberOfJunkPiles >= 6) go('win');
    G.gnumberOfJunkPiles = G.gnumberOfJunkPiles + 1;
    G.gselectedItem = 0;
    G.gnumberSelected = 0;
    G.gtotalCost = 0;
    G.gpieceCost = 0;
    G.glistCounter = 1;
    member('moneycounter').text = '$' + string(G.guserMoney) + '.00';
    G.grepairCost = random(3) + 3;
    G.gcrashed = 0;
    G.ggiveItGas = 0;
    G.gprizeMoney = random(5) + 12;
  },
  assembleCar() {
    const chasis = G.gselectedPieces[0], wheels = G.gselectedPieces[1], engine = G.gselectedPieces[2];
    sprite(9).member = chasis;
    sprite(8).member = engine;
    sprite(10).member = wheels;
    sprite(11).member = wheels;
    const v = {
      bathtub: [[-94, 25], [77, 25], [-121, -64]],
      cart: [[-65, 25], [67, 25], [-70, -73]],
      chair: [[-71, 25], [20, 25], [-70, -73]],
      toilet: [[-27, 25], [56, 25], [-66, -50]],
      washer: [[-45, 25], [30, 25], [-66, -50]],
      wagon: [[-38, 30], [37, 30], [-49, -26]],
    }[chasis];
    if (!v) return;
    const [wheel1value, wheel2value, enginevalue] = v;
    const baselocH = sprite(9).locH, baselocV = sprite(9).locV;
    sprite(8).locH = enginevalue[0] + baselocH;
    sprite(8).locV = enginevalue[1] + baselocV;
    sprite(10).locH = wheel1value[0] + baselocH;
    sprite(10).locV = wheel1value[1] + baselocV;
    sprite(11).locH = wheel2value[0] + baselocH;
    sprite(11).locV = wheel2value[1] + baselocV;
  },
  assembleCarForJump() {
    const chasis = G.gselectedPieces[0] + 'sm', wheels = G.gselectedPieces[1] + 'sm', engine = G.gselectedPieces[2] + 'sm';
    sprite(53).member = chasis;
    sprite(52).member = engine;
    sprite(54).member = wheels;
    sprite(55).member = wheels;
  },
  keyDown() {
    const temp = theKey;
    G.geasteregg = string(G.geasteregg) + temp;
    if (theKey === RETURN) G.geasteregg = '';
    const egg = G.geasteregg.toLowerCase();
    if (egg === 'jumpbest') { G.gselectedPieces = ['chair', 'wheel2', 'blower']; go('jumpstart'); }
    else if (egg === 'win') go('win');
    else if (egg === 'new') { MOVIE.newGame(); go(1); }
    else if (egg === 'money') { member('moneycounter').text = '$100.00'; G.guserMoney = 100; }
  },
};

// ============================================================
// LINGO — behaviors (cast members 104-147)
// ============================================================
class ConveyorScript { // 104
  beginSprite() {
    this.mySprite = this.spriteNum;
    this.speed = 15;
    this.moveFlag = 1;
    if (this.mySprite >= 3 && this.mySprite <= 5) this.whatSpriteAmI = '#wheel';
    if (this.mySprite === 6 || this.mySprite === 7) this.whatSpriteAmI = '#belt';
    this.stageLeftBelt = -425;
    this.stageRightBelt = 425;
    for (let i = 26; i <= 29; i++) sprite(i).visible = 0;
  }
  move() { for (let i = 26; i <= 29; i++) sprite(i).visible = 0; this.moveFlag = 1; }
  stop() { for (let i = 26; i <= 29; i++) sprite(i).visible = 1; this.moveFlag = 0; }
  exitFrame() {
    if (!this.moveFlag) return;
    const s = sprite(this.mySprite);
    if (this.whatSpriteAmI === '#wheel') s.rotation = sub(s.rotation, this.speed);
    if (this.whatSpriteAmI === '#belt') {
      if (s.locH <= this.stageLeftBelt) s.locH = this.stageRightBelt;
      else s.locH = s.locH - this.speed;
    }
  }
}

const ITEM_INFO = {
  cart: ['Shopping Cart', 13, 13], chair: ['Recliner', null, 25], bathtub: ['Bathtub', null, 21],
  washer: ['Washer', null, 17], wagon: ['Wagon', 10, 10], toilet: ['Toilet', 8, 8],
  wheel1: ['Go-Cart Tires', 3, 3], wheel2: ['Knobby Tires', null, 15], wheel3: ['White Walls', null, 10],
  wheel4: ['Bicycle Tires', 5, 5], fan: ['Ceiling Fan', null, 19], airconditioner: ['Air Conditioner', null, 15],
  blower: ['Hair Blower', null, 12], popcorn: ['Popcorn Popper', 9, 9], coffee: ['Coffee Maker', 7, 7],
};

class ItemScript { // 105
  beginSprite() {
    this.mySprite = this.spriteNum;
    this.speed = 15;
    this.stageRight = 639;
    this.stageLeft = -225;
    this.stopLoc = 278;
    this.moveFlag = 1;
    this.reset();
  }
  reset() {
    this.alreadyStopped = 0;
    if (G.gwhichListToUse === 1) this.whichList = G.gchasisList;
    if (G.gwhichListToUse === 2) this.whichList = G.gtireList;
    if (G.gwhichListToUse === 3) this.whichList = G.gengineList;
    G.glistCounter = G.glistCounter + 1;
    if (G.glistCounter > this.whichList.length) G.glistCounter = 1;
    this.whatAmI = this.whichList[G.glistCounter - 1];
    sprite(this.mySprite).member = this.whatAmI;
  }
  move() { this.moveFlag = 1; }
  stop() { this.moveFlag = 0; }
  getItemInfo() {
    const info = ITEM_INFO[G.gselectedItem];
    let product, cost;
    if (info && G.gnumberOfJunkPiles < 2) { product = info[0]; cost = info[1] === null ? 'NOT AVAILABLE' : info[1]; }
    if (info && G.gnumberOfJunkPiles > 1) { product = info[0]; cost = info[2]; }
    G.gpieceCost = cost;
    if (cost === 'NOT AVAILABLE') member('itemtext').text = product + RETURN + 'Not Yet Available';
    else member('itemtext').text = string(product) + RETURN + 'Cost: $' + string(cost);
  }
  exitFrame() {
    if (!this.moveFlag) return;
    const s = sprite(this.mySprite);
    if (this.alreadyStopped === 0) {
      if (s.locH <= this.stopLoc) {
        this.alreadyStopped = 1;
        this.moveFlag = 0;
        G.gselectedItem = this.whatAmI;
        this.getItemInfo();
        sendAllSprites('stop');
        sendSprite(G.gdogHandSprite, 'moveDog');
      } else {
        s.locH = s.locH - this.speed;
      }
    } else if (s.locH > this.stageLeft) {
      s.locH = s.locH - this.speed;
    } else {
      s.locH = this.stageRight;
      this.reset();
    }
  }
}

class ItemSelectScript { // 106
  prepareFrame() { sprite(11).member = G.gselectedItem; }
}
class LoopScript { // 107
  exitFrame() { go(theFrame()); }
}
class GoItemStart { // 108
  exitFrame() {
    if (G.gwhichPartToUpgrade === '#none') {
      G.gnumberSelected = G.gnumberSelected + 1;
      if (G.gnumberSelected === 1) go('wheels');
      else if (G.gnumberSelected === 2) go('engine');
      else if (G.gnumberSelected === 3) go('finished');
    } else {
      go('assemble');
    }
  }
}
class AssemblyScript { // 109
  beginSprite() { this.counter = 0; this.maxCounter = 65; }
  enterFrame() {
    for (let i = 8; i <= 11; i++) puppetSprite(i, 0);
    MOVIE.assembleCar();
  }
  exitFrame() {
    if (this.counter < this.maxCounter) { this.counter = this.counter + 1; go(theFrame()); }
    else go('#next');
  }
}
class WheelSelection { // 110
  prepareFrame() {
    puppetSprite(8, 1);
    sprite(8).member = G.gselectedItem;
    G.gwhichListToUse = 2;
    G.glistCounter = 3;
    member('selectiontext').text = 'TIRE SELECTION';
    member('itemtext').text = 'Select tires';
    for (let i = 26; i <= 29; i++) sprite(i).visible = 0;
  }
  exitFrame() {
    puppetSound(1, 'assembly');
    sendAllSprites('move');
    sendSprite(G.gdogHandSprite, 'moveDog');
  }
}
class EngineSelection { // 111
  prepareFrame() {
    puppetSprite(9, 1);
    puppetSprite(10, 1);
    sprite(9).member = G.gselectedItem;
    sprite(10).member = G.gselectedItem;
    G.gwhichListToUse = 3;
    G.glistCounter = 1;
    member('selectiontext').text = 'ENGINE SELECTION';
    member('itemtext').text = 'Select an engine';
    for (let i = 26; i <= 29; i++) sprite(i).visible = 0;
  }
  exitFrame() {
    puppetSound(1, 'assembly');
    sendAllSprites('move');
    sendSprite(G.gdogHandSprite, 'moveDog');
  }
}
class FinishedSelection { // 112
  prepareFrame() {
    puppetSprite(11, 1);
    sprite(11).member = G.gselectedItem;
    member('selectiontext').text = 'Do you want to build this jumper?  The total cost is $' + ' ' + string(G.gtotalCost) + '.00';
  }
}
class ChasisSelect { // 113
  prepareFrame() {
    G.glistCounter = 1;
    G.gselectedItem = 0;
    G.gnumberSelected = 0;
    G.gwhichListToUse = 1;
    for (let i = 8; i <= 11; i++) puppetSprite(i, 0);
    member('selectiontext').text = 'CHASSIS SELECTION';
    member('itemtext').text = 'Select a chassis';
    for (let i = 26; i <= 29; i++) sprite(i).visible = 0;
  }
  exitFrame() {
    puppetSound(1, 'assembly');
    sendAllSprites('move');
    sendSprite(G.gdogHandSprite, 'moveDog');
  }
}
class DogScript { // 114
  beginSprite() {
    this.mySprite = this.spriteNum;
    this.currentMember = 'hand1';
    this.memberList = ['hand1', 'hand2', 'hand3', 'hand2', 'hand3', 'hand2'];
    this.listCounter = 1;
    sprite(this.mySprite).member = this.currentMember;
  }
  moveDog() {
    this.listCounter = this.listCounter + 1;
    if (this.listCounter > this.memberList.length) this.listCounter = 1;
    sprite(this.mySprite).member = this.memberList[this.listCounter - 1];
  }
}
class DelayCounter { // 115
  beginSprite() { this.counter = 0; this.maxCounter = 40; }
  exitFrame() {
    if (this.counter < this.maxCounter) { this.counter = this.counter + 1; go(theFrame()); }
    else go('#next');
  }
}
class PrepareAssembly { // 116
  prepareFrame() {
    cursor(G.gdefaultCursor);
    if (G.gcrashed === 0) MOVIE.newLEvel();
    member('moneycounter').text = '$' + string(G.guserMoney) + '.00';
  }
  exitFrame() {
    puppetSound(1, 'assembly');
    if (G.gwhichPartToUpgrade === '#chasis') go('chasis');
    else if (G.gwhichPartToUpgrade === '#wheels') go('wheels');
    else if (G.gwhichPartToUpgrade === '#engine') go('engine');
  }
}
const FRYER_POSITIONS = [[224, 95], [225, 95], [226, 95], [223, 95], [222, 95], [225, 96], [225, 97], [223, 94], [223, 96], [223, 93], [224, 93], [224, 95]];
class FryerScript { // 117
  beginSprite() { this.mySprite = this.spriteNum; this.positionList = FRYER_POSITIONS; }
  exitFrame() { sprite(this.mySprite).loc = this.positionList[random(this.positionList.length) - 1]; }
}
class GoSplashEnter { enterFrame() { go('splash'); } }      // 118
class GoTo2 { mouseUp() { go(2); } }                         // 119
class GoHelp { mouseUp() { go('help'); } }                   // 120
class GoSplashClick { mouseUp() { go('splash'); } }          // 121
class GoJumpstart { exitFrame() { go('jumpstart'); } }       // 122

function gasKeyDown() { if (theKey === SPACE) G.ggiveItGas = 1; }
function gasKeyUp() { G.ggiveItGas = 0; }

class GasLoop { // 127
  exitFrame() { sendSprite(G.goffScreenSprite, 'giveItGas', G.ggiveItGas); go(theFrame()); }
  keyDown() { gasKeyDown(); }
  keyUp() { gasKeyUp(); }
}

const RATINGS = {
  chasis: { bathtub: 35, cart: 22, chair: 40, toilet: 18, washer: 30, wagon: 20 },
  wheels: { wheel1: 9, wheel2: 20, wheel3: 15, wheel4: 12 },
  engine: { airconditioner: 18, blower: 17, fan: 20, coffee: 12, popcorn: 13 },
};

class OffscreenScript { // 128 — the game controller on sprite 42
  beginSprite() {
    this.acceleration = 1;
    this.deceleration = flt(0.5);
    this.maxSpeed = 80;
    this.moveFlag = 0;
    this.spacebartext = 56;
    this.reset();
  }
  determinePerformance() {
    const combinedRating = nv(RATINGS.chasis[G.gselectedPieces[0]]) + nv(RATINGS.wheels[G.gselectedPieces[1]]) + nv(RATINGS.engine[G.gselectedPieces[2]]);
    G.gperformanceValue = combinedRating;
    this.maxSpeed = combinedRating;
  }
  reset() {
    sprite(this.spacebartext).visible = 1;
    this.speed = 0;
    this.distanceCounter = 5000;
    this.currentState = '#moving';
    this.determinePerformance();
  }
  changeState(newState) { this.currentState = newState; this.moveFlag = 0; }
  giveItGas(gasDown) {
    if (gasDown) {
      if (this.currentState === '#moving') {
        sprite(this.spacebartext).visible = 0;
        this.moveFlag = 1;
        this.currentState = '#moving';
        if (nv(this.speed) < nv(this.maxSpeed)) this.speed = add(this.speed, this.acceleration);
        else this.speed = this.maxSpeed;
      }
    } else if (nv(this.speed) > 0) {
      this.speed = sub(this.speed, this.deceleration);
    } else {
      this.speed = 0;
    }
  }
  stopEverything() { this.speed = 0; sendAllSprites('newSpeed', this.speed); this.moveFlag = 0; }
  exitFrame() {
    if (G.gnumberOfJunkPiles >= 7) go('win');
    if (this.moveFlag) {
      member('distancetext').text = 'Distance to Jump: ' + string(integer(this.distanceCounter));
      sendAllSprites('newSpeed', this.speed);
      if (nv(this.distanceCounter) < 0 && this.currentState !== '#jumping') {
        sendAllSprites('moveRamp');
        if (intersects(G.gchasisSprite, 57)) {
          this.currentState = '#jumping';
          const n = G.gnumberOfJunkPiles;
          if (n >= 1 && n <= 6) go('jump' + n);
          member('distancetext').text = 'Distance to Jump: 0';
        }
      } else {
        this.distanceCounter = sub(this.distanceCounter, this.speed);
      }
    }
    if (this.currentState === '#safeupgrade') {
      if (G.gcrashed === 0) G.guserMoney = G.guserMoney + G.gprizeMoney;
      this.currentState = '#nothing';
      go('upgrade');
    }
    if (this.currentState === '#safenextjump') {
      if (G.gcrashed === 0) MOVIE.newLEvel();
      this.currentState = '#nothing';
      this.reset();
      go('start');
    }
    if (this.currentState === '#crashrepair') {
      G.gwhichPartToUpgrade = '#none';
      this.currentState = '#nothing';
      go('repaired');
    }
    if (this.currentState === '#upgrade') { this.currentState = '#nothing'; go('prepare'); }
    if (this.currentState === '#missedTheTruck') { this.currentState = '#nothing'; go('missedramp'); }
    if (this.currentState === '#missedrepair') { this.currentState = '#nothing'; go('repaired2'); }
    if (this.currentState === '#engineblown') { this.stopEverything(); this.currentState = '#nothing'; go('blownengine'); }
    if (this.currentState === '#nomoney') { this.stopEverything(); this.currentState = '#nothing'; go('nomoney'); }
  }
}

class TachNeedle { // 129
  beginSprite() {
    this.mySprite = this.spriteNum;
    this.speed = 0;
    this.startAngle = add(sprite(this.mySprite).rotation, 50);
    this.endAngle = 320;
    this.moveNeedleUp = 0;
    this.oldSpeed = 2;
    this.adjustedSpeed = 0;
    this.blownCounter = 0;
    this.maxblownCounter = 17;
  }
  newSpeed(newValue) {
    this.speed = newValue;
    this.moveNeedleUp = nv(this.speed) >= nv(this.oldSpeed) ? 1 : 0;
    this.oldSpeed = this.speed;
    this.adjustedSpeed = integer(div(this.speed, 3));
  }
  exitFrame() {
    const s = sprite(this.mySprite);
    const currentAngle = s.rotation;
    if (this.moveNeedleUp === 1) {
      if (nv(currentAngle) < this.endAngle) {
        this.blownCounter = 0;
        s.rotation = add(currentAngle, this.adjustedSpeed);
      } else if (this.blownCounter < this.maxblownCounter) {
        this.blownCounter = this.blownCounter + 1;
        s.rotation = this.endAngle;
      } else {
        s.rotation = this.endAngle;
        sendSprite(G.goffScreenSprite, 'changeState', '#engineblown');
      }
    } else if (nv(currentAngle) > nv(this.startAngle)) {
      s.rotation = sub(currentAngle, 15);
    } else {
      s.rotation = this.startAngle;
    }
  }
}

class Speedometer { // 130
  beginSprite() {
    this.mySprite = this.spriteNum;
    this.speed = 0;
    this.startAngle = add(sprite(this.mySprite).rotation, 20);
    this.endAngle = 360;
  }
  newSpeed(newValue) { this.speed = mul(newValue, 3); }
  exitFrame() {
    const s = sprite(this.mySprite);
    if (nv(s.rotation) < this.endAngle) s.rotation = add(this.startAngle, this.speed);
    else s.rotation = this.endAngle;
  }
}

class DelayLoop { // 131
  beginSprite() { this.counter = 0; this.maxCounter = 15; }
  exitFrame() {
    sendSprite(G.goffScreenSprite, 'giveItGas', G.ggiveItGas);
    if (this.counter < this.maxCounter) { this.counter = this.counter + 1; go(theFrame()); }
    else go(theFrame() + 1);
  }
  keyDown() { gasKeyDown(); }
  keyUp() { gasKeyUp(); }
}

class BackgroundScript { // 132
  beginSprite() {
    this.mySprite = this.spriteNum;
    this.speed = 0;
    this.stageLeft = -850;
    this.stageRight = 800;
    this.whichLayer = { 36: 3, 37: 3, 38: 2, 39: 2, 40: 1, 41: 1 }[this.mySprite];
  }
  newSpeed(newValue) {
    this.speed = newValue;
    if (this.whichLayer === 3) this.speed = lingoAbs(div(this.speed, 15));
  }
  exitFrame() {
    if (nv(this.speed) <= 0) this.speed = 0;
    const s = sprite(this.mySprite);
    const currentLocH = s.locH;
    if (currentLocH < this.stageLeft) s.locH = this.stageRight;
    else s.locH = sub(currentLocH, this.speed);
  }
}

class CarScript { // 133
  beginSprite() {
    this.mySprite = this.spriteNum;
    this.startingLocV = sprite(this.mySprite).locV;
    this.engineSprite = 52; this.wheel1Sprite = 54; this.wheel2Sprite = 55; this.dogSprite = 51;
    this.speed = 0;
    this.status = '#moving';
    this.heightCounter = 0;
    this.maxHeightCounter = 50;
    this.direction = '#up';
  }
  newSpeed(newValue) { this.speed = newValue; }
  exitFrame() {
    const newValue = add(sprite(this.wheel1Sprite).rotation, this.speed);
    sprite(this.wheel1Sprite).rotation = newValue;
    sprite(this.wheel2Sprite).rotation = newValue;
  }
}

class RampScript { // 134
  beginSprite() { this.mySprite = this.spriteNum; this.speed = 0; this.moveFlag = 0; }
  moveRamp() { this.moveFlag = 1; }
  newSpeed(newValue) { this.speed = newValue; }
  exitFrame() {
    if (this.moveFlag) { const s = sprite(this.mySprite); s.locH = sub(s.locH, this.speed); }
  }
}

class JumpScript { // 135
  beginSprite() {
    this.mySprite = this.spriteNum;
    this.groundLevel = sprite(this.mySprite).locV;
    this.gravity = flt(0.69999999999999996);
    this.status = '#bounce';
    this.Vdirection = '#up';
    this.Vspeed = 15;
    this.engineSprite = 52; this.wheel1Sprite = 54; this.wheel2Sprite = 55; this.dogSprite = 51;
  }
  moveAll(dv) {
    for (const n of [this.mySprite, this.engineSprite, this.wheel1Sprite, this.wheel2Sprite, this.dogSprite]) {
      sprite(n).locV = add(sprite(n).locV, dv);
    }
  }
  exitFrame() {
    if (this.status === '#bounce') {
      if (this.Vdirection === '#up') {
        if (nv(this.Vspeed) <= 0) {
          this.Vdirection = '#down';
        } else {
          this.Vspeed = sub(this.Vspeed, this.gravity);
          this.moveAll(mul(this.Vspeed, -1));
        }
      }
      if (this.Vdirection === '#down') {
        if (sprite(this.mySprite).locV > this.groundLevel) {
          this.status = '#missedTheTruck';
        } else {
          for (let i = 59; i <= 79; i++) {
            if (intersects(this.mySprite, i)) { G.gcrashed = 1; this.status = '#crashLanding'; break; }
          }
          if (intersects(this.mySprite, 58)) this.status = '#safeLanding';
          this.Vspeed = add(this.Vspeed, this.gravity);
          this.moveAll(this.Vspeed);
        }
      }
    }
    if (this.status === '#safeLanding') go('safe');
    if (this.status === '#crashLanding') go('crash');
    if (this.status === '#missedTheTruck') go('missedramp');
  }
}

class StartJump { // 136
  prepareFrame() { MOVIE.assembleCarForJump(); }
  enterFrame() { sendAllSprites('moveRamp'); }
}
class Runup { // 137
  exitFrame() { MOVIE.assembleCarForJump(); sendSprite(G.goffScreenSprite, 'giveItGas', G.ggiveItGas); }
  keyDown() { gasKeyDown(); }
  keyUp() { gasKeyUp(); }
}
class AssembleScript { // 139
  prepareFrame() {
    member('moneycounter').text = '$' + string(G.guserMoney) + '.00.';
    MOVIE.assembleCarForJump();
  }
}
class CrashScript { // 140
  prepareFrame() {
    member('moneycounter').text = '$' + string(G.guserMoney) + '.00.';
    if (G.guserMoney >= G.grepairCost) {
      member('crashtext').text = 'You Crashed!' + RETURN + 'You will have to repair your vehicle.  Repairs will      cost $' + string(G.grepairCost) + '.00.  You have $' + string(G.guserMoney) + '.00.';
    } else {
      go('crashover');
    }
    G.gcrashed = 1;
  }
}
class StopEverything { // 141
  prepareFrame() {
    member('safetext').text = 'You Made It!' + RETURN + 'You have been awarded $' + string(G.gprizeMoney) + '.00 for this jump.';
  }
  exitFrame() { sendSprite(G.goffScreenSprite, 'stopEverything'); }
}
class PrepareForJump { // 142
  prepareFrame() {
    cursor(G.gdefaultCursor);
    MOVIE.assembleCarForJump();
    member('distancetext').text = 'Distance to Jump: 5000';
    member('ratingtext').text = 'Performance Rating = ' + string(G.gperformanceValue);
    // `gcrashed = 0` here: gcrashed is not declared global in this script, so it only sets a local.
    G.ggiveItGas = 0;
    G.grepairCost = random(5) + 5;
  }
}
class MissedScript { // 143
  prepareFrame() {
    MOVIE.assembleCarForJump();
    MOVIE.newLEvel();
    if (G.gcrashed === 0) G.guserMoney = G.guserMoney + G.gprizeMoney;
    G.gcrashed = 1;
    member('moneycounter').text = '$' + string(G.guserMoney) + '.00.';
    if (G.guserMoney >= G.grepairCost) {
      member('missedramptext').text = 'You made the jump, but missed the landing ramp and damaged your vehicle.  Repairs will cost $' + string(G.grepairCost) + '.00.';
    } else {
      go('crashover');
    }
  }
}
class BlownEngineScript { // 144
  prepareFrame() {
    MOVIE.assembleCarForJump();
    G.gcrashed = 1;
    member('moneycounter').text = '$' + string(G.guserMoney) + '.00.';
    if (G.guserMoney >= G.grepairCost) {
      member('blowntext').text = 'You have blown your engine!' + RETURN + 'Repairs will    cost $' + string(G.grepairCost) + '.00.';
    } else {
      go('crashover');
    }
  }
}
class SafeScript { // 145
  prepareFrame() {
    G.guserMoney = G.guserMoney + G.gprizeMoney;
    let gnumberOfJunkPiles; // not declared global in the original: a local, VOID + 1
    gnumberOfJunkPiles = nv(gnumberOfJunkPiles) + 1;
    G.gcrashed = 0;
    G.gprizeMoney = random(5) + 12;
    member('moneycounter').text = '$' + string(G.guserMoney) + '.00.';
    MOVIE.assembleCarForJump();
  }
}
class Repair2Script { // 146
  prepareFrame() {
    MOVIE.newLEvel();
    member('moneycounter').text = '$' + string(G.guserMoney) + '.00.';
    MOVIE.assembleCarForJump();
  }
}
class Repair1Script { // 147
  prepareFrame() {
    member('moneycounter').text = '$' + string(G.guserMoney) + '.00.';
    MOVIE.assembleCarForJump();
  }
}

const BEHAVIORS = {
  104: ConveyorScript, 105: ItemScript, 106: ItemSelectScript, 107: LoopScript, 108: GoItemStart,
  109: AssemblyScript, 110: WheelSelection, 111: EngineSelection, 112: FinishedSelection, 113: ChasisSelect,
  114: DogScript, 115: DelayCounter, 116: PrepareAssembly, 117: FryerScript, 118: GoSplashEnter,
  119: GoTo2, 120: GoHelp, 121: GoSplashClick, 122: GoJumpstart, 127: GasLoop, 128: OffscreenScript,
  129: TachNeedle, 130: Speedometer, 131: DelayLoop, 132: BackgroundScript, 133: CarScript,
  134: RampScript, 135: JumpScript, 136: StartJump, 137: Runup, 139: AssembleScript, 140: CrashScript,
  141: StopEverything, 142: PrepareForJump, 143: MissedScript, 144: BlownEngineScript, 145: SafeScript,
  146: Repair2Script, 147: Repair1Script,
};

// ============================================================
// LINGO — cast member scripts on the button text members
// ============================================================
const rollover = { mouseWithin() { cursor(G.grolloverCursor); }, mouseLeave() { cursor(G.gdefaultCursor); } };
const upgradeButton = (limit, part) => Object.assign({
  mouseUp() {
    if (G.gcrashed === 0) G.guserMoney = G.guserMoney + G.gprizeMoney;
    if (G.guserMoney < limit) sendSprite(G.goffScreenSprite, 'changeState', '#nomoney');
    else { G.gwhichPartToUpgrade = part; sendSprite(G.goffScreenSprite, 'changeState', '#upgrade'); }
  },
}, rollover);
const repairButton = Object.assign({
  mouseUp() {
    if (G.guserMoney > G.grepairCost) {
      G.guserMoney = G.guserMoney - G.grepairCost;
      sendSprite(G.goffScreenSprite, 'changeState', '#crashrepair');
    } else {
      go('crashover');
    }
  },
}, rollover);

const CAST_SCRIPTS = {
  32: Object.assign({ // nextb
    mouseUp() { sendAllSprites('move'); sendSprite(G.gdogHandSprite, 'moveDog'); puppetSound(1, 'assembly'); },
  }, rollover),
  33: Object.assign({ // selectb
    mouseUp() {
      if (G.gpieceCost === 'NOT AVAILABLE') {
        member('itemtext').text = 'THIS PIECE IS NOT YET AVAILABLE';
      } else if (nv(G.gpieceCost) <= G.guserMoney) {
        sprite(11).member = G.gselectedItem;
        if (G.gwhichPartToUpgrade === '#none') {
          G.gselectedPieces.push(G.gselectedItem);
        } else {
          const idx = { '#chasis': 0, '#wheels': 1, '#engine': 2 }[G.gwhichPartToUpgrade];
          if (idx !== undefined) G.gselectedPieces.splice(idx, 1, G.gselectedItem);
        }
        G.guserMoney = G.guserMoney - nv(G.gpieceCost);
        G.gtotalCost = G.gtotalCost + nv(G.gpieceCost);
        member('moneycounter').text = '$' + string(G.guserMoney) + '.00';
        sendSprite(G.gdogHandSprite, 'moveDog');
        go('pickup');
      } else {
        member('itemtext').text = 'YOU DO NOT HAVE ENOUGH MONEY';
      }
    },
  }, rollover),
  34: Object.assign({ mouseUp() { go('assemble'); } }, rollover), // yesb
  35: Object.assign({ // nob
    mouseUp() {
      G.guserMoney = G.guserMoney + G.gtotalCost;
      member('moneycounter').text = '$' + string(G.guserMoney) + '.00';
      G.gtotalCost = 0;
      // `gselectedPieces = []` here assigns a local: the global list keeps its pieces.
      go('chasis');
    },
  }, rollover),
  81: Object.assign({ mouseUp() { sendSprite(G.goffScreenSprite, 'changeState', '#safeupgrade'); } }, rollover),
  82: Object.assign({ mouseUp() { sendSprite(G.goffScreenSprite, 'changeState', '#safenextjump'); } }, rollover),
  83: repairButton,
  84: repairButton,
  88: upgradeButton(20, '#chasis'),
  89: upgradeButton(12, '#wheels'),
  90: upgradeButton(15, '#engine'),
  94: { mouseUp() { MOVIE.newGame(); go(1); } }, // playagainb: no rollover handlers
};

// ============================================================
// Rendering
// ============================================================
const PALETTE = { 0: '#ffffff', 255: '#000000' }; // Mac system palette ends
const KIDS_ASCENT = KidsFont.ASCENT;

function transparentImage(m) {
  if (TRANSPARENT[m]) return TRANSPARENT[m];
  const img = IMG[m];
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] === 255 && px[i + 1] === 255 && px[i + 2] === 255) px[i + 3] = 0;
  }
  g.putImageData(d, 0, 0);
  TRANSPARENT[m] = c;
  return c;
}

// Text uses the embedded "Kids *" font via kids-font.js (shared with Modern).
const textWidth = (str, size) => KidsFont.width(str, size);
const fillTextPath = (g, str, x, baseline, size) => KidsFont.fill(g, str, x, baseline, size);
const layoutText = (text, size, width) => KidsFont.layout(text, size, width);

const textCache = new Map();
function textImage(m, t, w, h) {
  const key = m + '|' + w + '|' + h + '|' + t.text;
  let c = textCache.get(key);
  if (c) return c;
  const span = t.spans[0] || { size: 12, color: 0xffffffff };
  const size = span.size;
  // Natural line pitch: the authored text boxes record Director's own measurement —
  // itemtext is 32px tall for two 14pt lines, selectiontext 16px for one.
  const lineH = t.fixedLineSpace || Math.round(size * 8 / 7);
  const col = span.color >>> 0;
  // Text sprites are not clipped to the Score's height: a text member's rect grows with its
  // text (reference/original/help.png shows the help text running past its 198px box).
  const lines = layoutText(t.text, size, w);
  c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h, lines.length * lineH + Math.ceil(size * 0.3));
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(' + ((col >> 16) & 255) + ',' + ((col >> 8) & 255) + ',' + (col & 255) + ')';
  lines.forEach((line, i) => {
    const lw = textWidth(line, size);
    let x = 0;
    if (t.align === 'Center') x = (w - lw) / 2;
    else if (t.align === 'Right') x = w - lw;
    fillTextPath(g, line, Math.round(x), Math.round(size * KIDS_ASCENT) + i * lineH, size);
  });
  if (textCache.size > 200) textCache.clear();
  textCache.set(key, c);
  return c;
}

function drawTextSprite(g) {
  const t = TEXT[g.m];
  if (!t) return;
  ctx.drawImage(textImage(g.m, t, Math.round(g.w), Math.round(g.h)), Math.round(g.left), Math.round(g.top));
}

function drawShapeSprite(g) {
  const info = SC.members[g.m].shapeInfo;
  ctx.save();
  ctx.globalAlpha = g.s.blend / 100;
  const color = PALETTE[g.s.foreColor] || '#000000';
  // Unfilled boxes (member 64: the splash hotspots and the offscreen controller) draw
  // nothing in the original — reference/junkyardjump.png shows no outline round START.
  if (info.filled) { ctx.fillStyle = color; ctx.fillRect(g.left, g.top, g.w, g.h); }
  ctx.restore();
}

function drawBitmapSprite(g) {
  const img = g.s.ink === 36 ? transparentImage(g.m) : IMG[g.m];
  if (!img) return;
  ctx.save();
  ctx.globalAlpha = g.s.blend / 100;
  ctx.translate(g.s.locH, g.s.locV);
  if (g.s.rotation) ctx.rotate(g.s.rotation * Math.PI / 180);
  ctx.drawImage(img, -g.rx, -g.ry, g.w, g.h);
  ctx.restore();
}

function render() {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  for (let n = 1; n <= 150; n++) {
    if (!sprites[n].visible) continue;
    const g = spriteGeom(n);
    if (!g) continue;
    const t = memberType(g.m);
    if (t === 1) drawBitmapSprite(g);
    else if (t === 15) drawTextSprite(g);
    else if (t === 8) drawShapeSprite(g);
  }
  if (window.JJ_CLASSIC_OVERLAY) window.JJ_CLASSIC_OVERLAY(ctx, curFrame);
}

// ============================================================
// Input
// ============================================================
function spriteAt(x, y) {
  for (let n = 150; n >= 1; n--) {
    if (!sprites[n].visible) continue;
    const g = spriteGeom(n);
    if (!g) continue;
    const xs = g.quad.map(p => p[0]), ys = g.quad.map(p => p[1]);
    if (x >= Math.min(...xs) && x < Math.max(...xs) && y >= Math.min(...ys) && y < Math.max(...ys)) return n;
  }
  return 0;
}

// mouse events: sprite behaviors, then the member's cast script
function mouseEvent(n, msg) {
  if (!n) return;
  if (callChannel(n, msg, [])) return;
  const cs = CAST_SCRIPTS[sprites[n].prop('member')];
  if (cs && cs[msg]) cs[msg]();
}

function keyEvent(msg) {
  if (callChannel(0, msg, [])) return; // frame script
  if (MOVIE[msg]) MOVIE[msg]();
}

function processInput() {
  while (events.length && !frameChanged) {
    const e = events.shift();
    if (e.type === 'down') { mouseDownSprite = spriteAt(e.x, e.y); mouseEvent(mouseDownSprite, 'mouseDown'); }
    else if (e.type === 'up') {
      const n = spriteAt(e.x, e.y);
      if (n && n === mouseDownSprite) mouseEvent(n, 'mouseUp');
      mouseDownSprite = 0;
    } else if (e.type === 'keydown') { theKey = e.key; keyEvent('keyDown'); }
    else if (e.type === 'keyup') { theKey = e.key; keyEvent('keyUp'); }
  }
  if (frameChanged) return;
  const n = mouseX >= 0 ? spriteAt(mouseX, mouseY) : 0;
  if (n !== hoverSprite) { mouseEvent(hoverSprite, 'mouseLeave'); hoverSprite = n; mouseEvent(n, 'mouseEnter'); }
  if (n) mouseEvent(n, 'mouseWithin');
}

function stageCoords(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (STAGE_W / r.width), y: (e.clientY - r.top) * (STAGE_H / r.height) };
}

function installInput() {
  canvas.addEventListener('mousedown', e => {
    ensureAudio();
    const c = stageCoords(e);
    if (window.JJ_CLASSIC_CLICK && window.JJ_CLASSIC_CLICK(c.x, c.y, curFrame)) return;
    events.push({ type: 'down', x: c.x, y: c.y });
  });
  canvas.addEventListener('mouseup', e => { const c = stageCoords(e); events.push({ type: 'up', x: c.x, y: c.y }); });
  canvas.addEventListener('mousemove', e => { const c = stageCoords(e); mouseX = c.x; mouseY = c.y; });
  canvas.addEventListener('mouseleave', () => { mouseX = mouseY = -1; });
  canvas.addEventListener('touchstart', e => {
    e.preventDefault(); ensureAudio();
    const c = stageCoords(e.touches[0]);
    if (window.JJ_CLASSIC_CLICK && window.JJ_CLASSIC_CLICK(c.x, c.y, curFrame)) return;
    mouseX = c.x; mouseY = c.y;
    events.push({ type: 'down', x: c.x, y: c.y });
    events.push({ type: 'up', x: c.x, y: c.y });
  });
  const keyName = e => (e.key === 'Enter' ? RETURN : e.key === ' ' ? SPACE : e.key.length === 1 ? e.key : null);
  document.addEventListener('keydown', e => {
    ensureAudio();
    const k = keyName(e);
    if (k === null) return;
    if (k === SPACE) e.preventDefault();
    events.push({ type: 'keydown', key: k });
  });
  document.addEventListener('keyup', e => {
    const k = keyName(e);
    if (k !== null) events.push({ type: 'keyup', key: k });
  });
}

// ============================================================
// Frame loop: prepareFrame, draw, enterFrame, events, exitFrame, advance.
// Sprite behaviors run in channel order, then the frame script.
// ============================================================
// The recipient list is fixed when the event starts: after a go() mid-dispatch, the
// remaining behaviors that were attached when the event began still receive it, while
// behaviors that only begin on the new frame wait for its own events. (Reference trace:
// at the ramp, the ramp sprite still moves in that exitFrame; the jump script does not run.)
function dispatchFrameEvent(msg) {
  const list = [];
  for (let n = 1; n <= 150; n++) for (const b of sprites[n].behaviors) list.push(b);
  for (const b of sprites[0].behaviors) list.push(b);
  for (const b of list) {
    if (b.detached) continue;
    if (typeof b[msg] === 'function') b[msg]();
  }
}

function tick() {
  frameChanged = false;
  stayOnFrame = false;
  dispatchFrameEvent('prepareFrame');
  if (frameChanged) return;
  render();
  dispatchFrameEvent('enterFrame');
  if (frameChanged) return;
  processInput();
  if (frameChanged) return;
  dispatchFrameEvent('exitFrame');
  if (frameChanged || stayOnFrame) return;
  enterFrameNum(curFrame + 1 > SC.frameCount ? curFrame : curFrame + 1);
}

let last = 0, acc = 0;
let paused = false; // test hook: tools step ticks by hand
function loop(ts) {
  requestAnimationFrame(loop);
  if (paused) { last = 0; acc = 0; return; }
  if (!last) { last = ts; return; }
  acc += ts - last; last = ts;
  const step = 1000 / TEMPO;
  if (acc > step * 5) acc = step * 5;
  while (acc >= step) { tick(); acc -= step; }
}

// ============================================================
// Boot
// ============================================================
async function loadJSON(p) { const r = await fetch(p); return r.json(); }
function loadImage(src) {
  return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

async function boot() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  [SC, TEXT, BMP] = await Promise.all([
    loadJSON('assets/classic/score.json'), loadJSON('assets/classic/texts.json'), loadJSON('assets/classic/bitmaps.json'),
  ]);
  for (const [f, name] of SC.labels) labelFrame[name.toLowerCase()] = f;
  const nums = Object.keys(SC.members).map(Number).sort((a, b) => a - b);
  for (const n of nums) {
    const m = SC.members[n];
    const key = (m.name || '').toLowerCase();
    if (key && !(key in memberByName)) memberByName[key] = n;
    if (m.type === 8) m.shapeInfo = { filled: parseInt(m.shape.substr(28, 2), 16) !== 0 };
  }
  spanTable = [];
  for (let ch = 0; ch <= 150; ch++) spanTable.push([]);
  for (const [st, en, ch, beh] of SC.intervals) if (ch >= 0 && ch <= 150) spanTable[ch].push([st, en, beh]);
  for (let ch = 0; ch <= 150; ch++) sprites.push(new Channel(ch));

  await KidsFont.load('assets/classic/fonts/kids.json');
  await Promise.all(Object.keys(BMP).map(async n => { IMG[n] = await loadImage('assets/classic/bitmaps/' + n + '.png'); }));

  ensureAudio();
  await Promise.all(nums.filter(n => SC.members[n].type === 6).map(async n => {
    try {
      const r = await fetch('assets/sounds/' + SC.members[n].name + '.wav');
      SND[n] = await audioCtx.decodeAudioData(await r.arrayBuffer());
    } catch (e) { console.warn('sound', n, e); }
  }));

  installInput();
  MOVIE.prepareMovie();
  enterFrameNum(1);
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------
// Mode toggle: not part of the original movie. Drawn on the splash
// (frames 175-179) where the Modern build draws its own, above START.
// ------------------------------------------------------------
const TOGGLE = { x: 305, y: 85, w: 105, h: 23 };
window.JJ_CLASSIC_OVERLAY = (g, frame) => {
  if (frame < 175 || frame > 179 || !KidsFont.loaded) return;
  const label = '[ CLASSIC ]', size = 10;
  g.save();
  g.fillStyle = '#000';
  fillTextPath(g, label, Math.round(375 - textWidth(label, size) / 2) + 1, 102, size);
  g.fillStyle = '#FFD700';
  fillTextPath(g, label, Math.round(375 - textWidth(label, size) / 2), 101, size);
  g.restore();
};
window.JJ_CLASSIC_CLICK = (x, y, frame) => {
  if (frame < 175 || frame > 179) return false;
  if (x < TOGGLE.x || x > TOGGLE.x + TOGGLE.w || y < TOGGLE.y || y > TOGGLE.y + TOGGLE.h) return false;
  localStorage.setItem('jj-mode', 'modern');
  location.reload();
  return true;
};

// Debug/test hooks (used by tools/ and the reference comparison)
window.JJClassic = { G, sprites, sprite, get frame() { return curFrame; }, go, intersects, tick, render, events,
  get paused() { return paused; }, set paused(v) { paused = v; }, nv };
boot();
})();
