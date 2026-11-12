/* Paper Polyhedra 3D viewer (WebGL): shaded faces, seam lines, hover, picking and glue numbers. */
const Viewer = (() => {
  'use strict';
  const FACE_VS = `
    attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aCol; attribute float aId;
    uniform mat4 uMVP; uniform mat3 uRot; uniform float uHover;
    varying vec3 vCol; varying float vHi;
    void main() {
      gl_Position = uMVP * vec4(aPos, 1.0);
      vec3 n = normalize(uRot * aNrm);
      vec3 L = normalize(vec3(-0.35, 0.55, 0.76));
      float d = max(dot(n, L), 0.0);
      float back = n.z < 0.0 ? 0.55 : 1.0;
      vCol = aCol * (0.58 + 0.42 * d) * back;
      vHi = abs(aId - uHover) < 0.5 ? 1.0 : 0.0;
    }`;
  const FACE_FS = `
    precision mediump float; varying vec3 vCol; varying float vHi;
    void main() { gl_FragColor = vec4(mix(vCol, vec3(0.914, 0.769, 0.416), vHi * 0.55), 1.0); }`;
  const PICK_VS = `
    attribute vec3 aPos; attribute float aId; uniform mat4 uMVP; varying vec3 vId;
    void main() {
      gl_Position = uMVP * vec4(aPos, 1.0);
      float id = aId + 1.0;
      vId = vec3(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0)) / 255.0;
    }`;
  const PICK_FS = `precision mediump float; varying vec3 vId; void main() { gl_FragColor = vec4(vId, 1.0); }`;
  const LINE_VS = `
    attribute vec3 aA; attribute vec3 aB; attribute vec2 aT; attribute vec4 aC;
    uniform mat4 uMVP; uniform vec2 uRes;
    varying vec4 vC;
    void main() {
      vec4 a = uMVP * vec4(aA, 1.0), b = uMVP * vec4(aB, 1.0);
      vec2 sa = a.xy / a.w * uRes, sb = b.xy / b.w * uRes;
      vec2 d = normalize(sb - sa); vec2 nn = vec2(-d.y, d.x);
      vec4 p = mix(a, b, aT.x);
      p.xy += nn * aT.y * aC.a / uRes * p.w;
      p.z -= 0.0015 * p.w;
      gl_Position = p;
      vC = vec4(aC.rgb, 1.0);
    }`;
  const LINE_FS = `precision mediump float; varying vec4 vC; void main() { gl_FragColor = vC; }`;

  function compile(gl, vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const loc = {};
    const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < na; i++) { const a = gl.getActiveAttrib(p, i); loc[a.name] = gl.getAttribLocation(p, a.name); }
    const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) { const u = gl.getActiveUniform(p, i); loc[u.name] = gl.getUniformLocation(p, u.name); }
    return { p, loc };
  }
  const hex = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

  function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
  function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }
  function matMul(A, B) { return A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j])); }
  function apply(M, v) { return [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]]; }

  function create(canvas, overlay) {
    const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true, alpha: true, premultipliedAlpha: false });
    if (!gl) return null;
    const face = compile(gl, FACE_VS, FACE_FS);
    const pick = compile(gl, PICK_VS, PICK_FS);
    const line = compile(gl, LINE_VS, LINE_FS);
    const buf = { pos: gl.createBuffer(), nrm: gl.createBuffer(), col: gl.createBuffer(), id: gl.createBuffer(),
      la: gl.createBuffer(), lb: gl.createBuffer(), lt: gl.createBuffer(), lc: gl.createBuffer() };
    const st = { P: null, nTri: 0, nLine: 0, rot: matMul(rotX(-0.45), rotY(0.6)), hover: -1, size: 0, scale: 1,
      triRegion: null, labels: null, fb: null, fbSize: 0, idCache: null, idDirty: true };

    function upload(b, data) { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); }

    function setModel(P) {
      st.P = P;
      const pos = [], nrm = [], ids = [];
      P.regions.forEach(r => {
        for (let i = 0; i < r.tris.length; i++) {
          const v = P.V[r.loop[r.tris[i]]];
          pos.push(v[0], v[1], v[2]);
          nrm.push(r.n[0], r.n[1], r.n[2]);
          ids.push(r.id);
        }
      });
      st.nTri = pos.length / 3;
      upload(buf.pos, new Float32Array(pos));
      upload(buf.nrm, new Float32Array(nrm));
      upload(buf.id, new Float32Array(ids));
      st.ids = ids;
      st.idDirty = true;
    }
    function setColors(regionHex) {
      const col = new Float32Array(st.nTri * 3);
      for (let i = 0; i < st.nTri; i++) { const c = hex(regionHex[st.ids[i]]); col.set(c, i * 3); }
      upload(buf.col, col);
    }
    // seams: [{a, b, cut}] -> screen-space line quads
    function setLines(lines) {
      const A = [], B = [], T = [], C = [];
      lines.forEach(L => {
        const a = st.P.V[L.a], b = st.P.V[L.b];
        const corners = [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]];
        for (const [t, s] of corners) {
          A.push(a[0], a[1], a[2]); B.push(b[0], b[1], b[2]); T.push(t, s);
          C.push(L.color[0], L.color[1], L.color[2], L.width);
        }
      });
      st.nLine = A.length / 3;
      upload(buf.la, new Float32Array(A)); upload(buf.lb, new Float32Array(B));
      upload(buf.lt, new Float32Array(T)); upload(buf.lc, new Float32Array(C));
    }
    function mvp() {
      const P = st.P;
      const R = st.rot;
      const k = 0.7 / P.R; // fit radius
      // model -> camera: rotation and scale, then a mild perspective
      const d = 5;
      const M = [R[0][0] * k, R[1][0] * k, R[2][0] * k, 0, R[0][1] * k, R[1][1] * k, R[2][1] * k, 0, R[0][2] * k, R[1][2] * k, R[2][2] * k, 0, 0, 0, 0, 1];
      // perspective: x' = x * d/(d - z), keep depth in [-1, 1]
      const out = new Float32Array(16);
      const Pm = [d, 0, 0, 0, 0, d, 0, 0, 0, 0, -d / 1.2, -1, 0, 0, 0, d];
      // out = Pm * M (column-major)
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let i = 0; i < 4; i++) s += Pm[i * 4 + r] * M[c * 4 + i];
        out[c * 4 + r] = s;
      }
      return out;
    }
    function rot3() {
      const R = st.rot;
      return new Float32Array([R[0][0], R[1][0], R[2][0], R[0][1], R[1][1], R[2][1], R[0][2], R[1][2], R[2][2]]);
    }
    function bind(prog, name, b, size) {
      const l = prog.loc[name];
      if (l === undefined || l < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0);
    }
    function unbindAll() { for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i); }
    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = Math.max(16, Math.round(rect.width * dpr));
      if (canvas.width !== size) { canvas.width = size; canvas.height = size; st.idDirty = true; }
      if (overlay && overlay.width !== size) { overlay.width = size; overlay.height = size; }
      st.size = size;
      st.dpr = dpr;
    }
    function draw() {
      if (!st.P) return;
      resize();
      const size = st.size;
      gl.viewport(0, 0, size, size);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      const M = mvp();
      gl.useProgram(face.p);
      unbindAll();
      bind(face, 'aPos', buf.pos, 3); bind(face, 'aNrm', buf.nrm, 3); bind(face, 'aCol', buf.col, 3); bind(face, 'aId', buf.id, 1);
      gl.uniformMatrix4fv(face.loc.uMVP, false, M);
      gl.uniformMatrix3fv(face.loc.uRot, false, rot3());
      gl.uniform1f(face.loc.uHover, st.hover);
      gl.drawArrays(gl.TRIANGLES, 0, st.nTri);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      if (st.nLine) {
        gl.useProgram(line.p);
        unbindAll();
        bind(line, 'aA', buf.la, 3); bind(line, 'aB', buf.lb, 3); bind(line, 'aT', buf.lt, 2); bind(line, 'aC', buf.lc, 4);
        gl.uniformMatrix4fv(line.loc.uMVP, false, M);
        gl.uniform2f(line.loc.uRes, size / 2, size / 2);
        gl.drawArrays(gl.TRIANGLES, 0, st.nLine);
      }
      unbindAll();
      st.idDirty = true;
    }
    function renderIds() {
      if (!st.idDirty && st.idCache) return st.idCache;
      const size = st.size;
      if (!st.fb || st.fbSize !== size) {
        st.fb = gl.createFramebuffer();
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        const rb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size, size);
        gl.bindFramebuffer(gl.FRAMEBUFFER, st.fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
        st.fbSize = size;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, st.fb);
      gl.viewport(0, 0, size, size);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(pick.p);
      unbindAll();
      bind(pick, 'aPos', buf.pos, 3); bind(pick, 'aId', buf.id, 1);
      gl.uniformMatrix4fv(pick.loc.uMVP, false, mvp());
      gl.drawArrays(gl.TRIANGLES, 0, st.nTri);
      unbindAll();
      const px = new Uint8Array(size * size * 4);
      gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      st.idCache = px;
      st.idDirty = false;
      return px;
    }
    function idAt(px, x, y) {
      const size = st.size;
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= size || y >= size) return -1;
      const i = ((size - 1 - y) * size + x) * 4;
      return px[i] + px[i + 1] * 256 + px[i + 2] * 65536 - 1;
    }
    function pickAt(clientX, clientY) {
      if (!st.P) return -1;
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) * st.size / rect.width, y = (clientY - rect.top) * st.size / rect.height;
      return idAt(renderIds(), x, y);
    }
    function project(v) {
      const M = mvp();
      const x = M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12];
      const y = M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13];
      const w = M[3] * v[0] + M[7] * v[1] + M[11] * v[2] + M[15];
      return [(x / w + 1) / 2 * st.size, (1 - y / w) / 2 * st.size];
    }
    // labels: [{a, b, r, g, text}] drawn where the edge is visible
    function drawLabels(labels) {
      if (!overlay) return;
      const c = overlay.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, overlay.width, overlay.height);
      if (!labels || !labels.length || !st.P) return;
      const px = renderIds();
      const P = st.P;
      const fs = Math.max(9, Math.round(st.size * 0.024));
      c.font = `700 ${fs}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const placed = [];
      for (const L of labels) {
        const ra = P.regions[L.r];
        if (apply(st.rot, ra.n)[2] < 0.15 && apply(st.rot, P.regions[L.g].n)[2] < 0.15) continue;
        const a = P.V[L.a], b = P.V[L.b];
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        const s = project(mid);
        const sa = project(a), sb = project(b);
        if (Math.hypot(sa[0] - sb[0], sa[1] - sb[1]) < fs * 1.6) continue;
        // test a point a little inside each region next to the edge
        let ok = false;
        for (const rid of [L.r, L.g]) {
          const r = P.regions[rid];
          const q = project([mid[0] * 0.97 + r.c[0] * 0.03, mid[1] * 0.97 + r.c[1] * 0.03, mid[2] * 0.97 + r.c[2] * 0.03]);
          if (idAt(px, q[0], q[1]) === rid) { ok = true; break; }
        }
        if (!ok) continue;
        if (placed.some(p => Math.hypot(p[0] - s[0], p[1] - s[1]) < fs * 1.3)) continue;
        placed.push(s);
        const r = fs * 0.78 + (L.text.length > 2 ? fs * 0.25 : 0);
        c.fillStyle = 'rgba(255,255,255,.92)';
        c.beginPath(); c.arc(s[0], s[1], r, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#1b1b1b';
        c.fillText(L.text, s[0], s[1] + 0.5);
      }
    }
    function rotate(dx, dy) { st.rot = matMul(matMul(rotY(dx), rotX(dy)), st.rot); }
    return {
      gl, setModel, setColors, setLines, draw, pickAt, drawLabels, rotate,
      get rot() { return st.rot; }, set rot(r) { st.rot = r; },
      set hover(h) { st.hover = h; }, get hover() { return st.hover; },
      reset() { st.rot = matMul(rotX(-0.45), rotY(0.6)); }
    };
  }
  return { create, hex };
})();
