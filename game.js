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
  '#707070', // basura de desafío
];

const GARBAGE_COLOR = 9;

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

const CHALLENGES = [
  {
    id: 'lines-time',
    name: 'Cuenta atrás',
    desc: 'Limpia 40 líneas antes de que se acabe el tiempo (2 minutos).',
    goalLines: 40,
    timeLimit: 120000,
  },
  {
    id: 'garbage',
    name: 'Marea de basura',
    desc: 'Cada 10s sube una fila de basura desde abajo. Aguanta 2 minutos sin que el stack llegue arriba.',
    garbageInterval: 10000,
    survivalGoal: 120000,
  },
  {
    id: 'preset',
    name: 'Terreno minado',
    desc: 'El tablero arranca con bloques ya colocados. Limpia 10 líneas para superar el desafío.',
    goalLines: 10,
    preset: true,
  },
  {
    id: 'invisible',
    name: 'Piezas fantasma',
    desc: 'La pieza se vuelve invisible justo antes de tocar el suelo. Limpia 15 líneas para ganar.',
    goalLines: 15,
    invisibleNearGround: true,
  },
  {
    id: 'reverse-rotation',
    name: 'Rotación inversa',
    desc: 'A partir del nivel 5 la rotación se invierte. Alcanza el nivel 8 para ganar.',
    goalLevel: 8,
    reverseRotationLevel: 5,
  },
];

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
const holdSection = document.getElementById('hold-section');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const changeModeBtn = document.getElementById('change-mode-btn');
const themeToggle = document.getElementById('theme-toggle');
const challengeSelect = document.getElementById('challenge-select');
const challengeListEl = document.getElementById('challenge-list');
const challengeHud = document.getElementById('challenge-hud');
const challengeNameEl = document.getElementById('challenge-name');
const challengeProgressEl = document.getElementById('challenge-progress');
const energyFillEl = document.getElementById('energy-fill');
const abilityOverlay = document.getElementById('ability-overlay');
const extendedPreviewSection = document.getElementById('extended-preview-section');
const extendedPreviewList = document.getElementById('extended-preview-list');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let pendingPowerUp, freezeUntil;
let hold, holdLocked;
let combo, b2bActive, lastMoveWasRotation, effects;
let audioCtx;
let activeChallenge, challengeDone, challengeTimeLeft, challengeElapsed, challengeGarbageAccum;
let queue, energy, abilityMenuOpen, lastLock, previewUntil, slowUntil;
let gridColor = '#22222e';

const EFFECT_DURATION = 1000;

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

function rotateCCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[cols - 1 - c][r] = shape[r][c];
  return result;
}

function tryRotate() {
  const reversed = activeChallenge && activeChallenge.reverseRotationLevel && level >= activeChallenge.reverseRotationLevel;
  const rotated = reversed ? rotateCCW(current.shape) : rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      lastMoveWasRotation = true;
      return;
    }
  }
}

function isTSpin(piece) {
  if (piece.type !== 3 || !lastMoveWasRotation) return false;
  const corners = [
    [piece.x, piece.y],
    [piece.x + 2, piece.y],
    [piece.x, piece.y + 2],
    [piece.x + 2, piece.y + 2],
  ];
  let occupied = 0;
  for (const [x, y] of corners) {
    if (x < 0 || x >= COLS || y >= ROWS) occupied++;
    else if (y >= 0 && board[y][x]) occupied++;
  }
  return occupied >= 3;
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines(tSpin) {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }

  if (tSpin) {
    score += 400 * level + (cleared ? 200 * level * cleared : 0);
    showEffect('T-SPIN!', '#ba68c8');
    playSound('tspin');
  }

  if (cleared) {
    combo++;
    const prevLines = lines;
    lines += cleared;
    let lineScore = (LINE_SCORES[cleared] || 0) * level * combo;
    const isTetris = cleared === 4;
    let b2b = false;
    if (isTetris && b2bActive) {
      lineScore = Math.round(lineScore * 1.5);
      b2b = true;
    }
    b2bActive = isTetris;
    score += lineScore;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    if (Math.floor(lines / POWERUP_INTERVAL) > Math.floor(prevLines / POWERUP_INTERVAL)) {
      pendingPowerUp = true;
    }
    if (combo >= 2) {
      showEffect(`COMBO x${combo}`, '#ffee58');
      playSound('combo', combo);
    }
    if (isTetris) {
      showEffect(b2b ? 'B2B TETRIS!' : 'TETRIS!', '#4dd0e1');
      playSound(b2b ? 'b2b' : 'tetris');
    }
    if (board.every(row => row.every(v => v === 0))) {
      score += 3000 * level;
      showEffect('PERFECT CLEAR!', '#fff176');
      playSound('perfect');
    }
    const wasFull = energy >= ENERGY_MAX;
    energy = Math.min(ENERGY_MAX, energy + (ENERGY_GAIN[cleared] || 0));
    if (!wasFull && energy >= ENERGY_MAX) playEnergyFullSound();
  } else {
    combo = 0;
  }
  updateHUD();
  checkChallengeGoals();
}

function checkChallengeGoals() {
  if (!activeChallenge || gameOver) return;
  if (activeChallenge.goalLines && lines >= activeChallenge.goalLines) {
    completeChallenge(true);
  } else if (activeChallenge.goalLevel && level >= activeChallenge.goalLevel) {
    completeChallenge(true);
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
    lastMoveWasRotation = false;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  const tSpin = isTSpin(current);
  lastLock = {
    board: board.map(row => row.slice()),
    score, lines, level, dropInterval,
    piece: { type: current.type, shape: current.shape.map(r => r.slice()), x: current.x, y: current.y, powerUp: current.powerUp },
    queue: queue.map(p => ({ type: p.type, shape: p.shape.map(r => r.slice()), x: p.x, y: p.y, powerUp: p.powerUp })),
    hold: hold ? { type: hold.type, shape: hold.shape.map(r => r.slice()), powerUp: hold.powerUp } : null,
    holdLocked,
  };
  merge();
  if (current.powerUp) {
    applyPowerUp(current.powerUp, current);
  }
  clearLines(tSpin);
  holdLocked = false;
  updateHoldUI();
  spawn();
}

function spawn() {
  current = queue.shift();
  const piece = pendingPowerUp ? randomPowerUpPiece() : randomPiece();
  pendingPowerUp = false;
  lastMoveWasRotation = false;
  queue.push(piece);
  next = queue[0];
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function resetSpawnPosition(piece) {
  piece.x = Math.floor(COLS / 2) - Math.floor(piece.shape[0].length / 2);
  piece.y = 0;
}

function holdCurrentPiece() {
  if (holdLocked) return;
  const stored = { type: current.type, shape: PIECES[current.type].map(row => [...row]) };
  if (current.powerUp) stored.powerUp = current.powerUp;
  if (hold) {
    const swapped = hold;
    hold = stored;
    current = swapped;
    resetSpawnPosition(current);
    if (collide(current.shape, current.x, current.y)) {
      endGame();
    }
  } else {
    hold = stored;
    spawn();
  }
  holdLocked = true;
  drawHold();
  updateHoldUI();
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
  hold = lastLock.hold ? { type: lastLock.hold.type, shape: lastLock.hold.shape.map(r => r.slice()), powerUp: lastLock.hold.powerUp } : null;
  holdLocked = lastLock.holdLocked;
  next = queue[0];
  lastLock = null;
  drawNext();
  drawHold();
  updateHoldUI();
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
  comboEl.textContent = combo >= 2 ? `x${combo}` : '—';
  energyFillEl.style.width = Math.min(100, (energy / ENERGY_MAX) * 100) + '%';
  energyFillEl.classList.toggle('full', energy >= ENERGY_MAX);
  updateChallengeHUD();
}

function showEffect(text, color) {
  effects.push({ text, color, start: performance.now() });
}

function playSound(kind, arg) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const now = audioCtx.currentTime;
  const tones = {
    combo: [440 + (arg || 2) * 60],
    tspin: [523.25, 659.25],
    tetris: [392, 523.25, 659.25],
    b2b: [523.25, 659.25, 783.99],
    perfect: [523.25, 659.25, 783.99, 1046.5],
  };
  const freqs = tones[kind] || [440];
  freqs.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = kind === 'tspin' ? 'triangle' : 'square';
    osc.frequency.value = freq;
    const start = now + i * 0.09;
    gain.gain.setValueAtTime(0.15, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + 0.16);
  });
}

function formatTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function challengeProgressText() {
  switch (activeChallenge.id) {
    case 'lines-time':
      return `Líneas ${lines}/${activeChallenge.goalLines} · ${formatTime(challengeTimeLeft)}`;
    case 'garbage':
      return `Sobrevive ${formatTime(challengeElapsed)}/${formatTime(activeChallenge.survivalGoal)}`;
    case 'preset':
    case 'invisible':
      return `Líneas ${lines}/${activeChallenge.goalLines}`;
    case 'reverse-rotation':
      return `Nivel ${level}/${activeChallenge.goalLevel}${level >= activeChallenge.reverseRotationLevel ? ' · ¡invertida!' : ''}`;
    default:
      return '';
  }
}

function updateChallengeHUD() {
  if (!activeChallenge) {
    challengeHud.classList.add('hidden');
    return;
  }
  challengeHud.classList.remove('hidden');
  challengeNameEl.textContent = activeChallenge.name;
  challengeProgressEl.textContent = challengeProgressText();
}

function insertGarbageRow() {
  const hole = Math.floor(Math.random() * COLS);
  const overflow = board[0].some(v => v !== 0);
  board.shift();
  const row = new Array(COLS).fill(GARBAGE_COLOR);
  row[hole] = 0;
  board.push(row);
  if (overflow || collide(current.shape, current.x, current.y)) {
    endGame();
  }
}

function tickChallenge(dt) {
  if (!activeChallenge || gameOver) return;
  if (activeChallenge.timeLimit) {
    challengeTimeLeft -= dt;
    if (challengeTimeLeft <= 0) {
      challengeTimeLeft = 0;
      completeChallenge(lines >= activeChallenge.goalLines);
    }
  }
  if (activeChallenge.garbageInterval) {
    challengeElapsed += dt;
    challengeGarbageAccum += dt;
    if (challengeGarbageAccum >= activeChallenge.garbageInterval) {
      challengeGarbageAccum -= activeChallenge.garbageInterval;
      insertGarbageRow();
    }
    if (!gameOver && activeChallenge.survivalGoal && challengeElapsed >= activeChallenge.survivalGoal) {
      completeChallenge(true);
    }
  }
  updateChallengeHUD();
}

function applyPresetBoard() {
  const pattern = [
    [0,0,1,1,0,0,0,1,1,0],
    [0,1,1,0,0,0,0,1,1,0],
    [1,1,0,0,1,1,0,0,1,1],
    [1,0,0,0,1,1,0,0,0,1],
    [0,0,1,1,0,0,1,1,0,0],
    [0,1,1,0,0,0,0,1,1,0],
  ];
  const startRow = ROWS - pattern.length;
  for (let r = 0; r < pattern.length; r++)
    for (let c = 0; c < COLS; c++)
      if (pattern[r][c]) board[startRow + r][c] = ((r + c) % 7) + 1;
}

function completeChallenge(success) {
  if (challengeDone) return;
  challengeDone = true;
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = success ? '¡DESAFÍO SUPERADO!' : 'DESAFÍO FALLIDO';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()} · ${challengeProgressText()}`;
  overlay.classList.remove('hidden');
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
  const invisibleChallenge = activeChallenge && activeChallenge.invisibleNearGround;
  if (!invisibleChallenge) {
    drawPieceCells(ctx, current, current.x, gy, BLOCK, 0.2);
  }

  // current piece
  const nearGround = collide(current.shape, current.x, current.y + 1);
  if (invisibleChallenge && nearGround) {
    drawPieceCells(ctx, current, current.x, current.y, BLOCK, 0.05);
  } else {
    drawPieceCells(ctx, current, current.x, current.y, BLOCK);
  }

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

  drawEffects();
}

function drawEffects() {
  const now = performance.now();
  effects = effects.filter(e => now - e.start < EFFECT_DURATION);
  effects.forEach((e, i) => {
    const t = (now - e.start) / EFFECT_DURATION;
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = e.color;
    ctx.font = "bold 22px 'Courier New', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.text, canvas.width / 2, canvas.height / 2 - 20 * t + i * 26);
    ctx.globalAlpha = 1;
  });
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
  const HB = 30;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (!hold) return;
  const shape = hold.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  drawPieceCells(holdCtx, hold, offX, offY, HB);
}

function updateHoldUI() {
  holdSection.classList.toggle('locked', holdLocked);
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
    case 5: holdCurrentPiece(); break;
  }
  energy = 0;
  abilityMenuOpen = false;
  abilityOverlay.classList.add('hidden');
  updateHUD();
  lastTime = performance.now();
  loop(lastTime);
}

function endGame() {
  if (activeChallenge) {
    completeChallenge(false);
    return;
  }
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
      lastMoveWasRotation = false;
    } else {
      lockPiece();
    }
  }
  tickChallenge(dt);
  if (gameOver) return;
  updateExtendedPreviewUI();
  draw();
  animId = requestAnimationFrame(loop);
}

function init(challenge) {
  activeChallenge = challenge || null;
  challengeDone = false;
  challengeTimeLeft = activeChallenge && activeChallenge.timeLimit ? activeChallenge.timeLimit : 0;
  challengeElapsed = 0;
  challengeGarbageAccum = 0;
  board = createBoard();
  if (activeChallenge && activeChallenge.preset) applyPresetBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  pendingPowerUp = false;
  freezeUntil = null;
  hold = null;
  holdLocked = false;
  combo = 0;
  b2bActive = false;
  lastMoveWasRotation = false;
  effects = [];
  energy = 0;
  abilityMenuOpen = false;
  lastLock = null;
  previewUntil = 0;
  slowUntil = 0;
  lastTime = performance.now();
  queue = Array.from({ length: QUEUE_SIZE }, () => randomPiece());
  spawn();
  drawHold();
  updateHoldUI();
  updateHUD();
  overlay.classList.add('hidden');
  abilityOverlay.classList.add('hidden');
  extendedPreviewSection.hidden = true;
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function renderChallengeList() {
  challengeListEl.innerHTML = '';
  const options = [
    { id: 'classic', name: 'Modo clásico', desc: 'Tetris tradicional, sin objetivos especiales.' },
    ...CHALLENGES,
  ];
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'challenge-item';
    btn.innerHTML = `<span class="challenge-item-name">${opt.name}</span><span class="challenge-item-desc">${opt.desc}</span>`;
    btn.addEventListener('click', () => startChallenge(opt.id === 'classic' ? null : opt));
    challengeListEl.appendChild(btn);
  });
}

function startChallenge(challenge) {
  challengeSelect.classList.add('hidden');
  init(challenge);
}

document.addEventListener('keydown', e => {
  if (!current) return;
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
      if (!collide(current.shape, current.x - 1, current.y)) {
        current.x--;
        lastMoveWasRotation = false;
      }
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) {
        current.x++;
        lastMoveWasRotation = false;
      }
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
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdCurrentPiece();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => init(activeChallenge));

changeModeBtn.addEventListener('click', () => {
  cancelAnimationFrame(animId);
  overlay.classList.add('hidden');
  challengeSelect.classList.remove('hidden');
});

document.querySelectorAll('.ability-list li').forEach(li => {
  li.addEventListener('click', () => {
    if (abilityMenuOpen) selectAbility(Number(li.dataset.ability));
  });
});

initTheme();
renderChallengeList();
