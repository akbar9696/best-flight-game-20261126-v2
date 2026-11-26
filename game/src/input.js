// Keyboard and mouse input. Held keys and the pointer give steering; one-shot presses
// (start, pause, restart, mute, mission pick) are queued as bit flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice.
// Mouse: moving the pointer left/right banks, up/down pitches, wheel sets throttle.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;
export const ACTION_MISSION_1 = 16;
export const ACTION_MISSION_2 = 32;
export const ACTION_MISSION_3 = 64;
export const ACTION_MISSION_4 = 128;

const BANK_LEFT = new Set(['ArrowLeft', 'KeyA']);
const BANK_RIGHT = new Set(['ArrowRight', 'KeyD']);
const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESTART = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);
const MISSION_KEYS = {
  Digit1: ACTION_MISSION_1,
  Digit2: ACTION_MISSION_2,
  Digit3: ACTION_MISSION_3,
  Digit4: ACTION_MISSION_4,
};

export function createInput(target) {
  const keys = new Set();
  let actions = 0;
  // Pointer steering, -1..1 each way; 0 and centred when the pointer never moved.
  let mouseBank = 0;
  let mousePitch = 0;
  let mouseActive = false;
  let wheelDelta = 0;

  window.addEventListener('keydown', (event) => {
    if (BANK_LEFT.has(event.code) || BANK_RIGHT.has(event.code) || PITCH_UP.has(event.code)
      || PITCH_DOWN.has(event.code) || THROTTLE_UP.has(event.code) || THROTTLE_DOWN.has(event.code)) {
      keys.add(event.code);
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (MISSION_KEYS[event.code] !== undefined) {
      if (!event.repeat) actions |= MISSION_KEYS[event.code];
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    mouseActive = false;
  });
  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width - 0.5;
    const ny = (event.clientY - rect.top) / rect.height - 0.5;
    mouseBank = Math.max(-1, Math.min(1, nx * 2.4));
    mousePitch = Math.max(-1, Math.min(1, ny * 2.4));
    mouseActive = true;
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('wheel', (event) => {
    wheelDelta += event.deltaY < 0 ? 1 : -1;
    event.preventDefault();
  }, { passive: false });

  function hasAny(set) {
    for (const code of set) if (keys.has(code)) return true;
    return false;
  }

  return {
    /** Steering in -1..1: keys win over the mouse when both are held. */
    steer() {
      let bank = 0;
      let pitch = 0;
      if (hasAny(BANK_LEFT)) bank -= 1;
      if (hasAny(BANK_RIGHT)) bank += 1;
      if (hasAny(PITCH_UP)) pitch -= 1;
      if (hasAny(PITCH_DOWN)) pitch += 1;
      if (bank === 0 && pitch === 0 && mouseActive) {
        bank = mouseBank;
        pitch = mousePitch;
      }
      let throttle = 0;
      if (hasAny(THROTTLE_UP)) throttle += 1;
      if (hasAny(THROTTLE_DOWN)) throttle -= 1;
      return { bank, pitch, throttle };
    },
    /** Whole wheel steps since the last call: +1 is throttle up. */
    takeWheel() {
      const taken = wheelDelta;
      wheelDelta = 0;
      return taken;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
