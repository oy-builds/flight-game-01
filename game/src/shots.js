// Screenshot scenes behind ?shot=start|play|land|end. Each one stages the
// real game — the real flight model, the real renderer, the real HUD — at a
// fixed, deterministic pose, then freezes the simulation so the frame is
// exactly what a short game looks like at that moment.
import { freshAircraft } from './aircraft.js';
import { freshMission } from './missions.js';

/**
 * Stage the named scene on `game` ({ plane, mission, screen, cameraMode })
 * and return the screen to show. Any other name stages the title scene.
 */
export function stageShot(name, game) {
  if (name === 'play') {
    // Mid-flight: chasing the second ring over the island interior, the
    // runway and the village below, the gold ring dead ahead, instruments lit.
    game.plane = freshAircraft();
    game.plane.x = 380;
    game.plane.y = 175;
    game.plane.z = -330;
    game.plane.heading = 1.107;
    game.plane.pitch = 0.02;
    game.plane.bank = 0.12;
    game.plane.speed = 64;
    game.plane.throttle = 0.72;
    game.plane.onGround = false;
    game.plane.gearDown = false;
    game.plane.propAngle = 2.1;
    game.mission = freshMission('rings');
    game.mission.rings[0].flown = true;
    game.mission.nextRing = 1;
    game.mission.ringsFlown = 1;
    game.mission.score = 128;
    game.mission.timeLeft = 198;
    game.mission.fuel = 82;
    game.mission.message = '';
    game.mission.messageUntil = 0;
    game.screen = 'playing';
    game.cameraMode = 'chase';
    game.frozen = true;
    return 'playing';
  }
  if (name === 'land') {
    // Final approach: gear down, flaps out, runway 09 dead ahead, the
    // village and the lighthouse off the left wing.
    game.plane = freshAircraft();
    game.plane.x = -600;
    game.plane.y = 72;
    game.plane.z = 6;
    game.plane.heading = Math.PI / 2;
    game.plane.pitch = -0.06;
    game.plane.bank = 0.02;
    game.plane.speed = 42;
    game.plane.throttle = 0.34;
    game.plane.onGround = false;
    game.plane.gearDown = true;
    game.plane.flaps = true;
    game.plane.propAngle = 4.4;
    game.mission = freshMission('hop');
    game.mission.beaconArmed = true;
    game.mission.beaconDone = true;
    game.mission.score = 150;
    game.mission.timeLeft = 214;
    game.mission.fuel = 64;
    game.mission.message = 'Beacon rounded — land on runway 09';
    game.mission.messageUntil = 999999;
    game.screen = 'playing';
    game.cameraMode = 'chase';
    game.frozen = true;
    return 'playing';
  }
  if (name === 'end') {
    // Sortie complete: parked back on the runway, result panel up.
    game.plane = freshAircraft();
    game.plane.x = 120;
    game.plane.y = 25.6;
    game.plane.z = 0;
    game.plane.heading = Math.PI / 2;
    game.plane.speed = 0;
    game.plane.throttle = 0;
    game.plane.onGround = true;
    game.plane.propAngle = 0.8;
    game.mission = freshMission('rings');
    game.mission.status = 'done';
    game.mission.score = 1012;
    game.mission.timeLeft = 96;
    game.mission.fuel = 41;
    game.mission.rings.forEach((ring) => { ring.flown = true; });
    game.mission.nextRing = 8;
    game.mission.ringsFlown = 8;
    game.mission.result = 'Ring Run complete! 1012 points with 1:36 to spare. Press R to fly again.';
    game.screen = 'over';
    game.cameraMode = 'parked';
    game.frozen = true;
    return 'over';
  }
  // start (default): title screen, the Kestrel parked on runway 09 at
  // golden hour light, the island behind it.
  game.plane = freshAircraft();
  game.plane.propAngle = 0.4;
  game.mission = freshMission('rings');
  game.screen = 'title';
  game.cameraMode = 'parked';
  game.frozen = true;
  return 'title';
}
