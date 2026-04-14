const canvas = document.getElementById("board-canvas");
const ctx = canvas.getContext("2d");

const taskTitleEl = document.getElementById("task-title");
const taskTextEl = document.getElementById("task-text");
const levelEl = document.getElementById("level");
const scoreEl = document.getElementById("score");
const mistakesEl = document.getElementById("mistakes");
const resultEl = document.getElementById("result");
const breakerSelectEl = document.getElementById("breaker-select");
const cableSelectEl = document.getElementById("cable-select");
const checkButtonEl = document.getElementById("check-button");
const nextButtonEl = document.getElementById("next-button");
const gameOverEl = document.getElementById("game-over");
const finalScoreEl = document.getElementById("final-score");
const restartButtonEl = document.getElementById("restart-button");

const BREAKERS = [6, 10, 16, 20, 25, 32, 40, 50, 63];
const CABLES = [
  { section: 1.5, ampacity: 19 },
  { section: 2.5, ampacity: 27 },
  { section: 4, ampacity: 38 },
  { section: 6, ampacity: 50 },
  { section: 10, ampacity: 70 }
];

const LEVELS = [
  { target: 4, bonus: 15, cosPhi: 1.0, label: "Квартира - базовые линии" },
  { target: 7, bonus: 25, cosPhi: 0.95, label: "Частный дом - смешанные нагрузки" },
  { target: 10, bonus: 40, cosPhi: 0.9, label: "Небольшой объект - усиленный режим" }
];

const state = {
  score: 0,
  level: 1,
  solved: 0,
  mistakes: 0,
  phase: 1,
  currentTask: null,
  checked: false,
  gameOver: false,
  highlightOk: false
};

let audioContext = null;
let musicTimer = null;

function ensureAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  if (!musicTimer) startMusic();
}

function playTone(freq, duration, type, gainValue, slide = null) {
  if (!audioContext) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioContext.currentTime);
  if (slide) {
    osc.frequency.exponentialRampToValueAtTime(slide, audioContext.currentTime + duration);
  }
  gain.gain.setValueAtTime(gainValue, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start();
  osc.stop(audioContext.currentTime + duration);
}

function playFx(type) {
  if (type === "ok") playTone(540, 0.14, "triangle", 0.03, 820);
  if (type === "wrong") playTone(170, 0.18, "sawtooth", 0.035, 90);
  if (type === "level") {
    playTone(420, 0.12, "triangle", 0.028, 640);
    setTimeout(() => playTone(680, 0.15, "triangle", 0.028, 920), 120);
  }
}

function startMusic() {
  const bass = [110, 147, 123, 165, 110, 196, 165, 147];
  const lead = [330, 392, 349, 440, 370, 494, 440, 392];
  let step = 0;
  musicTimer = setInterval(() => {
    playTone(bass[step % bass.length], 0.26, "sine", 0.01);
    playTone(lead[step % lead.length], 0.16, "triangle", 0.007, lead[step % lead.length] * 1.02);
    step += 1;
  }, 320);
}

function fillSelects() {
  breakerSelectEl.innerHTML = BREAKERS.map((b) => `<option value="${b}">${b} A</option>`).join("");
  cableSelectEl.innerHTML = CABLES.map((c) => `<option value="${c.section}">${c.section} мм²</option>`).join("");
}

function clampLevel() {
  if (state.solved >= LEVELS[2].target) {
    state.level = 3;
  } else if (state.solved >= LEVELS[1].target) {
    state.level = 2;
  } else {
    state.level = 1;
  }
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateTask() {
  const levelCfg = LEVELS[state.level - 1];
  const scenarios = [
    { name: "Линия розеток кухни", basePower: [3.2, 4.0, 4.8] },
    { name: "Освещение этажа", basePower: [1.3, 1.9, 2.5] },
    { name: "Варочная поверхность", basePower: [5.0, 6.2, 7.0] },
    { name: "Бойлер", basePower: [2.0, 2.5, 3.0] },
    { name: "Кондиционеры", basePower: [3.6, 4.4, 5.8] },
    { name: "Розеточная группа мастерской", basePower: [4.1, 5.0, 6.8] }
  ];
  const scenario = randomChoice(scenarios);
  const powerKw = randomChoice(scenario.basePower) + (state.level - 1) * 0.4;
  const phase = Math.random() > 0.8 && state.level > 1 ? 3 : 1;
  const voltage = phase === 1 ? 230 : 400;
  const cosPhi = phase === 1 ? levelCfg.cosPhi : 0.9;
  const current = phase === 1
    ? (powerKw * 1000) / (voltage * cosPhi)
    : (powerKw * 1000) / (Math.sqrt(3) * voltage * cosPhi);
  const designCurrent = current * 1.2;
  const breaker = BREAKERS.find((x) => x >= designCurrent) || 63;
  const cable = CABLES.find((x) => x.ampacity >= breaker) || CABLES[CABLES.length - 1];

  state.currentTask = {
    scenario: scenario.name,
    powerKw: Number(powerKw.toFixed(1)),
    phase,
    voltage,
    cosPhi: Number(cosPhi.toFixed(2)),
    current: Number(current.toFixed(1)),
    designCurrent: Number(designCurrent.toFixed(1)),
    breaker,
    cable: cable.section,
    cableAmpacity: cable.ampacity
  };
  state.checked = false;
  state.highlightOk = false;
}

function setTaskText() {
  const t = state.currentTask;
  taskTitleEl.textContent = `Задача ${state.solved + 1}: ${LEVELS[state.level - 1].label}`;
  taskTextEl.textContent = `${t.scenario}. Нагрузка ${t.powerKw} кВт, ${t.phase}-фазная сеть ${t.voltage} В. Выбери автомат и минимальное сечение медного кабеля для щитка.`;
}

function updateStats() {
  levelEl.textContent = String(state.level);
  scoreEl.textContent = String(state.score);
  mistakesEl.textContent = String(state.mistakes);
}

function checkAnswer() {
  if (state.gameOver || state.checked) return;
  ensureAudio();
  const selectedBreaker = Number(breakerSelectEl.value);
  const selectedCable = Number(cableSelectEl.value);
  const t = state.currentTask;
  const ok = selectedBreaker === t.breaker && selectedCable === t.cable;

  state.checked = true;
  if (ok) {
    const levelBonus = LEVELS[state.level - 1].bonus;
    state.score += 100 + levelBonus;
    state.solved += 1;
    state.highlightOk = true;
    resultEl.textContent = `Верно. Расчетный ток ${t.current} A, с запасом ${t.designCurrent} A. Автомат ${t.breaker} A и кабель ${t.cable} мм² (${t.cableAmpacity} A) подобраны корректно.`;
    playFx("ok");
    const prevLevel = state.level;
    clampLevel();
    if (state.level > prevLevel) {
      resultEl.textContent += ` Переход на уровень ${state.level}.`;
      playFx("level");
    }
  } else {
    state.score = Math.max(0, state.score - 35);
    state.mistakes += 1;
    resultEl.textContent = `Есть ошибка. Нужен автомат ${t.breaker} A и кабель ${t.cable} мм². Подсказка: автомат должен быть выше расчетного тока с запасом, кабель - держать ток автомата.`;
    playFx("wrong");
    if (state.mistakes >= 3) {
      state.gameOver = true;
      finalScoreEl.textContent = String(state.score);
      gameOverEl.classList.remove("hidden");
    }
  }
  updateStats();
  drawBoard();
}

function nextTask() {
  if (state.gameOver) return;
  if (!state.checked) {
    resultEl.textContent = "Сначала проверь текущее решение, затем переходи к следующей задаче.";
    return;
  }
  generateTask();
  setTaskText();
  resultEl.textContent = 'Выбери автомат и кабель, затем нажми "Проверить решение".';
  drawBoard();
}

function restartGame() {
  state.score = 0;
  state.level = 1;
  state.solved = 0;
  state.mistakes = 0;
  state.gameOver = false;
  state.checked = false;
  state.highlightOk = false;
  gameOverEl.classList.add("hidden");
  generateTask();
  setTaskText();
  updateStats();
  resultEl.textContent = 'Выбери автомат и кабель, затем нажми "Проверить решение".';
  drawBoard();
}

function drawBoard() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#0d1b33";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#10294a";
  ctx.fillRect(32, 24, 300, h - 48);
  ctx.fillStyle = "#123864";
  ctx.fillRect(360, 24, w - 392, h - 48);

  ctx.fillStyle = "#d8e7ff";
  ctx.font = "700 22px Segoe UI";
  ctx.fillText("Щиток", 56, 58);
  ctx.font = "600 16px Segoe UI";
  ctx.fillStyle = "#9ec8ff";
  ctx.fillText(`Уровень подготовки: ${state.level}`, 56, 84);

  for (let i = 0; i < 8; i += 1) {
    const y = 110 + i * 44;
    ctx.fillStyle = "#1f3f68";
    ctx.fillRect(56, y, 252, 32);
  }

  const selectedBreaker = Number(breakerSelectEl.value);
  const selectedCable = Number(cableSelectEl.value);
  const breakerY = 110 + Math.min(BREAKERS.indexOf(selectedBreaker), 7) * 44;
  const cableY = 110 + Math.min(CABLES.findIndex((x) => x.section === selectedCable), 7) * 44;

  ctx.fillStyle = state.checked ? (state.highlightOk ? "#2b8e67" : "#9a3f4a") : "#3469a8";
  ctx.fillRect(70, breakerY + 4, 110, 24);
  ctx.fillRect(190, cableY + 4, 104, 24);
  ctx.fillStyle = "#eaf2ff";
  ctx.font = "700 14px Segoe UI";
  ctx.fillText(`${selectedBreaker}A`, 102, breakerY + 21);
  ctx.fillText(`${selectedCable}мм²`, 210, cableY + 21);

  ctx.fillStyle = "#d8e7ff";
  ctx.font = "700 20px Segoe UI";
  ctx.fillText("Линия нагрузки", 390, 58);

  const t = state.currentTask;
  const x0 = 420;
  const y0 = 120;
  ctx.strokeStyle = "#89b9ff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0 + 120, y0);
  ctx.lineTo(x0 + 120, y0 + 240);
  ctx.lineTo(x0 + 230, y0 + 240);
  ctx.stroke();

  ctx.fillStyle = "#ffcb68";
  ctx.fillRect(x0 + 224, y0 + 212, 90, 54);
  ctx.fillStyle = "#0f1f39";
  ctx.font = "700 18px Segoe UI";
  ctx.fillText(`${t.powerKw} кВт`, x0 + 238, y0 + 244);

  ctx.fillStyle = "#cbe0ff";
  ctx.font = "600 15px Segoe UI";
  ctx.fillText(`Сеть: ${t.phase}-ф, ${t.voltage} В`, 390, 360);
  ctx.fillText(`cosφ: ${t.cosPhi}`, 390, 386);
  ctx.fillText(`Расчетный ток: ${t.current} A`, 390, 412);
  ctx.fillText(`Ток с запасом: ${t.designCurrent} A`, 390, 438);
}

checkButtonEl.addEventListener("click", checkAnswer);
nextButtonEl.addEventListener("click", nextTask);
restartButtonEl.addEventListener("click", () => {
  ensureAudio();
  restartGame();
});

document.addEventListener("keydown", (event) => {
  if (event.code === "Enter") {
    checkAnswer();
  }
  if (event.code === "KeyN") {
    nextTask();
  }
  if (event.code === "KeyR" && state.gameOver) {
    restartGame();
  }
  ensureAudio();
});

fillSelects();
restartGame();
