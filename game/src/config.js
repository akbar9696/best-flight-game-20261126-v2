// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on screen size.
// Meridian Sky Courier II: the M-27 courier flies parcels across Meridian Valley — now
// with a fourth storm mission, ring combos and a perfect-landing bonus.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** 1 knot in metres per second. Speeds are simulated in m/s, shown in knots. */
export const KT = 0.514444;

export const PLANE = {
  /** Cruise speed the throttle aims for, m/s (~150 kt). */
  cruise: 78,
  maxSpeed: 105,
  minSpeed: 26,
  stallSpeed: 30,
  /** Degrees of bank per second of turn authority. */
  maxBank: 48,
  maxPitchUp: 14,
  maxPitchDown: -12,
  climbRate: 9,
  /** Fuel percent burned per second at full throttle. */
  fuelBurn: 0.55,
  hull: 100,
};

export const MISSIONS = [
  {
    id: 'ring-run',
    name: 'Ring Run',
    blurb: 'Thread 8 sky rings down Meridian Valley, then land on Strip 27.',
    rings: 8,
    wind: 0,
    dusk: false,
    storm: false,
    fuel: 100,
    par: 150,
  },
  {
    id: 'ridge-courier',
    name: 'Ridge Courier',
    blurb: '12 rings over the high ridge in a gusting crosswind. Fuel is tight.',
    rings: 12,
    wind: 9,
    dusk: false,
    storm: false,
    fuel: 85,
    par: 210,
  },
  {
    id: 'night-mail',
    name: 'Night Mail',
    blurb: 'Dusk mail run: 10 rings, low light, lit runway. Watch the fuel gauge.',
    rings: 10,
    wind: 4,
    dusk: true,
    storm: false,
    fuel: 90,
    par: 190,
  },
  {
    id: 'storm-courier',
    name: 'Storm Courier',
    blurb: '14 rings through driving rain and hard gusts. Combos pay double.',
    rings: 14,
    wind: 14,
    dusk: false,
    storm: true,
    fuel: 80,
    par: 240,
  },
];

/** The runway: a flat strip at the far end of the valley, heading north (0 deg). */
export const RUNWAY = {
  x: 420,
  z: 9800,
  heading: 0,
  length: 820,
  width: 46,
  elevation: 118,
};

/** Sky rings are 26 m across; fly through the middle. */
export const RING_RADIUS = 13;
export const RING_POINTS = 100;

/**
 * Scoring: a ring pays 100 (50 extra dead centre) times the combo. Every 3 rings in a
 * row without a miss raises the combo one step, up to x3. A gentle, slow, aligned
 * touchdown pays the perfect-landing bonus on top of the landing points.
 */
export const SCORE = {
  ring: 100,
  centreBonus: 50,
  landing: 400,
  parBonus: 200,
  perfectLanding: 150,
};
export const COMBO_STEP = 3;
export const COMBO_MAX = 3;

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'meridian-sky-courier-2.best';

export const PALETTE = {
  backdrop: '#0b0e14',
  panel: '#141a22',
  panelEdge: '#2a3442',
  text: '#eef1f5',
  muted: '#8b93a3',
  amber: '#ffb454',
  green: '#4ade80',
  red: '#ff5d5d',
  cyan: '#67e8f9',
  skyDay: ['#7ec0ee', '#bfe3f7', '#e8f4fb'],
  skyDusk: ['#2b2a55', '#c65d7b', '#f2a65a'],
  skyStorm: ['#3a4552', '#6b7d8c', '#9fb2bd'],
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const MONO = '"SF Mono", "Cascadia Mono", Consolas, monospace';
