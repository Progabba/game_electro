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
  currentTask: null,
  checked: false,
  gameOver: false,
  simCase: "idle",
  flashTime: 0,
  cameraYaw: 0.55,
  cameraPitch: 0.42,
  cameraRadius: 11
};

let audioContext = null;
let musicTimer = null;

function ensureAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
  if (!musicTimer) startMusic();
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
  if (type === "ok") tone(550, 0.12, "triangle", 0.03, 850);
  if (type === "wrong") tone(170, 0.2, "sawtooth", 0.04, 90);
  if (type === "trip") tone(210, 0.16, "square", 0.04, 120);
  if (type === "melt") tone(140, 0.25, "sawtooth", 0.05, 80);
}

function startMusic() {
  const bass = [110, 147, 123, 165, 110, 196, 165, 147];
  let step = 0;
  musicTimer = setInterval(() => {
    tone(bass[step % bass.length], 0.25, "sine", 0.009);
    step += 1;
  }, 320);
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
    cosPhi: Number(cosPhi.toFixed(2)),
    current: Number(current.toFixed(1)),
    designCurrent: Number(designCurrent.toFixed(1)),
    breaker,
    cable: cable.section
  };
  state.checked = false;
}

function updateText() {
  const t = state.currentTask;
  taskTitleEl.textContent = `Задача ${state.solved + 1}: ${LEVELS[state.level - 1].label}`;
  taskTextEl.textContent = `${t.scenario}. Нагрузка ${t.powerKw} кВт, ${t.phase}-ф сеть ${t.voltage} В. Подбери автомат и кабель, затем включи автомат.`;
}

function updateStats() {
  levelEl.textContent = String(state.level);
  scoreEl.textContent = String(state.score);
  mistakesEl.textContent = String(state.mistakes);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1c34);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
camera.position.set(0, 6, 10);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
sceneHost.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0x5c76a4, 0.75));
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(8, 12, 8);
sun.castShadow = true;
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x20385f, roughness: 0.9 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const shieldBox = new THREE.Mesh(
  new THREE.BoxGeometry(3.8, 4.4, 0.35),
  new THREE.MeshStandardMaterial({ color: 0xe6edf7, roughness: 0.5 })
);
shieldBox.position.set(-2.6, 2.2, 0);
shieldBox.castShadow = true;
scene.add(shieldBox);

const busbarTop = new THREE.Mesh(
  new THREE.BoxGeometry(3.1, 0.09, 0.14),
  new THREE.MeshStandardMaterial({ color: 0xd8b367, metalness: 0.8, roughness: 0.25 })
);
busbarTop.position.set(-2.6, 3.72, 0.21);
scene.add(busbarTop);

const busbarBottom = new THREE.Mesh(
  new THREE.BoxGeometry(3.1, 0.09, 0.14),
  new THREE.MeshStandardMaterial({ color: 0xbfd0ea, metalness: 0.7, roughness: 0.25 })
);
busbarBottom.position.set(-2.6, 0.95, 0.21);
scene.add(busbarBottom);

const breakerLever = new THREE.Mesh(
  new THREE.BoxGeometry(0.22, 0.95, 0.2),
  new THREE.MeshStandardMaterial({ color: 0x586780, metalness: 0.4 })
);
breakerLever.position.set(-2.1, 2.55, 0.28);
scene.add(breakerLever);

const cable = new THREE.Mesh(
  new THREE.CylinderGeometry(0.09, 0.09, 7.4, 20),
  new THREE.MeshStandardMaterial({ color: 0x4f87db, emissive: 0x000000 })
);
cable.rotation.z = Math.PI / 2;
cable.position.set(0.25, 2.2, 0);
scene.add(cable);

const cableCoreL = new THREE.Mesh(
  new THREE.CylinderGeometry(0.028, 0.028, 7.2, 14),
  new THREE.MeshStandardMaterial({ color: 0x916133, metalness: 0.45, roughness: 0.45 })
);
cableCoreL.rotation.z = Math.PI / 2;
cableCoreL.position.set(0.25, 2.2, -0.035);
scene.add(cableCoreL);

const cableCoreR = new THREE.Mesh(
  new THREE.CylinderGeometry(0.028, 0.028, 7.2, 14),
  new THREE.MeshStandardMaterial({ color: 0x916133, metalness: 0.45, roughness: 0.45 })
);
cableCoreR.rotation.z = Math.PI / 2;
cableCoreR.position.set(0.25, 2.2, 0.035);
scene.add(cableCoreR);

const loadBox = new THREE.Mesh(
  new THREE.BoxGeometry(2.7, 2.4, 2.2),
  new THREE.MeshStandardMaterial({ color: 0x768ba8 })
);
loadBox.position.set(4.0, 1.2, 0);
loadBox.castShadow = true;
scene.add(loadBox);

const okLight = new THREE.PointLight(0x5aff99, 0, 8);
okLight.position.set(-3.0, 4.0, 0.3);
scene.add(okLight);
const warningLight = new THREE.PointLight(0xff5a3a, 0, 8);
warningLight.position.set(-1.4, 4.0, 0.3);
scene.add(warningLight);

const sparkMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc66, emissive: 0x9c5f11, emissiveIntensity: 0.85 });
const smokeMaterial = new THREE.MeshStandardMaterial({ color: 0x3e3e3e, transparent: true, opacity: 0.5 });
const particles = [];

function resizeRenderer() {
  const w = sceneHost.clientWidth;
  const h = sceneHost.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resizeRenderer);
resizeRenderer();

function resetVisual() {
  breakerLever.rotation.z = 0;
  cable.material.color.set(0x4f87db);
  cable.material.emissive.set(0x000000);
  loadBox.material.color.set(0x768ba8);
  okLight.intensity = 0;
  warningLight.intensity = 0;
  cable.scale.set(1, 1, 1);
  while (particles.length) {
    const p = particles.pop();
    scene.remove(p.mesh);
  }
}

function spawnParticle(kind) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(kind === "spark" ? 0.05 : 0.08, 8, 8),
    kind === "spark" ? sparkMaterial.clone() : smokeMaterial.clone()
  );
  mesh.position.set(1.0, 2.2, THREE.MathUtils.randFloatSpread(0.2));
  const velocity = kind === "spark"
    ? new THREE.Vector3(THREE.MathUtils.randFloat(0.03, 0.08), THREE.MathUtils.randFloat(-0.02, 0.03), THREE.MathUtils.randFloatSpread(0.05))
    : new THREE.Vector3(THREE.MathUtils.randFloat(0.005, 0.02), THREE.MathUtils.randFloat(0.01, 0.03), THREE.MathUtils.randFloatSpread(0.01));
  particles.push({ mesh, velocity, life: kind === "spark" ? 0.35 : 0.9, kind });
  scene.add(mesh);
}

function nextTask() {
  if (state.gameOver) return;
  if (!state.checked) {
    resultEl.textContent = 'Сначала включи автомат и проверь исход текущей задачи.';
    return;
  }
  generateTask();
  updateText();
  resultEl.textContent = "Выбери автомат и кабель, затем включи линию.";
  resetVisual();
}

function checkAnswer() {
  if (state.gameOver || state.checked) return;
  ensureAudio();
  const t = state.currentTask;
  const b = Number(breakerSelectEl.value);
  const s = Number(cableSelectEl.value);
  const ampacity = CABLES.find((x) => x.section === s)?.ampacity ?? 19;
  const isExact = b === t.breaker && s === t.cable;
  const trip = b < t.designCurrent;
  const melt = !trip && ampacity < t.designCurrent;

  state.checked = true;
  state.flashTime = 1.25;
  if (isExact) {
    state.simCase = "ok";
    state.score += 120 + LEVELS[state.level - 1].bonus;
    state.solved += 1;
    const prev = state.level;
    clampLevel();
    resultEl.textContent = `Линия включена корректно. Iрасч=${t.current}A, с запасом ${t.designCurrent}A. Автомат ${t.breaker}A и кабель ${t.cable}мм² подобраны верно.`;
    if (state.level > prev) resultEl.textContent += ` Переход на уровень ${state.level}.`;
    playFx("ok");
  } else if (trip) {
    state.simCase = "trip";
    state.score = Math.max(0, state.score - 25);
    state.mistakes += 1;
    resultEl.textContent = `Ошибка: автомат ${b}A ниже требуемого тока ${t.designCurrent}A. Автомат сработал и отключил линию. Нужен ${t.breaker}A.`;
    playFx("trip");
  } else if (melt) {
    state.simCase = "melt";
    state.score = Math.max(0, state.score - 35);
    state.mistakes += 1;
    resultEl.textContent = `Ошибка: кабель ${s}мм² выдерживает ${ampacity}A, а в линии ${t.designCurrent}A. Кабель перегрелся и начал плавиться. Нужен ${t.cable}мм².`;
    playFx("melt");
  } else {
    state.simCase = "wrong";
    state.score = Math.max(0, state.score - 20);
    state.mistakes += 1;
    resultEl.textContent = `Частично неверно: проверь номиналы. Целевой выбор: автомат ${t.breaker}A, кабель ${t.cable}мм².`;
    playFx("wrong");
  }

  if (state.mistakes >= 3) {
    state.gameOver = true;
    finalScoreEl.textContent = String(state.score);
    gameOverEl.classList.remove("hidden");
  }
  updateStats();
}

function restartGame() {
  state.score = 0;
  state.level = 1;
  state.solved = 0;
  state.mistakes = 0;
  state.checked = false;
  state.gameOver = false;
  state.simCase = "idle";
  state.flashTime = 0;
  gameOverEl.classList.add("hidden");
  generateTask();
  updateText();
  updateStats();
  resultEl.textContent = "Выбери автомат и кабель, затем включи линию.";
  resetVisual();
}

let touchId = null;
let lastTouchX = 0;
let lastTouchY = 0;
sceneHost.addEventListener("pointerdown", (event) => {
  touchId = event.pointerId;
  lastTouchX = event.clientX;
  lastTouchY = event.clientY;
  ensureAudio();
});
sceneHost.addEventListener("pointermove", (event) => {
  if (touchId !== event.pointerId) return;
  const dx = event.clientX - lastTouchX;
  const dy = event.clientY - lastTouchY;
  lastTouchX = event.clientX;
  lastTouchY = event.clientY;
  state.cameraYaw -= dx * 0.005;
  state.cameraPitch = THREE.MathUtils.clamp(state.cameraPitch + dy * 0.003, 0.15, 0.9);
});
sceneHost.addEventListener("pointerup", (event) => {
  if (touchId === event.pointerId) touchId = null;
});
sceneHost.addEventListener("pointercancel", (event) => {
  if (touchId === event.pointerId) touchId = null;
});

checkButtonEl.addEventListener("click", checkAnswer);
nextButtonEl.addEventListener("click", nextTask);
restartButtonEl.addEventListener("click", () => {
  ensureAudio();
  restartGame();
});

document.addEventListener("keydown", (event) => {
  ensureAudio();
  if (event.code === "Enter") checkAnswer();
  if (event.code === "KeyN") nextTask();
  if (event.code === "KeyR" && state.gameOver) restartGame();
});

function animate() {
  requestAnimationFrame(animate);

  const now = Date.now();
  if (state.simCase === "melt" && Math.random() > 0.7) {
    spawnParticle("spark");
    if (Math.random() > 0.82) spawnParticle("smoke");
  }
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.mesh.position.add(p.velocity);
    p.life -= 0.016;
    if (p.kind === "smoke") {
      p.mesh.material.opacity = Math.max(0, p.life * 0.55);
      p.mesh.scale.multiplyScalar(1.01);
    }
    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
    }
  }

  if (state.simCase === "ok") {
    breakerLever.rotation.z = THREE.MathUtils.lerp(breakerLever.rotation.z, 0.12, 0.08);
    cable.material.color.lerp(new THREE.Color(0x62bbff), 0.09);
    loadBox.material.color.lerp(new THREE.Color(0x74b29d), 0.08);
    okLight.intensity = Math.max(0.15, Math.sin(Date.now() * 0.008) * 0.35 + 0.45);
  } else if (state.simCase === "trip") {
    breakerLever.rotation.z = THREE.MathUtils.lerp(breakerLever.rotation.z, -0.62, 0.14);
    loadBox.material.color.lerp(new THREE.Color(0x8e6363), 0.08);
    warningLight.intensity = Math.max(0.25, Math.sin(Date.now() * 0.03) * 0.6 + 0.7);
  } else if (state.simCase === "melt") {
    breakerLever.rotation.z = THREE.MathUtils.lerp(breakerLever.rotation.z, 0.08, 0.08);
    cable.material.color.lerp(new THREE.Color(0xe67742), 0.1);
    cable.material.emissive.lerp(new THREE.Color(0x62220a), 0.08);
    cable.scale.y = THREE.MathUtils.lerp(cable.scale.y, 1.025, 0.07);
    warningLight.intensity = Math.max(0.4, Math.sin(Date.now() * 0.035) * 0.8 + 0.9);
  } else if (state.simCase === "wrong") {
    warningLight.intensity = Math.max(0.1, Math.sin(Date.now() * 0.02) * 0.3 + 0.25);
  } else {
    okLight.intensity = Math.max(0.03, Math.sin(now * 0.002) * 0.03 + 0.04);
  }

  const cx = Math.sin(state.cameraYaw) * Math.cos(state.cameraPitch) * state.cameraRadius;
  const cy = Math.sin(state.cameraPitch) * state.cameraRadius * 0.8 + 2.1;
  const cz = Math.cos(state.cameraYaw) * Math.cos(state.cameraPitch) * state.cameraRadius;
  camera.position.set(cx, cy, cz);
  camera.lookAt(0.6, 2.1, 0);

  renderer.render(scene, camera);
}

fillSelects();
restartGame();
animate();
