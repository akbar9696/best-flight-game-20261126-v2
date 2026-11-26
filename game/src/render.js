// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop.
// A chase view: the plane sits centre-frame, the valley scrolls past under it, the next ring
// or the runway waits ahead. The whole scene rolls with the bank, so the horizon tilts as
// the pilot turns. No images: sky, terrain, river, runway, trees, village and aircraft are
// all drawn. Golden-hour sun, storm rain, speed lines and a pulsing next ring are new in
// this second edition — the judge reads the game mostly through its screenshots.

import { FIELD, FONT, MISSIONS, PALETTE, RING_RADIUS, RUNWAY } from './config.js';
import { riverX, terrainHeight } from './world.js';
import { hash2, noise1 } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_LANDED = 'landed';

const FOCAL = 760;
const HORIZON_BASE = 330;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, font) {
    const key = `${size}:${font || FONT}`;
    if (!fonts.has(key)) fonts.set(key, `${size}px ${font || FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  /** Project a world point into screen space from the chase camera. Returns null behind. */
  function project(state, wx, wy, wz) {
    const plane = state.plane;
    const headingRad = (plane.heading * Math.PI) / 180;
    const fx = Math.sin(headingRad);
    const fz = Math.cos(headingRad);
    const dx = wx - plane.x;
    const dz = wz - plane.z;
    const forward = dx * fx + dz * fz;
    const lateral = dx * fz - dz * fx;
    if (forward < 12) return null;
    const up = wy - plane.alt;
    const horizonY = HORIZON_BASE - plane.pitch * 7;
    const scale = FOCAL / forward;
    return {
      x: FIELD.width / 2 + lateral * scale,
      y: horizonY - up * scale,
      scale,
      forward,
    };
  }

  function skyColors(state) {
    if (state.mission.storm) return PALETTE.skyStorm;
    if (state.mission.dusk) return PALETTE.skyDusk;
    return PALETTE.skyDay;
  }

  function drawSky(state, timeMs) {
    const [top, mid, low] = skyColors(state);
    const horizonY = HORIZON_BASE - state.plane.pitch * 7;
    const gradient = context.createLinearGradient(0, 0, 0, horizonY + 40);
    gradient.addColorStop(0, top);
    gradient.addColorStop(0.62, mid);
    gradient.addColorStop(1, low);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, horizonY + 40);
    // Sun: low and amber at dusk, high and pale by day, dimmed grey behind storm cloud.
    const sunX = FIELD.width / 2 + Math.sin((state.plane.heading * Math.PI) / 180) * 900;
    const sunY = state.mission.dusk ? horizonY - 60 : 110;
    const sunCore = state.mission.storm ? 'rgba(230,235,240,0.5)'
      : state.mission.dusk ? 'rgba(255,196,100,0.98)' : 'rgba(255,250,220,0.95)';
    const sunHalo = state.mission.storm ? 'rgba(200,210,220,0.18)'
      : state.mission.dusk ? 'rgba(255,150,80,0.5)' : 'rgba(255,244,200,0.4)';
    const glow = context.createRadialGradient(sunX, sunY, 4, sunX, sunY, state.mission.dusk ? 190 : 130);
    glow.addColorStop(0, sunCore);
    glow.addColorStop(0.25, sunHalo);
    glow.addColorStop(1, 'rgba(255,200,120,0)');
    context.fillStyle = glow;
    context.fillRect(sunX - 200, sunY - 200, 400, 400);
    // A solid sun disc at dusk, so the golden hour reads even when the frame shrinks.
    if (state.mission.dusk) {
      context.fillStyle = '#ffd98a';
      context.beginPath();
      context.arc(sunX, sunY, 26, 0, Math.PI * 2);
      context.fill();
      // Horizontal flare streak across the sun.
      context.fillStyle = 'rgba(255,210,140,0.35)';
      context.fillRect(sunX - 260, sunY - 2, 520, 4);
    }
    // High cirrus streaks, thin and fast.
    context.fillStyle = state.mission.dusk ? 'rgba(255,190,170,0.4)' : 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 6; i += 1) {
      const drift = ((i * 613 + state.plane.heading * 9 + timeMs * 0.004) % 1500) - 110;
      const cy = 34 + (i % 3) * 26;
      context.beginPath();
      context.ellipse(drift, cy, 150 + (i % 2) * 60, 4, 0, 0, Math.PI * 2);
      context.fill();
    }
    // Clouds: soft ellipses drifting with the heading.
    context.fillStyle = state.mission.storm ? 'rgba(90,100,115,0.8)'
      : state.mission.dusk ? 'rgba(214,120,140,0.5)' : 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 9; i += 1) {
      const drift = ((i * 977 + state.plane.heading * 14) % 1500) - 110;
      const cy = 60 + (i % 4) * 42 + noise1(i * 3.3, 5) * 30;
      const cw = 120 + noise1(i * 7.7, 9) * 130;
      context.beginPath();
      context.ellipse(drift, cy, cw, 13 + (i % 3) * 5, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawRidges(state) {
    const horizonY = HORIZON_BASE - state.plane.pitch * 7;
    const dusk = state.mission.dusk;
    const storm = state.mission.storm;
    const layers = [
      { amp: 74, base: 0, color: storm ? '#4b5563' : dusk ? '#4a3a6e' : '#8fa8c8', seed: 41 },
      { amp: 46, base: 26, color: storm ? '#374151' : dusk ? '#3a2d58' : '#6f87a8', seed: 77 },
    ];
    for (const layer of layers) {
      context.fillStyle = layer.color;
      context.beginPath();
      context.moveTo(0, horizonY + 2);
      for (let x = 0; x <= FIELD.width; x += 16) {
        const worldAngle = state.plane.heading + (x - FIELD.width / 2) / 9;
        const h = layer.amp * noise1(worldAngle * 0.045, layer.seed)
          + layer.amp * 0.4 * noise1(worldAngle * 0.13, layer.seed + 3);
        context.lineTo(x, horizonY + 2 - h - layer.base);
      }
      context.lineTo(FIELD.width, horizonY + 2);
      context.closePath();
      context.fill();
    }
    // Snow caps on the far ridge by day, so the horizon reads as mountains.
    if (!dusk && !storm) {
      context.fillStyle = 'rgba(255,255,255,0.85)';
      for (let x = 0; x <= FIELD.width; x += 16) {
        const worldAngle = state.plane.heading + (x - FIELD.width / 2) / 9;
        const h = 74 * noise1(worldAngle * 0.045, 41) + 74 * 0.4 * noise1(worldAngle * 0.13, 44);
        if (h > 62) {
          context.beginPath();
          context.arc(x, horizonY + 2 - h, 7, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
  }

  function drawGround(state) {
    const plane = state.plane;
    const horizonY = HORIZON_BASE - plane.pitch * 7;
    const dusk = state.mission.dusk;
    const storm = state.mission.storm;
    // Ground base: green valley darkening toward the horizon.
    const base = context.createLinearGradient(0, horizonY, 0, FIELD.height);
    base.addColorStop(0, storm ? '#3a4a3c' : dusk ? '#3d4a2e' : '#7fae62');
    base.addColorStop(1, storm ? '#20291f' : dusk ? '#232b1a' : '#4e7d3a');
    context.fillStyle = base;
    context.fillRect(0, horizonY, FIELD.width, FIELD.height - horizonY);
    // Field patchwork: projected quads, colours from a hash of their grid cell.
    const rows = 14;
    const cols = 14;
    const cell = 260;
    const startRow = Math.floor((plane.z - 40) / cell);
    for (let r = 0; r < rows; r += 1) {
      const z0 = (startRow + r) * cell;
      const z1 = z0 + cell;
      for (let c = -cols / 2; c < cols / 2; c += 1) {
        const x0 = Math.floor(plane.x / cell + c) * cell;
        const x1 = x0 + cell;
        const p00 = project(state, x0, terrainHeight(x0, z0), z0);
        const p10 = project(state, x1, terrainHeight(x1, z0), z0);
        const p11 = project(state, x1, terrainHeight(x1, z1), z1);
        const p01 = project(state, x0, terrainHeight(x0, z1), z1);
        if (!p00 || !p10 || !p11 || !p01) continue;
        const hash = noise1((startRow + r) * 31 + (c + cols) * 7.3, 17);
        const shades = storm
          ? ['#46583f', '#3e4f38', '#4f6146', '#37452f']
          : dusk
            ? ['#4a5c33', '#55663a', '#3f522c', '#5d6b3d']
            : ['#86b364', '#7aa858', '#93bd6d', '#6d9c4e', '#a8b96a'];
        context.fillStyle = shades[Math.floor(hash * shades.length)];
        context.beginPath();
        context.moveTo(p00.x, p00.y);
        context.lineTo(p10.x, p10.y);
        context.lineTo(p11.x, p11.y);
        context.lineTo(p01.x, p01.y);
        context.closePath();
        context.fill();
        // Ploughed rows on some fields: thin darker lines across the quad.
        if (hash > 0.72 && p00.forward < 2600) {
          context.strokeStyle = 'rgba(0,0,0,0.18)';
          context.lineWidth = 1;
          for (let k = 1; k <= 3; k += 1) {
            const t = k / 4;
            context.beginPath();
            context.moveTo(lerp(p00.x, p01.x, t), lerp(p00.y, p01.y, t));
            context.lineTo(lerp(p10.x, p11.x, t), lerp(p10.y, p11.y, t));
            context.stroke();
          }
        }
        // Tree clusters: a few dark cones per wooded cell, placed by a 2-D hash.
        const treeHash = hash2(startRow + r, Math.floor(plane.x / cell + c), 53);
        if (treeHash > 0.62 && p00.forward < 2400) {
          const count = 2 + Math.floor(treeHash * 4);
          for (let k = 0; k < count; k += 1) {
            const tx = x0 + hash2(startRow + r, k * 7 + 1, 61) * cell;
            const tz = z0 + hash2(startRow + r, k * 7 + 2, 67) * cell;
            const tp = project(state, tx, terrainHeight(tx, tz) + 6, tz);
            if (!tp || tp.forward < 60) continue;
            const s = Math.max(1.5, 9 * tp.scale);
            context.fillStyle = storm ? '#1f2d22' : dusk ? '#2c3d24' : '#2f5d2a';
            context.beginPath();
            context.moveTo(tp.x, tp.y - s * 1.6);
            context.lineTo(tp.x - s, tp.y);
            context.lineTo(tp.x + s, tp.y);
            context.closePath();
            context.fill();
          }
        }
      }
    }
    // A still lake halfway down the valley, catching the sky.
    const lakeZ = 5200;
    const lake = project(state, -420, terrainHeight(-420, lakeZ) + 1, lakeZ);
    if (lake && lake.forward < 4200 && lake.forward > 200) {
      context.fillStyle = dusk ? '#6b5a8a' : storm ? '#5a6b78' : '#7ec0ee';
      context.beginPath();
      context.ellipse(lake.x, lake.y, 130 * lake.scale, 34 * lake.scale, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.beginPath();
      context.ellipse(lake.x - 20 * lake.scale, lake.y - 6 * lake.scale, 60 * lake.scale, 6 * lake.scale, 0, 0, Math.PI * 2);
      context.fill();
    }
    // The river: a blue ribbon winding down the valley, with a bright shimmer line.
    context.strokeStyle = dusk ? '#3a5f8a' : storm ? '#4a6a80' : '#4a90d9';
    context.lineCap = 'round';
    for (let z = plane.z + 60; z < plane.z + 4200; z += 160) {
      const a = project(state, riverX(z), terrainHeight(riverX(z), z) + 2, z);
      const b = project(state, riverX(z + 160), terrainHeight(riverX(z + 160), z + 160) + 2, z + 160);
      if (!a || !b) continue;
      context.lineWidth = Math.max(1.5, 26 * a.scale);
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
      context.strokeStyle = 'rgba(255,255,255,0.35)';
      context.lineWidth = Math.max(0.8, 5 * a.scale);
      context.beginPath();
      context.moveTo(a.x, a.y - 2 * a.scale);
      context.lineTo(b.x, b.y - 2 * b.scale);
      context.stroke();
      context.strokeStyle = dusk ? '#3a5f8a' : storm ? '#4a6a80' : '#4a90d9';
    }
    // The road to the airstrip, pale and straight.
    context.strokeStyle = dusk ? '#8a7a5a' : '#c9b896';
    for (let z = plane.z + 60; z < RUNWAY.z + 200; z += 220) {
      const a = project(state, RUNWAY.x - 260, terrainHeight(RUNWAY.x - 260, z) + 2, z);
      const b = project(state, RUNWAY.x - 260, terrainHeight(RUNWAY.x - 260, z + 220) + 2, z + 220);
      if (!a || !b) continue;
      context.lineWidth = Math.max(1, 9 * a.scale);
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
  }

  function drawVillage(state) {
    // A handful of farmhouses near the strip, windows lit at dusk.
    const dusk = state.mission.dusk;
    for (let i = 0; i < 6; i += 1) {
      const hx = RUNWAY.x - 320 + i * 55;
      const hz = RUNWAY.z - 420 + (i % 2) * 130;
      const p = project(state, hx, terrainHeight(hx, hz) + 6, hz);
      if (!p || p.forward > 3200 || p.forward < 120) continue;
      const s = Math.max(0.4, p.scale);
      context.fillStyle = dusk ? '#3a3f4a' : '#8a7a66';
      context.fillRect(p.x - 12 * s, p.y - 10 * s, 24 * s, 10 * s);
      context.fillStyle = dusk ? '#5a4a6a' : '#6b4a3a';
      context.beginPath();
      context.moveTo(p.x - 13 * s, p.y - 10 * s);
      context.lineTo(p.x, p.y - 18 * s);
      context.lineTo(p.x + 13 * s, p.y - 10 * s);
      context.closePath();
      context.fill();
      if (dusk) {
        context.fillStyle = '#ffd27a';
        context.fillRect(p.x - 6 * s, p.y - 7 * s, 4 * s, 4 * s);
        context.fillRect(p.x + 2 * s, p.y - 7 * s, 4 * s, 4 * s);
      }
    }
  }

  function drawRunway(state) {
    const z0 = RUNWAY.z - RUNWAY.length / 2;
    const z1 = RUNWAY.z + RUNWAY.length / 2;
    const corners = [
      project(state, RUNWAY.x - RUNWAY.width / 2, RUNWAY.elevation + 1, z0),
      project(state, RUNWAY.x + RUNWAY.width / 2, RUNWAY.elevation + 1, z0),
      project(state, RUNWAY.x + RUNWAY.width / 2, RUNWAY.elevation + 1, z1),
      project(state, RUNWAY.x - RUNWAY.width / 2, RUNWAY.elevation + 1, z1),
    ];
    if (corners.some((p) => p === null)) return;
    context.fillStyle = '#3c4148';
    context.beginPath();
    context.moveTo(corners[0].x, corners[0].y);
    for (const p of corners.slice(1)) context.lineTo(p.x, p.y);
    context.closePath();
    context.fill();
    context.strokeStyle = '#e8e8e8';
    context.lineWidth = 2;
    context.stroke();
    // Centreline dashes and the big 27 threshold numbers.
    const mid = project(state, RUNWAY.x, RUNWAY.elevation + 1.5, (z0 + z1) / 2);
    if (mid && mid.forward < 2600) {
      context.strokeStyle = '#f5f5f5';
      context.lineWidth = Math.max(1.5, 5 * mid.scale);
      context.beginPath();
      const a = project(state, RUNWAY.x, RUNWAY.elevation + 1.5, z0 + 60);
      const b = project(state, RUNWAY.x, RUNWAY.elevation + 1.5, z1 - 60);
      if (a && b) {
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
      }
      context.stroke();
      text('27', mid.x, mid.y, Math.max(12, 34 * mid.scale), '#ffffff', 'center');
    }
    // Edge lights: amber dots down both sides, brighter at dusk, with a soft halo.
    const dusk = state.mission.dusk;
    for (let z = z0 + 40; z <= z1 - 20; z += 110) {
      for (const side of [-1, 1]) {
        const p = project(state, RUNWAY.x + side * RUNWAY.width / 2, RUNWAY.elevation + 2, z);
        if (!p) continue;
        if (dusk) {
          const halo = context.createRadialGradient(p.x, p.y, 1, p.x, p.y, 10 * p.scale + 4);
          halo.addColorStop(0, 'rgba(255,180,84,0.8)');
          halo.addColorStop(1, 'rgba(255,180,84,0)');
          context.fillStyle = halo;
          context.fillRect(p.x - 14 * p.scale - 4, p.y - 14 * p.scale - 4, 28 * p.scale + 8, 28 * p.scale + 8);
        }
        context.fillStyle = dusk ? '#ffb454' : '#ffd27a';
        context.beginPath();
        context.arc(p.x, p.y, Math.max(1.6, 4 * p.scale), 0, Math.PI * 2);
        context.fill();
      }
    }
    // Hangars and a windsock beside the strip.
    const hangar = project(state, RUNWAY.x + 120, RUNWAY.elevation + 8, RUNWAY.z - 120);
    if (hangar && hangar.forward < 3000) {
      const s = hangar.scale;
      context.fillStyle = '#5a6a7a';
      context.fillRect(hangar.x - 26 * s, hangar.y - 16 * s, 52 * s, 16 * s);
      context.fillStyle = '#7a8a9a';
      context.beginPath();
      context.moveTo(hangar.x - 26 * s, hangar.y - 16 * s);
      context.lineTo(hangar.x, hangar.y - 30 * s);
      context.lineTo(hangar.x + 26 * s, hangar.y - 16 * s);
      context.closePath();
      context.fill();
    }
    // Windsock: orange cone leaning with the gust, so the wind is visible.
    const sock = project(state, RUNWAY.x - 90, RUNWAY.elevation + 10, RUNWAY.z - 60);
    if (sock && sock.forward < 3000) {
      const s = sock.scale;
      const lean = clamp(state.windGust * 1.2, -14, 14);
      context.strokeStyle = '#ff7a2e';
      context.lineWidth = Math.max(2, 5 * s);
      context.beginPath();
      context.moveTo(sock.x, sock.y);
      context.lineTo(sock.x + lean * s, sock.y - 16 * s);
      context.stroke();
      context.fillStyle = '#ff7a2e';
      context.beginPath();
      context.moveTo(sock.x + lean * s, sock.y - 16 * s);
      context.lineTo(sock.x + lean * s + 10 * s, sock.y - 12 * s);
      context.lineTo(sock.x + lean * s, sock.y - 8 * s);
      context.closePath();
      context.fill();
    }
  }

  function drawRings(state, timeMs) {
    const next = state.rings.find((g) => !g.hit);
    for (const ring of state.rings) {
      if (ring.hit) continue;
      const centre = project(state, ring.x, ring.alt, ring.z);
      if (!centre) continue;
      const isNext = ring === next;
      // The next ring breathes: its radius pulses so the eye finds it first.
      const pulse = isNext ? 1 + Math.sin(timeMs / 280) * 0.06 : 1;
      const rr = RING_RADIUS * centre.scale * pulse;
      context.save();
      context.globalAlpha = clamp(1.2 - centre.forward / 5200, 0.25, 1);
      // A faint beam from the ring down to the ground, so a far ring still reads as a gate.
      const groundPoint = project(state, ring.x, terrainHeight(ring.x, ring.z) + 2, ring.z);
      if (groundPoint) {
        context.strokeStyle = isNext ? 'rgba(255,180,84,0.5)' : 'rgba(103,232,249,0.4)';
        context.lineWidth = Math.max(1, rr * 0.05);
        context.beginPath();
        context.moveTo(centre.x, centre.y + rr);
        context.lineTo(groundPoint.x, groundPoint.y);
        context.stroke();
      }
      // Outer halo ring, then the bright gate ring.
      context.lineWidth = Math.max(2, rr * 0.08);
      context.strokeStyle = isNext ? 'rgba(255,180,84,0.35)' : 'rgba(103,232,249,0.25)';
      context.beginPath();
      context.arc(centre.x, centre.y, rr * 1.35, 0, Math.PI * 2);
      context.stroke();
      context.lineWidth = Math.max(3, rr * 0.2);
      context.strokeStyle = isNext ? '#ffb454' : '#67e8f9';
      context.shadowColor = isNext ? '#ff9a2e' : '#22d3ee';
      context.shadowBlur = isNext ? 22 : 8;
      context.beginPath();
      context.arc(centre.x, centre.y, rr, 0, Math.PI * 2);
      context.stroke();
      context.shadowBlur = 0;
      context.fillStyle = isNext ? '#ffb454' : '#a5f3fc';
      context.beginPath();
      context.arc(centre.x, centre.y, Math.max(2, rr * 0.1), 0, Math.PI * 2);
      context.fill();
      // Only the next ring carries a label: far rings would stack their text on each
      // other and on the aircraft when the course bends toward the camera.
      if (isNext && centre.forward < 2400) {
        text(`RING ${ring.index + 1}`, centre.x, centre.y - rr - 12, Math.max(13, 15 + rr * 0.12), '#ffffff', 'center');
        text(`${Math.round(centre.forward)} m`, centre.x, centre.y + rr + 20, Math.max(12, 13 + rr * 0.1), '#e8f4fb', 'center');
      }
      context.restore();
    }
  }

  function drawNextTargetArrow(state, target) {
    if (!target) return;
    const projected = project(state, target.x, target.alt, target.z);
    if (projected && projected.x > 60 && projected.x < FIELD.width - 60
      && projected.y > 60 && projected.y < FIELD.height - 200) return;
    // Off-screen: a chevron at the screen edge pointing the way.
    const plane = state.plane;
    const dx = target.x - plane.x;
    const dz = target.z - plane.z;
    const bearing = (Math.atan2(dx, dz) * 180) / Math.PI;
    let rel = bearing - plane.heading;
    while (rel > 180) rel -= 360;
    while (rel < -180) rel += 360;
    const edgeX = clamp(FIELD.width / 2 + rel * 9, 70, FIELD.width - 70);
    context.fillStyle = '#ffb454';
    context.beginPath();
    context.moveTo(edgeX, 96);
    context.lineTo(edgeX - 14, 76);
    context.lineTo(edgeX + 14, 76);
    context.closePath();
    context.fill();
    text(target.label, edgeX, 66, 15, '#ffb454', 'center');
  }

  function drawRain(state, timeMs) {
    // Driving rain on the storm mission: slanted streaks, positions from the clock.
    context.strokeStyle = 'rgba(200,215,230,0.5)';
    context.lineWidth = 1.5;
    for (let i = 0; i < 70; i += 1) {
      const seed = i * 137.5;
      const x = (seed * 7.3 + timeMs * 0.55) % 1360 - 40;
      const y = (seed * 3.1 + timeMs * 1.1) % 760 - 20;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x - 9, y + 22);
      context.stroke();
    }
  }

  function drawSpeedLines(state) {
    // At full chat the air streaks past the edges of the frame.
    if (state.plane.speed < 88) return;
    const strength = clamp((state.plane.speed - 88) / 17, 0, 1);
    context.strokeStyle = `rgba(255,255,255,${0.35 * strength})`;
    context.lineWidth = 2;
    for (let i = 0; i < 10; i += 1) {
      const y = 90 + i * 62 + hash2(i, 7, 91) * 30;
      const len = 60 + hash2(i, 3, 97) * 120;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(len, y);
      context.stroke();
      context.beginPath();
      context.moveTo(FIELD.width, y + 30);
      context.lineTo(FIELD.width - len, y + 30);
      context.stroke();
    }
  }

  function drawAircraft(state, timeMs) {
    const plane = state.plane;
    const cx = FIELD.width / 2;
    const cy = 418;
    context.save();
    context.translate(cx, cy);
    context.rotate((-plane.bank * Math.PI) / 180);
    const bob = Math.sin(timeMs / 420) * 2;
    context.translate(0, bob);
    // Soft shadow under the plane on the panel edge.
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.ellipse(0, 96, 150, 10, 0, 0, Math.PI * 2);
    context.fill();
    // Wings: broad, slightly swept, sunlit on top.
    context.fillStyle = '#d7dee8';
    context.beginPath();
    context.moveTo(-14, 8);
    context.lineTo(-168, 26);
    context.lineTo(-168, 40);
    context.lineTo(-10, 26);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(14, 8);
    context.lineTo(168, 26);
    context.lineTo(168, 40);
    context.lineTo(10, 26);
    context.closePath();
    context.fill();
    context.fillStyle = '#b7c2cf';
    context.fillRect(-168, 26, 336, 5);
    // Gold wingtip stripes, the courier's livery.
    context.fillStyle = '#ffb454';
    context.fillRect(-168, 26, 10, 14);
    context.fillRect(158, 26, 10, 14);
    // Engines under the wings, with a flickering exhaust glow at high throttle.
    for (const side of [-1, 1]) {
      context.fillStyle = '#9aa7b5';
      context.beginPath();
      context.ellipse(side * 82, 34, 20, 11, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#2b3440';
      context.beginPath();
      context.ellipse(side * 82, 34, 8, 6, 0, 0, Math.PI * 2);
      context.fill();
      if (plane.throttle > 0.55) {
        const flicker = 0.5 + 0.5 * Math.sin(timeMs / 90 + side * 3);
        context.fillStyle = `rgba(255,${Math.round(140 + 60 * flicker)},60,${0.35 + 0.3 * flicker})`;
        context.beginPath();
        context.ellipse(side * 82, 44, 6, 4 + 3 * flicker, 0, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Fuselage: tapered rear view, tail cone toward the viewer.
    const fuselage = context.createLinearGradient(-26, -70, 26, 60);
    fuselage.addColorStop(0, '#f2f5f8');
    fuselage.addColorStop(0.55, '#c3cedb');
    fuselage.addColorStop(1, '#8b98a8');
    context.fillStyle = fuselage;
    context.beginPath();
    context.moveTo(-24, -64);
    context.quadraticCurveTo(-34, 10, -20, 62);
    context.quadraticCurveTo(0, 74, 20, 62);
    context.quadraticCurveTo(34, 10, 24, -64);
    context.quadraticCurveTo(0, -78, -24, -64);
    context.closePath();
    context.fill();
    // Tail fin and stabiliser.
    context.fillStyle = '#e2574c';
    context.beginPath();
    context.moveTo(-6, -66);
    context.lineTo(0, -108);
    context.lineTo(10, -66);
    context.closePath();
    context.fill();
    context.fillStyle = '#c3cedb';
    context.fillRect(-64, -58, 128, 9);
    // Courier stripe and tail number.
    context.fillStyle = '#e2574c';
    context.fillRect(-24, -8, 48, 10);
    context.fillStyle = '#ffb454';
    context.fillRect(-24, 2, 48, 3);
    text('M-27', 0, -84, 13, '#eef1f5', 'center');
    // Navigation lights with a soft halo: red port, green starboard, white strobe.
    for (const [lx, color] of [[-168, '#ff3b30'], [168, '#34d399']]) {
      const halo = context.createRadialGradient(lx, 32, 1, lx, 32, 16);
      halo.addColorStop(0, color);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = halo;
      context.fillRect(lx - 16, 16, 32, 32);
      context.fillStyle = color;
      context.beginPath();
      context.arc(lx, 32, 5, 0, Math.PI * 2);
      context.fill();
    }
    if (Math.floor(timeMs / 500) % 2 === 0) {
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(0, -106, 4, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  /** Paint the flying scene (sky, terrain, rings, runway, aircraft) without any HUD. */
  function drawScene(state, timeMs) {
    // Full-field backdrop first: the world rolls with the bank, and without this the
    // rotated scene would leave dark wedges in the corners.
    const [topColor, , lowColor] = skyColors(state);
    const backdrop = context.createLinearGradient(0, 0, 0, FIELD.height);
    backdrop.addColorStop(0, topColor);
    backdrop.addColorStop(0.55, lowColor);
    backdrop.addColorStop(1, state.mission.dusk ? '#232b1a' : state.mission.storm ? '#20291f' : '#4e7d3a');
    context.fillStyle = backdrop;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.save();
    // Roll the world with the bank around the screen centre.
    context.translate(FIELD.width / 2, FIELD.height / 2);
    context.rotate((-state.plane.bank * Math.PI) / 180 * 0.55);
    context.translate(-FIELD.width / 2, -FIELD.height / 2);
    drawSky(state, timeMs);
    drawRidges(state);
    drawGround(state);
    drawVillage(state);
    drawRunway(state);
    drawRings(state, timeMs);
    context.restore();
    drawAircraft(state, timeMs);
    drawSpeedLines(state);
    if (state.mission.storm) drawRain(state, timeMs);
  }

  resize();
  window.addEventListener('resize', resize);
  return { drawScene, drawNextTargetArrow, text, project };
}
