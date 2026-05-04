// ── State ──────────────────────────────────────────────────────────────────
const SERVER_COLORS = [
  { hex: '#38bdf8', r: 56,  g: 189, b: 248 },
  { hex: '#34d399', r: 52,  g: 211, b: 153 },
  { hex: '#a78bfa', r: 167, g: 139, b: 250 },
  { hex: '#fb923c', r: 251, g: 146, b: 60  },
  { hex: '#f472b6', r: 244, g: 114, b: 182 },
  { hex: '#facc15', r: 250, g: 204, b: 21  },
  { hex: '#4ade80', r: 74,  g: 222, b: 128 },
  { hex: '#f87171', r: 248, g: 113, b: 113 },
];

let servers      = [];
let algorithm    = 'round-robin';
let rrIndex      = 0;
let wrrIndex     = 0;
let totalRequests = 0;
let inFlight     = 0;
let simRunning   = false;
let simAbort     = false;
let serverCounter = 0;
let colorCounter  = 0;

const canvas     = document.getElementById('canvas-area');
const svgLayer   = document.getElementById('svg-layer');
const lbNode     = document.getElementById('lb-node');
const clientNode = document.getElementById('client-node');

// ── Layout helpers ─────────────────────────────────────────────────────────
function canvasSize() {
  return { w: canvas.clientWidth, h: canvas.clientHeight };
}
function lbPos() {
  const { w, h } = canvasSize();
  return { x: w / 2, y: h * 0.42 };
}
function clientPos() {
  const { w, h } = canvasSize();
  return { x: w / 2, y: h * 0.14 };
}
function defaultServerPositions(count) {
  const { w, h } = canvasSize();
  const spread = Math.min(w * 0.75, 620);
  const cy = h * 0.76;
  const positions = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    positions.push({ x: w / 2 - spread / 2 + t * spread, y: cy });
  }
  return positions;
}

// ── Position static nodes ──────────────────────────────────────────────────
function positionStaticNodes() {
  const lp = lbPos();
  const cp = clientPos();
  lbNode.style.left     = lp.x + 'px';
  lbNode.style.top      = lp.y + 'px';
  clientNode.style.left = cp.x + 'px';
  clientNode.style.top  = cp.y + 'px';
}

// ── SVG lines ──────────────────────────────────────────────────────────────
function updateAllLines() {
  // client → LB
  let clLine = document.getElementById('client-lb-line');
  if (!clLine) {
    clLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    clLine.id = 'client-lb-line';
    clLine.setAttribute('stroke', 'rgba(34,211,160,0.2)');
    clLine.setAttribute('stroke-width', '1.5');
    clLine.setAttribute('fill', 'none');
    svgLayer.appendChild(clLine);
  }
  const cp = clientPos();
  const lp = lbPos();
  clLine.setAttribute('x1', cp.x); clLine.setAttribute('y1', cp.y);
  clLine.setAttribute('x2', lp.x); clLine.setAttribute('y2', lp.y);

  // LB → each server
  servers.forEach(s => {
    if (!s.lineEl) {
      s.lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      s.lineEl.setAttribute('fill', 'none');
      s.lineEl.setAttribute('stroke-width', '1.5');
      svgLayer.appendChild(s.lineEl);
    }
    s.lineEl.setAttribute('x1', lp.x); s.lineEl.setAttribute('y1', lp.y);
    s.lineEl.setAttribute('x2', s.x);  s.lineEl.setAttribute('y2', s.y);
    const c = SERVER_COLORS[s.colorIdx];
    if (s.alive) {
      s.lineEl.setAttribute('stroke', `rgba(${c.r},${c.g},${c.b},0.28)`);
      s.lineEl.removeAttribute('stroke-dasharray');
    } else {
      s.lineEl.setAttribute('stroke', 'rgba(239,68,68,0.2)');
      s.lineEl.setAttribute('stroke-dasharray', '6 4');
    }
  });
}

// ── Create server DOM node ─────────────────────────────────────────────────
function createServerEl(s) {
  const el = document.createElement('div');
  el.className = 'server-node healthy';
  el.id = 'srv-' + s.id;
  el.dataset.id = s.id;
  const c = SERVER_COLORS[s.colorIdx];
  el.innerHTML = `
    <div class="node-header">
      <span class="node-dot"></span>
      <span class="node-name" title="${s.url}">${s.name}</span>
    </div>
    <div class="node-color-bar" style="background:${c.hex}"></div>
    <div class="node-stats-grid">
      <div class="node-stat">
        <div class="ns-label">Active</div>
        <div class="ns-val" id="s${s.id}-active" style="color:${c.hex}">0</div>
      </div>
      <div class="node-stat">
        <div class="ns-label">Total</div>
        <div class="ns-val" id="s${s.id}-total">0</div>
      </div>
      <div class="node-stat">
        <div class="ns-label">Weight</div>
        <div class="ns-val" id="s${s.id}-weight">${s.weight}</div>
      </div>
      <div class="node-stat">
        <div class="ns-label">Status</div>
        <div class="ns-val" id="s${s.id}-status" style="font-size:9px;color:#22d3a0">UP</div>
      </div>
    </div>
    <div class="node-actions">
      <button class="btn-kill-node" id="s${s.id}-killbtn">Kill</button>
      <button class="btn-rm-node"   id="s${s.id}-rmbtn">✕</button>
    </div>
  `;
  el.style.left = s.x + 'px';
  el.style.top  = s.y + 'px';
  canvas.appendChild(el);
  makeDraggable(el, s);

  document.getElementById(`s${s.id}-killbtn`).addEventListener('click', e => {
    e.stopPropagation();
    toggleKill(s);
  });
  document.getElementById(`s${s.id}-rmbtn`).addEventListener('click', e => {
    e.stopPropagation();
    removeServer(s);
  });
  return el;
}

// ── Drag & drop ────────────────────────────────────────────────────────────
function makeDraggable(el, s) {
  let dragging = false;
  let ox = 0, oy = 0;

  el.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON') return;
    dragging = true;
    const rect = canvas.getBoundingClientRect();
    ox = e.clientX - rect.left - s.x;
    oy = e.clientY - rect.top  - s.y;
    el.style.cursor = 'grabbing';
    e.preventDefault();
  });

  const onMove = e => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    s.x = Math.max(70, Math.min(rect.width  - 70, e.clientX - rect.left - ox));
    s.y = Math.max(70, Math.min(rect.height - 70, e.clientY - rect.top  - oy));
    el.style.left = s.x + 'px';
    el.style.top  = s.y + 'px';
    updateAllLines();
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    el.style.cursor = 'grab';
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ── Add / remove servers ───────────────────────────────────────────────────
function spreadServers() {
  const positions = defaultServerPositions(servers.length);
  servers.forEach((s, i) => {
    s.x = positions[i].x;
    s.y = positions[i].y;
    if (s.el) { s.el.style.left = s.x + 'px'; s.el.style.top = s.y + 'px'; }
  });
}

function addServer(url, weight, syncBackend) {
  const id       = ++serverCounter;
  const colorIdx = colorCounter++ % SERVER_COLORS.length;
  const name     = 'Server ' + id;
  const pos      = defaultServerPositions(servers.length + 1);
  // Shift existing
  servers.forEach((s, i) => {
    s.x = pos[i].x; s.y = pos[i].y;
    if (s.el) { s.el.style.left = s.x + 'px'; s.el.style.top = s.y + 'px'; }
  });
  const newPos = pos[servers.length];
  const s = { id, name, url: url || `http://localhost:${8080 + id}`,
              weight: weight || 1, alive: true,
              activeConn: 0, totalReq: 0,
              x: newPos.x, y: newPos.y,
              colorIdx, el: null, lineEl: null };
  s.el = createServerEl(s);
  servers.push(s);
  updateAllLines();
  updateStatsPanel();

  if (syncBackend) {
    fetch('/api/servers/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: s.url, weight: s.weight }),
    }).catch(() => {});
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
  fetch('/api/servers/remove', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: s.url, stopProcess: true }),
  }).catch(() => {});
  toast('Removed ' + s.name);
}

// Spin up a new server dynamically
async function spinUpServer(weight) {
  try {
    const response = await fetch('/api/servers/spin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight: weight || 1 }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      toast('Failed to spin up server: ' + error);
      return null;
    }
    
    const data = await response.json();
    toast(`Server spun up: ${data.url}`);
    return data;
  } catch (err) {
    toast('Error spinning up server: ' + err.message);
    return null;
  }
}

function toggleKill(s) {
  s.alive = !s.alive;
  if (s.activeConn > 0 && !s.alive) s.activeConn = 0;
  s.el.className = 'server-node ' + (s.alive ? 'healthy' : 'dead');
  const killBtn  = document.getElementById(`s${s.id}-killbtn`);
  const statusEl = document.getElementById(`s${s.id}-status`);
  if (s.alive) {
    killBtn.textContent  = 'Kill';   killBtn.className = 'btn-kill-node';
    statusEl.style.color = '#22d3a0'; statusEl.textContent = 'UP';
    fetch('/api/servers/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: s.url, weight: s.weight }),
    }).catch(() => {});
    toast(s.name + ' revived');
  } else {
    killBtn.textContent  = 'Revive'; killBtn.className = 'btn-kill-node revive';
    statusEl.style.color = '#ef4444'; statusEl.textContent = 'DOWN';
    fetch('/api/servers/remove', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: s.url }),
    }).catch(() => {});
    toast(s.name + ' killed');
  }
  updateServerEl(s);
  updateAllLines();
  updateStatsPanel();
}

// ── Load balancing algorithms (frontend simulation) ────────────────────────
function selectServer() {
  const alive = servers.filter(s => s.alive);
  if (!alive.length) return null;
  switch (algorithm) {
    case 'round-robin':          return doRoundRobin(alive);
    case 'weighted-round-robin': return doWeightedRR(alive);
    case 'least-connections':    return doLeastConn(alive);
    default:                     return doRoundRobin(alive);
  }
}

function doRoundRobin(alive) {
  const s = alive[rrIndex % alive.length];
  rrIndex++;
  return s;
}

function doWeightedRR(alive) {
  const expanded = alive.flatMap(s => Array(s.weight).fill(s));
  const s = expanded[wrrIndex % expanded.length];
  wrrIndex++;
  return s;
}

function doLeastConn(alive) {
  return alive.reduce((min, s) => s.activeConn < min.activeConn ? s : min);
}

// ── Packet animation ───────────────────────────────────────────────────────
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function animatePacket(server, procTime) {
  return new Promise(resolve => {
    const c      = SERVER_COLORS[server.colorIdx];
    const packet = document.createElement('div');
    packet.className = 'packet';
    packet.style.cssText = `background:${c.hex};color:${c.hex};opacity:1`;
    canvas.appendChild(packet);

    const lp = lbPos();
    const sx = lp.x, sy = lp.y;
    const ex = server.x, ey = server.y;
    const travelMs = 480;
    const t0 = performance.now();

    function travel(now) {
      const frac = Math.min((now - t0) / travelMs, 1);
      const e = easeInOut(frac);
      packet.style.left = (sx + (ex - sx) * e) + 'px';
      packet.style.top  = (sy + (ey - sy) * e) + 'px';
      if (frac < 1) {
        requestAnimationFrame(travel);
      } else {
        onArrived();
      }
    }

    function onArrived() {
      // Pulse the server and LB
      pulseServer(server);
      flashLB();

      // Increment active connections
      server.activeConn++;
      inFlight++;
      updateServerEl(server);
      updateStatsPanel();

      // Highlight line
      if (server.lineEl) {
        server.lineEl.setAttribute('stroke', c.hex);
        server.lineEl.setAttribute('stroke-width', '2.5');
        server.lineEl.style.filter = `drop-shadow(0 0 5px ${c.hex})`;
      }

      // Processing complete
      setTimeout(() => {
        server.activeConn = Math.max(0, server.activeConn - 1);
        inFlight = Math.max(0, inFlight - 1);
        updateServerEl(server);
        updateStatsPanel();

        // Reset line
        if (server.lineEl) {
          server.lineEl.setAttribute('stroke', `rgba(${c.r},${c.g},${c.b},0.28)`);
          server.lineEl.setAttribute('stroke-width', '1.5');
          server.lineEl.style.filter = '';
        }

        // Fade out packet
        packet.style.transition = 'opacity 0.3s';
        packet.style.opacity = '0';
        setTimeout(() => { packet.remove(); resolve(); }, 320);
      }, procTime);
    }

    requestAnimationFrame(travel);
  });
}

function pulseServer(s) {
  if (!s.el) return;
  const c = SERVER_COLORS[s.colorIdx];
  s.el.style.transition = 'box-shadow 0.15s';
  s.el.style.boxShadow = `0 0 28px rgba(${c.r},${c.g},${c.b},0.75)`;
  setTimeout(() => { if (s.el) s.el.style.boxShadow = ''; }, 450);
}

function flashLB() {
  lbNode.classList.add('routing');
  setTimeout(() => lbNode.classList.remove('routing'), 280);
}

// ── Simulation ─────────────────────────────────────────────────────────────
async function runSimulation() {
  const count = Math.min(parseInt(document.getElementById('req-count').value)  || 10, 200);
  const delay = parseInt(document.getElementById('req-delay').value)  || 300;
  const ptime = parseInt(document.getElementById('proc-time').value)  || 1500;

  simRunning = true;
  simAbort   = false;
  document.getElementById('btn-simulate').disabled = true;
  document.getElementById('btn-stop').disabled     = false;

  for (let i = 0; i < count; i++) {
    if (simAbort) break;
    const target = selectServer();
    if (!target) { toast('No alive servers!'); break; }

    target.totalReq++;
    totalRequests++;
    updateServerEl(target);

    animatePacket(target, ptime); // intentionally not awaited — concurrent

    if (i < count - 1) await sleep(delay);
  }

  // Wait for all packets to finish
  await waitFor(() => inFlight === 0, 60, 30000);

  simRunning = false;
  document.getElementById('btn-simulate').disabled = false;
  document.getElementById('btn-stop').disabled     = true;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
function waitFor(cond, interval, timeout) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const id = setInterval(() => {
      if (cond() || Date.now() - t0 > timeout) { clearInterval(id); resolve(); }
    }, interval);
  });
}

// ── UI helpers ─────────────────────────────────────────────────────────────
function updateServerEl(s) {
  const a = document.getElementById(`s${s.id}-active`);
  const t = document.getElementById(`s${s.id}-total`);
  if (a) a.textContent = s.activeConn;
  if (t) t.textContent = s.totalReq;
}

function updateStatsPanel() {
  document.getElementById('stat-total').textContent    = totalRequests;
  document.getElementById('stat-alive').textContent    = servers.filter(s => s.alive).length;
  document.getElementById('stat-dead').textContent     = servers.filter(s => !s.alive).length;
  document.getElementById('stat-inflight').textContent = inFlight;
}

function setAlgorithm(algo, syncBackend) {
  algorithm = algo;
  rrIndex = 0; wrrIndex = 0;
  document.querySelectorAll('.algo-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.algo === algo)
  );
  const labels = {
    'round-robin':          'Round Robin',
    'weighted-round-robin': 'Weighted RR',
    'least-connections':    'Least Connections',
  };
  const label = labels[algo] || algo;
  document.getElementById('lb-algo-label').textContent = label;
  document.getElementById('header-badge').textContent  = label;
  if (syncBackend) {
    fetch('/api/algorithm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ algorithm: algo }),
    }).catch(() => {});
  }
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ── Sync health from backend ───────────────────────────────────────────────
function syncFromBackend() {
  fetch('/api/state').then(r => r.json()).then(state => {
    if (state.algorithm && state.algorithm !== algorithm)
      setAlgorithm(state.algorithm, false);

    state.backends.forEach(b => {
      const s = servers.find(s => s.url === b.url);
      if (!s || s.alive === b.healthy) return;
      s.alive = b.healthy;
      s.el.className = 'server-node ' + (s.alive ? 'healthy' : 'dead');
      const killBtn  = document.getElementById(`s${s.id}-killbtn`);
      const statusEl = document.getElementById(`s${s.id}-status`);
      if (s.alive) {
        killBtn.textContent = 'Kill';   killBtn.className = 'btn-kill-node';
        statusEl.style.color = '#22d3a0'; statusEl.textContent = 'UP';
      } else {
        killBtn.textContent = 'Revive'; killBtn.className = 'btn-kill-node revive';
        statusEl.style.color = '#ef4444'; statusEl.textContent = 'DOWN';
      }
      updateAllLines();
    });
    updateStatsPanel();
  }).catch(() => {});
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
function init() {
  positionStaticNodes();

  fetch('/api/state')
    .then(r => r.json())
    .then(state => {
      setAlgorithm(state.algorithm || 'round-robin', false);
      (state.backends || []).forEach(b => addServer(b.url, b.weight, false));

      // Apply initial health
      servers.forEach(s => {
        const b = (state.backends || []).find(b => b.url === s.url);
        if (b && !b.healthy) {
          s.alive = false;
          s.el.className = 'server-node dead';
          document.getElementById(`s${s.id}-killbtn`).textContent = 'Revive';
          document.getElementById(`s${s.id}-killbtn`).className   = 'btn-kill-node revive';
          document.getElementById(`s${s.id}-status`).style.color  = '#ef4444';
          document.getElementById(`s${s.id}-status`).textContent  = 'DOWN';
        }
      });
      updateAllLines();
      updateStatsPanel();
    })
    .catch(() => {
      // Demo mode — 3 default servers
      ['http://localhost:8081','http://localhost:8082','http://localhost:8083']
        .forEach(url => addServer(url, 1, false));
    });

  setInterval(syncFromBackend, 5000);
}

// ── Event bindings ─────────────────────────────────────────────────────────
document.querySelectorAll('.algo-btn').forEach(btn =>
  btn.addEventListener('click', () => setAlgorithm(btn.dataset.algo, true))
);

document.getElementById('btn-simulate').addEventListener('click', () => {
  if (!simRunning) runSimulation();
});

document.getElementById('btn-stop').addEventListener('click', () => {
  simAbort = true;
});

document.getElementById('btn-add-server').addEventListener('click', () => {
  document.getElementById('modal-url').value    = `http://localhost:${8080 + serverCounter + 1}`;
  document.getElementById('modal-weight').value = '1';
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('modal-url').focus();
});

document.getElementById('btn-spin-server').addEventListener('click', async () => {
  const btn = document.getElementById('btn-spin-server');
  btn.disabled = true;
  btn.textContent = '⏳ Starting...';
  
  const data = await spinUpServer(1);
  
  if (data && data.url) {
    // Add the server to the UI
    addServer(data.url, data.weight || 1, false);
  }
  
  btn.disabled = false;
  btn.textContent = '⚡ Spin Up Server';
});

document.getElementById('modal-close').addEventListener('click', () =>
  document.getElementById('modal-overlay').classList.remove('open')
);

document.getElementById('modal-confirm').addEventListener('click', () => {
  const url    = document.getElementById('modal-url').value.trim();
  const weight = parseInt(document.getElementById('modal-weight').value) || 1;
  if (!url) { toast('Enter a server URL'); return; }
  document.getElementById('modal-overlay').classList.remove('open');
  addServer(url, weight, true);
});

document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target.id === 'modal-overlay')
    document.getElementById('modal-overlay').classList.remove('open');
});

document.getElementById('modal-url').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('modal-confirm').click();
});

window.addEventListener('resize', () => {
  positionStaticNodes();
  spreadServers();
  updateAllLines();
});

init();
