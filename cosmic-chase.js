/* Canvas chase and atmospheric return, with cancellable input/audio ownership. */
function createCosmicChase({ reducedMotion = false, isKawaii, isSoundOn, onSoundToggle, onAudioState, onLaunch, onPickup, onCollision, onNearMiss = () => {}, onLock = () => {}, onCaught, onPlunge, onDescent, onLanding, onFeedbackStop, onExit }) {
  const overlay = document.createElement('section');
  overlay.id = 'cosmicChaseOverlay';
  overlay.tabIndex = -1;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'chaseTitle');
  overlay.innerHTML = `
    <canvas id="cosmicChaseCanvas" aria-label="Guardian Cat flight view"></canvas>
    <div class="chase-page-approach" hidden aria-hidden="true" inert></div>
    <canvas class="chase-companion-layer" aria-hidden="true"></canvas>
    <div id="warpFlashOverlay" aria-hidden="true"></div>
    <div class="chase-hud">
      <div class="chase-hud-header">
        <span class="chase-title-badge" id="chaseTitle">Guardian Cat · Chase</span>
        <div class="chase-actions">
          <button class="chase-abort-btn chase-sound-btn" type="button">Enable music</button>
          <button class="chase-abort-btn chase-exit-btn" type="button">Return to orbit · Esc</button>
        </div>
      </div>
      <div class="chase-descent-status" hidden><strong></strong><span></span></div>
      <div class="chase-boost-container">
        <span class="chase-boost-label">BOOSTS <b id="chaseBoostCount">0 / 5</b></span>
        <div class="chase-boost-pods" aria-hidden="true">${'<span class="boost-pod">★</span>'.repeat(5)}</div>
        <p class="chase-event" role="status" aria-live="polite">Collect rings to catch up.</p>
        <progress class="chase-capture-progress" max="1" value="0" aria-label="Guardian catch progress" hidden></progress>
        <div class="chase-live-stats" aria-hidden="true"><span class="chase-speed">1.0×</span><span class="chase-pattern">Follow the rainbow</span><span class="chase-clock">0:00</span></div>
      </div>
      <div class="chase-flight-caption"><span>GUARDIAN SIGNAL</span><strong>Follow the rainbow · Collect 5 boosts · Catch the cat</strong><small>Near miss = slipstream boost · Music: Nyan Cat · daniwell</small></div>
      <p class="chase-controls-guide">Steer: WASD / arrows · Mouse / touch</p>
    </div>
    <div class="chase-results" hidden>
      <div class="chase-result-card">
        <div class="chase-result-paw" aria-hidden="true">🐾</div>
        <p class="chase-result-eyebrow">COSMIC COMPANION · HOME SAFE</p>
        <h2 id="chaseResultTitle">Guardian rescued!</h2>
        <p class="chase-result-badge"></p>
        <dl class="chase-result-stats"><div><dt>Chase time</dt><dd class="result-time"></dd></div><div><dt>Best on this device</dt><dd class="result-best"></dd><small class="result-best-note"></small></div><div><dt>Near misses</dt><dd class="result-near"></dd></div><div><dt>Impacts</dt><dd class="result-hits"></dd></div></dl>
        <p class="chase-result-message">The guardian is home. Your companion is waiting on the tracker.</p>
        <button class="chase-result-done" type="button">Return to tracker</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const canvas = overlay.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    overlay.remove();
    return null;
  }
  const flash = overlay.querySelector('#warpFlashOverlay');
  const pageApproach = overlay.querySelector('.chase-page-approach');
  const companionCanvas = overlay.querySelector('.chase-companion-layer');
  const companionCtx = companionCanvas.getContext('2d');
  let pageAnchor = null;
  const returningPage = document.getElementById('pageFront');
  function restoreReturningPage() {
    if (pageAnchor) { pageAnchor.replaceWith(returningPage); pageAnchor = null; }
    pageApproach.hidden = true;
    overlay.classList.remove('chase-approaching-page');
  }
  function updateReturningPage() {
    if (!returningPage || finaleState.phase !== 'plunging' || finaleState.altitude > 2500) return;
    if (!pageAnchor) {
      pageAnchor = document.createComment('tracker return position');
      returningPage.before(pageAnchor);
      pageApproach.appendChild(returningPage);
    }
    const approach = 1 - finaleState.altitude / 2500;
    overlay.classList.add('chase-approaching-page');
    pageApproach.hidden = false;
    pageApproach.style.opacity = String(Math.min(1, approach * 4));
    pageApproach.style.transform = motion.matches ? 'translate(-50%, -50%)' : `translate(-50%, -50%) perspective(1200px) rotateX(${(1 - approach) * 32}deg) scale(${0.12 + approach * 0.88})`;
  }
  const exitButton = overlay.querySelector('.chase-exit-btn');
  const soundButton = overlay.querySelector('.chase-sound-btn');
  const boostCount = overlay.querySelector('#chaseBoostCount');
  const boostPods = [...overlay.querySelectorAll('.boost-pod')];
  const eventLine = overlay.querySelector('.chase-event');
  const descentHUD = overlay.querySelector('.chase-descent-status');
  const hud = overlay.querySelector('.chase-hud');
  const captureMeter = overlay.querySelector('.chase-capture-progress');
  const resultsPanel = overlay.querySelector('.chase-results');
  const doneButton = overlay.querySelector('.chase-result-done');
  const speedLabel = overlay.querySelector('.chase-speed');
  const patternLabel = overlay.querySelector('.chase-pattern');
  const clockLabel = overlay.querySelector('.chase-clock');
  let result = null, chaseElapsed = 0, hitStop = 0, lockStep = 0, feedbackTime = 0, securedCatPoint = null;
  const catTrail = [], cursorTrail = [];
  const formatTime = ms => `${Math.floor(ms / 60000)}:${(ms / 1000 % 60).toFixed(2).padStart(5, '0')}`;
  function showResults() {
    let storage;
    try { storage = window.localStorage; } catch (_) {}
    result = recordChaseResult(storage || { getItem: () => null, setItem() {} }, { ...gameState, elapsed: chaseElapsed });
    phase = 'results'; overlay.style.opacity = '1'; hud.hidden = true; resultsPanel.hidden = false;
    overlay.setAttribute('aria-labelledby', 'chaseResultTitle');
    resultsPanel.querySelector('.chase-result-badge').textContent = result.perfect ? '★ Purrfect pursuit · No collisions' : 'Catch confirmed · Safe landing';
    resultsPanel.querySelector('.result-time').textContent = formatTime(result.durationMs);
    resultsPanel.querySelector('.result-best').textContent = formatTime(result.bestMs);
    resultsPanel.querySelector('.result-best-note').textContent = result.personalBest ? 'New personal best!' : '';
    resultsPanel.querySelector('.result-near').textContent = String(result.nearMisses);
    resultsPanel.querySelector('.result-hits').textContent = String(result.hits);
    onFeedbackStop(); onAudioState(false); keys.clear();
    ctx.clearRect(0, 0, width, height); companionCtx?.clearRect(0, 0, width, height);
    doneButton.focus({ preventScroll: true });
  }
  let finale = null, finaleState = null, landingTarget = null;
  const focusButtons = [soundButton, exitButton, doneButton];
  const game = createChaseGameplay();
  let gameState = game.status();
  let catDepth = 750;
  const feedback = [];
  let hitShake = 0;
  let boostRush = 0;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motion = { get matches() { return reducedMotion || preference.matches; } };
  const events = new AbortController();
  const options = { signal: events.signal };
  const previousFocus = document.activeElement;
  const viewport = document.getElementById('appViewport');
  const wasInert = viewport?.inert;
  if (viewport) viewport.inert = true;
  const keys = new Set();
  const stars = Array.from({ length: 280 }, () => ({
    x: (Math.random() - 0.5) * 1800,
    y: (Math.random() - 0.5) * 1200,
    z: 30 + Math.random() * 1500
  }));
  let width = 0, height = 0;
  let safeTop = 180;
  let x = 0, y = 0.35, targetX = 0, targetY = 0.35, bank = 0;
  let time = 0, previousTime = null, raf = null;
  let phase = 'warping';
  let closed = false;
  let frames = 0;
  let stopLaunch = null;
  let measuredFrom = null, measuredFrames = 0, workMs = 0, peakWorkMs = 0, fps = 0;

  function resize() {
    width = overlay.clientWidth;
    height = overlay.clientHeight;
    if (!finale) safeTop = Math.min(height * 0.62, overlay.querySelector('.chase-boost-container').getBoundingClientRect().bottom - overlay.getBoundingClientRect().top + 46);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    companionCanvas.width = canvas.width; companionCanvas.height = canvas.height;
    companionCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function close(reason = 'aborted') {
    if (closed) return;
    closed = true;
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    events.abort();
    finale?.cancel();
    stopLaunch?.();
    onFeedbackStop();
    onAudioState(false);
    keys.clear();
    restoreReturningPage();
    overlay.remove();
    document.body.classList.remove('cosmic-chase-active');
    document.body.classList.remove('chase-reduced-motion');
    if (viewport) viewport.inert = wasInert;
    onExit(reason === 'completed');
    if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus({ preventScroll: true });
  }

  function onKey(event) {
    // Capture before the Void, Konami and keyword handlers receive flight input.
    event.stopImmediatePropagation();
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      if (event.type === 'keydown') {
        const buttons = focusButtons.filter(button => !button.closest('[hidden]'));
        const index = buttons.indexOf(document.activeElement);
        buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      }
      return;
    }
    if (event.key === 'Escape' && event.type === 'keydown') {
      event.preventDefault();
      close(phase === 'results' ? 'completed' : 'aborted');
      return;
    }
    if (focusButtons.includes(event.target) && (event.key === 'Enter' || event.code === 'Space')) return;
    if (/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(event.code)) {
      event.preventDefault();
      if (event.type === 'keydown') keys.add(event.code);
      else keys.delete(event.code);
    } else if (event.code === 'Space' || event.code === 'KeyG') {
      event.preventDefault();
    }
  }

  function flightBounds(w = width, h = height) {
    // Keep the complete 31px reticle visible at every edge.
    return { cx: w / 2, cy: h / 2, rx: Math.max(1, w / 2 - 34), ry: Math.max(1, h / 2 - 34) };
  }

  function point(event) {
    if (phase !== 'flying' && phase !== 'warping' && phase !== 'capturing') return;
    if (event.type === 'pointermove' && event.pointerType !== 'mouse' && !event.buttons) return;
    const rect = canvas.getBoundingClientRect();
    const bounds = flightBounds(rect.width, rect.height);
    targetX = Math.max(-1, Math.min(1, (event.clientX - rect.left - bounds.cx) / bounds.rx));
    targetY = Math.max(-1, Math.min(1, (event.clientY - rect.top - bounds.cy) / bounds.ry));
    if (event.type === 'pointerdown') {
      canvas.setPointerCapture(event.pointerId);
      overlay.focus({ preventScroll: true });
    }
  }

  function pause() {
    stopLaunch?.();
    onFeedbackStop();
    onAudioState(false);
    keys.clear();
    targetX = x;
    targetY = y;
    previousTime = null;
    measuredFrom = null; measuredFrames = 0; workMs = 0; peakWorkMs = 0; fps = 0;
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
  }

  function resume() {
    if (!closed && phase !== 'results' && !document.hidden && raf === null) raf = requestAnimationFrame(frame);
  }

  function drawCat(cx, cy, kawaii, factor = 1, painter = ctx) {
    painter.save();
    painter.translate(cx, cy);
    painter.rotate(motion.matches ? 0 : Math.sin(time * 1.6) * 0.08);
    const scale = Math.min(1, width / 650, height / 450) * Math.min(2.8, 750 / catDepth * 0.72);
    const fittedScale = finale || phase === 'capturing' ? Math.min(scale, height * 0.13 / 45) : scale;
    painter.scale(fittedScale * factor, fittedScale * factor);
    painter.shadowColor = kawaii ? '#f9a8d4' : '#7dd3fc';
    painter.shadowBlur = 24;
    const glass = painter.createRadialGradient(-14, -16, 0, 0, 0, 48);
    glass.addColorStop(0, '#ffffff73');
    glass.addColorStop(0.45, kawaii ? '#f9a8d440' : '#38bdf840');
    glass.addColorStop(1, '#0f172ac0');
    painter.fillStyle = glass;
    painter.strokeStyle = kawaii ? '#f9a8d4' : '#7dd3fc';
    painter.lineWidth = 2;
    painter.beginPath(); painter.arc(0, 0, 45, 0, Math.PI * 2); painter.fill(); painter.stroke();
    painter.shadowBlur = 0;
    // Keep the same ears and kaomoji face as the ascending orbital guardian.
    painter.fillStyle = '#f1f5f9'; painter.font = '800 13px "JetBrains Mono", Menlo, monospace'; painter.textAlign = 'center';
    painter.fillText('▲', -20, -7); painter.fillText('▲', 20, -7);
    painter.fillStyle = '#ffffff'; painter.font = '800 13px "JetBrains Mono", Menlo, monospace';
    painter.shadowColor = '#38bdf8'; painter.shadowBlur = 10;
    painter.fillText(finale && phase !== 'overdrive' ? '(=˘ω˘=)' : '(=^･ω･^=)', 0, 12);
    if (finale && phase !== 'overdrive') {
      painter.strokeStyle = kawaii ? '#f9a8d4' : '#fcd34d'; painter.lineWidth = 5;
      painter.beginPath(); painter.ellipse(0, 35, 27, 12, 0, 0, Math.PI * 1.8); painter.stroke();
    }
    painter.shadowBlur = 0;
    painter.strokeStyle = '#ffffff80'; painter.lineWidth = 4;
    painter.beginPath(); painter.arc(-3, -3, 35, 3.6, 4.7); painter.stroke();
    painter.restore();
  }

  function updateBoostHUD() {
    boostCount.textContent = `${gameState.boosts} / 5`;
    boostPods.forEach((pod, index) => pod.classList.toggle('active', index < gameState.boosts));
  }

  function drawEntities() {
    const nextRing = gameState.entities.find(entity => entity.type === 'boost');
    if (nextRing) {
      const landing = projectChaseEntity(nextRing, width, height, 180);
      ctx.save(); ctx.strokeStyle = '#fcd34d'; ctx.globalAlpha = 0.4;
      ctx.setLineDash([3, 6]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(landing.x, landing.y, 17, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    const sorted = [...gameState.entities].sort((a, b) => b.z - a.z);
    for (const entity of sorted) {
      const p = projectChaseEntity(entity, width, height);
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.rotate(motion.matches ? 0 : entity.angle);
      const r = Math.max(entity.type === 'boost' ? 5 : 3, p.radius);
      if (entity.type === 'boost') {
        ctx.strokeStyle = isKawaii() ? '#f9a8d4' : '#fcd34d';
        ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 16;
        ctx.lineWidth = Math.max(2, r * 0.12);
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.88, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 0.6; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.65, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#fff7bf';
        ctx.beginPath(); ctx.arc(r, 0, Math.max(2, r * 0.12), 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = '#713645';
        ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const angle = i * Math.PI / 4;
          const radius = r * (0.83 + Math.sin(entity.id * 7 + i * 3) * 0.15);
          if (!i) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
          else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#452b3c';
        ctx.beginPath(); ctx.moveTo(-r * 0.7, r * 0.3); ctx.lineTo(r * 0.35, -r * 0.5); ctx.lineTo(r * 0.6, r * 0.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#a95b54';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.arc((i - 1) * r * 0.35, Math.sin(i * 4) * r * 0.4, r * 0.13, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  function catPosition() {
    return projectChaseEntity({ ...gameState.cat, z: phase === 'capturing' ? 180 : Math.max(180, catDepth), radius: 0 }, width, height);
  }

  function drawDepthTrail(cx, cy, kawaii) {
    const colors = kawaii ? ['#f9a8d4', '#fdba74', '#fde68a', '#86efac', '#7dd3fc', '#c4b5fd'] : ['#38bdf8', '#818cf8', '#c084fc'];
    const history = motion.matches ? [{ ...gameState.cat, at: time }, { ...gameState.cat, at: time - 1 }] : catTrail;
    const head = catPosition();
    colors.forEach((color, lane) => {
      ctx.strokeStyle = color;
      for (let i = 1; i < history.length; i++) {
        const a = history[i - 1], b = history[i];
        const age = Math.max(0, time - a.at), nextAge = Math.max(0, time - b.at);
        const project = (point, age) => {
          const z = Math.max(100, catDepth - age * 300);
          const p = projectChaseEntity({ ...point, z, radius: 0 }, width, height);
          const t = Math.min(1, age / 1.5);
          return { x: p.x * (1 - t) + width / 2 * t + (lane - (colors.length - 1) / 2) * (3 + age * 5), y: p.y + 25 + age * height * 0.34 };
        };
        const p = i === 1 ? { x: head.x + (lane - (colors.length - 1) / 2) * 3, y: head.y + 25 } : project(a, age);
        const q = project(b, nextAge);
        ctx.globalAlpha = Math.max(0, 0.6 - age * 0.3); ctx.lineWidth = 3 + age * 6;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
  }

  function render(dt) {
    if (phase === 'results') return;
    companionCtx?.clearRect(0, 0, width, height);
    if (finaleState && phase !== 'overdrive') {
      updateReturningPage();
      drawChaseFinale(ctx, { width, height, state: finaleState, time, kawaii: isKawaii(), reducedMotion: motion.matches, landingTarget }, (x, y, scale) => {
        if (!securedCatPoint) securedCatPoint = { x, y };
        const ease = motion.matches ? 1 : 1 - Math.exp(-12 * dt);
        securedCatPoint.x += (x - securedCatPoint.x) * ease;
        securedCatPoint.y += (y - securedCatPoint.y) * ease;
        drawCat(securedCatPoint.x, securedCatPoint.y, isKawaii(), scale, companionCtx || ctx);
      });
      if (phase === 'landing') overlay.style.opacity = String(1 - finaleState.progress);
      return;
    }
    const kawaii = isKawaii();
    const accent = kawaii ? '#f9a8d4' : '#7dd3fc';
    const bg = ctx.createRadialGradient(width * 0.5, height * 0.42, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.8);
    bg.addColorStop(0, kawaii ? '#30204c' : '#101d3d'); bg.addColorStop(1, '#020208');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
    ctx.save();
    if (hitShake > 0 && !motion.matches) ctx.translate(Math.sin(time * 91) * hitShake * 22, Math.cos(time * 113) * hitShake * 16);
    ctx.translate(width / 2, height / 2);
    ctx.rotate(motion.matches ? 0 : bank);
    ctx.translate(-width / 2, -height / 2);
    const cx = width * (0.5 - x * 0.1), cy = height * (0.43 - y * 0.1);
    const launchRush = Math.exp(-Math.max(0, time - 0.25) * 2.4);
    const focal = Math.min(width, height) * (motion.matches ? 0.8 : 0.8 + launchRush * 0.09 + boostRush * 0.12);
    ctx.strokeStyle = accent;
    for (const star of stars) {
      const oldZ = star.z;
      star.z -= dt * (hitStop > 0 ? 0.12 : 1) * (motion.matches ? 35 : 1100 * gameState.speedMultiplier + launchRush * 800);
      if (star.z < 25) { star.z = 1500; continue; }
      const sx = cx + star.x * focal / star.z, sy = cy + star.y * focal / star.z;
      ctx.globalAlpha = Math.min(0.95, 1 - star.z / 1700);
      ctx.lineWidth = Math.max(0.6, 2.3 - star.z / 1000);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      const tailZ = motion.matches ? star.z + 2 : Math.max(oldZ, star.z + 100 + launchRush * 70);
      ctx.lineTo(cx + star.x * focal / tailZ, cy + star.y * focal / tailZ);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (!motion.matches) {
      // Fast peripheral flow leaves the cat and steering area readable.
      for (let i = 0; i < 32; i++) {
        const angle = i * 2.399963;
        const progress = (time * 1.5 + i * 0.618034) % 1;
        const radius = 0.75 + progress * 0.75;
        ctx.globalAlpha = Math.sin(progress * Math.PI) * (0.18 + launchRush * 0.15 + boostRush * 0.25);
        ctx.lineWidth = 1 + i % 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * width * radius / 2, cy + Math.sin(angle) * height * radius / 2);
        ctx.lineTo(cx + Math.cos(angle) * width * (radius + 0.22) / 2, cy + Math.sin(angle) * height * (radius + 0.22) / 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    drawDepthTrail(cx, cy, kawaii);
    const catPoint = catPosition();
    if (phase !== 'capturing') drawCat(catPoint.x, catPoint.y, kawaii, 1 + (motion.matches ? 0 : boostRush * 0.09));
    ctx.restore();

    drawEntities();
    if (phase === 'capturing') {
      drawCat(catPoint.x, catPoint.y, kawaii);
      const radius = Math.min(88, height * 0.17, width * 0.24);
      ctx.save(); ctx.strokeStyle = '#ffffff40'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(catPoint.x, catPoint.y, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#fcd34d'; ctx.shadowColor = '#fcd34d'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(catPoint.x, catPoint.y, radius, -Math.PI / 2, -Math.PI / 2 + gameState.capture * Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    for (const effect of feedback) {
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - effect.age / 0.6);
      ctx.strokeStyle = effect.type === 'boost' ? '#fcd34d' : effect.type === 'nearMiss' ? '#67e8f9' : '#fb7185'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(effect.x, effect.y, motion.matches ? 32 : 20 + effect.age * 140, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle; ctx.font = '700 15px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText(effect.type === 'boost' ? 'BOOST!' : effect.type === 'nearMiss' ? 'CLOSE CALL · +22%' : 'SHIELD!', effect.x, effect.y - 35 - (motion.matches ? 0 : effect.age * 55));
      if (effect.type === 'boost' && !motion.matches) {
        ctx.fillStyle = '#fcd34d';
        for (let i = 0; i < 12; i++) {
          const angle = i * Math.PI / 6;
          const radius = 18 + effect.age * 160;
          ctx.save(); ctx.translate(effect.x + Math.cos(angle) * radius, effect.y + Math.sin(angle) * radius);
          ctx.rotate(angle + effect.age * 2); ctx.fillRect(-2, -2, 4, 4); ctx.restore();
        }
      }
      ctx.restore();
    }

    // The flight reticle stays independent of the cat's teasing path.
    const bounds = flightBounds();
    const px = bounds.cx + x * bounds.rx, py = bounds.cy + y * bounds.ry;
    if (!motion.matches) {
      ctx.save(); ctx.strokeStyle = gameState.slipstream ? '#67e8f9' : '#7dd3fc'; ctx.lineWidth = 3;
      cursorTrail.forEach((point, i) => { if (!i) return; ctx.globalAlpha = (i / cursorTrail.length) * 0.45; ctx.beginPath(); ctx.moveTo(cursorTrail[i - 1].x, cursorTrail[i - 1].y); ctx.lineTo(point.x, point.y); ctx.stroke(); });
      ctx.restore();
    }
    if (gameState.protected) {
      ctx.save(); ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 3; ctx.globalAlpha = 0.7;
      ctx.setLineDash([9, 6]); ctx.beginPath(); ctx.arc(px, py, 40, motion.matches ? 0 : time * 3, (motion.matches ? 0 : time * 3) + Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    ctx.strokeStyle = accent; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, 20, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px - 31, py); ctx.lineTo(px - 13, py);
    ctx.moveTo(px + 13, py); ctx.lineTo(px + 31, py);
    ctx.moveTo(px, py - 31); ctx.lineTo(px, py - 13);
    ctx.moveTo(px, py + 13); ctx.lineTo(px, py + 31); ctx.stroke();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
  }

  function frame(now) {
    raf = null;
    if (closed || document.hidden) return;
    const began = performance.now();
    const frameSeconds = previousTime === null ? 0 : Math.max(0, (now - previousTime) / 1000);
    const dt = Math.min(frameSeconds, 0.05);
    previousTime = now;
    if (phase === 'results') return;
    time += dt;
    if (phase === 'flying' || phase === 'capturing') chaseElapsed += frameSeconds;
    const dx = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    const dy = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
    const length = Math.max(1, Math.hypot(dx, dy));
    if (phase === 'flying' || phase === 'capturing') {
      targetX = Math.max(-1, Math.min(1, targetX + dx / length * dt * 2.8));
      targetY = Math.max(-1, Math.min(1, targetY + dy / length * dt * 2.8));
    }
    const ease = 1 - Math.exp(-24 * dt);
    const targetBank = dx ? -dx / length * 0.2 : (targetX - x) * -1.4;
    bank += (targetBank - bank) * (1 - Math.exp(-8 * dt));
    bank = Math.max(-0.244, Math.min(0.244, bank));
    x += (targetX - x) * ease; y += (targetY - y) * ease;
    hitShake = Math.max(0, hitShake - dt);
    boostRush = Math.max(0, boostRush - dt);
    hitStop = Math.max(0, hitStop - dt);
    feedbackTime = Math.max(0, feedbackTime - dt);
    if (!feedbackTime) delete hud.dataset.feedback;
    for (let i = feedback.length - 1; i >= 0; i--) {
      feedback[i].age += dt;
      if (feedback[i].age > 0.6) feedback.splice(i, 1);
    }
    if (phase === 'flying' || phase === 'capturing') {
      const events = game.update(hitStop > 0 ? dt * 0.12 : dt, { x, y }, { width, height, safeTop, reducedMotion: motion.matches });
      gameState = game.status();
      for (const event of events) {
        if (event.type === 'boost' || event.type === 'hit') {
          feedback.push({ ...event, age: 0 });
          hud.dataset.feedback = event.type; feedbackTime = 0.3;
          updateBoostHUD();
          if (event.type === 'boost') {
            boostRush = 0.45;
            hitStop = motion.matches ? 0 : 0.045;
            eventLine.textContent = `Boost ${event.boosts} / 5 · Closing in!`;
            onPickup(event.boosts);
          } else {
            hitShake = 0.23;
            hitStop = motion.matches ? 0 : 0.085;
            eventLine.textContent = event.lostBoost ? 'Asteroid hit · One boost lost. Keep flying!' : 'Asteroid hit · Shield recovering.';
            onCollision();
          }
        } else if (event.type === 'nearMiss') {
          feedback.push({ ...event, age: 0 });
          boostRush = 0.6; hud.dataset.feedback = 'near'; feedbackTime = 0.4;
          eventLine.textContent = 'Close call! Slipstream +22%'; onNearMiss(event.side);
        } else if (event.type === 'inReach') {
          phase = 'capturing'; overlay.classList.add('chase-capturing'); captureMeter.hidden = false;
          eventLine.textContent = 'Cat in reach! Keep your reticle on the guardian.';
        } else if (event.type === 'miss') {
          eventLine.textContent = 'Ring missed · Another is on its way.';
        } else if (event.type === 'caught') {
          securedCatPoint = catPosition();
          finale = createChaseFinale({ reducedMotion: motion.matches });
          finaleState = finale.status(); phase = 'overdrive'; keys.clear();
          overlay.classList.add('chase-finalising');
          overlay.classList.remove('chase-capturing'); captureMeter.hidden = true;
          eventLine.textContent = 'Guardian caught! Hyperdrive home!';
          exitButton.textContent = 'Cancel descent · Esc';
        }
      }
      if (phase === 'capturing') {
        captureMeter.value = gameState.capture;
        const step = Math.floor(gameState.capture * 4);
        if (step > lockStep) { onLock(gameState.capture); lockStep = step; }
      }
      if (!catTrail.length || time - catTrail[0].at >= 0.045) catTrail.unshift({ ...gameState.cat, at: time });
      while (catTrail.length > 36) catTrail.pop();
      const b = flightBounds(); cursorTrail.push({ x: b.cx + x * b.rx, y: b.cy + y * b.ry });
      if (cursorTrail.length > 16) cursorTrail.shift();
      speedLabel.textContent = `${gameState.speedMultiplier.toFixed(1)}×${gameState.slipstream ? ' SLIPSTREAM' : ''}`;
      patternLabel.textContent = phase === 'capturing' ? 'Hold on the cat to catch' : gameState.pattern;
      clockLabel.textContent = formatTime(chaseElapsed * 1000);
    }
    if (finale) {
      const previousPhase = phase;
      finaleState = finale.update(dt);
      phase = finaleState.phase;
      overlay.classList.toggle('chase-descending', phase !== 'overdrive');
      if (phase !== 'overdrive') {
        descentHUD.hidden = false;
        descentHUD.querySelector('strong').textContent = `ALT ${Math.round(finaleState.altitude).toLocaleString()}m`;
        descentHUD.querySelector('span').textContent = phase === 'catching' ? 'Guardian Cat secured' : phase === 'landing' ? 'Touchdown · Cosmic Companion' : finaleState.altitude > 6000 ? 'Deep Orbit' : finaleState.altitude > 2500 ? 'Stratosphere' : finaleState.altitude > 400 ? 'Troposphere' : 'Ground Studio';
      }
      if (phase === 'catching' && previousPhase !== phase) onCaught();
      if (phase === 'plunging') {
        if (previousPhase !== phase) onPlunge();
        onDescent(finaleState.altitude);
      }
      if (finaleState.touchdown) {
        onFeedbackStop();
        restoreReturningPage();
        landingTarget = onLanding();
        overlay.style.background = 'transparent';
        exitButton.textContent = 'Return to screen · Esc';
      }
      if (finaleState.complete) { showResults(); return; }
    }
    catDepth += (gameState.catDepth - catDepth) * (1 - Math.exp(-5 * dt));
    if (phase === 'warping') {
      const duration = motion.matches ? 0.3 : 0.55;
      overlay.style.opacity = Math.min(1, time / 0.25);
      flash.style.opacity = motion.matches ? 0 : (time < 0.25 ? time / 0.25 : Math.max(0, 1 - (time - 0.25) / 0.3));
      if (time >= duration) { phase = 'flying'; overlay.style.opacity = '1'; flash.style.opacity = '0'; }
    }
    onAudioState(phase === 'flying' || phase === 'capturing' || phase === 'overdrive', gameState.boosts);
    const soundLabel = isSoundOn() ? 'Mute music' : 'Enable music';
    if (soundButton.textContent !== soundLabel) soundButton.textContent = soundLabel;
    render(dt);
    const duration = performance.now() - began;
    workMs += duration; peakWorkMs = Math.max(peakWorkMs, duration); measuredFrames++;
    if (measuredFrom === null) measuredFrom = now;
    if (now > measuredFrom) fps = (measuredFrames - 1) * 1000 / (now - measuredFrom);
    frames++;
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('keydown', onKey, { ...options, capture: true });
  window.addEventListener('keyup', onKey, { ...options, capture: true });
  window.addEventListener('resize', resize, options);
  window.addEventListener('blur', pause, options);
  window.addEventListener('focus', resume, options);
  document.addEventListener('visibilitychange', () => document.hidden ? pause() : resume(), options);
  canvas.addEventListener('pointerdown', point, options);
  canvas.addEventListener('pointermove', point, options);
  exitButton.addEventListener('click', close, options);
  soundButton.addEventListener('click', onSoundToggle, options);
  doneButton.addEventListener('click', () => close('completed'), options);
  const updateMotion = () => document.body.classList.toggle('chase-reduced-motion', motion.matches);
  preference.addEventListener?.('change', updateMotion, options);
  updateMotion();
  document.body.classList.add('cosmic-chase-active');
  overlay.style.opacity = '0';
  resize();
  overlay.focus({ preventScroll: true });
  stopLaunch = onLaunch();
  resume();
  return {
    close,
    status: () => ({ phase, x, y, targetX, targetY, bank, frames, width, height, paused: raf === null, stars: stars.length, result, trailPoints: catTrail.length, reducedMotion: motion.matches, fps, renderMs: measuredFrames ? workMs / measuredFrames : 0, peakRenderMs: peakWorkMs, game: game.status(), finale: finale?.status() || null })
  };
}
