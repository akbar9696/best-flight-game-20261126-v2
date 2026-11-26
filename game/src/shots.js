// The screenshot scenes behind ?shot=cover|valley|landing|title. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (bank toward the next ring, pitch toward its altitude, cruise throttle), so the
// frame is what a short game really looks like and the same seed always gives the same frame.
// The cover is the golden-hour dusk run, the valley shot is the storm mission mid-combo,
// the landing is a lit dusk final — each frame shows the game's best light.

import { PLANE, STEP } from './config.js';
import { EVENT_CRASHED, EVENT_LANDED } from './world.js';
import { SCREEN_LANDED, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const COVER_SECONDS = 26;
const VALLEY_SECONDS = 55;
const LANDING_SECONDS = 200;
const TITLE_SECONDS = 6;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Steer toward the next ring (or the runway when the rings are done). Staging only: the
 * pilot aims a little to the side of the ring's centre, so the ring stays visible beside
 * the aircraft instead of hiding behind it. Pitch is negative to climb: a positive
 * pitch target in the world means the nose is up.
 */
function autopilot(world) {
  const state = world.state;
  const plane = state.plane;
  const target = world.target();
  const dz = target.z - plane.z;
  // Aim a little to the side while the ring is far (so it stays visible beside the
  // aircraft), then fade the offset to zero on final approach so the ring is actually hit.
  const forward = Math.hypot(target.x - plane.x, dz);
  const side = forward > 400 ? 25 : forward > 150 ? 12 : 0;
  const aimX = target.kind === 'ring' ? target.x + side : target.x;
  const dx = aimX - plane.x;
  const bearing = (Math.atan2(dx, dz) * 180) / Math.PI;
  let rel = bearing - plane.heading;
  while (rel > 180) rel -= 360;
  while (rel < -180) rel += 360;
  const bank = clamp(rel / 30, -1, 1);
  const altError = target.alt - plane.alt;
  const pitch = -clamp(altError / 60, -1, 1);
  // Ease the throttle toward cruise; on final, slow down for the runway.
  const wantSlow = target.kind === 'runway' && plane.z > 8200;
  const throttle = wantSlow ? -0.4 : 0.25;
  return { bank, pitch, throttle };
}

function flyFor(world, seconds) {
  let events = 0;
  for (let i = 0; i < seconds / STEP; i += 1) {
    const steer = autopilot(world);
    // The autopilot's throttle is a nudge, not a hold: fold it into the plane directly.
    // On final approach keep enough throttle to stay above stall speed.
    const floor = world.target().kind === 'runway' ? 0.32 : 0.2;
    world.state.plane.throttle = clamp(world.state.plane.throttle + steer.throttle * STEP, floor, 0.7);
    events = world.step(STEP, { bank: steer.bank, pitch: steer.pitch, throttle: 0 }, false);
    if (events & (EVENT_CRASHED | EVENT_LANDED)) break;
  }
  return events;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best score
 * to show. Unknown names stage the title.
 */
export function stageShot(name, world) {
  if (name === 'valley') {
    // Storm Courier mid-flight: rain, gusts, and a combo already burning.
    world.reset(3);
    flyFor(world, VALLEY_SECONDS);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'landing') {
    world.reset(2);
    const events = flyFor(world, LANDING_SECONDS);
    if (events & EVENT_LANDED) return { screen: SCREEN_LANDED, best: world.state.score };
    // The autopilot did not quite land: put the plane on a clean dusk final approach
    // instead, with the lit runway filling the view ahead.
    world.reset(2);
    // The rings are done: the course is flown, only the landing is left, so the
    // target arrow points at the runway ahead instead of a ring far behind.
    for (const ring of world.state.rings) ring.hit = true;
    world.state.ringsHit = world.state.rings.length;
    world.state.streak = world.state.rings.length;
    world.state.combo = 3;
    world.state.score = world.state.rings.length * 150;
    const plane = world.state.plane;
    plane.x = 420;
    plane.z = 8900;
    plane.alt = 150;
    plane.heading = 2;
    plane.speed = 46;
    plane.throttle = 0.3;
    plane.gearDown = true;
    world.state.message = 'FINAL — STRIP 27 AHEAD · GEAR DOWN';
    world.state.messageUntil = 999;
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'title') {
    world.reset(3);
    flyFor(world, TITLE_SECONDS);
    return { screen: SCREEN_TITLE, best: 2480 };
  }
  // Cover: golden-hour dusk, a ring close ahead, sun low, the valley and HUD in full.
  world.reset(2);
  flyFor(world, COVER_SECONDS);
  return { screen: SCREEN_PLAY, best: world.state.score };
}
