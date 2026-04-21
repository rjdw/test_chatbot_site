import * as THREE from "three";
import {
  createKleinGeometry,
  kleinPoint,
  KLEIN_AA,
} from "./klein-geometry.js";

const PI2 = Math.PI * 2;

// Camera is fixed. No movement unless the user scrolls. The bottle
// itself rotates/tilts/deforms as a function of scroll progress, which
// keeps the horizon perfectly level and prevents the disorienting pitch
// the fly-through camera had. Placed along +z looking at the origin so
// the bottle's "donut hole" (the center of its ring) lands dead center
// in the viewport.
const CAMERA_POSITION = new THREE.Vector3(0, 0, 8.2);
const CAMERA_TARGET = new THREE.Vector3(0, 0, 0);

export class KleinScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.progress = 0; // 0 → 1 over the journey
    this.displayProgress = 0;
    this._lastRenderedProgress = -1;
    this._needsRender = true;
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
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setClearColor(0x05060a, 0);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      38,
      canvas.clientWidth / Math.max(canvas.clientHeight, 1),
      0.1,
      200
    );
    this.camera.position.copy(CAMERA_POSITION);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(CAMERA_TARGET);

    // Hold the bottle in a pivot group so rotation around its own center
    // is independent of the world origin.
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    this._buildLights();
    this._buildKlein();
    this._buildWireframeShell();
    this._buildStarfield();
    this._buildAurora();

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
    this._needsRender = true;
  }

  _buildLights() {
    const ambient = new THREE.AmbientLight(0x334466, 0.55);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0x9ac6ff, 1.6);
    key.position.set(3, 4, 5);
    this.scene.add(key);

    const warm = new THREE.DirectionalLight(0xffb199, 1.1);
    warm.position.set(-4, -2, 3);
    this.scene.add(warm);

    const rim = new THREE.DirectionalLight(0xc8a6ff, 0.9);
    rim.position.set(-2, 3, -4);
    this.scene.add(rim);
  }

  _buildKlein() {
    const geom = createKleinGeometry({ uSegments: 180, vSegments: 400 });

    // The bottle's v-parameter already sweeps around the z-axis, so at
    // rest the ring sits in the XY plane with its "hole" facing the
    // camera at +z. A small, constant tilt gives a 3/4 view that shows
    // both the ring and the figure-8 meridian.
    geom.rotateX(-0.35);

    const uniforms = {
      uProgress: { value: 0 },
      uDeform: { value: 0 },
      uColorA: { value: new THREE.Color("#5ec8ff") },
      uColorB: { value: new THREE.Color("#c77bff") },
      uColorC: { value: new THREE.Color("#ff7aa7") },
      uColorD: { value: new THREE.Color("#ffd27a") },
    };
    this.kleinUniforms = uniforms;

    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.3,
      roughness: 0.25,
      transmission: 0.15,
      thickness: 0.55,
      ior: 1.35,
      clearcoat: 1.0,
      clearcoatRoughness: 0.15,
      iridescence: 1.0,
      iridescenceIOR: 1.35,
      iridescenceThicknessRange: [120, 520],
      side: THREE.DoubleSide,
      envMapIntensity: 1.1,
      transparent: true,
      opacity: 0.92,
    });

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uProgress = uniforms.uProgress;
      shader.uniforms.uDeform = uniforms.uDeform;
      shader.uniforms.uColorA = uniforms.uColorA;
      shader.uniforms.uColorB = uniforms.uColorB;
      shader.uniforms.uColorC = uniforms.uColorC;
      shader.uniforms.uColorD = uniforms.uColorD;

      // Vertex deformation. Two things happen as the user scrolls:
      //   1) A radial "pulse" travels around the ring (v direction),
      //      swelling and pinching the tube — this is the convolution
      //      the user asked for.
      //   2) A small progress-driven torsion along the meridian (u)
      //      bends the figure-eight in its plane, reinforcing the
      //      non-orientable twist.
      // All effects are strictly functions of uProgress, so the surface
      // freezes the moment the user stops scrolling.
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           varying vec2 vKleinUv;
           uniform float uProgress;
           uniform float uDeform;`
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           vKleinUv = uv;
           float v = uv.y * 6.2831853;
           float u = (uv.x - 0.5) * 6.2831853;
           float pulse = sin(v * 3.0 - uProgress * 12.566) * 0.5
                       + sin(v * 5.0 + uProgress * 18.849) * 0.25;
           float swell = 1.0 + 0.13 * pulse * uDeform;
           transformed *= swell;
           float twist = sin(u * 2.0 + uProgress * 6.2831) * 0.08 * uDeform;
           float c = cos(twist), s = sin(twist);
           transformed.xy = mat2(c, -s, s, c) * transformed.xy;`
        );

      // Fragment gradient keyed off progress so the colour field flows
      // with the scroll too.
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           varying vec2 vKleinUv;
           uniform float uProgress;
           uniform vec3 uColorA;
           uniform vec3 uColorB;
           uniform vec3 uColorC;
           uniform vec3 uColorD;`
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
           float ribbons = 0.5 + 0.5 * sin(vKleinUv.y * 40.0 + uProgress * 12.566);
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
    this.pivot.add(this.klein);
  }

  _buildWireframeShell() {
    // Skipped — a fixed wireframe would drift away from the GPU-deformed
    // surface. The iridescent material carries its own ribbon banding so
    // the "filaments" look is preserved without a second geometry.
    this.wire = null;
  }

  _buildStarfield() {
    // Static starfield — does not rotate or twinkle unless scroll progress
    // changes. Parallax is progress-driven, not time-driven.
    const count = 1200;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 22 + Math.random() * 30;
      const theta = Math.random() * PI2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      sizes[i] = 0.7 + Math.random() * 1.6;
      seeds[i] = Math.random();
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    geom.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: { uProgress: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float size;
        attribute float seed;
        uniform float uProgress;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float shine = 0.7 + 0.3 * sin(seed * 12.56 + uProgress * 6.2831);
          gl_PointSize = size * shine * (220.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
          vAlpha = shine;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(0.85, 0.92, 1.0), a * vAlpha * 0.75);
        }
      `,
    });

    this.stars = new THREE.Points(geom, mat);
    this.scene.add(this.stars);
  }

  _buildAurora() {
    const geom = new THREE.SphereGeometry(70, 32, 32);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
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
        uniform float uProgress;
        uniform vec3 uTop;
        uniform vec3 uMid;
        uniform vec3 uBot;
        void main() {
          vec3 n = normalize(vPos);
          float h = n.y * 0.5 + 0.5;
          float swirl = 0.5 + 0.5 * sin(n.x * 3.0 + uProgress * 6.2831);
          vec3 col = mix(uBot, uMid, smoothstep(0.0, 0.55, h));
          col = mix(col, uTop, smoothstep(0.55, 1.0, h));
          col += 0.03 * swirl * vec3(0.6, 0.4, 1.0);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.aurora = new THREE.Mesh(geom, mat);
    this.scene.add(this.aurora);
  }

  setProgress(p) {
    this.progress = THREE.MathUtils.clamp(p, 0, 1);
  }

  start() {
    if (this._running) return;
    this._running = true;
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
    // Smoothly interpolate towards the target scroll progress so nudges of
    // the wheel glide. Once displayProgress has converged we stop submitting
    // draw calls entirely — the scene is completely static when the user
    // is not scrolling.
    const diff = this.progress - this.displayProgress;
    if (Math.abs(diff) > 1e-5) {
      this.displayProgress += diff * 0.12;
      this._needsRender = true;
    } else if (this.displayProgress !== this.progress) {
      this.displayProgress = this.progress;
      this._needsRender = true;
    }

    if (!this._needsRender) return;

    const p = this.displayProgress;

    // Gentle parallax of the whole bottle so the user can tell scroll is
    // registering, but nothing disorienting: a small yaw and a whisper of
    // tilt that both remain inside the framing of the ring.
    this.pivot.rotation.y = p * 0.6;
    this.pivot.rotation.z = Math.sin(p * PI2) * 0.08;

    // Progress-driven star parallax.
    this.stars.rotation.y = p * 0.25;

    if (this.aurora.material.uniforms) {
      this.aurora.material.uniforms.uProgress.value = p;
    }
    if (this.stars.material.uniforms) {
      this.stars.material.uniforms.uProgress.value = p;
    }

    this.kleinUniforms.uProgress.value = p;
    // Convolution amplitude ramps in fast at the start and stays on
    // throughout the journey, so the bottle ripples with every scroll.
    this.kleinUniforms.uDeform.value = THREE.MathUtils.smoothstep(p, 0, 0.08);

    this.renderer.render(this.scene, this.camera);
    this._lastRenderedProgress = p;
    this._needsRender = false;
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

void kleinPoint; // geometry helper retained for future spine variations
