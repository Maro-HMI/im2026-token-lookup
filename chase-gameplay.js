/* Shared time-based pursuit rules: routes, waves, slipstream and a deliberate catch. */
function projectChaseEntity(entity, width, height, depth = entity.z) {
  const scale = 180 / Math.max(60, depth);
  const destinationX = width / 2 + entity.x * Math.max(1, width / 2 - 34);
  const destinationY = height / 2 + entity.y * Math.max(1, height / 2 - 34);
  return { x: width / 2 + (destinationX - width / 2) * scale,
    y: height * 0.43 + (destinationY - height * 0.43) * scale,
    radius: entity.radius * scale, destinationX, destinationY };
}
function recordChaseResult(storage, run) {
  const durationMs = Math.max(1, Math.round(run.elapsed * 1000));
  let previous = null;
  try { const value = Number(storage.getItem('im_cosmic_chase_best')); if (Number.isFinite(value) && value > 0 && value <= 36000000) previous = value; } catch (_) {}
  const bestMs = Math.min(previous ?? durationMs, durationMs);
  try { storage.setItem('im_cosmic_chase_best', String(bestMs)); } catch (_) {}
  return { durationMs, bestMs, personalBest: previous === null || durationMs < previous, hits: run.hits, nearMisses: run.nearMisses, perfect: run.hits === 0 };
}
function createChaseGameplay({ random = Math.random } = {}) {
  let entities, elapsed, boosts, hits, collected, missed, invulnerableUntil, nextBoost, nextWave, sequence, phase;
  let cat, routeFrom, routeTo, routeAt, routeNumber, waveNumber, pattern, nearMisses, slipstreamUntil, nearMissReady;
  let capture, captureOrigin, captureStarted;
  function reset() {
    entities = []; elapsed = boosts = hits = collected = missed = sequence = 0;
    invulnerableUntil = 0; nextBoost = 0.65; nextWave = 1.5; phase = 'flying';
    cat = { x: 0, y: 0.3 }; routeFrom = { ...cat }; routeTo = { ...cat }; routeAt = 0;
    routeNumber = waveNumber = nearMisses = 0; pattern = 'Follow the rainbow';
    slipstreamUntil = nearMissReady = capture = captureStarted = 0; captureOrigin = { ...cat };
  }
  reset();
  const speedMultiplier = () => (1 + boosts * 0.46) * (elapsed < slipstreamUntil ? 1.22 : 1);
  function safeMinimum(viewport, padding = 0) {
    return Math.max(-0.56, Math.min(0.4, ((viewport.safeTop || 180) + padding - viewport.height / 2) / Math.max(1, viewport.height / 2 - 34)));
  }
  function addEntity(type, x, y, z, viewport) {
    const candidate = { id: ++sequence, type, x, y, z, radius: type === 'boost' ? 36 : 34,
      angle: random() * Math.PI * 2, spin: (random() - 0.5) * 1.5 };
    const p = projectChaseEntity(candidate, viewport.width, viewport.height, 180);
    const conflicts = other => {
      if (other.type === type || Math.abs(other.z - z) > 400) return false;
      const q = projectChaseEntity(other, viewport.width, viewport.height, 180);
      return Math.hypot(p.x - q.x, p.y - q.y) < 120;
    };
    if (type === 'boost') entities = entities.filter(other => !conflicts(other));
    else if (entities.some(conflicts)) return;
    entities.push(candidate);
  }
  function leadRoute(viewport) {
    routeFrom = { ...cat }; routeAt = elapsed;
    const minY = safeMinimum(viewport, 30);
    routeTo = { x: (routeNumber % 2 ? 1 : -1) * (0.48 + random() * 0.26),
      y: minY + (0.55 - minY) * (routeNumber % 2 ? 0.7 : 0.25) };
    routeNumber++;
    addEntity('boost', routeTo.x, routeTo.y, 1250, viewport);
  }
  function spawnWave(viewport) {
    const minY = safeMinimum(viewport), z = Math.max(1250, 180 + 440 * speedMultiplier() * 1.4);
    const slalom = waveNumber++ % 3 === 2;
    pattern = slalom ? 'Slalom' : routeTo.x < 0 ? 'Left gap' : 'Right gap';
    if (slalom) {
      for (let i = 0; i < 4; i++) addEntity('rock', i % 2 ? 0.65 : -0.65, minY + (0.62 - minY) * (i % 2 ? 0.8 : 0.2), z + i * 130, viewport);
    } else {
      const columns = viewport.width < 520 ? [-0.82, 0, 0.82] : [-0.84, -0.42, 0, 0.42, 0.84];
      const gap = columns.reduce((best, x) => Math.abs(x - routeTo.x) < Math.abs(best - routeTo.x) ? x : best);
      for (const x of columns) if (x !== gap) addEntity('rock', x, routeTo.y, z, viewport);
    }
  }
  function update(dt, player, viewport) {
    const events = [];
    if (phase === 'caught') return events;
    const seconds = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.05)) : 0;
    if (!seconds) return events;
    elapsed += seconds;
    if (phase === 'capturing') {
      const age = elapsed - captureStarted;
      cat = { x: Math.max(-0.76, Math.min(0.76, captureOrigin.x + (viewport.reducedMotion ? 0 : Math.sin(age * 1.5) * 0.13))),
        y: Math.max(safeMinimum(viewport, 80), Math.min(0.5, captureOrigin.y + (viewport.reducedMotion ? 0 : Math.sin(age * 1.1) * 0.08))) };
      const distance = Math.hypot((player.x - cat.x) * (viewport.width / 2 - 34), (player.y - cat.y) * (viewport.height / 2 - 34));
      const inReach = distance <= Math.min(64, viewport.width * 0.16, viewport.height * 0.15);
      capture = Math.max(0, Math.min(1, capture + seconds * (inReach ? 1 / 0.9 : -0.7)));
      if (capture >= 1) { phase = 'caught'; events.push({ type: 'caught' }); }
      return events;
    }
    if (elapsed >= nextBoost) { leadRoute(viewport); nextBoost = elapsed + 2.35; }
    const t = Math.min(1, (elapsed - routeAt) / 0.85), smooth = t * t * (3 - 2 * t);
    cat = { x: routeFrom.x + (routeTo.x - routeFrom.x) * smooth, y: routeFrom.y + (routeTo.y - routeFrom.y) * smooth };
    if (elapsed >= nextWave) { spawnWave(viewport); nextWave = elapsed + Math.max(1.6, 2.25 - boosts * 0.12); }
    const speed = 440 * speedMultiplier();
    const px = viewport.width / 2 + player.x * Math.max(1, viewport.width / 2 - 34);
    const py = viewport.height / 2 + player.y * Math.max(1, viewport.height / 2 - 34);
    const arrivals = [];
    for (const entity of entities) {
      const oldZ = entity.z;
      entity.z -= seconds * speed; entity.angle += entity.spin * seconds;
      if (oldZ > 180 && entity.z <= 180) arrivals.push({ entity, order: (oldZ - 180) / speed });
    }
    arrivals.sort((a, b) => a.order - b.order);
    for (const { entity } of arrivals) {
      if (phase !== 'flying') break;
      const p = projectChaseEntity(entity, viewport.width, viewport.height, 180);
      const distance = Math.hypot(p.x - px, p.y - py);
      if (entity.type === 'boost') {
        if (distance <= Math.min(42, viewport.width * 0.1)) {
          boosts = Math.min(5, boosts + 1); collected++;
          events.push({ type: 'boost', boosts, x: p.x, y: p.y });
          if (boosts === 5) { phase = 'capturing'; captureOrigin = { ...cat }; captureStarted = elapsed; events.push({ type: 'inReach' }); }
        } else { missed++; events.push({ type: 'miss' }); }
      } else if (distance < entity.radius + 22 && elapsed >= invulnerableUntil) {
        const lostBoost = boosts > 0;
        boosts = Math.max(0, boosts - 1); hits++; invulnerableUntil = elapsed + 1;
        events.push({ type: 'hit', boosts, lostBoost, x: p.x, y: p.y });
      } else if (distance >= entity.radius + 22 && distance < entity.radius + 48 && elapsed >= invulnerableUntil && elapsed >= nearMissReady) {
        nearMisses++; slipstreamUntil = elapsed + 1.15; nearMissReady = elapsed + 0.35;
        events.push({ type: 'nearMiss', x: p.x, y: p.y, side: Math.sign(p.x - px) });
      }
      entity.passed = true;
    }
    entities = phase === 'flying' ? entities.filter(e => !e.passed && e.z > 100) : [];
    return events;
  }
  return { update, reset, status: () => ({ phase, elapsed, boosts, hits, collected, missed, nearMisses,
    capture, cat: { ...cat }, route: { ...routeTo }, pattern, slipstream: elapsed < slipstreamUntil,
    protected: elapsed < invulnerableUntil, catDepth: [750, 600, 450, 320, 180, 40][boosts],
    speedMultiplier: speedMultiplier(), entities: entities.map(e => ({ ...e })) }) };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { createChaseGameplay, projectChaseEntity, recordChaseResult };
