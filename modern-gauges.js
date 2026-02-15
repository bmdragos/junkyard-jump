// ============================================================
// MODERN VECTOR GAUGES
// Canvas2D-drawn tachometer and speedometer for modern mode.
// Pre-renders gauge faces to offscreen canvases, then blits
// + draws needle each frame.
//
// Usage (from game.js):
//   drawModernGauges(ctx, speed, tachAngle, tachJitter);
// ============================================================

const MG_R = 40; // gauge radius (matches 81x81 bitmap footprint)

// Screen positions (matching game.js: gx = GAME_W-170, gy = GAME_H-90)
const MG_TACH_CX = 295;  // gx + 40
const MG_TACH_CY = 240;  // gy + 40
const MG_SPEED_CX = 380; // gx + 125
const MG_SPEED_CY = 240; // gy + 40

// Offscreen face caches
let _mgTachFace = null;
let _mgSpeedFace = null;

// Convert game angleDeg to canvas radians
// angleDeg: 0=9o'clock, 90=12, 180=3, 270=6 (CW, same as drawNeedle)
// canvas:   0=3o'clock, PI/2=6, PI=9, 3PI/2=12
function _mgRad(angleDeg) {
  return (angleDeg - 180) * Math.PI / 180;
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================
function drawModernGauges(ctx, speed, tachAngle, tachJitter) {
  const size = MG_R * 2 + 6;
  if (!_mgTachFace) _mgTachFace = _mgRenderFace('tach', size);
  if (!_mgSpeedFace) _mgSpeedFace = _mgRenderFace('speed', size);

  // Blit tach face + needle
  ctx.drawImage(_mgTachFace, MG_TACH_CX - size / 2, MG_TACH_CY - size / 2);
  _mgNeedle(ctx, MG_TACH_CX, MG_TACH_CY, tachAngle + 330 + tachJitter);

  // Blit speed face + needle
  ctx.drawImage(_mgSpeedFace, MG_SPEED_CX - size / 2, MG_SPEED_CY - size / 2);
  _mgNeedle(ctx, MG_SPEED_CX, MG_SPEED_CY, speed * 3 + 270);
}

// ============================================================
// FACE PRE-RENDERING
// ============================================================
function _mgRenderFace(type, size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;

  _mgBezel(g, cx, cy, MG_R);
  _mgFace(g, cx, cy, MG_R - 4);
  if (type === 'tach') _mgRedZone(g, cx, cy, MG_R - 5);
  _mgInnerGlow(g, cx, cy, MG_R - 3);
  if (type === 'speed') {
    _mgSpeedTicks(g, cx, cy, MG_R);
  } else {
    _mgTachTicks(g, cx, cy, MG_R);
  }
  return c;
}

// ============================================================
// BEZEL
// ============================================================
function _mgBezel(g, cx, cy, R) {
  // Metallic ring gradient
  const grad = g.createRadialGradient(cx - 3, cy - 3, R - 5, cx + 1, cy + 1, R + 1);
  grad.addColorStop(0, '#778899');
  grad.addColorStop(0.3, '#aabbcc');
  grad.addColorStop(0.5, '#ddeeff');
  grad.addColorStop(0.7, '#8899aa');
  grad.addColorStop(1, '#3a4a5a');

  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fillStyle = grad;
  g.fill();

  // Outer edge
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.strokeStyle = '#1a1a1a';
  g.lineWidth = 0.8;
  g.stroke();

  // Specular highlight arc (upper-left)
  g.beginPath();
  g.arc(cx, cy, R - 1.5, Math.PI * 0.85, Math.PI * 1.4);
  g.strokeStyle = 'rgba(220, 235, 255, 0.35)';
  g.lineWidth = 1.5;
  g.stroke();
}

// ============================================================
// FACE BACKGROUND
// ============================================================
function _mgFace(g, cx, cy, r) {
  const grad = g.createRadialGradient(cx, cy - r * 0.2, 0, cx, cy, r);
  grad.addColorStop(0, '#181820');
  grad.addColorStop(1, '#08080c');

  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = grad;
  g.fill();
}

// ============================================================
// INNER GLOW
// ============================================================
function _mgInnerGlow(g, cx, cy, r) {
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(80, 180, 200, 0.12)';
  g.lineWidth = 1.5;
  g.stroke();
}

// ============================================================
// RED ZONE (tach only)
// ============================================================
function _mgRedZone(g, cx, cy, r) {
  // Red zone: tach marks 8-10 on a 10k scale (last 20% of 270° sweep)
  // tachAngle 8/10*270=216 → angleDeg 546
  // tachAngle 10/10*270=270 → angleDeg 600
  const startRad = _mgRad(546);
  const endRad = _mgRad(600);

  // Filled sector
  g.beginPath();
  g.moveTo(cx, cy);
  g.arc(cx, cy, r, startRad, endRad, false);
  g.closePath();
  g.fillStyle = 'rgba(160, 15, 15, 0.3)';
  g.fill();

  // Red arc edge
  g.beginPath();
  g.arc(cx, cy, r - 1, startRad, endRad, false);
  g.strokeStyle = 'rgba(255, 50, 50, 0.5)';
  g.lineWidth = 2;
  g.stroke();
}

// ============================================================
// SPEEDOMETER TICKS + NUMBERS
// ============================================================
function _mgSpeedTicks(g, cx, cy, R) {
  // Major ticks at 10, 20, ..., 100
  for (let s = 10; s <= 100; s += 10) {
    const rad = _mgRad(s * 3 + 270);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Major tick line
    g.beginPath();
    g.moveTo(cx + cos * (R - 6), cy + sin * (R - 6));
    g.lineTo(cx + cos * (R - 13), cy + sin * (R - 13));
    g.strokeStyle = '#ccccbb';
    g.lineWidth = 1.5;
    g.stroke();

    // Number
    g.fillStyle = '#ccbb88';
    g.font = 'bold 7px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(s.toString(), cx + cos * (R - 20), cy + sin * (R - 20));
  }

  // Minor ticks at 5, 15, 25, ..., 95
  for (let s = 5; s <= 95; s += 10) {
    const rad = _mgRad(s * 3 + 270);
    g.beginPath();
    g.moveTo(cx + Math.cos(rad) * (R - 6), cy + Math.sin(rad) * (R - 6));
    g.lineTo(cx + Math.cos(rad) * (R - 10), cy + Math.sin(rad) * (R - 10));
    g.strokeStyle = '#666655';
    g.lineWidth = 0.8;
    g.stroke();
  }
}

// ============================================================
// TACHOMETER TICKS + NUMBERS
// ============================================================
function _mgTachTicks(g, cx, cy, R) {
  // Major ticks at 1-10 (x1000 RPM)
  for (let n = 1; n <= 10; n++) {
    const tachAngle = (n / 10) * 270;
    const rad = _mgRad(tachAngle + 330);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const isDanger = n >= 8;

    // Major tick
    g.beginPath();
    g.moveTo(cx + cos * (R - 6), cy + sin * (R - 6));
    g.lineTo(cx + cos * (R - 13), cy + sin * (R - 13));
    g.strokeStyle = isDanger ? '#ee4444' : '#ccccbb';
    g.lineWidth = 1.5;
    g.stroke();

    // Number
    g.fillStyle = isDanger ? '#ee5555' : '#ccbb88';
    g.font = 'bold 7px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(n.toString(), cx + cos * (R - 19), cy + sin * (R - 19));
  }

  // Minor ticks between numbers
  for (let n = 0.5; n <= 9.5; n += 1) {
    const tachAngle = (n / 10) * 270;
    const rad = _mgRad(tachAngle + 330);
    g.beginPath();
    g.moveTo(cx + Math.cos(rad) * (R - 6), cy + Math.sin(rad) * (R - 6));
    g.lineTo(cx + Math.cos(rad) * (R - 10), cy + Math.sin(rad) * (R - 10));
    g.strokeStyle = '#555544';
    g.lineWidth = 0.8;
    g.stroke();
  }
}

// ============================================================
// NEEDLE (drawn per frame)
// ============================================================
function _mgNeedle(ctx, cx, cy, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  const len = MG_R - 10;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rad);

  // Drop shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  // Gradient needle body
  const grad = ctx.createLinearGradient(0, -len, 0, 5);
  grad.addColorStop(0, '#ff3030');
  grad.addColorStop(0.6, '#cc0808');
  grad.addColorStop(1, '#880000');

  ctx.beginPath();
  ctx.moveTo(0, -len);       // tip
  ctx.lineTo(-2.5, -8);      // left shoulder
  ctx.lineTo(-1.5, 5);       // left tail
  ctx.lineTo(1.5, 5);        // right tail
  ctx.lineTo(2.5, -8);       // right shoulder
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Remove shadow for cap
  ctx.shadowColor = 'transparent';

  // Center cap
  const capGrad = ctx.createRadialGradient(-1, -1, 0, 0, 0, 5);
  capGrad.addColorStop(0, '#555');
  capGrad.addColorStop(0.6, '#2a2a2a');
  capGrad.addColorStop(1, '#111');

  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = capGrad;
  ctx.fill();

  // Cap specular dot
  ctx.beginPath();
  ctx.arc(-1, -1.5, 1.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fill();

  ctx.restore();
}
