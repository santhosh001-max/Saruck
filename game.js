// ==========================================================
// Galaxy Runner - 2D Space Shooter (frontend game engine)
// ==========================================================

const API_BASE = 'http://localhost:4000/api';
const USERNAME = localStorage.getItem('gr_username') || (() => {
  const n = 'guest' + Math.floor(Math.random() * 100000);
  localStorage.setItem('gr_username', n);
  return n;
})();

// ---------- Fallback data (used if backend is unreachable) ----------
const FALLBACK_SHIPS = [
  { id: 1, name: 'Falcon Starter', cost: 0, speed: 4, power_capacity: 1, fire_rate: 400, unlock_level: 0, color: '#00e5ff' },
  { id: 2, name: 'Nova Striker', cost: 300, speed: 5, power_capacity: 2, fire_rate: 320, unlock_level: 1, color: '#ff9100' },
  { id: 3, name: 'Vortex Blade', cost: 700, speed: 6, power_capacity: 3, fire_rate: 260, unlock_level: 2, color: '#7c4dff' },
  { id: 4, name: 'Titan Cruiser', cost: 1200, speed: 7, power_capacity: 4, fire_rate: 200, unlock_level: 3, color: '#ff1744' },
  { id: 5, name: 'Phoenix X', cost: 2000, speed: 8, power_capacity: 5, fire_rate: 150, unlock_level: 4, color: '#ffd600' },
];
const FALLBACK_LEVELS = [
  { id: 1, level_number: 1, name: 'Asteroid Belt', distance: 3000, alien_count: 5, obstacle_density: 0.20, reward_coins: 150 },
  { id: 2, level_number: 2, name: 'Alien Outpost', distance: 4000, alien_count: 8, obstacle_density: 0.30, reward_coins: 220 },
  { id: 3, level_number: 3, name: 'Meteor Storm', distance: 5000, alien_count: 10, obstacle_density: 0.40, reward_coins: 300 },
  { id: 4, level_number: 4, name: 'Deep Space Rift', distance: 6000, alien_count: 14, obstacle_density: 0.50, reward_coins: 400 },
  { id: 5, level_number: 5, name: 'Mothership Gate', distance: 8000, alien_count: 20, obstacle_density: 0.60, reward_coins: 600 },
];

// ---------- Local persistent fallback profile ----------
function loadLocalProfile() {
  const raw = localStorage.getItem('gr_profile');
  if (raw) return JSON.parse(raw);
  const fresh = { username: USERNAME, coins: 0, hearts: 3, currentShipId: 1, currentLevel: 1, ownedShips: [FALLBACK_SHIPS[0]] };
  localStorage.setItem('gr_profile', JSON.stringify(fresh));
  return fresh;
}
function saveLocalProfile(p) { localStorage.setItem('gr_profile', JSON.stringify(p)); }

// ---------- API wrapper (falls back to localStorage if server is offline) ----------
const Api = {
  online: true,
  async getPlayer() {
    try {
      const r = await fetch(`${API_BASE}/player/${USERNAME}`);
      if (!r.ok) throw new Error('bad status');
      this.online = true;
      return await r.json();
    } catch (e) {
      this.online = false;
      return loadLocalProfile();
    }
  },
  async getShips() {
    try {
      const r = await fetch(`${API_BASE}/spaceships`);
      if (!r.ok) throw new Error();
      return await r.json();
    } catch (e) { return FALLBACK_SHIPS; }
  },
  async getLevels() {
    try {
      const r = await fetch(`${API_BASE}/levels`);
      if (!r.ok) throw new Error();
      return await r.json();
    } catch (e) { return FALLBACK_LEVELS; }
  },
  async buyShip(shipId) {
    try {
      const r = await fetch(`${API_BASE}/player/${USERNAME}/buy-ship`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipId })
      });
      const data = await r.json();
      if (!r.ok) return { error: data.error };
      return data;
    } catch (e) {
      const p = loadLocalProfile();
      const ship = FALLBACK_SHIPS.find(s => s.id === shipId);
      if (!ship) return { error: 'Ship not found' };
      if (p.ownedShips.find(s => s.id === shipId)) return { error: 'Ship already owned' };
      if (p.coins < ship.cost) return { error: 'Not enough coins' };
      if (p.currentLevel < ship.unlock_level) return { error: 'Level not reached yet' };
      p.coins -= ship.cost;
      p.ownedShips.push(ship);
      saveLocalProfile(p);
      return p;
    }
  },
  async selectShip(shipId) {
    try {
      const r = await fetch(`${API_BASE}/player/${USERNAME}/select-ship`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipId })
      });
      return await r.json();
    } catch (e) {
      const p = loadLocalProfile();
      p.currentShipId = shipId;
      saveLocalProfile(p);
      return p;
    }
  },
  async reportLevelResult(levelId, won, coinsCollected) {
    try {
      const r = await fetch(`${API_BASE}/player/${USERNAME}/level-result`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ levelId, won, coinsCollected })
      });
      return await r.json();
    } catch (e) {
      const p = loadLocalProfile();
      const level = FALLBACK_LEVELS.find(l => l.id === levelId);
      const total = coinsCollected + (won ? (level ? level.reward_coins : 0) : 0);
      p.coins += total;
      if (won && level && level.level_number >= p.currentLevel) p.currentLevel = level.level_number + 1;
      saveLocalProfile(p);
      return p;
    }
  }
};

// ==========================================================
// GAME ENGINE
// ==========================================================

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}
window.addEventListener('resize', resizeCanvas);

const HUD = {
  hearts: document.getElementById('hearts'),
  coinCount: document.getElementById('coin-count'),
  powerFill: document.getElementById('power-fill'),
  pathFill: document.getElementById('path-fill'),
  pathShip: document.getElementById('path-ship-marker'),
  levelLabel: document.getElementById('level-label'),
};

const Overlays = {
  start: document.getElementById('overlay-start'),
  win: document.getElementById('overlay-win'),
  lose: document.getElementById('overlay-lose'),
  shop: document.getElementById('overlay-shop'),
};
function showOverlay(name) {
  Object.values(Overlays).forEach(o => o.classList.add('hidden'));
  if (name) Overlays[name].classList.remove('hidden');
}

// ---------- Global game state ----------
const state = {
  profile: null,
  ships: [],
  levels: [],
  currentLevel: null,
  running: false,
  distance: 0,          // progress toward goal
  coinsThisRun: 0,
  hearts: 3,
  invincibleUntil: 0,
  powerCharge: 0,        // 0..100
  powerActive: false,
  powerActiveUntil: 0,
  lastShotAt: 0,
  keys: { left: false, right: false, up: false, down: false },
  player: { x: 0, y: 0, w: 40, h: 48 },
  obstacles: [],
  aliens: [],
  bullets: [],
  alienBullets: [],
  coins: [],
  lastSpawn: 0,
};

function currentShip() {
  const id = state.profile ? state.profile.currentShipId : 1;
  return state.ships.find(s => s.id === id) || state.ships[0];
}

// ---------- Init ----------
async function init() {
  resizeCanvas();
  const [profile, ships, levels] = await Promise.all([Api.getPlayer(), Api.getShips(), Api.getLevels()]);
  state.profile = profile;
  state.ships = ships;
  state.levels = levels;
  updateHudStatic();
  showOverlay('start');
}

function updateHudStatic() {
  HUD.coinCount.textContent = state.profile.coins;
  renderHearts(state.profile.hearts ?? 3);
}
function renderHearts(n) {
  HUD.hearts.textContent = '❤️'.repeat(Math.max(0, n)) + '🖤'.repeat(Math.max(0, 3 - n));
}

// ---------- Start a level ----------
function startLevel(levelNumber) {
  const level = state.levels.find(l => l.level_number === levelNumber) || state.levels[0];
  state.currentLevel = level;
  state.distance = 0;
  state.coinsThisRun = 0;
  state.hearts = 3;
  state.powerCharge = 0;
  state.powerActive = false;
  state.obstacles = [];
  state.aliens = [];
  state.bullets = [];
  state.alienBullets = [];
  state.coins = [];
  state.lastSpawn = 0;

  resizeCanvas();
  state.player.x = canvas.width / 2 - state.player.w / 2;
  state.player.y = canvas.height - 120;

  HUD.levelLabel.textContent = `Level ${level.level_number}: ${level.name}`;
  renderHearts(state.hearts);
  HUD.coinCount.textContent = state.profile.coins;

  showOverlay(null);
  state.running = true;
  state.lastFrame = performance.now();
  requestAnimationFrame(loop);
}

// ---------- Spawning ----------
function maybeSpawn(dt, now) {
  const density = state.currentLevel.obstacle_density;
  const spawnInterval = Math.max(280, 900 - density * 900); // faster spawn on harder levels
  if (now - state.lastSpawn < spawnInterval) return;
  state.lastSpawn = now;

  const roll = Math.random();
  if (roll < 0.45) {
    // obstacle (asteroid)
    const size = 24 + Math.random() * 28;
    state.obstacles.push({
      x: Math.random() * (canvas.width - size), y: -size,
      w: size, h: size, vy: 2 + Math.random() * 2 + density * 2, rot: Math.random() * 6
    });
  } else if (roll < 0.75 && state.aliens.length < state.currentLevel.alien_count) {
    // alien
    state.aliens.push({
      x: Math.random() * (canvas.width - 36), y: -36,
      w: 36, h: 30, vy: 1.4 + Math.random() * 1.2, lastShot: now, shotInterval: 1400 - density * 500
    });
  } else if (roll < 0.9) {
    // coin
    state.coins.push({ x: Math.random() * (canvas.width - 20), y: -20, w: 20, h: 20, vy: 2.5 });
  } else {
    // power orb (fills power meter faster / grants shield charge)
    state.coins.push({ x: Math.random() * (canvas.width - 24), y: -24, w: 24, h: 24, vy: 2.2, power: true });
  }
}

// ---------- Update ----------
function update(dt, now) {
  const ship = currentShip();

  // Player movement from held control keys
  const speed = ship.speed * (dt / 16.67);
  if (state.keys.left) state.player.x -= speed;
  if (state.keys.right) state.player.x += speed;
  if (state.keys.up) state.player.y -= speed;
  if (state.keys.down) state.player.y += speed;

  state.player.x = Math.max(4, Math.min(canvas.width - state.player.w - 4, state.player.x));
  state.player.y = Math.max(4, Math.min(canvas.height - state.player.h - 4, state.player.y));

  // Auto-fire bullets
  if (now - state.lastShotAt > ship.fire_rate) {
    state.lastShotAt = now;
    state.bullets.push({ x: state.player.x + state.player.w / 2 - 3, y: state.player.y, w: 6, h: 14, vy: -9 });
  }

  // Forward progress (the "flight" toward the goal)
  state.distance += (2.6 + ship.speed * 0.15) * (dt / 16.67);

  maybeSpawn(dt, now);

  // Move + cull entities
  moveEntities(state.obstacles, dt);
  moveEntities(state.coins, dt);
  moveEntities(state.bullets, dt, true);
  moveEntities(state.alienBullets, dt);

  state.aliens.forEach(a => {
    a.y += a.vy * (dt / 16.67);
    // simple side-to-side drift
    a.x += Math.sin((now + a.y) / 300) * 0.6;
    if (now - a.lastShot > a.shotInterval) {
      a.lastShot = now;
      state.alienBullets.push({ x: a.x + a.w / 2 - 2, y: a.y + a.h, w: 4, h: 12, vy: 5 });
    }
  });
  state.aliens = state.aliens.filter(a => a.y < canvas.height + 50);

  // Bullets vs aliens / obstacles
  state.bullets.forEach(b => {
    state.aliens.forEach(a => {
      if (!b.dead && !a.dead && rectsOverlap(b, a)) { b.dead = true; a.dead = true; state.coinsThisRun += 5; }
    });
    state.obstacles.forEach(o => {
      if (!b.dead && !o.dead && rectsOverlap(b, o)) { b.dead = true; o.dead = true; }
    });
  });
  state.bullets = state.bullets.filter(b => !b.dead);
  state.aliens = state.aliens.filter(a => !a.dead);
  state.obstacles = state.obstacles.filter(o => !o.dead);

  // Coin pickups
  state.coins.forEach(c => {
    if (!c.dead && rectsOverlap(state.player, c)) {
      c.dead = true;
      if (c.power) { state.powerCharge = Math.min(100, state.powerCharge + 34); }
      else { state.coinsThisRun += 10; }
    }
  });
  state.coins = state.coins.filter(c => !c.dead);

  // Slowly regenerate power charge over time too
  state.powerCharge = Math.min(100, state.powerCharge + (dt / 1000) * 3.5);

  // Power active window (shield): grants invincibility + clears nearby threats a bit
  if (state.powerActive && now > state.powerActiveUntil) state.powerActive = false;

  // Collisions with player (obstacles / aliens / alien bullets)
  const invincible = state.powerActive || now < state.invincibleUntil;
  if (!invincible) {
    const hit = [...state.obstacles, ...state.aliens, ...state.alienBullets]
      .some(e => rectsOverlap(state.player, e));
    if (hit) onPlayerHit(now);
  }

  // Cull off-screen alien bullets
  state.alienBullets = state.alienBullets.filter(b => b.y < canvas.height + 30);

  // Update HUD bars
  const pct = Math.min(100, (state.distance / state.currentLevel.distance) * 100);
  HUD.pathFill.style.width = pct + '%';
  HUD.pathShip.style.left = pct + '%';
  HUD.powerFill.style.width = state.powerCharge + '%';
  HUD.coinCount.textContent = state.profile.coins + state.coinsThisRun;

  if (pct >= 100) return winLevel();
  if (state.hearts <= 0) return loseLevel();
}

function moveEntities(list, dt, isBullet) {
  list.forEach(e => { e.y += (e.vy || 0) * (dt / 16.67); });
  const filtered = list.filter(e => isBullet ? e.y > -30 : e.y < canvas.height + 40);
  list.length = 0;
  list.push(...filtered);
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function onPlayerHit(now) {
  state.hearts -= 1;
  state.invincibleUntil = now + 1200; // brief grace period after a hit
  renderHearts(state.hearts);
  canvas.classList.add('shake');
  setTimeout(() => canvas.classList.remove('shake'), 200);
}

function activatePower() {
  if (state.powerCharge < 100) return;
  state.powerCharge = 0;
  state.powerActive = true;
  state.powerActiveUntil = performance.now() + 2500;
  // Power clears nearby obstacles/aliens as a burst effect
  state.obstacles = state.obstacles.filter(o => o.y < state.player.y - 140 || o.y > state.player.y + 60);
  state.aliens = state.aliens.filter(a => a.y < state.player.y - 140 || a.y > state.player.y + 60);
  state.alienBullets = [];
}

// ---------- Draw ----------
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // starfield
  drawStars();

  // coins
  ctx.font = '18px sans-serif';
  state.coins.forEach(c => ctx.fillText(c.power ? '⚡' : '🪙', c.x, c.y + 16));

  // obstacles
  ctx.font = '26px sans-serif';
  state.obstacles.forEach(o => ctx.fillText('☄️', o.x, o.y + 22));

  // aliens
  ctx.font = '26px sans-serif';
  state.aliens.forEach(a => ctx.fillText('👾', a.x, a.y + 24));

  // bullets
  ctx.fillStyle = '#00e5ff';
  state.bullets.forEach(b => ctx.fillRect(b.x, b.y, b.w, b.h));
  ctx.fillStyle = '#ff1744';
  state.alienBullets.forEach(b => ctx.fillRect(b.x, b.y, b.w, b.h));

  // player ship
  const ship = currentShip();
  const now = performance.now();
  const invincible = state.powerActive || now < state.invincibleUntil;
  ctx.save();
  if (invincible) {
    ctx.shadowColor = state.powerActive ? '#ffd600' : '#00e5ff';
    ctx.shadowBlur = 22;
  }
  ctx.font = '40px sans-serif';
  ctx.fillText('🚀', state.player.x, state.player.y + 40);
  ctx.restore();
  // ship color underline (visual identity)
  ctx.fillStyle = ship.color;
  ctx.fillRect(state.player.x + 4, state.player.y + state.player.h - 4, state.player.w - 8, 3);
}

function drawStars() {
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  const t = performance.now() / 20;
  for (let i = 0; i < 60; i++) {
    const x = (i * 97 + 31) % canvas.width;
    const y = (i * 53 + t) % canvas.height;
    ctx.fillRect(x, y, 2, 2);
  }
}

// ---------- Main loop ----------
function loop(now) {
  if (!state.running) return;
  const dt = Math.min(48, now - state.lastFrame);
  state.lastFrame = now;
  update(dt, now);
  if (!state.running) return; // update() may have ended the run
  draw();
  requestAnimationFrame(loop);
}

// ---------- Win / lose ----------
async function winLevel() {
  state.running = false;
  const totalCoins = state.coinsThisRun + state.currentLevel.reward_coins;
  document.getElementById('win-summary').textContent =
    `Level ${state.currentLevel.level_number} cleared! +${totalCoins} coins earned.`;
  const updated = await Api.reportLevelResult(state.currentLevel.id, true, state.coinsThisRun);
  state.profile = normalizeProfile(updated);
  updateHudStatic();
  showOverlay('win');
}

async function loseLevel() {
  state.running = false;
  document.getElementById('lose-summary').textContent =
    `Your ship was destroyed on Level ${state.currentLevel.level_number}. Coins collected: ${state.coinsThisRun}.`;
  const updated = await Api.reportLevelResult(state.currentLevel.id, false, state.coinsThisRun);
  state.profile = normalizeProfile(updated);
  updateHudStatic();
  showOverlay('lose');
}

function normalizeProfile(p) {
  // backend and local-fallback both return roughly the same shape;
  // this keeps field names consistent for the rest of the app.
  return {
    coins: p.coins,
    hearts: p.hearts ?? 3,
    currentShipId: p.currentShipId ?? p.current_ship_id,
    currentLevel: p.currentLevel ?? p.current_level,
    ownedShips: p.ownedShips ?? [],
  };
}

// ==========================================================
// SHOP
// ==========================================================
function renderShop() {
  const list = document.getElementById('shop-list');
  list.innerHTML = '';
  state.ships.forEach(ship => {
    const owned = state.profile.ownedShips.some(s => s.id === ship.id);
    const isCurrent = state.profile.currentShipId === ship.id;
    const lockedByLevel = state.profile.currentLevel < ship.unlock_level;

    const row = document.createElement('div');
    row.className = 'shop-item' + (owned ? ' owned' : '') + (isCurrent ? ' current' : '');

    const info = document.createElement('div');
    info.className = 'info';
    info.innerHTML = `<b style="color:${ship.color}">${ship.name}</b>
      Speed ${ship.speed} · Power ${ship.power_capacity} · Fire ${ship.fire_rate}ms
      ${ship.cost > 0 ? `<br>Cost: 🪙${ship.cost}` : '<br>Free starter ship'}
      ${lockedByLevel ? `<br><i>Unlocks at Level ${ship.unlock_level}</i>` : ''}`;

    const btn = document.createElement('button');
    if (isCurrent) { btn.textContent = 'EQUIPPED'; btn.disabled = true; }
    else if (owned) { btn.textContent = 'EQUIP'; btn.onclick = () => equipShip(ship.id); }
    else if (lockedByLevel) { btn.textContent = 'LOCKED'; btn.disabled = true; }
    else { btn.textContent = `BUY 🪙${ship.cost}`; btn.disabled = state.profile.coins < ship.cost; btn.onclick = () => buyShip(ship.id); }

    row.appendChild(info);
    row.appendChild(btn);
    list.appendChild(row);
  });
}

async function buyShip(shipId) {
  const result = await Api.buyShip(shipId);
  if (result.error) { alert(result.error); return; }
  state.profile = normalizeProfile(result);
  updateHudStatic();
  renderShop();
}
async function equipShip(shipId) {
  const result = await Api.selectShip(shipId);
  state.profile = normalizeProfile(result);
  renderShop();
}

// ==========================================================
// CONTROLS
// ==========================================================
function bindHold(el, onDown, onUp) {
  const down = e => { e.preventDefault(); onDown(); };
  const up = e => { e.preventDefault(); onUp(); };
  el.addEventListener('mousedown', down);
  el.addEventListener('touchstart', down, { passive: false });
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(ev => el.addEventListener(ev, up));
}

bindHold(document.getElementById('btn-left'), () => state.keys.left = true, () => state.keys.left = false);
bindHold(document.getElementById('btn-right'), () => state.keys.right = true, () => state.keys.right = false);
bindHold(document.getElementById('btn-up'), () => state.keys.up = true, () => state.keys.up = false);
bindHold(document.getElementById('btn-down'), () => state.keys.down = true, () => state.keys.down = false);
document.getElementById('btn-power').addEventListener('click', activatePower);

window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') state.keys.left = true;
  if (e.key === 'ArrowRight') state.keys.right = true;
  if (e.key === 'ArrowUp') state.keys.up = true;
  if (e.key === 'ArrowDown') state.keys.down = true;
  if (e.code === 'Space') activatePower();
});
window.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft') state.keys.left = false;
  if (e.key === 'ArrowRight') state.keys.right = false;
  if (e.key === 'ArrowUp') state.keys.up = false;
  if (e.key === 'ArrowDown') state.keys.down = false;
});

// ---------- Menu buttons ----------
document.getElementById('btn-play').onclick = () => startLevel(state.profile.currentLevel || 1);
document.getElementById('btn-shop').onclick = () => { renderShop(); showOverlay('shop'); };
document.getElementById('btn-close-shop').onclick = () => showOverlay(state.running ? null : 'start');
document.getElementById('btn-win-shop').onclick = () => { renderShop(); showOverlay('shop'); };
document.getElementById('btn-next-level').onclick = () => startLevel(state.profile.currentLevel || (state.currentLevel.level_number + 1));
document.getElementById('btn-retry').onclick = () => startLevel(state.currentLevel.level_number);
document.getElementById('btn-lose-menu').onclick = () => showOverlay('start');

// ---------- Boot ----------
init();
