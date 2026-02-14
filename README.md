# Junkyard Jump

HTML5 rebuild of **Junkyard Jump**, a browser game from the Fox Kids website (circa 2000). Originally built in Macromedia Director 7, now playable again in any modern browser.

**[Play it here](https://bmdragos.github.io/junkyard-jump/)**

## About

Build a vehicle from junkyard scrap — pick a chassis (bathtub, shopping cart, toilet...), wheels, and an engine (hair blower, ceiling fan, popcorn popper...). Launch off a ramp to clear piles of junk. Manage your tachometer, earn prize money, upgrade your ride, and clear all 6 jumps to win.

- **Publisher**: Fox Kids / Fox Family Worldwide
- **Developer**: Jeff Leff
- **Original engine**: Macromedia Director 7.0, Shockwave `.dcr` plugin
- **This rebuild**: HTML5 Canvas, vanilla JavaScript, no dependencies

## How It Was Made

The original `.dcr` binary was decompiled using [ProjectorRays](https://github.com/ProjectorRays/ProjectorRays) and [LibreShockwave](https://github.com/Quackster/LibreShockwave), extracting 59 bitmaps, 10 sound effects, and 53 Lingo scripts. The game logic was reverse engineered from the decompiled Lingo and rebuilt as a single `game.js` file (~2000 lines).

Assets were extracted using [shockwave-extractor](https://github.com/bmdragos/shockwave-extractor), a toolkit built during this project for preserving Shockwave games.

See [FINDINGS.md](FINDINGS.md) for the full reverse engineering walkthrough — decompilation process, all 53 Lingo scripts analyzed, gauge calibration, jump physics, and what was changed from the original.

## Running Locally

Open `index.html` in a browser, or serve it:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Controls

- **Mouse**: Click buttons on splash/selection screens
- **Spacebar**: Accelerate during the driving phase
- **Arrow keys**: Not used (the original didn't use them either)

## Debug Mode

Press **D** during gameplay to toggle debug overlays showing collision bounds, speed/distance values, tach angle, and jump trajectory.

## Technical Details

- Native resolution: 425x290, CSS upscaled with `image-rendering: pixelated`
- Fixed 15fps timestep (faithful to the original Director movie tempo)
- All original assets — no re-drawn or AI-generated art
- Game logic faithfully ported from decompiled Lingo scripts

## License

MIT
