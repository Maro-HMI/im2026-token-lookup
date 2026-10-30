/* Time-based chase rules, independent of canvas rendering and browser input. */
function projectChaseEntity(entity, width, height, depth = entity.z) {
  const scale = 180 / Math.max(60, depth);
  const destinationX = width / 2 + entity.x * Math.max(1, width / 2 - 34);
  const destinationY = height / 2 + entity.y * Math.max(1, height / 2 - 34);
  return {
    x: width / 2 + (destinationX - width / 2) * scale,
    y: height * 0.43 + (destinationY - height * 0.43) * scale,
    radius: entity.radius * scale,
    destinationX, destinationY
  };
}

function createChaseGameplay({ random = Math.random } = {}) {
  let entities, elapsed, boosts, hits, collected, missed, invulnerableUntil, nextBoost, nextRock, sequence, phase;
  function reset() {
    entities = [];
    elapsed = 0; boosts = 0; hits = 0; collected = 0; missed = 0;
    invulnerableUntil = 0; nextBoost = 0.65; nextRock = 1.5; sequence = 0;
    phase = 'flying';
  }
  reset();

  function spawn(type, player, width, height, safeTop) {
    const radius = type === 'boost' ? 36 : 34;
    let candidate;
    for (let attempt = 0; attempt < 12; attempt++) {
      let x = (random() * 2 - 1) * 0.86;
      const minY = Math.max(-0.56, Math.min(0.35, (safeTop - height / 2) / Math.max(1, height / 2 - 34)));
      let y = minY + random() * (0.62 - minY);
      // Some rocks challenge the player's current course, with ample approach time.
      if (type === 'rock' && sequence % 3 === 0 && attempt === 0) {
        x = Math.max(-0.8, Math.min(0.8, player.x + (random() - 0.5) * 0.3));
        y = Math.max(minY, Math.min(0.62, player.y + (random() - 0.5) * 0.3));
      }
      candidate = { id: ++sequence, type, x, y, z: 1250, radius, angle: random() * Math.PI * 2, spin: (random() - 0.5) * 1.5 };
      const projected = projectChaseEntity(candidate, width, height, 180);
      const conflict = entities.some(other => {
        if (other.type === type || Math.abs(other.z - candidate.z) > 320) return false;
        const position = projectChaseEntity(other, width, height, 180);
        return Math.hypot(position.x - projected.x, position.y - projected.y) < 110;
      });
      if (!conflict) { entities.push(candidate); return; }
    }
    // Skip an unsafe obstacle rather than forcing a collision on a boost route.
    if (type === 'boost') {
      entities = entities.filter(other => {
        const a = projectChaseEntity(other, width, height, 180);
        const b = projectChaseEntity(candidate, width, height, 180);
        return other.type !== 'rock' || Math.abs(other.z - candidate.z) > 320 || Math.hypot(a.x - b.x, a.y - b.y) >= 110;
      });
      entities.push(candidate);
    }
  }

  function update(dt, player, viewport) {
    const events = [];
    if (phase !== 'flying') return events;
    const seconds = Math.max(0, Math.min(dt, 0.05));
    const width = viewport.width, height = viewport.height;
    elapsed += seconds;
    if (elapsed >= nextBoost) {
      spawn('boost', player, width, height, viewport.safeTop || 180);
      nextBoost = elapsed + 2.35;
    }
    if (elapsed >= nextRock) {
      spawn('rock', player, width, height, viewport.safeTop || 180);
      nextRock = elapsed + Math.max(0.5, 0.85 - boosts * 0.08);
    }
    const speed = 440 * (1 + boosts * 0.46);
    const pickupRadius = Math.min(42, width * 0.10);
    const px = width / 2 + player.x * Math.max(1, width / 2 - 34);
    const py = height / 2 + player.y * Math.max(1, height / 2 - 34);
    const arrivals = [];
    for (const entity of entities) {
      const oldZ = entity.z;
      entity.z -= seconds * speed;
      entity.angle += entity.spin * seconds;
      if (oldZ > 180 && entity.z <= 180) arrivals.push({ entity, order: (oldZ - 180) / speed });
    }
    arrivals.sort((a, b) => a.order - b.order);
    for (const { entity } of arrivals) {
      if (phase !== 'flying') break;
      const projected = projectChaseEntity(entity, width, height, 180);
      const distance = Math.hypot(projected.x - px, projected.y - py);
      if (entity.type === 'boost') {
        if (distance <= pickupRadius) {
          boosts = Math.min(5, boosts + 1); collected++;
          events.push({ type: 'boost', boosts, x: projected.x, y: projected.y });
          if (boosts === 5) {
            phase = 'caught';
            events.push({ type: 'caught' });
          }
        } else {
          missed++;
          events.push({ type: 'miss' });
        }
      } else if (distance < entity.radius + 22 && elapsed >= invulnerableUntil) {
        const lostBoost = boosts > 0;
        boosts = Math.max(0, boosts - 1); hits++;
        invulnerableUntil = elapsed + 1;
        events.push({ type: 'hit', boosts, lostBoost, x: projected.x, y: projected.y });
      }
      entity.passed = true;
    }
    entities = phase === 'caught' ? [] : entities.filter(entity => !entity.passed && entity.z > 100);
    return events;
  }

  return {
    update, reset,
    status: () => ({
      phase, elapsed, boosts, hits, collected, missed,
      protected: elapsed < invulnerableUntil,
      catDepth: [750, 600, 450, 320, 180, 40][boosts],
      speedMultiplier: 1 + boosts * 0.46,
      entities: entities.map(entity => ({ ...entity }))
    })
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createChaseGameplay, projectChaseEntity };
