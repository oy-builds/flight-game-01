// The Kestrel K-2: an arcade flight model with a real stall, bank-to-turn
// and ground effect, plus the low-poly mesh the renderer draws for it.
import { FLIGHT, RUNWAY } from './config.js';
import { clamp, lerp } from './noise.js';
import { heightAt, onRunway } from './terrain.js';

/** Fresh aircraft state, parked at the runway threshold, facing east (09). */
export function freshAircraft() {
  return {
    x: -RUNWAY.length / 2 + 30,
    y: RUNWAY.elevation + 1.6,
    z: 0,
    heading: Math.PI / 2, // heading 090: east, +x. 0 = north (-z).
    pitch: 0,
    bank: 0,
    speed: 0,
    throttle: 0,
    gearDown: true,
    flaps: false,
    onGround: true,
    verticalSpeed: 0,
    propAngle: 0,
    crashed: false,
    landed: false,
  };
}

/** Forward unit vector from heading and pitch. */
export function forwardVector(plane) {
  const cp = Math.cos(plane.pitch);
  return {
    x: Math.sin(plane.heading) * cp,
    y: Math.sin(plane.pitch),
    z: -Math.cos(plane.heading) * cp,
  };
}

/**
 * Step the flight model by dt seconds. `ctl` holds the pilot's inputs:
 * pitch (-1..1, +1 = nose up), roll (-1..1, +1 = bank right),
 * throttle (0..1), brake (bool), flaps (bool).
 * Returns an event string: 'takeoff' | 'crash' | 'landed' | 'ditched' | ''.
 */
export function stepFlight(plane, ctl, dt) {
  if (plane.crashed || plane.landed) return '';
  const wasOnGround = plane.onGround;

  // Throttle and speed.
  plane.throttle = clamp(plane.throttle + (ctl.throttleDelta || 0) * dt, 0, 1);
  const targetSpeed = FLIGHT.minSpeed + plane.throttle * (FLIGHT.maxSpeed - FLIGHT.minSpeed);
  const drag = FLIGHT.drag * (plane.flaps ? 1.9 : 1) * (ctl.brake ? 3.2 : 1);
  const accel = (targetSpeed - plane.speed) * (plane.throttle > 0.02 ? 0.55 : drag);
  plane.speed = Math.max(0, plane.speed + accel * dt);
  if (plane.speed < 0.5 && plane.throttle < 0.05) plane.speed = 0;

  // Pitch and bank ease toward the pilot's targets.
  const pitchTarget = clamp(ctl.pitch * FLIGHT.maxPitch, -FLIGHT.maxPitch, FLIGHT.maxPitch);
  const bankTarget = clamp(ctl.roll * FLIGHT.maxBank, -FLIGHT.maxBank, FLIGHT.maxBank);
  plane.pitch += clamp(pitchTarget - plane.pitch, -FLIGHT.pitchRate * dt, FLIGHT.pitchRate * dt);
  plane.bank += clamp(bankTarget - plane.bank, -FLIGHT.rollRate * dt, FLIGHT.rollRate * dt);
  plane.flaps = !!ctl.flaps;

  // Bank turns the heading; the turn tightens with speed. Bank > 0 is a
  // right bank, and a right bank turns the nose to the right (heading grows
  // from north 0 toward east PI/2).
  plane.heading += plane.bank * FLIGHT.turnFactor * clamp(plane.speed / 60, 0, 1.4) * dt;

  // Lift: the wing only works above the stall speed.
  const lift = clamp(plane.speed / FLIGHT.stallSpeed, 0, 1);
  const groundEffect = plane.onGround ? 1 : FLIGHT.groundEffect;
  let vy = Math.sin(plane.pitch) * plane.speed * lift * FLIGHT.climbFactor * groundEffect;
  if (lift < 1 && !plane.onGround) vy -= FLIGHT.sinkRate * (1 - lift);
  if (plane.onGround) vy = Math.max(0, vy);
  plane.verticalSpeed = vy;

  // Move.
  const fwd = forwardVector(plane);
  plane.x += fwd.x * plane.speed * dt;
  plane.y += vy * dt;
  plane.z += fwd.z * plane.speed * dt;
  plane.propAngle += (2 + plane.throttle * 38) * dt;

  // Ground contact.
  const ground = heightAt(plane.x, plane.z);
  if (plane.y <= ground + 1.6) {
    plane.y = ground + 1.6;
    plane.onGround = true;
    if (!wasOnGround) {
      // Touchdown: judge it.
      const smooth = Math.abs(vy) < 4.5 && Math.abs(plane.bank) < 0.35 && plane.speed < 58;
      const rough = Math.abs(vy) < 9 && Math.abs(plane.bank) < 0.7 && plane.speed < 75;
      if (onRunway(plane.x, plane.z) && plane.gearDown) {
        if (smooth || rough) {
          plane.landed = true;
          return smooth ? 'landed-perfect' : 'landed-rough';
        }
      }
      if (plane.y <= 1.2) return 'ditched';
      plane.crashed = true;
      return 'crash';
    }
    // Rolling on the ground: level the wings, bleed speed with brakes.
    plane.pitch = lerp(plane.pitch, 0, 3 * dt);
    plane.bank = lerp(plane.bank, 0, 3 * dt);
    if (ctl.brake) plane.speed = Math.max(0, plane.speed - 22 * dt);
    if (plane.speed < 1 && plane.throttle < 0.05) plane.speed = 0;
  } else {
    plane.onGround = false;
  }

  // Water: below sea level is a ditching.
  if (plane.y < 1.0) {
    plane.crashed = true;
    return 'ditched';
  }
  // Island bounds: turn the plane gently back toward the island.
  const r = Math.hypot(plane.x, plane.z);
  if (r > 1500) {
    const home = Math.atan2(-plane.x, plane.z); // heading back to centre
    let diff = home - plane.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    plane.heading += clamp(diff, -0.6 * dt, 0.6 * dt);
  }
  if (wasOnGround && !plane.onGround && plane.speed > FLIGHT.stallSpeed) return 'takeoff';
  return '';
}

/** Airspeed in knots, altitude in feet, heading in degrees — for the HUD. */
export function hudNumbers(plane) {
  const knots = plane.speed * 1.94384;
  const feet = (plane.y - RUNWAY.elevation) * 3.28084;
  let deg = ((plane.heading * 180) / Math.PI) % 360;
  if (deg < 0) deg += 360;
  return {
    knots: Math.round(knots),
    feet: Math.round(feet),
    headingDeg: Math.round(deg),
    vspeed: Math.round(plane.verticalSpeed * 196.85), // ft/min
  };
}

// ---------------------------------------------------------------------------
// The mesh: a cream-and-red courier prop plane, built from coloured
// triangles. Vertices are in the plane's local frame: +x right, +y up,
// -z forward (nose points -z, matching the forward vector).
// ---------------------------------------------------------------------------

function tri(out, a, b, c, colour) {
  out.positions.push(...a, ...b, ...c);
  out.colours.push(...colour, ...colour, ...colour);
}

function quad(out, a, b, c, d, colour) {
  tri(out, a, b, c, colour);
  tri(out, a, c, d, colour);
}

/** Build the aircraft mesh. Returns { positions, colours } (non-indexed). */
export function buildAircraftMesh() {
  const out = { positions: [], colours: [] };
  const cream = [0.93, 0.88, 0.78];
  const red = [0.78, 0.16, 0.14];
  const dark = [0.16, 0.18, 0.22];
  const glass = [0.25, 0.42, 0.58];
  const silver = [0.75, 0.76, 0.78];

  // Fuselage: a tapered hexagonal prism from nose (z=-3.4) to tail (z=3.2).
  const nose = [-3.4, 0, 0];
  const sections = [
    { z: -3.4, r: 0.12 },
    { z: -2.6, r: 0.62 },
    { z: -1.2, r: 0.72 },
    { z: 0.8, r: 0.6 },
    { z: 2.4, r: 0.38 },
    { z: 3.2, r: 0.1 },
  ];
  const ring = [
    [0, 1], [0.7, 0.7], [1, 0], [0.7, -0.7], [0, -1], [-0.7, -0.7], [-1, 0], [-0.7, 0.7],
  ];
  for (let s = 0; s < sections.length - 1; s += 1) {
    const a = sections[s];
    const b = sections[s + 1];
    for (let k = 0; k < ring.length; k += 1) {
      const p0 = ring[k];
      const p1 = ring[(k + 1) % ring.length];
      const v0 = [p0[0] * a.r, p0[1] * a.r * 0.9, a.z];
      const v1 = [p1[0] * a.r, p1[1] * a.r * 0.9, a.z];
      const v2 = [p1[0] * b.r, p1[1] * b.r * 0.9, b.z];
      const v3 = [p0[0] * b.r, p0[1] * b.r * 0.9, b.z];
      // Red cheatline along the side.
      const col = k === 2 || k === 6 ? red : cream;
      quad(out, v0, v3, v2, v1, col);
    }
  }
  // Nose cap.
  for (let k = 0; k < ring.length; k += 1) {
    const p0 = ring[k];
    const p1 = ring[(k + 1) % ring.length];
    tri(out, nose, [p1[0] * 0.12, p1[1] * 0.12 * 0.9, -3.4], [p0[0] * 0.12, p0[1] * 0.12 * 0.9, -3.4], dark);
  }
  // Tail cap.
  const tail = [0, 0, 3.2];
  const last = sections[sections.length - 1];
  for (let k = 0; k < ring.length; k += 1) {
    const p0 = ring[k];
    const p1 = ring[(k + 1) % ring.length];
    tri(out, tail, [p0[0] * last.r, p0[1] * last.r * 0.9, last.z], [p1[0] * last.r, p1[1] * last.r * 0.9, last.z], cream);
  }

  // Main wings: low wing, slight dihedral, red tips.
  const wingY = -0.28;
  const wing = (side) => {
    const x0 = 0.4 * side;
    const x1 = 4.6 * side;
    quad(out, [x0, wingY, -1.5], [x1, wingY + 0.18, -1.1], [x1, wingY + 0.18, 0.5], [x0, wingY, 0.9], cream);
    quad(out, [x0, wingY - 0.06, -1.5], [x0, wingY, -1.5], [x1, wingY + 0.18, -1.1], [x1, wingY + 0.18 - 0.06, -1.1], silver);
    quad(out, [x1 - 0.5 * side, wingY + 0.18, -1.1], [x1, wingY + 0.18, -1.1], [x1, wingY + 0.18, 0.5], [x1 - 0.5 * side, wingY + 0.18, 0.5], red);
  };
  wing(1);
  wing(-1);

  // Horizontal stabiliser.
  quad(out, [0.3, 0.18, 2.2], [1.9, 0.22, 2.5], [1.9, 0.22, 3.0], [0.3, 0.18, 3.0], cream);
  quad(out, [-0.3, 0.18, 2.2], [-1.9, 0.22, 2.5], [-1.9, 0.22, 3.0], [-0.3, 0.18, 3.0], cream);
  // Vertical fin, red.
  quad(out, [0, 0.3, 2.3], [0, 1.35, 2.55], [0, 1.35, 3.15], [0, 0.3, 3.15], red);
  quad(out, [0.02, 0.3, 2.3], [0.02, 1.35, 2.55], [0.02, 1.35, 3.15], [0.02, 0.3, 3.15], red);

  // Canopy: dark glass over the cockpit.
  quad(out, [-0.42, 0.55, -1.9], [0.42, 0.55, -1.9], [0.42, 0.72, -0.9], [-0.42, 0.72, -0.9], glass);
  quad(out, [-0.42, 0.55, -1.9], [-0.42, 0.72, -0.9], [-0.3, 0.72, -0.9], [-0.3, 0.55, -1.9], glass);
  quad(out, [0.42, 0.55, -1.9], [0.3, 0.55, -1.9], [0.3, 0.72, -0.9], [0.42, 0.72, -0.9], glass);

  // Landing gear: two struts and wheels (drawn only when the gear is down).
  const gear = (side) => {
    quad(out, [0.55 * side, -0.5, -1.2], [0.75 * side, -0.5, -1.2], [0.75 * side, -1.05, -1.2], [0.55 * side, -1.05, -1.2], dark);
    tri(out, [0.65 * side, -1.15, -1.35], [0.65 * side, -1.15, -1.05], [0.65 * side, -0.85, -1.2], dark);
  };
  gear(1);
  gear(-1);

  out.positions = new Float32Array(out.positions);
  out.colours = new Float32Array(out.colours);
  return out;
}

/** Propeller disc: two blades spinning around the nose, rebuilt per frame angle. */
export function buildPropMesh(angle) {
  const positions = [];
  const colours = [];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const blade = (a) => {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // Blade tip and root in the prop plane (x/y), nose at z=-3.45.
    const tip = [ca * 1.05, sa * 1.05, -3.48];
    const root = [ca * 0.12, sa * 0.12, -3.48];
    const side = [-sa * 0.09, ca * 0.09, 0];
    const t2 = [tip[0] + side[0], tip[1] + side[1], tip[2]];
    const r2 = [root[0] + side[0], root[1] + side[1], root[2]];
    const dark = [0.12, 0.12, 0.14];
    tri({ positions, colours }, tip, root, r2, dark);
    tri({ positions, colours }, tip, r2, t2, dark);
  };
  blade(angle);
  blade(angle + Math.PI);
  // Spinner cone.
  const tip = [0, 0, -3.75];
  const base = [];
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2;
    base.push([Math.cos(a) * 0.22, Math.sin(a) * 0.22, -3.42]);
  }
  const red = [0.78, 0.16, 0.14];
  for (let k = 0; k < 8; k += 1) {
    tri({ positions, colours }, tip, base[(k + 1) % 8], base[k], red);
  }
  return { positions: new Float32Array(positions), colours: new Float32Array(colours) };
}
