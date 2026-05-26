import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.min.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let activeScene = null;
let bootQueued = false;

function color(hex) {
  return new THREE.Color(hex);
}

function buildLineGrid(size = 12, divisions = 16) {
  const points = [];
  const half = size / 2;
  for (let i = 0; i <= divisions; i += 1) {
    const p = -half + (size / divisions) * i;
    points.push(-half, 0, p, half, 0, p);
    points.push(p, 0, -half, p, 0, half);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x6d5221,
    transparent: true,
    opacity: 0.24
  });
  return new THREE.LineSegments(geometry, material);
}

function buildParticleField() {
  const count = 520;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const radius = 2.4 + Math.random() * 5.6;
    const angle = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = (Math.random() - 0.42) * 4.2;
    positions[i * 3 + 2] = Math.sin(angle) * radius - 1.2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xfacc15,
    size: 0.018,
    transparent: true,
    opacity: 0.72,
    depthWrite: false
  });
  return new THREE.Points(geometry, material);
}

function buildCandles() {
  const group = new THREE.Group();
  const green = new THREE.MeshStandardMaterial({
    color: 0x12d18e,
    emissive: 0x063322,
    metalness: 0.35,
    roughness: 0.42
  });
  const red = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0x3b0909,
    metalness: 0.25,
    roughness: 0.5
  });
  const wick = new THREE.MeshBasicMaterial({ color: 0xf8e7ad, transparent: true, opacity: 0.72 });

  for (let i = 0; i < 72; i += 1) {
    const up = i % 5 !== 0 && i % 7 !== 0;
    const height = 0.35 + Math.abs(Math.sin(i * 0.41)) * 1.15 + (i % 9) * 0.025;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, height, 0.075), up ? green : red);
    const wickMesh = new THREE.Mesh(new THREE.BoxGeometry(0.018, height + 0.34, 0.018), wick);
    const x = -4.9 + i * 0.145;
    const z = Math.sin(i * 0.25) * 0.55 + Math.cos(i * 0.11) * 0.36;
    const y = -0.82 + height / 2 + Math.sin(i * 0.22) * 0.1;
    body.position.set(x, y, z);
    wickMesh.position.set(x, y, z);
    body.userData.phase = i * 0.19;
    group.add(wickMesh, body);
  }
  group.rotation.set(-0.08, -0.42, 0.04);
  return group;
}

function buildRings() {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({
    color: 0xf2b23b,
    emissive: 0x5a3605,
    metalness: 0.88,
    roughness: 0.18
  });
  const darkGold = new THREE.MeshStandardMaterial({
    color: 0x8c6420,
    emissive: 0x2d1b02,
    metalness: 0.92,
    roughness: 0.23,
    transparent: true,
    opacity: 0.72
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.38, 0.035, 18, 120), gold);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.018, 12, 96), darkGold);
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.7, 0.018, 140, 8, 2, 3), darkGold);
  ring.rotation.set(1.14, 0.28, -0.18);
  inner.rotation.set(0.92, -0.52, 0.44);
  knot.rotation.set(0.6, 0.2, 0.2);
  group.add(ring, inner, knot);
  group.position.set(2.15, 0.62, -0.48);
  return group;
}

function buildScannerPlanes() {
  const group = new THREE.Group();
  const materials = [
    new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.14, side: THREE.DoubleSide }),
    new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.09, side: THREE.DoubleSide })
  ];
  for (let i = 0; i < 8; i += 1) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.6 - i * 0.05, 0.18), materials[i % materials.length]);
    plane.position.set(1.15 + Math.sin(i) * 0.3, -1.08 + i * 0.26, -0.8 - i * 0.04);
    plane.rotation.set(-0.3, -0.55, 0.02);
    group.add(plane);
  }
  return group;
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
}

function initHero3D() {
  const stage = document.getElementById("market3dStage");
  if (!stage || stage.dataset.ready === "true" || reduceMotion.matches) return;
  if (activeScene) activeScene.destroy();

  const hero = stage.closest(".hero");
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setClearColor(0x000000, 0);
  stage.appendChild(renderer.domElement);
  stage.dataset.ready = "true";
  if (hero) hero.classList.add("three-ready");

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050505, 0.055);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  camera.position.set(0.25, 0.45, 7.2);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xf8e7b0, 0.45));
  const key = new THREE.PointLight(0xfacc15, 2.8, 14);
  key.position.set(2.2, 2.4, 3.6);
  scene.add(key);
  const greenLight = new THREE.PointLight(0x10b981, 1.1, 9);
  greenLight.position.set(-2.8, -0.2, 2.8);
  scene.add(greenLight);

  const rig = new THREE.Group();
  const grid = buildLineGrid();
  grid.position.set(0, -1.34, -0.8);
  grid.rotation.x = -0.25;
  const particles = buildParticleField();
  const candles = buildCandles();
  const rings = buildRings();
  const planes = buildScannerPlanes();
  rig.add(grid, particles, candles, rings, planes);
  scene.add(rig);

  const pointer = { x: 0, y: 0 };
  const onPointerMove = (event) => {
    const rect = stage.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
    pointer.y = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
  };

  const resize = () => {
    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  let frame = 0;
  let raf = 0;
  const animate = (time) => {
    if (!stage.isConnected) {
      destroy();
      return;
    }
    frame += 1;
    const t = time * 0.001;
    rig.rotation.y = Math.sin(t * 0.22) * 0.11 + pointer.x * 0.055;
    rig.rotation.x = -0.035 + pointer.y * -0.025;
    rings.rotation.y = t * 0.32;
    rings.rotation.z = Math.sin(t * 0.4) * 0.12;
    particles.rotation.y = t * 0.045;
    candles.children.forEach((child) => {
      if (child.userData.phase !== undefined) {
        child.scale.y = 1 + Math.sin(t * 1.8 + child.userData.phase) * 0.028;
      }
    });
    renderer.render(scene, camera);
    raf = requestAnimationFrame(animate);
  };

  function destroy() {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    stage.removeEventListener("pointermove", onPointerMove);
    disposeObject(scene);
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    if (activeScene?.stage === stage) activeScene = null;
  }

  window.addEventListener("resize", resize);
  stage.addEventListener("pointermove", onPointerMove);
  resize();
  raf = requestAnimationFrame(animate);
  activeScene = { stage, destroy };
}

function queueBoot() {
  if (bootQueued) return;
  bootQueued = true;
  requestAnimationFrame(() => {
    bootQueued = false;
    initHero3D();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", queueBoot, { once: true });
} else {
  queueBoot();
}

new MutationObserver(queueBoot).observe(document.body, { childList: true, subtree: true });
