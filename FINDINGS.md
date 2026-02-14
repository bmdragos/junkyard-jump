# Junkyard Jump — Reverse Engineering & HTML5 Rebuild

## The Original Game

**Junkyard Jump** was a browser game on the Fox Kids website, circa 2000. Players build a vehicle from scrap junkyard parts — a chassis (bathtub, shopping cart, toilet...), wheels, and an engine (hair blower, ceiling fan, popcorn popper...) — then launch it off a ramp to clear increasingly tall piles of junk. Manage your tachometer, earn prize money, upgrade your ride, and clear all 6 jumps to win.

- **Publisher**: Fox Kids / Fox Family Worldwide
- **Developer**: Jeff Leff (loader by Davey Butterworth)
- **Engine**: Macromedia Director 7.0 (main game), Director 8.0 (loader)
- **Format**: Shockwave `.dcr` plugin content
- **Resolution**: 425×290 pixels at ~15fps

The game survived online only through [OneWeakness.com](https://oneweakness.com/junkyard-jump) (DigiEggz, published Sept 2011). It is not in the Flashpoint Archive or Internet Archive. With Shockwave long dead, the game was unplayable on modern browsers.

## Decompilation

### Tools

[LibreShockwave](https://github.com/nickthedude/LibreShockwave) was used to decompile the `.dcr` files into `.dir` project files, which could then be parsed to extract:

- **Cast members** (sprites, bitmaps, sounds, text)
- **Lingo scripts** (both `.ls` source and `.lasm` bytecode)
- **Score/timeline data** (sprite positions, frame labels, transitions)

### Original File Structure

| File | Size | Director Ver | Purpose |
|------|------|-------------|---------|
| `junkyard.dcr` | 994 KB | 7.0 | Main game |
| `breakout.dcr` | 26 KB | 7.0 | Breakout mini-game (plays while main game downloads) |
| `gamesloader.dcr` | 33 KB | 8.0 | Progress bar loader |
| `gamesloader.dat` | 26 bytes | — | Config: `JUNKYARD JUMP\rbreakout.dcr` |

### Extracted Lingo Scripts (53 total)

Key behavior scripts by function:

| Script | Name | Role |
|--------|------|------|
| 103 | Main movie script | `newGame()`, `newLevel()`, `assembleCar()`, easter eggs |
| 104 | Conveyor script | Belt/wheel animation, `speed=15` |
| 105 | Item script | Part display, cost calculation, availability by tier |
| 106 | Item select script | Click handling for conveyor items |
| 109 | Assembly script | Car assembly animation sequence |
| 113 | Chassis select script | Chassis cycling on conveyor |
| 114 | Dog script | Hand-waving animation: `["hand1","hand2","hand3","hand2","hand3","hand2"]` |
| **128** | **Offscreen script** | **Main game controller** — acceleration, deceleration, distance, state machine |
| **129** | **Tach needle script** | **Tachometer** — rise/fall logic, blown engine countdown |
| **130** | **Speedometer script** | **Speedometer** — direct speed×3 mapping |
| **135** | **Jump script** | **Jump physics** — gravity, vertical speed, collision detection |
| 140 | Crash script | Crash state handling |
| 144 | Blown engine script | Engine blow UI, repair cost check |
| 145 | Safe script | Safe landing, prize money award |
| 147 | Repair script | Repair cost deduction |

### Critical Constants from Lingo

```lingo
-- Script 128 (offscreen/game controller)
acceleration = 1
deceleration = 0.5
distanceCounter = 5000
maxSpeed = combinedRating    -- sum of chassis + wheels + engine ratings

-- Script 135 (jump physics)
gravity = 0.69999999999999996  -- IEEE 754 artifact, effectively 0.7
Vspeed = 15

-- Script 129 (tachometer)
startAngle = sprite.rotation + 50   -- base = authoring tool rotation + 50
endAngle = 320                       -- max sweep before capping
maxblownCounter = 17                 -- frames at redline before engine blows
adjustedSpeed = integer(speed / 3)   -- tach rise rate per frame

-- Script 130 (speedometer)
startAngle = sprite.rotation + 20   -- base = authoring tool rotation + 20
speed = newValue * 3                 -- direct proportional mapping
endAngle = 360

-- Script 103 (movie script)
guserMoney = 35                      -- starting money
grepairCost = random(3) + 3         -- range 4-6
gprizeMoney = random(5) + 12        -- range 13-17
```

### Easter Eggs (from Script 103)

The original game had keyboard easter eggs typed during gameplay:

| Code | Effect |
|------|--------|
| `jumpbest` | Equips best car (chair + wheel2 + blower), jumps immediately |
| `win` | Goes straight to win screen |
| `new` | Resets game |
| `money` | Sets money to $100 |

## Asset Extraction

### Bitmaps (59 PNGs)

Extracted from cast members using LibreShockwave's bitmap decoder:

- **Chassis** (6 + 6 small): bathtub, cart, chair, toilet, washer, wagon
- **Wheels** (4 + 4 small): wheel1-4
- **Engines** (5 + 5 small): blower, airconditioner, coffee, fan, popcorn
- **Backgrounds**: splashpage, background, winscreen, city, fence, ground
- **UI**: textframe, button, terminal, speedometer, tachometer, needle
- **Props**: bigtruck, trucklt, trashpile, crashscene, crane1, crane2, fryer, converyortop, converyorwheel
- **Traffic light**: light, lights1, lights2, lights3
- **Animated**: dog, hand1, hand2, hand3

### Sounds (10 WAVs)

| File | Used For |
|------|----------|
| assembly.wav | Car assembly sequence |
| bluesharp.wav | Splash screen music |
| crane.wav | Crane pickup animation |
| crash.wav | Pile collision |
| crowd.wav | Safe landing cheering |
| fryer.wav | Deep fryer assembly step |
| hotrod.wav | Driving/acceleration |
| meltdown.wav | Blown engine |
| ramp.wav | Launch off ramp |
| sewing.wav | Sewing machine assembly step |

### Sound Fixing (fix_sounds.py)

LibreShockwave has a bug in its `SoundChunk` decoder: it hardcodes `bitsPerSample=16` in the WAV header even when the actual audio data is **8-bit unsigned PCM**. The result is garbled, ear-splitting noise.

The fix script (`fix_sounds.py`) detects affected files by checking byte distribution (8-bit unsigned audio centers around byte value 128), then converts each byte to proper 16-bit signed PCM:

```python
sample_16 = (byte - 128) * 256  # 8-bit unsigned → 16-bit signed
```

All 10 sound files required this fix.

## HTML5 Rebuild

### Architecture

The rebuild targets **vanilla HTML5 Canvas + JavaScript** — no frameworks, no build tools, no dependencies. The entire game lives in a single `game.js` file (~2000 lines) plus `index.html`.

- **Resolution**: Native 425×290, CSS upscaled with `image-rendering: pixelated`
- **Frame rate**: Fixed 15fps timestep (`setInterval` at 66.7ms), matching the original Director frame rate
- **State machine**: `stateEnter`, `stateUpdate`, `stateRender` dispatch tables keyed by state name
- **Input**: Spacebar for acceleration, mouse/touch for UI. Canvas coordinates mapped from CSS-scaled display size

### Part Ratings and Costs

All ratings match the original Lingo exactly. Costs use a two-tier system — tier 0 (jumps 1-2) has only cheap parts available, tier 1 (jumps 3+) unlocks expensive parts:

```
Chassis:  Toilet(18/$8)  Wagon(20/$10)  Cart(22/$13)  Washer(30/$17)  Bathtub(35/$21)  Chair(40/$25)
Wheels:   GoCart(9/$3)   Bicycle(12/$5)  WhiteWall(15/$10)  Knobby(20/$15)
Engines:  Coffee(12/$7)  Popcorn(13/$9)  Blower(17/$12)  AC(18/$15)  Fan(20/$19)
```

Best possible car: Chair(40) + Knobby(20) + Fan(20) = **maxSpeed 80**
Worst possible car: Toilet(18) + GoCart(9) + Coffee(12) = **maxSpeed 39**

### Gauge Calibration

The original Director sprites had pre-set rotations in the authoring tool's Score timeline. These rotations are not stored in the Lingo scripts — only the *offsets* from those base rotations appear in code (`sprite.rotation + 50`, `sprite.rotation + 20`). Recovering the correct base angles required manual calibration against reference screenshots.

**Speedometer** (Script 130):
- Base angle: **270°** (needle rests at 6 o'clock = 0 mph)
- Clockwise rotation: 0 at 6 o'clock → 100 at 4 o'clock
- Formula: `angleDeg = speed * 3 + 270`

**Tachometer** (Script 129):
- Base angle: **330°** (needle rests at 8 o'clock = idle)
- Clockwise rotation, red zone at 5-7 o'clock
- Max sweep: 270° (blown engine threshold)
- Rise: `Math.round(speed / 3)` degrees/frame when accelerating or holding speed
- Fall: 15 degrees/frame when decelerating
- Engine blows after 17 consecutive frames at max (270°)

**Needle rendering**: The needle bitmap points UP; rotation is applied as `ctx.rotate((angleDeg - 90) * PI/180)`. The original needle bitmap was corrupted during extraction, so we draw the needle procedurally — a red tapered pointer with a black hub.

### Jump Physics

The original game used a **canned animation** — Director frame labels `jump1` through `jump6` with pre-placed sprites. There was no real-time physics; the car followed a predefined path and Director's `sprite intersects sprite` checked collisions against pre-positioned obstacle sprites.

Our rebuild uses **real-time parabolic physics**:

```javascript
// Going up: decelerate
vSpeed -= gravity;       // 0.7 per frame
carY -= vSpeed;

// Phase transition: when vSpeed hits 0, switch to falling same frame
// (matches original Lingo behavior in Script 135)

// Going down: accelerate
vSpeed += gravity;
carY += vSpeed;

// Horizontal: constant speed throughout arc
carX += speed * 0.215;   // tuned to match difficulty curve
```

The `0.215` horizontal multiplier was tuned so that:
- A sloppy run (speed ~50) cannot clear the final 6-pile jump
- A good run (speed ~65) clears comfortably
- The final jump requires genuine tach management skill with the best car

### Collision Detection

Pile bounds: `{ x: 130 + i*65, y: groundY-75, w: 60, h: 70 }` per pile.
Car bounds: `{ x: carX-30, y: carY-25, w: 60, h: 40 }`.

A 5-frame grace period after launch prevents false collisions — at high speeds (60+), the car reaches the first pile horizontally before gaining enough altitude to visually clear it. By frame 6, the car has risen above the pile collision zone at any speed.

### Driving Mechanics

The ramp trigger is checked **before** the blown engine check. If you reach the ramp on the same frame your engine would blow (maxedFrames hits 17), you get the jump — rewarding clutch play instead of punishing it.

Tach asymmetry at high speed is faithful to the original: at speed 80, the tach rises 27°/frame but only falls 15°/frame. This creates the core skill mechanic — players must pulse the throttle, maintaining speed while managing the tach needle.

## Differences from Original

### Intentional Improvements

| Change | Original | Rebuild | Rationale |
|--------|----------|---------|-----------|
| Crash recovery | Auto-retry, no upgrade option | RETRY + UPGRADE buttons | Original trapped players in unwinnable crash loops |
| Ramp vs blown engine | Blown engine checked first | Ramp checked first | Reaching ramp on the wire should reward, not punish |
| Tach idle jitter | Static needle at rest | Subtle random wobble (±3°) | Feels more like a real engine |
| Win transition | Goes through safe landing screen | Skips straight to win screen | Cleaner UX after final jump |
| Needle bitmap | Pre-rendered bitmap | Canvas-drawn (red pointer + black hub) | Original bitmap was corrupted in extraction |

### Faithful to Original

- All part ratings and costs
- Acceleration (1/frame), deceleration (0.5/frame), distance (5000)
- Tachometer rise/fall rates and blown engine threshold (17 frames)
- Starting money ($35), prize money range ($13-17), repair cost range ($4-6 on newLevel, $6-10 on crash)
- Two-tier part availability (cheap parts in jumps 1-2, full catalog in 3+)
- Conveyor belt sorting (available cheapest-first, then unavailable)
- Easter egg input system (`input.keys.endsWith()`)

### Necessary Differences

| Area | Original | Rebuild | Reason |
|------|----------|---------|--------|
| Jump physics | Canned Director animation | Real-time parabolic arc | No Director timeline to replay |
| Horizontal speed | Pre-positioned sprites | `speed * 0.215` | Had to be tuned from scratch |
| Sprite positions | Director Score (authoring tool) | Manually calibrated offsets | Score data not fully extractable |
| Gauge base angles | Baked into sprite rotation | Calibrated: speedo=270°, tach=330° | Not stored in scripts |
| Part assembly offsets | Hardcoded in Lingo | Retuned via debug mode | Different sprite registration points |

## Known Gaps

Areas where the rebuild diverges from or falls short of the original:

1. **Sound mixing** — No volume balancing between effects, no engine pitch shifting with speed
2. **Driving visuals** — Fewer parallax layers than original; city/fence/ground only
3. **State transitions** — No wipe/fade animations between screens
4. **Dog reactions** — Dog has hand-wave animation frames (`hand1-3`) but doesn't react to speed, crashes, or wins. Original cycled through `["hand1","hand2","hand3","hand2","hand3","hand2"]` triggered by a `moveDog` message
5. **Assembly animation** — Original had a multi-step crane/fryer sequence with timed sound effects; rebuild skips directly to result
6. **Conveyor wheel rotation** — Original animated the conveyor wheels in sync with belt movement

## Debug Mode

Typing `debug` on the splash screen enters a built-in sprite and level designer with four tabs:

- **PARTS** — Cycle through chassis/wheels/engines, drag handles to position wheels and engine on each chassis
- **GAUGES** — Live speedometer/tachometer preview with sweep sliders and draggable pivot handles
- **JUMP** — Scaled side view of jump scene with computed parabolic arc, adjustable gravity/vSpeed/groundY/pile layout, real-time simulation
- **CONSTS** — Stepper controls for acceleration, deceleration, distance, blown engine frames, starting money

All tabs have an EXPORT button that dumps tuned values to the console as copy-pasteable JavaScript and copies to clipboard.

## Deployment

The game is deployed via GitHub Pages at the repository root. A GitHub Actions workflow (`.github/workflows/pages.yml`) triggers on push to `main`, uploading the entire directory as a pages artifact.

No build step required — the game runs directly from `index.html` + `game.js` + `assets/`.
