function createChaseFinale({ altitude = 9500, reducedMotion = false } = {}) {
  const startAltitude = Math.max(0, Number.isFinite(altitude) ? altitude : 9500);
  const diveDuration = reducedMotion ? 1.2 : 3.2;
  let elapsed = 0, landed = false, cancelled = false;
  function status() {
    let phase, progress, altitude = startAltitude;
    if (cancelled) return { phase: 'aborted', elapsed, altitude: startAltitude, progress: 0, landed, complete: false };
    if (elapsed < 0.6) { phase = 'overdrive'; progress = elapsed / 0.6; }
    else if (elapsed < 1.5) { phase = 'catching'; progress = (elapsed - 0.6) / 0.9; }
    else if (elapsed < 1.5 + diveDuration) {
      phase = 'plunging'; progress = (elapsed - 1.5) / diveDuration;
      const knots = [[0, 1], [0.28, 6000 / 9500], [0.6, 2500 / 9500], [0.86, 400 / 9500], [1, 0]];
      for (let i = 1; i < knots.length; i++) {
        if (progress <= knots[i][0]) {
          const t = (progress - knots[i - 1][0]) / (knots[i][0] - knots[i - 1][0]);
          altitude = startAltitude * (knots[i - 1][1] + (knots[i][1] - knots[i - 1][1]) * t);
          break;
        }
      }
    } else { phase = 'landing'; progress = Math.min(1, elapsed - 1.5 - diveDuration); altitude = 0; }
    return { phase, progress, altitude, elapsed, landed, complete: phase === 'landing' && progress >= 1 };
  }
  return {
    status,
    cancel() { if (!status().complete) cancelled = true; },
    update(dt) {
      if (cancelled || status().complete) return { ...status(), touchdown: false };
      elapsed += Math.max(0, Math.min(0.05, Number.isFinite(dt) ? dt : 0));
      const state = status();
      const touchdown = state.phase === 'landing' && !landed;
      if (touchdown) landed = true;
      return { ...state, landed, touchdown };
    }
  };
}

function drawChaseFinale(ctx, { width: w, height: h, state, time, kawaii, reducedMotion, landingTarget }, drawCompanion) {
  const y = state.altitude;
  const phase = state.phase;
  ctx.clearRect(0, 0, w, h);
  if (phase === 'landing') {
    if (reducedMotion) return;
    const p = state.progress;
    ctx.save(); ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 4;
    if (!reducedMotion) {
      for (const offset of [0, 0.15]) {
        ctx.beginPath(); ctx.ellipse(w / 2, h * 0.83, Math.max(1, (p + offset) * w * 0.7), Math.max(1, (p + offset) * h * 0.2), 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    const tx = landingTarget?.x ?? w / 2, ty = landingTarget?.y ?? h / 2;
    drawCompanion(w / 2 + (tx - w / 2) * p, h * 0.7 + (ty - h * 0.7) * p, 1 - p * 0.7);
    ctx.restore();
    return;
  }
  let color = '#070b20';
  if (phase === 'plunging') {
    if (y > 6000) color = '#090d28';
    else if (y > 2500) { const p = (6000 - y) / 3500; color = `rgb(${Math.round(27 + p * 45)}, ${Math.round(26 + p * 130)}, ${Math.round(90 + p * 135)})`; }
    else { const p = 1 - y / 2500; color = `rgb(${Math.round(72 + p * 176)}, ${Math.round(156 + p * 94)}, ${Math.round(225 + p * 27)})`; }
  }
  ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
  if (phase === 'catching') {
    const catY = Math.min(h * 0.78, Math.max(h * 0.45, Math.max(120, h * 0.16) + 68 + h * 0.15));
    ctx.strokeStyle = kawaii ? '#f9a8d4' : '#fcd34d'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(w / 2, catY, Math.min(110, h * 0.2), 0, Math.PI * 2); ctx.stroke();
    drawCompanion(w / 2, catY, 1);
    return;
  }
  if (!reducedMotion) {
    ctx.strokeStyle = y > 5000 ? '#7dd3fc' : '#fb923c';
    for (let i = 0; i < 44; i++) {
      const x = ((i * 0.618034) % 1) * w;
      const py = ((i * 0.381966 - time * 1.8) % 1 + 1) % 1 * h;
      ctx.globalAlpha = 0.2 + i % 3 * 0.12; ctx.lineWidth = 1 + i % 3;
      ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x, py - 50 - i % 5 * 20); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (y < 5000 && y > 400) {
      ctx.fillStyle = '#ffffff80';
      for (let i = 0; i < 6; i++) {
        const py = ((i * 0.23 - time * 0.9) % 1 + 1) % 1 * h;
        ctx.beginPath(); ctx.ellipse((i % 2 ? 0.85 : 0.12) * w, py, w * 0.3, h * 0.065, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  if (y <= 700) {
    const approach = reducedMotion ? 1 : 1 - y / 700;
    const horizon = h * (0.66 - approach * 0.23);
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1;
    for (let i = -8; i <= 8; i++) {
      ctx.beginPath(); ctx.moveTo(w / 2, horizon); ctx.lineTo(w / 2 + i * w * 0.14, h); ctx.stroke();
    }
    for (let i = 1; i <= 7; i++) {
      const py = horizon + (h - horizon) * Math.pow(i / 7, 2);
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
    }
  }
  drawCompanion(w / 2, h * 0.72, 0.85);
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createChaseFinale, drawChaseFinale };
