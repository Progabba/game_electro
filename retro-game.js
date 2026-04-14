import * as THREE from "https://unpkg.com/three@0.163.0/build/three.module.js";

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
const sceneHost = document.getElementById("scene3d");
const introOverlayEl = document.getElementById("intro-overlay");
const introTextEl = document.getElementById("intro-text");
const introPreviewEl = document.getElementById("intro-preview");
const introNextEl = document.getElementById("intro-next");
const introSkipEl = document.getElementById("intro-skip");

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
const introFrames = [
  "1996 год. Энергорайон в аварийном режиме. Сегодня ты главный электрик смены.",
  "На каждом объекте нужно выбрать автомат и кабель с реальным токовым запасом.",
  "Включай автомат: если номиналы неверны, увидишь срабатывание защиты или перегрев кабеля."
];

const state = {
  score: 0,
  level: 1,
  solved: 0,
  mistakes: 0,
  attemptsInTask: 0,
  checked: false,
  gameOver: false,
  simCase: "idle",
  currentTask: null
};

let audioContext = null;
let musicLoop = null;
let musicStep = 0;
let musicSection = 0;
let bgMusicEl = null;
let voiceEnabled = true;
function ensureAudio() {
  try {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume();
  } catch {
    return;
  }
  if (!bgMusicEl && !musicLoop) startMusic();
}
function tone(freq, duration, type, gainValue, slide = null) {
  if (!audioContext) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioContext.currentTime);
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, audioContext.currentTime + duration);
  gain.gain.setValueAtTime(gainValue, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start();
  osc.stop(audioContext.currentTime + duration);
}
function playFx(type) {
  ensureAudio();
  if (type === "ok") tone(520, 0.14, "triangle", 0.028, 820);
  if (type === "wrong") tone(170, 0.2, "sawtooth", 0.038, 90);
  if (type === "trip") {
    tone(210, 0.16, "square", 0.04, 120);
    playShortCircuit(0.06, 0.12);
  }
  if (type === "melt") {
    tone(145, 0.22, "sawtooth", 0.045, 80);
    playShortCircuit(0.085, 0.2);
  }
}
function startMusic() {
  if (!bgMusicEl) {
    bgMusicEl = new Audio("./music/theme.mp3");
    bgMusicEl.loop = true;
    bgMusicEl.volume = 0.36;
    bgMusicEl.preload = "auto";
    bgMusicEl.play().catch(() => {
      bgMusicEl = null;
      startSynthMusicLoop();
    });
    if (bgMusicEl) {
      return;
    }
  }
}

function startSynthMusicLoop() {
  if (musicLoop) return;
  const bassSets = [
    [110, 123, 147, 165, 147, 123, 98, 110],
    [92, 110, 123, 147, 123, 110, 82, 92],
    [123, 147, 165, 196, 165, 147, 110, 123]
  ];
  const leadSets = [
    [440, 392, 494, 523, 494, 392, 349, 392],
    [330, 349, 392, 440, 392, 349, 294, 330],
    [494, 440, 523, 587, 523, 440, 392, 440]
  ];
  musicLoop = setInterval(() => {
    const bass = bassSets[musicSection % bassSets.length];
    const lead = leadSets[musicSection % leadSets.length];
    const idx = musicStep % bass.length;
    tone(bass[idx], 0.24, "triangle", 0.008);
    if (musicStep % 2 === 0) tone(lead[idx], 0.16, "square", 0.004, lead[idx] * 1.02);
    if (musicStep % 4 === 0) tone(60, 0.05, "sine", 0.006);
    if (musicStep % 8 === 6) tone(980, 0.03, "triangle", 0.002);
    musicStep += 1;
    if (musicStep % 32 === 0) musicSection = (musicSection + 1) % bassSets.length;
  }, 300);
}

function playShortCircuit(volume, duration) {
  if (!audioContext) return;
  const bufferSize = Math.floor(audioContext.sampleRate * duration);
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const output = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    output[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  const filter = audioContext.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(900, audioContext.currentTime);
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(volume, audioContext.currentTime);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  source.start();
}

function speakIntroText(text) {
  if (!voiceEnabled || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ru-RU";
  utter.rate = 0.96;
  utter.pitch = 1;
  window.speechSynthesis.speak(utter);
}

function fillSelects() {
  breakerSelectEl.innerHTML = BREAKERS.map((v) => `<option value="${v}">${v} A</option>`).join("");
  cableSelectEl.innerHTML = CABLES.map((c) => `<option value="${c.section}">${c.section} мм²</option>`).join("");
}
function clampLevel() {
  if (state.solved >= LEVELS[2].target) state.level = 3;
  else if (state.solved >= LEVELS[1].target) state.level = 2;
  else state.level = 1;
}
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateTask() {
  const cfg = LEVELS[state.level - 1];
  const scenarios = [
    { name: "Розеточная группа кухни", powers: [3.2, 4.0, 4.8] },
    { name: "Освещение этажа", powers: [1.3, 1.9, 2.5] },
    { name: "Варочная поверхность", powers: [5.0, 6.2, 7.0] },
    { name: "Бойлер", powers: [2.0, 2.5, 3.0] }
  ];
  const scenario = randomChoice(scenarios);
  const powerKw = randomChoice(scenario.powers) + (state.level - 1) * 0.3;
  const phase = Math.random() > 0.82 && state.level > 1 ? 3 : 1;
  const voltage = phase === 1 ? 230 : 400;
  const cosPhi = phase === 1 ? cfg.cosPhi : 0.9;
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
    current: Number(current.toFixed(1)),
    designCurrent: Number(designCurrent.toFixed(1)),
    breaker,
    cable: cable.section
  };
  state.checked = false;
  state.simCase = "idle";
}
function updateText() {
  const t = state.currentTask;
  taskTitleEl.textContent = `Задача ${state.solved + 1}: ${LEVELS[state.level - 1].label}`;
  taskTextEl.textContent = `${t.scenario}. Нагрузка ${t.powerKw} кВт, ${t.phase}-ф сеть ${t.voltage} В. Выбери автомат и кабель, затем включи линию.`;
}
function updateStats() {
  levelEl.textContent = String(state.level);
  scoreEl.textContent = String(state.score);
  mistakesEl.textContent = String(state.mistakes);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101f38);
scene.fog = new THREE.Fog(0x101f38, 15, 35);
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
sceneHost.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0x5f78a5, 0.72));
const mainLight = new THREE.DirectionalLight(0xffffff, 1.15);
mainLight.position.set(6, 9, 5);
mainLight.castShadow = true;
scene.add(mainLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ color: 0x1d3558, roughness: 0.9 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const panelBody = new THREE.Mesh(
  new THREE.BoxGeometry(4.6, 5.8, 0.45),
  new THREE.MeshStandardMaterial({ color: 0xdbe4f2, roughness: 0.45 })
);
panelBody.position.set(-1.8, 2.9, 0);
panelBody.castShadow = true;
scene.add(panelBody);

const doorGlass = new THREE.Mesh(
  new THREE.BoxGeometry(4.1, 5.3, 0.04),
  new THREE.MeshStandardMaterial({ color: 0x8eb7e8, transparent: true, opacity: 0.2 })
);
doorGlass.position.set(-1.8, 2.9, 0.27);
scene.add(doorGlass);

const railGroup = new THREE.Group();
for (let i = 0; i < 6; i += 1) {
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(3.8, 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x9ba8bc, metalness: 0.45, roughness: 0.35 })
  );
  rail.position.set(0, 1 + i * 0.72, 0.2);
  railGroup.add(rail);
}
railGroup.position.set(-1.8, 0.4, 0);
scene.add(railGroup);

const breakerBlock = new THREE.Mesh(
  new THREE.BoxGeometry(0.8, 1.2, 0.7),
  new THREE.MeshStandardMaterial({ color: 0xf9fbff })
);
breakerBlock.position.set(-1.4, 3.35, 0.42);
breakerBlock.castShadow = true;
scene.add(breakerBlock);

const breakerHandlePivot = new THREE.Group();
breakerHandlePivot.position.set(-1.08, 3.35, 0.78);
const breakerHandle = new THREE.Mesh(
  new THREE.BoxGeometry(0.18, 0.9, 0.2),
  new THREE.MeshStandardMaterial({ color: 0x495a73 })
);
breakerHandle.position.x = -0.05;
breakerHandlePivot.add(breakerHandle);
scene.add(breakerHandlePivot);

const cableMaterial = new THREE.MeshStandardMaterial({ color: 0x4d84d8, emissive: 0x000000 });
const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 7.8, 20), cableMaterial);
cable.rotation.z = Math.PI / 2;
cable.position.set(1.3, 2.8, 0.1);
scene.add(cable);

const loadCabinet = new THREE.Mesh(
  new THREE.BoxGeometry(3.4, 3.1, 2.5),
  new THREE.MeshStandardMaterial({ color: 0x6c829f })
);
loadCabinet.position.set(5.2, 1.6, 0);
loadCabinet.castShadow = true;
scene.add(loadCabinet);

const okLight = new THREE.PointLight(0x56ff9b, 0, 6);
okLight.position.set(-2.9, 5.6, 0.5);
scene.add(okLight);
const warnLight = new THREE.PointLight(0xff623f, 0, 7);
warnLight.position.set(-0.7, 5.6, 0.5);
scene.add(warnLight);

const particles = [];
function spawnParticle(kind) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(kind === "smoke" ? 0.07 : 0.05, 8, 8),
    new THREE.MeshStandardMaterial({
      color: kind === "smoke" ? 0x444444 : 0xffc46c,
      emissive: kind === "smoke" ? 0x111111 : 0x8a4f14,
      emissiveIntensity: kind === "smoke" ? 0.2 : 0.9,
      transparent: kind === "smoke",
      opacity: kind === "smoke" ? 0.5 : 1
    })
  );
  mesh.position.set(1.9 + Math.random() * 0.7, 2.8 + Math.random() * 0.2, (Math.random() - 0.5) * 0.25);
  scene.add(mesh);
  particles.push({
    mesh,
    vx: 0.02 + Math.random() * 0.03,
    vy: kind === "smoke" ? 0.01 + Math.random() * 0.02 : -0.01 + Math.random() * 0.03,
    vz: (Math.random() - 0.5) * 0.02,
    life: kind === "smoke" ? 60 : 26,
    kind
  });
}

function resetVisual() {
  breakerHandlePivot.rotation.z = 0;
  cableMaterial.color.set(0x4d84d8);
  cableMaterial.emissive.set(0x000000);
  loadCabinet.material.color.set(0x6c829f);
  okLight.intensity = 0;
  warnLight.intensity = 0;
  while (particles.length) {
    const p = particles.pop();
    scene.remove(p.mesh);
  }
}

function evaluateChoice() {
  if (state.gameOver) return;
  const t = state.currentTask;
  const b = Number(breakerSelectEl.value);
  const s = Number(cableSelectEl.value);
  const ampacity = CABLES.find((x) => x.section === s)?.ampacity ?? 19;
  const exact = b === t.breaker && s === t.cable;
  const trip = b < t.designCurrent;
  const melt = !trip && ampacity < t.designCurrent;
  state.attemptsInTask += 1;

  if (exact) {
    state.simCase = "ok";
    state.checked = true;
    state.score += 120 + LEVELS[state.level - 1].bonus;
    state.solved += 1;
    const prev = state.level;
    clampLevel();
    resultEl.textContent = `Линия работает стабильно. Iрасч=${t.current}A, с запасом ${t.designCurrent}A.`;
    if (state.level > prev) resultEl.textContent += ` Переход на уровень ${state.level}.`;
    playFx("ok");
  } else if (trip) {
    state.simCase = "trip";
    state.score = Math.max(0, state.score - 25);
    state.mistakes += 1;
    resultEl.textContent = `Автомат ${b}A ниже требуемого ${t.designCurrent}A. Автомат отключил линию.`;
    playFx("trip");
  } else if (melt) {
    state.simCase = "melt";
    state.score = Math.max(0, state.score - 35);
    state.mistakes += 1;
    resultEl.textContent = `Кабель ${s}мм² не держит ${t.designCurrent}A. Начался перегрев и оплавление.`;
    playFx("melt");
  } else {
    state.simCase = "wrong";
    state.score = Math.max(0, state.score - 20);
    state.mistakes += 1;
    resultEl.textContent = `Неверная комбинация. Целевой подбор: автомат ${t.breaker}A, кабель ${t.cable}мм².`;
    playFx("wrong");
  }

  if (state.mistakes >= 3) {
    state.gameOver = true;
    finalScoreEl.textContent = String(state.score);
    gameOverEl.classList.remove("hidden");
  }
  updateStats();
}

function nextTask() {
  if (state.gameOver) return;
  if (!state.checked) {
    resultEl.textContent = "Сначала реши текущую задачу правильно.";
    return;
  }
  state.attemptsInTask = 0;
  generateTask();
  updateText();
  resultEl.textContent = "Меняй номиналы и включай автомат до правильного решения.";
  resetVisual();
}

function restartGame() {
  state.score = 0;
  state.level = 1;
  state.solved = 0;
  state.mistakes = 0;
  state.checked = false;
  state.attemptsInTask = 0;
  state.gameOver = false;
  state.simCase = "idle";
  gameOverEl.classList.add("hidden");
  generateTask();
  updateText();
  updateStats();
  resultEl.textContent = "Меняй номиналы и включай автомат до правильного решения.";
  resetVisual();
}

let cameraYaw = 0.5;
let cameraPitch = 0.32;
const cameraRadius = 13;
let dragPointer = null;
let lastX = 0;
let lastY = 0;
sceneHost.addEventListener("pointerdown", (e) => {
  dragPointer = e.pointerId;
  lastX = e.clientX;
  lastY = e.clientY;
});
sceneHost.addEventListener("pointermove", (e) => {
  if (dragPointer !== e.pointerId) return;
  cameraYaw -= (e.clientX - lastX) * 0.005;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch + (e.clientY - lastY) * 0.003, 0.12, 0.65);
  lastX = e.clientX;
  lastY = e.clientY;
});
sceneHost.addEventListener("pointerup", (e) => {
  if (dragPointer === e.pointerId) dragPointer = null;
});
sceneHost.addEventListener("pointercancel", (e) => {
  if (dragPointer === e.pointerId) dragPointer = null;
});

function resizeMain() {
  const w = sceneHost.clientWidth;
  const h = sceneHost.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resizeMain);
resizeMain();

checkButtonEl.addEventListener("click", evaluateChoice);
nextButtonEl.addEventListener("click", () => {
  ensureAudio();
  nextTask();
});
restartButtonEl.addEventListener("click", () => {
  ensureAudio();
  restartGame();
});
document.addEventListener("pointerdown", () => {
  ensureAudio();
}, { once: true });
document.addEventListener("touchstart", () => {
  ensureAudio();
}, { once: true, passive: true });
document.addEventListener("keydown", (event) => {
  if (event.code === "Enter") evaluateChoice();
  if (event.code === "KeyN") nextTask();
  if (event.code === "KeyR" && state.gameOver) restartGame();
  if (event.code === "KeyM") voiceEnabled = !voiceEnabled;
  ensureAudio();
});

let introStep = 0;
let typingToken = 0;
function renderIntroText() {
  const token = ++typingToken;
  const text = introFrames[introStep];
  speakIntroText(text);
  introTextEl.textContent = "";
  introTextEl.classList.add("typing-caret");
  let i = 0;
  const write = () => {
    if (token !== typingToken) return;
    introTextEl.textContent = text.slice(0, i);
    i += 1;
    if (i <= text.length) {
      setTimeout(write, 24);
    } else {
      introTextEl.classList.remove("typing-caret");
    }
  };
  write();
}
introNextEl.addEventListener("click", () => {
  ensureAudio();
  introStep += 1;
  if (introStep >= introFrames.length) {
    introOverlayEl.classList.add("hidden");
    return;
  }
  renderIntroText();
});
introSkipEl.addEventListener("click", () => {
  ensureAudio();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  introOverlayEl.classList.add("hidden");
});

const introScene = new THREE.Scene();
introScene.background = new THREE.Color(0x091427);
const introCamera = new THREE.PerspectiveCamera(52, 1, 0.1, 50);
introCamera.position.set(0, 2.2, 5.2);
const introRenderer = new THREE.WebGLRenderer({ antialias: true });
introRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
introPreviewEl.appendChild(introRenderer.domElement);
introScene.add(new THREE.AmbientLight(0x6f8bbf, 0.8));
const introDir = new THREE.DirectionalLight(0xffffff, 0.9);
introDir.position.set(3, 5, 4);
introScene.add(introDir);
const introFloor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0x1a3560, roughness: 0.9 }));
introFloor.rotation.x = -Math.PI / 2;
introScene.add(introFloor);
const introPanel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.8, 0.3), new THREE.MeshStandardMaterial({ color: 0xdbe6f4 }));
introPanel.position.set(1.3, 0.9, 0);
introScene.add(introPanel);
const introCable = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 18), new THREE.MeshStandardMaterial({ color: 0x4f84d8, emissive: 0x000000 }));
introCable.rotation.z = Math.PI / 2;
introCable.position.set(0.1, 0.95, 0);
introScene.add(introCable);

function resizeIntro() {
  const w = introPreviewEl.clientWidth;
  const h = introPreviewEl.clientHeight;
  introRenderer.setSize(w, h);
  introCamera.aspect = w / h;
  introCamera.updateProjectionMatrix();
}
window.addEventListener("resize", resizeIntro);
resizeIntro();

function animate() {
  requestAnimationFrame(animate);
  const t = Date.now() * 0.001;

  if (state.simCase === "ok") {
    breakerHandlePivot.rotation.z = THREE.MathUtils.lerp(breakerHandlePivot.rotation.z, 0.11, 0.08);
    cableMaterial.color.lerp(new THREE.Color(0x62bcff), 0.07);
    loadCabinet.material.color.lerp(new THREE.Color(0x72b19b), 0.06);
    okLight.intensity = Math.max(0.15, Math.sin(t * 4) * 0.25 + 0.4);
  } else if (state.simCase === "trip") {
    breakerHandlePivot.rotation.z = THREE.MathUtils.lerp(breakerHandlePivot.rotation.z, -0.6, 0.12);
    warnLight.intensity = Math.max(0.3, Math.sin(t * 8) * 0.5 + 0.5);
    loadCabinet.material.color.lerp(new THREE.Color(0x8a6161), 0.06);
    if (Math.random() > 0.9) spawnParticle("spark");
  } else if (state.simCase === "melt") {
    breakerHandlePivot.rotation.z = THREE.MathUtils.lerp(breakerHandlePivot.rotation.z, 0.08, 0.08);
    cableMaterial.color.lerp(new THREE.Color(0xe5753f), 0.08);
    cableMaterial.emissive.lerp(new THREE.Color(0x6b230b), 0.07);
    warnLight.intensity = Math.max(0.5, Math.sin(t * 11) * 0.6 + 0.8);
    if (Math.random() > 0.65) spawnParticle("spark");
    if (Math.random() > 0.85) spawnParticle("smoke");
  } else if (state.simCase === "wrong") {
    warnLight.intensity = Math.max(0.1, Math.sin(t * 5) * 0.2 + 0.2);
  } else {
    okLight.intensity = 0;
    warnLight.intensity = 0;
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.mesh.position.x += p.vx;
    p.mesh.position.y += p.vy;
    p.mesh.position.z += p.vz;
    p.vy += p.kind === "smoke" ? 0.0002 : -0.0012;
    p.life -= 1;
    if (p.kind === "smoke") {
      p.mesh.material.opacity = Math.max(0, p.life / 70);
      p.mesh.scale.multiplyScalar(1.01);
    }
    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
    }
  }

  camera.position.set(
    Math.sin(cameraYaw) * Math.cos(cameraPitch) * cameraRadius,
    Math.sin(cameraPitch) * cameraRadius + 1.2,
    Math.cos(cameraYaw) * Math.cos(cameraPitch) * cameraRadius
  );
  camera.lookAt(0.7, 2.9, 0);
  renderer.render(scene, camera);

  if (!introOverlayEl.classList.contains("hidden")) {
    introPanel.rotation.y = Math.sin(t * 0.9) * 0.1;
    introCable.material.emissive.setHex(Math.sin(t * 7) > 0.5 ? 0x5b230a : 0x001022);
    introCamera.position.x = Math.sin(t * 0.4) * 0.7;
    introCamera.position.z = 5.1 + Math.cos(t * 0.4) * 0.2;
    introCamera.lookAt(0.2, 0.8, 0);
    introRenderer.render(introScene, introCamera);
  }
}

fillSelects();
restartGame();
renderIntroText();
animate();
