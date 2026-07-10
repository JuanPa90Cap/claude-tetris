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
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
  '#90a4ae', // Tuerca - gris metálico
];

const SKINS = {
  retro: {
    label: 'Retro',
    background: '#1a1a25',
    colors: COLORS,
    glow: 0,
    glowColor: null,
    radius: 0,
    pattern: null,
  },
  neon: {
    label: 'Neon',
    background: '#050507',
    colors: [null, '#00e5ff', '#faff54', '#e83bff', '#39ff8a', '#ff3355', '#5c6bff', '#ffab2e', '#9fb4c7'],
    glow: 14,
    glowColor: null, // null = use the block's own color
    radius: 2,
    pattern: null,
  },
  pastel: {
    label: 'Pastel',
    background: '#2b2b35',
    colors: [null, '#a8dfe0', '#ffe9b3', '#d9b8e8', '#b8e0b0', '#f2b0b0', '#b4bce0', '#f5cda3', '#c7d0d6'],
    glow: 0,
    glowColor: null,
    radius: 8,
    pattern: null,
  },
  pixel: {
    label: 'Pixel Art',
    background: '#1a1a25',
    colors: COLORS,
    glow: 0,
    glowColor: null,
    radius: 0,
    pattern: 'checker',
  },
};

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca (hueco central)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const HS_KEY = 'tetris.highscores';
const HS_RECORDS_KEY = 'tetris.records';
const HS_MAX_ENTRIES = 5;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const skinSelect = document.getElementById('skin-select');
const menuOverlay = document.getElementById('menu-overlay');
const menuResumeBtn = document.getElementById('menu-resume-btn');
const menuRestartBtn = document.getElementById('menu-restart-btn');
const menuControlsBtn = document.getElementById('menu-controls-btn');
const menuControlsList = document.getElementById('menu-controls-list');
const menuStartLevelInput = document.getElementById('menu-start-level');

const hsStartScreen = document.getElementById('hs-start-screen');
const hsStartTable = document.getElementById('hs-start-table');
const hsStartBtn = document.getElementById('hs-start-btn');
const hsResetBtn = document.getElementById('hs-reset-btn');
const hsBestComboEl = document.getElementById('hs-best-combo');
const hsMaxLinesEl = document.getElementById('hs-max-lines');
const hsTable = document.getElementById('hs-table');
const hsSaveRow = document.getElementById('hs-save-row');
const hsNameInput = document.getElementById('hs-name-input');
const hsSaveBtn = document.getElementById('hs-save-btn');

let board, current, next, score, lines, level, paused, lastTime, dropAccum, dropInterval, animId, combo;
let gameOver = true; // true until init() runs, so keydown input is ignored while the start screen is showing
let hsRecords = loadRecords();
let hsPendingScore = null;

function loadSkin() {
  try {
    const saved = localStorage.getItem('tetris.skin');
    if (saved && SKINS[saved]) return saved;
  } catch (e) {
    // localStorage unavailable/corrupt - ignore, fall back to default
  }
  return 'retro';
}

function saveSkin(name) {
  try {
    localStorage.setItem('tetris.skin', name);
  } catch (e) {
    // localStorage unavailable - ignore, skin choice just won't persist
  }
}

function loadStartLevel() {
  try {
    const parsed = parseInt(localStorage.getItem('tetris.startLevel'), 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 15) return parsed;
  } catch (e) {
    // localStorage unavailable (file://, private mode, etc.) — ignore
  }
  return 1;
}

function saveStartLevel(value) {
  try {
    localStorage.setItem('tetris.startLevel', String(value));
  } catch (e) {
    // ignore storage failures
  }
}

let currentSkinName = loadSkin();
let startLevel = loadStartLevel();
menuStartLevelInput.value = startLevel;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
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
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
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
  merge();
  const cleared = clearLines();
  let recordsChanged = false;
  if (cleared > 0) {
    combo++;
    if (combo > hsRecords.bestCombo) { hsRecords.bestCombo = combo; recordsChanged = true; }
  } else {
    combo = 0;
  }
  if (cleared > hsRecords.maxLines) { hsRecords.maxLines = cleared; recordsChanged = true; }
  if (recordsChanged) { saveRecords(hsRecords); renderRecords(); }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function roundedRectPath(context, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + rr, y);
  context.arcTo(x + w, y, x + w, y + h, rr);
  context.arcTo(x + w, y + h, x, y + h, rr);
  context.arcTo(x, y + h, x, y, rr);
  context.arcTo(x, y, x + w, y, rr);
  context.closePath();
}

function drawCheckerPattern(context, x, y, s) {
  const half = s / 2;
  context.fillStyle = 'rgba(0,0,0,0.18)';
  context.fillRect(x, y, half, half);
  context.fillRect(x + half, y + half, s - half, s - half);
  context.fillStyle = 'rgba(255,255,255,0.08)';
  context.fillRect(x + half, y, s - half, half);
  context.fillRect(x, y + half, half, s - half);
}

function loadHighScores() {
  try {
    const raw = localStorage.getItem(HS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(e => e && typeof e.name === 'string' && typeof e.score === 'number');
  } catch {
    return [];
  }
}

function saveHighScores(list) {
  try {
    localStorage.setItem(HS_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable (private mode, file://, quota) — ignore
  }
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(HS_RECORDS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      bestCombo: typeof parsed.bestCombo === 'number' ? parsed.bestCombo : 0,
      maxLines: typeof parsed.maxLines === 'number' ? parsed.maxLines : 0,
    };
  } catch {
    return { bestCombo: 0, maxLines: 0 };
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(HS_RECORDS_KEY, JSON.stringify(records));
  } catch {
    // storage unavailable — ignore
  }
}

function qualifiesForHighScore(s) {
  const list = loadHighScores();
  if (list.length < HS_MAX_ENTRIES) return true;
  return s > list[list.length - 1].score;
}

function addHighScore(name, s) {
  const list = loadHighScores();
  list.push({ name, score: s });
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, HS_MAX_ENTRIES);
  saveHighScores(trimmed);
  return trimmed;
}

function renderHighScoreTable(tableEl, highlightIndex) {
  if (!tableEl) return;
  const list = loadHighScores();
  tableEl.innerHTML = '';
  if (list.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 2;
    cell.textContent = 'Sin puntuaciones';
    row.appendChild(cell);
    tableEl.appendChild(row);
    return;
  }
  list.forEach((entry, i) => {
    const row = document.createElement('tr');
    if (i === highlightIndex) row.classList.add('hs-highlight');
    const nameCell = document.createElement('td');
    nameCell.textContent = entry.name;
    const scoreCell = document.createElement('td');
    scoreCell.textContent = entry.score.toLocaleString();
    row.appendChild(nameCell);
    row.appendChild(scoreCell);
    tableEl.appendChild(row);
  });
}

function renderRecords() {
  if (hsBestComboEl) hsBestComboEl.textContent = hsRecords.bestCombo;
  if (hsMaxLinesEl) hsMaxLinesEl.textContent = hsRecords.maxLines;
}

function renderHSDisplays(highlightIndex) {
  renderHighScoreTable(hsStartTable, -1);
  renderHighScoreTable(hsTable, highlightIndex ?? -1);
  renderRecords();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[currentSkinName] || SKINS.retro;
  const color = skin.colors[colorIndex] || COLORS[colorIndex];
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;

  context.globalAlpha = alpha ?? 1;

  if (skin.glow) {
    context.shadowBlur = skin.glow;
    context.shadowColor = skin.glowColor || color;
  }

  context.fillStyle = color;
  if (skin.radius) {
    roundedRectPath(context, px, py, s, s, skin.radius);
    context.fill();
  } else {
    context.fillRect(px, py, s, s);
  }

  // reset shadow before highlight/pattern so it doesn't double up or bleed
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';

  if (skin.pattern === 'checker') {
    drawCheckerPattern(context, px, py, s);
  }

  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  if (skin.radius) {
    roundedRectPath(context, px, py, s, 4, Math.min(skin.radius, 4));
    context.fill();
  } else {
    context.fillRect(px, py, s, 4);
  }

  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = '#22222e';
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
  const skin = SKINS[currentSkinName] || SKINS.retro;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = skin.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  const skin = SKINS[currentSkinName] || SKINS.retro;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  nextCtx.fillStyle = skin.background;
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');

  if (qualifiesForHighScore(score)) {
    hsPendingScore = score;
    hsNameInput.value = '';
    hsSaveRow.classList.remove('hidden');
    renderHighScoreTable(hsTable, -1);
    hsNameInput.focus();
  } else {
    hsPendingScore = null;
    hsSaveRow.classList.add('hidden');
    renderHighScoreTable(hsTable, -1);
  }
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    menuOverlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    menuOverlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (!gameOver) animId = requestAnimationFrame(loop);   // no re-armar tras Game Over
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  combo = 0;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  menuOverlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (paused || gameOver) return;
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

restartBtn.addEventListener('click', init);

if (skinSelect) {
  skinSelect.value = currentSkinName;
  skinSelect.addEventListener('change', () => {
    const val = skinSelect.value;
    if (!SKINS[val]) return;
    currentSkinName = val;
    saveSkin(currentSkinName);
    draw();
    drawNext();
  });
}

menuResumeBtn.addEventListener('click', () => {
  if (paused) togglePause();
});
menuRestartBtn.addEventListener('click', init);
menuControlsBtn.addEventListener('click', () => {
  menuControlsList.classList.toggle('hidden');
});
menuStartLevelInput.addEventListener('change', () => {
  let value = parseInt(menuStartLevelInput.value, 10);
  if (Number.isNaN(value)) value = 1;
  value = Math.min(15, Math.max(1, value));
  menuStartLevelInput.value = value;
  startLevel = value;
  saveStartLevel(value);
});

hsStartBtn.addEventListener('click', () => {
  hsStartScreen.classList.add('hidden');
  init();
});

hsSaveBtn.addEventListener('click', () => {
  if (hsPendingScore == null) return;
  const name = (hsNameInput.value || '').trim().slice(0, 10) || 'AAA';
  const list = addHighScore(name, hsPendingScore);
  const idx = list.findIndex(e => e.name === name && e.score === hsPendingScore);
  renderHighScoreTable(hsTable, idx);
  renderHighScoreTable(hsStartTable, -1);
  hsSaveRow.classList.add('hidden');
  hsPendingScore = null;
});

hsResetBtn.addEventListener('click', () => {
  try { localStorage.removeItem(HS_KEY); } catch {}
  try { localStorage.removeItem(HS_RECORDS_KEY); } catch {}
  hsRecords = loadRecords();
  renderHSDisplays();
});

renderHSDisplays();
