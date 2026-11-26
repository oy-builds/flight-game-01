// Missions: Ring Run, Island Hop and Free Flight. A mission owns the score,
// the clock, the fuel the sortie has left and the objective line the HUD
// shows; the flight model stays in aircraft.js and knows nothing about it.
import { BEACON, freshRings } from './terrain.js';
import { FUEL, MISSIONS, SCORE } from './config.js';

/** Fresh mission state for mission id `missionId`. */
export function freshMission(missionId) {
  const def = MISSIONS.find((m) => m.id === missionId) || MISSIONS[2];
  return {
    id: def.id,
    name: def.name,
    blurb: def.blurb,
    timeLimit: def.timeLimit,
    timeLeft: def.timeLimit,
    rings: freshRings(),
    nextRing: 0,
    beaconDone: false,
    beaconArmed: false, // hop: beacon counts only after takeoff
    score: 0,
    fuel: FUEL.capacity,
    status: 'flying', // flying | done | crashed | out-of-fuel | timed-out
    result: '',
    message: '',
    messageUntil: 0,
    ringsFlown: 0,
    landedQuality: '',
  };
}

function showMessage(mission, text, now, seconds) {
  mission.message = text;
  mission.messageUntil = now + (seconds || 3);
}

/** Distance from the plane to the next ring centre (metres). */
export function nextRingDistance(plane, mission) {
  if (!mission.rings || mission.nextRing >= mission.rings.length) return 0;
  const ring = mission.rings[mission.nextRing];
  return Math.hypot(plane.x - ring.x, plane.y - ring.y, plane.z - ring.z);
}

/**
 * Step the mission by dt seconds. `plane` is the aircraft state, `event` is
 * the flight event from stepFlight ('' | 'takeoff' | 'landed-perfect' |
 * 'landed-rough' | 'crash' | 'ditched'), `now` is the mission clock.
 */
export function stepMission(mission, plane, event, dt, now) {
  if (mission.status !== 'flying') return;

  // Clock.
  if (mission.timeLimit > 0) {
    mission.timeLeft -= dt;
    if (mission.timeLeft <= 0) {
      mission.timeLeft = 0;
      mission.status = 'timed-out';
      mission.result = `Time up — ${mission.score} points. Press R to fly again.`;
      return;
    }
  }

  // Fuel burns with throttle; empty tanks end the sortie.
  const burn = FUEL.burnIdle + plane.throttle * (FUEL.burnPerSecond - FUEL.burnIdle);
  mission.fuel -= burn * dt;
  if (mission.fuel <= 0) {
    mission.fuel = 0;
    mission.status = 'out-of-fuel';
    mission.result = `Out of fuel — ${mission.score} points. Press R to fly again.`;
    return;
  }

  // Crash / ditching ends the sortie.
  if (event === 'crash' || event === 'ditched') {
    mission.status = 'crashed';
    mission.result =
      event === 'ditched'
        ? `Ditched in the sea — ${mission.score} points. Press R to fly again.`
        : `Crashed — ${mission.score} points. Press R to fly again.`;
    return;
  }

  // Takeoff arms the hop beacon.
  if (event === 'takeoff' && mission.id === 'hop') {
    mission.beaconArmed = true;
    showMessage(mission, 'Airborne! Round the lighthouse beacon, then land on runway 09.', now, 4);
  }

  // Ring Run: fly through the next ring.
  if (mission.id === 'rings' && mission.nextRing < mission.rings.length) {
    const ring = mission.rings[mission.nextRing];
    const d = Math.hypot(plane.x - ring.x, plane.y - ring.y, plane.z - ring.z);
    if (d < ring.r) {
      ring.flown = true;
      mission.nextRing += 1;
      mission.ringsFlown += 1;
      const bonus = SCORE.ring + Math.round((mission.timeLeft / mission.timeLimit) * SCORE.ringTimeBonus);
      mission.score += bonus;
      mission.fuel = Math.min(FUEL.capacity, mission.fuel + FUEL.ringBonus);
      if (mission.nextRing >= mission.rings.length) {
        mission.status = 'done';
        mission.result = `Ring Run complete! ${mission.score} points with ${Math.round(mission.timeLeft)}s to spare. Press R to fly again.`;
      } else {
        showMessage(mission, `Ring ${mission.ringsFlown} of 8 — +${bonus} points`, now, 2.5);
      }
      return 'ring';
    }
  }

  // Island Hop: round the beacon, then land.
  if (mission.id === 'hop' && mission.beaconArmed && !mission.beaconDone) {
    const d = Math.hypot(plane.x - BEACON.x, plane.y - BEACON.y, plane.z - BEACON.z);
    if (d < 70) {
      mission.beaconDone = true;
      mission.score += SCORE.beacon;
      showMessage(mission, `Beacon rounded — +${SCORE.beacon}. Now land on runway 09.`, now, 4);
    }
  }

  // Landing ends the hop (and scores any landing in free flight too).
  if (event === 'landed-perfect' || event === 'landed-rough') {
    const perfect = event === 'landed-perfect';
    const base = perfect ? SCORE.landingPerfect : SCORE.landingRough;
    let bonus = base;
    if (mission.id === 'hop') {
      bonus += mission.beaconDone ? SCORE.landingGood : 0;
    }
    if (mission.id === 'rings') {
      bonus = perfect ? SCORE.landingGood : SCORE.landingRough;
    }
    mission.score += bonus;
    mission.landedQuality = perfect ? 'perfect' : 'rough';
    mission.status = 'done';
    const word = perfect ? 'Greased it!' : 'Down — a bit hard, but down.';
    const hopNote = mission.id === 'hop' && !mission.beaconDone ? ' (beacon missed — no hop bonus)' : '';
    mission.result = `${word} Landed +${bonus} points${hopNote}. Total ${mission.score}. Press R to fly again.`;
    return 'landed';
  }
  return '';
}

/** The objective line the HUD shows for the current mission. */
export function objectiveLine(mission) {
  if (mission.id === 'rings') {
    if (mission.nextRing >= mission.rings.length) return 'Course complete — land when ready';
    return `Ring ${mission.nextRing + 1} of 8 — follow the gold ring`;
  }
  if (mission.id === 'hop') {
    if (!mission.beaconArmed) return 'Take off from runway 09';
    if (!mission.beaconDone) return 'Round the lighthouse beacon';
    return 'Beacon rounded — land on runway 09';
  }
  return 'Free flight — explore Tern Island';
}
