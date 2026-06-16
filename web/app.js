// ── SVG icon strings (Lucide) ──────────────────────────────────────────────
const SVG = {
  server: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>`,
  info:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  pause:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
  play:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
  stop:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
};

// ── State ──────────────────────────────────────────────────────────────────
let currentServerDetails = null;

const SERVER_COLORS = [
  { hex: '#38bdf8', r: 56,  g: 189, b: 248 },
  { hex: '#fbbf24', r: 251, g: 191, b: 36  },
  { hex: '#2dd4bf', r: 45,  g: 212, b: 191 },
  { hex: '#a78bfa', r: 167, g: 139, b: 250 },
  { hex: '#fb923c', r: 251, g: 146, b: 60  },
  { hex: '#f472b6', r: 244, g: 114, b: 182 },
  { hex: '#4ade80', r: 74,  g: 222, b: 128 },
  { hex: '#f87171', r: 248, g: 113, b: 113 },
];

let servers           = [];
let algorithm         = 'round-robin';
let rrIndex           = 0;
let wrrIndex          = 0;
let totalRequests     = 0;
let completedRequests = 0;
let failedRequests    = 0;
let inFlight          = 0;
let simRunning        = false;
let simAbort          = false;
let simPaused         = false;
let serverCounter     = 0;
let colorCounter      = 0;

const canvas     = document.getElementById('canvas-area');
const svgLayer   = document.getElementById('svg-layer');
const lbNode     = document.getElementById('lb-node');
const clientNode = document.getElementById('client-node');

// RPS tracking
const rpsWindow    = [];
const RPS_WINDOW_MS = 3000;

// Timeline
const timelineDots = [];
const MAX_TIMELINE  = 90;

// ── Layout helpers ─────────────────────────────────────────────────────────
function canvasSize() { return { w: canvas.clientWidth, h: canvas.clientHeight }; }

function lbPos() {
  const { w, h } = canvasSize();
  return { x: w * 0.44, y: h * 0.50 };
}
function clientPos() {
  const { w, h } = canvasSize();
  return { x: Math.max(60, w * 0.14), y: h * 0.50 };
}
function defaultServerPositions(count) {
  const { w, h } = canvasSize();
  const cx     = Math.min(w - 82, w * 0.80);
  const spread = Math.min(h * 0.62, 300);
  const pos    = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    pos.push({ x: cx, y: h / 2 - spread / 2 + t * spread });
  }
  return pos;
}

// ── Static node positioning ────────────────────────────────────────────────
function positionStaticNodes() {
  const lp = lbPos();
  const cp = clientPos();
  lbNode.style.left     = lp.x + 'px';
  lbNode.style.top      = lp.y + 'px';
  clientNode.style.left = cp.x + 'px';
  clientNode.style.top  = cp.y + 'px';
}

// ── Bezier helpers ─────────────────────────────────────────────────────────
function bezierD(x1, y1, x2, y2) {
  const dx = Math.min(Math.abs(x2 - x1) * 0.5, 120);
  return `M ${x1} ${y1} C ${x1+dx} ${y1}, ${x2-dx} ${y2}, ${x2} ${y2}`;
}

function bezierPt(t, x0, y0, cx1, cy1, cx2, cy2, x1, y1) {
  const u = 1 - t;
  return {
    x: u*u*u*x0 + 3*u*u*t*cx1 + 3*u*t*t*cx2 + t*t*t*x1,
    y: u*u*u*y0 + 3*u*u*t*cy1 + 3*u*t*t*cy2 + t*t*t*y1,
  };
}

// ── SVG connection lines ───────────────────────────────────────────────────
function updateAllLines() {
  const cp = clientPos();
  const lp = lbPos();

  // client → LB
  let cl = document.getElementById('client-lb-line');
  if (!cl) {
    cl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    cl.id = 'client-lb-line';
    cl.setAttribute('stroke', 'rgba(16,185,129,0.30)');
    cl.setAttribute('stroke-width', '1.5');
    cl.setAttribute('fill', 'none');
    svgLayer.appendChild(cl);
  }
  cl.setAttribute('d', bezierD(cp.x, cp.y, lp.x, lp.y));

  // LB → servers
  servers.forEach(s => {
    if (!s.lineEl) {
      s.lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      s.lineEl.setAttribute('fill', 'none');
      s.lineEl.setAttribute('stroke-width', '1.5');
      svgLayer.appendChild(s.lineEl);
    }
    s.lineEl.setAttribute('d', bezierD(lp.x, lp.y, s.x, s.y));
    const c = SERVER_COLORS[s.colorIdx];
    if (s.alive) {
      s.lineEl.setAttribute('stroke', `rgba(${c.r},${c.g},${c.b},0.28)`);
      s.lineEl.removeAttribute('stroke-dasharray');
    } else {
      s.lineEl.setAttribute('stroke', 'rgba(239,68,68,0.18)');
      s.lineEl.setAttribute('stroke-dasharray', '5 4');
    }
  });
}

// ── Server DOM node ────────────────────────────────────────────────────────
function createServerEl(s) {
  const el  = document.createElement('div');
  el.className = 'server-node healthy';
  el.id        = 'srv-' + s.id;
  el.dataset.id = s.id;
  const c    = SERVER_COLORS[s.colorIdx];
  const port = s.url.split(':').pop().split('/')[0];

  el.innerHTML = `
    <div class="sn-header">
      <div class="sn-icon" style="background:rgba(${c.r},${c.g},${c.b},0.13);color:${c.hex};border:1px solid rgba(${c.r},${c.g},${c.b},0.22)">
        ${SVG.server}
      </div>
      <div class="sn-info">
        <div class="sn-name" title="${s.url}">${s.name}</div>
        <div class="sn-port">Port ${port}</div>
      </div>
      <div class="sn-dot"></div>
    </div>
    <div class="sn-colorbar" style="background:${c.hex}"></div>
    <div class="sn-actions">
      <button class="btn-info-node" id="s${s.id}-infobtn" title="Details">${SVG.info}</button>
      <button class="btn-kill-node" id="s${s.id}-killbtn">Kill</button>
      <button class="btn-rm-node"   id="s${s.id}-rmbtn">✕</button>
    </div>`;

  el.style.left = s.x + 'px';
  el.style.top  = s.y + 'px';
  canvas.appendChild(el);
  makeDraggable(el, s);

  document.getElementById(`s${s.id}-infobtn`).addEventListener('click', e => { e.stopPropagation(); openServerDetails(s); });
  document.getElementById(`s${s.id}-killbtn`).addEventListener('click', e => { e.stopPropagation(); toggleKill(s); });
  document.getElementById(`s${s.id}-rmbtn`).addEventListener('click',   e => { e.stopPropagation(); removeServer(s); });
  return el;
}

// ── Drag & drop ────────────────────────────────────────────────────────────
function makeDraggable(el, s) {
  let dragging = false, ox = 0, oy = 0;
  let hasMoved = false;

  function startDrag(cx, cy) {
    dragging = true;
    hasMoved = false;
    const rect = canvas.getBoundingClientRect();
    if (canvas.classList.contains('rotated')) {
      const W_local = canvas.clientWidth;
      const H_local = canvas.clientHeight;
      const center_x = rect.left + rect.width / 2;
      const center_y = rect.top + rect.height / 2;
      const dx = cx - center_x;
      const dy = cy - center_y;
      const local_cx = dy + W_local / 2;
      const local_cy = -dx + H_local / 2;
      ox = local_cx - s.x;
      oy = local_cy - s.y;
    } else {
      ox = cx - rect.left - s.x;
      oy = cy - rect.top  - s.y;
    }
    el.style.cursor = 'grabbing';
  }
  function moveDrag(cx, cy) {
    if (!dragging) return;
    hasMoved = true;
    s.dragged = true;
    const rect = canvas.getBoundingClientRect();
    if (canvas.classList.contains('rotated')) {
      const W_local = canvas.clientWidth;
      const H_local = canvas.clientHeight;
      const center_x = rect.left + rect.width / 2;
      const center_y = rect.top + rect.height / 2;
      const dx = cx - center_x;
      const dy = cy - center_y;
      const local_cx = dy + W_local / 2;
      const local_cy = -dx + H_local / 2;
      s.x = Math.max(76, Math.min(W_local - 76, local_cx - ox));
      s.y = Math.max(76, Math.min(H_local - 76, local_cy - oy));
    } else {
      s.x = Math.max(76, Math.min(rect.width  - 76, cx - rect.left - ox));
      s.y = Math.max(76, Math.min(rect.height - 76, cy - rect.top  - oy));
    }
    el.style.left = s.x + 'px';
    el.style.top  = s.y + 'px';
    updateAllLines();
  }
  function endDrag() { if (!dragging) return; dragging = false; el.style.cursor = 'grab'; }

  el.addEventListener('mousedown', e => { if (e.target.tagName === 'BUTTON') return; e.preventDefault(); startDrag(e.clientX, e.clientY); });
  el.addEventListener('touchstart', e => { if (e.target.tagName === 'BUTTON') return; e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });

  document.addEventListener('mousemove', e => moveDrag(e.clientX, e.clientY));
  document.addEventListener('touchmove', e => { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);

  el.addEventListener('click', e => {
    if (hasMoved) return;
    if (e.target.closest('button')) return;
    e.stopPropagation();
    openServerDetails(s);
  });
}

// ── Server management ──────────────────────────────────────────────────────
function spreadServers() {
  const pos = defaultServerPositions(servers.length);
  servers.forEach((s, i) => {
    if (!s.dragged) {
      s.x = pos[i].x; s.y = pos[i].y;
      if (s.el) { s.el.style.left = s.x + 'px'; s.el.style.top = s.y + 'px'; }
    }
  });
}

function loadLayout() {
  const saved = localStorage.getItem('lb-layout');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {}
  }
  return null;
}

function addServer(url, weight, syncBackend) {
  const id       = ++serverCounter;
  const colorIdx = colorCounter++ % SERVER_COLORS.length;
  const name     = 'Server ' + id;
  const pos      = defaultServerPositions(servers.length + 1);

  // Try to find if this server has a saved layout position
  const savedList = loadLayout();
  const savedPos = savedList ? savedList.find(x => x.url === url) : null;

  servers.forEach((s, i) => {
    if (!s.dragged) {
      s.x = pos[i].x; s.y = pos[i].y;
      if (s.el) { s.el.style.left = s.x + 'px'; s.el.style.top = s.y + 'px'; }
    }
  });

  const np = pos[servers.length];
  const s  = {
    id, name,
    url: url || `http://localhost:${8080 + id}`,
    weight: weight || 1,
    alive: true, activeConn: 0, totalReq: 0,
    x: savedPos ? savedPos.x : np.x,
    y: savedPos ? savedPos.y : np.y,
    dragged: savedPos ? !!savedPos.dragged : false,
    colorIdx, el: null, lineEl: null,
  };
  s.el = createServerEl(s);
  servers.push(s);
  updateAllLines();
  updateStatsPanel();
  renderTimeline();
  if (syncBackend) {
    fetch('/api/servers/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: s.url, weight: s.weight }) }).catch(() => {});
    toast('Added ' + name);
  }
  return s;
}

function removeServer(s) {
  if (s.el)     s.el.remove();
  if (s.lineEl) s.lineEl.remove();
  servers = servers.filter(x => x.id !== s.id);
  spreadServers();
  updateAllLines();
  updateStatsPanel();
  renderTimeline();
  fetch('/api/servers/remove', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: s.url, stopProcess: true }) }).catch(() => {});
  toast('Removed ' + s.name);
}

async function spinUpServer(weight) {
  try {
    const res = await fetch('/api/servers/spin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weight: weight || 1 }) });
    if (!res.ok) { toast('Failed to spin up server: ' + await res.text()); return null; }
    const data = await res.json();
    toast(`Server spun up: ${data.url}`);
    return data;
  } catch (err) { toast('Error: ' + err.message); return null; }
}

function toggleKill(s) {
  s.alive = !s.alive;
  if (s.activeConn > 0 && !s.alive) s.activeConn = 0;
  s.el.className = 'server-node ' + (s.alive ? 'healthy' : 'dead');
  const killBtn  = document.getElementById(`s${s.id}-killbtn`);
  if (s.alive) {
    killBtn.textContent = 'Kill';   killBtn.className = 'btn-kill-node';
    fetch('/api/servers/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: s.url, weight: s.weight }) }).catch(() => {});
    toast(s.name + ' revived');
  } else {
    killBtn.textContent = 'Revive'; killBtn.className = 'btn-kill-node revive';
    fetch('/api/servers/remove', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: s.url }) }).catch(() => {});
    toast(s.name + ' killed');
  }
  updateServerEl(s);
  updateAllLines();
  updateStatsPanel();
}

// ── Load balancing ─────────────────────────────────────────────────────────
function selectServer() {
  const alive = servers.filter(s => s.alive);
  if (!alive.length) return null;
  switch (algorithm) {
    case 'round-robin':          return alive[rrIndex++ % alive.length];
    case 'weighted-round-robin': { const e = alive.flatMap(s => Array(s.weight).fill(s)); return e[wrrIndex++ % e.length]; }
    case 'least-connections':    return alive.reduce((m, s) => s.activeConn < m.activeConn ? s : m);
    default:                     return alive[rrIndex++ % alive.length];
  }
}

// ── Packet animation ───────────────────────────────────────────────────────
function easeInOut(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

function animatePacket(server, procTime) {
  return new Promise(resolve => {
    const c      = SERVER_COLORS[server.colorIdx];
    const packet = document.createElement('div');
    packet.className = 'packet';
    packet.style.cssText = `background:${c.hex};color:${c.hex};opacity:1`;
    canvas.appendChild(packet);

    const lp   = lbPos();
    const dx   = Math.min(Math.abs(server.x - lp.x) * 0.5, 120);
    const cpx1 = lp.x + dx, cpy1 = lp.y;
    const cpx2 = server.x - dx, cpy2 = server.y;
    const t0   = performance.now();
    const tMs  = 480;

    function travel(now) {
      const frac = Math.min((now - t0) / tMs, 1);
      const pt   = bezierPt(easeInOut(frac), lp.x, lp.y, cpx1, cpy1, cpx2, cpy2, server.x, server.y);
      packet.style.left = pt.x + 'px';
      packet.style.top  = pt.y + 'px';
      frac < 1 ? requestAnimationFrame(travel) : onArrived();
    }

    function onArrived() {
      pulseServer(server);
      flashLB();
      server.activeConn++; inFlight++;
      updateServerEl(server);
      updateStatsPanel();
      updateStatusBar(server, true);
      if (server.lineEl) {
        server.lineEl.setAttribute('stroke', c.hex);
        server.lineEl.setAttribute('stroke-width', '2.5');
        server.lineEl.style.filter = `drop-shadow(0 0 4px ${c.hex})`;
      }
      setTimeout(() => {
        server.activeConn = Math.max(0, server.activeConn - 1);
        inFlight          = Math.max(0, inFlight - 1);
        completedRequests++;
        updateServerEl(server);
        updateStatsPanel();
        updateStatusBar(null, false);
        if (server.lineEl) {
          server.lineEl.setAttribute('stroke', `rgba(${c.r},${c.g},${c.b},0.28)`);
          server.lineEl.setAttribute('stroke-width', '1.5');
          server.lineEl.style.filter = '';
        }
        packet.style.transition = 'opacity 0.3s';
        packet.style.opacity    = '0';
        setTimeout(() => { packet.remove(); resolve(); }, 320);
      }, procTime);
    }
    requestAnimationFrame(travel);
  });
}

function pulseServer(s) {
  if (!s.el) return;
  const c = SERVER_COLORS[s.colorIdx];
  s.el.style.boxShadow = `0 0 22px rgba(${c.r},${c.g},${c.b},0.6)`;
  setTimeout(() => { if (s.el) s.el.style.boxShadow = ''; }, 420);
}

function flashLB() {
  lbNode.classList.add('routing');
  setTimeout(() => lbNode.classList.remove('routing'), 260);
}

// ── RPS tracking ───────────────────────────────────────────────────────────
function trackRPS() {
  const now = Date.now();
  rpsWindow.push(now);
  const cutoff = now - RPS_WINDOW_MS;
  while (rpsWindow.length && rpsWindow[0] < cutoff) rpsWindow.shift();
  document.getElementById('sb-rps').textContent = (rpsWindow.length / (RPS_WINDOW_MS / 1000)).toFixed(1);
}

// ── Timeline ───────────────────────────────────────────────────────────────
function addTimelineDot(server) {
  timelineDots.push({ color: SERVER_COLORS[server.colorIdx].hex });
  if (timelineDots.length > MAX_TIMELINE) timelineDots.shift();
  renderTimeline();
}

function renderTimeline() {
  document.getElementById('timeline-dots').innerHTML = timelineDots
    .map(d => `<div class="tl-dot" style="background:${d.color}"></div>`)
    .join('');
  document.getElementById('timeline-legend').innerHTML = servers
    .map(s => {
      const c = SERVER_COLORS[s.colorIdx];
      const p = s.url.split(':').pop().split('/')[0];
      return `<div class="leg-item"><div class="leg-dot" style="background:${c.hex}"></div>${s.name} (${p})</div>`;
    }).join('');
}

// ── Status bar ─────────────────────────────────────────────────────────────
function updateStatusBar(server, active) {
  const titleEl  = document.getElementById('sb-title');
  const detailEl = document.getElementById('sb-detail');
  if (active && server) {
    titleEl.textContent = 'Request in flight';
    const c = SERVER_COLORS[server.colorIdx];
    detailEl.innerHTML  = `Processing by <span class="srv-hi" style="color:${c.hex}">${server.name}</span>`;
  } else if (simRunning) {
    titleEl.textContent  = 'Simulation running';
    detailEl.textContent = `${inFlight} request${inFlight !== 1 ? 's' : ''} in flight`;
  } else {
    titleEl.textContent  = 'Idle';
    detailEl.textContent = 'Start simulation to see traffic flow';
    document.getElementById('sb-rps').textContent = '0.0';
  }
}

// ── Simulation ─────────────────────────────────────────────────────────────
async function runSimulation() {
  const count = Math.min(parseInt(document.getElementById('req-count').value) || 10, 200);
  const delay = parseInt(document.getElementById('req-delay').value) || 300;
  const ptime = parseInt(document.getElementById('proc-time').value) || 1500;

  simRunning = true; simAbort = false; simPaused = false;

  // Update sim button to "Stop"
  document.getElementById('sim-icon-svg').innerHTML = '<rect width="18" height="18" x="3" y="3" rx="2"/>';
  document.getElementById('sim-btn-text').textContent = 'Stop Simulation';
  document.getElementById('btn-simulate').classList.add('is-running');
  document.getElementById('btn-stop').disabled  = false;
  document.getElementById('btn-pause').disabled = false;

  for (let i = 0; i < count; i++) {
    if (simAbort) break;
    while (simPaused && !simAbort) await sleep(80);
    if (simAbort) break;

    const target = selectServer();
    if (!target) {
      failedRequests++; totalRequests++;
      updateStatsPanel(); toast('No alive servers!'); break;
    }
    target.totalReq++; totalRequests++;
    trackRPS(); addTimelineDot(target);
    updateServerEl(target); updateStatsPanel();
    animatePacket(target, ptime); // concurrent
    if (i < count - 1) await sleep(delay);
  }

  await waitFor(() => inFlight === 0, 60, 30000);

  simRunning = false; simPaused = false;
  // Restore sim button to "Start"
  document.getElementById('sim-icon-svg').innerHTML = '<polygon points="6 3 20 12 6 21 6 3"/>';
  document.getElementById('sim-btn-text').textContent = 'Start Simulation';
  document.getElementById('btn-simulate').classList.remove('is-running');
  document.getElementById('btn-stop').disabled  = true;
  document.getElementById('btn-pause').disabled = true;
  // Restore pause icon
  document.getElementById('btn-pause').innerHTML = SVG.pause;
  updateStatusBar(null, false);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
function waitFor(cond, iv, timeout) {
  return new Promise(res => {
    const t0 = Date.now();
    const id = setInterval(() => { if (cond() || Date.now()-t0 > timeout) { clearInterval(id); res(); } }, iv);
  });
}

// ── UI helpers ─────────────────────────────────────────────────────────────
function updateServerEl(s) {
  // Stats are now only visible in the details modal
  // Active and total counts are tracked internally
}

function updateUtilization() {
  const ul = document.getElementById('util-list');
  if (!servers.length) { ul.innerHTML = '<div style="font-size:11px;color:var(--muted)">No servers yet</div>'; return; }
  ul.innerHTML = servers.map(s => {
    const c   = SERVER_COLORS[s.colorIdx];
    const pct = totalRequests > 0 ? Math.round(s.totalReq / totalRequests * 100) : 0;
    const p   = s.url.split(':').pop().split('/')[0];
    return `<div class="util-row">
      <div class="util-name" title="${s.url}">S${s.id} :${p}</div>
      <div class="util-track"><div class="util-fill" style="width:${pct}%;background:${c.hex}"></div></div>
      <div class="util-pct">${pct}%</div>
    </div>`;
  }).join('');
}

function updateStatsPanel() {
  document.getElementById('stat-total').textContent     = totalRequests;
  document.getElementById('stat-completed').textContent = completedRequests;
  document.getElementById('stat-inflight').textContent  = inFlight;
  document.getElementById('stat-failed').textContent    = failedRequests;
  document.getElementById('stat-alive').textContent     = servers.filter(s => s.alive).length;
  document.getElementById('stat-dead').textContent      = servers.filter(s => !s.alive).length;
  updateUtilization();
}

function setAlgorithm(algo, syncBackend) {
  algorithm = algo; rrIndex = 0; wrrIndex = 0;
  const sel = document.getElementById('algo-select');
  if (sel && sel.value !== algo) sel.value = algo;
  const labels = { 'round-robin': 'Round Robin', 'weighted-round-robin': 'Weighted RR', 'least-connections': 'Least Connections' };
  document.getElementById('lb-algo-label').textContent = labels[algo] || algo;
  if (syncBackend) {
    fetch('/api/algorithm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ algorithm: algo }) }).catch(() => {});
  }
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ── Server Details Modal ───────────────────────────────────────────────────
function openServerDetails(s) {
  currentServerDetails = s;
  document.getElementById('server-details-title').textContent = s.name + ' Details';
  document.getElementById('detail-name').textContent   = s.name;
  document.getElementById('detail-url').textContent    = s.url;
  document.getElementById('detail-status').textContent = s.alive ? 'UP' : 'DOWN';
  document.getElementById('detail-status').style.color = s.alive ? '#10b981' : '#ef4444';
  document.getElementById('detail-weight-input').value = s.weight;
  document.getElementById('detail-active').textContent = s.activeConn;
  document.getElementById('detail-total').textContent  = s.totalReq;
  const killBtn = document.getElementById('detail-kill-btn');
  killBtn.textContent = s.alive ? 'Kill Server' : 'Revive Server';
  killBtn.className   = s.alive ? 'd-btn-danger' : 'm-submit';
  document.getElementById('server-details-overlay').classList.add('open');
}

function closeServerDetails() {
  document.getElementById('server-details-overlay').classList.remove('open');
  currentServerDetails = null;
}

function updateServerWeight() {
  if (!currentServerDetails) return;
  const w = parseInt(document.getElementById('detail-weight-input').value);
  if (w < 1 || w > 10) { toast('Weight must be 1–10'); return; }
  fetch('/api/servers/update-weight', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: currentServerDetails.url, weight: w }) })
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(() => {
      currentServerDetails.weight = w;
      toast(`Weight updated to ${w}`);
    })
    .catch(() => toast('Failed to update weight'));
}

// ── Backend sync ───────────────────────────────────────────────────────────
function syncFromBackend() {
  fetch('/api/state').then(r => r.json()).then(state => {
    if (state.algorithm && state.algorithm !== algorithm) setAlgorithm(state.algorithm, false);
    state.backends.forEach(b => {
      const s = servers.find(s => s.url === b.url);
      if (!s || s.alive === b.healthy) return;
      s.alive = b.healthy;
      s.el.className = 'server-node ' + (s.alive ? 'healthy' : 'dead');
      const kb = document.getElementById(`s${s.id}-killbtn`);
      if (s.alive) {
        kb.textContent = 'Kill';   kb.className = 'btn-kill-node';
      } else {
        kb.textContent = 'Revive'; kb.className = 'btn-kill-node revive';
      }
      updateAllLines();
    });
    updateStatsPanel();
  }).catch(() => {});
}

function isCanvasRotated() {
  return window.innerWidth <= 768 && window.innerHeight > window.innerWidth;
}

function checkRotation() {
  if (isCanvasRotated()) {
    canvas.classList.add('rotated');
  } else {
    canvas.classList.remove('rotated');
  }
}

function setupMobileTabs() {
  const tabs = document.querySelectorAll('.mobile-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const tabName = btn.dataset.tab;
      
      // Update body class
      document.body.className = document.body.className
        .split(' ')
        .filter(c => !c.startsWith('tab-'))
        .join(' ');
      document.body.classList.add('tab-' + tabName);
      
      // Trigger canvas adjustments
      checkRotation();
      positionStaticNodes();
      spreadServers();
      updateAllLines();
    });
  });
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
function init() {
  document.body.classList.add('tab-simulation');
  checkRotation();
  setupMobileTabs();
  positionStaticNodes();
  fetch('/api/state')
    .then(r => r.json())
    .then(state => {
      setAlgorithm(state.algorithm || 'round-robin', false);
      (state.backends || []).forEach(b => addServer(b.url, b.weight, false));
      servers.forEach(s => {
        const b = (state.backends || []).find(b => b.url === s.url);
        if (b && !b.healthy) {
          s.alive = false; s.el.className = 'server-node dead';
          document.getElementById(`s${s.id}-killbtn`).textContent = 'Revive';
          document.getElementById(`s${s.id}-killbtn`).className   = 'btn-kill-node revive';
        }
      });
      updateAllLines(); updateStatsPanel();
    })
    .catch(() => {
      ['http://127.0.0.1:8081','http://127.0.0.1:8082','http://127.0.0.1:8083'].forEach(u => addServer(u, 1, false));
    });
  setInterval(syncFromBackend, 5000);
}

// ── Event bindings ─────────────────────────────────────────────────────────
document.getElementById('algo-select').addEventListener('change', function () { setAlgorithm(this.value, true); });

document.getElementById('btn-simulate').addEventListener('click', () => {
  if (!simRunning) { runSimulation(); } else { simAbort = true; }
});

document.getElementById('btn-stop').addEventListener('click', () => { simAbort = true; simPaused = false; });

document.getElementById('btn-pause').addEventListener('click', () => {
  simPaused = !simPaused;
  document.getElementById('btn-pause').innerHTML = simPaused ? SVG.play : SVG.pause;
  document.getElementById('btn-pause').title     = simPaused ? 'Resume' : 'Pause';
});

document.getElementById('btn-add-server').addEventListener('click', () => {
  document.getElementById('modal-url').value    = `http://localhost:${8080 + serverCounter + 1}`;
  document.getElementById('modal-weight').value = '1';
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('modal-url').focus(), 40);
});

document.getElementById('btn-spin-server').addEventListener('click', async () => {
  const btn = document.getElementById('btn-spin-server');
  btn.disabled = true; btn.textContent = '⏳ Starting…';
  const data = await spinUpServer(1);
  if (data && data.url) addServer(data.url, data.weight || 1, false);
  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg> Spin Up Server`;
});

document.getElementById('btn-reset').addEventListener('click', () => {
  if (simRunning) simAbort = true;
  setTimeout(async () => {
    // 1. Clean up extra spun servers from the backend Go process
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const state = await res.json();
        for (const b of state.backends) {
          await fetch('/api/servers/remove', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: b.url, stopProcess: true })
          }).catch(() => {});
        }
      }
    } catch (err) {}

    // 2. Clear saved localStorage layouts
    localStorage.removeItem('lb-layout');

    // 3. Clear local frontend states
    servers.forEach(s => { if (s.el) s.el.remove(); if (s.lineEl) s.lineEl.remove(); });
    servers = []; serverCounter = 0; colorCounter = 0;
    totalRequests = 0; completedRequests = 0; failedRequests = 0; inFlight = 0;
    rrIndex = 0; wrrIndex = 0; timelineDots.length = 0; rpsWindow.length = 0;
    const cl = document.getElementById('client-lb-line'); if (cl) cl.remove();

    // 4. Add the default 3 servers (registered on backend too)
    const defaults = ['http://127.0.0.1:8081', 'http://127.0.0.1:8082', 'http://127.0.0.1:8083'];
    for (const url of defaults) {
      addServer(url, 1, true);
    }

    updateStatsPanel(); renderTimeline(); updateStatusBar(null, false);
    toast('Reset to default (3 servers)');
  }, simRunning ? 150 : 0);
});

document.getElementById('btn-save-layout').addEventListener('click', () => {
  localStorage.setItem('lb-layout', JSON.stringify(servers.map(s => ({ id: s.id, url: s.url, x: s.x, y: s.y, dragged: s.dragged }))));
  toast('Layout saved');
});

document.getElementById('tb-fit').addEventListener('click', () => { 
  servers.forEach(s => s.dragged = false);
  spreadServers(); 
  positionStaticNodes(); 
  updateAllLines(); 
});

document.getElementById('modal-close').addEventListener('click', () => document.getElementById('modal-overlay').classList.remove('open'));
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target.id === 'modal-overlay') document.getElementById('modal-overlay').classList.remove('open'); });
document.getElementById('modal-confirm').addEventListener('click', () => {
  const url = document.getElementById('modal-url').value.trim();
  const wt  = parseInt(document.getElementById('modal-weight').value) || 1;
  if (!url) { toast('Enter a server URL'); return; }
  document.getElementById('modal-overlay').classList.remove('open');
  addServer(url, wt, true);
});
document.getElementById('modal-url').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('modal-confirm').click(); });

document.getElementById('server-details-close').addEventListener('click', closeServerDetails);
document.getElementById('server-details-overlay').addEventListener('click', e => { if (e.target.id === 'server-details-overlay') closeServerDetails(); });
document.getElementById('detail-weight-save').addEventListener('click', updateServerWeight);
document.getElementById('detail-weight-input').addEventListener('keydown', e => { if (e.key === 'Enter') updateServerWeight(); });
document.getElementById('detail-kill-btn').addEventListener('click', () => { if (currentServerDetails) { toggleKill(currentServerDetails); openServerDetails(currentServerDetails); } });
document.getElementById('detail-remove-btn').addEventListener('click', () => { if (currentServerDetails) { removeServer(currentServerDetails); closeServerDetails(); } });

window.addEventListener('resize', () => { checkRotation(); positionStaticNodes(); spreadServers(); updateAllLines(); });

init();
