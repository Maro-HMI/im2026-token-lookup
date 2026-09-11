/**
 * Late Token Tracker — Client Application
 * Computes SHA-256 hash locally using Web Crypto API and retrieves student record.
 * Supports Juicy (gamified micro-interactions) and Vanilla (calm, instant) modes.
 */

let appConfig = null;
let isJuicyMode = true;
let currentStudentId = '';

// Particle Canvas State
let canvas = null;
let ctx = null;
let particles = [];
let animFrameId = null;

// Normalize Student ID to lowercase 's' prefix (works with or without leading 's')
function normalizeStudentId(input) {
  if (!input) return '';
  let val = input.trim().toLowerCase();
  // Strip any leading 's' and optional space
  let clean = val.replace(/^s\s*/i, '');
  // Standardize to always have 's' prefix
  return 's' + clean;
}

// Compute SHA-256 hash in browser
async function computeHash(salt, studentId) {
  const tokenStr = `${salt}:${studentId}`.trim().toLowerCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(tokenStr);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Load public configuration
async function loadConfig() {
  try {
    const res = await fetch('data/config.json?v=' + Date.now());
    if (!res.ok) return;
    appConfig = await res.json();

    if (appConfig.last_updated) {
      const date = new Date(appConfig.last_updated);
      const formatted = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const lastUpdatedEl = document.getElementById('lastUpdated');
      if (lastUpdatedEl) {
        lastUpdatedEl.textContent = `Updated ${formatted}`;
      }
    }
  } catch (err) {
    // Fail silently without broken UI text
  }
}

// ==========================================================================
// Mode Management (Juicy vs Vanilla)
// ==========================================================================

function checkFxPreference() {
  const href = window.location.href.toLowerCase();
  // URL flag has highest precedence for bookmarks
  if (href.includes('vanilla') || href.includes('calm') || href.includes('plain') || href.includes('fx=0') || href.includes('no-fx')) {
    return false;
  }
  if (href.includes('juicy') || href.includes('fx=1')) {
    return true;
  }
  // Local storage preference
  try {
    const stored = localStorage.getItem('im_tokens_fx_mode');
    if (stored !== null) {
      return stored === 'juicy';
    }
  } catch (e) {}
  // System prefers-reduced-motion
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return false;
  }
  return true; // default
}

function setMode(juicy, updateUrl = true) {
  isJuicyMode = juicy;
  try {
    localStorage.setItem('im_tokens_fx_mode', juicy ? 'juicy' : 'vanilla');
  } catch (e) {}

  const toggleBtn = document.getElementById('modeToggleBtn');
  const modeIcon = document.getElementById('modeIcon');
  const modeLabel = document.getElementById('modeLabel');
  const ticket = document.getElementById('headerTicketIcon');
  const getxrLogo = document.getElementById('getxrLogo');
  const threedmaLogo = document.getElementById('threedmaLogo');
  const getxrBal = document.getElementById('getxrBalance');
  const threedmaBal = document.getElementById('threedmaBalance');
  const cardGetxr = document.getElementById('cardGetxr');
  const card3dma = document.getElementById('card3dma');

  if (juicy) {
    document.body.classList.add('juicy-mode');
    document.body.classList.remove('vanilla-mode');
    if (modeIcon) {
      modeIcon.innerHTML = `<svg class="w-3.5 h-3.5 text-amber-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`;
    }
    if (modeLabel) modeLabel.textContent = 'Juicy';
    if (toggleBtn) toggleBtn.setAttribute('title', 'Switch to Vanilla mode (calm, instant)');
    if (ticket) ticket.setAttribute('title', 'Inspect golden ticket');
    if (getxrLogo) getxrLogo.setAttribute('title', 'Inspect asset');
    if (threedmaLogo) threedmaLogo.setAttribute('title', 'Inspect asset');
    if (getxrBal) getxrBal.setAttribute('title', 'Click to flip token!');
    if (threedmaBal) threedmaBal.setAttribute('title', 'Click to flip token!');
  } else {
    document.body.classList.remove('juicy-mode');
    document.body.classList.add('vanilla-mode');
    if (modeIcon) {
      modeIcon.innerHTML = `<svg class="w-3.5 h-3.5 text-slate-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 7 18 0"/><path d="m3 17 18 0"/><path d="m17 5 0 4"/><path d="m7 15 0 4"/></svg>`;
    }
    if (modeLabel) modeLabel.textContent = 'Vanilla';
    if (toggleBtn) toggleBtn.setAttribute('title', 'Switch to Juicy mode (animations, effects)');
    if (ticket) ticket.removeAttribute('title');
    if (getxrLogo) getxrLogo.removeAttribute('title');
    if (threedmaLogo) threedmaLogo.removeAttribute('title');
    if (getxrBal) getxrBal.removeAttribute('title');
    if (threedmaBal) threedmaBal.removeAttribute('title');
    if (cardGetxr) {
      cardGetxr.style.transform = '';
      cardGetxr.classList.remove('tilt-card-reset');
    }
    if (card3dma) {
      card3dma.style.transform = '';
      card3dma.classList.remove('tilt-card-reset');
    }
  }

  // Update telemetry discovery counter visibility and content
  _updateTelemetryUI();

  // Preserve mode in URL hash if student record is visible
  if (updateUrl && currentStudentId) {
    const hashStr = isJuicyMode ? currentStudentId : `${currentStudentId}?vanilla`;
    history.replaceState(null, '', window.location.pathname + '#' + hashStr);
  }
}

// ==========================================================================
// Canvas Particle System
// ==========================================================================

function initCanvas() {
  canvas = document.getElementById('fxCanvas');
  if (canvas) {
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  }
}

function resizeCanvas() {
  if (!canvas) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function createParticle(x, y, colorPalette, shape = 'circle', customOpts = {}) {
  const angle = customOpts.angle !== undefined ? customOpts.angle : Math.random() * Math.PI * 2;
  const speed = customOpts.speed !== undefined ? customOpts.speed : (2.5 + Math.random() * 5.5);
  const size = customOpts.size !== undefined ? customOpts.size : (3 + Math.random() * 4.5);
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed + (customOpts.vyOffset !== undefined ? customOpts.vyOffset : -3.0),
    size,
    color: colorPalette[Math.floor(Math.random() * colorPalette.length)],
    alpha: 1,
    decay: customOpts.decay !== undefined ? customOpts.decay : (0.018 + Math.random() * 0.02),
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.18,
    tilt: Math.random() * Math.PI * 2,
    tiltSpeed: (Math.random() - 0.5) * 0.15,
    gravity: customOpts.gravity !== undefined ? customOpts.gravity : 0.2,
    drag: customOpts.drag !== undefined ? customOpts.drag : 0.98,
    shape
  };
}

function spawnBurstAtElement(element, colorPalette, shape = 'circle', count = 22) {
  if (!isJuicyMode || !canvas || !ctx) return;
  resizeCanvas();
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  for (let i = 0; i < count; i++) {
    particles.push(createParticle(centerX, centerY, colorPalette, shape));
  }

  if (!animFrameId) {
    animateParticles();
  }
}

function animateParticles() {
  if (!ctx || particles.length === 0) {
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    animFrameId = null;
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity !== undefined ? p.gravity : 0.2;
    p.vx *= p.drag !== undefined ? p.drag : 0.98;
    p.alpha -= p.decay;
    p.rotation += p.rotSpeed;
    if (p.tilt !== undefined) {
      p.tilt += p.tiltSpeed;
    }

    if (p.alpha <= 0 || p.y > canvas.height + 60) {
      // Fast O(1) swap-and-pop removal avoids shifting remaining array elements
      particles[i] = particles[particles.length - 1];
      particles.pop();
      continue;
    }

    if (p.shape === 'rect' || p.shape === 'ribbon') {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      const tiltScale = Math.sin(p.tilt || 0);
      ctx.scale(1, tiltScale);
      ctx.fillRect(-p.size * 1.2, -p.size * 0.6, p.size * 2.4, p.size * 1.2);
      ctx.restore();
    } else if (p.shape === 'diamond') {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.lineTo(p.size * 0.75, 0);
      ctx.lineTo(0, p.size);
      ctx.lineTo(-p.size * 0.75, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      // Circles are rotationally invariant: draw directly without matrix transform overhead
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  animFrameId = requestAnimationFrame(animateParticles);
}

// ==========================================================================
// Score Roll-Up Counter
// ==========================================================================

function animateCounter(element, targetVal) {
  if (!element) return;
  if (!isJuicyMode) {
    element.textContent = targetVal.toFixed(1);
    return;
  }

  const duration = 600;
  const startTime = performance.now();
  const startVal = 0.0;

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = startVal + (targetVal - startVal) * ease;
    element.textContent = current.toFixed(1);

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      element.textContent = targetVal.toFixed(1);
      element.classList.remove('pop-number');
      void element.offsetWidth;
      element.classList.add('pop-number');
    }
  }
  requestAnimationFrame(step);
}

// Show alert banner
function showAlert(message, type = 'error') {
  const alertBox = document.getElementById('alertBox');
  alertBox.className = type === 'error' 
    ? 'mt-3 p-3.5 rounded-lg text-xs font-medium border bg-rose-50 border-rose-200 text-rose-800 shadow-2xs' 
    : 'mt-3 p-3.5 rounded-lg text-xs font-medium border bg-blue-50 border-blue-200 text-blue-800 shadow-2xs';
  alertBox.textContent = message;
  alertBox.classList.remove('hidden');
}

function hideAlert() {
  document.getElementById('alertBox').classList.add('hidden');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Render Transaction Ledger Item
function createTransactionRow(tx, index = 0) {
  const row = document.createElement('div');
  row.className = `flex items-center justify-between py-1 px-2 rounded bg-slate-50/80 border border-slate-200/70 text-[11px] ${isJuicyMode ? 'ledger-item' : ''}`;
  if (isJuicyMode) {
    row.style.setProperty('--item-idx', index);
  }

  const deltaVal = Number(tx.delta !== undefined ? tx.delta : 0);
  const isPositive = deltaVal > 0;
  const deltaColor = tx.type === 'BASE' ? 'text-slate-500' : (isPositive ? 'text-emerald-700' : 'text-rose-700');
  const deltaSign = isPositive && tx.type !== 'BASE' ? '+' : '';
  const reasonText = escapeHtml(tx.reason || tx.type || '');
  const dateText = escapeHtml(tx.date || '');

  row.innerHTML = `
    <div class="flex items-center space-x-2 truncate min-w-0 pr-1">
      <span class="text-[10px] text-slate-400 font-mono shrink-0">${dateText}</span>
      <span class="text-slate-700 truncate font-normal" title="${reasonText}">${reasonText}</span>
    </div>
    <span class="font-bold shrink-0 ml-2 font-mono ${deltaColor}">${deltaSign}${deltaVal.toFixed(1)}</span>
  `;
  return row;
}

// Populate Course Card
function renderCourseCard(courseKey, data) {
  const isGetxr = courseKey === 'GETXR';
  const prefix = isGetxr ? 'getxr' : 'threedma';
  const cardEl = document.getElementById(isGetxr ? 'cardGetxr' : 'card3dma');

  const badge = document.getElementById(`${prefix}StatusBadge`);
  const ledger = document.getElementById(`${prefix}Ledger`);
  const notEnrolledEl = document.getElementById(`${prefix}NotEnrolled`);
  const enrolledContentEl = document.getElementById(`${prefix}EnrolledContent`);
  const ledgerSectionEl = document.getElementById(`${prefix}LedgerSection`);
  const reasonEl = document.getElementById(`${prefix}NotEnrolledReason`);

  if (ledger) ledger.innerHTML = '';
  if (cardEl) {
    cardEl.classList.remove('aura-glow-gold', 'aura-glow-indigo');
  }

  if (!data || !data.enrolled) {
    if (badge) {
      badge.className = 'inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600 border border-slate-200 shrink-0';
      badge.innerHTML = isJuicyMode
        ? `<svg class="w-3 h-3 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg><span>Not Enrolled</span>`
        : '<span>Not Enrolled</span>';
      badge.title = 'Not enrolled in this course.';
    }

    if (notEnrolledEl) notEnrolledEl.classList.remove('hidden');
    if (enrolledContentEl) enrolledContentEl.classList.add('hidden');
    if (ledgerSectionEl) ledgerSectionEl.classList.add('hidden');

    if (reasonEl && data?.reason) {
      reasonEl.textContent = data.reason;
    }
    return;
  }

  // Active Enrollment
  if (notEnrolledEl) notEnrolledEl.classList.add('hidden');
  if (enrolledContentEl) enrolledContentEl.classList.remove('hidden');
  if (ledgerSectionEl) ledgerSectionEl.classList.remove('hidden');

  const balance = data.balance || 0.0;
  const earned = data.earned || 0.0;
  const spent = data.spent || 0.0;

  // Single unified status badge with crisp Lucide vector micro-SVGs (never wraps course title)
  if (badge) {
    if (isJuicyMode) {
      if (balance >= 3.0) {
        badge.className = 'inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800 border border-amber-300 shrink-0';
        badge.innerHTML = `<svg class="w-3 h-3 text-amber-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><span>Stockpiler</span>`;
        badge.title = 'Vault reserve ≥ 3.0 tokens. Ready for milestone crunches.';
        if (cardEl) cardEl.classList.add(isGetxr ? 'aura-glow-gold' : 'aura-glow-indigo');
      } else if (earned > 0.0) {
        badge.className = 'inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0';
        badge.innerHTML = `<svg class="w-3 h-3 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg><span>Prepared</span>`;
        badge.title = 'Attendance credits banked. Inventory bolstered.';
        if (balance >= 2.5 && cardEl) {
          cardEl.classList.add(isGetxr ? 'aura-glow-gold' : 'aura-glow-indigo');
        }
      } else if (spent > 0.0) {
        badge.className = 'inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-purple-50 text-purple-700 border border-purple-200 shrink-0';
        badge.innerHTML = `<svg class="w-3 h-3 text-purple-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>Extended</span>`;
        badge.title = 'Late tokens deployed for milestone refinement.';
      } else {
        badge.className = isGetxr 
          ? 'inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700 border border-blue-200 shrink-0'
          : 'inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700 border border-amber-200 shrink-0';
        badge.innerHTML = `<svg class="w-3 h-3 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span>Enrolled</span>`;
        badge.title = 'Base tokens primed.';
      }
    } else {
      badge.className = 'inline-flex items-center text-[11px] px-2.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-700 border border-slate-200 shrink-0';
      badge.textContent = 'Enrolled';
      badge.title = 'Enrolled in this course.';
    }
  }

  const balanceEl = document.getElementById(`${prefix}Balance`);
  animateCounter(balanceEl, balance);

  document.getElementById(`${prefix}Base`).textContent = (data.base || 2.0).toFixed(1);
  document.getElementById(`${prefix}Earned`).textContent = `+${earned.toFixed(1)}`;
  document.getElementById(`${prefix}Spent`).textContent = `-${spent.toFixed(1)}`;

  // Render transactions (reversed for newest first) with optional stagger
  const transactions = (data.transactions || []).slice().reverse();
  if (transactions.length === 0) {
    ledger.innerHTML = '<div class="text-[11px] text-slate-500 py-1">No transaction history yet.</div>';
  } else {
    transactions.forEach((tx, idx) => ledger.appendChild(createTransactionRow(tx, idx)));
  }

  // Trigger celebratory particle burst if in juicy mode
  if (isJuicyMode && balanceEl) {
    const colors = isGetxr 
      ? ['#f59e0b', '#fbbf24', '#fde047', '#eab308', '#3b82f6']
      : ['#6366f1', '#818cf8', '#a855f7', '#c084fc', '#f43f5e'];
    const shape = isGetxr ? 'circle' : 'diamond';
    const count = balance >= 3.0 ? 30 : (balance >= 2.5 ? 20 : 12);
    setTimeout(() => {
      spawnBurstAtElement(balanceEl, colors, shape, count);
    }, 300);
  }
}

// Extract student ID from URL (hash or query parameter)
function getStudentIdFromUrl() {
  // 1. Check hash (#s1000001 or #/s1000001 or #s1000001?vanilla)
  if (window.location.hash) {
    const hash = window.location.hash.replace(/^#\/?/, '').trim();
    if (hash) {
      const paramMatch = hash.match(/(?:id|student)=([a-z0-9]+)/i);
      if (paramMatch) return paramMatch[1];
      const cleanHash = hash.split(/[?&]/)[0].replace(/\/$/, '');
      if (cleanHash) return cleanHash;
    }
  }

  // 2. Check query params (?id=s1000001 or ?student=s1000001)
  if (window.location.search) {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || params.get('student');
    if (id) return id.trim();
  }

  return '';
}

// Perform token balance lookup
async function performLookup(rawId, updateUrl = true) {
  hideAlert();

  const inputEl = document.getElementById('studentIdInput');
  const submitBtn = document.getElementById('submitBtn');
  const searchIcon = document.getElementById('searchIcon');
  const loadingSpinner = document.getElementById('loadingSpinner');
  const resultsContainer = document.getElementById('resultsContainer');

  if (!rawId) {
    showAlert('Please enter your student number (e.g. 1234567 or s1234567).');
    inputEl.focus();
    return;
  }

  // Keep input field synced with queried ID and dismiss mobile keyboard
  inputEl.value = rawId;
  inputEl.blur();

  submitBtn.disabled = true;
  searchIcon.classList.add('hidden');
  loadingSpinner.classList.remove('hidden');

  try {
    const salt = appConfig?.salt || 'm5_interactive_media_2026_salt';
    let studentId = normalizeStudentId(rawId);
    let hash = await computeHash(salt, studentId);

    let res = await fetch(`data/${hash}.json?t=${Date.now()}`);
    
    // Fallback: If 404, check un-prefixed digits (in case student number was indexed without 's')
    if (!res.ok && res.status === 404) {
      const rawDigits = rawId.trim().toLowerCase().replace(/^s\s*/i, '');
      if (rawDigits && rawDigits !== studentId) {
        const fallbackHash = await computeHash(salt, rawDigits);
        const fallbackRes = await fetch(`data/${fallbackHash}.json?t=${Date.now()}`);
        if (fallbackRes.ok) {
          res = fallbackRes;
          studentId = rawDigits;
        }
      }
    }

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`Student number "${studentId}" was not found in the course roster. Please double-check the number or contact your instructor.`);
      }
      throw new Error(`Error loading record (${res.status}). Please try again.`);
    }

    const data = await res.json();
    currentStudentId = studentId;
    
    // Set student number badge & update input
    document.getElementById('displayStudentId').textContent = studentId;
    inputEl.value = studentId;

    // Populate cards
    renderCourseCard('GETXR', data.courses ? data.courses['GETXR'] : undefined);
    renderCourseCard('3DMA', data.courses ? data.courses['3DMA'] : undefined);

    // Update URL hash for bookmarking and browser title
    if (updateUrl) {
      const hashStr = isJuicyMode ? studentId : `${studentId}?vanilla`;
      history.replaceState(null, '', window.location.pathname + '#' + hashStr);
    }
    document.title = `IM 2026 Tokens — ${studentId}`;

    resultsContainer.classList.remove('hidden');
    if (window.innerWidth < 768) {
      setTimeout(() => {
        resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  } catch (err) {
    currentStudentId = '';
    resultsContainer.classList.add('hidden');
    document.title = 'IM 2026 Token Lookup';
    const isNetworkError = err.name === 'TypeError' || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError');
    const msg = isNetworkError 
      ? 'Unable to connect to the server. Please check your internet connection and try again.'
      : (err.message || 'An unexpected error occurred.');
    showAlert(msg);
  } finally {
    submitBtn.disabled = false;
    searchIcon.classList.remove('hidden');
    loadingSpinner.classList.add('hidden');
  }
}

// Form Submission Handler
function handleFormSubmit(e) {
  e.preventDefault();
  const inputEl = document.getElementById('studentIdInput');
  const rawId = inputEl.value.trim();
  const lower = rawId.toLowerCase();

  // Reset / Clear secrets discovery log
  if (lower === 'clear' || lower === 'reset') {
    inputEl.value = '';
    inputEl.blur();
    _clearDiscoveredTelemetry();
    return;
  }

  // Diagnostic maneuver sequence (matches any string containing 'roll' in Juicy mode)
  if (isJuicyMode && lower.includes('roll')) {
    inputEl.value = '';
    inputEl.blur();
    _execManeuver();
    return;
  }

  performLookup(rawId, true);
}

// Clear search handler
function handleClearSearch() {
  currentStudentId = '';
  document.getElementById('studentIdInput').value = '';
  document.getElementById('resultsContainer').classList.add('hidden');
  hideAlert();
  document.title = 'IM 2026 Token Lookup';
  if (window.location.hash || window.location.search) {
    history.replaceState(null, '', window.location.pathname);
  }
  document.getElementById('studentIdInput').focus();
}

// ==========================================================================
// Protocol Telemetry & Diagnostics (7 Subsystems)
// Nice try inspecting the source! You didn't think it would be THAT easy, right? 😉
// Searching for secrets in DevTools? Try interacting with the page instead of Ctrl+F!
// ==========================================================================

const _K_STORE = atob('aW1fdG9rZW5zX2Rpc2NvdmVyZWRfZWdncw==');

// Subsystem telemetry manifest (10 secrets)
const _0xM = [
  { id: '0x1a', name: atob('VG9rZW4gQ29pbiBGbGlw') },       // Token Coin Flip
  { id: '0x2b', name: atob('RG8gYSBCYXJyZWwgUm9sbA==') },   // Do a Barrel Roll
  { id: '0x3c', name: atob('S29uYW1pIENvZGU=') },           // Konami Code
  { id: '0x4d', name: atob('R29sZGVuIFRpY2tldA==') },       // Golden Ticket
  { id: '0x5e', name: atob('QXNzZXQgSW5zcGVjdG9y') },      // Asset Inspector
  { id: '0x6f', name: atob('RG9pbmcgdGhlIFNodWZmbGU=') },   // Doing the Shuffle
  { id: '0x7g', name: atob('VGhlIFZvaWQ=') },               // The Void
  { id: '0x8h', name: atob('VGhlIEVhc3RlciBFZ2c=') },       // The Easter Egg
  { id: '0x9i', name: atob('VG9rZW4gT3ZlcmNsb2Nr') },      // Token Overclock
  { id: '0xaj', name: atob('R3VhcmRpYW4ncyBCbGVzc2luZw==') } // Guardian's Blessing
];

function _getDiscoveredTelemetry() {
  try {
    const raw = localStorage.getItem(_K_STORE);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    return new Set();
  }
}

function _unlockTelemetry(tag) {
  if (!isJuicyMode) {
    return { isNew: false, totalFound: 0 };
  }

  const discovered = _getDiscoveredTelemetry();
  const isNew = !discovered.has(tag);

  if (isNew) {
    discovered.add(tag);
    try {
      localStorage.setItem(_K_STORE, JSON.stringify([...discovered]));
    } catch (e) {}
  }

  _updateTelemetryUI();
  return { isNew, totalFound: discovered.size };
}

function _clearDiscoveredTelemetry() {
  try {
    localStorage.removeItem(_K_STORE);
  } catch (e) {}
  _updateTelemetryUI();
  if (isJuicyMode) {
    _notifyTelemetry(atob('U2VjcmV0cyBjb3VudGVyIHJlc2V0OiAwLzEw'));
  }
}

function _updateTelemetryUI() {
  const container = document.getElementById('eggCounterContainer');
  const textEl = document.getElementById('eggCounterText');
  if (!container) return;

  if (!isJuicyMode) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');

  const discovered = _getDiscoveredTelemetry();
  const count = discovered.size;
  const total = _0xM.length;

  const easterEgg3D = document.getElementById('easterEgg3D');
  if (easterEgg3D) {
    if (discovered.has('0x8h')) {
      easterEgg3D.classList.add('claimed');
    } else {
      easterEgg3D.classList.remove('claimed');
    }
  }

  if (count === total) {
    container.className = 'achievement-badge aura-glow-gold';
    container.innerHTML = `
      <picture class="shrink-0 block leading-none select-none">
        <source srcset="assets/achievement.webp" type="image/webp">
        <img src="assets/achievement.png" alt="Master of Secrets" class="achievement-avatar">
      </picture>
      <div class="achievement-text-group select-none">
        <span class="achievement-label">Achievement Unlocked</span>
        <span class="achievement-title">Master of Secrets (${total}/${total})</span>
      </div>
    `;
    container.setAttribute('title', `🏆 Master of Secrets (${total}/${total})\nAll secrets unlocked! Click to celebrate.`);
    container.onclick = () => {
      if (!isJuicyMode) return;
      container.classList.remove('badge-celebrate');
      void container.offsetWidth;
      container.classList.add('badge-celebrate');

      const avatar = container.querySelector('.achievement-avatar');
      if (avatar) {
        avatar.classList.remove('logo-bobble');
        void avatar.offsetWidth;
        avatar.classList.add('logo-bobble');
      }

      _dispenseCelebrationParticles();
      _notifyTelemetry(atob('QWNoaWV2ZW1lbnQ6IE1hc3RlciBvZiBTZWNyZXRzISBBbGwgc2VjcmV0cyB1bmxvY2tlZC4='));
    };
  } else {
    container.className = count > 0
      ? 'inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-mono bg-slate-100 text-slate-700 border border-slate-300 transition-all select-none shadow-2xs cursor-default'
      : 'inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-mono bg-slate-100/90 text-slate-500 border border-slate-200 transition-all select-none shadow-2xs cursor-default';
    container.innerHTML = `
      <svg class="w-3.5 h-3.5 text-amber-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
      <span id="eggCounterText">Secrets discovered: ${count}/${total}</span>
    `;
    container.onclick = null;
    container.removeAttribute('title');
  }
}

// 1. Angular Maneuver Routine
function _execManeuver() {
  if (!isJuicyMode) return;

  const container = document.getElementById('mainContainer') || document.querySelector('main') || document.body;
  container.classList.remove('barrel-rolling');
  void container.offsetWidth;
  container.classList.add('barrel-rolling');

  const { isNew, totalFound } = _unlockTelemetry('0x2b');
  const suffix = isNew ? ` (Secret unlocked: ${totalFound}/${_0xM.length}!)` : '';
  _notifyTelemetry(`${atob('WiBvciBSIHR3aWNlIQ==')}${suffix}`);

  setTimeout(() => {
    container.classList.remove('barrel-rolling');
  }, 1350);
}

// 2. Input Telemetry Monitor (Diagnostic Keyframe Routine)
// Looking for keycodes in DevTools? 🎮 You didn't think it would be THAT easy, right?
const _SIG = ['AU', 'AU', 'AD', 'AD', 'AL', 'AR', 'AL', 'AR', '62', '61'];
let _kPos = 0;
let toastTimeout = null;

function _sigKey(k) {
  if (k === 'ArrowUp' || k === 'Up') return 'AU';
  if (k === 'ArrowDown' || k === 'Down') return 'AD';
  if (k === 'ArrowLeft' || k === 'Left') return 'AL';
  if (k === 'ArrowRight' || k === 'Right') return 'AR';
  if (k === 'b' || k === 'B') return '62';
  if (k === 'a' || k === 'A') return '61';
  return '';
}

function _notifyTelemetry(message) {
  if (!isJuicyMode) return;

  let toast = document.getElementById('easterEggToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'easterEggToast';
    toast.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2.5 rounded-full bg-slate-900/95 text-white text-xs font-mono font-medium shadow-2xl border border-slate-700/80 flex items-center space-x-2.5 pointer-events-none transition-all duration-300 opacity-0 -translate-y-4';
    toast.innerHTML = `
      <svg class="w-4 h-4 text-amber-400 shrink-0 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
      <span id="easterEggToastMsg"></span>
    `;
    document.body.appendChild(toast);
  }

  const msgEl = document.getElementById('easterEggToastMsg');
  if (msgEl) msgEl.textContent = message;

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.remove('opacity-0', '-translate-y-4');
    toast.classList.add('opacity-100', 'translate-y-0');
  });

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', '-translate-y-4');
  }, 3500);
}

function _dispenseCelebrationParticles() {
  if (!isJuicyMode) return;
  if (!canvas || !ctx) {
    initCanvas();
  }
  if (!canvas || !ctx) return;
  resizeCanvas();

  const confettiPalette = [
    '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', 
    '#10b981', '#f97316', '#06b6d4', '#e11d48', 
    '#84cc16', '#fbbf24', '#a855f7', '#6366f1'
  ];
  const shapes = ['rect', 'diamond', 'circle', 'rect'];

  function fireVolley(multiplier = 1.0) {
    const w = canvas.width;
    const h = canvas.height;

    // Left cannon
    for (let i = 0; i < Math.floor(45 * multiplier); i++) {
      const angle = -Math.PI / 4 + (Math.random() - 0.5) * 0.7;
      const speed = 13 + Math.random() * 16;
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      particles.push(createParticle(w * 0.05, h * 0.95, confettiPalette, shape, {
        angle,
        speed,
        vyOffset: 0,
        size: 4.5 + Math.random() * 5.5,
        decay: 0.005 + Math.random() * 0.006,
        gravity: 0.22,
        drag: 0.975
      }));
    }

    // Right cannon
    for (let i = 0; i < Math.floor(45 * multiplier); i++) {
      const angle = -3 * Math.PI / 4 + (Math.random() - 0.5) * 0.7;
      const speed = 13 + Math.random() * 16;
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      particles.push(createParticle(w * 0.95, h * 0.95, confettiPalette, shape, {
        angle,
        speed,
        vyOffset: 0,
        size: 4.5 + Math.random() * 5.5,
        decay: 0.005 + Math.random() * 0.006,
        gravity: 0.22,
        drag: 0.975
      }));
    }

    // Center fountain burst
    for (let i = 0; i < Math.floor(35 * multiplier); i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const speed = 10 + Math.random() * 14;
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      particles.push(createParticle(w * 0.5, h * 0.75, confettiPalette, shape, {
        angle,
        speed,
        vyOffset: 0,
        size: 4.5 + Math.random() * 5.5,
        decay: 0.005 + Math.random() * 0.006,
        gravity: 0.2,
        drag: 0.98
      }));
    }

    if (!animFrameId) {
      animateParticles();
    }
  }

  // Sustained waves
  fireVolley(1.0);
  setTimeout(() => fireVolley(0.85), 220);
  setTimeout(() => fireVolley(0.7), 480);
}

function spawnEggShatterParticles(element) {
  if (!isJuicyMode || !canvas || !ctx) return;
  resizeCanvas();
  const rect = element.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const goldPalette = ['#ffffff', '#fef08a', '#fde047', '#fbbf24', '#f59e0b', '#d97706', '#fb7185'];

  // 1. High-velocity golden shards exploding radially in all directions
  const shardCount = 50;
  for (let i = 0; i < shardCount; i++) {
    const shape = Math.random() > 0.4 ? 'diamond' : (Math.random() > 0.5 ? 'rect' : 'circle');
    const angle = Math.random() * Math.PI * 2;
    const speed = 4.0 + Math.random() * 8.5;
    particles.push(createParticle(cx, cy, goldPalette, shape, {
      angle,
      speed,
      size: 3.5 + Math.random() * 4.5,
      decay: 0.016 + Math.random() * 0.02,
      gravity: 0.12,
      vyOffset: -2.5
    }));
  }

  // 2. Rising golden sparkle stars and dust
  const sparkleCount = 25;
  for (let i = 0; i < sparkleCount; i++) {
    particles.push(createParticle(
      cx + (Math.random() - 0.5) * 60,
      cy + (Math.random() - 0.5) * 80,
      goldPalette,
      'circle',
      {
        speed: 1.5 + Math.random() * 3.5,
        size: 2.5 + Math.random() * 3.5,
        decay: 0.014 + Math.random() * 0.018,
        gravity: 0.04,
        vyOffset: -4.5
      }
    ));
  }

  if (!animFrameId) {
    animateParticles();
  }
}

function _setupKListener() {
  window.addEventListener('keydown', (e) => {
    if (!isJuicyMode) {
      _kPos = 0;
      return;
    }

    const sig = _sigKey(e.key);
    const expected = _SIG[_kPos];

    if (sig && sig === expected) {
      _kPos++;
      if (_kPos === _SIG.length) {
        _kPos = 0;
        e.preventDefault();

        // If user was typing in input, clean trailing character and unfocus
        const inputEl = document.getElementById('studentIdInput');
        if (inputEl && document.activeElement === inputEl) {
          if (inputEl.value.toLowerCase().endsWith('b') || inputEl.value.toLowerCase().endsWith('a')) {
            inputEl.value = inputEl.value.slice(0, -1);
          }
          inputEl.blur();
        }

        const { isNew, totalFound } = _unlockTelemetry('0x3c');
        const suffix = isNew ? ` (Secret unlocked: ${totalFound}/${_0xM.length}!)` : '';
        _notifyTelemetry(`${atob('S29uYW1pIENvZGU6IENoZWF0IE1vZGUgQWN0aXZhdGVkIQ==')}${suffix}`);
        _dispenseCelebrationParticles();
      }
    } else {
      _kPos = (sig === _SIG[0]) ? 1 : 0;
    }
  });
}

// 3. Vault Token Kinetic Flip & Token Overclock
function _setupFlipListener() {
  ['getxrBalance', 'threedmaBalance'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    let clickTimes = [];
    let longPressTimer = null;
    let isOverclocking = false;

    function triggerOverclock() {
      if (isOverclocking || !isJuicyMode) return;
      isOverclocking = true;

      const trueVal = el.getAttribute('data-true-val') || el.textContent.trim();
      el.setAttribute('data-true-val', trueVal);

      el.classList.remove('coin-flip', 'pop-number');
      el.classList.add('token-overclocking');

      const fakeVals = ['7.7', '9.9', '0.0', '13.37', '42.0', '99.9', '8.5', '3.14', '77.7', '999.0', '404.0'];
      const startTime = performance.now();
      const duration = 1400; // 1.4s of slot machine spinning

      function spinReel() {
        const elapsed = performance.now() - startTime;
        if (elapsed < duration) {
          const rndVal = fakeVals[Math.floor(Math.random() * fakeVals.length)];
          el.textContent = rndVal;

          // Emit small sparks during overclock
          if (Math.random() > 0.4) {
            const colors = ['#f59e0b', '#fbbf24', '#fde047', '#eab308', '#ea580c'];
            spawnBurstAtElement(el, colors, 'circle', 2);
          }
          requestAnimationFrame(spinReel);
        } else {
          // Snap back to real balance
          el.classList.remove('token-overclocking');
          el.textContent = el.getAttribute('data-true-val') || trueVal;
          void el.offsetWidth;
          el.classList.add('pop-number');

          // Huge golden celebration particle blast!
          _dispenseCelebrationParticles();
          const goldColors = ['#f59e0b', '#fbbf24', '#fde047', '#eab308', '#d97706'];
          spawnBurstAtElement(el, goldColors, 'circle', 30);

          const { isNew, totalFound } = _unlockTelemetry('0x9i');
          const suffix = isNew ? ` (Secret unlocked: ${totalFound}/${_0xM.length}!)` : '';
          _notifyTelemetry(`Token balance overclocked! (No actual inflation occurred)${suffix}`);

          setTimeout(() => {
            isOverclocking = false;
          }, 600);
        }
      }

      requestAnimationFrame(spinReel);
    }

    // Long press handler (1.1s hold)
    function startLongPress() {
      if (!isJuicyMode || isOverclocking) return;
      longPressTimer = setTimeout(() => {
        triggerOverclock();
      }, 1100);
    }

    function cancelLongPress() {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }

    el.addEventListener('mousedown', startLongPress);
    el.addEventListener('mouseup', cancelLongPress);
    el.addEventListener('mouseleave', cancelLongPress);
    el.addEventListener('touchstart', startLongPress, { passive: true });
    el.addEventListener('touchend', cancelLongPress);
    el.addEventListener('touchcancel', cancelLongPress);

    el.addEventListener('click', () => {
      if (!isJuicyMode || isOverclocking) return;

      const now = performance.now();
      clickTimes.push(now);
      clickTimes = clickTimes.filter(t => (now - t) < 1500);

      if (clickTimes.length >= 5) {
        clickTimes = [];
        cancelLongPress();
        triggerOverclock();
        return;
      }

      el.classList.remove('pop-number');
      el.classList.remove('coin-flip');
      void el.offsetWidth;
      el.classList.add('coin-flip');

      setTimeout(() => {
        el.classList.remove('coin-flip');
      }, 700);

      const isGetxr = id.startsWith('getxr');
      const colors = isGetxr 
        ? ['#f59e0b', '#fbbf24', '#fde047', '#eab308'] 
        : ['#818cf8', '#a855f7', '#c084fc', '#6366f1'];
      const shape = isGetxr ? 'circle' : 'diamond';
      spawnBurstAtElement(el, colors, shape, 14);

      const { isNew, totalFound } = _unlockTelemetry('0x1a');
      const suffix = isNew ? ` (Secret unlocked: ${totalFound}/${_0xM.length}!)` : '';
      _notifyTelemetry(`${atob('VG9rZW4gZmxpcHBlZCE=')}${suffix}`);
    });
  });
}

// 4. Header Micro-Asset Routine
function _setupTicketListener() {
  const ticket = document.getElementById('headerTicketIcon');
  if (!ticket) return;

  ticket.addEventListener('click', () => {
    if (!isJuicyMode) return;

    ticket.classList.remove('ticket-spin');
    void ticket.offsetWidth;
    ticket.classList.add('ticket-spin');

    setTimeout(() => {
      ticket.classList.remove('ticket-spin');
    }, 700);

    spawnBurstAtElement(ticket, ['#f59e0b', '#fbbf24', '#fde047', '#3b82f6'], 'circle', 16);

    const { isNew, totalFound } = _unlockTelemetry('0x4d');
    const suffix = isNew ? ` (Secret unlocked: ${totalFound}/${_0xM.length}!)` : '';
    _notifyTelemetry(`${atob('R29sZGVuIFRpY2tldCB2ZXJpZmllZCE=')}${suffix}`);
  });
}

// 5. Course Logo Shader Inspector
function _setupLogoListener() {
  [
    { id: 'getxrLogo', isGetxr: true },
    { id: 'threedmaLogo', isGetxr: false }
  ].forEach(({ id, isGetxr }) => {
    const logo = document.getElementById(id);
    if (!logo) return;

    logo.addEventListener('click', () => {
      if (!isJuicyMode) return;

      logo.classList.remove('logo-bobble');
      void logo.offsetWidth;
      logo.classList.add('logo-bobble');

      setTimeout(() => {
        logo.classList.remove('logo-bobble');
      }, 650);

      const colors = isGetxr 
        ? ['#f59e0b', '#fbbf24', '#fde047'] 
        : ['#818cf8', '#a855f7', '#c084fc'];
      const shape = isGetxr ? 'circle' : 'diamond';
      spawnBurstAtElement(logo, colors, shape, 16);

      const { isNew, totalFound } = _unlockTelemetry('0x5e');
      const suffix = isNew ? ` (Secret unlocked: ${totalFound}/${_0xM.length}!)` : '';
      _notifyTelemetry(`${atob('QXNzZXQgaW5zcGVjdGVkOiBTaGFkZXJzIGNvbXBpbGVkIQ==')}${suffix}`);
    });
  });
}

// 10. DevTools Console Guardian Cat Petting (Secret 10: "Guardian's Blessing")
function _spawnHeartPawsBurst() {
  if (!isJuicyMode || !canvas || !ctx) return;
  resizeCanvas();
  const palette = ['#f43f5e', '#ec4899', '#fb7185', '#f59e0b', '#fbbf24', '#e879f9'];
  const w = window.innerWidth;
  const h = window.innerHeight;

  for (let i = 0; i < 36; i++) {
    const sx = w * 0.15 + Math.random() * (w * 0.7);
    const sy = h - 20 - Math.random() * 80;
    particles.push(createParticle(sx, sy, palette, 'circle', {
      speed: 1.0 + Math.random() * 3.5,
      size: 4.0 + Math.random() * 5.0,
      decay: 0.012 + Math.random() * 0.015,
      gravity: -0.08, // float UP!
      vyOffset: -4.5 - Math.random() * 3.5
    }));
  }

  if (!animFrameId) {
    animateParticles();
  }
}

function _setupGuardianCatListener() {
  window.petCat = function() {
    if (!isJuicyMode) {
      console.log('%c[Guardian Cat] Switch to Juicy Mode to unlock secrets!', 'color: #94a3b8; font-style: italic;');
      return '🐱 *tail flick*';
    }

    const { isNew, totalFound } = _unlockTelemetry('0xaj');
    const suffix = isNew ? ` (Secret unlocked: ${totalFound}/${_0xM.length}!)` : '';
    _notifyTelemetry(`Guardian Cat purrs happily!${suffix}`);

    _spawnHeartPawsBurst();

    console.log(
`%c       /\\_/\\
      ( ^.^ )  *purrrrrrrrr*
       > 🐾 <  "Thank you for the scratches! May your commits be bug-free."
               Secret unlocked: Guardian's Blessing! (${totalFound}/${_0xM.length})`,
      'color: #f59e0b; font-family: monospace; font-weight: bold; font-size: 12px; line-height: 1.4;'
    );

    return '🐱 *happy purr*';
  };

  window.pet = window.petCat;
  window.cat = window.petCat;
  window.guardianCat = { pet: window.petCat };
  window.petCat.pet = window.petCat;
  window.petCat.toString = () => { window.petCat(); return '🐱 *happy purr*'; };
}

// ==========================================================================
// Card Drag & Reorder System (Secret 6: "Doing the Shuffle")
// ==========================================================================

const _CARD_ORDER_KEY = 'im_tokens_card_order';

function initCardOrder() {
  const grid = document.getElementById('courseCardsGrid');
  if (!grid) return;

  try {
    const raw = localStorage.getItem(_CARD_ORDER_KEY);
    if (raw) {
      const order = JSON.parse(raw);
      if (Array.isArray(order) && order.length === 2) {
        const firstEl = document.getElementById(order[0]);
        const secondEl = document.getElementById(order[1]);
        if (firstEl && secondEl && grid.firstElementChild !== firstEl) {
          grid.appendChild(secondEl);
        }
      }
    }
  } catch (e) {}
}

let isCardDragging = false;

function setupCardDrag() {
  const grid = document.getElementById('courseCardsGrid');
  if (!grid) return;

  const cards = [document.getElementById('cardGetxr'), document.getElementById('card3dma')];

  cards.forEach(card => {
    if (!card) return;

    card.addEventListener('dragstart', (e) => e.preventDefault());

    card.addEventListener('pointerdown', (e) => {
      if (!isJuicyMode) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      // Ignore interactive child controls (token flip, logo bobble, buttons, ledger scrolling)
      if (e.target.closest('#getxrBalance, #threedmaBalance, #getxrLogo, #threedmaLogo, #getxrLedger, #threedmaLedger, button, a, input')) {
        return;
      }

      const otherCard = cards.find(c => c && c !== card);
      if (!otherCard) return;

      e.preventDefault(); // Stop native text selection or ghost drag

      let isDraggingThis = false;
      const startX = e.clientX;
      const startY = e.clientY;

      // Immediately pause tilt listeners
      isCardDragging = true;

      function onMove(moveEvent) {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        const dist = Math.hypot(dx, dy);

        if (!isDraggingThis) {
          if (dist < 5) return;
          isDraggingThis = true;
          card.classList.add('card-dragging');
          card.classList.remove('tilt-card-reset');
          card.style.setProperty('pointer-events', 'none');
          card.style.setProperty('transition', 'none', 'important');
        }

        moveEvent.preventDefault();

        // Direct 1:1 cursor tracking with subtle playful rotation
        const rot = Math.max(-6, Math.min(6, dx * 0.03));
        card.style.setProperty('transform', `translate3d(${dx}px, ${dy}px, 60px) rotate(${rot}deg) scale(1.03)`, 'important');

        // Visual anticipation on partner card
        const isHorizontal = window.innerWidth >= 768;
        const isFirst = grid.firstElementChild === card;
        const primaryDelta = isHorizontal ? dx : dy;
        const towardsOther = isFirst ? (primaryDelta > 50) : (primaryDelta < -50);

        if (towardsOther) {
          const nudge = isFirst ? -16 : 16;
          otherCard.style.setProperty('transition', 'transform 0.2s cubic-bezier(0.25, 1, 0.5, 1)', 'important');
          otherCard.style.setProperty('transform', isHorizontal 
            ? `translateX(${nudge}px) scale(0.98)` 
            : `translateY(${nudge}px) scale(0.98)`, 'important');
        } else {
          otherCard.style.setProperty('transition', 'transform 0.2s ease-out', 'important');
          otherCard.style.removeProperty('transform');
        }
      }

      function onEnd(upEvent) {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);

        card.style.removeProperty('pointer-events');
        isCardDragging = false;

        if (!isDraggingThis) return; // Clean click, no drag

        const dx = upEvent.clientX - startX;
        const dy = upEvent.clientY - startY;
        const isHorizontal = window.innerWidth >= 768;
        const isFirst = grid.firstElementChild === card;
        const primaryDelta = isHorizontal ? dx : dy;
        const towardsOther = isFirst ? (primaryDelta > 70) : (primaryDelta < -70);

        if (towardsOther) {
          _executeCardSwap(card, otherCard, dx, dy);
        } else {
          // Spring bounce back to original position
          card.classList.remove('card-dragging');
          card.style.setProperty('transition', 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease', 'important');
          card.style.setProperty('transform', 'translate3d(0, 0, 0) scale(1)', 'important');
          otherCard.style.setProperty('transition', 'transform 0.35s ease', 'important');
          otherCard.style.removeProperty('transform');

          setTimeout(() => {
            card.style.removeProperty('transition');
            card.style.removeProperty('transform');
            otherCard.style.removeProperty('transition');
            otherCard.style.removeProperty('transform');
          }, 460);
        }
      }

      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
    });
  });
}

function _dispenseBehindCardConfetti(cardA, cardB) {
  if (!isJuicyMode || !canvas || !ctx) {
    initCanvas();
  }
  if (!canvas || !ctx) return;
  resizeCanvas();

  const rectA = cardA.getBoundingClientRect();
  const rectB = cardB.getBoundingClientRect();

  // Position between the two cards (center)
  const cx = (rectA.left + rectA.width / 2 + rectB.left + rectB.width / 2) / 2;
  const cy = (rectA.top + rectA.height / 2 + rectB.top + rectB.height / 2) / 2;

  const palette = [
    '#f59e0b', '#fbbf24', '#818cf8', '#6366f1', 
    '#ec4899', '#10b981', '#3b82f6', '#c084fc'
  ];
  const shapes = ['rect', 'diamond', 'circle'];

  // A modest burst of ~24 particles emerging outward from behind the cards
  const count = 24;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const speed = 7 + Math.random() * 8;
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    particles.push(createParticle(cx, cy, palette, shape, {
      angle,
      speed,
      vyOffset: -1.5,
      size: 4 + Math.random() * 3.5,
      decay: 0.014 + Math.random() * 0.008,
      gravity: 0.16,
      drag: 0.965
    }));
  }
}

function _executeCardSwap(cardA, cardB, currentDx, currentDy) {
  const grid = document.getElementById('courseCardsGrid');
  if (!grid) return;

  // Measure initial geometry before DOM change
  const rectA = cardA.getBoundingClientRect();
  const rectB = cardB.getBoundingClientRect();

  cardA.classList.remove('card-dragging');
  cardA.classList.add('card-swapping');
  cardB.classList.add('card-swapping');

  // DOM Reorder
  if (grid.firstElementChild === cardA) {
    grid.appendChild(cardA);
  } else {
    grid.insertBefore(cardA, cardB);
  }

  // Measure new geometry after DOM change
  const newRectA = cardA.getBoundingClientRect();
  const newRectB = cardB.getBoundingClientRect();

  // Invert offsets (FLIP)
  const invXA = (rectA.left + currentDx) - newRectA.left;
  const invYA = (rectA.top + currentDy) - newRectA.top;
  const invXB = rectB.left - newRectB.left;
  const invYB = rectB.top - newRectB.top;

  cardA.style.transition = 'none';
  cardB.style.transition = 'none';
  cardA.style.transform = `translate3d(${invXA}px, ${invYA}px, 0) scale(1.02)`;
  cardB.style.transform = `translate3d(${invXB}px, ${invYB}px, 0) scale(0.98)`;

  // Force reflow
  void cardA.offsetWidth;
  void cardB.offsetWidth;

  // Play: Springy bouncy animation
  const springAnim = 'transform 0.65s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.4s ease';
  cardA.style.transition = springAnim;
  cardB.style.transition = springAnim;
  cardA.style.transform = 'translate3d(0, 0, 0) scale(1)';
  cardB.style.transform = 'translate3d(0, 0, 0) scale(1)';

  // Persist order in localStorage (maintained across searches and in Vanilla mode)
  try {
    const currentOrder = Array.from(grid.children).map(c => c.id);
    localStorage.setItem(_CARD_ORDER_KEY, JSON.stringify(currentOrder));
  } catch (e) {}

  // Unlock Secret 6: Doing the Shuffle
  const { isNew, totalFound } = _unlockTelemetry('0x6f');
  const suffix = isNew ? ` (Secret unlocked: ${totalFound}/${_0xM.length}!)` : '';
  _notifyTelemetry(`${atob('RG9pbmcgdGhlIFNodWZmbGUhIENhcmRzIHJlb3JkZXJlZC4=')}${suffix}`);

  // Celebratory confetti particles emerging from behind the cards
  _dispenseBehindCardConfetti(cardA, cardB);

  setTimeout(() => {
    cardA.classList.remove('card-swapping');
    cardB.classList.remove('card-swapping');
    cardA.style.transition = '';
    cardA.style.transform = '';
    cardB.style.transition = '';
    cardB.style.transform = '';
  }, 700);
}

// 3D Card Tilt & Specular Glint (Juicy Mode)
function setupCardTilt() {
  const cards = [document.getElementById('cardGetxr'), document.getElementById('card3dma')];

  cards.forEach(card => {
    if (!card) return;

    let glint = card.querySelector('.card-glint');
    if (!glint) {
      glint = document.createElement('div');
      glint.className = 'card-glint';
      card.appendChild(glint);
    }

    let rect = null;
    let tiltRafId = null;
    let targetX = 0;
    let targetY = 0;

    function updateRect() {
      rect = card.getBoundingClientRect();
    }

    card.addEventListener('mouseenter', () => {
      if (!isJuicyMode || window.innerWidth < 768) return;
      updateRect();
    });

    card.addEventListener('mousemove', (e) => {
      if (!isJuicyMode || window.innerWidth < 768 || isCardDragging) return;
      if (card.classList.contains('card-dragging') || card.classList.contains('card-swapping')) return;

      if (!rect) updateRect();
      targetX = (e.clientX - rect.left) / rect.width - 0.5;
      targetY = (e.clientY - rect.top) / rect.height - 0.5;

      if (!tiltRafId) {
        tiltRafId = requestAnimationFrame(() => {
          tiltRafId = null;
          const rotX = -targetY * 7;
          const rotY = targetX * 7;
          card.classList.remove('tilt-card-reset');
          card.style.transform = `perspective(1200px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) scale3d(1.01, 1.01, 1.01)`;
          glint.style.setProperty('--glint-x', `${((targetX + 0.5) * 100).toFixed(1)}%`);
          glint.style.setProperty('--glint-y', `${((targetY + 0.5) * 100).toFixed(1)}%`);
        });
      }
    });

    card.addEventListener('mouseleave', () => {
      rect = null;
      if (tiltRafId) {
        cancelAnimationFrame(tiltRafId);
        tiltRafId = null;
      }
      if (!isJuicyMode || isCardDragging) return;
      if (card.classList.contains('card-dragging') || card.classList.contains('card-swapping')) return;
      card.classList.add('tilt-card-reset');
      card.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    });
  });
}

// ==========================================================================
// 7. Subsystem 0x7g — The Void (3D Perspective Breakout & Walk)
// ==========================================================================

function init3DVoidModule() {
  const worldRig = document.getElementById('worldRig');
  const returnBtn = document.getElementById('returnToScreenBtn');
  const easterEgg3D = document.getElementById('easterEgg3D');
  if (!worldRig) return;

  let isHoldingKey = false;
  let holdStartTime = 0;
  let shakeRafId = null;
  let isInTheVoid = false;

  // First-person camera & world coordinates
  let camX = 0;
  let camY = 0;
  let camVy = 0;
  let camZ = 650;
  let camYaw = -16;
  let camPitch = 8;
  let gameLoopRafId = null;

  const activeKeys = {};

  // Check if an input or editable field is active
  function isInputFocused() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || el.isContentEditable;
  }

  // 1. Shake & Hold Mechanics (3.0s continuous hold)
  let cachedCardRect = null;

  function isTargetKey(key, code) {
    return (
      key === 'ArrowDown' || key === 'Down' ||
      key === 'ArrowLeft' || key === 'Left' ||
      key === ' ' || key === 'Spacebar' || code === 'Space'
    );
  }

  function startHold() {
    if (isHoldingKey || isInTheVoid || !isJuicyMode) return;
    isHoldingKey = true;
    holdStartTime = performance.now();
    worldRig.style.transition = 'none';
    const pageCard = document.getElementById('pageCard');
    cachedCardRect = pageCard ? pageCard.getBoundingClientRect() : null;
    spawnPressDownImpact();
    updateShake();
  }

  function cancelHold() {
    cachedCardRect = null;
    if (!isHoldingKey || isInTheVoid) return;
    isHoldingKey = false;
    if (shakeRafId) {
      cancelAnimationFrame(shakeRafId);
      shakeRafId = null;
    }
    // Spring back smoothly to rest
    worldRig.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
    worldRig.style.transform = '';
    setTimeout(() => {
      if (!isHoldingKey && !isInTheVoid) {
        worldRig.style.transition = '';
      }
    }, 260);
  }

  function spawnPressDownImpact() {
    if (!isJuicyMode || !canvas || !ctx) return;
    resizeCanvas();
    const rect = cachedCardRect;
    const w = rect ? rect.width : window.innerWidth;
    const h = rect ? rect.height : window.innerHeight;
    const left = rect ? rect.left : 0;
    const top = rect ? rect.top : 0;
    const cx = left + w / 2;
    const cy = top + h / 2;

    const impactPalette = ['#ffffff', '#60a5fa', '#38bdf8', '#818cf8', '#a855f7', '#c084fc', '#f59e0b', '#fbbf24', '#ec4899'];

    // 1. Visceral outward burst of spark shards along the perimeter
    const perimeterCount = 38;
    for (let i = 0; i < perimeterCount; i++) {
      let sx, sy, dirX = 0, dirY = 0;
      if (rect) {
        const edge = Math.floor(Math.random() * 4);
        if (edge === 0) { // Top edge -> blast upward
          sx = left + Math.random() * w;
          sy = top;
          dirY = -1;
          dirX = (Math.random() - 0.5) * 1.6;
        } else if (edge === 1) { // Right edge -> blast rightward
          sx = left + w;
          sy = top + Math.random() * h;
          dirX = 1;
          dirY = (Math.random() - 0.5) * 1.6;
        } else if (edge === 2) { // Bottom edge -> blast downward
          sx = left + Math.random() * w;
          sy = top + h;
          dirY = 1;
          dirX = (Math.random() - 0.5) * 1.6;
        } else { // Left edge -> blast leftward
          sx = left;
          sy = top + Math.random() * h;
          dirX = -1;
          dirY = (Math.random() - 0.5) * 1.6;
        }
      } else {
        const angle = Math.random() * Math.PI * 2;
        sx = cx + Math.cos(angle) * 200;
        sy = cy + Math.sin(angle) * 200;
        dirX = Math.cos(angle);
        dirY = Math.sin(angle);
      }

      const speed = 4.0 + Math.random() * 6.5;
      const angle = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 0.4;

      particles.push(createParticle(sx, sy, impactPalette, Math.random() > 0.4 ? 'diamond' : 'circle', {
        angle,
        speed,
        size: 3.5 + Math.random() * 3.5,
        decay: 0.024 + Math.random() * 0.02,
        gravity: 0.12,
        vyOffset: dirY * 2.0 - 1.0
      }));
    }

    // 2. Central reality crackle sparks
    for (let i = 0; i < 18; i++) {
      const rx = left + (0.15 + Math.random() * 0.7) * w;
      const ry = top + (0.15 + Math.random() * 0.7) * h;
      particles.push(createParticle(rx, ry, impactPalette, Math.random() > 0.5 ? 'rect' : 'circle', {
        speed: 2.5 + Math.random() * 4.5,
        size: 3.0 + Math.random() * 3.0,
        decay: 0.025 + Math.random() * 0.025,
        gravity: 0.1,
        vyOffset: -2.5
      }));
    }

    if (!animFrameId) {
      animateParticles();
    }
  }

  function spawnShakeSparks(progress) {
    if (!isJuicyMode || !canvas || !ctx) return;

    // Ramps aggressively from 2-3 sparks at t=0 up to 22+ sparks per frame near t=1.0
    const count = 2 + Math.floor(Math.pow(progress, 1.25) * 20);

    const rect = cachedCardRect;
    const w = rect ? rect.width : window.innerWidth;
    const h = rect ? rect.height : window.innerHeight;
    const left = rect ? rect.left : 0;
    const top = rect ? rect.top : 0;
    const cx = left + w / 2;
    const cy = top + h / 2;

    const sparkPalette = [
      '#ffffff', // White-hot spark core
      '#60a5fa', '#38bdf8', // Electric cyan
      '#818cf8', '#a855f7', '#c084fc', // Quantum violet / purple
      '#ec4899', // Neon magenta
      '#fbbf24', '#f59e0b' // High-energy amber
    ];

    for (let i = 0; i < count; i++) {
      let sx, sy, dirX = 0, dirY = 0;
      // High progress causes reality fractures inside the card body itself
      const spawnInternal = progress > 0.25 && Math.random() < (progress * 0.55);

      if (rect && !spawnInternal) {
        const edge = Math.floor(Math.random() * 4);
        if (edge === 0) { // Top edge
          sx = left + Math.random() * w;
          sy = top;
          dirY = -1;
          dirX = (Math.random() - 0.5) * 1.5;
        } else if (edge === 1) { // Right edge
          sx = left + w;
          sy = top + Math.random() * h;
          dirX = 1;
          dirY = (Math.random() - 0.5) * 1.5;
        } else if (edge === 2) { // Bottom edge
          sx = left + Math.random() * w;
          sy = top + h;
          dirY = 1;
          dirX = (Math.random() - 0.5) * 1.5;
        } else { // Left edge
          sx = left;
          sy = top + Math.random() * h;
          dirX = -1;
          dirY = (Math.random() - 0.5) * 1.5;
        }
      } else if (rect && spawnInternal) {
        sx = left + Math.random() * w;
        sy = top + Math.random() * h;
        dirX = (sx - cx) / (w * 0.5);
        dirY = (sy - cy) / (h * 0.5);
      } else {
        sx = window.innerWidth / 2 + (Math.random() - 0.5) * 400;
        sy = window.innerHeight / 2 + (Math.random() - 0.5) * 400;
        dirX = (Math.random() - 0.5) * 2;
        dirY = (Math.random() - 0.5) * 2;
      }

      const speed = 2.0 + progress * 7.5 + Math.random() * 3.5;
      const angle = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 0.6;
      const shapeRoll = Math.random();
      const shape = shapeRoll > 0.6 ? 'diamond' : (shapeRoll > 0.3 ? 'circle' : 'rect');

      particles.push(createParticle(sx, sy, sparkPalette, shape, {
        angle,
        speed,
        size: 2.2 + progress * 3.8 + Math.random() * 2.0,
        decay: 0.024 + Math.random() * 0.026,
        gravity: 0.08,
        vyOffset: dirY * (1.0 + progress * 2.0) - (0.8 + progress * 1.5)
      }));
    }

    if (!animFrameId) {
      animateParticles();
    }
  }

  function updateShake() {
    if (!isHoldingKey || isInTheVoid) return;

    const elapsed = performance.now() - holdStartTime;
    const progress = Math.min(1.0, elapsed / 3000.0);

    if (elapsed < 3000.0) {
      // Immediate base rumble + power curve: 3.5px base + t^1.4 * 22px
      const t = progress;
      const amp = 3.5 + Math.pow(t, 1.4) * 22.0;
      const rotAmp = 0.8 + Math.pow(t, 1.4) * 4.2; // degrees

      const dx = (Math.random() - 0.5) * 2 * amp;
      const dy = (Math.random() - 0.5) * 2 * amp;
      const dr = (Math.random() - 0.5) * 2 * rotAmp;

      worldRig.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0px) rotate(${dr.toFixed(2)}deg)`;

      // Increasingly dense particle sparks during charge-up
      spawnShakeSparks(progress);

      shakeRafId = requestAnimationFrame(updateShake);
    } else {
      // 3.0s Reached -> Break free into the Void!
      isHoldingKey = false;
      shakeRafId = null;
      enterTheVoid();
    }
  }

  // Window key listeners for hold trigger
  window.addEventListener('keydown', (e) => {
    if (isInTheVoid) {
      activeKeys[e.code] = true;
      activeKeys[e.key] = true;
      if (e.code === 'Space' || e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
      }
      if (e.key === 'Escape') {
        exitTheVoid();
      }
      return;
    }

    if (isInputFocused()) return; // Never trigger while typing in student number or using buttons
    if (!isTargetKey(e.key, e.code)) return;

    e.preventDefault(); // Prevent page scroll during hold trigger
    if (e.repeat) return; // Prevent OS key-repeat from restarting timer

    startHold();
  });

  window.addEventListener('keyup', (e) => {
    if (isInTheVoid) {
      activeKeys[e.code] = false;
      activeKeys[e.key] = false;
      return;
    }

    if (isTargetKey(e.key, e.code)) {
      cancelHold();
    }
  });

  // Window blur / tab switch safeguard
  window.addEventListener('blur', cancelHold);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelHold();
  });

  // 2. Enter The Void
  function enterTheVoid() {
    isInTheVoid = true;
    cachedCardRect = null;
    document.body.classList.add('in-the-void');

    // Reality break burst of particles
    if (isJuicyMode && canvas && ctx) {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const voidPalette = [
        '#ffffff', '#6366f1', '#8b5cf6', '#a855f7',
        '#ec4899', '#f59e0b', '#fbbf24', '#38bdf8', '#10b981'
      ];

      // 1. High-velocity outward explosion of geometric shards (rect & diamond)
      for (let i = 0; i < 90; i++) {
        const shape = Math.random() > 0.5 ? 'rect' : 'diamond';
        particles.push(createParticle(cx, cy, voidPalette, shape, {
          speed: 5.0 + Math.random() * 11.0,
          size: 4.5 + Math.random() * 5.5,
          decay: 0.015 + Math.random() * 0.018,
          gravity: 0.12,
          vyOffset: -3.5
        }));
      }

      // 2. Rising quantum sparkle cloud
      for (let i = 0; i < 45; i++) {
        particles.push(createParticle(cx + (Math.random() - 0.5) * 320, cy + (Math.random() - 0.5) * 220, voidPalette, 'circle', {
          speed: 2.5 + Math.random() * 5.0,
          size: 3.0 + Math.random() * 3.5,
          decay: 0.016 + Math.random() * 0.02,
          gravity: 0.06,
          vyOffset: -5.0
        }));
      }

      if (!animFrameId) animateParticles();
    }

    // Snappy break-free recoil
    worldRig.style.transition = 'transform 0.85s cubic-bezier(0.16, 1, 0.3, 1)';
    camX = 0;
    camY = 0;
    camVy = 0;
    camZ = 650;
    camYaw = -16;
    camPitch = 8;

    applyWorldTransform();

    setTimeout(() => {
      if (isInTheVoid) {
        worldRig.style.transition = '';
        startGameLoop();
      }
    }, 870);

    // Secret #7: The Void
    const { isNew, totalFound } = _unlockTelemetry('0x7g');
    const suffix = isNew ? ` (Secret unlocked: ${totalFound}/${_0xM.length}!)` : '';
    _notifyTelemetry(`Reality Unstuck! Welcome to The Void.${suffix}`);
  }

  // 3. Exit The Void
  function exitTheVoid() {
    if (!isInTheVoid) return;
    isInTheVoid = false;
    stopGameLoop();
    camY = 0;
    camVy = 0;

    // Swoop camera back to flat 2D
    worldRig.style.transition = 'transform 0.85s cubic-bezier(0.16, 1, 0.3, 1)';
    worldRig.style.transform = 'translate3d(0px, 0px, 0px) rotateX(0deg) rotateY(0deg)';

    setTimeout(() => {
      document.body.classList.remove('in-the-void');
      worldRig.style.transition = '';
      worldRig.style.transform = '';
      // Clear key state
      for (const k in activeKeys) activeKeys[k] = false;
    }, 870);
  }

  if (returnBtn) {
    returnBtn.addEventListener('click', exitTheVoid);
  }

  // 4. Mouse / Touch Drag to Look
  let isDragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  function onPointerDown(clientX, clientY, target) {
    if (!isInTheVoid) return;
    if (target.closest('#voidHud') || target.closest('#easterEgg3D')) return;
    isDragging = true;
    lastPointerX = clientX;
    lastPointerY = clientY;
  }

  function onPointerMove(clientX, clientY) {
    if (!isInTheVoid || !isDragging) return;
    const deltaX = clientX - lastPointerX;
    const deltaY = clientY - lastPointerY;
    lastPointerX = clientX;
    lastPointerY = clientY;

    camYaw += deltaX * 0.28;
    camPitch -= deltaY * 0.22;
    // Clamp pitch between -70 and 70 degrees
    camPitch = Math.max(-70, Math.min(70, camPitch));
  }

  function onPointerUp() {
    isDragging = false;
  }

  window.addEventListener('mousedown', (e) => onPointerDown(e.clientX, e.clientY, e.target));
  window.addEventListener('mousemove', (e) => onPointerMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', onPointerUp);

  // Touch support for mobile devices
  window.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      onPointerDown(e.touches[0].clientX, e.touches[0].clientY, e.target);
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  window.addEventListener('touchend', onPointerUp);

  // 5. Walking & Physics Game Loop
  function applyWorldTransform() {
    worldRig.style.transform = `
      rotateX(${camPitch.toFixed(2)}deg)
      rotateY(${camYaw.toFixed(2)}deg)
      translate3d(${(-camX).toFixed(2)}px, ${(camY).toFixed(2)}px, ${(-camZ).toFixed(2)}px)
    `;
  }

  function startGameLoop() {
    if (gameLoopRafId) cancelAnimationFrame(gameLoopRafId);

    function loop() {
      if (!isInTheVoid) return;

      const isRunning = Boolean(
        activeKeys['ShiftLeft'] || activeKeys['ShiftRight'] || activeKeys['Shift']
      );
      const speed = isRunning ? 22.0 : 12.0;
      const rad = (camYaw * Math.PI) / 180.0;

      // Local movement intent: forward (+1) / back (-1), right (+1) / left (-1)
      let forward = 0;
      let strafe = 0;

      if (activeKeys['KeyW'] || activeKeys['ArrowUp']) forward += 1;
      if (activeKeys['KeyS'] || activeKeys['ArrowDown']) forward -= 1;
      if (activeKeys['KeyD']) strafe += 1;
      if (activeKeys['KeyA']) strafe -= 1;

      // Normalize diagonal input vector so speed is identical in all directions
      const inputLen = Math.hypot(forward, strafe);
      let moveX = 0;
      let moveZ = 0;

      if (inputLen > 0) {
        const normForward = forward / inputLen;
        const normStrafe = strafe / inputLen;

        // Project local forward/strafe to world coordinates based on camera yaw
        moveX = (Math.sin(rad) * normForward + Math.cos(rad) * normStrafe) * speed;
        moveZ = (-Math.cos(rad) * normForward + Math.sin(rad) * normStrafe) * speed;
      }

      // Keyboard turn steering if using arrow keys without WASD
      if (activeKeys['ArrowLeft'] && !activeKeys['KeyA']) {
        camYaw -= 2.2;
      }
      if (activeKeys['ArrowRight'] && !activeKeys['KeyD']) {
        camYaw += 2.2;
      }

      // Jump & Gravity Arc Physics
      const isGrounded = camY <= 0.01;
      const wantsJump = Boolean(activeKeys['Space'] || activeKeys[' ']);

      if (wantsJump && isGrounded) {
        camVy = isRunning ? 16.0 : 13.5;
      }

      if (!isGrounded || camVy > 0) {
        camY += camVy;
        camVy -= 0.85; // Gravity
        if (camY <= 0) {
          camY = 0;
          camVy = 0;
        }
      }

      // Soft bounding radius (2500px)
      const targetDist = Math.hypot(camX + moveX, camZ + moveZ);
      if (targetDist < 2500) {
        camX += moveX;
        camZ += moveZ;
      }

      applyWorldTransform();
      gameLoopRafId = requestAnimationFrame(loop);
    }

    gameLoopRafId = requestAnimationFrame(loop);
  }

  function stopGameLoop() {
    if (gameLoopRafId) {
      cancelAnimationFrame(gameLoopRafId);
      gameLoopRafId = null;
    }
  }

  // 6. Easter Egg Interaction on Back of Card
  if (easterEgg3D) {
    easterEgg3D.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isJuicyMode) return;
      if (easterEgg3D.classList.contains('claimed')) return;

      // Spawn localized golden egg shatter particle explosion
      spawnEggShatterParticles(easterEgg3D);

      // Disappear with particle effect
      easterEgg3D.classList.add('claimed');

      // Secret #8: The Easter Egg
      const { isNew, totalFound } = _unlockTelemetry('0x8h');
      const suffix = isNew ? ` (Secret unlocked: ${totalFound}/${_0xM.length}!)` : '';
      _notifyTelemetry(`Fourth wall demolished! Secret Easter Egg discovered!${suffix}`);
      _dispenseCelebrationParticles();
    });
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  initCardOrder();
  initCanvas();
  _setupKListener();
  _setupFlipListener();
  _setupTicketListener();
  _setupLogoListener();
  _setupGuardianCatListener();
  setupCardTilt();
  setupCardDrag();
  init3DVoidModule();
  _updateTelemetryUI();

  // Developer Console Welcome Banner
  console.log(
`%c       /\\_/\\
      ( o.o )   __________________________________________________
       > ^ <   / Looking through the console, are we?             \\
      /     \\ |  Client-side SHA-256 hashes only. No cheatsheet   |
     /|     |\ \ here, but the guardian cat watches closely...    /
    (_|_____|_) --------------------------------------------------
          ~ Creative Technology · Module 5: Interactive Media ~%c

%c[Interactive Media 2026]%c Late Token Engine v2.0
• WebCrypto SHA-256 local verification
• Canvas FX & Telemetry active
• The cat looks like it wants to be petted...`,
    'color: #d97706; font-family: monospace; font-size: 11px; font-weight: bold; line-height: 1.25;',
    '',
    'color: #d97706; font-weight: bold; font-size: 12px;',
    'color: #4f46e5; font-weight: bold; font-size: 12px;'
  );
  
  // Resolve initial mode preference from URL or storage
  const preferredJuicy = checkFxPreference();
  setMode(preferredJuicy, false);

  await loadConfig();

  document.getElementById('tokenForm').addEventListener('submit', handleFormSubmit);
  document.getElementById('clearSearchBtn').addEventListener('click', handleClearSearch);

  // Live input detection for typing "clear", "reset", or "roll" / "barrelroll"
  const studentInputEl = document.getElementById('studentIdInput');
  if (studentInputEl) {
    studentInputEl.addEventListener('input', (e) => {
      const val = e.target.value.trim().toLowerCase();
      if (val === 'clear' || val === 'reset') {
        e.target.value = '';
        e.target.blur();
        _clearDiscoveredTelemetry();
        return;
      }
      if (isJuicyMode && (val === 'roll' || val === 'barrelroll' || val === 'barrel roll' || val.includes('barrelroll'))) {
        e.target.value = '';
        e.target.blur();
        _execManeuver();
      }
    });
  }

  // Mode Toggle Handler
  const toggleBtn = document.getElementById('modeToggleBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      setMode(!isJuicyMode, true);
      // If results are currently showing, re-render cards to reflect mode styles
      const inputEl = document.getElementById('studentIdInput');
      if (currentStudentId && !document.getElementById('resultsContainer').classList.contains('hidden')) {
        performLookup(currentStudentId, false);
      }
    });
  }

  // Handle browser back/forward or manual hash updates
  window.addEventListener('hashchange', () => {
    const urlId = getStudentIdFromUrl();
    const shouldBeJuicy = checkFxPreference();
    if (shouldBeJuicy !== isJuicyMode) {
      setMode(shouldBeJuicy, false);
    }
    if (urlId) {
      performLookup(urlId, false);
    } else {
      handleClearSearch();
    }
  });

  // Check if URL has a bookmarked/encoded student ID on load
  const initialId = getStudentIdFromUrl();
  if (initialId) {
    performLookup(initialId, true);
  }
});

