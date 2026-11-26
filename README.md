[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/oy-builds/flight-game-01/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/oy-builds/flight-game-01/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

# Ridge Runner — Tern Island Courier

An original 3D flight game that runs offline in a desktop browser from static
files. Fly the Kestrel K-2 courier prop plane over Tern Island — a procedural
island with beaches, a mountain spine, a crater lake, a village and a
lighthouse — from the chase view, with lit instruments on the HUD.

## How to play

Serve `game/` with any static server (`node serve.ts`, then open
http://localhost:8080) and fly. No network, no install, no build step.

Pick a sortie on the title screen:

- **Ring Run** — thread all 8 gold rings around the island before the clock
  runs out. Each ring pays points and fuel.
- **Island Hop** — take off from Tern Field runway 09, round the lighthouse
  beacon, and land back on the runway.
- **Free Flight** — no clock, no course. Learn the island and practise
  landings.

## Controls

| Key | Action |
| --- | --- |
| W / S or Shift / Ctrl | Throttle up / down |
| Arrow Up / Down | Nose up / nose down |
| Arrow Left / Right | Bank left / right — bank turns the plane |
| Mouse | Steer gently by moving the pointer |
| G | Landing gear up / down |
| F | Flaps — slower, steadier landings |
| Space | Airbrake |
| R | Restart the sortie |
| P | Pause |
| M | Mute |
| H | Help |

Watch the fuel gauge and the stall warning: below about 55 knots the wing
stops lifting, so nose down and throttle up. A good landing is gear down,
slow, wings level, on the runway, with a gentle descent.

## How it is built

Raw WebGL (no engine or library vendored), ES modules split by job:
`config.js` tuning, `noise.js` deterministic terrain noise, `terrain.js` the
island and airfield, `aircraft.js` the flight model and the Kestrel mesh,
`render.js` the renderer, `missions.js` the sorties and scoring, `hud.js`
the instruments, `audio.js` synthesised WebAudio sound, `input.js` keyboard
and mouse, `shots.js` the screenshot scenes, `main.js` the loop.

Screenshots in `screenshots/` are real renders of this game's own code,
staged with `?shot=start|play|land|end`.

## License

MIT — see `LICENSE`.
