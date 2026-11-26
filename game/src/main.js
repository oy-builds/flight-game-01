// Ridge Runner — boot, screens, the fixed-step loop and the wiring between
// input, flight model, missions, renderer, HUD and sound.
import { GAME_NAME, GAME_SUBTITLE, MISSIONS } from './config.js';
import { SoundEngine } from './audio.js';
import { freshAircraft, stepFlight } from './aircraft.js';
import { updateHud } from './hud.js';
import { createInput } from './input.js';
import { freshMission, stepMission } from './missions.js';
import { Renderer } from './render.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game-canvas');
const renderer = new Renderer(canvas);
const input = createInput(canvas);
const sound = new SoundEngine();

// The one game object the screenshot stager poses.
const game = {
  plane: freshAircraft(),
  mission: freshMission('rings'),
  screen: 'title', // title | playing | paused | over
  cameraMode: 'parked',
  frozen: false,
  missionId: 'rings',
  time: 0,
};

// --- HUD element handles ---
const el = {
  airspeed: document.getElementById('hud-airspeed'),
  altitude: document.getElementById('hud-alt'),
  vspeed: document.getElementById('hud-vspeed'),
  heading: document.getElementById('hud-heading'),
  compass: document.getElementById('hud-compass'),
  attitude: document.getElementById('hud-attitude'),
  throttleFill: document.getElementById('hud-throttle-fill'),
  fuelFill: document.getElementById('hud-fuel-fill'),
  fuelText: document.getElementById('hud-fuel-text'),
  gear: document.getElementById('hud-gear'),
  flaps: document.getElementById('hud-flaps'),
  score: document.getElementById('hud-score'),
  timer: document.getElementById('hud-timer'),
  objective: document.getElementById('hud-objective'),
  ringDist: document.getElementById('hud-ring-dist'),
  warn: document.getElementById('hud-warn'),
  message: document.getElementById('hud-message'),
  hud: document.getElementById('hud'),
  title: document.getElementById('screen-title'),
  over: document.getElementById('screen-over'),
  overTitle: document.getElementById('over-title'),
  overText: document.getElementById('over-text'),
  help: document.getElementById('screen-help'),
  missionName: document.getElementById('hud-mission-name'),
};

function showScreen(name) {
  game.screen = name;
  el.title.style.display = name === 'title' ? 'flex' : 'none';
  el.over.style.display = name === 'over' ? 'flex' : 'none';
  el.hud.style.display = name === 'playing' || name === 'paused' ? 'block' : 'none';
  el.help.style.display = name === 'help' ? 'flex' : 'none';
  if (name === 'title') game.cameraMode = 'parked';
  if (name === 'playing') game.cameraMode = 'chase';
}

function startMission(missionId) {
  game.missionId = missionId;
  game.mission = freshMission(missionId);
  game.plane = freshAircraft();
  game.frozen = false;
  el.missionName.textContent = game.mission.name.toUpperCase();
  showScreen('playing');
  sound.ensure();
}

function endSortie() {
  el.overTitle.textContent =
    game.mission.status === 'done' ? 'SORTIE COMPLETE' : game.mission.status === 'crashed' ? 'CRASHED' : 'SORTIE OVER';
  el.overText.textContent = game.mission.result;
  showScreen('over');
}

function handleActions() {
  for (const action of input.takeActions()) {
    sound.ensure();
    if (action === 'confirm' && game.screen === 'title') {
      startMission(game.missionId);
    } else if (action === 'confirm' && game.screen === 'over') {
      startMission(game.missionId);
    } else if (action === 'restart' && (game.screen === 'playing' || game.screen === 'over' || game.screen === 'paused')) {
      startMission(game.missionId);
    } else if (action === 'pause' && game.screen === 'playing') {
      showScreen('paused');
    } else if (action === 'pause' && game.screen === 'paused') {
      showScreen('playing');
    } else if (action === 'mute') {
      sound.setMuted(!sound.muted);
    } else if (action === 'help') {
      if (game.screen === 'help') showScreen(game.mission ? 'playing' : 'title');
      else if (game.screen === 'playing') showScreen('help');
      else if (game.screen === 'title') showScreen('help');
    } else if (action === 'gear' && game.screen === 'playing') {
      game.plane.gearDown = !game.plane.gearDown;
    } else if (action === 'flaps' && game.screen === 'playing') {
      game.plane.flaps = !game.plane.flaps;
    } else if (action === 'mission-rings' || action === 'mission-hop' || action === 'mission-free') {
      const id = action.replace('mission-', '');
      game.missionId = id;
      document.querySelectorAll('.mission-card').forEach((card) => {
        card.classList.toggle('selected', card.dataset.mission === id);
      });
      if (game.screen === 'title') {
        game.mission = freshMission(id);
      }
    }
  }
}

// --- title screen: mission cards ---
document.querySelectorAll('.mission-card').forEach((card) => {
  card.addEventListener('click', () => {
    sound.ensure();
    startMission(card.dataset.mission);
  });
});
document.getElementById('btn-fly').addEventListener('click', () => startMission(game.missionId));
document.getElementById('btn-again').addEventListener('click', () => startMission(game.missionId));
document.getElementById('btn-title').addEventListener('click', () => {
  game.mission = freshMission(game.missionId);
  game.plane = freshAircraft();
  game.frozen = false;
  showScreen('title');
});
document.getElementById('btn-help').addEventListener('click', () => showScreen('help'));
document.getElementById('btn-help-close').addEventListener('click', () => showScreen('title'));
document.getElementById('btn-mute').addEventListener('click', () => {
  sound.ensure();
  sound.setMuted(!sound.muted);
  document.getElementById('btn-mute').textContent = sound.muted ? 'SOUND: OFF' : 'SOUND: ON';
});

// --- screenshot staging (?shot=start|play|land|end) ---
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) {
  stageShot(shot, game);
  el.missionName.textContent = game.mission.name.toUpperCase();
  showScreen(game.screen);
  if (game.screen === 'over') {
    el.overTitle.textContent = 'SORTIE COMPLETE';
    el.overText.textContent = game.mission.result;
  }
  window.RIDGE = { game, startMission };
} else {
  window.RIDGE = { game, startMission };
  showScreen('title');
}

// --- main loop: fixed 1/60 s steps, render every frame ---
let last = performance.now();
let accumulator = 0;
const STEP = 1 / 60;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.time += dt;
  handleActions();

  if (game.screen === 'playing' && !game.frozen) {
    accumulator += dt;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      const ctl = input.poll();
      const event = stepFlight(game.plane, ctl, STEP);
      const missionEvent = stepMission(game.mission, game.plane, event, STEP, game.time);
      if (missionEvent === 'ring') sound.ringChime();
      if (missionEvent === 'landed') sound.thud();
      if (event === 'crash' || event === 'ditched') sound.crashSound();
      if (game.mission.status !== 'flying') {
        endSortie();
        break;
      }
    }
    sound.update(game.plane.throttle, game.plane.speed, !game.plane.onGround);
    updateHud(el, game.plane, game.mission, game.time);
  } else if (game.screen === 'playing' && game.frozen) {
    // Frozen screenshot scene: render the staged pose, HUD live.
    updateHud(el, game.plane, game.mission, game.time);
  }

  renderer.render(game.plane, game.mission, { mode: game.cameraMode }, game.time);
}

document.title = `${GAME_NAME} — ${GAME_SUBTITLE}`;
requestAnimationFrame(frame);
