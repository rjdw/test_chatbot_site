// ─────────────────────────────────────────────────────────────────────
//  Interactive figure-8 Klein bottle scroll experience.
//
//  The camera travels along the bottle's v-parameter as the user scrolls,
//  creating a sensation of threading endlessly through a one-sided loop.
//  Parametric equations follow the "figure-8" Klein bottle popularised
//  by the 3D-XplorMath Consortium (virtualmathmuseum.org):
//
//    x = (a + cos(v/2)·sin(u) − sin(v/2)·sin(2u)) · cos(v)
//    y = (a + cos(v/2)·sin(u) − sin(v/2)·sin(2u)) · sin(v)
//    z =  sin(v/2)·sin(u) + cos(v/2)·sin(2u)
//
//  The surface is built as a single BufferGeometry and rendered with a
//  custom ShaderMaterial that paints an iridescent, holographic grid +
//  fresnel rim — giving the feel of a mathematical object without the
//  cost of a full physically-based pipeline.
// ─────────────────────────────────────────────────────────────────────

import * as THREE from "three";

const TAU = Math.PI * 2;
const AA = 2.4; // outer radius of the bottle's core loop

// ── Parametric surface builder ───────────────────────────────────────
function kleinPoint(u, v, out = new THREE.Vector3()) {
  const cv2 = Math.cos(v * 0.5);
  const sv2 = Math.sin(v * 0.5);
  const su = Math.sin(u);
  const s2u = Math.sin(2 * u);
  const r = AA + cv2 * su - sv2 * s2u;
  out.set(r * Math.cos(v), r * Math.sin(v), sv2 * su + cv2 * s2u);
  return out;
}

function buildKleinGeometry(uSteps, vSteps) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(uSteps * vSteps * 3);
  const uvs = new Float32Array(uSteps * vSteps * 2);
  const indices = [];

  const p = new THREE.Vector3();
  let pi = 0;
  let ui = 0;
  for (let j = 0; j < vSteps; j++) {
    const v = (j / (vSteps - 1)) * TAU;
    for (let i = 0; i < uSteps; i++) {
      const u = (i / (uSteps - 1)) * TAU;
      kleinPoint(u, v, p);
      positions[pi++] = p.x;
      positions[pi++] = p.y;
      positions[pi++] = p.z;
      uvs[ui++] = i / (uSteps - 1);
      uvs[ui++] = j / (vSteps - 1);
    }
  }

  for (let j = 0; j < vSteps - 1; j++) {
    for (let i = 0; i < uSteps - 1; i++) {
      const a = j * uSteps + i;
      const b = a + 1;
      const c = a + uSteps;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ── Holographic shader ───────────────────────────────────────────────
const kleinVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = -mv.xyz;
    vNormal  = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const kleinFragment = /* glsl */ `
  precision highp float;

  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec2 vUv;

  uniform float uTime;
  uniform float uProgress;   // 0..1 scroll
  uniform vec3  uColorA;     // deep base
  uniform vec3  uColorB;     // mid accent
  uniform vec3  uColorC;     // rim highlight
  uniform float uGridDensityU;
  uniform float uGridDensityV;
  uniform float uOpacity;

  // antialiased grid line
  float gridLine(float x, float density) {
    float g = fract(x * density);
    g = min(g, 1.0 - g);
    float w = fwidth(x * density);
    return 1.0 - smoothstep(0.0, w * 1.5, g);
  }

  void main() {
    vec3 V = normalize(vViewPos);
    vec3 N = normalize(vNormal);
    float fres = pow(1.0 - abs(dot(N, V)), 2.4);

    // Iridescent base — hue shifts along v (the big loop parameter)
    float hue = vUv.y + uTime * 0.015 + uProgress * 0.4;
    vec3 shimmer = 0.5 + 0.5 * cos(6.28318 * (hue + vec3(0.0, 0.33, 0.66)));
    vec3 base = mix(uColorA, uColorB, shimmer.b);

    // Parametric grid — sharper in u (the figure-8 direction), softer in v
    float gU = gridLine(vUv.x, uGridDensityU);
    float gV = gridLine(vUv.y, uGridDensityV);
    float grid = max(gU * 0.9, gV * 0.55);

    // Travelling pulse that races along v as the user scrolls
    float pulse = smoothstep(0.12, 0.0, abs(fract(vUv.y - uProgress) - 0.5));
    pulse = pow(pulse, 3.0) * 0.8;

    vec3 col = base * (0.25 + 0.55 * fres);
    col += grid * mix(uColorB, uColorC, 0.4) * (0.6 + 0.8 * fres);
    col += pulse * uColorC;
    col += fres * uColorC * 0.35;

    // Soft falloff near the seam so both u=0 and u=1 blend
    float seam = min(vUv.x, 1.0 - vUv.x);
    float seamFade = smoothstep(0.0, 0.03, seam);

    float alpha = uOpacity * (0.55 + 0.45 * fres) * seamFade;
    gl_FragColor = vec4(col, alpha);
  }
`;

// ── Public API ───────────────────────────────────────────────────────
export function initKleinScene(canvas, opts = {}) {
  const reducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = window.matchMedia("(max-width: 768px)").matches;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isMobile,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    isMobile ? 78 : 68,
    1,
    0.02,
    200
  );

  // Geometry density trades smoothness vs. perf.
  const uSteps = isMobile ? 56 : 96;
  const vSteps = isMobile ? 140 : 260;
  const geometry = buildKleinGeometry(uSteps, vSteps);

  const uniforms = {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uColorA: { value: new THREE.Color("#0b1026") },
    uColorB: { value: new THREE.Color("#5d7bff") },
    uColorC: { value: new THREE.Color("#b8ecff") },
    uGridDensityU: { value: 18.0 },
    uGridDensityV: { value: 64.0 },
    uOpacity: { value: 0.92 },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader: kleinVertex,
    fragmentShader: kleinFragment,
    uniforms,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const bottle = new THREE.Mesh(geometry, material);
  scene.add(bottle);

  // Second pass — a darker solid backing gives body behind the additive glow
  const backing = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0x060818,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
  );
  scene.add(backing);

  // Floating particles — "stardust" drifting through the loop
  const starCount = isMobile ? 600 : 1400;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 6 + Math.random() * 30;
    const theta = Math.random() * TAU;
    const phi = Math.acos(2 * Math.random() - 1);
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPositions[i * 3 + 2] = r * Math.cos(phi);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xc9d8ff,
    size: 0.02,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // ── Camera path ─────────────────────────────────────────────────
  // The camera travels inside the bottle by riding a point offset toward
  // one of the figure-8 lobes. The lobe peak lives at u = π/2; we pull
  // back from the peak toward the main loop centre so the camera sits
  // well inside the volume. Because of the Möbius twist, it takes two
  // full revolutions in v to return to the starting position — which is
  // exactly the "you travelled twice, but only passed every point once"
  // feeling we want from the scroll.
  const LOOPS = 2.0;
  const LOBE_U = Math.PI * 0.5;
  const INWARD = 0.55; // 0 = on the surface, 1 = on the central loop
  const tmp = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();
  const tmpUp = new THREE.Vector3();
  const tmpPeak = new THREE.Vector3();
  const tmpCentre = new THREE.Vector3();

  function insideLobe(v, out) {
    kleinPoint(LOBE_U, v, tmpPeak);
    tmpCentre.set(AA * Math.cos(v), AA * Math.sin(v), 0);
    out.copy(tmpCentre).lerp(tmpPeak, 1 - INWARD);
    return out;
  }

  function placeCamera(progress, wobble) {
    const v = progress * LOOPS * TAU;
    insideLobe(v, camera.position);
    // Look a little way ahead on the same curve for natural forward motion.
    insideLobe(v + 0.22, tmpLook);
    camera.lookAt(tmpLook);

    // Dynamic up-vector: roll the camera following v/2, the Möbius twist,
    // so the horizon smoothly inverts like in the reference animation.
    tmpUp.set(
      -Math.sin(v * 0.5) * Math.sin(v),
      Math.sin(v * 0.5) * Math.cos(v),
      Math.cos(v * 0.5)
    );
    camera.up.copy(tmpUp);

    // Idle breathing — a small radial bob so the scene feels alive even
    // when the user hasn't scrolled.
    camera.position.x += Math.cos(v) * wobble;
    camera.position.y += Math.sin(v) * wobble;
    camera.position.z += 0.5 * wobble;
  }

  // ── State ───────────────────────────────────────────────────────
  let scroll = 0;          // target scroll 0..1
  let scrollSmoothed = 0;  // eased towards scroll
  let running = true;
  let startTime = performance.now();

  // ── Resize ──────────────────────────────────────────────────────
  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  // ── Animation loop ──────────────────────────────────────────────
  function tick(now) {
    if (!running) return;
    const t = (now - startTime) / 1000;

    // Ease scroll with a critically-damped spring-ish filter
    const ease = reducedMotion ? 1 : 0.08;
    scrollSmoothed += (scroll - scrollSmoothed) * ease;

    uniforms.uTime.value = t;
    uniforms.uProgress.value = scrollSmoothed;

    const wobble = reducedMotion ? 0 : 0.06 * Math.sin(t * 0.6);
    placeCamera(scrollSmoothed, wobble);

    // Gentle overall rotation so even at scroll=0 the scene feels alive
    bottle.rotation.z = t * (reducedMotion ? 0.0 : 0.015);
    backing.rotation.z = bottle.rotation.z;
    stars.rotation.y = t * 0.01;

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    setScroll(t) {
      scroll = Math.max(0, Math.min(1, t));
    },
    resize,
    dispose() {
      running = false;
      window.removeEventListener("resize", resize);
      geometry.dispose();
      material.dispose();
      backing.material.dispose();
      starGeo.dispose();
      starMat.dispose();
      renderer.dispose();
    },
  };
}
