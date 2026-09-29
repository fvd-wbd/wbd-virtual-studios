import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import './tnt.css';

const canvas = document.querySelector('#viewer');
const resetButton = document.querySelector('#reset-button');
const zoomIn = document.querySelector('#zoom-in');
const zoomOut = document.querySelector('#zoom-out');
const zoomLabel = document.querySelector('#zoom-label');
const motionButton = document.querySelector('#motion-button');
const imageStatus = document.querySelector('#image-status');
const loader = document.querySelector('#loader');
const loaderTitle = document.querySelector('#loader-title');
const loaderDetail = document.querySelector('#loader-detail');
const toast = document.querySelector('#toast');
const mode = document.body.dataset.mode;
const manifestUrl = new URL(/* @vite-ignore */ '../studios.json', import.meta.url);
const studioSwitcher = document.querySelector('#studio-switcher');
const previousStudioButton = document.querySelector('#previous-studio');
const nextStudioButton = document.querySelector('#next-studio');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101e28);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1100);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;

const sphere = new THREE.Mesh(
  new THREE.SphereGeometry(100, 64, 40).scale(-1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0x101e28 })
);
scene.add(sphere);

const vrButton = VRButton.createButton(renderer);
vrButton.classList.add('vr-button');
document.querySelector('#vr-slot').append(vrButton);

let yaw = 0;
let pitch = 0;
let targetYaw = 0;
let targetPitch = 0;
let zoom = 75;
let isDragging = false;
let lastX = 0;
let lastY = 0;
let activeObjectUrl = null;
let studios = [];
let currentStudioIndex = -1;
let motionEnabled = false;
let deviceQuaternion = null;
let motionOrigin = null;

const deviceEuler = new THREE.Euler();
const screenTransform = new THREE.Quaternion();
const deviceTransform = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const screenAxis = new THREE.Vector3(0, 0, 1);

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

function setZoom(nextZoom) {
  zoom = THREE.MathUtils.clamp(nextZoom, 45, 95);
  camera.fov = zoom;
  camera.updateProjectionMatrix();
  zoomLabel.textContent = `${Math.round((75 / zoom) * 100)}%`;
}

function resetView() {
  if (motionEnabled) {
    motionOrigin = deviceQuaternion?.clone().invert() ?? null;
  }
  targetYaw = 0;
  targetPitch = 0;
  setZoom(75);
}

function getScreenOrientation() {
  return THREE.MathUtils.degToRad(window.screen.orientation?.angle ?? window.orientation ?? 0);
}

function handleDeviceOrientation(event) {
  if (event.alpha === null || event.beta === null || event.gamma === null) return;

  deviceEuler.set(
    THREE.MathUtils.degToRad(event.beta),
    THREE.MathUtils.degToRad(event.alpha),
    -THREE.MathUtils.degToRad(event.gamma),
    'YXZ'
  );
  screenTransform.setFromAxisAngle(screenAxis, -getScreenOrientation());
  deviceQuaternion = new THREE.Quaternion()
    .setFromEuler(deviceEuler)
    .multiply(deviceTransform)
    .multiply(screenTransform);

  if (!motionOrigin) motionOrigin = deviceQuaternion.clone().invert();
}

function setMotionEnabled(enabled) {
  motionEnabled = enabled;
  motionOrigin = null;
  motionButton.setAttribute('aria-pressed', String(enabled));
  motionButton.classList.toggle('active', enabled);
  motionButton.lastChild.textContent = enabled ? ' Motion on' : ' Phone motion';
  document.querySelector('#viewer-hint span:last-child').textContent = enabled
    ? 'Rotate your phone to look around'
    : 'Drag to look around';

  if (enabled) {
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    showToast('Motion enabled. Rotate your phone to look around.');
  } else {
    window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    showToast('Motion disabled. Drag to look around.');
  }
}

async function toggleMotion() {
  if (motionEnabled) {
    setMotionEnabled(false);
    return;
  }

  if (typeof DeviceOrientationEvent === 'undefined') {
    showToast('Motion controls are not supported on this device.');
    return;
  }

  try {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') throw new Error('Motion permission was denied.');
    }
    setMotionEnabled(true);
  } catch (error) {
    console.error(error);
    showToast('Allow motion access in your browser settings to use this mode.');
  }
}

function revealViewer() {
  document.querySelector('#upload-panel')?.classList.add('is-hidden');
  document.querySelector('#viewer-controls')?.classList.remove('is-hidden');
  document.querySelector('#viewer-hint')?.classList.remove('is-hidden');
  document.body.classList.add('has-panorama');
}

function applyTexture(texture, label) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  sphere.material.map?.dispose();
  sphere.material.map = texture;
  sphere.material.color.set(0xffffff);
  sphere.material.needsUpdate = true;
  imageStatus.textContent = label;
  document.title = `${label} | TNT Sports`;
  resetView();
  revealViewer();
  setLoading(false);
}

function loadTexture(url, label, isObjectUrl = false) {
  setLoading(true, mode === 'upload' ? 'Building preview' : 'Entering studio', label);
  new THREE.TextureLoader().load(
    url,
    (texture) => {
      if (isObjectUrl && activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
      if (isObjectUrl) activeObjectUrl = url;
      applyTexture(texture, label);
    },
    (event) => {
      if (event.lengthComputable) loaderDetail.textContent = `${Math.round((event.loaded / event.total) * 100)}% loaded`;
    },
    () => {
      if (isObjectUrl) URL.revokeObjectURL(url);
      setLoading(false);
      showToast('This panorama could not be loaded.');
    }
  );
}

function updateStudioSwitcher() {
  if (!studioSwitcher || studios.length < 2) {
    studioSwitcher?.classList.add('is-hidden');
    return;
  }

  const previousIndex = (currentStudioIndex - 1 + studios.length) % studios.length;
  const nextIndex = (currentStudioIndex + 1) % studios.length;
  document.querySelector('#previous-studio-name').textContent = studios[previousIndex].name;
  document.querySelector('#next-studio-name').textContent = studios[nextIndex].name;
  previousStudioButton.dataset.index = previousIndex;
  nextStudioButton.dataset.index = nextIndex;
}

function navigateToStudio(index) {
  const studio = studios[index];
  if (!studio) return;
  const viewerUrl = new URL('viewer/', manifestUrl);
  viewerUrl.searchParams.set('studio', studio.id);
  window.location.assign(viewerUrl);
}

async function loadSelectedStudio() {
  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
    studios = await response.json();
    const studioId = new URLSearchParams(window.location.search).get('studio');
    currentStudioIndex = studios.findIndex((item) => item.id === studioId);
    if (currentStudioIndex === -1) {
      window.location.replace(new URL('./', manifestUrl));
      return;
    }
    const studio = studios[currentStudioIndex];
    updateStudioSwitcher();
    loadTexture(new URL(studio.image, manifestUrl).href, studio.name);
  } catch (error) {
    console.error(error);
    setLoading(true, 'Studio unavailable', 'Return to the catalog and try again.');
    loader.classList.add('has-error');
  }
}

function loadLocalFile(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
    showToast('Choose a JPG, PNG, WEBP, or AVIF image.');
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    showToast('Choose an image smaller than 50 MB.');
    return;
  }
  loadTexture(URL.createObjectURL(file), file.name, true);
}

resetButton.addEventListener('click', resetView);
motionButton.addEventListener('click', toggleMotion);
zoomIn.addEventListener('click', () => setZoom(zoom - 5));
zoomOut.addEventListener('click', () => setZoom(zoom + 5));

canvas.addEventListener('pointerdown', (event) => {
  if (!sphere.material.map || motionEnabled) return;
  isDragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add('is-dragging');
});
canvas.addEventListener('pointermove', (event) => {
  if (!isDragging) return;
  targetYaw -= (event.clientX - lastX) * 0.004;
  targetPitch -= (event.clientY - lastY) * 0.003;
  targetPitch = THREE.MathUtils.clamp(targetPitch, -1.35, 1.35);
  lastX = event.clientX;
  lastY = event.clientY;
});
canvas.addEventListener('pointerup', () => {
  isDragging = false;
  canvas.classList.remove('is-dragging');
});
canvas.addEventListener('pointercancel', () => {
  isDragging = false;
  canvas.classList.remove('is-dragging');
});
canvas.addEventListener('wheel', (event) => {
  if (!sphere.material.map) return;
  event.preventDefault();
  setZoom(zoom + event.deltaY * 0.04);
}, { passive: false });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener('beforeunload', () => {
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
});

function animate() {
  if (!renderer.xr.isPresenting) {
    if (motionEnabled && deviceQuaternion && motionOrigin) {
      camera.quaternion.copy(motionOrigin).multiply(deviceQuaternion);
    } else if (!motionEnabled) {
      yaw += (targetYaw - yaw) * 0.1;
      pitch += (targetPitch - pitch) * 0.1;
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    }
  }
  renderer.render(scene, camera);
}

if (mode === 'upload') {
  const fileInput = document.querySelector('#file-input');
  const uploadButton = document.querySelector('#upload-button');
  const dropZone = document.querySelector('#drop-zone');
  uploadButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (event) => loadLocalFile(event.target.files[0]));
  window.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('visible');
  });
  window.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget) dropZone.classList.remove('visible');
  });
  window.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('visible');
    loadLocalFile(event.dataTransfer.files[0]);
  });
} else {
  previousStudioButton.addEventListener('click', () => navigateToStudio(Number(previousStudioButton.dataset.index)));
  nextStudioButton.addEventListener('click', () => navigateToStudio(Number(nextStudioButton.dataset.index)));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') navigateToStudio(Number(previousStudioButton.dataset.index));
    if (event.key === 'ArrowRight') navigateToStudio(Number(nextStudioButton.dataset.index));
  });
  loadSelectedStudio();
}

setZoom(75);
renderer.setAnimationLoop(animate);
