import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import './style.css';

const canvas = document.querySelector('#viewer');
const fileInput = document.querySelector('#file-input');
const uploadButton = document.querySelector('#upload-button');
const uploadCard = document.querySelector('#upload-card');
const resetButton = document.querySelector('#reset-button');
const zoomIn = document.querySelector('#zoom-in');
const zoomOut = document.querySelector('#zoom-out');
const zoomLabel = document.querySelector('#zoom-label');
const imageStatus = document.querySelector('#image-status');
const toast = document.querySelector('#toast');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1100);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;

const vrButton = VRButton.createButton(renderer);
vrButton.classList.add('vr-button');
document.querySelector('#app').append(vrButton);

const sphere = new THREE.Mesh(
  new THREE.SphereGeometry(100, 64, 40).scale(-1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0x172a2d })
);
scene.add(sphere);

let yaw = 0;
let pitch = 0;
let targetYaw = 0;
let targetPitch = 0;
let zoom = 75;
let isDragging = false;
let lastX = 0;
let lastY = 0;
let activeUrl = null;

function makeStarterPanorama() {
  const pano = document.createElement('canvas');
  pano.width = 1800;
  pano.height = 900;
  const context = pano.getContext('2d');
  const sky = context.createLinearGradient(0, 0, 0, pano.height);
  sky.addColorStop(0, '#162d35');
  sky.addColorStop(0.48, '#6c8f87');
  sky.addColorStop(0.5, '#d09d62');
  sky.addColorStop(1, '#14272b');
  context.fillStyle = sky;
  context.fillRect(0, 0, pano.width, pano.height);

  const sun = context.createRadialGradient(560, 320, 10, 560, 320, 230);
  sun.addColorStop(0, 'rgba(255, 223, 151, .95)');
  sun.addColorStop(0.28, 'rgba(240, 184, 105, .3)');
  sun.addColorStop(1, 'rgba(240, 184, 105, 0)');
  context.fillStyle = sun;
  context.fillRect(280, 40, 560, 560);

  context.fillStyle = '#19373a';
  context.beginPath();
  context.moveTo(0, 620);
  for (let x = 0; x <= pano.width; x += 90) {
    const height = 100 + Math.sin(x * 0.013) * 55 + Math.sin(x * 0.035) * 28;
    context.lineTo(x, 620 - height);
  }
  context.lineTo(pano.width, pano.height);
  context.lineTo(0, pano.height);
  context.closePath();
  context.fill();

  context.strokeStyle = 'rgba(244, 208, 145, .28)';
  context.lineWidth = 2;
  for (let x = 0; x < pano.width; x += 120) {
    context.beginPath();
    context.moveTo(x, 610);
    context.lineTo(x + pano.width * 0.1, pano.height);
    context.stroke();
  }
  return pano;
}

function applyTexture(texture, label) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  sphere.material.map = texture;
  sphere.material.color.set(0xffffff);
  sphere.material.needsUpdate = true;
  imageStatus.textContent = label;
}

applyTexture(new THREE.CanvasTexture(makeStarterPanorama()), 'Demo panorama');

function setZoom(nextZoom) {
  zoom = THREE.MathUtils.clamp(nextZoom, 45, 95);
  camera.fov = zoom;
  camera.updateProjectionMatrix();
  zoomLabel.textContent = `${Math.round((75 / zoom) * 100)}%`;
}

function resetView() {
  targetYaw = 0;
  targetPitch = 0;
  setZoom(75);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('visible'), 2800);
}

function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Please choose a JPG, PNG, or WEBP image.');
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    showToast('That image is larger than 50 MB.');
    return;
  }
  const url = URL.createObjectURL(file);
  new THREE.TextureLoader().load(url, (texture) => {
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    activeUrl = url;
    applyTexture(texture, file.name);
    resetView();
    showToast('Panorama loaded. Drag to explore.');
  }, undefined, () => {
    URL.revokeObjectURL(url);
    showToast('That image could not be loaded.');
  });
}

uploadButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (event) => loadFile(event.target.files[0]));
['dragenter', 'dragover'].forEach((eventName) => uploadCard.addEventListener(eventName, (event) => {
  event.preventDefault();
  uploadCard.classList.add('dragging');
}));
['dragleave', 'drop'].forEach((eventName) => uploadCard.addEventListener(eventName, (event) => {
  event.preventDefault();
  uploadCard.classList.remove('dragging');
}));
uploadCard.addEventListener('drop', (event) => loadFile(event.dataTransfer.files[0]));
resetButton.addEventListener('click', resetView);
zoomIn.addEventListener('click', () => setZoom(zoom - 5));
zoomOut.addEventListener('click', () => setZoom(zoom + 5));

canvas.addEventListener('pointerdown', (event) => {
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
canvas.addEventListener('pointercancel', () => { isDragging = false; });
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  setZoom(zoom + event.deltaY * 0.04);
}, { passive: false });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  if (!renderer.xr.isPresenting) {
    yaw += (targetYaw - yaw) * 0.1;
    pitch += (targetPitch - pitch) * 0.1;
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }
  renderer.render(scene, camera);
}

setZoom(75);
renderer.setAnimationLoop(animate);
