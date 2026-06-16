import './style.css';

// --- GAME STATE & CONFIG ---
interface GameState {
  coins: number;
  levelIndex: number;
  brushLevel: number;
  multiplierLevel: number;
}

const defaultState: GameState = {
  coins: 0,
  levelIndex: 0,
  brushLevel: 1,
  multiplierLevel: 1,
};

let state: GameState = { ...defaultState };

const LEVELS = [
  { name: 'Wood', texture: `${import.meta.env.BASE_URL}textures/wood.png`, maskColor: '#8B4513' },
  { name: 'Stone', texture: `${import.meta.env.BASE_URL}textures/stone.png`, maskColor: '#555555' },
  { name: 'Water', texture: `${import.meta.env.BASE_URL}textures/water.png`, maskColor: '#20B2AA' },
];

const BRUSH_BASE_SIZE = 30;
const BRUSH_UPGRADE_AMOUNT = 5;
const MULTIPLIER_BASE = 1;
const MULTIPLIER_UPGRADE_AMOUNT = 0.5;

// Cost formulas
const getBrushCost = () => Math.floor(100 * Math.pow(1.5, state.brushLevel - 1));
const getMultCost = () => Math.floor(250 * Math.pow(1.8, state.multiplierLevel - 1));

// Combo System
let combo = 1.0;
let isScratching = false;

// DOM Elements
const container = document.getElementById('game-container')!;
const textureLayer = document.getElementById('texture-layer') as HTMLDivElement;
const canvas = document.getElementById('scratch-layer') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

const coinDisplay = document.getElementById('coin-display')!;
const levelDisplay = document.getElementById('level-display')!;
const comboDisplay = document.getElementById('combo-display')!;
const comboMultiplierText = document.getElementById('combo-multiplier')!;
const comboBar = document.getElementById('combo-bar')!;
const progressText = document.getElementById('progress-text')!;
const progressBarFill = document.getElementById('progress-bar-fill')!;

const shopBtn = document.getElementById('shop-btn')!;
const shopModal = document.getElementById('shop-modal')!;
const closeShopBtn = document.getElementById('close-shop-btn')!;
const upgradeBrushBtn = document.getElementById('upgrade-brush-btn') as HTMLButtonElement;
const upgradeMultBtn = document.getElementById('upgrade-mult-btn') as HTMLButtonElement;
const brushCostEl = document.getElementById('brush-cost')!;
const multCostEl = document.getElementById('mult-cost')!;
const brushLvlEl = document.getElementById('brush-lvl')!;
const multLvlEl = document.getElementById('mult-lvl')!;

const levelModal = document.getElementById('level-modal')!;
const nextLevelBtn = document.getElementById('next-level-btn')!;
const levelBonusEl = document.getElementById('level-bonus')!;

// --- AUDIO SYSTEM ---
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

function playScratchSound() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  // Choose sound type based on level
  const currentLevel = LEVELS[state.levelIndex % LEVELS.length];
  if (currentLevel.name === 'Water') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400 + Math.random() * 200, audioCtx.currentTime);
  } else if (currentLevel.name === 'Stone') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(100 + Math.random() * 50, audioCtx.currentTime);
  } else {
    // Wood
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200 + Math.random() * 100, audioCtx.currentTime);
  }
  
  gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
  
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.1);
}

// --- INIT & SAVE/LOAD ---
function loadState() {
  const saved = localStorage.getItem('touchAndScratchState');
  if (saved) {
    try {
      state = { ...defaultState, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Failed to parse save', e);
    }
  }
}

function saveState() {
  localStorage.setItem('touchAndScratchState', JSON.stringify(state));
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  // Re-fill mask if resized, simplest is to reset level (or we could redraw erased paths, but for simplicity reset)
  initLevel();
}

// --- GAME LOGIC ---
let totalPixels = 1;
let clearedPixels = 0;
let lastX: number | null = null;
let lastY: number | null = null;
let throttleCalc = 0;

function initLevel() {
  const currentLevel = LEVELS[state.levelIndex % LEVELS.length];
  textureLayer.style.backgroundImage = `url(${currentLevel.texture})`;
  levelDisplay.textContent = `Level ${state.levelIndex + 1} (${currentLevel.name})`;
  
  // Fill mask
  ctx.globalCompositeOperation = 'source-over';
  
  // Add some noise or gradient to the mask based on level
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, currentLevel.maskColor);
  gradient.addColorStop(1, '#000000');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw some "dirt" pattern
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for(let i=0; i<1000; i++) {
    ctx.beginPath();
    ctx.arc(Math.random()*canvas.width, Math.random()*canvas.height, Math.random()*5, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'destination-out';
  
  totalPixels = canvas.width * canvas.height;
  clearedPixels = 0;
  updateProgress(0);
}

function scratch(x: number, y: number) {
  if (!isScratching) {
    lastX = x;
    lastY = y;
    isScratching = true;
    startCombo();
  }

  const brushSize = BRUSH_BASE_SIZE + (state.brushLevel - 1) * BRUSH_UPGRADE_AMOUNT;

  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = brushSize * 2;
  ctx.moveTo(lastX!, lastY!);
  ctx.lineTo(x, y);
  ctx.stroke();

  // Create particle
  createParticle(x, y);

  // Earnings
  const earnAmount = (MULTIPLIER_BASE + (state.multiplierLevel - 1) * MULTIPLIER_UPGRADE_AMOUNT) * combo;
  state.coins += earnAmount;
  
  // Add haptics (throttle a bit)
  if (throttleCalc % 5 === 0 && navigator.vibrate) {
    navigator.vibrate(10);
  }

  // Add sound (throttle heavily)
  if (throttleCalc % 15 === 0) {
    playScratchSound();
  }

  lastX = x;
  lastY = y;

  maintainCombo();
  updateUI();

  // Calc progress occasionally
  throttleCalc++;
  if (throttleCalc % 10 === 0) {
    calcProgress();
  }
}

function calcProgress() {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  let cleared = 0;
  // Check alpha channel (every 4th byte). We sample every 16th pixel for performance
  for (let i = 3; i < data.length; i += 4 * 16) {
    if (data[i] < 10) cleared += 16;
  }
  
  clearedPixels = cleared;
  const pct = Math.min(100, Math.floor((clearedPixels / totalPixels) * 100));
  updateProgress(pct);

  if (pct >= 95) {
    levelComplete();
  }
}

function updateProgress(pct: number) {
  progressText.textContent = `${pct}% Revealed`;
  progressBarFill.style.width = `${pct}%`;
}

function levelComplete() {
  isScratching = false;
  // Disable canvas
  canvas.style.pointerEvents = 'none';
  
  // Calculate bonus
  const bonus = 1000 * (state.levelIndex + 1);
  state.coins += bonus;
  levelBonusEl.textContent = bonus.toString();
  
  levelModal.classList.remove('hidden');
  saveState();
  updateUI();
}

function nextLevel() {
  state.levelIndex++;
  levelModal.classList.add('hidden');
  canvas.style.pointerEvents = 'auto';
  saveState();
  initLevel();
}

// --- COMBO SYSTEM ---
let comboAnimFrame: number;
let comboStartTime: number;
const COMBO_DURATION = 1000; // 1 second to continue scratching

function startCombo() {
  comboDisplay.classList.remove('hidden');
}

function maintainCombo() {
  combo += 0.01; // Increase combo slightly while scratching
  if (combo > 10) combo = 10;
  comboStartTime = performance.now();
  
  cancelAnimationFrame(comboAnimFrame);
  comboAnimFrame = requestAnimationFrame(updateComboBar);
}

function endCombo() {
  isScratching = false;
  lastX = null;
  lastY = null;
}

function updateComboBar(now: number) {
  if (!isScratching) {
    const elapsed = now - comboStartTime;
    const remaining = 1 - (elapsed / COMBO_DURATION);
    
    if (remaining <= 0) {
      combo = 1.0;
      comboDisplay.classList.add('hidden');
      return;
    } else {
      comboBar.style.transform = `scaleX(${remaining})`;
    }
  } else {
    comboBar.style.transform = `scaleX(1)`;
  }
  
  comboMultiplierText.textContent = `x${combo.toFixed(1)}`;
  comboAnimFrame = requestAnimationFrame(updateComboBar);
}

// --- PARTICLES ---
interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; color: string;
}
const particles: Particle[] = [];
// Need a separate canvas for particles to draw *over* the scratch layer without being erased
const particleCanvas = document.createElement('canvas');
particleCanvas.id = 'particle-layer';
container.insertBefore(particleCanvas, document.getElementById('ui-layer'));
const pCtx = particleCanvas.getContext('2d')!;

function resizeParticleCanvas() {
  particleCanvas.width = window.innerWidth;
  particleCanvas.height = window.innerHeight;
}

function createParticle(x: number, y: number) {
  if (Math.random() > 0.3) return; // limit count
  
  const currentLevel = LEVELS[state.levelIndex % LEVELS.length];
  let color = '#ffffff';
  if (currentLevel.name === 'Wood') color = '#D2B48C';
  if (currentLevel.name === 'Stone') color = '#A9A9A9';
  if (currentLevel.name === 'Water') color = '#E0FFFF';

  particles.push({
    x, y,
    vx: (Math.random() - 0.5) * 5,
    vy: (Math.random() - 0.5) * 5,
    life: 1.0,
    color
  });
}

function renderParticles() {
  pCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
  
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1; // gravity
    p.life -= 0.02;
    
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    
    pCtx.globalAlpha = p.life;
    pCtx.fillStyle = p.color;
    pCtx.beginPath();
    pCtx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    pCtx.fill();
  }
  pCtx.globalAlpha = 1.0;
  
  requestAnimationFrame(renderParticles);
}

// --- UI & SHOP ---
function updateUI() {
  coinDisplay.textContent = Math.floor(state.coins).toString();
  
  brushLvlEl.textContent = state.brushLevel.toString();
  brushCostEl.textContent = getBrushCost().toString();
  upgradeBrushBtn.disabled = state.coins < getBrushCost();

  multLvlEl.textContent = state.multiplierLevel.toString();
  multCostEl.textContent = getMultCost().toString();
  upgradeMultBtn.disabled = state.coins < getMultCost();
}

shopBtn.addEventListener('click', () => {
  shopModal.classList.remove('hidden');
  updateUI();
});

closeShopBtn.addEventListener('click', () => {
  shopModal.classList.add('hidden');
});

upgradeBrushBtn.addEventListener('click', () => {
  const cost = getBrushCost();
  if (state.coins >= cost) {
    state.coins -= cost;
    state.brushLevel++;
    saveState();
    updateUI();
  }
});

upgradeMultBtn.addEventListener('click', () => {
  const cost = getMultCost();
  if (state.coins >= cost) {
    state.coins -= cost;
    state.multiplierLevel++;
    saveState();
    updateUI();
  }
});

nextLevelBtn.addEventListener('click', nextLevel);

// --- INPUT EVENTS ---
let isPointerDown = false;

const handlePointerMove = (e: PointerEvent) => {
  if (isPointerDown) {
    e.preventDefault();
    scratch(e.clientX, e.clientY);
  }
};

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  isPointerDown = true;
  scratch(e.clientX, e.clientY);
});
canvas.addEventListener('pointermove', handlePointerMove);
window.addEventListener('pointerup', (e) => {
  isPointerDown = false;
  endCombo();
});
window.addEventListener('pointercancel', (e) => {
  isPointerDown = false;
  endCombo();
});

// For older Safari or specific mobile browsers where pointer events are finicky
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  isPointerDown = true;
  const touch = e.touches[0];
  scratch(touch.clientX, touch.clientY);
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (isPointerDown) {
    const touch = e.touches[0];
    scratch(touch.clientX, touch.clientY);
  }
}, { passive: false });

window.addEventListener('touchend', () => {
  isPointerDown = false;
  endCombo();
});
window.addEventListener('touchcancel', () => {
  isPointerDown = false;
  endCombo();
});


// --- BOOTSTRAP ---
window.addEventListener('resize', () => {
  resizeCanvas();
  resizeParticleCanvas();
});

loadState();
resizeCanvas();
resizeParticleCanvas();
updateUI();
renderParticles();

// Preload audio context on first user interaction
window.addEventListener('pointerdown', function unlockAudio() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  window.removeEventListener('pointerdown', unlockAudio);
});
