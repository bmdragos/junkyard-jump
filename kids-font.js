// ============================================================
// The original game's embedded font "Kids *" (cast member 31, a PFR1 font),
// as glyph outlines in assets/classic/fonts/kids.json (tools/dirplayer-dumps).
// Glyphs are filled as canvas paths: Chrome's text pipeline (CoreText smoothing
// on macOS) would draw a converted TTF bolder than the original.
// Shared by classic.js and game.js.
// ============================================================
const KidsFont = (function () {
  let font = null;
  const paths = {};

  function glyph(ch) {
    const code = ch.charCodeAt(0);
    const g = font.glyphs[code];
    if (!g) return null;
    if (!paths[code]) {
      const p = new Path2D();
      for (const cont of g.c) {
        for (const c of cont) {
          if (c[0] === 'M') p.moveTo(c[1], c[2]);
          else if (c[0] === 'L') p.lineTo(c[1], c[2]);
          else if (c[0] === 'C') p.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
          else if (c[0] === 'Z') p.closePath();
        }
        p.closePath();
      }
      paths[code] = p;
    }
    return { w: g.w, path: paths[code] };
  }

  return {
    ASCENT: 2007 / 2048,
    async load(url) {
      if (!font) font = await (await fetch(url || 'assets/classic/fonts/kids.json')).json();
      return font;
    },
    get loaded() { return !!font; },
    width(str, size) {
      let w = 0;
      for (const ch of str) { const g = glyph(ch); if (g) w += g.w; }
      return w * size / font.unitsPerEm;
    },
    // fill str with its baseline at y, using the context's current fillStyle
    fill(g, str, x, baseline, size) {
      const k = size / font.unitsPerEm;
      let pen = x;
      for (const ch of str) {
        const gl = glyph(ch);
        if (!gl) continue;
        g.save();
        g.translate(pen, baseline);
        g.scale(k, -k);
        g.fill(gl.path, 'nonzero');
        g.restore();
        pen += gl.w * k;
      }
    },
    // word-wrap like Director's text members: \r breaks paragraphs, words wrap at width
    layout(text, size, width) {
      const lines = [];
      for (const para of text.split('\r')) {
        const words = para.split(' ');
        let line = '';
        for (let i = 0; i < words.length; i++) {
          const test = line === '' ? words[i] : line + ' ' + words[i];
          if (line !== '' && this.width(test, size) > width) { lines.push(line); line = words[i]; }
          else line = test;
        }
        lines.push(line);
      }
      return lines;
    },
  };
})();
