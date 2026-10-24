# Junkyard Jump

HTML5 rebuild of **Junkyard Jump**, a browser game from the Fox Kids website (circa 2000). Originally built in Macromedia Director 7, now playable again in any modern browser.

**[Play it here](https://bmdragos.github.io/junkyard-jump/)**

## About

Build a vehicle from junkyard scrap — pick a chassis (bathtub, shopping cart, toilet...), wheels, and an engine (hair blower, ceiling fan, popcorn popper...). Launch off a ramp to clear piles of junk. Manage your tachometer, earn prize money, upgrade your ride, and clear all 6 jumps to win.

- **Publisher**: Fox Kids / Fox Family Worldwide
- **Developer**: Jeff Leff
- **Original engine**: Macromedia Director 7.0, Shockwave `.dcr` plugin
- **This rebuild**: HTML5 Canvas, vanilla JavaScript, no dependencies

## Classic and Modern

The splash screen has a **[ CLASSIC ] / [ MODERN ]** toggle above START.

- **Classic** (default) is the original game: `classic.js` is a small Director 7 player that runs
  the original Score (every sprite, position, fade and sound cue, extracted from `junkyard.dir`)
  with all of the original Lingo ported line for line, quirks included. It was checked frame by
  frame against the original running in the [dirplayer-rs](https://github.com/igorlira/dirplayer-rs)
  Shockwave emulator. See [docs/fidelity.md](docs/fidelity.md).
- **Modern** (`game.js`) uses the same original screens but plays differently: one continuous run
  where the car climbs the tow truck's real ramp and flies over the piles onto the car carrier,
  HD rendering with 4x AI-upscaled art (Real-ESRGAN), 60 Hz motion, synthesized engine sound, a redline
  boost, RETRY/UPGRADE after a crash, and a GAS
  button on touch screens. See [docs/modern.md](docs/modern.md).

## How It Was Made

The original `.dcr` binary was decompiled using [ProjectorRays](https://github.com/ProjectorRays/ProjectorRays) and [LibreShockwave](https://github.com/Quackster/LibreShockwave), extracting the bitmaps, sounds and 53 Lingo scripts. The Score (every frame's sprites), the bitmaps by member number, the text members and the embedded font were then pulled straight out of `junkyard.dir` with the tools in `tools/`.

Assets were extracted using [shockwave-extractor](https://github.com/bmdragos/shockwave-extractor), a toolkit built during this project for preserving Shockwave games.

See [FINDINGS.md](FINDINGS.md) for the full reverse engineering walkthrough — decompilation process, all 53 Lingo scripts analyzed, gauge calibration, jump physics, and what was changed from the original.

## Running Locally

Serve the folder (both modes load JSON data, so opening `index.html` from disk won't work):

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Controls

- **Mouse**: Click buttons on splash/selection screens
- **Spacebar**: Accelerate during the driving phase (Modern also shows a GAS button on touch screens; Classic, like the original, needs a keyboard)
- **Arrow keys**: Not used (the original didn't use them either)

## Debug (Modern)

Type `debug` in Modern to toggle an overlay of the run's collision geometry (ramp plank, pile and
carrier outlines) and the car's state.

## Technical Details

- Native resolution: 425x290, CSS upscaled with `image-rendering: pixelated`
- Classic runs at the Score's 15 fps tempo; Modern simulates and draws its run at 60 Hz
- All original assets — no re-drawn or AI-generated art
- Classic's logic is the decompiled Lingo, ported line for line

## License

MIT
