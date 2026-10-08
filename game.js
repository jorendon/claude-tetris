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
const pauseMenu = document.getElementById('pause-menu');
const pauseMainView = document.getElementById('pause-main');
const pauseControlsView = document.getElementById('pause-controls');
const startLevelValueEl = document.getElementById('start-level-value');
const startLevelDownBtn = document.getElementById('start-level-down');
const startLevelUpBtn = document.getElementById('start-level-up');
const startLevelHintEl = document.getElementById('start-level-hint');
const recordEntryEl = document.getElementById('record-entry');
const recordMsgEl = document.getElementById('record-msg');
const recordForm = document.getElementById('record-form');
const recordNameInput = document.getElementById('record-name');
const overlayRecordsEl = document.getElementById('overlay-records');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let pendingPowerUp, freezeUntil;
let hold, holdLocked;
let combo, maxCombo, b2bActive, lastMoveWasRotation, effects;
let audioCtx;
let activeChallenge, challengeDone, challengeTimeLeft, challengeElapsed, challengeGarbageAccum;
let queue, energy, abilityMenuOpen, lastLock, previewUntil, slowUntil;
let gridColor = '#22222e';
let startLevel, baseLevel = 1;
let pauseView = 'main', pauseIndex = 0, pausedAt = 0;
const keysDown = new Set();
let suppressedKeys = new Set();

const START_LEVEL_KEY = 'tetris-start-level';
const MIN_START_LEVEL = 1;
const MAX_START_LEVEL = 15;

const EFFECT_DURATION = 1000;

const THEME_KEY = 'tetris-theme';
const RECORDS_KEY = 'tetris-records';
const LAST_NAME_KEY = 'tetris-last-name';
const MAX_RECORDS = 5;
const NAME_MAX_LENGTH = 12;

let records, pendingRecord, highlightRecord;

// Acceso a localStorage protegido: si no está disponible el juego sigue funcionando.
function storageGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* sin persistencia */ }
}

function storageRemove(key) {
  try { localStorage.removeItem(key); } catch (e) { /* sin persistencia */ }
}

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  themeToggle.checked = theme === 'light';
  gridColor = getComputedStyle(document.body).getPropertyValue('--grid-line-color').trim();
}

function initTheme() {
  const saved = storageGet(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggle.addEventListener('change', () => {
  const theme = themeToggle.checked ? 'light' : 'dark';
  storageSet(THEME_KEY, theme);
  applyTheme(theme);
});

function intervalForLevel(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function clampStartLevel(n) {
  return Math.min(MAX_START_LEVEL, Math.max(MIN_START_LEVEL, Math.floor(n) || MIN_START_LEVEL));
}

function loadStartLevel() {
  try {
    return clampStartLevel(Number(localStorage.getItem(START_LEVEL_KEY)));
  } catch (err) {
    return MIN_START_LEVEL;
  }
}

function saveStartLevel() {
  try {
    localStorage.setItem(START_LEVEL_KEY, String(startLevel));
  } catch (err) {
    // almacenamiento no disponible: el nivel sólo dura esta sesión
  }
}

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
    if (combo > maxCombo) maxCombo = combo;
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
    level = baseLevel + Math.floor(lines / 10);
    dropInterval = intervalForLevel(level);
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
  showGameEndRecords();
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

// ---- Skins (temas visuales) ----

function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.quadraticCurveTo(x + w, y, x + w, y + r);
  context.lineTo(x + w, y + h - r);
  context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  context.lineTo(x + r, y + h);
  context.quadraticCurveTo(x, y + h, x, y + h - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function drawRetroBlock(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawNeonBlock(context, px, py, size, color) {
  context.shadowColor = color;
  context.shadowBlur = size * 0.5;
  context.fillStyle = color;
  context.fillRect(px + 2, py + 2, size - 4, size - 4);
  context.shadowBlur = 0;
  // núcleo oscuro + borde brillante para el look de tubo de neón
  context.fillStyle = 'rgba(0,0,0,0.45)';
  context.fillRect(px + 5, py + 5, size - 10, size - 10);
  context.strokeStyle = 'rgba(255,255,255,0.7)';
  context.lineWidth = 1;
  context.strokeRect(px + 2.5, py + 2.5, size - 5, size - 5);
}

function drawPastelBlock(context, px, py, size, color) {
  const radius = size * 0.25;
  roundedRectPath(context, px + 1.5, py + 1.5, size - 3, size - 3, radius);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,0.55)';
  context.lineWidth = 1;
  context.stroke();
  // brillo suave superior
  roundedRectPath(context, px + 5, py + 4, size - 10, size * 0.28, radius * 0.6);
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fill();
}

function drawPixelBlock(context, px, py, size, color) {
  const p = Math.max(2, Math.floor(size / 6)); // tamaño de "píxel" de la textura
  const n = Math.floor(size / p);
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let shade = null;
      if (i === 0 || j === 0) shade = 'rgba(255,255,255,0.45)';          // borde de luz
      else if (i === n - 1 || j === n - 1) shade = 'rgba(0,0,0,0.45)';    // borde de sombra
      else if (i === 1 && j === 1) shade = 'rgba(255,255,255,0.7)';       // brillo
      else if ((i + j * 2) % 5 === 0) shade = 'rgba(0,0,0,0.15)';         // tramado
      if (!shade) continue;
      context.fillStyle = shade;
      context.fillRect(px + i * p, py + j * p, p, p);
    }
  }
  context.strokeStyle = 'rgba(0,0,0,0.6)';
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
}

// Cada skin: paleta (índices iguales a COLORS), fondo/rejilla del tablero
// (null = usar los del tema claro/oscuro de la página) y función de dibujo de bloque.
const SKINS = {
  retro: {
    label: 'Retro',
    colors: COLORS,
    boardBg: null,
    grid: null,
    drawBlock: drawRetroBlock,
  },
  neon: {
    label: 'Neón',
    colors: [null, '#00f0ff', '#fff200', '#d500f9', '#39ff14', '#ff1744', '#2979ff', '#ff9100', '#e0e0ff', '#6a6a8a'],
    boardBg: '#000000',
    grid: '#101018',
    drawBlock: drawNeonBlock,
  },
  pastel: {
    label: 'Pastel',
    colors: [null, '#a8e6ef', '#fff1a8', '#d7b8f3', '#b8e6c1', '#f7b2b7', '#b3cdf7', '#ffd1a1', '#d9dee3', '#9e9aae'],
    boardBg: '#2e2a3e',
    grid: '#38344a',
    drawBlock: drawPastelBlock,
  },
  pixel: {
    label: 'Pixel art',
    colors: [null, '#3cbcfc', '#f8b800', '#b53cfc', '#58d854', '#f83800', '#0078f8', '#fc7460', '#bcbcbc', '#7c7c7c'],
    boardBg: '#141428',
    grid: '#1e1e38',
    drawBlock: drawPixelBlock,
  },
};

const SKIN_KEY = 'tetris-skin';
const DEFAULT_SKIN = 'retro';
let skinId = DEFAULT_SKIN;
let skin = SKINS[DEFAULT_SKIN];

function applySkin(id) {
  if (!SKINS[id]) id = DEFAULT_SKIN;
  skinId = id;
  skin = SKINS[id];
  Object.keys(SKINS).forEach(k => document.body.classList.toggle(`skin-${k}`, k === id));
  skinSelect.value = id;
  redrawAll();
}

function initSkin() {
  let saved = null;
  try {
    saved = localStorage.getItem(SKIN_KEY);
  } catch (err) {
    saved = null;
  }
  applySkin(SKINS[saved] ? saved : DEFAULT_SKIN);
}

function saveSkin(id) {
  try {
    localStorage.setItem(SKIN_KEY, id);
  } catch (err) {
    // sin almacenamiento disponible: la skin solo dura esta sesión
  }
}

// Redibuja todos los canvas (útil al cambiar de skin en pausa o game over).
function redrawAll() {
  if (!board || !current) return;
  draw();
  drawNext();
  drawHold();
  updateExtendedPreviewUI();
}

function fillCanvasBg(context, c) {
  if (skin.boardBg) {
    context.fillStyle = skin.boardBg;
    context.fillRect(0, 0, c.width, c.height);
  }
}

// Punto único de dibujo de celdas: tablero, pieza actual, ghost, next y hold.
function drawCell(context, x, y, color, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  skin.drawBlock(context, x * size, y * size, size, color);
  context.globalAlpha = 1;
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  drawCell(context, x, y, skin.colors[colorIndex], size, alpha);
}

function drawPieceCells(context, piece, x, y, size, alpha) {
  const powerUp = piece.powerUp;
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      if (powerUp) {
        drawCell(context, x + c, y + r, powerUp.color, size, alpha);
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
  ctx.strokeStyle = skin.grid || gridColor;
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
  fillCanvasBg(ctx, canvas);
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
  fillCanvasBg(nextCtx, nextCanvas);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  drawPieceCells(nextCtx, next, offX, offY, NB);
}

function drawHold() {
  const HB = 30;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  fillCanvasBg(holdCtx, holdCanvas);
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
    chip.style.background = skin.colors[p.type];
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
  showGameEndRecords();
}

// ---- Menú de pausa ----

function pauseItems() {
  const view = pauseView === 'controls' ? pauseControlsView : pauseMainView;
  return Array.from(view.querySelectorAll('.pause-item'));
}

function highlightPauseItem() {
  pauseItems().forEach((item, i) => item.classList.toggle('selected', i === pauseIndex));
}

function setPauseView(view) {
  pauseView = view;
  pauseIndex = 0;
  pauseMainView.classList.toggle('hidden', view !== 'main');
  pauseControlsView.classList.toggle('hidden', view !== 'controls');
  highlightPauseItem();
}

function startLevelAppliesTo(challenge) {
  // En desafíos con objetivo de nivel, empezar más alto lo haría trivial.
  return !(challenge && challenge.goalLevel);
}

function updateStartLevelUI() {
  startLevelValueEl.textContent = startLevel;
  startLevelDownBtn.disabled = startLevel <= MIN_START_LEVEL;
  startLevelUpBtn.disabled = startLevel >= MAX_START_LEVEL;
  startLevelHintEl.textContent = startLevelAppliesTo(activeChallenge)
    ? 'Se aplica en la próxima partida'
    : 'Este desafío siempre empieza en nivel 1';
}

function changeStartLevel(delta, wrap) {
  let n = startLevel + delta;
  if (wrap) {
    if (n > MAX_START_LEVEL) n = MIN_START_LEVEL;
    if (n < MIN_START_LEVEL) n = MAX_START_LEVEL;
  }
  startLevel = clampStartLevel(n);
  saveStartLevel();
  updateStartLevelUI();
}

function openPauseMenu() {
  if (gameOver || paused || abilityMenuOpen) return;
  paused = true;
  pausedAt = performance.now();
  cancelAnimationFrame(animId);
  updateStartLevelUI();
  setPauseView('main');
  pauseMenu.classList.remove('hidden');
}

function hidePauseMenu() {
  pauseMenu.classList.add('hidden');
  if (document.activeElement && pauseMenu.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  // Las teclas que siguen pulsadas al cerrar el menú no deben llegar al juego
  // hasta que se suelten (evita movimientos por auto-repetición).
  suppressedKeys = new Set(keysDown);
}

function resumeGame() {
  if (!paused) return;
  const now = performance.now();
  const pausedFor = now - pausedAt;
  // Los temporizadores basados en reloj no deben consumirse durante la pausa.
  if (freezeUntil && freezeUntil > pausedAt) freezeUntil += pausedFor;
  if (slowUntil && slowUntil > pausedAt) slowUntil += pausedFor;
  if (previewUntil && previewUntil > pausedAt) previewUntil += pausedFor;
  effects.forEach(e => { e.start += pausedFor; });
  paused = false;
  hidePauseMenu();
  dropAccum = 0;
  lastTime = now;
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function restartFromPause() {
  hidePauseMenu();
  init(activeChallenge);
}

function runPauseAction(action) {
  switch (action) {
    case 'resume': resumeGame(); break;
    case 'restart': restartFromPause(); break;
    case 'controls': setPauseView('controls'); break;
    case 'back': setPauseView('main'); break;
    case 'level': changeStartLevel(1, true); break;
  }
}

function handlePauseMenuKey(e) {
  const code = e.code;
  if (code === 'KeyP') {
    e.preventDefault();
    if (!e.repeat) resumeGame();
    return;
  }
  if (code === 'Escape') {
    e.preventDefault();
    if (e.repeat) return;
    if (pauseView === 'controls') setPauseView('main');
    else resumeGame();
    return;
  }
  const items = pauseItems();
  const action = items[pauseIndex] && items[pauseIndex].dataset.action;
  switch (code) {
    case 'ArrowUp':
      pauseIndex = (pauseIndex - 1 + items.length) % items.length;
      break;
    case 'ArrowDown':
      pauseIndex = (pauseIndex + 1) % items.length;
      break;
    case 'ArrowLeft':
      if (action === 'level') changeStartLevel(-1);
      break;
    case 'ArrowRight':
      if (action === 'level') changeStartLevel(1);
      break;
    case 'Enter':
    case 'NumpadEnter':
    case 'Space':
      e.preventDefault();
      if (!e.repeat) runPauseAction(action);
      return;
    default:
      // Cualquier otra tecla se ignora: no llega al juego.
      return;
  }
  e.preventDefault();
  highlightPauseItem();
}

function loop(ts) {
  const dt = Math.max(0, ts - lastTime);
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
  finalizePendingRecord();
  highlightRecord = null;
  hideOverlayRecords();
  activeChallenge = challenge || null;
  challengeDone = false;
  challengeTimeLeft = activeChallenge && activeChallenge.timeLimit ? activeChallenge.timeLimit : 0;
  challengeElapsed = 0;
  challengeGarbageAccum = 0;
  board = createBoard();
  if (activeChallenge && activeChallenge.preset) applyPresetBoard();
  score = 0;
  lines = 0;
  baseLevel = startLevelAppliesTo(activeChallenge) ? startLevel : 1;
  level = baseLevel;
  paused = false;
  gameOver = false;
  dropInterval = intervalForLevel(level);
  dropAccum = 0;
  pendingPowerUp = false;
  freezeUntil = null;
  hold = null;
  holdLocked = false;
  combo = 0;
  maxCombo = 0;
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
  pauseMenu.classList.add('hidden');
  extendedPreviewSection.hidden = true;
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Tabla de récords ----

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function sanitizeName(name) {
  const clean = String(name || '').trim().slice(0, NAME_MAX_LENGTH);
  return clean || 'Anónimo';
}

function loadRecords() {
  records = emptyRecords();
  const raw = storageGet(RECORDS_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data.top)) {
      records.top = data.top
        .filter(r => r && Number.isFinite(r.score))
        .map(r => ({
          name: sanitizeName(r.name),
          score: r.score,
          lines: Number(r.lines) || 0,
          level: Number(r.level) || 1,
          mode: String(r.mode || ''),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RECORDS);
    }
    records.bestCombo = Number(data.bestCombo) || 0;
    records.maxLines = Number(data.maxLines) || 0;
  } catch (e) {
    records = emptyRecords();
  }
}

function saveRecords() {
  storageSet(RECORDS_KEY, JSON.stringify(records));
}

// Posición (0-based) que ocuparía una puntuación en el top, o -1 si no entra.
function recordRank(value) {
  if (value <= 0) return -1;
  const idx = records.top.findIndex(r => value > r.score);
  if (idx !== -1) return idx;
  return records.top.length < MAX_RECORDS ? records.top.length : -1;
}

function renderRecords() {
  const rows = records.top.slice();
  if (pendingRecord) {
    const rank = recordRank(pendingRecord.score);
    if (rank !== -1) rows.splice(rank, 0, pendingRecord);
  }
  const visible = rows.slice(0, MAX_RECORDS);
  const comboText = records.bestCombo >= 2 ? `x${records.bestCombo}` : '—';
  document.querySelectorAll('.records').forEach(container => {
    const list = container.querySelector('.records-list');
    list.innerHTML = '';
    if (!visible.length) {
      const empty = document.createElement('li');
      empty.className = 'records-empty';
      empty.textContent = 'Sin récords todavía';
      list.appendChild(empty);
    }
    visible.forEach((r, i) => {
      const li = document.createElement('li');
      li.className = 'records-row';
      if (r === pendingRecord || r === highlightRecord) li.classList.add('highlight');
      const pos = document.createElement('span');
      pos.className = 'records-pos';
      pos.textContent = `${i + 1}.`;
      const name = document.createElement('span');
      name.className = 'records-name';
      name.textContent = r === pendingRecord ? 'TÚ' : r.name;
      const pts = document.createElement('span');
      pts.className = 'records-score';
      pts.textContent = r.score.toLocaleString();
      const detail = document.createElement('span');
      detail.className = 'records-detail';
      detail.textContent = `${r.lines} líneas · Nv ${r.level}${r.mode ? ' · ' + r.mode : ''}`;
      li.append(pos, name, pts, detail);
      list.appendChild(li);
    });
    container.querySelector('.records-stats').textContent =
      `Mejor combo: ${comboText} · Líneas máx: ${records.maxLines}`;
  });
}

function showGameEndRecords() {
  const msgs = [];
  if (maxCombo > records.bestCombo) {
    if (maxCombo >= 2 && records.bestCombo >= 2) msgs.push(`¡Nuevo mejor combo: x${maxCombo}!`);
    records.bestCombo = maxCombo;
  }
  if (lines > records.maxLines) {
    if (records.maxLines > 0) msgs.push(`¡Nuevo récord de líneas: ${lines}!`);
    records.maxLines = lines;
  }
  saveRecords();

  highlightRecord = null;
  const rank = recordRank(score);
  if (rank !== -1) {
    pendingRecord = {
      score, lines, level,
      mode: activeChallenge ? activeChallenge.name : 'Clásico',
    };
    msgs.unshift(`¡NUEVO RÉCORD! Puesto #${rank + 1}`);
    recordMsgEl.classList.add('new');
    recordForm.classList.remove('hidden');
    recordNameInput.value = storageGet(LAST_NAME_KEY) || '';
  } else {
    pendingRecord = null;
    msgs.unshift('No entraste en el top 5');
    recordMsgEl.classList.toggle('new', msgs.length > 1);
    recordForm.classList.add('hidden');
  }
  recordMsgEl.textContent = msgs.join('\n');
  recordEntryEl.classList.remove('hidden');
  overlayRecordsEl.classList.remove('hidden');
  renderRecords();
  if (pendingRecord) {
    recordNameInput.focus();
    recordNameInput.select();
  }
}

function commitPendingRecord(rawName) {
  if (!pendingRecord) return;
  const rank = recordRank(pendingRecord.score);
  const entry = {
    name: sanitizeName(rawName),
    score: pendingRecord.score,
    lines: pendingRecord.lines,
    level: pendingRecord.level,
    mode: pendingRecord.mode,
  };
  pendingRecord = null;
  if (rank === -1) return;
  records.top.splice(rank, 0, entry);
  records.top = records.top.slice(0, MAX_RECORDS);
  saveRecords();
  storageSet(LAST_NAME_KEY, entry.name);
  highlightRecord = entry;
  recordForm.classList.add('hidden');
  recordMsgEl.textContent = `Récord guardado en el puesto #${rank + 1}`;
  recordNameInput.blur();
  renderRecords();
}

// Si el jugador sale sin pulsar Guardar, se guarda con lo escrito (o "Anónimo").
function finalizePendingRecord() {
  if (pendingRecord) commitPendingRecord(recordNameInput.value);
}

function hideOverlayRecords() {
  recordEntryEl.classList.add('hidden');
  overlayRecordsEl.classList.add('hidden');
}

function resetRecords() {
  if (!confirm('¿Seguro que quieres borrar todos los récords? Esta acción no se puede deshacer.')) return;
  records = emptyRecords();
  storageRemove(RECORDS_KEY);
  highlightRecord = null;
  if (pendingRecord) {
    recordMsgEl.textContent = `¡NUEVO RÉCORD! Puesto #${recordRank(pendingRecord.score) + 1}`;
  }
  renderRecords();
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

const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];

document.addEventListener('keydown', e => {
  keysDown.add(e.code);
  // No disparar controles del juego mientras se escribe en un campo de texto.
  if (e.target instanceof Element && e.target.matches('input[type="text"], textarea')) return;
  // Evita que flechas/espacio cambien el selector de skin si tiene el foco.
  if (e.target === skinSelect && GAME_KEYS.includes(e.code)) {
    e.preventDefault();
    skinSelect.blur();
  }
  if (!current) return;
  if (abilityMenuOpen) {
    const map = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5 };
    if (map[e.code]) selectAbility(map[e.code]);
    return;
  }
  if (paused) { handlePauseMenuKey(e); return; }
  if (gameOver) return;
  if (suppressedKeys.has(e.code)) {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!e.repeat) openPauseMenu();
    return;
  }
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

document.addEventListener('keyup', e => {
  keysDown.delete(e.code);
  suppressedKeys.delete(e.code);
});

window.addEventListener('blur', () => {
  keysDown.clear();
  suppressedKeys.clear();
});

restartBtn.addEventListener('click', () => init(activeChallenge));

pauseMenu.querySelectorAll('button.pause-item').forEach(btn => {
  btn.addEventListener('click', () => {
    if (paused) runPauseAction(btn.dataset.action);
  });
});

pauseMenu.querySelectorAll('.pause-item').forEach(item => {
  item.addEventListener('mouseenter', () => {
    const idx = pauseItems().indexOf(item);
    if (idx !== -1) {
      pauseIndex = idx;
      highlightPauseItem();
    }
  });
});

startLevelDownBtn.addEventListener('click', () => changeStartLevel(-1));
startLevelUpBtn.addEventListener('click', () => changeStartLevel(1));

changeModeBtn.addEventListener('click', () => {
  finalizePendingRecord();
  renderRecords();
  cancelAnimationFrame(animId);
  overlay.classList.add('hidden');
  challengeSelect.classList.remove('hidden');
});

document.querySelectorAll('.ability-list li').forEach(li => {
  li.addEventListener('click', () => {
    if (abilityMenuOpen) selectAbility(Number(li.dataset.ability));
  });
});

recordForm.addEventListener('submit', e => {
  e.preventDefault();
  commitPendingRecord(recordNameInput.value);
});

document.querySelectorAll('.records-reset-btn').forEach(btn => {
  btn.addEventListener('click', resetRecords);
});

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  saveSkin(skinId);
  skinSelect.blur();
});

startLevel = loadStartLevel();
initTheme();
initSkin();
updateStartLevelUI();
loadRecords();
renderRecords();
renderChallengeList();
