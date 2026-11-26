// The cockpit: the lit instrument panel, the top HUD with altitude, speed and heading,
// the mission line, the combo badge, the wind readout, warning lamps and the title /
// pause / end screens. Everything here is drawn, so a screenshot always shows the
// instruments the brief asks for.

import { FIELD, FONT, MISSIONS, MONO, PALETTE, RUNWAY } from './config.js';

const PANEL_TOP = 566;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createInstruments(canvas) {
  const context = canvas.getContext('2d');
  const fonts = new Map();

  function text(value, x, y, size, color, align, font) {
    const key = `${size}:${font || FONT}`;
    if (!fonts.has(key)) fonts.set(key, `${size}px ${font || FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  function lamp(x, y, label, on, color) {
    context.fillStyle = on ? color : '#2a313c';
    context.shadowColor = on ? color : 'transparent';
    context.shadowBlur = on ? 12 : 0;
    context.beginPath();
    context.arc(x, y, 9, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    text(label, x, y + 26, 11, on ? color : PALETTE.muted, 'center');
  }

  function gaugeFrame(x, y, radius, label) {
    context.fillStyle = '#0d1117';
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#3a4552';
    context.lineWidth = 2;
    context.stroke();
    text(label, x, y + radius + 16, 12, PALETTE.muted, 'center');
  }

  /** The artificial horizon: sky and ground split, rolling with the bank, sliding with pitch. */
  function drawAttitude(state, x, y, radius) {
    const plane = state.plane;
    gaugeFrame(x, y, radius, 'ATTITUDE');
    context.save();
    context.beginPath();
    context.arc(x, y, radius - 3, 0, Math.PI * 2);
    context.clip();
    context.translate(x, y);
    context.rotate((-plane.bank * Math.PI) / 180);
    context.translate(0, plane.pitch * 2.2);
    context.fillStyle = '#5aa9e6';
    context.fillRect(-radius, -radius, radius * 2, radius);
    context.fillStyle = '#8a5a2e';
    context.fillRect(-radius, 0, radius * 2, radius);
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-radius, 0);
    context.lineTo(radius, 0);
    context.stroke();
    context.restore();
    context.save();
    context.beginPath();
    context.arc(x, y, radius - 3, 0, Math.PI * 2);
    context.clip();
    context.strokeStyle = '#ffb454';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(x - 22, y);
    context.lineTo(x - 6, y);
    context.moveTo(x + 6, y);
    context.lineTo(x + 22, y);
    context.stroke();
    context.fillStyle = '#ffb454';
    context.beginPath();
    context.arc(x, y, 3, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  /** A round dial with a needle: value mapped across a 270-degree sweep. */
  function drawDial(state, x, y, radius, label, value, min, max, unit) {
    gaugeFrame(x, y, radius, label);
    const frac = clamp((value - min) / (max - min), 0, 1);
    const angle = -Math.PI * 0.75 + frac * Math.PI * 1.5;
    context.strokeStyle = '#67e8f9';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(angle) * (radius - 12), y + Math.sin(angle) * (radius - 12));
    context.stroke();
    context.fillStyle = '#eef1f5';
    context.beginPath();
    context.arc(x, y, 4, 0, Math.PI * 2);
    context.fill();
    text(String(Math.round(value)), x, y + radius * 0.42, 20, '#eef1f5', 'center', MONO);
    text(unit, x, y + radius * 0.42 + 16, 10, PALETTE.muted, 'center');
  }

  /** The heading tape: compass ticks scrolling past a fixed centre marker. */
  function drawHeadingTape(state, cx, y, width) {
    const plane = state.plane;
    context.fillStyle = '#0d1117';
    context.fillRect(cx - width / 2, y, width, 34);
    context.strokeStyle = '#3a4552';
    context.strokeRect(cx - width / 2, y, width, 34);
    const points = ['N', '030', '060', 'E', '120', '150', 'S', '210', '240', 'W', '300', '330'];
    for (let i = 0; i < 12; i += 1) {
      const deg = i * 30;
      let rel = deg - plane.heading;
      while (rel > 180) rel -= 360;
      while (rel < -180) rel += 360;
      const px = cx + rel * 3.1;
      if (px < cx - width / 2 + 6 || px > cx + width / 2 - 6) continue;
      const major = deg % 90 === 0;
      context.strokeStyle = '#eef1f5';
      context.lineWidth = major ? 2 : 1;
      context.beginPath();
      context.moveTo(px, y + 6);
      context.lineTo(px, y + (major ? 18 : 12));
      context.stroke();
      text(points[i], px, y + 30, 12, major ? '#ffb454' : PALETTE.muted, 'center', MONO);
    }
    context.fillStyle = '#ffb454';
    context.beginPath();
    context.moveTo(cx, y - 2);
    context.lineTo(cx - 7, y - 12);
    context.lineTo(cx + 7, y - 12);
    context.closePath();
    context.fill();
    text('HDG', cx - width / 2 - 12, y + 22, 12, PALETTE.muted, 'right');
  }

  function drawFuelThrottle(state, x, y) {
    const plane = state.plane;
    text('FUEL', x, y, 12, PALETTE.muted, 'left');
    const barW = 150;
    context.fillStyle = '#0d1117';
    context.fillRect(x, y + 8, barW, 16);
    const fuelColor = plane.fuel < 20 ? PALETTE.red : plane.fuel < 45 ? PALETTE.amber : PALETTE.green;
    context.fillStyle = fuelColor;
    context.shadowColor = fuelColor;
    context.shadowBlur = 8;
    context.fillRect(x + 2, y + 10, (barW - 4) * (plane.fuel / 100), 12);
    context.shadowBlur = 0;
    text(`${Math.round(plane.fuel)}%`, x + barW + 10, y + 22, 16, fuelColor, 'left', MONO);
    text('THR', x, y + 46, 12, PALETTE.muted, 'left');
    context.fillStyle = '#0d1117';
    context.fillRect(x, y + 54, barW, 16);
    context.fillStyle = '#67e8f9';
    context.fillRect(x + 2, y + 56, (barW - 4) * plane.throttle, 12);
    text(`${Math.round(plane.throttle * 100)}%`, x + barW + 10, y + 68, 16, '#67e8f9', 'left', MONO);
  }

  /** The top HUD: big ALT / SPD / HDG readouts, mission line, score, combo and timer. */
  function drawHud(state, speedKts, altitudeFt, headingDeg, windKts, timeMs) {
    context.textBaseline = 'alphabetic';
    // Top bar.
    context.fillStyle = 'rgba(10,14,20,0.72)';
    context.fillRect(0, 0, FIELD.width, 58);
    context.fillStyle = '#2a3442';
    context.fillRect(0, 58, FIELD.width, 2);
    text('MERIDIAN SKY COURIER II', 20, 24, 16, PALETTE.amber, 'left');
    text(state.mission.name.toUpperCase(), 20, 46, 12, PALETTE.muted, 'left');
    // Centre: the three numbers the brief asks for, lit and large.
    const cx = FIELD.width / 2;
    text('ALT', cx - 190, 22, 12, PALETTE.muted, 'center');
    text(`${altitudeFt}`, cx - 190, 48, 26, '#eef1f5', 'center', MONO);
    text('FT', cx - 118, 48, 12, PALETTE.muted, 'left');
    text('SPD', cx, 22, 12, PALETTE.muted, 'center');
    text(`${speedKts}`, cx, 48, 26, '#eef1f5', 'center', MONO);
    text('KT', cx + 62, 48, 12, PALETTE.muted, 'left');
    text('HDG', cx + 190, 22, 12, PALETTE.muted, 'center');
    const hdg = String(headingDeg).padStart(3, '0');
    text(`${hdg}°`, cx + 190, 48, 26, '#eef1f5', 'center', MONO);
    // Right: score, rings, clock — and the combo badge when a streak is hot.
    text('SCORE', FIELD.width - 210, 22, 12, PALETTE.muted, 'center');
    text(`${state.score}`, FIELD.width - 210, 48, 26, '#ffb454', 'center', MONO);
    text(`RINGS ${state.ringsHit}/${state.rings.length}`, FIELD.width - 20, 24, 15, '#67e8f9', 'right', MONO);
    const totalSeconds = Math.floor(state.elapsed);
    const clock = `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
    text(clock, FIELD.width - 20, 46, 14, PALETTE.muted, 'right', MONO);
    if (state.combo > 1) {
      const pulse = 0.75 + 0.25 * Math.sin(timeMs / 200);
      context.save();
      context.globalAlpha = pulse;
      context.fillStyle = '#ffb454';
      context.fillRect(FIELD.width - 330, 64, 108, 26);
      context.restore();
      text(`COMBO x${state.combo}`, FIELD.width - 276, 82, 15, '#141a22', 'center', MONO);
    }
    // Wind readout under the top bar, with a gust arrow.
    if (state.mission.wind > 0) {
      const gust = state.windGust >= 0 ? '→' : '←';
      text(`WIND ${gust} ${windKts} KT`, 20, 82, 14, '#67e8f9', 'left', MONO);
    }
    // Centre message toast.
    if (state.message && state.elapsed < state.messageUntil) {
      const alpha = clamp((state.messageUntil - state.elapsed) / 0.6, 0, 1);
      context.save();
      context.globalAlpha = alpha;
      const width = context.measureText(state.message).width + 44;
      context.fillStyle = 'rgba(10,14,20,0.8)';
      context.fillRect(FIELD.width / 2 - width / 2, 76, width, 34);
      text(state.message, FIELD.width / 2, 99, 17, '#ffb454', 'center');
      context.restore();
    }
    // Low-altitude warning, flashing — but never on a lined-up final approach.
    const onFinal = Math.abs(state.plane.x - RUNWAY.x) < 200
      && state.plane.z > RUNWAY.z - 2600 && state.plane.z < RUNWAY.z + 100;
    if (!onFinal && state.plane.alt < 165 && Math.floor(timeMs / 350) % 2 === 0) {
      text('PULL UP', FIELD.width / 2, 150, 30, PALETTE.red, 'center', MONO);
    }
  }

  /** The lit instrument panel across the bottom of the screen. */
  function drawPanel(state, speedKts, altitudeFt, headingDeg) {
    const plane = state.plane;
    context.fillStyle = PALETTE.panel;
    context.fillRect(0, PANEL_TOP, FIELD.width, FIELD.height - PANEL_TOP);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(0, PANEL_TOP, FIELD.width, 3);
    // Rivets along the panel edge.
    context.fillStyle = '#3a4552';
    for (let x = 16; x < FIELD.width; x += 64) {
      context.beginPath();
      context.arc(x, PANEL_TOP + 12, 2.5, 0, Math.PI * 2);
      context.fill();
    }
    drawAttitude(state, 96, PANEL_TOP + 68, 48);
    drawDial(state, 232, PANEL_TOP + 68, 48, 'AIRSPEED', speedKts, 0, 220, 'KT');
    drawDial(state, 368, PANEL_TOP + 68, 48, 'ALTITUDE', altitudeFt, 0, 3000, 'FT');
    drawHeadingTape(state, 640, PANEL_TOP + 30, 340);
    text(`V/S ${plane.verticalSpeed >= 0 ? '+' : ''}${Math.round(plane.verticalSpeed * 196.85)} FT/MIN`, 640, PANEL_TOP + 100, 14, '#eef1f5', 'center', MONO);
    text('GEAR DOWN FOR LANDING — press G on final', 640, PANEL_TOP + 124, 12, PALETTE.muted, 'center');
    drawFuelThrottle(state, 880, PANEL_TOP + 26);
    const stalled = speedKts < 58;
    lamp(1090, PANEL_TOP + 44, 'STALL', stalled, PALETTE.red);
    lamp(1150, PANEL_TOP + 44, 'LOW FUEL', plane.fuel < 20, PALETTE.amber);
    lamp(1210, PANEL_TOP + 44, 'GEAR', plane.gearDown, PALETTE.green);
    text('M-27 · MERIDIAN AIR COURIER', 1090, PANEL_TOP + 118, 11, PALETTE.muted, 'left');
  }

  function drawOverlayPanel(title, lines, prompt, accent) {
    context.fillStyle = 'rgba(8,11,16,0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    const width = 640;
    const height = 150 + lines.length * 34;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = '#161d27';
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent || PALETTE.amber;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    text(title, FIELD.width / 2, y + 64, 42, accent || PALETTE.amber, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 116 + i * 34, 19, PALETTE.text, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 30, 18, PALETTE.cyan, 'center');
  }

  function drawTitle(state, best) {
    // A dark band behind the header so the title stays readable over the live scene.
    context.fillStyle = 'rgba(8,11,16,0.78)';
    context.fillRect(0, 96, FIELD.width, 262);
    // Mission cards: four across now, Storm Courier included.
    const cardW = 272;
    const gap = 16;
    const y = 420;
    const totalW = cardW * 4 + gap * 3;
    for (let i = 0; i < MISSIONS.length; i += 1) {
      const mission = MISSIONS[i];
      const x = (FIELD.width - totalW) / 2 + i * (cardW + gap);
      const selected = state.missionIndex === i;
      context.fillStyle = selected ? '#1d2a3a' : '#141a22';
      context.fillRect(x, y, cardW, 150);
      context.strokeStyle = selected ? PALETTE.amber : '#2a3442';
      context.lineWidth = selected ? 3 : 1;
      context.strokeRect(x, y, cardW, 150);
      text(`${i + 1} · ${mission.name.toUpperCase()}`, x + 14, y + 32, 17, selected ? PALETTE.amber : PALETTE.text, 'left');
      const words = mission.blurb.split(' ');
      let line = '';
      let ly = y + 58;
      for (const word of words) {
        if ((line + word).length > 32) {
          text(line, x + 14, ly, 13, PALETTE.muted, 'left');
          line = '';
          ly += 19;
        }
        line += `${word} `;
      }
      text(line, x + 14, ly, 13, PALETTE.muted, 'left');
      text(`${mission.rings} rings · ${mission.fuel}% fuel`, x + 14, y + 132, 12, '#67e8f9', 'left', MONO);
    }
    text('MERIDIAN SKY COURIER II', FIELD.width / 2, 150, 54, '#ffffff', 'center');
    text('Four missions, ring combos, a storm run. Thread the rings. Land on Strip 27.', FIELD.width / 2, 196, 20, PALETTE.amber, 'center');
    text('Steer with ← → ↑ ↓ or the mouse · Shift / Ctrl or wheel: throttle · G: gear · P: pause · M: sound', FIELD.width / 2, 250, 16, PALETTE.text, 'center');
    text('Click a mission card or press 1 / 2 / 3 / 4, then Space to fly', FIELD.width / 2, 282, 16, PALETTE.cyan, 'center');
    if (best > 0) text(`Best score ${best}`, FIELD.width / 2, 330, 18, '#ffb454', 'center', MONO);
  }

  return { drawHud, drawPanel, drawOverlayPanel, drawTitle };
}
