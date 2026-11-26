// The HUD: lit instruments in DOM (crisp at any size) plus two small
// canvases — the attitude indicator and the compass tape — drawn each frame.
import { hudNumbers } from './aircraft.js';
import { nextRingDistance, objectiveLine } from './missions.js';
import { FUEL } from './config.js';

/** Draw the artificial horizon: sky above, ground below, banked with the plane. */
export function drawAttitude(canvas, plane) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = w / 2 - 4;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  // Roll the whole world by the bank, then shift it by the pitch.
  ctx.translate(cx, cy);
  ctx.rotate(-plane.bank);
  const pitchPx = plane.pitch * 90;
  ctx.translate(0, pitchPx);
  ctx.fillStyle = '#3f7fd0';
  ctx.fillRect(-r - 10, -r - 10 - pitchPx, (r + 10) * 2, r + 10 + pitchPx);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(-r - 10, 0, (r + 10) * 2, r + 10);
  // Horizon line.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r - 10, 0);
  ctx.lineTo(r + 10, 0);
  ctx.stroke();
  // Pitch ladder.
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  for (const deg of [-20, -10, 10, 20]) {
    const y = -Math.tan((deg * Math.PI) / 180) * 90;
    ctx.beginPath();
    ctx.moveTo(cx - 22 - cx, y);
    ctx.lineTo(cx + 22 - cx, y);
    ctx.stroke();
  }
  ctx.restore();
  // Fixed aircraft symbol: wings and nose dot, always level with the screen.
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 30, cy);
  ctx.lineTo(cx + 30, cy);
  ctx.moveTo(cx, cy - 4);
  ctx.lineTo(cx, cy + 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** Draw the compass tape: ticks every 10 degrees, labels every 30. */
export function drawCompass(canvas, headingDeg) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(8, 14, 24, 0.72)';
  ctx.fillRect(0, 0, w, h);
  const pxPerDeg = 3;
  const centre = w / 2;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let d = -50; d <= 50; d += 10) {
    let deg = Math.round(headingDeg + d);
    deg = ((deg % 360) + 360) % 360;
    const x = centre + d * pxPerDeg;
    const major = deg % 30 === 0;
    ctx.strokeStyle = major ? '#ffffff' : 'rgba(255,255,255,0.45)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, major ? 4 : 10);
    ctx.lineTo(x, 18);
    ctx.stroke();
    if (major) {
      const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg).padStart(3, '0');
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x, h - 4);
    }
  }
  // Centre caret and the digital heading.
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(centre - 7, 0);
  ctx.lineTo(centre + 7, 0);
  ctx.lineTo(centre, 8);
  ctx.closePath();
  ctx.fill();
}

/** Format seconds as M:SS. */
function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Update every HUD element from the current plane and mission.
 * `el` is the map of element handles built by main.js.
 */
export function updateHud(el, plane, mission, now) {
  const n = hudNumbers(plane);
  el.airspeed.textContent = String(n.knots);
  el.altitude.textContent = String(n.feet);
  el.vspeed.textContent = `${n.vspeed >= 0 ? '+' : ''}${n.vspeed}`;
  el.heading.textContent = String(n.headingDeg).padStart(3, '0');
  drawCompass(el.compass, n.headingDeg);
  drawAttitude(el.attitude, plane);

  el.throttleFill.style.width = `${Math.round(plane.throttle * 100)}%`;
  const fuelPct = Math.round((mission.fuel / FUEL.capacity) * 100);
  el.fuelFill.style.width = `${fuelPct}%`;
  el.fuelFill.classList.toggle('low', fuelPct < FUEL.lowWarning);
  el.fuelText.textContent = `${fuelPct}%`;
  el.gear.textContent = plane.gearDown ? 'GEAR DOWN' : 'GEAR UP';
  el.gear.classList.toggle('warn', !plane.gearDown && plane.onGround);
  el.flaps.textContent = plane.flaps ? 'FLAPS' : '';

  el.score.textContent = String(mission.score);
  el.timer.textContent = mission.timeLimit > 0 ? fmtTime(mission.timeLeft) : '—';
  el.timer.classList.toggle('low', mission.timeLimit > 0 && mission.timeLeft < 30);
  el.objective.textContent = objectiveLine(mission);

  if (mission.id === 'rings' && mission.nextRing < mission.rings.length) {
    const d = Math.round(nextRingDistance(plane, mission));
    el.ringDist.textContent = `NEXT RING ${d}m`;
  } else {
    el.ringDist.textContent = '';
  }

  // Warnings: stall, low fuel, gear.
  const warnings = [];
  if (!plane.onGround && plane.speed < 30) warnings.push('STALL — NOSE DOWN, THROTTLE UP');
  if (fuelPct < FUEL.lowWarning) warnings.push('LOW FUEL');
  if (!plane.gearDown && plane.y < 60 && !plane.onGround) warnings.push('GEAR UP — LOW');
  el.warn.textContent = warnings.join('  ·  ');
  el.warn.style.display = warnings.length ? 'block' : 'none';

  // Transient centre message.
  if (mission.message && now < mission.messageUntil) {
    el.message.textContent = mission.message;
    el.message.style.display = 'block';
  } else {
    el.message.style.display = 'none';
  }
}
