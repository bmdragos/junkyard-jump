# Junkyard Jump — Reverse Engineering & HTML5 Rebuild

> **2026-10 update.** The game now has two modes. **Classic** (`classic.js`, the default) plays the
> original Score extracted from `junkyard.dir` with every Lingo script ported line for line; it was
> checked frame by frame against the original running in dirplayer-rs — see
> [docs/fidelity.md](docs/fidelity.md). **Modern** (`game.js`) draws every screen from that same
> Score and replaces the jump with one continuous run up a real ramp — see
> [docs/modern.md](docs/modern.md). The first hand-built rebuild this file used to describe is gone
> (it is in git history); its claims that the Score was not extractable and that the jump was a
> canned animation were wrong.

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
| `jumpbest` | Equips chair + knobby tires + blower and goes to the start line; it skips `newLEvel`, so the level stays 0 and the ramp never starts a jump |
| `win` | Goes straight to win screen |
| `new` | Resets game |
| `money` | Sets money to $100 |

## Asset Extraction

### Bitmaps

All 61 bitmaps are decoded by member number from `junkyard.dir` (`tools/extract_bitmaps.py` →
`assets/classic/bitmaps/`, with registration points in `bitmaps.json`). The first extraction named
files by member name and lost the duplicates: there are two `background`s (the conveyor scene and
the driving sky) and two `dog`s (the big conveyor dog and the small one in the car).

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

## Deployment

The game is deployed via GitHub Pages at the repository root. A GitHub Actions workflow (`.github/workflows/pages.yml`) triggers on push to `main`, uploading the entire directory as a pages artifact.

No build step required — the game runs directly from `index.html`, the scripts it loads and `assets/`.
