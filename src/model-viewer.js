import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';
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
const modelUrl = new URL('../models/virtual_studio.glb', window.location.href);
const supportsDesktopControls = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const GRAVITY = 24;
const MOVE_ACCELERATION = 28;
const SPAWN = new THREE.Vector3(0, 0, 8);
const PLAYER_RADIUS = 0.35;
const PLAYER_HEIGHT = 1.65;

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
const clock = new THREE.Clock();
const pressedKeys = new Set();
let playerOnFloor = false;
let worldReady = false;
let fallLimit = -12;

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
  camera.position.copy(playerCollider.end);
  camera.lookAt(0, PLAYER_HEIGHT, 0);
}

function revealEntry() {
  setLoading(false);
  entry.classList.remove('is-hidden');
  if (!supportsDesktopControls || !('pointerLockElement' in document)) {
    entryTitle.textContent = 'Desktop controls required';
    entryCopy.textContent = 'Open this studio on a desktop or laptop with a mouse and keyboard.';
    enterButton.classList.add('is-hidden');
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

  if (pressedKeys.has('KeyW')) movement.add(forward);
  if (pressedKeys.has('KeyS')) movement.sub(forward);
  if (pressedKeys.has('KeyD')) movement.add(right);
  if (pressedKeys.has('KeyA')) movement.sub(right);
  if (movement.lengthSq() > 0) {
    movement.normalize();
    playerVelocity.addScaledVector(movement, MOVE_ACCELERATION * delta);
  }
}

function updatePlayer(delta) {
  if (!controls.isLocked || !worldReady) return;

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
  camera.position.copy(playerCollider.end);

  if (camera.position.y < fallLimit) {
    resetPlayer();
    showToast('Returned to the studio entrance.');
  }
}

function loadModel() {
  new GLTFLoader().load(
    modelUrl.href,
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
document.addEventListener('pointerlockerror', () => {
  showToast('Mouse capture is unavailable. Check your browser permissions and try again.');
});

window.addEventListener('keydown', (event) => {
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
  const steps = 3;
  for (let step = 0; step < steps; step += 1) updatePlayer(frameDelta / steps);
  renderer.render(scene, camera);
}

loadModel();
renderer.setAnimationLoop(animate);
