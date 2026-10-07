import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import './tnt.css';

const canvas = document.querySelector('#model-canvas');
const loader = document.querySelector('#model-loader');
const loaderTitle = document.querySelector('#model-loader-title');
const loaderDetail = document.querySelector('#model-loader-detail');
const entry = document.querySelector('#model-entry');
const entryTitle = document.querySelector('#model-entry-title');
const entryCopy = document.querySelector('#model-entry-copy');
const enterButton = document.querySelector('#model-enter');
const controlsHint = document.querySelector('#model-controls-hint');
const toast = document.querySelector('#model-toast');
const modelName = document.querySelector('#model-name');
const vrSlot = document.querySelector('#model-vr-slot');
const manifestUrl = new URL('../models.json', window.location.href);
const supportsDesktopControls = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const vrSupportCheck = navigator.xr
  ? navigator.xr.isSessionSupported('immersive-vr').catch(() => false)
  : Promise.resolve(false);

const GRAVITY = 24;
const MOVE_ACCELERATION = 28;
const SPAWN = new THREE.Vector3(0, 0, 8);
const PLAYER_RADIUS = 0.35;
const PLAYER_HEIGHT = 1.65;
const SNAP_ANGLE = THREE.MathUtils.degToRad(30);
const STICK_DEADZONE = 0.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101e28);
scene.fog = new THREE.Fog(0x101e28, 28, 60);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 100);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');

// In VR the headset drives the camera locally, so locomotion moves this parent instead.
const player = new THREE.Group();
player.add(camera);
scene.add(player);

const controls = new PointerLockControls(camera, document.body);
const worldOctree = new Octree();
const playerCollider = new Capsule(
  new THREE.Vector3(SPAWN.x, SPAWN.y + PLAYER_RADIUS, SPAWN.z),
  new THREE.Vector3(SPAWN.x, SPAWN.y + PLAYER_HEIGHT, SPAWN.z),
  PLAYER_RADIUS
);
const playerVelocity = new THREE.Vector3();
const movement = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const headBefore = new THREE.Vector3();
const headAfter = new THREE.Vector3();
const leftStick = new THREE.Vector2();
const clock = new THREE.Clock();
const pressedKeys = new Set();
let snapTurnReady = true;
let playerOnFloor = false;
let worldReady = false;
let fallLimit = -12;
let activeModel = null;

scene.add(new THREE.HemisphereLight(0xd8f7ff, 0x182028, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(6, 10, 8);
scene.add(keyLight);

function setLoading(visible, title, detail) {
  if (title) loaderTitle.textContent = title;
  if (detail) loaderDetail.textContent = detail;
  loader.classList.toggle('is-hidden', !visible);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('visible'), 3000);
}

function clearMovement() {
  pressedKeys.clear();
  playerVelocity.x = 0;
  playerVelocity.z = 0;
}

function resetPlayer() {
  const spawnNode = scene.getObjectByName('PlayerSpawn');
  const spawn = spawnNode ? spawnNode.getWorldPosition(new THREE.Vector3()) : SPAWN;
  playerCollider.start.set(spawn.x, spawn.y + PLAYER_RADIUS, spawn.z);
  playerCollider.end.set(spawn.x, spawn.y + PLAYER_HEIGHT, spawn.z);
  playerVelocity.set(0, 0, 0);
  if (renderer.xr.isPresenting) {
    player.position.set(spawn.x, spawn.y, spawn.z);
    player.rotation.set(0, Math.atan2(spawn.x, spawn.z), 0);
  } else {
    camera.position.copy(playerCollider.end);
    camera.lookAt(0, PLAYER_HEIGHT, 0);
  }
}

async function revealEntry() {
  const vrSupported = await vrSupportCheck;
  const desktopSupported = supportsDesktopControls && 'pointerLockElement' in document;
  setLoading(false);
  entry.classList.remove('is-hidden');
  enterButton.classList.toggle('is-hidden', !desktopSupported);

  if (vrSupported) {
    const vrButton = VRButton.createButton(renderer);
    vrButton.classList.add('vr-button');
    vrSlot.replaceChildren(vrButton);
    vrSlot.classList.remove('is-hidden');
    if (!desktopSupported) {
      entryTitle.textContent = 'Enter in VR';
      entryCopy.textContent = 'Use the left thumbstick to walk and the right thumbstick to turn.';
    }
  } else if (!desktopSupported) {
    entryTitle.textContent = 'Desktop controls required';
    entryCopy.textContent = window.isSecureContext
      ? 'Open this studio on a desktop or laptop with a mouse and keyboard, or in a VR headset browser.'
      : 'Open this studio over HTTPS to use VR, or on a desktop with a mouse and keyboard.';
  }
}

function playerCollisions() {
  const result = worldOctree.capsuleIntersect(playerCollider);
  playerOnFloor = false;
  if (!result) return;

  playerOnFloor = result.normal.y > 0;
  if (!playerOnFloor) {
    playerVelocity.addScaledVector(result.normal, -result.normal.dot(playerVelocity));
  }
  playerCollider.translate(result.normal.multiplyScalar(result.depth));
}

function applyMovement(delta) {
  movement.set(0, 0, 0);
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.crossVectors(forward, up).normalize();

  if (renderer.xr.isPresenting) {
    // Analog stick: partial deflection walks slower.
    movement.addScaledVector(forward, -leftStick.y).addScaledVector(right, leftStick.x);
    if (movement.lengthSq() > 1) movement.normalize();
  } else {
    if (pressedKeys.has('KeyW')) movement.add(forward);
    if (pressedKeys.has('KeyS')) movement.sub(forward);
    if (pressedKeys.has('KeyD')) movement.add(right);
    if (pressedKeys.has('KeyA')) movement.sub(right);
    if (movement.lengthSq() > 0) movement.normalize();
  }
  playerVelocity.addScaledVector(movement, MOVE_ACCELERATION * delta);
}

function applyDeadzone(value) {
  return Math.abs(value) < STICK_DEADZONE ? 0 : value;
}

function snapTurn(angle) {
  // Pivot around the head, not the play-area origin, so the view doesn't swing sideways.
  camera.getWorldPosition(headBefore);
  player.rotation.y += angle;
  camera.getWorldPosition(headAfter);
  playerCollider.translate(headBefore.sub(headAfter).setY(0));
}

function readControllers() {
  leftStick.set(0, 0);
  let turn = 0;
  for (const source of renderer.xr.getSession().inputSources) {
    const axes = source.gamepad?.axes;
    if (!axes || axes.length < 4) continue;
    if (source.handedness === 'left') leftStick.set(applyDeadzone(axes[2]), applyDeadzone(axes[3]));
    if (source.handedness === 'right') turn = axes[2];
  }

  if (Math.abs(turn) < 0.3) {
    snapTurnReady = true;
  } else if (snapTurnReady && Math.abs(turn) > 0.7) {
    snapTurnReady = false;
    snapTurn(-Math.sign(turn) * SNAP_ANGLE);
  }
}

function updatePlayer(delta) {
  if (!(controls.isLocked || renderer.xr.isPresenting) || !worldReady) return;

  applyMovement(delta);
  let damping = Math.exp(-8 * delta) - 1;
  if (!playerOnFloor) {
    playerVelocity.y -= GRAVITY * delta;
    damping *= 0.1;
  } else if (playerVelocity.y < 0) {
    playerVelocity.y = 0;
  }

  playerVelocity.addScaledVector(playerVelocity, damping);
  playerCollider.translate(playerVelocity.clone().multiplyScalar(delta));
  playerCollisions();
  if (renderer.xr.isPresenting) {
    player.position.set(playerCollider.start.x, playerCollider.start.y - PLAYER_RADIUS, playerCollider.start.z);
  } else {
    camera.position.copy(playerCollider.end);
  }

  if (playerCollider.end.y < fallLimit) {
    resetPlayer();
    showToast('Returned to the studio entrance.');
  }
}

async function saveModelPoster() {
  // The WebGL buffer is cleared after compositing, so render and copy it in the same task.
  renderer.render(scene, camera);
  const source = renderer.domElement;
  const poster = document.createElement('canvas');
  poster.width = 1280;
  poster.height = 960;
  const scale = Math.max(poster.width / source.width, poster.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  poster.getContext('2d').drawImage(source, (poster.width - width) / 2, (poster.height - height) / 2, width, height);

  try {
    const blob = await new Promise((resolve) => poster.toBlob(resolve, 'image/jpeg', 0.85));
    const response = await fetch(`/__model-poster?model=${encodeURIComponent(activeModel.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: blob,
    });
    if (!response.ok) throw new Error(`Thumbnail upload failed: ${response.status}`);
    activeModel.poster = true;
    showToast('Card thumbnail saved.');
  } catch (error) {
    console.error(error);
    showToast('The card thumbnail could not be saved.');
  }
}

function loadModel(url) {
  new GLTFLoader().load(
    url,
    (gltf) => {
      const model = gltf.scene;
      model.updateMatrixWorld(true);
      model.traverse((object) => {
        if (!object.isMesh) return;
        object.frustumCulled = true;
        if (object.material?.map) object.material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
      });
      scene.add(model);
      fallLimit = new THREE.Box3().setFromObject(model).min.y - 5;
      worldOctree.fromGraphNode(model);
      resetPlayer();
      worldReady = true;
      revealEntry();
      if (import.meta.env.DEV && !activeModel.poster) saveModelPoster();
    },
    (event) => {
      if (event.lengthComputable) {
        loaderDetail.textContent = `${Math.round((event.loaded / event.total) * 100)}% loaded`;
      }
    },
    (error) => {
      console.error(error);
      setLoading(true, 'Studio unavailable', 'The 3D environment could not be loaded. Return to the catalog and try again.');
      loader.classList.add('has-error');
    }
  );
}

enterButton.addEventListener('click', () => {
  if (worldReady && supportsDesktopControls) controls.lock();
});
controls.addEventListener('lock', () => {
  entry.classList.add('is-hidden');
  controlsHint.classList.remove('is-hidden');
});
controls.addEventListener('unlock', () => {
  clearMovement();
  controlsHint.classList.add('is-hidden');
  entryTitle.textContent = 'Studio paused';
  entryCopy.textContent = 'Continue when you are ready to explore.';
  enterButton.firstChild.textContent = 'Continue studio ';
  entry.classList.remove('is-hidden');
});
renderer.xr.addEventListener('sessionstart', () => {
  if (controls.isLocked) controls.unlock();
  clearMovement();
  camera.getWorldDirection(forward);
  player.rotation.set(0, Math.atan2(-forward.x, -forward.z), 0);
  player.position.set(playerCollider.start.x, playerCollider.start.y - PLAYER_RADIUS, playerCollider.start.z);
  entry.classList.add('is-hidden');
  controlsHint.classList.add('is-hidden');
});
renderer.xr.addEventListener('sessionend', () => {
  const yaw = player.rotation.y;
  player.position.set(0, 0, 0);
  player.rotation.set(0, 0, 0);
  leftStick.set(0, 0);
  clearMovement();
  camera.position.copy(playerCollider.end);
  camera.rotation.set(0, yaw, 0, 'YXZ');
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  entryTitle.textContent = 'Studio paused';
  entryCopy.textContent = 'Continue when you are ready to explore.';
  entry.classList.remove('is-hidden');
});
document.addEventListener('pointerlockerror', () => {
  showToast('Mouse capture is unavailable. Check your browser permissions and try again.');
});

window.addEventListener('keydown', (event) => {
  if (import.meta.env.DEV && controls.isLocked && event.code === 'KeyP') {
    saveModelPoster();
    return;
  }
  if (!controls.isLocked || !['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
  event.preventDefault();
  pressedKeys.add(event.code);
});
window.addEventListener('keyup', (event) => pressedKeys.delete(event.code));
window.addEventListener('blur', clearMovement);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  const frameDelta = Math.min(clock.getDelta(), 0.05);
  if (renderer.xr.isPresenting) readControllers();
  const steps = 3;
  for (let step = 0; step < steps; step += 1) updatePlayer(frameDelta / steps);
  renderer.render(scene, camera);
}

async function loadSelectedModel() {
  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) throw new Error(`Model catalog request failed: ${response.status}`);
    const models = await response.json();
    const modelId = new URLSearchParams(window.location.search).get('model');
    const model = models.find((item) => item.id === modelId) ?? models[0];
    if (!model) throw new Error('No 3D environments available.');
    activeModel = model;
    modelName.textContent = model.name;
    document.title = `${model.name} | TNT Sports`;
    loadModel(new URL(model.model, manifestUrl).href);
  } catch (error) {
    console.error(error);
    setLoading(true, 'Studio unavailable', 'Return to the catalog and try again.');
    loader.classList.add('has-error');
  }
}

loadSelectedModel();
renderer.setAnimationLoop(animate);
