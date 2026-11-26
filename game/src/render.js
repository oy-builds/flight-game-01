// The renderer: raw WebGL, no library. One lambert shader with fog draws the
// terrain, sea, runway, rings, landmarks, clouds and the Kestrel; a second
// flat shader draws the sky dome. The camera chases the plane from behind.
import { RUNWAY, WORLD } from './config.js';
import { buildAircraftMesh, buildPropMesh, forwardVector } from './aircraft.js';
import {
  BEACON, HANGARS, LAKE_X, LAKE_Y, LAKE_Z, LIGHTHOUSE, VILLAGE,
  buildTerrainMesh, freshRings, heightAt, treePositions,
} from './terrain.js';

const VERT = `
attribute vec3 aPos;
attribute vec3 aCol;
attribute vec3 aNormal;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
varying vec3 vCol;
varying vec3 vNormal;
varying float vFog;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vCol = aCol;
  vNormal = normalize((uModel * vec4(aNormal, 0.0)).xyz);
  vec4 view = uView * world;
  vFog = -view.z;
  gl_Position = uProj * view;
}`;

const FRAG = `
precision mediump float;
varying vec3 vCol;
varying vec3 vNormal;
varying float vFog;
uniform vec3 uLight;
uniform vec3 uFogCol;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAlpha;
void main() {
  float lam = 0.68 + 0.32 * max(dot(normalize(vNormal), normalize(uLight)), 0.0);
  vec3 col = vCol * lam;
  float f = clamp((vFog - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uFogCol, f);
  gl_FragColor = vec4(col, uAlpha);
}`;

const SKY_VERT = `
attribute vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
varying vec3 vDir;
void main() {
  vDir = aPos;
  vec4 p = uProj * uView * vec4(aPos, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = `
precision mediump float;
varying vec3 vDir;
void main() {
  float h = normalize(vDir).y;
  vec3 top = vec3(0.16, 0.42, 0.78);
  vec3 mid = vec3(0.55, 0.75, 0.93);
  vec3 low = vec3(0.86, 0.90, 0.94);
  vec3 col = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.85, h)) : mix(low, mid, smoothstep(-0.08, 0.12, h));
  // A soft sun glow toward the west.
  vec3 sunDir = normalize(vec3(-0.55, 0.28, -0.35));
  float sun = pow(max(dot(normalize(vDir), sunDir), 0.0), 90.0);
  col += vec3(1.0, 0.85, 0.55) * sun * 0.9;
  float halo = pow(max(dot(normalize(vDir), sunDir), 0.0), 8.0);
  col += vec3(1.0, 0.9, 0.7) * halo * 0.12;
  gl_FragColor = vec4(col, 1.0);
}`;

// --- tiny mat4 helpers (column-major, like WebGL expects) ---
function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let s = 0;
      for (let k = 0; k < 4; k += 1) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

function mat4Translate(x, y, z) {
  const out = mat4Identity();
  out[12] = x; out[13] = y; out[14] = z;
  return out;
}

function mat4RotateX(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}

function mat4RotateY(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

function mat4RotateZ(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function mat4Scale(x, y, z) {
  const out = mat4Identity();
  out[0] = x; out[5] = y; out[10] = z;
  return out;
}

function mat4LookAt(eye, target, up) {
  const zx = eye.x - target.x;
  const zy = eye.y - target.y;
  const zz = eye.z - target.z;
  let zl = Math.hypot(zx, zy, zz);
  const z = [zx / zl, zy / zl, zz / zl];
  let xx = up.y * z[2] - up.z * z[1];
  let xy = up.z * z[0] - up.x * z[2];
  let xz = up.x * z[1] - up.y * z[0];
  zl = Math.hypot(xx, xy, xz) || 1;
  const x = [xx / zl, xy / zl, xz / zl];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye.x + x[1] * eye.y + x[2] * eye.z),
    -(y[0] * eye.x + y[1] * eye.y + y[2] * eye.z),
    -(z[0] * eye.x + z[1] * eye.y + z[2] * eye.z),
    1,
  ]);
}

// --- mesh helpers ---
function pushTri(arrays, a, b, c, colour) {
  arrays.positions.push(...a, ...b, ...c);
  arrays.colours.push(...colour, ...colour, ...colour);
}

function pushQuad(arrays, a, b, c, d, colour) {
  pushTri(arrays, a, b, c, colour);
  pushTri(arrays, a, c, d, colour);
}

function buildBox(arrays, cx, cy, cz, w, h, d, colour, topColour) {
  const x0 = cx - w / 2; const x1 = cx + w / 2;
  const y0 = cy; const y1 = cy + h;
  const z0 = cz - d / 2; const z1 = cz + d / 2;
  const top = topColour || colour;
  pushQuad(arrays, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], top);
  pushQuad(arrays, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], colour);
  pushQuad(arrays, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], colour);
  pushQuad(arrays, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], colour);
  pushQuad(arrays, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], colour);
}

function buildRoof(arrays, cx, cy, cz, w, h, d, colour) {
  const x0 = cx - w / 2; const x1 = cx + w / 2;
  const z0 = cz - d / 2; const z1 = cz + d / 2;
  const apex = cy + h;
  pushTri(arrays, [x0, cy, z0], [x1, cy, z0], [cx, apex, z0], colour);
  pushTri(arrays, [x1, cy, z1], [x0, cy, z1], [cx, apex, z1], colour);
  pushQuad(arrays, [x0, cy, z0], [cx, apex, z0], [cx, apex, z1], [x0, cy, z1], colour);
  pushQuad(arrays, [cx, apex, z0], [x1, cy, z0], [x1, cy, z1], [cx, apex, z1], colour);
}

/** A torus (ring) centred at the origin, facing +z, radius R, tube r. */
function buildTorus(R, r, segments, sides) {
  const arrays = { positions: [], colours: [] };
  const gold = [0.95, 0.72, 0.18];
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    for (let j = 0; j < sides; j += 1) {
      const b0 = (j / sides) * Math.PI * 2;
      const b1 = ((j + 1) / sides) * Math.PI * 2;
      const p = (a, b) => [
        (R + r * Math.cos(b)) * Math.cos(a),
        (R + r * Math.cos(b)) * Math.sin(a),
        r * Math.sin(b),
      ];
      pushQuad(arrays, p(a0, b0), p(a1, b0), p(a1, b1), p(a0, b1), gold);
    }
  }
  return { positions: new Float32Array(arrays.positions), colours: new Float32Array(arrays.colours) };
}

/** A flat disc in the xy plane, radius R, for the inside of a ring. */
function buildDisc(R, segments, colour) {
  const arrays = { positions: [], colours: [] };
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    pushTri(arrays, [0, 0, 0], [Math.cos(a0) * R, Math.sin(a0) * R, 0], [Math.cos(a1) * R, Math.sin(a1) * R, 0], colour);
  }
  return { positions: new Float32Array(arrays.positions), colours: new Float32Array(arrays.colours) };
}

/** A sphere (low-poly) centred at the origin, radius 1. */
function buildSphere(segments, rings) {
  const arrays = { positions: [], colours: [] };
  const white = [1, 1, 1];
  for (let i = 0; i < rings; i += 1) {
    const t0 = (i / rings) * Math.PI;
    const t1 = ((i + 1) / rings) * Math.PI;
    for (let j = 0; j < segments; j += 1) {
      const p0 = (j / segments) * Math.PI * 2;
      const p1 = ((j + 1) / segments) * Math.PI * 2;
      const v = (t, p) => [Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p)];
      pushQuad(arrays, v(t0, p0), v(t1, p0), v(t1, p1), v(t0, p1), white);
    }
  }
  return { positions: new Float32Array(arrays.positions), colours: new Float32Array(arrays.colours) };
}

// --- the renderer ---
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL is not available in this browser');
    this.gl = gl;
    this.prog = this.compile(VERT, FRAG);
    this.skyProg = this.compile(SKY_VERT, SKY_FRAG);
    this.u = {
      proj: gl.getUniformLocation(this.prog, 'uProj'),
      view: gl.getUniformLocation(this.prog, 'uView'),
      model: gl.getUniformLocation(this.prog, 'uModel'),
      light: gl.getUniformLocation(this.prog, 'uLight'),
      fogCol: gl.getUniformLocation(this.prog, 'uFogCol'),
      fogNear: gl.getUniformLocation(this.prog, 'uFogNear'),
      fogFar: gl.getUniformLocation(this.prog, 'uFogFar'),
      alpha: gl.getUniformLocation(this.prog, 'uAlpha'),
    };
    this.uSky = {
      proj: gl.getUniformLocation(this.skyProg, 'uProj'),
      view: gl.getUniformLocation(this.skyProg, 'uView'),
    };
    this.buffers = new Map();
    this.buildStaticMeshes();
  }

  compile(vsSrc, fsSrc) {
    const gl = this.gl;
    const compileOne = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(`shader compile failed: ${gl.getShaderInfoLog(sh)}`);
      }
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compileOne(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, compileOne(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`shader link failed: ${gl.getProgramInfoLog(prog)}`);
    }
    return prog;
  }

  /** Normals for a triangle soup: one flat normal per face, repeated per vertex. */
  flatNormals(positions) {
    const normals = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 9) {
      const ax = positions[i]; const ay = positions[i + 1]; const az = positions[i + 2];
      const bx = positions[i + 3]; const by = positions[i + 4]; const bz = positions[i + 5];
      const cx = positions[i + 6]; const cy = positions[i + 7]; const cz = positions[i + 8];
      const ux = bx - ax; const uy = by - ay; const uz = bz - az;
      const vx = cx - ax; const vy = cy - ay; const vz = cz - az;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      for (let k = 0; k < 3; k += 1) {
        normals[i + k * 3] = nx;
        normals[i + k * 3 + 1] = ny;
        normals[i + k * 3 + 2] = nz;
      }
    }
    return normals;
  }

  /** Smooth normals for an indexed mesh: face normals averaged per vertex. */
  smoothNormals(positions, indices) {
    const normals = new Float32Array(positions.length);
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3;
      const b = indices[i + 1] * 3;
      const c = indices[i + 2] * 3;
      const ux = positions[b] - positions[a];
      const uy = positions[b + 1] - positions[a + 1];
      const uz = positions[b + 2] - positions[a + 2];
      const vx = positions[c] - positions[a];
      const vy = positions[c + 1] - positions[a + 1];
      const vz = positions[c + 2] - positions[a + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      normals[a] += nx; normals[a + 1] += ny; normals[a + 2] += nz;
      normals[b] += nx; normals[b + 1] += ny; normals[b + 2] += nz;
      normals[c] += nx; normals[c + 1] += ny; normals[c + 2] += nz;
    }
    for (let i = 0; i < normals.length; i += 3) {
      const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
      normals[i] /= len; normals[i + 1] /= len; normals[i + 2] /= len;
    }
    return normals;
  }

  makeBuffer(name, positions, colours, indices) {
    const gl = this.gl;
    const pos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const col = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, col);
    gl.bufferData(gl.ARRAY_BUFFER, colours, gl.STATIC_DRAW);
    const normals = indices ? this.smoothNormals(positions, indices) : this.flatNormals(positions);
    const nrm = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nrm);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    let idx = null;
    if (indices) {
      idx = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    }
    this.buffers.set(name, { pos, col, nrm, idx, count: indices ? indices.length : positions.length / 3 });
  }

  buildStaticMeshes() {
    // Terrain.
    const terrain = buildTerrainMesh();
    this.makeBuffer('terrain', terrain.positions, terrain.colours, terrain.indices);

    // Sea: a big flat plane at y = 0.4, blue-green. Wound so its normal points up.
    const sea = { positions: [], colours: [] };
    const S = 5200;
    const seaCol = [0.22, 0.52, 0.72];
    pushQuad(sea, [-S, 0.4, -S], [-S, 0.4, S], [S, 0.4, S], [S, 0.4, -S], seaCol);
    this.makeBuffer('sea', new Float32Array(sea.positions), new Float32Array(sea.colours));

    // Lake: a flat disc over the crater.
    const lake = buildDisc(1, 24, [0.25, 0.55, 0.72]);
    this.makeBuffer('lake', lake.positions, lake.colours);

    // Runway: asphalt strip, centreline dashes, threshold bars, chevrons.
    const rwy = { positions: [], colours: [] };
    const asphalt = [0.26, 0.26, 0.28];
    const white = [0.92, 0.92, 0.9];
    const y = RUNWAY.elevation + 0.35;
    const L = RUNWAY.length / 2;
    const W = RUNWAY.width / 2;
    pushQuad(rwy, [-L, y, -W], [L, y, -W], [L, y, W], [-L, y, W], asphalt);
    // Centreline dashes.
    for (let x = -L + 20; x < L - 20; x += 40) {
      pushQuad(rwy, [x, y + 0.02, -1.1], [x + 20, y + 0.02, -1.1], [x + 20, y + 0.02, 1.1], [x, y + 0.02, 1.1], white);
    }
    // Threshold bars at both ends.
    for (const end of [-1, 1]) {
      const x0 = end * (L - 14);
      for (let k = -3; k <= 3; k += 1) {
        const z0 = k * 4.4 - 1.4;
        pushQuad(rwy, [x0 - 5, y + 0.02, z0], [x0 + 5, y + 0.02, z0], [x0 + 5, y + 0.02, z0 + 2.8], [x0 - 5, y + 0.02, z0 + 2.8], white);
      }
    }
    // Edge lines.
    pushQuad(rwy, [-L, y + 0.02, -W + 1], [L, y + 0.02, -W + 1], [L, y + 0.02, -W + 2], [-L, y + 0.02, -W + 2], white);
    pushQuad(rwy, [-L, y + 0.02, W - 2], [L, y + 0.02, W - 2], [L, y + 0.02, W - 1], [-L, y + 0.02, W - 1], white);
    this.makeBuffer('runway', new Float32Array(rwy.positions), new Float32Array(rwy.colours));

    // Landmarks: village houses, hangars, lighthouse, trees, windsock.
    const land = { positions: [], colours: [] };
    const wallCols = [[0.92, 0.85, 0.7], [0.88, 0.78, 0.62], [0.94, 0.9, 0.8], [0.85, 0.7, 0.6]];
    const roofCols = [[0.72, 0.25, 0.18], [0.55, 0.3, 0.2], [0.8, 0.4, 0.2], [0.4, 0.35, 0.3]];
    for (let i = 0; i < VILLAGE.houses; i += 1) {
      const a = (i / VILLAGE.houses) * Math.PI * 2;
      const hx = VILLAGE.x + Math.cos(a) * (60 + (i % 3) * 22);
      const hz = VILLAGE.z + Math.sin(a) * (48 + (i % 4) * 16);
      const gy = heightAt(hx, hz);
      const w = 9 + (i % 3) * 3;
      buildBox(land, hx, gy, hz, w, 5, 8, wallCols[i % 4]);
      buildRoof(land, hx, gy + 5, hz, w + 1, 3.5, 9, roofCols[i % 4]);
    }
    for (const h of HANGARS) {
      const gy = heightAt(h.x, h.z);
      buildBox(land, h.x, gy, h.z, h.w, h.h, h.d, [0.55, 0.58, 0.6], [0.45, 0.48, 0.5]);
    }
    // Lighthouse: white tower with a red top, on the headland.
    const lx = LIGHTHOUSE.x;
    const lz = LIGHTHOUSE.z;
    const ly = heightAt(lx, lz);
    buildBox(land, lx, ly, lz, 8, 26, 8, [0.94, 0.93, 0.9]);
    buildBox(land, lx, ly + 26, lz, 6, 4, 6, [0.8, 0.15, 0.12]);
    buildBox(land, lx, ly + 30, lz, 4, 3, 4, [0.2, 0.2, 0.22]);
    // Windsock pole beside the runway.
    buildBox(land, 120, RUNWAY.elevation, 60, 0.5, 12, 0.5, [0.8, 0.8, 0.8]);
    buildBox(land, 120, RUNWAY.elevation + 11, 60, 5, 1.2, 1.2, [0.9, 0.4, 0.15]);
    // Trees: trunk + cone canopy, instanced as plain geometry.
    const trees = treePositions(90);
    for (const t of trees) {
      buildBox(land, t.x, t.y, t.z, 0.7 * t.s, 3.2 * t.s, 0.7 * t.s, [0.4, 0.28, 0.16]);
      const cx = t.x; const cy = t.y + 3.2 * t.s; const cz = t.z;
      const s = 2.6 * t.s;
      pushTri(land, [cx - s, cy, cz - s], [cx + s, cy, cz - s], [cx, cy + 4.5 * t.s, cz], [0.2, 0.45, 0.2]);
      pushTri(land, [cx + s, cy, cz - s], [cx + s, cy, cz + s], [cx, cy + 4.5 * t.s, cz], [0.24, 0.5, 0.22]);
      pushTri(land, [cx + s, cy, cz + s], [cx - s, cy, cz + s], [cx, cy + 4.5 * t.s, cz], [0.18, 0.42, 0.18]);
      pushTri(land, [cx - s, cy, cz + s], [cx - s, cy, cz - s], [cx, cy + 4.5 * t.s, cz], [0.22, 0.48, 0.2]);
    }
    this.makeBuffer('landmarks', new Float32Array(land.positions), new Float32Array(land.colours));

    // Rings: one torus mesh reused for every ring, plus a translucent disc.
    const torus = buildTorus(1, 0.09, 28, 8);
    this.makeBuffer('ring', torus.positions, torus.colours);
    const disc = buildDisc(0.92, 24, [1.0, 0.85, 0.3]);
    this.makeBuffer('ringDisc', disc.positions, disc.colours);

    // Aircraft.
    const ac = buildAircraftMesh();
    this.makeBuffer('aircraft', ac.positions, ac.colours);
    // Propeller is rebuilt per frame (it spins); buffer created lazily.
    this.propBuffer = null;

    // Clouds: a few white blobs made of scaled spheres.
    const cloud = buildSphere(10, 6);
    this.makeBuffer('cloud', cloud.positions, cloud.colours);
    this.clouds = [];
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2 + 0.35;
      const r = 700 + (i % 4) * 260;
      this.clouds.push({
        x: Math.cos(a) * r,
        y: 340 + (i % 5) * 46,
        z: Math.sin(a) * r,
        s: 34 + (i % 3) * 18,
      });
    }

    // Sky dome: a big sphere around the camera.
    const dome = buildSphere(24, 12);
    this.makeBuffer('dome', dome.positions, dome.colours);
  }

  drawBuffer(name, model, alpha) {
    const gl = this.gl;
    const b = this.buffers.get(name);
    if (!b) return;
    gl.uniformMatrix4fv(this.u.model, false, model);
    gl.uniform1f(this.u.alpha, alpha === undefined ? 1 : alpha);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.pos);
    const posLoc = gl.getAttribLocation(this.prog, 'aPos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.col);
    const colLoc = gl.getAttribLocation(this.prog, 'aCol');
    gl.enableVertexAttribArray(colLoc);
    gl.vertexAttribPointer(colLoc, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.nrm);
    const nrmLoc = gl.getAttribLocation(this.prog, 'aNormal');
    gl.enableVertexAttribArray(nrmLoc);
    gl.vertexAttribPointer(nrmLoc, 3, gl.FLOAT, false, 0, 0);
    if (b.idx) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx);
      gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_SHORT, 0);
    } else {
      gl.drawArrays(gl.TRIANGLES, 0, b.count);
    }
  }

  drawProp(plane, model) {
    const gl = this.gl;
    const mesh = buildPropMesh(plane.propAngle);
    const normals = this.flatNormals(mesh.positions);
    if (!this.propBuffer) {
      this.propBuffer = {
        pos: gl.createBuffer(),
        col: gl.createBuffer(),
        nrm: gl.createBuffer(),
      };
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.propBuffer.pos);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.propBuffer.col);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colours, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.propBuffer.nrm);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.DYNAMIC_DRAW);
    gl.uniformMatrix4fv(this.u.model, false, model);
    gl.uniform1f(this.u.alpha, 0.85);
    const posLoc = gl.getAttribLocation(this.prog, 'aPos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
    const colLoc = gl.getAttribLocation(this.prog, 'aCol');
    gl.enableVertexAttribArray(colLoc);
    gl.vertexAttribPointer(colLoc, 3, gl.FLOAT, false, 0, 0);
    const nrmLoc = gl.getAttribLocation(this.prog, 'aNormal');
    gl.enableVertexAttribArray(nrmLoc);
    gl.vertexAttribPointer(nrmLoc, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.positions.length / 3);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Draw one frame. `plane` is the aircraft state, `mission` the mission
   * state (rings, beacon), `camera` is { mode, ... } and `time` seconds.
   */
  render(plane, mission, camera, time) {
    const gl = this.gl;
    this.resize();
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const proj = mat4Perspective(1.05, aspect, 0.5, 6000);

    // Camera: chase view behind and above the plane, looking ahead.
    const fwd = forwardVector(plane);
    let eye;
    let target;
    if (camera.mode === 'parked') {
      // Low front-quarter view of the parked plane, aimed past it so the
      // plane sits left of centre and the runway stretches away to the right.
      eye = { x: plane.x - 6, y: plane.y + 4.5, z: plane.z + 18 };
      target = { x: plane.x + 14, y: plane.y + 1, z: plane.z - 2 };
    } else if (camera.mode === 'orbit') {
      const a = time * 0.12;
      eye = { x: plane.x + Math.sin(a) * 26, y: plane.y + 9, z: plane.z + Math.cos(a) * 26 };
      target = { x: plane.x, y: plane.y + 1, z: plane.z };
    } else {
      const dist = 13.5;
      const up = 4.2;
      eye = {
        x: plane.x - fwd.x * dist,
        y: plane.y - fwd.y * dist + up,
        z: plane.z - fwd.z * dist,
      };
      // Keep the camera out of the ground.
      const ground = heightAt(eye.x, eye.z) + 2.2;
      if (eye.y < ground) eye.y = ground;
      target = {
        x: plane.x + fwd.x * 30,
        y: plane.y + fwd.y * 30 + 1,
        z: plane.z + fwd.z * 30,
      };
    }
    const view = mat4LookAt(eye, target, { x: 0, y: 1, z: 0 });

    gl.clearColor(0.55, 0.75, 0.93, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    // Sky dome (no depth write, drawn first).
    gl.useProgram(this.skyProg);
    const domeModel = mat4Multiply(
      mat4Translate(eye.x, eye.y, eye.z),
      mat4Scale(2800, 2800, 2800),
    );
    gl.uniformMatrix4fv(this.uSky.proj, false, proj);
    gl.uniformMatrix4fv(this.uSky.view, false, view);
    gl.depthMask(false);
    const dome = this.buffers.get('dome');
    gl.bindBuffer(gl.ARRAY_BUFFER, dome.pos);
    const skyPos = gl.getAttribLocation(this.skyProg, 'aPos');
    gl.enableVertexAttribArray(skyPos);
    gl.vertexAttribPointer(skyPos, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, dome.count);
    gl.depthMask(true);

    // Everything else.
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.proj, false, proj);
    gl.uniformMatrix4fv(this.u.view, false, view);
    gl.uniform3f(this.u.light, -0.55, 0.75, -0.4);
    gl.uniform3f(this.u.fogCol, 0.78, 0.85, 0.92);
    gl.uniform1f(this.u.fogNear, 600);
    gl.uniform1f(this.u.fogFar, 2800);

    const ident = mat4Identity();
    this.drawBuffer('sea', ident);
    this.drawBuffer('terrain', ident);
    // Lake disc sits just above the crater floor (radius 1 disc, scaled to 190 m).
    const lakeModel = mat4Multiply(
      mat4Translate(LAKE_X, LAKE_Y + 0.6, LAKE_Z),
      mat4Scale(190, 1, 190),
    );
    this.drawBuffer('lake', lakeModel);
    this.drawBuffer('runway', ident);
    this.drawBuffer('landmarks', ident);

    // Clouds drift slowly.
    gl.disable(gl.DEPTH_TEST);
    for (const c of this.clouds) {
      const drift = ((time * 2 + c.x) % 2400) - 1200;
      const m = mat4Multiply(
        mat4Translate(drift, c.y, c.z),
        mat4Scale(c.s, c.s * 0.45, c.s * 0.7),
      );
      this.drawBuffer('cloud', m, 0.92);
    }
    gl.enable(gl.DEPTH_TEST);

    // Rings: the next ring glows bright, flown ones fade, later ones dim.
    const rings = mission && mission.rings ? mission.rings : freshRings();
    rings.forEach((ring, index) => {
      const next = mission && index === mission.nextRing;
      const scale = ring.r;
      const m = mat4Multiply(
        mat4Translate(ring.x, ring.y, ring.z),
        mat4Scale(scale, scale, scale),
      );
      // Rings face the pilot: rotate to face the plane.
      const dx = plane.x - ring.x;
      const dz = plane.z - ring.z;
      const yaw = Math.atan2(dx, -dz);
      const oriented = mat4Multiply(m, mat4RotateY(yaw));
      const alpha = ring.flown ? 0.25 : next ? 1 : 0.75;
      this.drawBuffer('ring', oriented, alpha);
      if (next) {
        const pulse = 0.5 + 0.2 * Math.sin(time * 4);
        const smallDisc = mat4Multiply(oriented, mat4Scale(0.5, 0.5, 0.5));
        this.drawBuffer('ringDisc', smallDisc, pulse * 0.3);
      }
    });

    // Beacon: a tall glowing column over the lighthouse for the Island Hop.
    if (mission && mission.id === 'hop' && !mission.beaconDone) {
      const col = mat4Multiply(
        mat4Translate(BEACON.x, BEACON.y + 40, BEACON.z),
        mat4Scale(6, 80, 6),
      );
      this.drawBuffer('cloud', col, 0.35);
    }

    // The aircraft itself. Local frame: nose -z, +x right, +y up.
    // Ry(-heading) maps -z onto (sin h, 0, -cos h); Rx(pitch) raises the nose;
    // Rz(-bank) drops the right wing for a right bank (bank > 0).
    const acModel = mat4Multiply(
      mat4Translate(plane.x, plane.y, plane.z),
      mat4Multiply(
        mat4RotateY(-plane.heading),
        mat4Multiply(mat4RotateX(plane.pitch), mat4RotateZ(-plane.bank)),
      ),
    );
    this.drawBuffer('aircraft', acModel);
    if (!plane.crashed) this.drawProp(plane, acModel);
  }
}
