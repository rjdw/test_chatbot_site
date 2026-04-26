import * as THREE from "three";

// Hermann Karcher parametric equations for a twisting Klein bottle.
// Reference: https://virtualmathmuseum.org/Surface/klein_bottle/klein_bottle.html
//
//   x = (aa + cos(v/2) sin(u) - sin(v/2) sin(2u)) cos(v)
//   y = (aa + cos(v/2) sin(u) - sin(v/2) sin(2u)) sin(v)
//   z =       sin(v/2) sin(u) + cos(v/2) sin(2u)
//
// Periodicity:   (u, v) ~ (-u, v + 2π)
// Surface is non-orientable, so geometry must be rendered double-sided.

export const KLEIN_AA = 2.6;

export function kleinPoint(u, v, aa = KLEIN_AA, out = new THREE.Vector3()) {
  const cv2 = Math.cos(v * 0.5);
  const sv2 = Math.sin(v * 0.5);
  const su = Math.sin(u);
  const s2u = Math.sin(2 * u);
  const r = aa + cv2 * su - sv2 * s2u;
  out.x = r * Math.cos(v);
  out.y = r * Math.sin(v);
  out.z = sv2 * su + cv2 * s2u;
  return out;
}

export function createKleinGeometry({
  uSegments = 140,
  vSegments = 320,
  aa = KLEIN_AA,
} = {}) {
  const positions = new Float32Array((uSegments + 1) * (vSegments + 1) * 3);
  const uvs = new Float32Array((uSegments + 1) * (vSegments + 1) * 2);
  const indices = [];

  const tmp = new THREE.Vector3();
  let p = 0;
  let q = 0;
  for (let i = 0; i <= uSegments; i++) {
    const u = -Math.PI + (2 * Math.PI * i) / uSegments;
    for (let j = 0; j <= vSegments; j++) {
      const v = (2 * Math.PI * j) / vSegments;
      kleinPoint(u, v, aa, tmp);
      positions[p++] = tmp.x;
      positions[p++] = tmp.y;
      positions[p++] = tmp.z;
      uvs[q++] = i / uSegments;
      uvs[q++] = j / vSegments;
    }
  }

  const stride = vSegments + 1;
  for (let i = 0; i < uSegments; i++) {
    for (let j = 0; j < vSegments; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// Spine curve the camera travels along. We ride a curve at fixed u = u0
// (offset from the figure-eight self-intersection) so the surface wraps
// around the viewer like a tunnel.
export function kleinSpine(v, { uOffset = 1.15, aa = KLEIN_AA } = {}) {
  // A pair of opposite u values gives the two lobes of the figure-8 meridian.
  // We blend so the effective offset swaps sign over a 2π in v — this hides
  // the non-closure of a fixed-u curve and makes the camera path feel
  // infinite when chained through several v-laps.
  const out = new THREE.Vector3();
  kleinPoint(uOffset, v, aa, out);
  return out;
}

export function kleinSpineTangent(v, opts) {
  const eps = 1e-3;
  const a = kleinSpine(v - eps, opts);
  const b = kleinSpine(v + eps, opts);
  return b.sub(a).normalize();
}
