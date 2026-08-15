// Self-hosted (three r164, MIT). Loading this from a public CDN made the hero
// dependent on a third party's uptime and reachability — it silently rendered
// nothing whenever that request failed, and some networks block public CDNs
// outright. Served from our own origin it also skips an extra DNS and TLS
// handshake. Update by replacing public/vendor/three.module.min.js.
import * as THREE from "/vendor/three.module.min.js";

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
  const count = 850;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const radius = 2.0 + Math.random() * 6.5;
    const angle = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = (Math.random() - 0.42) * 5.2;
    positions[i * 3 + 2] = Math.sin(angle) * radius - 1.2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xD8C9A6,
    size: 0.021,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  });
  return new THREE.Points(geometry, material);
}

/**
 * The colonnade. Each column's shaft height is one bar of the price series, so
 * the architecture is not a backdrop standing behind the data — it IS the data.
 * That is the whole idea: a temple front whose columns rise and fall because
 * the market did.
 *
 * A rising bar is carved travertine catching the light; a falling bar is
 * shadowed and shorter. Colour does not carry the direction on its own —
 * height does — so the meaning survives for a colour-blind viewer, which a
 * green/red candle field never manages.
 */
function buildColonnade() {
  const group = new THREE.Group();

  const travertine = new THREE.MeshStandardMaterial({
    color: 0xE8DFCE,
    roughness: 0.82,
    metalness: 0.04
  });
  const shadowed = new THREE.MeshStandardMaterial({
    color: 0x9A8F7B,
    roughness: 0.9,
    metalness: 0.03
  });
  const gilt = new THREE.MeshStandardMaterial({
    color: 0xC9A227,
    emissive: 0x3A2E08,
    metalness: 0.95,
    roughness: 0.22
  });

  const COUNT = 34;
  // One deterministic series, so the skyline is composed rather than random —
  // a trend with a correction in it, which reads as a market.
  const series = [];
  for (let i = 0; i < COUNT; i += 1) {
    const t = i / (COUNT - 1);
    const trend = Math.pow(t, 0.85) * 1.5;
    const swing = Math.sin(i * 0.55) * 0.26 + Math.sin(i * 0.21 + 1.3) * 0.34;
    const correction = t > 0.62 && t < 0.78 ? -0.55 : 0;
    series.push(Math.max(0.42, 0.62 + trend + swing + correction));
  }

  // Shared geometry across every column: 34 shafts on one buffer rather than
  // 34 allocations, which keeps the draw cost flat on a phone.
  const shaftGeo = new THREE.CylinderGeometry(0.066, 0.076, 1, 14, 1, false);
  const drumGeo = new THREE.BoxGeometry(0.2, 0.05, 0.2);
  const abacusGeo = new THREE.BoxGeometry(0.185, 0.042, 0.185);

  for (let i = 0; i < COUNT; i += 1) {
    const h = series[i];
    const rising = i === 0 ? true : series[i] >= series[i - 1];
    const stoneMat = rising ? travertine : shadowed;

    const x = -4.6 + i * 0.285;
    const z = Math.sin(i * 0.18) * 0.28;

    const shaft = new THREE.Mesh(shaftGeo, stoneMat);
    shaft.scale.y = h;
    shaft.position.set(x, -1.05 + h / 2, z);

    // Capital and base: the two details that separate a column from a bar.
    const capital = new THREE.Mesh(abacusGeo, rising ? gilt : stoneMat);
    capital.position.set(x, -1.05 + h + 0.02, z);

    const base = new THREE.Mesh(drumGeo, stoneMat);
    base.position.set(x, -1.05, z);

    shaft.userData.phase = i * 0.27;
    shaft.userData.baseHeight = h;
    group.add(shaft, capital, base);
  }

  // Stylobate — the platform the colonnade stands on. Without it the columns
  // float and the whole thing stops reading as architecture.
  const stylobate = new THREE.Mesh(
    new THREE.BoxGeometry(10.4, 0.16, 1.15),
    new THREE.MeshStandardMaterial({ color: 0x2A251C, roughness: 0.95, metalness: 0.02 })
  );
  stylobate.position.set(0, -1.13, 0);
  group.add(stylobate);

  group.rotation.set(-0.05, -0.34, 0.02);
  return group;
}

function buildRings() {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({
    color: 0xC9A227,
    emissive: 0x4A3A0C,
    metalness: 0.95,
    roughness: 0.15
  });
  const emerald = new THREE.MeshStandardMaterial({
    color: 0x5FA88A,
    emissive: 0x123A2C,
    metalness: 0.9,
    roughness: 0.2,
    transparent: true,
    opacity: 0.85
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.04, 24, 120), gold);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.025, 16, 96), emerald);
  const knot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), gold);
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
    new THREE.MeshBasicMaterial({ color: 0xE4C76A, transparent: true, opacity: 0.075, side: THREE.DoubleSide }),
    new THREE.MeshBasicMaterial({ color: 0xC9A227, transparent: true, opacity: 0.06, side: THREE.DoubleSide }),
    new THREE.MeshBasicMaterial({ color: 0x9A8F7B, transparent: true, opacity: 0.05, side: THREE.DoubleSide })
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
  scene.fog = new THREE.FogExp2(0x0B0A08, 0.05);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  camera.position.set(0.25, 0.45, 7.2);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xF0E4C8, 0.5));
  const key = new THREE.PointLight(0xFFE9B0, 3.1, 16);
  key.position.set(2.2, 2.4, 3.6);
  scene.add(key);
  const greenLight = new THREE.PointLight(0x7FA8C4, 0.75, 10);
  greenLight.position.set(-2.8, -0.2, 2.8);
  scene.add(greenLight);

  const rig = new THREE.Group();
  const grid = buildLineGrid();
  grid.position.set(0, -1.34, -0.8);
  grid.rotation.x = -0.25;
  const particles = buildParticleField();
  const colonnade = buildColonnade();
  const rings = buildRings();
  const planes = buildScannerPlanes();
  rig.add(grid, particles, colonnade, rings, planes);
  scene.add(rig);

  const pointer = { x: 0, y: 0 };
  // Eased toward the raw pointer each frame so the rig glides instead of
  // snapping — the difference between "interactive" and "expensive".
  const smoothed = { x: 0, y: 0 };
  const onPointerMove = (event) => {
    const rect = stage.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
    pointer.y = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
  };

  // Hero drifts and recedes as the page scrolls away from it.
  let scrollDepth = 0;
  let onStage = true;
  const onScroll = () => {
    const rect = stage.getBoundingClientRect();
    scrollDepth = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height)));
    // Once the hero is fully past, there is nothing to look at. Skipping the
    // draw call frees the GPU for the rest of the page and stops a decorative
    // canvas from draining a phone battery while someone reads pricing.
    onStage = rect.bottom > 0 && rect.top < window.innerHeight;
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
    // Keep the rAF loop alive (browsers already throttle it when the tab is
    // hidden) but skip the simulation and draw while nothing is on screen.
    if (!onStage || document.hidden) {
      raf = requestAnimationFrame(animate);
      return;
    }

    frame += 1;
    const t = time * 0.001;

    smoothed.x += (pointer.x - smoothed.x) * 0.045;
    smoothed.y += (pointer.y - smoothed.y) * 0.045;

    rig.rotation.y = Math.sin(t * 0.22) * 0.11 + smoothed.x * 0.14;
    rig.rotation.x = -0.035 + smoothed.y * -0.075;
    // Sink and fade the rig as the hero scrolls out, so it hands off to the
    // content below instead of competing with it.
    rig.position.y = scrollDepth * -1.5;
    rig.position.z = scrollDepth * -2.2;

    rings.rotation.y = t * 0.8;
    rings.rotation.z = Math.sin(t * 0.4) * 0.12;
    particles.rotation.y = t * 0.15;

    // Breathing key light keeps the metals from reading as flat stills.
    key.intensity = 2.4 + Math.sin(t * 0.9) * 0.55;
    greenLight.intensity = 0.95 + Math.sin(t * 0.6 + 1.4) * 0.35;

    // Stone does not pulse. The columns hold their height; only the light
    // moving across them changes, which is what makes them read as carved
    // rather than as glowing bars.
    colonnade.children.forEach((child) => {
      if (child.userData.baseHeight !== undefined) {
        child.scale.y = child.userData.baseHeight * (1 + Math.sin(t * 0.5 + child.userData.phase) * 0.004);
      }
    });

    camera.position.z = 7.2 + scrollDepth * 1.1;
    camera.lookAt(0, rig.position.y * 0.4, 0);

    renderer.render(scene, camera);
    raf = requestAnimationFrame(animate);
  };

  function destroy() {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    window.removeEventListener("scroll", onScroll);
    stage.removeEventListener("pointermove", onPointerMove);
    disposeObject(scene);
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    if (activeScene?.stage === stage) activeScene = null;
  }

  window.addEventListener("resize", resize);
  window.addEventListener("scroll", onScroll, { passive: true });
  stage.addEventListener("pointermove", onPointerMove);
  resize();
  onScroll();
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

// render() replaces #app's children wholesale, so a non-recursive childList
// watch on #app catches every route change without walking the whole document.
new MutationObserver(queueBoot).observe(document.getElementById("app") || document.body, { childList: true });
