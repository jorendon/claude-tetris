'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#5c9dff', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // NUT - gris metálico
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // NUT - tuerca con hueco central
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const ENERGY_MAX = 100;
const ENERGY_GAIN = [0, 10, 25, 45, 70];
const QUEUE_SIZE = 6;
const SLOW_FACTOR = 2.5;
const PREVIEW_DURATION = 8000;

const POWERUP_INTERVAL = 10;
const POWERUPS = [
  { key: 'bomb', icon: '💣', color: '#ff5252', label: 'Bomba' },
  { key: 'lightning', icon: '⚡', color: '#ffee58', label: 'Rayo' },
  { key: 'dye', icon: '🎨', color: '#ba68c8', label: 'Tinte' },
  { key: 'gravity', icon: '🔽', color: '#4dd0e1', label: 'Gravedad' },
  { key: 'freeze', icon: '❄️', color: '#81d4fa', label: 'Congelar' },
];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const energyFillEl = document.getElementById('energy-fill');
const abilityOverlay = document.getElementById('ability-overlay');
const extendedPreviewSection = document.getElementById('extended-preview-section');
const extendedPreviewList = document.getElementById('extended-preview-list');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let pendingPowerUp, freezeUntil;
let queue, energy, abilityMenuOpen, holdPiece, lastLock, previewUntil, slowUntil, audioCtx;
let gridColor = '#22222e';

const THEME_KEY = 'tetris-theme';

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  themeToggle.checked = theme === 'light';
  gridColor = getComputedStyle(document.body).getPropertyValue('--grid-line-color').trim();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggle.addEventListener('change', () => {
  const theme = themeToggle.checked ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
});

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPowerUpPiece() {
  const piece = randomPiece();
  piece.powerUp = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
  return piece;
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    const prevLines = lines;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    if (Math.floor(lines / POWERUP_INTERVAL) > Math.floor(prevLines / POWERUP_INTERVAL)) {
      pendingPowerUp = true;
    }
    const wasFull = energy >= ENERGY_MAX;
    energy = Math.min(ENERGY_MAX, energy + (ENERGY_GAIN[cleared] || 0));
    if (!wasFull && energy >= ENERGY_MAX) playEnergyFullSound();
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  lastLock = {
    board: board.map(row => row.slice()),
    score, lines, level, dropInterval,
    piece: { type: current.type, shape: current.shape.map(r => r.slice()), x: current.x, y: current.y, powerUp: current.powerUp },
    queue: queue.map(p => ({ type: p.type, shape: p.shape.map(r => r.slice()), x: p.x, y: p.y, powerUp: p.powerUp })),
    holdPiece: holdPiece ? { type: holdPiece.type, shape: holdPiece.shape.map(r => r.slice()), powerUp: holdPiece.powerUp } : null,
  };
  merge();
  if (current.powerUp) {
    applyPowerUp(current.powerUp, current);
  }
  clearLines();
  spawn();
}

function spawn() {
  current = queue.shift();
  const piece = pendingPowerUp ? randomPowerUpPiece() : randomPiece();
  pendingPowerUp = false;
  queue.push(piece);
  next = queue[0];
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function undoLastLock() {
  if (!lastLock) return;
  board = lastLock.board.map(row => row.slice());
  score = lastLock.score;
  lines = lastLock.lines;
  level = lastLock.level;
  dropInterval = lastLock.dropInterval;
  current = { type: lastLock.piece.type, shape: lastLock.piece.shape.map(r => r.slice()), x: lastLock.piece.x, y: lastLock.piece.y, powerUp: lastLock.piece.powerUp };
  queue = lastLock.queue.map(p => ({ type: p.type, shape: p.shape.map(r => r.slice()), x: p.x, y: p.y, powerUp: p.powerUp }));
  holdPiece = lastLock.holdPiece ? { type: lastLock.holdPiece.type, shape: lastLock.holdPiece.shape.map(r => r.slice()), powerUp: lastLock.holdPiece.powerUp } : null;
  next = queue[0];
  lastLock = null;
  drawNext();
}

function swapCurrentPiece() {
  const replacement = randomPiece();
  replacement.x = current.x;
  replacement.y = current.y;
  if (collide(replacement.shape, replacement.x, replacement.y)) {
    replacement.x = Math.floor(COLS / 2) - Math.floor(replacement.shape[0].length / 2);
    replacement.y = 0;
  }
  current = replacement;
}

function useHold() {
  if (!holdPiece) {
    holdPiece = { type: current.type, shape: PIECES[current.type].map(r => r.slice()), powerUp: current.powerUp };
    current = queue.shift();
    queue.push(pendingPowerUp ? randomPowerUpPiece() : randomPiece());
    pendingPowerUp = false;
    next = queue[0];
  } else {
    const stored = holdPiece;
    holdPiece = { type: current.type, shape: PIECES[current.type].map(r => r.slice()), powerUp: current.powerUp };
    const shape = PIECES[stored.type].map(r => r.slice());
    current = { type: stored.type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0, powerUp: stored.powerUp };
  }
  if (collide(current.shape, current.x, current.y)) endGame();
  drawNext();
  drawHold();
}

function activateExtendedPreview() {
  previewUntil = performance.now() + PREVIEW_DURATION;
}

function activateSlow() {
  slowUntil = performance.now() + 10000;
}

function applyPowerUp(effect, piece) {
  switch (effect.key) {
    case 'bomb': applyBomb(piece); break;
    case 'lightning': applyLightning(); break;
    case 'dye': applyDye(); break;
    case 'gravity': applyGravity(); break;
    case 'freeze': applyFreeze(); break;
  }
  updateHUD();
}

function applyBomb(piece) {
  const cx = piece.x + Math.floor(piece.shape[0].length / 2);
  const cy = piece.y + Math.floor(piece.shape.length / 2);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = cy + dr, c = cx + dc;
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
    }
  }
  score += 150 * level;
}

function applyLightning() {
  if (Math.random() < 0.5) {
    const r = Math.floor(Math.random() * ROWS);
    board[r] = new Array(COLS).fill(0);
  } else {
    const c = Math.floor(Math.random() * COLS);
    for (let r = 0; r < ROWS; r++) board[r][c] = 0;
  }
  score += 200 * level;
}

function applyDye() {
  const counts = new Array(COLORS.length).fill(0);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c]) counts[board[r][c]]++;
  let targetColor = 0, max = 0;
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] > max) { max = counts[i]; targetColor = i; }
  }
  if (!targetColor) return;
  let cleared = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === targetColor) { board[r][c] = 0; cleared++; }
  score += 20 * level * cleared;
}

function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    const values = [];
    for (let r = 0; r < ROWS; r++) if (board[r][c]) values.push(board[r][c]);
    const pad = ROWS - values.length;
    for (let r = 0; r < ROWS; r++) board[r][c] = r < pad ? 0 : values[r - pad];
  }
  score += 100 * level;
}

function applyFreeze() {
  freezeUntil = performance.now() + 5000;
  score += 50 * level;
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  energyFillEl.style.width = Math.min(100, (energy / ENERGY_MAX) * 100) + '%';
  energyFillEl.classList.toggle('full', energy >= ENERGY_MAX);
  drawHold();
}

function playTone(freq, duration, type, delay) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const t0 = audioCtx.currentTime + (delay || 0);
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.15, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + duration);
}

function playEnergyFullSound() {
  playTone(660, 0.12, 'square', 0);
  playTone(880, 0.15, 'square', 0.12);
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawPieceCells(context, piece, x, y, size, alpha) {
  const powerUp = piece.powerUp;
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      if (powerUp) {
        context.globalAlpha = alpha ?? 1;
        context.fillStyle = powerUp.color;
        context.fillRect((x + c) * size + 1, (y + r) * size + 1, size - 2, size - 2);
        context.fillStyle = 'rgba(255,255,255,0.12)';
        context.fillRect((x + c) * size + 1, (y + r) * size + 1, size - 2, 4);
        context.globalAlpha = 1;
      } else {
        drawBlock(context, x + c, y + r, piece.shape[r][c], size, alpha);
      }
    }
  }
  if (powerUp && !alpha) {
    const cx = (x + piece.shape[0].length / 2) * size;
    const cy = (y + piece.shape.length / 2) * size;
    context.font = `${Math.floor(size * 0.9)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(powerUp.icon, cx, cy);
  }
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  drawPieceCells(ctx, current, current.x, gy, BLOCK, 0.2);

  // current piece
  drawPieceCells(ctx, current, current.x, current.y, BLOCK);

  // freeze indicator
  if (freezeUntil && performance.now() < freezeUntil) {
    ctx.fillStyle = 'rgba(10, 10, 20, 0.6)';
    ctx.fillRect(0, 0, canvas.width, 26);
    ctx.fillStyle = '#81d4fa';
    ctx.font = "14px 'Courier New', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('❄️ CONGELADO', canvas.width / 2, 13);
  }

  // slow-time indicator
  if (slowUntil && performance.now() < slowUntil) {
    ctx.fillStyle = 'rgba(10, 10, 20, 0.6)';
    ctx.fillRect(0, canvas.height - 26, canvas.width, 26);
    ctx.fillStyle = '#7aa2f7';
    ctx.font = "14px 'Courier New', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐢 LENTO', canvas.width / 2, canvas.height - 13);
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  drawPieceCells(nextCtx, next, offX, offY, NB);
}

function drawHold() {
  const NB = 30;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (!holdPiece) return;
  const shape = holdPiece.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  drawPieceCells(holdCtx, holdPiece, offX, offY, NB);
}

function updateExtendedPreviewUI() {
  const active = previewUntil && performance.now() < previewUntil;
  extendedPreviewSection.hidden = !active;
  if (!active) return;
  extendedPreviewList.innerHTML = '';
  queue.slice(0, 5).forEach(p => {
    const chip = document.createElement('span');
    chip.className = 'preview-chip';
    chip.style.background = COLORS[p.type];
    chip.textContent = p.powerUp ? p.powerUp.icon : '';
    extendedPreviewList.appendChild(chip);
  });
}

function openAbilityMenu() {
  abilityMenuOpen = true;
  cancelAnimationFrame(animId);
  abilityOverlay.classList.remove('hidden');
}

function selectAbility(n) {
  switch (n) {
    case 1: activateExtendedPreview(); break;
    case 2: swapCurrentPiece(); break;
    case 3: activateSlow(); break;
    case 4: undoLastLock(); break;
    case 5: useHold(); break;
  }
  energy = 0;
  abilityMenuOpen = false;
  abilityOverlay.classList.add('hidden');
  updateHUD();
  lastTime = performance.now();
  loop(lastTime);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (!(freezeUntil && ts < freezeUntil)) {
    dropAccum += dt;
  }
  const effectiveInterval = (slowUntil && ts < slowUntil) ? dropInterval * SLOW_FACTOR : dropInterval;
  if (dropAccum >= effectiveInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  updateExtendedPreviewUI();
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  pendingPowerUp = false;
  freezeUntil = null;
  energy = 0;
  abilityMenuOpen = false;
  holdPiece = null;
  lastLock = null;
  previewUntil = 0;
  slowUntil = 0;
  lastTime = performance.now();
  queue = Array.from({ length: QUEUE_SIZE }, () => randomPiece());
  spawn();
  updateHUD();
  drawHold();
  overlay.classList.add('hidden');
  abilityOverlay.classList.add('hidden');
  extendedPreviewSection.hidden = true;
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (abilityMenuOpen) {
    const map = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5 };
    if (map[e.code]) selectAbility(map[e.code]);
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  if (e.code === 'KeyE') {
    if (energy >= ENERGY_MAX) openAbilityMenu();
    return;
  }
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

document.querySelectorAll('.ability-list li').forEach(li => {
  li.addEventListener('click', () => {
    if (abilityMenuOpen) selectAbility(Number(li.dataset.ability));
  });
});

restartBtn.addEventListener('click', init);

initTheme();
init();
