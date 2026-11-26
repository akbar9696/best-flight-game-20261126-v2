// The game's rules and state, with no drawing and no browser in it: the plane, the valley,
// the ring course, the runway, fuel, damage, combos and score. step() advances one fixed
// step and returns what happened as bit flags, so the caller can react without the world
// knowing about screens or sound. The terrain, the river and the ring course are
// deterministic functions of position, so any seed builds the same valley.
//
// Combos: every 3 rings in a row without a miss raises the multiplier one step (x1 → x2
// → x3); a miss resets the streak. A gentle, slow, aligned touchdown is a perfect
// landing and pays a bonus on top of the landing points.

import { COMBO_MAX, COMBO_STEP, KT, MISSIONS, PLANE, RING_POINTS, RING_RADIUS, RUNWAY, SCORE, STEP } from './config.js';
import { noise1 } from './random.js';

export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASHED = 4;
export const EVENT_FUEL_EMPTY = 8;
export const EVENT_LOW_FUEL = 16;
export const EVENT_STALL = 32;
export const EVENT_PERFECT = 64;

/** Valley floor height in metres at (x, z): rolling hills, a river gorge, high ridges east/west. */
export function terrainHeight(x, z) {
  const valley = 110 + 26 * noise1(z * 0.0006, 11) + 14 * noise1(z * 0.0021 + 40, 23);
  const ridge = Math.max(0, (Math.abs(x) - 700) / 900);
  const ridgeHeight = ridge * ridge * 260 * (0.7 + 0.6 * noise1(z * 0.0009 + 7, 31));
  const gorge = -18 * Math.exp(-((x - riverX(z)) ** 2) / (2 * 90 * 90));
  return valley + ridgeHeight + gorge;
}

/** The river's centreline x at distance z down the valley. */
export function riverX(z) {
  return 620 * Math.sin(z * 0.00042) + 260 * Math.sin(z * 0.0011 + 1.7);
}

/** Where ring `index` of `count` sits on the course: a winding line down the valley. */
export function ringPosition(index, count) {
  const t = (index + 1) / (count + 1);
  const z = 900 + t * (RUNWAY.z - 1800);
  const x = 480 * Math.sin(t * 5.2) + 180 * Math.sin(t * 11.7 + 2.0);
  const alt = 235 + 55 * Math.sin(t * 7.9 + 0.6) + 25 * Math.sin(t * 3.1);
  return { x, z, alt };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function createWorld(random) {
  const plane = {
    x: 0, z: 0, alt: 240,
    heading: 0, pitch: 0, bank: 0,
    speed: 62, throttle: 0.62,
    fuel: 100, hull: PLANE.hull,
    gearDown: false, flaps: false,
    verticalSpeed: 0,
  };
  const rings = [];
  const state = {
    plane, rings,
    missionIndex: 0,
    mission: MISSIONS[0],
    score: 0,
    ringsHit: 0,
    elapsed: 0,
    landed: false,
    crashed: false,
    crashReason: '',
    message: '',
    messageUntil: 0,
    lowFuelWarned: false,
    stallWarned: false,
    windGust: 0,
    gustTimer: 0,
    streak: 0,
    combo: 1,
    bestStreak: 0,
    perfectLanding: false,
    landingQuality: '',
  };

  function buildRings() {
    rings.length = 0;
    for (let i = 0; i < state.mission.rings; i += 1) {
      const pos = ringPosition(i, state.mission.rings);
      rings.push({ ...pos, hit: false, index: i });
    }
  }

  function reset(missionIndex) {
    state.missionIndex = missionIndex;
    state.mission = MISSIONS[missionIndex];
    plane.x = 0;
    plane.z = 0;
    plane.alt = 240;
    plane.heading = 0;
    plane.pitch = 0;
    plane.bank = 0;
    plane.speed = 62;
    plane.throttle = 0.62;
    plane.fuel = state.mission.fuel;
    plane.hull = PLANE.hull;
    plane.gearDown = false;
    plane.flaps = false;
    plane.verticalSpeed = 0;
    state.score = 0;
    state.ringsHit = 0;
    state.elapsed = 0;
    state.landed = false;
    state.crashed = false;
    state.crashReason = '';
    state.message = '';
    state.messageUntil = 0;
    state.lowFuelWarned = false;
    state.stallWarned = false;
    state.windGust = 0;
    state.gustTimer = 0;
    state.streak = 0;
    state.combo = 1;
    state.bestStreak = 0;
    state.perfectLanding = false;
    state.landingQuality = '';
    buildRings();
  }

  function nextRing() {
    for (const ring of rings) if (!ring.hit) return ring;
    return null;
  }

  function say(text) {
    state.message = text;
    state.messageUntil = state.elapsed + 2.6;
  }

  /** The combo from the current streak: +1 step every COMBO_STEP rings, capped. */
  function comboFor(streak) {
    return Math.min(COMBO_MAX, 1 + Math.floor(streak / COMBO_STEP));
  }

  /**
   * One fixed step. `steer` is { bank, pitch, throttle } in -1..1. `harmless` is the title
   * screen's demo: the plane flies itself and nothing can crash it.
   */
  function step(dt, steer, harmless) {
    let events = 0;
    if (state.landed || state.crashed) return events;
    state.elapsed += dt;

    // Wind gusts on the windy missions push the nose sideways; the storm hits hardest.
    if (state.mission.wind > 0) {
      state.gustTimer -= dt;
      if (state.gustTimer <= 0) {
        state.windGust = (random() - 0.5) * 2 * state.mission.wind;
        state.gustTimer = 1.5 + random() * 2.5;
      }
    }

    // Throttle: keys nudge it, the wheel nudges it in main.js; it aims the speed.
    plane.throttle = clamp(plane.throttle + steer.throttle * dt * 0.9, 0, 1);
    if (plane.fuel <= 0) {
      if (plane.throttle > 0) events |= EVENT_FUEL_EMPTY;
      plane.throttle = 0;
    }

    // Bank and pitch ease toward what the pilot asks for.
    const bankTarget = steer.bank * PLANE.maxBank;
    const pitchTarget = -steer.pitch * (steer.pitch > 0 ? PLANE.maxPitchUp : -PLANE.maxPitchDown);
    plane.bank += (bankTarget - plane.bank) * Math.min(1, dt * 3.2);
    plane.pitch += (pitchTarget - plane.pitch) * Math.min(1, dt * 2.6);

    // Turning follows the bank; a gust adds a sideways shove.
    const turnRate = plane.bank * 0.42 * (plane.speed / PLANE.cruise);
    plane.heading = (plane.heading + (turnRate + state.windGust * 0.12) * dt + 360) % 360;

    // Speed: throttle pulls toward cruise, climbing costs speed, drag caps it.
    const targetSpeed = plane.throttle * PLANE.maxSpeed;
    let speedChange = (targetSpeed - plane.speed) * dt * 0.55;
    speedChange -= Math.sin((plane.pitch * Math.PI) / 180) * PLANE.climbRate * dt * 0.9;
    plane.speed = clamp(plane.speed + speedChange, 12, PLANE.maxSpeed + 6);

    const stalled = plane.speed < PLANE.stallSpeed && plane.alt > terrainHeight(plane.x, plane.z) + 8;
    if (stalled && !state.stallWarned) {
      events |= EVENT_STALL;
      state.stallWarned = true;
      say('STALL! Lower the nose, add throttle!');
    } else if (!stalled) {
      state.stallWarned = false;
    }
    if (stalled) plane.pitch -= 14 * dt;

    // Move along the heading; climb follows the pitch at the current speed.
    const headingRad = (plane.heading * Math.PI) / 180;
    plane.x += Math.sin(headingRad) * plane.speed * dt;
    plane.z += Math.cos(headingRad) * plane.speed * dt;
    plane.verticalSpeed = Math.sin((plane.pitch * Math.PI) / 180) * plane.speed;
    plane.alt += plane.verticalSpeed * dt;
    plane.alt = Math.max(plane.alt, 4);

    // Fuel burns with throttle; low fuel gets one warning.
    plane.fuel = Math.max(0, plane.fuel - plane.throttle * PLANE.fuelBurn * dt);
    if (plane.fuel < 20 && !state.lowFuelWarned) {
      events |= EVENT_LOW_FUEL;
      state.lowFuelWarned = true;
      say('LOW FUEL — land at Strip 27 soon!');
    }

    // Rings: crossing a ring's plane inside its circle scores, times the combo.
    const ring = nextRing();
    if (ring) {
      const dz = plane.z - ring.z;
      if (Math.abs(dz) < plane.speed * dt + 2) {
        const dx = plane.x - ring.x;
        const dy = plane.alt - ring.alt;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < RING_RADIUS) {
          ring.hit = true;
          state.ringsHit += 1;
          state.streak += 1;
          state.bestStreak = Math.max(state.bestStreak, state.streak);
          state.combo = comboFor(state.streak);
          const centre = dist < RING_RADIUS * 0.45 ? SCORE.centreBonus : 0;
          const gained = (SCORE.ring + centre) * state.combo;
          state.score += gained;
          events |= EVENT_RING;
          say(centre > 0
            ? `RING ${state.ringsHit}/${rings.length} — DEAD CENTRE +${gained}${state.combo > 1 ? ` · COMBO x${state.combo}` : ''}`
            : `RING ${state.ringsHit}/${rings.length} +${gained}${state.combo > 1 ? ` · COMBO x${state.combo}` : ''}`);
        }
      }
      if (!harmless && ring.z < plane.z - 60) {
        // Flew past a ring: it stays missed, the streak and combo reset.
        ring.hit = true;
        ring.missed = true;
        state.streak = 0;
        state.combo = 1;
        say(`Missed ring ${ring.index + 1} — combo lost, keep flying the valley`);
      }
    }

    // The runway: flat ground, touchdown rules decide a landing from a crash.
    const ground = terrainHeight(plane.x, plane.z);
    const overRunway = Math.abs(plane.x - RUNWAY.x) < RUNWAY.width / 2 + 6
      && plane.z > RUNWAY.z - RUNWAY.length / 2 && plane.z < RUNWAY.z + RUNWAY.length / 2;
    const runwayGround = overRunway ? RUNWAY.elevation : ground;
    if (plane.alt <= runwayGround + 1.5) {
      plane.alt = runwayGround + 1.5;
      if (overRunway && !harmless) {
        const aligned = Math.abs(angleDiff(plane.heading, RUNWAY.heading)) < 28;
        const gentle = plane.verticalSpeed > -4.5;
        const slow = plane.speed < 52;
        if (aligned && gentle && slow) {
          state.landed = true;
          state.score += SCORE.landing;
          if (state.elapsed < state.mission.par) state.score += SCORE.parBonus;
          // Perfect: dead straight, feather-soft, slow — the courier's signature landing.
          if (Math.abs(angleDiff(plane.heading, RUNWAY.heading)) < 12
            && plane.verticalSpeed > -3 && plane.speed < 45) {
            state.perfectLanding = true;
            state.score += SCORE.perfectLanding;
            state.landingQuality = 'PERFECT LANDING';
            events |= EVENT_PERFECT;
          } else {
            state.landingQuality = 'LANDED';
          }
          events |= EVENT_LANDED;
          return events;
        }
        if (plane.speed > 62 || plane.verticalSpeed < -7) {
          state.crashed = true;
          state.crashReason = 'Hard touchdown on Strip 27 — come in slower and flatter.';
          events |= EVENT_CRASHED;
          return events;
        }
        // A bumpy but survivable touchdown: bounce back up a little and roll on.
        plane.alt = runwayGround + 6;
        plane.speed *= 0.82;
        plane.verticalSpeed = 2;
        say('Bumpy touchdown! Hold it straight, ease off the throttle.');
      } else if (!harmless) {
        state.crashed = true;
        state.crashReason = ground > 220
          ? 'Clipped the ridge — the valley is lower than the hills.'
          : 'Flew into the valley floor.';
        events |= EVENT_CRASHED;
        return events;
      } else {
        plane.alt = ground + 30;
      }
    }

    // Flying out of the valley sideways is allowed but pointless: nudge back with a message.
    if (Math.abs(plane.x) > 2600 && !harmless) say('Off course — turn back toward the river valley.');

    return events;
  }

  /** Where the pilot should aim next: the next ring, or the runway when the rings are done. */
  function target() {
    const ring = nextRing();
    if (ring) return { x: ring.x, z: ring.z, alt: ring.alt, kind: 'ring', label: `RING ${ring.index + 1}` };
    return { x: RUNWAY.x, z: RUNWAY.z, alt: RUNWAY.elevation + 40, kind: 'runway', label: 'STRIP 27' };
  }

  reset(0);
  return {
    state, reset, step, nextRing, target,
    speedKts() {
      return Math.round(plane.speed / KT);
    },
    altitudeFt() {
      return Math.round(plane.alt * 3.28084);
    },
    headingDeg() {
      return Math.round(plane.heading);
    },
    groundFt() {
      return Math.round(terrainHeight(plane.x, plane.z) * 3.28084);
    },
    windKts() {
      return Math.round(Math.abs(state.windGust) / KT);
    },
  };
}
