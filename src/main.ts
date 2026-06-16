import './style.css';

// --- GAME STATE & CONFIG ---
interface GameState {
  gameMode: "texture" | "girl";
  girlLevelIndex: number;
  coins: number;
  levelIndex: number;
  brushLevel: number;
  multiplierLevel: number;
  autobotLevel: number;
  luckLevel: number;
  equippedBrush: string; // 'standard', 'needle', 'scraper'
  unlockedBrushes: string[];
}

const defaultState: GameState = {
  coins: 0,
  levelIndex: 0,
  girlLevelIndex: 0,
  gameMode: "texture",
  brushLevel: 1,
  multiplierLevel: 1,
  autobotLevel: 0,
  luckLevel: 0,
  equippedBrush: 'standard',
  unlockedBrushes: ['standard']
};

let state: GameState = { ...defaultState };

const LEVELS = Array.from({length: 40}).map((_, i) => ({
  name: `Level ${i+1}`,
  texture: `https://picsum.photos/seed/wall${i}/800/600`,
  maskColor: `hsl(${i * 137.5 % 360}, 50%, 20%)`
}));





const GIRL_LEVELS = Array.from({length: 50}).map((_, i) => ({
  name: `Girl ${i+1}`,
  texture: `${import.meta.env.BASE_URL}textures/girls/girl_swimsuit_${i+1}.png`,
  maskColor: '#FFC0CB'
}));



const BRUSH_BASE_SIZE = 15;
const BRUSH_UPGRADE_AMOUNT = 5;
const MULTIPLIER_BASE = 1;
const MULTIPLIER_UPGRADE_AMOUNT = 0.5;

// Cost formulas
const getBrushCost = () => Math.floor(100 * Math.pow(1.5, state.brushLevel - 1));
const getMultCost = () => Math.floor(250 * Math.pow(1.8, state.multiplierLevel - 1));
const getAutobotCost = () => Math.floor(500 * Math.pow(2, state.autobotLevel));
const getLuckCost = () => Math.floor(1000 * Math.pow(2, state.luckLevel));

// Combo System
let combo = 1.0;
let isScratching = false;

// --- DOM ELEMENTS ---
const container = document.getElementById('game-container')!;
const canvas = document.getElementById('scratch-layer') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
const textureLayer = document.getElementById('texture-layer')!;

const coinDisplay = document.getElementById('coin-display')!;
const levelDisplay = document.getElementById('level-display')!;
const comboDisplay = document.getElementById('combo-display')!;
const comboMultiplierText = document.getElementById('combo-multiplier')!;
const comboBar = document.getElementById('combo-bar')!;
const progressText = document.getElementById('progress-text')!;
const progressBarFill = document.getElementById('progress-bar-fill')!;

const shopModal = document.getElementById('shop-modal') as HTMLDivElement;
const shopBtn = document.getElementById('shop-btn') as HTMLButtonElement;
const closeShopBtn = document.getElementById('close-shop-btn') as HTMLButtonElement;

// Shop Upgrades
const brushLvlEl = document.getElementById('brush-lvl') as HTMLSpanElement;
const brushCostEl = document.getElementById('brush-cost') as HTMLSpanElement;
const upgradeBrushBtn = document.getElementById('upgrade-brush-btn') as HTMLButtonElement;

const multLvlEl = document.getElementById('mult-lvl') as HTMLSpanElement;
const multCostEl = document.getElementById('mult-cost') as HTMLSpanElement;
const upgradeMultBtn = document.getElementById('upgrade-mult-btn') as HTMLButtonElement;

const autobotLvlEl = document.getElementById('autobot-lvl') as HTMLSpanElement;
const autobotCostEl = document.getElementById('autobot-cost') as HTMLSpanElement;
const upgradeAutobotBtn = document.getElementById('upgrade-autobot-btn') as HTMLButtonElement;

const luckLvlEl = document.getElementById('luck-lvl') as HTMLSpanElement;
const luckCostEl = document.getElementById('luck-cost') as HTMLSpanElement;
const upgradeLuckBtn = document.getElementById('upgrade-luck-btn') as HTMLButtonElement;

// Shop Brushes
const equipStandardBtn = document.getElementById('equip-standard') as HTMLButtonElement;
const buyNeedleBtn = document.getElementById('buy-needle') as HTMLButtonElement;
const buyScraperBtn = document.getElementById('buy-scraper') as HTMLButtonElement;

const levelModal = document.getElementById('level-modal')!;
const nextLevelBtn = document.getElementById('next-level-btn')!;
const levelBonusEl = document.getElementById('level-bonus')!;

// Dalgona Fail Modal
const failModal = document.getElementById('fail-modal')!;
const retryBtn = document.getElementById('retry-btn')!;


// Home Screen Elements
const homeScreen = document.getElementById('home-screen')!;
const btnModeTexture = document.getElementById('btn-mode-texture')!;
const btnModeGirl = document.getElementById('btn-mode-girl')!;

btnModeTexture.addEventListener('click', () => {
  state.gameMode = 'texture';
  homeScreen.style.display = 'none';
  saveState();
  initLevel();
});

btnModeGirl.addEventListener('click', () => {
  state.gameMode = 'girl';
  homeScreen.style.display = 'none';
  saveState();
  initLevel();
});

// --- AUDIO SYSTEM ---

const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

function playScratchSound() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  osc.type = 'square';
  osc.frequency.setValueAtTime(100 + Math.random() * 50, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.1);
  
  gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
  
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  osc.start();
  osc.stop(audioCtx.currentTime + 0.1);
}

// --- PERSISTENCE ---
function saveState() {
  localStorage.setItem('touch_scratch_save_v2', JSON.stringify(state));
}
function loadState() {
  const saved = localStorage.getItem('touch_scratch_save_v2');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state = { ...defaultState, ...parsed };
      if (!state.unlockedBrushes) state.unlockedBrushes = ['standard'];
      if (!state.equippedBrush) state.equippedBrush = 'standard';
    } catch (e) { console.error("Save corrupted"); }
  }
}

// --- SETUP ---
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.scale(dpr, dpr);
  initLevel();
}

// --- GAME LOGIC ---
let totalPixels = 1;
let clearedPixels = 0;
let lastX: number | null = null;
let lastY: number | null = null;
let throttleCalc = 0;

// Offscreen canvases
const offscreenCanvas = document.createElement('canvas');
offscreenCanvas.width = 100;
offscreenCanvas.height = 100;
const offCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true })!;

// Dalgona Mode offscreen buffers
const targetCanvas = document.createElement('canvas');
const targetCtx = targetCanvas.getContext('2d')!;
const errorCanvas = document.createElement('canvas');
const errorCtx = errorCanvas.getContext('2d')!;

let isDalgonaMode = false;
// let // // removed
const DALGONA_ERROR_LIMIT = 5; // 5% error limit

function drawDalgonaShape(ctxToDraw: CanvasRenderingContext2D, width: number, height: number, lineWidth: number, isErrorMask: boolean) {
  const cx = width / 2;
  const cy = height / 2;
  const size = Math.min(width, height) * 0.3;
  
  ctxToDraw.beginPath();
  // Shape changes based on level
  const shapeType = state.levelIndex % 4;
  
  if (shapeType === 0) { // Circle
    ctxToDraw.arc(cx, cy, size, 0, Math.PI * 2);
  } else if (shapeType === 1) { // Triangle
    ctxToDraw.moveTo(cx, cy - size);
    ctxToDraw.lineTo(cx + size, cy + size);
    ctxToDraw.lineTo(cx - size, cy + size);
    ctxToDraw.closePath();
  } else if (shapeType === 2) { // Star
    for(let i=0; i<5; i++) {
      ctxToDraw.lineTo(cx + Math.cos((18 + i*72)/180*Math.PI)*size, cy - Math.sin((18 + i*72)/180*Math.PI)*size);
      ctxToDraw.lineTo(cx + Math.cos((54 + i*72)/180*Math.PI)*size*0.5, cy - Math.sin((54 + i*72)/180*Math.PI)*size*0.5);
    }
    ctxToDraw.closePath();
  } else { // Umbrella (approximate)
    ctxToDraw.arc(cx, cy, size, Math.PI, 0);
    ctxToDraw.lineTo(cx - size, cy);
    ctxToDraw.lineTo(cx, cy + size * 1.2);
    ctxToDraw.lineTo(cx + size, cy);
    ctxToDraw.closePath();
  }

  if (isErrorMask) {
    // Fill the ENTIRE canvas with red
    ctxToDraw.fillStyle = 'red';
    ctxToDraw.fillRect(0, 0, width, height);
    // Erase the safe zone
    ctxToDraw.globalCompositeOperation = 'destination-out';
    ctxToDraw.lineWidth = lineWidth;
    ctxToDraw.lineCap = 'round';
    ctxToDraw.lineJoin = 'round';
    ctxToDraw.stroke();
    ctxToDraw.globalCompositeOperation = 'source-over';
  } else {
    // Just draw the line
    ctxToDraw.strokeStyle = 'white';
    ctxToDraw.lineWidth = lineWidth;
    ctxToDraw.lineCap = 'round';
    ctxToDraw.lineJoin = 'round';
    ctxToDraw.stroke();
  }
}

function initLevel() {
  const isGirlMode = state.gameMode === 'girl';
  const levelArray = isGirlMode ? GIRL_LEVELS : LEVELS;
  const currentIndex = isGirlMode ? state.girlLevelIndex : state.levelIndex;
  const currentLevel = levelArray[currentIndex % levelArray.length];
  
  isDalgonaMode = !isGirlMode && state.levelIndex >= 19;
  levelDisplay.textContent = `Level ${currentIndex + 1}`;
  
  const nextIndex = currentIndex + 1;
  const nextLevel = levelArray[nextIndex % levelArray.length];
  
  textureLayer.style.background = 'none';
  textureLayer.style.backgroundImage = `url(${nextLevel.texture})`;
  textureLayer.style.backgroundSize = 'cover';
  textureLayer.style.backgroundPosition = 'center top';
  
  ctx.globalCompositeOperation = 'source-over';
  
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = currentLevel.texture;
  img.onload = () => {
    const scale = Math.max(window.innerWidth / img.width, window.innerHeight / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (window.innerWidth - w) / 2;
    const y = 0;
    
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(img, x, y, w, h);
    
    if (isDalgonaMode) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.setLineDash([10, 10]);
      drawDalgonaShape(ctx, window.innerWidth, window.innerHeight, 4, false);
      ctx.setLineDash([]);
      
      targetCanvas.width = 100;
      targetCanvas.height = 100;
      errorCanvas.width = 100;
      errorCanvas.height = 100;
      
      const difficultyThickness = Math.max(5, 20 - (state.levelIndex - 19) * 2);
      
      drawDalgonaShape(targetCtx, 100, 100, 4, false);
      drawDalgonaShape(errorCtx, 100, 100, difficultyThickness, true);
      
      const targetData = targetCtx.getImageData(0,0,100,100).data;
      let targetPx = 0;
      for(let i=3; i<targetData.length; i+=4) if(targetData[i] > 100) targetPx++;
      totalPixels = targetPx || 1;
    } else {
      totalPixels = offscreenCanvas.width * offscreenCanvas.height;
    }
    
    ctx.globalCompositeOperation = 'destination-out';
    clearedPixels = 0;
    updateProgress(0);
  };
}

function getBrushSettings() {
  if (state.equippedBrush === 'needle') {
    return { size: 3, cap: 'round' as CanvasLineCap, join: 'round' as CanvasLineJoin };
  } else if (state.equippedBrush === 'scraper') {
    return { size: BRUSH_BASE_SIZE * 1.5, cap: 'square' as CanvasLineCap, join: 'miter' as CanvasLineJoin };
  }
  // Standard
  const brushSize = BRUSH_BASE_SIZE + (state.brushLevel - 1) * BRUSH_UPGRADE_AMOUNT;
  return { size: brushSize, cap: 'round' as CanvasLineCap, join: 'round' as CanvasLineJoin };
}

function scratch(x: number, y: number) {
  if (!isScratching) {
    lastX = x;
    lastY = y;
    isScratching = true;
    startCombo();
  }

  const bs = getBrushSettings();

  ctx.beginPath();
  ctx.lineCap = bs.cap;
  ctx.lineJoin = bs.join;
  ctx.lineWidth = bs.size * 2;
  ctx.moveTo(lastX!, lastY!);
  ctx.lineTo(x, y);
  ctx.stroke();

  createParticle(x, y);

  const earnAmount = ((MULTIPLIER_BASE + (state.multiplierLevel - 1) * MULTIPLIER_UPGRADE_AMOUNT) * combo) / 100;
  state.coins += earnAmount;
  
  if (state.luckLevel > 0 && Math.random() < (0.002 * state.luckLevel)) {
    const gemBonus = (500 * state.luckLevel) / 100;
    state.coins += gemBonus;
    particles.push({
      x, y, vx: 0, vy: -2, life: 1.0, color: '#ff00ff', text: '💎 +' + gemBonus
    });
    if (navigator.vibrate) navigator.vibrate([20, 20, 20]);
  }
  
  if (throttleCalc % 5 === 0 && navigator.vibrate) navigator.vibrate(10);
  if (throttleCalc % 15 === 0) playScratchSound();

  lastX = x;
  lastY = y;
  maintainCombo();
  updateUI();

  throttleCalc++;
  if (throttleCalc % 20 === 0) calcProgress();
}

function calcProgress() {
  offCtx.clearRect(0, 0, 100, 100);
  offCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, 100, 100);
  const data = offCtx.getImageData(0, 0, 100, 100).data;
  
  if (isDalgonaMode) {
    const errorData = errorCtx.getImageData(0, 0, 100, 100).data;
    const targetData = targetCtx.getImageData(0, 0, 100, 100).data;
    
    let clearedTarget = 0;
    let errorPx = 0;
    
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 50) { // Screen is erased here
        if (errorData[i] > 100) errorPx++;
        if (targetData[i] > 100) clearedTarget++;
      }
    }
    
    const errPct = (errorPx / 10000) * 100;
    if (errPct > DALGONA_ERROR_LIMIT) {
      dalgonaFail();
      return;
    }
    
    clearedPixels = clearedTarget;
    const pct = Math.min(100, Math.floor((clearedPixels / totalPixels) * 100));
    updateProgress(pct);
    if (pct >= 90) levelComplete();
    
  } else {
    let cleared = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 50) cleared++;
    }
    clearedPixels = cleared;
    const pct = Math.min(100, Math.floor((clearedPixels / totalPixels) * 100));
    updateProgress(pct);
    if (pct >= 95) levelComplete();
  }
}

function updateProgress(pct: number) {
  progressText.textContent = isDalgonaMode ? `${pct}% Carved` : `${pct}% Revealed`;
  progressBarFill.style.width = `${pct}%`;
  if (isDalgonaMode) {
    progressBarFill.style.backgroundColor = '#ff4444';
  } else {
    progressBarFill.style.backgroundColor = 'var(--primary-color)';
  }
}

function levelComplete() {
  isScratching = false;
  canvas.style.pointerEvents = 'none';
  const bonus = 1000 * (state.levelIndex + 1);
  state.coins += bonus;
  levelBonusEl.textContent = bonus.toString();
  levelModal.classList.remove('hidden');
  saveState();
  updateUI();
}

function dalgonaFail() {
  isScratching = false;
  canvas.style.pointerEvents = 'none';
  failModal.classList.remove('hidden');
}

function retryLevel() {
  failModal.classList.add('hidden');
  canvas.style.pointerEvents = 'auto';
  initLevel();
}

function nextLevel() {
  if (state.gameMode === "girl") state.girlLevelIndex++; else state.levelIndex++;
  levelModal.classList.add('hidden');
  canvas.style.pointerEvents = 'auto';
  saveState();
  initLevel();
}

// --- COMBO SYSTEM ---
let comboAnimFrame: number;
let comboStartTime: number;
const COMBO_DURATION = 1000;

function startCombo() { comboDisplay.classList.remove('hidden'); }

function maintainCombo() {
  combo += 0.01;
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
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; text?: string; }
const particles: Particle[] = [];
const particleCanvas = document.createElement('canvas');
particleCanvas.id = 'particle-layer';
container.insertBefore(particleCanvas, document.getElementById('ui-layer'));
const pCtx = particleCanvas.getContext('2d')!;

function resizeParticleCanvas() {
  particleCanvas.width = window.innerWidth;
  particleCanvas.height = window.innerHeight;
}

function createParticle(x: number, y: number) {
  if (Math.random() > 0.9) return;
  
  const levelArray = state.gameMode === 'girl' ? GIRL_LEVELS : LEVELS;
  const currentIndex = state.gameMode === 'girl' ? state.girlLevelIndex : state.levelIndex;
  const currentLevel = levelArray[currentIndex % levelArray.length];

  particles.push({
    x, y,
    vx: (Math.random() - 0.5) * 5,
    vy: (Math.random() - 0.5) * 5,
    life: 1.0,
    color: currentLevel.maskColor
  });
}

function renderParticles() {
  pCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.life -= 0.02;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    pCtx.globalAlpha = p.life;
    if (p.text) {
      pCtx.fillStyle = '#fff';
      pCtx.font = 'bold 24px sans-serif';
      pCtx.fillText(p.text, p.x, p.y - 10);
    } else {
      pCtx.fillStyle = p.color;
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      pCtx.fill();
    }
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
  
  autobotLvlEl.textContent = state.autobotLevel.toString();
  autobotCostEl.textContent = getAutobotCost().toString();
  upgradeAutobotBtn.disabled = state.coins < getAutobotCost();
  
  luckLvlEl.textContent = state.luckLevel.toString();
  luckCostEl.textContent = getLuckCost().toString();
  upgradeLuckBtn.disabled = state.coins < getLuckCost();
  
  // Brushes
  if (state.levelIndex >= 19) {
    document.getElementById('brushes-section')!.classList.remove('hidden');
    
    // Needle
    if (state.unlockedBrushes.includes('needle')) {
      buyNeedleBtn.classList.add('hidden');
      document.getElementById('equip-needle')!.classList.remove('hidden');
      document.getElementById('equip-needle')!.textContent = state.equippedBrush === 'needle' ? 'Equipped' : 'Equip';
    } else {
      buyNeedleBtn.disabled = state.coins < 5000;
    }
    
    // Scraper
    if (state.unlockedBrushes.includes('scraper')) {
      buyScraperBtn.classList.add('hidden');
      document.getElementById('equip-scraper')!.classList.remove('hidden');
      document.getElementById('equip-scraper')!.textContent = state.equippedBrush === 'scraper' ? 'Equipped' : 'Equip';
    } else {
      buyScraperBtn.disabled = state.coins < 10000;
    }
    
    equipStandardBtn.textContent = state.equippedBrush === 'standard' ? 'Equipped' : 'Equip';
  } else {
    document.getElementById('brushes-section')!.classList.add('hidden');
  }
}

shopBtn.addEventListener('click', () => { shopModal.classList.remove('hidden'); updateUI(); });
closeShopBtn.addEventListener('click', () => { shopModal.classList.add('hidden'); });
retryBtn.addEventListener('click', retryLevel);
nextLevelBtn.addEventListener('click', nextLevel);

upgradeBrushBtn.addEventListener('click', () => {
  const cost = getBrushCost();
  if (state.coins >= cost) { state.coins -= cost; state.brushLevel++; saveState(); updateUI(); }
});
upgradeMultBtn.addEventListener('click', () => {
  const cost = getMultCost();
  if (state.coins >= cost) { state.coins -= cost; state.multiplierLevel++; saveState(); updateUI(); }
});
upgradeAutobotBtn.addEventListener('click', () => {
  const cost = getAutobotCost();
  if (state.coins >= cost) { state.coins -= cost; state.autobotLevel++; saveState(); updateUI(); }
});
upgradeLuckBtn.addEventListener('click', () => {
  const cost = getLuckCost();
  if (state.coins >= cost) { state.coins -= cost; state.luckLevel++; saveState(); updateUI(); }
});

buyNeedleBtn.addEventListener('click', () => {
  if (state.coins >= 5000) { state.coins -= 5000; state.unlockedBrushes.push('needle'); state.equippedBrush = 'needle'; saveState(); updateUI(); }
});
document.getElementById('equip-needle')!.addEventListener('click', () => {
  state.equippedBrush = 'needle'; saveState(); updateUI();
});

buyScraperBtn.addEventListener('click', () => {
  if (state.coins >= 10000) { state.coins -= 10000; state.unlockedBrushes.push('scraper'); state.equippedBrush = 'scraper'; saveState(); updateUI(); }
});
document.getElementById('equip-scraper')!.addEventListener('click', () => {
  state.equippedBrush = 'scraper'; saveState(); updateUI();
});

equipStandardBtn.addEventListener('click', () => {
  state.equippedBrush = 'standard'; saveState(); updateUI();
});

// --- INPUT EVENTS ---
let isPointerDown = false;
const handlePointerMove = (e: PointerEvent) => {
  if (isPointerDown) { e.preventDefault(); scratch(e.clientX, e.clientY); }
};
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault(); isPointerDown = true; scratch(e.clientX, e.clientY);
});
canvas.addEventListener('pointermove', handlePointerMove);
window.addEventListener('pointerup', () => { isPointerDown = false; endCombo(); });
window.addEventListener('pointercancel', () => { isPointerDown = false; endCombo(); });

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault(); isPointerDown = true; const touch = e.touches[0]; scratch(touch.clientX, touch.clientY);
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (isPointerDown) { const touch = e.touches[0]; scratch(touch.clientX, touch.clientY); }
}, { passive: false });
window.addEventListener('touchend', () => { isPointerDown = false; endCombo(); });
window.addEventListener('touchcancel', () => { isPointerDown = false; endCombo(); });

// Auto-Bot Loop
setInterval(() => {
  if (state.autobotLevel > 0 && canvas.style.pointerEvents !== 'none') {
     const bx = Math.random() * window.innerWidth;
     const by = Math.random() * window.innerHeight;
     const wasScratching = isScratching;
     if (!isScratching) { lastX = bx; lastY = by; }
     scratch(bx, by);
     if (!wasScratching && !isPointerDown) {
       setTimeout(() => { if (!isPointerDown) endCombo(); }, 50);
     }
  }
}, 1000);

// --- BOOTSTRAP ---
window.addEventListener('resize', () => { resizeCanvas(); resizeParticleCanvas(); });
loadState();
homeScreen.style.display = 'flex'; // Always show home on boot
resizeCanvas();
resizeParticleCanvas();
updateUI();
renderParticles();

function unlockAudio() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('touchstart', unlockAudio);
}
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('touchstart', unlockAudio);
