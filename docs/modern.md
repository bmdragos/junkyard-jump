# Modern mode

Modern (`game.js`) keeps the original's look and changes how it plays. Classic (`classic.js`)
is the original, unchanged; see [fidelity.md](fidelity.md).

## What it looks like: the original's screens

Every screen except the run is drawn from the original Score (`assets/classic/score.json`)
with the original art (`assets/classic/bitmaps/`), text members and the embedded Kids font
(`kids-font.js`): the splash and help screens, the conveyor with Willy and the terminal, the crane
pickup (frames 45–102, played at double speed), the parked parts at the end of the belt, the fryer
assembly and "Prepare to Jump!!!" (120–169), the result dialogs (307–331) and the win screen (356).
Modern only overrides what changes: texts, the part on the belt, button labels.

## HD rendering

Modern draws at the display's resolution, up to 4x the original 425x290, with image smoothing on,
so scaling, rotation, the vector gauges and the Kids font are all anti-aliased. The art is
upscaled 4x (`assets/modern/hd/<member>.webp`, 1.8 MB) with Real-ESRGAN's cartoon model
(`RealESRGAN_x4plus_anime_6B`), which kept outlines clean and dropped the 16-bit dithering better
than the general `x4plus` model in a side-by-side. Transparency follows the original ink: white
is keyed out at 1x, edge colours are bled into the keyed area so no white fringe gets upscaled,
and the mask itself is upscaled for soft alpha edges. The copy-ink backgrounds stay opaque.
Regenerate with `tools/upscale/run_on_spark.sh` (runs `tools/upscale/upscale.py` on the DGX
Spark in an NGC PyTorch container, nothing pip-installed). If an HD file is missing, Modern falls
back to the original bitmap. Classic is untouched: 1x, pixelated, as the original.

## The run: one continuous scene

Start line, lights, runup, ramp, flight and landing are one scene (`modern-jump.js` simulates it,
`game.js` draws it). There is no cut to a separate jump screen.

- **The ramp is the tow truck's plank** (`trucklt`, member 62). Its upper edge, measured from the
  bitmap, runs from 6 px above the ground at its left end to the top end 65 px up, 118 px further
  right: a 26.6° slope (`tools/make_modern_geometry.py` → `assets/modern/jump-geometry.json`).
  The car drives up it with both wheels on the plank and leaves when its front wheel rolls off the
  top, keeping the plank's direction: launch velocity (speed, speed × 0.5 upward).
- **Flight** is ballistic (gravity 1.7 px/frame²). The car's nose follows its flight path.
- **Trash piles** (member 54) use their bitmap outline: the run ends in a crash if a wheel or a
  point of the body enters one.
- **The car carrier** (member 63) is the landing: its top edge per pixel column is the deck. Wheels
  coming down onto it land; the car then brakes to a stop mid-deck. Hitting its side crashes;
  overshooting it onto the ground is a missed landing.
- **The camera** keeps the car at a fixed x like the original and rises to follow it when it climbs
  high. The sky and city sink at 0.8 of the camera's rise, the fence and ground at full rate, and
  the sky extends upward into a deeper red.
- **The small car** is laid out from the big assembled car: `assembleCar`'s per-chassis offsets,
  converted to part centres and scaled by the small/big chassis ratio. (The original simply
  swapped members on fixed sprites, so its small car is only right for the wagon.)
- The HUD follows the original: gauges at the Score's top-left positions (vector-drawn), sliding in
  with the traffic light; blue "Distance to Jump" and "Performance Rating" texts.

### Difficulty

The layout per level keeps the original's pile counts (3, 6, 10, 13, 17, 21) and spacing (83 px).
`tools/modern_sweep.js` runs the simulation for every launch speed; with the best car the safe
windows are:

| Level (piles) | 1 (3) | 2 (6) | 3 (10) | 4 (13) | 5 (17) | 6 (21) |
|---|---|---|---|---|---|---|
| Safe launch speed | 29–37 | 35–42 | 42–49 | 47–53 | 53–58 | 57–63 |

Too slow hits the piles, too fast overshoots the carrier. (Classic's windows, for comparison:
23–33 up to 64–72.) Tune with `node tools/modern_sweep.js [chassis wheels engine] GRAVITY=1.7
PILE_GAP=150 CARRIER_GAP=40`.

## Engine sound

`engine-audio.js` synthesizes one sound per engine part: the hair blower is wind with a motor
whine, the air conditioner a square-wave compressor drone, the coffee maker bubbling over a mains
hum with steam at the top, the ceiling fan a hum with blade whoosh, the popcorn popper pops over a
buzzing element.

- **Revs follow the tach** (idle 27 to full boost 270 maps to 0..1), so the redline scream starts
  as the needle nears the red zone on every car. (It used to follow mph against a fixed 100, so a
  cheap car pinned at its redline only reached 40% and never screamed.)
- **Throttle:** on the gas the engine is about 5 dB louder, brighter and harsher; coasting, it goes
  dull.
- **No audible loops:** bubbles and pops are generated a two-second chunk at a time, denser at
  higher revs, and each noise source loops its own random 5-8 s buffer. (Everything used to loop the
  same two seconds.)
- **Audible range:** the coffee maker's hum and the air conditioner's drone were moved up out of the
  subsonic range small speakers can't play; a 35 Hz high-pass trims what's left.
- **Matched loudness:** `tools/engine_loudness.js` renders each engine offline and measures it
  K-weighted (as LUFS); the volumes put all five within 0.2 dB. The air conditioner had been about
  11 dB louder than the rest.
- **Blown engine:** the pitch sags, the engine misfires and backfires, and dies in about 1.5 s.

## How it plays differently from the original

| | Original (Classic) | Modern |
|---|---|---|
| Jump | Cut to a jump frame; fixed upward speed 15, car stays at x 76 | Continuous run up the real ramp; launch height and speed follow your speed |
| Motion | 15 fps | 60 Hz simulation and drawing (menus keep 15 fps) |
| Picture | 425x290, pixelated | Display resolution (up to 4x), anti-aliased, 4x upscaled art |
| Engine | `sewing` loop, tach at a fixed rise per frame | Synthesized per-engine sound (below); tach tracks speed / rating, with a 5% redline boost that can blow the engine |
| Lights | Gas works during the lights | Gas from green |
| Crash, blown engine | REPAIR only | RETRY or UPGRADE (after paying the repair) |
| Missed landing | REPAIR, counts as the jump made | NEXT JUMP or UPGRADE after the repair; prize paid, as in the original |
| Prize money | Added up to three times on UPGRADE | Paid once, on landing |
| "Build this jumper?" NO | Refunds but keeps the old parts | Refunds and starts over |
| Upgrade screen | Three part buttons; NEXT JUMP only when you can't afford one | Three part buttons and NEXT JUMP |
| Touch | — | GAS button on touch screens |
| Easter eggs | Whole typed string since RETURN | Typed suffix; `jumpbest` works; `debug` shows the collision geometry |

## Files

| File | Role |
|---|---|
| `game.js` | Modern states, Score-frame drawing, the run scene and HUD |
| `modern-jump.js` | The run simulation (no DOM; runs in Node for the sweep) |
| `modern-gauges.js` | Vector tachometer and speedometer |
| `engine-audio.js`, `tools/engine_loudness.js` | Synthesized engine sound per engine part; loudness matching |
| `kids-font.js` | The original Kids font, shared with Classic |
| `assets/modern/hd/`, `tools/upscale/` | 4x art and the Real-ESRGAN pipeline that makes it |
| `tools/make_modern_geometry.py` | Ramp, carrier and pile geometry from the bitmaps |
| `tools/modern_sweep.js`, `tools/modern_autoplay.js` | Difficulty sweep; UI autoplay in the browser |
