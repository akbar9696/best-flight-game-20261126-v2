// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is there.
// The game moves between five screens: title, play, paused, landed and game over. Four
// missions now: Ring Run, Ridge Courier, Night Mail and Storm Courier.
//
// ?seed=N fixes the valley and the ring course. ?shot=cover|valley|landing|title (with
// &seed=N) stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_CRASHED,
  EVENT_FUEL_EMPTY,
  EVENT_LANDED,
  EVENT_LOW_FUEL,
  EVENT_PERFECT,
  EVENT_RING,
  EVENT_STALL,
} from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_MISSION_1,
  ACTION_MISSION_2,
  ACTION_MISSION_3,
  ACTION_MISSION_4,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_RESTART,
  createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_LANDED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createInstruments } from './instruments.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const instruments = createInstruments(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    const timeMs = performance.now();
    renderer.drawScene(world.state, timeMs);
    instruments.drawHud(world.state, world.speedKts(), world.altitudeFt(), world.headingDeg(), world.windKts(), timeMs);
    instruments.drawPanel(world.state, world.speedKts(), world.altitudeFt(), world.headingDeg());
    renderer.drawNextTargetArrow(world.state, world.target());
    if (scene.screen === SCREEN_TITLE) instruments.drawTitle(world.state, scene.best);
    else if (scene.screen === SCREEN_LANDED) {
      instruments.drawOverlayPanel(world.state.landingQuality || 'LANDED!', [`Score ${world.state.score}`, `Rings ${world.state.ringsHit}/${world.state.rings.length}`, 'Welcome to Strip 27, courier.'], 'Press Space to fly again', '#4ade80');
    } else if (scene.screen === SCREEN_OVER) {
      instruments.drawOverlayPanel('CRASHED', [world.state.crashReason || 'The valley wins this time.', `Score ${world.state.score}`], 'Press Space to try again');
    }
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.start();
    world.reset(world.state.missionIndex);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Flying ${world.state.mission.name}. Thread the rings, land on Strip 27.`);
  }

  function endGame(crashed) {
    screen = crashed ? SCREEN_OVER : SCREEN_LANDED;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(crashed
      ? `Crashed. ${world.state.crashReason} Score ${world.state.score}.`
      : `Landed on Strip 27. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    const wheel = input.takeWheel();
    if (wheel !== 0 && screen === SCREEN_PLAY) {
      world.state.plane.throttle = Math.max(0, Math.min(1, world.state.plane.throttle + wheel * 0.06));
    }
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_MISSION_1) world.state.missionIndex = 0;
    else if (actions & ACTION_MISSION_2) world.state.missionIndex = 1;
    else if (actions & ACTION_MISSION_3) world.state.missionIndex = 2;
    else if (actions & ACTION_MISSION_4) world.state.missionIndex = 3;
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) startGame();
    else if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_LANDED)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The title backdrop flies itself down the valley, harmlessly.
      const target = world.target();
      const dx = target.x - world.state.plane.x;
      const dz = target.z - world.state.plane.z;
      const bearing = (Math.atan2(dx, dz) * 180) / Math.PI;
      let rel = bearing - world.state.plane.heading;
      while (rel > 180) rel -= 360;
      while (rel < -180) rel += 360;
      world.step(STEP, { bank: Math.max(-1, Math.min(1, rel / 30)), pitch: 0, throttle: 0 }, true);
      return;
    }
    const steer = input.steer();
    const events = world.step(STEP, steer, false);
    if (events & EVENT_RING) {
      audio.ring(world.state.combo);
      announce(`Ring ${world.state.ringsHit} of ${world.state.rings.length}. Score ${world.state.score}.`);
    }
    if (events & EVENT_STALL) audio.warning();
    if (events & EVENT_LOW_FUEL) audio.warning();
    if (events & EVENT_FUEL_EMPTY) announce('Fuel empty — gliding. Find the runway.');
    if (events & EVENT_PERFECT) audio.perfect();
    if (events & EVENT_LANDED) {
      audio.land();
      endGame(false);
    } else if (events & EVENT_CRASHED) {
      audio.crash();
      endGame(true);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const timeMs = now;
    renderer.drawScene(world.state, timeMs);
    renderer.drawNextTargetArrow(world.state, world.target());
    instruments.drawHud(world.state, world.speedKts(), world.altitudeFt(), world.headingDeg(), world.windKts(), timeMs);
    instruments.drawPanel(world.state, world.speedKts(), world.altitudeFt(), world.headingDeg());
    audio.update(world.state.plane.throttle, world.speedKts(), screen === SCREEN_PLAY, world.state.mission.storm);
    if (screen === SCREEN_TITLE) {
      instruments.drawTitle(world.state, best);
    } else if (screen === SCREEN_PAUSED) {
      instruments.drawOverlayPanel('Paused', ['The valley will wait.', `Score ${world.state.score} · Rings ${world.state.ringsHit}/${world.state.rings.length}`], 'Press P to resume');
    } else if (screen === SCREEN_LANDED) {
      const parBonus = world.state.elapsed < world.state.mission.par ? ` · Beat par +200` : '';
      const perfect = world.state.perfectLanding ? ' · PERFECT +150' : '';
      instruments.drawOverlayPanel(world.state.landingQuality || 'LANDED!', [`Score ${world.state.score}${parBonus}${perfect}`, `Rings ${world.state.ringsHit}/${world.state.rings.length} · Time ${Math.floor(world.state.elapsed / 60)}:${String(Math.floor(world.state.elapsed % 60)).padStart(2, '0')} · Fuel ${Math.round(world.state.plane.fuel)}%`, `Best ${best}`], 'Press Space to fly again', '#4ade80');
    } else if (screen === SCREEN_OVER) {
      instruments.drawOverlayPanel('CRASHED', [world.state.crashReason || 'The valley wins this time.', `Score ${world.state.score} · Rings ${world.state.ringsHit}/${world.state.rings.length}`, `Best ${best}`], 'Press Space or R to try again');
    }
  }

  // Leaving the tab pauses a running game rather than letting the plane fly on unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  // Gear: G lowers it on final approach; it is only a lamp and a reminder, landings do not need it.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyG' && !event.repeat) {
      world.state.plane.gearDown = !world.state.gearDown;
      announce(world.state.plane.gearDown ? 'Gear down.' : 'Gear up.');
    }
  });

  announce('Meridian Sky Courier II. Press Space or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
