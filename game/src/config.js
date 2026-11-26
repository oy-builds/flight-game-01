// Ridge Runner — shared tuning constants for the whole game.
// One place holds every number a designer would tune: speeds, fuel, rings,
// the island and the runway. The flight model, renderer and missions read
// from here so a single edit retunes the game.
export const GAME_NAME = 'Ridge Runner';
export const GAME_SUBTITLE = 'Tern Island Courier';
export const PLANE_NAME = 'Kestrel K-2';

// --- flight model (metres, seconds, radians) ---
export const FLIGHT = {
  maxSpeed: 96, // m/s at full throttle, level
  cruiseSpeed: 62,
  stallSpeed: 27, // below this the wing stops lifting
  minSpeed: 12,
  accel: 14, // m/s^2 toward target speed
  drag: 0.12,
  maxPitch: 0.62, // ~35 degrees
  maxBank: 1.05, // ~60 degrees
  pitchRate: 1.5, // rad/s toward target pitch
  rollRate: 2.4, // rad/s toward target bank
  turnFactor: 0.55, // how much bank turns the heading
  climbFactor: 1.0,
  sinkRate: 9, // m/s sink when stalled
  groundEffect: 1.15,
};

// --- fuel & damage ---
export const FUEL = {
  capacity: 100,
  burnPerSecond: 0.55, // at full throttle
  burnIdle: 0.12,
  ringBonus: 6, // fuel topped up per ring
  lowWarning: 25,
};

// --- world ---
export const WORLD = {
  size: 2600, // terrain spans -1300..1300 m on x and z
  grid: 110, // terrain mesh resolution (cells per side)
  seaLevel: 0,
  islandRadius: 1150,
  peakHeight: 185,
  plateauHeight: 24, // airfield elevation
};

// --- runway (Tern Field, heading 09/27) ---
export const RUNWAY = {
  centreX: 0,
  centreZ: 0,
  length: 620,
  width: 34,
  headingDeg: 90, // runway 09: take off toward +x (east)
  elevation: WORLD.plateauHeight,
};

// --- ring course: 8 gold rings around the island ---
export const RINGS = [
  { x: 420, y: 150, z: -180, r: 16 },
  { x: 680, y: 190, z: -480, r: 16 },
  { x: 520, y: 230, z: -780, r: 16 },
  { x: -120, y: 260, z: -760, r: 18 },
  { x: -720, y: 210, z: -420, r: 16 },
  { x: -880, y: 170, z: 320, r: 16 },
  { x: -420, y: 140, z: 760, r: 16 },
  { x: 260, y: 120, z: 620, r: 18 },
];

// --- missions ---
export const MISSIONS = [
  {
    id: 'rings',
    name: 'Ring Run',
    blurb: 'Thread all 8 gold rings around Tern Island before the clock runs out.',
    timeLimit: 240,
  },
  {
    id: 'hop',
    name: 'Island Hop',
    blurb: 'Take off from Tern Field, round the lighthouse beacon, and land back on runway 09.',
    timeLimit: 300,
  },
  {
    id: 'free',
    name: 'Free Flight',
    blurb: 'No clock, no course. Learn the island, buzz the beach, grease a landing.',
    timeLimit: 0,
  },
];

export const SCORE = {
  ring: 100,
  ringTimeBonus: 25, // per ring, scaled by time left
  landingPerfect: 500,
  landingGood: 250,
  landingRough: 100,
  beacon: 150,
};

// --- controls (shown on the title screen and the help panel) ---
export const CONTROLS = [
  ['W / S or Shift / Ctrl', 'Throttle up / down'],
  ['Arrow Up / Down', 'Pitch nose down / up'],
  ['Arrow Left / Right', 'Bank left / right'],
  ['Mouse', 'Steer gently (move to bank and pitch)'],
  ['G', 'Landing gear up / down'],
  ['F', 'Flaps (slower, steadier landing)'],
  ['Space', 'Airbrake'],
  ['R', 'Restart the sortie'],
  ['P', 'Pause'],
  ['M', 'Mute'],
  ['H', 'Help'],
];
