# Classic mode fidelity

Classic mode (`classic.js`) is not a re-implementation of the game. It is a small Director 7
player that plays the original Score of `junkyard.dir`, with every Lingo script ported line for
line. Modern mode (`game.js`) is the earlier hand-built rebuild and keeps its own changes.

## How Classic is built

| Piece | Source | Tool |
|---|---|---|
| Score: 358 frames × 150 channels, per-frame member, ink, loc, size, rotation, blend, colors; 381 sprite spans with their behaviors; 31 frame labels; tempo; sound channels | `VWSC` / `VWLB` chunks of `junkyard.dir` | `tools/score_dump.py`, `tools/export_score.py` → `assets/classic/score.json` |
| 61 bitmaps by member number (16-bit RGB555, PackBits rows split into high/low byte planes) with registration points | `BITD` + `CASt` | `tools/extract_bitmaps.py` → `assets/classic/bitmaps/` |
| 30 text members: text, font, size, color, alignment, fixed line spacing | `XMED` styled text | `tools/dirplayer-dumps/build.sh` (dirplayer-rs XMED parser) → `assets/classic/texts.json` |
| The embedded font "Kids *" (member 31) as glyph outlines | PFR1 font in `XMED` | `tools/dirplayer-dumps/build.sh` (dirplayer-rs PFR1 parser) → `assets/classic/fonts/kids.json` |
| Behaviors, movie script, button cast scripts | decompiled Lingo (`decompiled/`) | ported by hand into `classic.js` |

`junkyard.dir`, `decompiled/` and `reference/` are gitignored, so these tools run on a local
checkout that has them. dirplayer-rs is GPL-3.0; `build.sh` fetches it at a pinned commit into a
scratch directory and only our two small `main.rs` wrappers live in this repo.

The old FINDINGS.md said the Score "was not fully extractable". It is all there, and it changes
most of what the rebuild had guessed (see *What the Score corrected* below).

## Reference runtime and how it was checked

The original `junkyard.dcr` runs in [dirplayer-rs](https://github.com/igorlira/dirplayer-rs)
v0.8.1 (polyfill build) in Chrome. Its `__vm.mcp_eval_lingo` hook reads live Lingo state, so the
original can be traced frame by frame and the trace replayed into Classic with the same inputs
(`tools/ref_drive.js`, `tools/port_replay.js`, `tools/tracediff.py`). Screens are compared with
`tools/imgdiff.py`.

| Check | Result |
|---|---|
| Stoplight / runup screen | pixel-identical (0 differing pixels) |
| Runup, 95 frames of speed, distance, tach and speedometer rotation | identical |
| Built car (cart, bicycle tires, air conditioner), runup + ramp + jump 2, 164 frames of speed, distance, car height, ramp / truck / pile positions | identical except the last frame (dirplayer crashes there, see 4 below) |
| Chassis, wheels, crashover, help screens | identical apart from animation timing, parallax scroll position and text sub-pixel placement |

dirplayer is an emulator, not ground truth, so where it disagrees with the Lingo or with a
real Shockwave capture the decision and the evidence are written down here.

## Runtime semantics and the evidence for each

1. **Event order.** `beginSprite` on span entry, then `prepareFrame`, draw, `enterFrame`, input
   events, `exitFrame`; sprite behaviors in channel order, then the frame script (D7 docs; ScummVM
   and dirplayer agree).
2. **`go()` moves the playhead at once**, and the recipients of the event being dispatched are
   fixed when it starts. Evidence: at the ramp the offscreen sprite (channel 42) calls
   `go("jumpN")` from `exitFrame` and the frame script then calls `go(the frame)`. In the
   reference trace the jump frame is reached in that same tick, the ramp sprite (channel 57) still
   moves in it, and the jump script that begins on the new frame does not run until the next tick.
3. **Lingo number types.** int / int truncates, `integer()` rounds half away from zero, and a
   float assigned to an integer sprite property (`locH`, `locV`) truncates. Evidence: the car's
   jump heights in the reference trace (260 → 245 → 231 → 218 …, i.e. 260 − 14.3 = 245.7 → 245);
   ScummVM `Datum::asInt` and dirplayer both truncate. Classic tracks int vs float per value
   (`LF` in `classic.js`), which matters for the tach (`integer(speed / 3)`).
4. **Empty channels never `intersect`.** dirplayer keeps the last rect of an emptied channel, so
   on jumps 1 and 2 the car "hits" channel 66's leftover full-screen fade box at the top of every
   jump (seen in the reference trace). The original was playable, so it cannot have done that.
5. **`intersects` compares the sprites' quads** (D7 Lingo Dictionary: "the quad of sprite1
   touches the quad of sprite2"). The car is rotated −35° in the jump frames, so this matters for
   pile and truck contacts. Not verifiable in dirplayer (it uses unrotated rects). *Unverified.*
6. **`puppetSound` keeps the channel until `puppetSound n, 0`** (D7 docs). The game never
   releases channel 1 after the conveyor's `puppetSound(1, "assembly")`, so the Score's channel-1
   cues after that (stoplight beeps, ramp sound, half of the crane sounds) are suppressed.
   dirplayer ignores puppet state. *Unverified*; one switch, `STICKY_PUPPET_SOUND` in `classic.js`.
7. **Score sounds** start when the playhead enters a frame whose sound channel holds a different
   member than the previously played frame, and are cut when the channel goes empty. Only
   `sewing` (the engine drone) has the member loop flag; the rebuild looped five others.
8. **Inks.** Copy (0) draws opaque; background transparent (36) drops white; the full-screen
   fades are black boxes with Score blend ramps (frames 2–4 in, 160–169 out, 201–209 in); there is
   no transition channel. Unfilled boxes (member 64, the splash START/HOW TO hotspots) draw
   nothing: the real Shockwave capture `reference/junkyardjump.png` shows no outline there.
9. **Text.** "Kids *" glyphs are filled as paths from the font's own outlines (drawing a
   converted TTF with canvas text came out bolder: Chrome's CoreText smoothing). Natural line pitch
   is 16 px for 14 pt, taken from the authored text-box heights (two 14 pt lines in a 32 px box)
   rather than dirplayer's 14 px. Text sprites are not clipped to the Score height (the reference
   help screen runs past its 198 px box). The HUD text is blue (`0x0000AA`), as the reference shows.
10. **Startup.** The playhead visits frame 2 (`newLEvel`) once per START. dirplayer runs it twice
    (its `go()` runs the target frame's handlers immediately and again on the next tick), which
    would make the first-build "Not Yet Available" gating dead code.

## What the Score corrected

| Rebuild assumption | The original |
|---|---|
| Canned jump animation, replaced by an invented arc with a `0.215` horizontal factor and a following camera | Real-time physics (script 135). The car stays at x = 76 and tilts −35°; the trash piles and the landing truck scroll left at the launch speed. Per-level pile and truck layouts are in frames 277–297 |
| Gauge base angles calibrated by eye (speedo 270°, tach 330°), needle drawn procedurally | Needle bitmap (it was not corrupt), Score rotation 0, so the speedo rests at 20° and the tach at 50°. The tach script's span ends at frame 270, so the tach needle drops back during the jump |
| Part offsets tuned by hand | `assembleCar` offsets for the big parts, Score positions for the small car |
| Sky gradient, hand-drawn ramp and screens | Member 49 is the driving sky; every screen is the Score's layout and text |
| "Distance to Jump" ramp trigger `speed > 5` | The ramp (`trucklt`) slides in once the distance is negative; the jump starts when the car's quad touches it |
| Crash: RETRY / UPGRADE | Crash, blown engine and missed ramp offer only REPAIR (needs money **greater** than the cost) or GAME OVER |

With the Score's geometry the jump has a clear difficulty curve. Holding a constant launch speed
with the best car (`tools/port_jumpsweep.js`), these speeds land safely:

| Piles | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Safe speed | 23–33 | 30–40 | 39–48 | 46–55 | 55–64 | 64–72 |

## Original bugs Classic keeps

- The safe-landing script increments a *local* `gnumberOfJunkPiles`; the level only advances via
  `newLEvel` on NEXT JUMP / the next build.
- Prize money is added on landing, again on UPGRADE, and again by each part button on the
  upgrade screen (while `gcrashed = 0`).
- The safe screen shows the *re-rolled* prize, not the one just paid.
- `prepareForJump` sets a local `gcrashed`, not the global.
- NO on "Build this jumper?" refunds the money but leaves the chosen parts in the global list, so
  the next build appends to it and the car keeps the first three parts.
- The `jumpbest` cheat skips `newLEvel`, so the level is 0 and the ramp never starts a jump.
- Easter eggs match the whole typed string since the last RETURN (case-insensitive), not a suffix.
- Money texts end in `.00.` on some screens; "Repairs will      cost" keeps its spaces.

## Residual differences and unknowns

- Text sub-pixel layout: glyph advances are fractional; line widths agree with the reference to
  1 px but individual glyphs can sit a pixel apart.
- Items 5 and 6 above are unverified until a real Shockwave player can be traced (the win11 VM with
  an archived Shockwave 12 is the next step).
- Cursor: built-in cursor 280 is mapped to the browser's pointer.
- The Classic/Modern toggle label on the splash is not part of the original movie.
