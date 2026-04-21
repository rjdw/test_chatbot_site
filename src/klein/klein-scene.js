import * as THREE from "three";
import {
  createKleinGeometry,
  kleinPoint,
  KLEIN_AA,
} from "./klein-geometry.js";

const PI2 = Math.PI * 2;

// The camera path we ride is parametric in v.  Because the Klein bottle
// identifies (u, v) ~ (-u, v + 2π), a curve at constant u is NOT closed:
// to smoothly close it and exploit the non-orientable twist we let
//     u(v) = RAIL_U · cos(v / 2)
// which is natively invariant under the identification above and only
// returns to its starting point after v travels 4π — exactly "two laps"
// through the bottle. That is the visual payoff of a Klein bottle: you
// exit where you expected the other side to be.
//
// We expose the full 4π journey across one page scroll so the user
// feels the loop close on them once.
const TOTAL_V = Math.PI * 4;

// Offset of the camera rail from the figure-eight self-intersection.
// Bigger value ⇒ camera rides deeper inside one of the two lobes.
const RAIL_U = 1.35;

export class KleinScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.progress = 0; // 0 → 1 over the journey
    this.displayProgress = 0;
    this.elapsed = 0;
    this._clock = new THREE.Clock();
    this._resizeRaf = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x05060a, 0);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05070e, 0.055);

    this.camera = new THREE.PerspectiveCamera(
      62,
      canvas.clientWidth / Math.max(canvas.clientHeight, 1),
      0.02,
      200
    );

    this._buildLights();
    this._buildKlein();
    this._buildWireframeShell();
    this._buildStarfield();
    this._buildAurora();
    this._buildRibbon();

    this.onResize();
    window.addEventListener("resize", this._onWindowResize, { passive: true });

    this._raf = 0;
    this._running = false;
  }

  _onWindowResize = () => {
    cancelAnimationFrame(this._resizeRaf);
    this._resizeRaf = requestAnimationFrame(() => this.onResize());
  };

  onResize() {
    const { canvas } = this;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
  }

  _buildLights() {
    const ambient = new THREE.AmbientLight(0x334466, 0.45);
    this.scene.add(ambient);

    const key = new THREE.PointLight(0x9ac6ff, 6.5, 18, 1.6);
    key.position.set(1.5, 1.2, 0.6);
    this.scene.add(key);
    this.keyLight = key;

    const warm = new THREE.PointLight(0xffb199, 5.0, 20, 1.6);
    warm.position.set(-1.4, -0.9, -0.4);
    this.scene.add(warm);
    this.warmLight = warm;

    const rim = new THREE.DirectionalLight(0xc8a6ff, 0.8);
    rim.position.set(-2, 3, 2);
    this.scene.add(rim);
  }

  _buildKlein() {
    const geom = createKleinGeometry({ uSegments: 160, vSegments: 360 });

    const uniforms = {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uColorA: { value: new THREE.Color("#5ec8ff") },
      uColorB: { value: new THREE.Color("#c77bff") },
      uColorC: { value: new THREE.Color("#ff7aa7") },
      uColorD: { value: new THREE.Color("#ffd27a") },
    };
    this.kleinUniforms = uniforms;

    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.35,
      roughness: 0.22,
      transmission: 0.18,
      thickness: 0.6,
      ior: 1.35,
      clearcoat: 1.0,
      clearcoatRoughness: 0.15,
      iridescence: 1.0,
      iridescenceIOR: 1.35,
      iridescenceThicknessRange: [120, 520],
      side: THREE.DoubleSide,
      envMapIntensity: 1.1,
      transparent: true,
      opacity: 0.88,
    });

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uProgress = uniforms.uProgress;
      shader.uniforms.uColorA = uniforms.uColorA;
      shader.uniforms.uColorB = uniforms.uColorB;
      shader.uniforms.uColorC = uniforms.uColorC;
      shader.uniforms.uColorD = uniforms.uColorD;

      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           varying vec2 vKleinUv;
           varying vec3 vKleinPos;`
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           vKleinUv = uv;
           vKleinPos = position;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           varying vec2 vKleinUv;
           varying vec3 vKleinPos;
           uniform float uTime;
           uniform float uProgress;
           uniform vec3 uColorA;
           uniform vec3 uColorB;
           uniform vec3 uColorC;
           uniform vec3 uColorD;`
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
           float ribbons = 0.5 + 0.5 * sin(vKleinUv.y * 40.0 + uTime * 0.35);
           ribbons = smoothstep(0.55, 0.98, ribbons);
           float band = fract(vKleinUv.y * 2.0 + uProgress);
           vec3 grad = mix(uColorA, uColorB, smoothstep(0.0, 0.5, band));
           grad = mix(grad, uColorC, smoothstep(0.5, 0.8, band));
           grad = mix(grad, uColorD, smoothstep(0.8, 1.0, band));
           diffuseColor.rgb = mix(diffuseColor.rgb * grad * 1.1, grad, 0.55);
           diffuseColor.rgb += ribbons * 0.12 * grad;`
        );
    };

    this.klein = new THREE.Mesh(geom, material);
    this.klein.renderOrder = 1;
    this.scene.add(this.klein);
  }

  _buildWireframeShell() {
    const geom = createKleinGeometry({ uSegments: 90, vSegments: 180 });
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(geom),
      new THREE.LineBasicMaterial({
        color: 0x9fc8ff,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      })
    );
    wire.scale.multiplyScalar(1.003);
    wire.renderOrder = 2;
    this.wire = wire;
    this.scene.add(wire);
  }

  _buildStarfield() {
    const count = 1400;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 18 + Math.random() * 28;
      const theta = Math.random() * PI2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      sizes[i] = 0.6 + Math.random() * 1.6;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float size;
        uniform float uTime;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float twinkle = 0.6 + 0.4 * sin(uTime * 1.8 + position.x * 3.1 + position.y * 1.7);
          gl_PointSize = size * twinkle * (220.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
          vAlpha = twinkle;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(0.85, 0.92, 1.0), a * vAlpha * 0.85);
        }
      `,
    });

    this.stars = new THREE.Points(geom, mat);
    this.scene.add(this.stars);
  }

  _buildAurora() {
    // A large sphere acting as a soft gradient backdrop, rendered behind
    // everything. Gives the scene atmosphere without needing HDR env maps.
    const geom = new THREE.SphereGeometry(60, 32, 32);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uTop: { value: new THREE.Color("#0a1030") },
        uMid: { value: new THREE.Color("#1a0f3c") },
        uBot: { value: new THREE.Color("#050712") },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        uniform float uTime;
        uniform float uProgress;
        uniform vec3 uTop;
        uniform vec3 uMid;
        uniform vec3 uBot;
        void main() {
          float h = normalize(vPos).y * 0.5 + 0.5;
          float swirl = 0.5 + 0.5 * sin(vPos.x * 0.12 + uTime * 0.2 + uProgress * 6.2831);
          vec3 col = mix(uBot, uMid, smoothstep(0.0, 0.55, h));
          col = mix(col, uTop, smoothstep(0.55, 1.0, h));
          col += 0.04 * swirl * vec3(0.6, 0.4, 1.0);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.aurora = new THREE.Mesh(geom, mat);
    this.scene.add(this.aurora);
  }

  _buildRibbon() {
    // Glowing "trail" ribbon that follows the camera path so the viewer
    // sees where they've been and where they are going.
    const samples = 600;
    const spine = new Float32Array(samples * 3);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < samples; i++) {
      const v = (i / (samples - 1)) * TOTAL_V;
      this._railPoint(v, tmp);
      spine[i * 3 + 0] = tmp.x;
      spine[i * 3 + 1] = tmp.y;
      spine[i * 3 + 2] = tmp.z;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(spine, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x8fd2ff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.ribbon = new THREE.Line(geom, mat);
    this.scene.add(this.ribbon);
  }

  _railPoint(v, out = new THREE.Vector3()) {
    // Smoothly-closed closed curve on the Klein bottle at u = RAIL_U·cos(v/2).
    // This respects the non-orientable identification so there is no kink
    // and the camera naturally swaps lobes of the figure-8 meridian as it
    // rounds the bottle's twist.
    const u = RAIL_U * Math.cos(v * 0.5);
    return kleinPoint(u, v, KLEIN_AA, out);
  }

  setProgress(p) {
    this.progress = THREE.MathUtils.clamp(p, 0, 1);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._clock.start();
    const loop = () => {
      if (!this._running) return;
      this._raf = requestAnimationFrame(loop);
      this._tick();
    };
    loop();
  }

  stop() {
    this._running = false;
    cancelAnimationFrame(this._raf);
  }

  _tick() {
    const dt = this._clock.getDelta();
    this.elapsed += dt;

    // Smooth the raw scroll value so that nudges of the wheel glide.
    const lerp = 1 - Math.pow(0.001, dt);
    this.displayProgress = THREE.MathUtils.lerp(
      this.displayProgress,
      this.progress,
      lerp
    );

    const p = this.displayProgress;

    // Camera moves along the rail over v ∈ [0, TOTAL_V].
    const v = p * TOTAL_V + 0.0001;
    const pos = this._railPoint(v);

    // Aim a bit further along the rail for a forward-looking camera.
    const ahead = this._railPoint(v + 0.045);
    const up = this._railPoint(v + 0.09).sub(pos).normalize();
    // A stable up: project ambient +Z onto the frame, then re-orthogonalize.
    const tangent = ahead.clone().sub(pos).normalize();
    const worldUp = new THREE.Vector3(0, 0, 1);
    const side = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
    const camUp = new THREE.Vector3().crossVectors(side, tangent).normalize();

    // Breathing oscillation so the camera feels alive even when scroll is still.
    const breathe = 0.04 * Math.sin(this.elapsed * 0.7);
    const look = ahead.clone().addScaledVector(camUp, breathe);
    this.camera.position.copy(pos);
    this.camera.up.copy(camUp);
    this.camera.lookAt(look);

    // Slow counter-rotation of the bottle gives "parallax inside the loop".
    this.klein.rotation.z = p * Math.PI * 0.5 + this.elapsed * 0.02;
    this.wire.rotation.copy(this.klein.rotation);

    // Lights swim with the camera so the interior is never pitch black.
    this.keyLight.position.copy(pos).addScaledVector(side, 1.2);
    this.warmLight.position.copy(pos).addScaledVector(side, -1.4);

    // Starfield drifts
    if (this.stars.material.uniforms) {
      this.stars.material.uniforms.uTime.value = this.elapsed;
    }
    this.stars.rotation.y = this.elapsed * 0.01;

    if (this.aurora.material.uniforms) {
      this.aurora.material.uniforms.uTime.value = this.elapsed;
      this.aurora.material.uniforms.uProgress.value = p;
    }

    this.kleinUniforms.uTime.value = this.elapsed;
    this.kleinUniforms.uProgress.value = p;

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stop();
    window.removeEventListener("resize", this._onWindowResize);
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
    this.renderer.dispose();
  }
}
