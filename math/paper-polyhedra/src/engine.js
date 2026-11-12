/* Paper Polyhedra engine: model preparation, sections, unfolding, glue tabs and sheet layout.
   Works on the visible outer surface of each model: flat regions with a loop of vertex indices
   (counter-clockwise seen from outside) and, for every edge, the region on the other side. */
const Engine = (() => {
  'use strict';
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const nrm = a => { const l = len(a); return [a[0] / l, a[1] / l, a[2] / l]; };
  const EPS = 1e-6;

  /* ---------------- model preparation ---------------- */
  function prepare(m) {
    if (m._prep) return m._prep;
    const V = [];
    for (let i = 0; i < m.V.length; i += 3) V.push([m.V[i], m.V[i + 1], m.V[i + 2]]);
    const regions = m.R.map((r, id) => {
      const [plane, type, comp, loop, nb] = r;
      const k = loop.length;
      let n = [0, 0, 0], c = [0, 0, 0];
      for (let i = 0; i < k; i++) {
        const a = V[loop[i]], b = V[loop[(i + 1) % k]];
        n[0] += (a[1] - b[1]) * (a[2] + b[2]);
        n[1] += (a[2] - b[2]) * (a[0] + b[0]);
        n[2] += (a[0] - b[0]) * (a[1] + b[1]);
        c[0] += a[0]; c[1] += a[1]; c[2] += a[2];
      }
      const area3 = len(n) / 2;
      n = nrm(n);
      c = [c[0] / k, c[1] / k, c[2] / k];
      const ax = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const u = nrm(cross(n, ax)), v = cross(n, u);
      // local 2D coordinates, y pointing down so the outside reads correctly on paper
      const pts = loop.map(i => { const d = sub(V[i], c); return [dot(d, u), -dot(d, v)]; });
      const tris = earcut(pts.flat());
      return { id, plane, type, comp, loop, nb, n, c, u, v, area: area3, pts, tris, mate: [], seam: [] };
    });
    // match every edge with the same edge seen from the neighbouring region
    const dir = new Map();
    regions.forEach(r => r.loop.forEach((a, i) => {
      const key = a + ',' + r.loop[(i + 1) % r.loop.length];
      if (!dir.has(key)) dir.set(key, []);
      dir.get(key).push([r.id, i]);
    }));
    const seams = [];
    regions.forEach(r => r.loop.forEach((a, i) => {
      const b = r.loop[(i + 1) % r.loop.length];
      const g = r.nb[i];
      const cand = (dir.get(b + ',' + a) || []).filter(([gid, j]) => gid === g && regions[g].nb[j] === r.id);
      if (!cand.length) throw new Error('unmatched edge in model W' + m.w);
      r.mate[i] = cand[0][1];
    }));
    regions.forEach(r => r.loop.forEach((a, i) => {
      if (r.seam[i] !== undefined) return;
      const g = regions[r.nb[i]], j = r.mate[i];
      const s = { id: seams.length, r: r.id, i, g: g.id, j, a: r.loop[i], b: r.loop[(i + 1) % r.loop.length] };
      // fold direction seen from outside: mountain (convex) or valley (concave)
      const dirG = sub(V[s.a], V[s.b]);
      const inwardG = nrm(cross(g.n, dirG));
      const t = dot(r.n, inwardG);
      s.valley = t > 1e-7;
      s.len = len(sub(V[s.b], V[s.a]));
      r.seam[i] = s.id;
      g.seam[j] = s.id;
      seams.push(s);
    }));
    let R = 0, minEdge = Infinity;
    V.forEach(p => { R = Math.max(R, len(p)); });
    seams.forEach(s => { minEdge = Math.min(minEdge, s.len); });
    // which side of each directed edge is free of paper (the same for every region)
    const p0 = regions[0].pts;
    let sa = 0;
    p0.forEach((a, i) => { const b = p0[(i + 1) % p0.length]; sa += a[0] * b[1] - a[1] * b[0]; });
    const side = sa < 0 ? 1 : -1;
    const prep = { m, V, regions, seams, R, minEdge, side, valleys: seams.some(s => s.valley) };
    m._prep = prep;
    return prep;
  }

  /* ---------------- sections ---------------- */
  // Hand-made sections for the Platonic solids
  function platonicSections(P) {
    const F = P.regions, w = P.m.w;
    if (w === 1) return [[0, F[0].nb[0]], F.map(r => r.id).filter(x => x !== 0 && x !== F[0].nb[0])];
    if (w === 3 || w === 2) {
      const ax = nrm(P.V[0]);
      const a = [], b = [];
      F.forEach(r => (dot(r.n, ax) > 0 ? a : b).push(r.id));
      return [a, b];
    }
    if (w === 5) {
      const ax = F[0].n, a = [], b = [];
      F.forEach(r => (dot(r.n, ax) > 0 ? a : b).push(r.id));
      return [a, b];
    }
    if (w === 4) {
      const ax = nrm(P.V[0]), top = [], band = [], bot = [];
      F.forEach(r => { const d = dot(r.n, ax); (d > 0.5 ? top : d < -0.5 ? bot : band).push(r.id); });
      const inBand = new Set(band), ring = [band[0]];
      while (ring.length < band.length) {
        const next = F[ring[ring.length - 1]].nb.find(x => inBand.has(x) && !ring.includes(x));
        if (next === undefined) break;
        ring.push(next);
      }
      if (ring.length !== band.length) return [top, band, bot];
      return [top, ring.slice(0, 5), ring.slice(5), bot];
    }
    return null;
  }

  // Grow compact sections by repeatedly joining the neighbouring pair with the longest shared edge.
  function autoSections(P, ids, cap, sameColor) {
    const inSet = new Set(ids);
    const owner = new Map(ids.map(i => [i, i]));
    const members = new Map(ids.map(i => [i, [i]]));
    const area = new Map(ids.map(i => [i, P.regions[i].area]));
    const adj = new Map(ids.map(i => [i, new Map()]));
    P.seams.forEach(s => {
      if (!inSet.has(s.r) || !inSet.has(s.g) || s.r === s.g) return;
      if (sameColor && !sameColor(s.r, s.g)) return;
      const m1 = adj.get(s.r), m2 = adj.get(s.g);
      m1.set(s.g, (m1.get(s.g) || 0) + s.len);
      m2.set(s.r, (m2.get(s.r) || 0) + s.len);
    });
    const ver = new Map(ids.map(i => [i, 0]));
    const heap = [];
    const push = (sc, a, b) => {
      heap.push([sc, a, b, ver.get(a), ver.get(b)]);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] >= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] > heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] > heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    const score = (a, b, shared) => shared / Math.sqrt(area.get(a) + area.get(b)) / (1 + 0.15 * (members.get(a).length + members.get(b).length));
    adj.forEach((m, a) => m.forEach((sh, b) => { if (a < b) push(score(a, b, sh), a, b); }));
    while (heap.length) {
      const [, a, b, va, vb] = pop();
      if (!members.has(a) || !members.has(b) || ver.get(a) !== va || ver.get(b) !== vb) continue;
      if (members.get(a).length + members.get(b).length > cap) continue;
      // merge b into a
      members.get(b).forEach(x => owner.set(x, a));
      members.set(a, members.get(a).concat(members.get(b)));
      members.delete(b);
      area.set(a, area.get(a) + area.get(b));
      const ma = adj.get(a), mb = adj.get(b);
      mb.forEach((sh, c) => {
        if (c === a) return;
        ma.set(c, (ma.get(c) || 0) + sh);
        const mc = adj.get(c);
        mc.set(a, (mc.get(a) || 0) + sh);
        mc.delete(b);
      });
      ma.delete(b);
      adj.delete(b);
      ver.set(a, ver.get(a) + 1);
      ma.forEach((sh, c) => {
        if (members.get(a).length + members.get(c).length <= cap) push(score(a, c, sh), Math.min(a, c), Math.max(a, c));
      });
    }
    return [...members.values()];
  }

  /* ---------------- 2D geometry ---------------- */
  const tf = (T, p) => [T.c * p[0] - T.s * p[1] + T.x, T.s * p[0] + T.c * p[1] + T.y];
  function triOverlap(A, B, eps) {
    for (const P of [A, B]) {
      for (let i = 0; i < 3; i++) {
        const a = P[i], b = P[(i + 1) % 3];
        let nx = a[1] - b[1], ny = b[0] - a[0];
        const l = Math.hypot(nx, ny);
        if (l < 1e-12) continue;
        nx /= l; ny /= l;
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        for (const v of A) { const d = v[0] * nx + v[1] * ny; if (d < a0) a0 = d; if (d > a1) a1 = d; }
        for (const v of B) { const d = v[0] * nx + v[1] * ny; if (d < b0) b0 = d; if (d > b1) b1 = d; }
        if (a1 <= b0 + eps || b1 <= a0 + eps) return false;
      }
    }
    return true;
  }
  function convexOverlap(A, B, eps) {
    for (const P of [A, B]) {
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        let nx = a[1] - b[1], ny = b[0] - a[0];
        const l = Math.hypot(nx, ny);
        if (l < 1e-12) continue;
        nx /= l; ny /= l;
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        for (const v of A) { const d = v[0] * nx + v[1] * ny; if (d < a0) a0 = d; if (d > a1) a1 = d; }
        for (const v of B) { const d = v[0] * nx + v[1] * ny; if (d < b0) b0 = d; if (d > b1) b1 = d; }
        if (a1 <= b0 + eps || b1 <= a0 + eps) return false;
      }
    }
    return true;
  }
  const bbox = pts => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return [x0, y0, x1, y1];
  };
  const boxHit = (a, b, e) => a[0] < b[2] - e && b[0] < a[2] - e && a[1] < b[3] - e && b[1] < a[3] - e;
  function placedTris(r, pts) {
    const T = [];
    for (let i = 0; i < r.tris.length; i += 3) T.push([pts[r.tris[i]], pts[r.tris[i + 1]], pts[r.tris[i + 2]]]);
    return T;
  }
  // does polygon (as triangles + bbox) overlap any region already in the piece?
  function hitsPiece(piece, tris, box, eps, skip) {
    for (const q of piece.items) {
      if (q === skip || !boxHit(box, q.box, eps)) continue;
      for (const t1 of tris) for (const t2 of q.tris) if (triOverlap(t1, t2, eps)) return true;
    }
    return false;
  }

  /* ---------------- unfolding ---------------- */
  function placeAcross(P, item, i) {
    // place the neighbour across edge i of placed region item.r
    const r = item.r, g = P.regions[r.nb[i]], j = r.mate[i];
    const k = r.loop.length;
    const Pa = item.pts[i], Pb = item.pts[(i + 1) % k];
    const m = g.loop.length;
    const Qb = g.pts[j], Qa = g.pts[(j + 1) % m];
    const th = Math.atan2(Pb[1] - Pa[1], Pb[0] - Pa[0]) - Math.atan2(Qb[1] - Qa[1], Qb[0] - Qa[0]);
    const c = Math.cos(th), s = Math.sin(th);
    const T = { c, s, x: Pa[0] - (c * Qa[0] - s * Qa[1]), y: Pa[1] - (s * Qa[0] + c * Qa[1]) };
    return makeItem(g, T);
  }
  function makeItem(r, T) {
    const pts = r.pts.map(p => tf(T, p));
    return { r, T, pts, tris: placedTris(r, pts), box: bbox(pts) };
  }
  function growPieces(P, ids, rng) {
    const remaining = new Set(ids);
    const pieces = [];
    const eps = 1e-6 * P.R;
    const order = ids.slice();
    if (rng) shuffle(order, rng);
    while (remaining.size) {
      // start from the region with the most neighbours still waiting
      let root = null, best = -1;
      for (const id of order) {
        if (!remaining.has(id)) continue;
        const r = P.regions[id];
        const sc = r.nb.filter(x => remaining.has(x)).length * 10 + r.area / (P.R * P.R);
        if (sc > best) { best = sc; root = id; }
      }
      const piece = { items: [makeItem(P.regions[root], { c: 1, s: 0, x: 0, y: 0 })], hinges: new Set() };
      piece.byRegion = new Map([[root, piece.items[0]]]);
      remaining.delete(root);
      for (;;) {
        const cands = [];
        for (const it of piece.items) {
          it.r.nb.forEach((g, i) => { if (remaining.has(g)) cands.push([it, i, P.seams[it.r.seam[i]].len]); });
        }
        if (!cands.length) break;
        if (rng) shuffle(cands, rng); else cands.sort((a, b) => b[2] - a[2]);
        let added = false;
        for (const [it, i] of cands) {
          const nItem = placeAcross(P, it, i);
          if (hitsPiece(piece, nItem.tris, nItem.box, eps)) continue;
          piece.items.push(nItem);
          piece.byRegion.set(nItem.r.id, nItem);
          piece.hinges.add(it.r.seam[i]);
          remaining.delete(nItem.r.id);
          added = true;
          break;
        }
        if (!added) break;
      }
      pieces.push(piece);
    }
    return pieces;
  }
  function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pieceSpan(p) {
    const pts = [];
    p.items.forEach(it => it.pts.forEach(v => pts.push(v)));
    let best = Infinity;
    for (let a = 0; a < 180; a += 15) {
      const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const v of pts) { const x = v[0] * c - v[1] * s, y = v[0] * s + v[1] * c; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      best = Math.min(best, Math.max(x1 - x0, y1 - y0) + 0.3 * Math.min(x1 - x0, y1 - y0));
    }
    return best;
  }
  function unfoldGroup(P, ids, seed) {
    let best = growPieces(P, ids, null);
    if (best.length === 1 || ids.length > 24) return best;
    const score = ps => ps.length * 1000 + ps.reduce((m, p) => Math.max(m, pieceSpan(p)), 0) / P.R;
    let bs = score(best);
    const rng = mulberry(seed);
    const tries = ids.length <= 8 ? 30 : 12;
    for (let t = 0; t < tries && best.length > 1; t++) {
      const ps = growPieces(P, ids, rng);
      const sc = score(ps);
      if (sc < bs) { best = ps; bs = sc; }
    }
    return best;
  }

  /* ---------------- tabs ---------------- */
  function tabPolygon(A, B, depth, angA, angB, side) {
    const dx = B[0] - A[0], dy = B[1] - A[1];
    const L = Math.hypot(dx, dy);
    const ux = dx / L, uy = dy / L;
    const nx = -uy * side, ny = ux * side;
    const ca = 1 / Math.tan(angA * Math.PI / 180), cb = 1 / Math.tan(angB * Math.PI / 180);
    let h = depth;
    if (h * (ca + cb) > L * 0.84) h = (L * 0.84) / (ca + cb);
    return [A, B, [B[0] - ux * h * cb + nx * h, B[1] - uy * h * cb + ny * h], [A[0] + ux * h * ca + nx * h, A[1] + uy * h * ca + ny * h]];
  }
  // free angle (degrees) outside the paper at vertex V, starting from direction V->W, turning by rot
  function freeAngle(piece, V, W, rot, tol) {
    const base = Math.atan2(W[1] - V[1], W[0] - V[0]);
    let best = 360;
    for (const it of piece.items) {
      const pts = it.pts, k = pts.length;
      for (let j = 0; j < k; j++) {
        if (Math.abs(pts[j][0] - V[0]) > tol || Math.abs(pts[j][1] - V[1]) > tol) continue;
        for (const Q of [pts[(j + 1) % k], pts[(j + k - 1) % k]]) {
          let a = (Math.atan2(Q[1] - V[1], Q[0] - V[0]) - base) * rot * 180 / Math.PI;
          a = ((a % 360) + 360) % 360;
          if (a > 1e-4 && a < best) best = a;
        }
      }
    }
    return best;
  }

  /* ---------------- full pattern ----------------
     opts: { model, grouping: 'large'|'easy'|'small'|'single', colors: [per region], colorSplit,
             tabStyle: 'both'|'one'|'none', tabDepthMM, tabAngle, unitMM (mm per model unit),
             area: {w, h} printable mm } */
  const CAPS = { large: 12, easy: 6, small: 3, single: 1 };
  function buildPattern(opts) {
    const P = prepare(opts.model);
    const n = P.regions.length;
    const all = P.regions.map(r => r.id);
    const colors = opts.colors;
    const sameColor = opts.colorSplit && colors ? (a, b) => colors[a] === colors[b] : null;
    let cap = Math.max(1, Math.min(CAPS[opts.grouping] || 6, Math.ceil(n / 2)));
    let groups = null;
    if (opts.grouping === 'easy') groups = platonicSections(P);
    if (groups && sameColor) {
      const split = [];
      groups.forEach(g => {
        const by = new Map();
        g.forEach(f => { if (!by.has(colors[f])) by.set(colors[f], []); by.get(colors[f]).push(f); });
        by.forEach(v => split.push(...autoSections(P, v, v.length, sameColor)));
      });
      groups = split;
    }
    if (!groups) groups = autoSections(P, all, cap, sameColor);
    const W = opts.area.w, H = opts.area.h;
    let pieces = [];
    let autoSplit = false;
    for (let iter = 0; iter < 10; iter++) {
      pieces = [];
      groups.forEach((g, gi) => unfoldGroup(P, g, 11 + gi).forEach(p => { p.group = gi; pieces.push(p); }));
      assignTabs(P, pieces, opts);
      const next = [];
      let changed = false;
      const done = new Set();
      pieces.forEach(p => {
        orientPiece(p, opts);
        if (!p.fits && p.items.length > 1) {
          changed = true;
          const ids = p.items.map(it => it.r.id);
          next.push(...autoSections(P, ids, Math.ceil(ids.length / 2), sameColor));
        } else {
          next.push(p.items.map(it => it.r.id));
        }
        done.add(p.group);
      });
      if (!changed) break;
      autoSplit = true;
      groups = next;
    }
    const warnings = [];
    if (pieces.some(p => !p.fits)) warnings.push('toobig');
    return { P, pieces, warnings, autoSplit, noTab: pieces.noTab || 0 };
  }

  function assignTabs(P, pieces, opts) {
    const where = new Map();
    pieces.forEach((p, pi) => {
      p.index = pi;
      p.tabs = [];
      p.edges = [];
      p.tabConflicts = 0;
      p.items.forEach(it => where.set(it.r.id, p));
    });
    // number the cut seams in reading order of pieces
    const label = new Map();
    let next = 0;
    pieces.forEach(p => p.items.forEach(it => it.r.seam.forEach(sid => {
      if (p.hinges.has(sid) || label.has(sid)) return;
      label.set(sid, ++next);
    })));
    const tabMM = opts.tabDepthMM;
    const depth = tabMM / opts.unitMM;
    const tol = 1e-6 * P.R;
    const eps = 1e-6 * P.R;
    const levels = [[1, 1], [0.8, 0.75], [0.62, 0.62], [0.45, 0.5], [0.3, 0.4], [0.2, 0.3], [0.12, 0.22]];
    const tabCount = new Map();
    const tryPlace = (p, it, i, forced) => {
      const k = it.pts.length;
      const A = it.pts[i], B = it.pts[(i + 1) % k];
      const side = P.side;
      let limA = 89, limB = 89;
      if (opts.tabStyle === 'both') {
        limA = Math.min(89, freeAngle(p, A, B, side, tol) / 2 - 0.5);
        limB = Math.min(89, freeAngle(p, B, A, -side, tol) / 2 - 0.5);
      } else {
        limA = Math.min(89, freeAngle(p, A, B, side, tol) - 1);
        limB = Math.min(89, freeAngle(p, B, A, -side, tol) - 1);
      }
      const mk = (dm, am) => tabPolygon(A, B, depth * dm,
        Math.max(1.5, Math.min(limA, opts.tabAngle * am)), Math.max(1.5, Math.min(limB, opts.tabAngle * am)), side);
      for (let li = 0; li < levels.length; li++) {
        const poly = mk(levels[li][0], levels[li][1]);
        const box = bbox(poly);
        let bad = false;
        for (const q of p.items) {
          if (!boxHit(box, q.box, eps)) continue;
          for (const t of q.tris) if (convexOverlap(poly, t, eps)) { bad = true; break; }
          if (bad) break;
        }
        if (!bad) for (const t of p.tabs) { if (boxHit(box, t.box, eps) && convexOverlap(poly, t.poly, eps)) { bad = true; break; } }
        if (!bad) return { poly, box, level: li };
      }
      if (!forced) return null;
      const poly = mk(levels[levels.length - 1][0], levels[levels.length - 1][1]);
      return { poly, box: bbox(poly), level: 99 };
    };
    const addTab = (p, it, i, res, sid) => {
      p.tabs.push({ region: it.r.id, i, poly: res.poly, box: res.box, seam: sid, label: label.get(sid) });
      if (res.level === 99) p.tabConflicts++;
      tabCount.set(it.r.id, (tabCount.get(it.r.id) || 0) + 1);
    };
    const hasTab = new Set();
    const noTab = new Set();
    const cutSeams = [...label.keys()].sort((a, b) => label.get(a) - label.get(b));
    const sideOf = (sid, which) => {
      const s = P.seams[sid];
      const rid = which ? s.g : s.r, i = which ? s.j : s.i;
      const p = where.get(rid);
      return { p, it: p.byRegion.get(rid), i, rid };
    };
    if (opts.tabStyle === 'both') {
      cutSeams.forEach(sid => {
        let placed = 0;
        for (const w of [0, 1]) {
          const { p, it, i, rid } = sideOf(sid, w);
          const res = tryPlace(p, it, i, false);
          if (res) { addTab(p, it, i, res, sid); hasTab.add(rid + ':' + i); placed++; }
        }
        if (!placed) noTab.add(sid);
      });
    } else if (opts.tabStyle === 'one') {
      cutSeams.forEach(sid => {
        let A = sideOf(sid, 0), B = sideOf(sid, 1);
        if ((tabCount.get(A.rid) || 0) > (tabCount.get(B.rid) || 0)) [A, B] = [B, A];
        const r1 = tryPlace(A.p, A.it, A.i, false);
        let r2 = null;
        if (!r1 || r1.level > 0) r2 = tryPlace(B.p, B.it, B.i, false);
        if (r1 && (!r2 || r1.level <= r2.level)) { addTab(A.p, A.it, A.i, r1, sid); hasTab.add(A.rid + ':' + A.i); }
        else if (r2) { addTab(B.p, B.it, B.i, r2, sid); hasTab.add(B.rid + ':' + B.i); }
        else noTab.add(sid);
      });
    }
    pieces.noTab = noTab.size;
    pieces.forEach(p => p.items.forEach(it => it.r.seam.forEach((sid, i) => {
      const s = P.seams[sid];
      if (p.hinges.has(sid)) {
        if (s.r === it.r.id && s.i === i) p.edges.push({ it, i, kind: s.valley ? 'valley' : 'fold', seam: sid });
      } else {
        p.edges.push({ it, i, kind: hasTab.has(it.r.id + ':' + i) ? 'tabfold' : 'cut', seam: sid, label: label.get(sid), valley: s.valley, tape: noTab.has(sid) });
      }
    })));
    return label;
  }

  function transformPiece(p, fn) {
    p.items.forEach(it => { it.pts = it.pts.map(fn); it.tris = placedTris(it.r, it.pts); it.box = bbox(it.pts); });
    p.tabs.forEach(t => { t.poly = t.poly.map(fn); t.box = bbox(t.poly); });
  }
  function orientPiece(p, opts) {
    const s = opts.unitMM;
    const all = [];
    p.items.forEach(it => it.pts.forEach(v => all.push(v)));
    p.tabs.forEach(t => t.poly.forEach(v => all.push(v)));
    const W = opts.area.w, H = opts.area.h;
    let best = null;
    for (let a = 0; a < 180; a += 1.5) {
      const c = Math.cos(a * Math.PI / 180), si = Math.sin(a * Math.PI / 180);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const v of all) {
        const x = (v[0] * c - v[1] * si) * s, y = (v[0] * si + v[1] * c) * s;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      const w = x1 - x0, h = y1 - y0;
      const fits = w <= W + 1e-6 && h <= H + 1e-6;
      const sc = (fits ? 0 : 1e9 + Math.max(w - W, 0) + Math.max(h - H, 0)) + w * h + h * 0.5 * Math.min(W, 200) / 10;
      if (!best || sc < best.sc - 1e-9) best = { sc, a, x0, y0, w, h, fits };
    }
    const c = Math.cos(best.a * Math.PI / 180), si = Math.sin(best.a * Math.PI / 180);
    transformPiece(p, v => [(v[0] * c - v[1] * si) * s - best.x0, (v[0] * si + v[1] * c) * s - best.y0]);
    p.w = best.w; p.h = best.h; p.fits = best.fits;
  }

  /* shelf packing: items [{w,h}] -> pages [[{item,x,y}]] */
  function packItems(items, W, H, gap) {
    const sorted = items.slice().sort((a, b) => b.h - a.h || b.w - a.w);
    const pages = [];
    for (const it of sorted) {
      let placed = false;
      for (const pg of pages) {
        for (const sh of pg.shelves) {
          if (it.h <= sh.h + 1e-6 && sh.x + it.w <= W + 1e-6) {
            pg.items.push({ item: it, x: sh.x, y: sh.y });
            sh.x += it.w + gap;
            placed = true; break;
          }
        }
        if (placed) break;
        if (pg.y + it.h <= H + 1e-6) {
          pg.shelves.push({ y: pg.y, h: it.h, x: it.w + gap });
          pg.items.push({ item: it, x: 0, y: pg.y });
          pg.y += it.h + gap;
          placed = true; break;
        }
      }
      if (!placed) pages.push({ shelves: [{ y: 0, h: it.h, x: it.w + gap }], items: [{ item: it, x: 0, y: 0 }], y: it.h + gap });
    }
    return pages.map(p => p.items);
  }

  /* rotation-invariant signature for finding identical pieces */
  function pieceSignature(p) {
    const pts = [];
    p.items.forEach(it => it.pts.forEach(v => pts.push(v)));
    p.tabs.forEach(t => t.poly.forEach(v => pts.push(v)));
    let cx = 0, cy = 0;
    pts.forEach(v => { cx += v[0]; cy += v[1]; });
    cx /= pts.length; cy /= pts.length;
    const d = pts.map(v => Math.round(Math.hypot(v[0] - cx, v[1] - cy) * 4) / 4).sort((a, b) => a - b);
    return p.items.length + '|' + p.tabs.length + '|' + d.join(',');
  }

  /* ---------------- colour patterns ---------------- */
  function colorScheme(P, scheme) {
    const F = P.regions, n = F.length;
    if (scheme === 'type') return F.map(r => r.type);
    if (scheme === 'part') return F.map(r => r.comp);
    if (scheme === 'each') return F.map((r, i) => i);
    if (scheme === 'parallel') {
      const axes = [];
      return F.map(r => {
        let k = axes.findIndex(a => Math.abs(dot(a, r.n)) > 1 - 1e-6);
        if (k < 0) { axes.push(r.n); k = axes.length - 1; }
        return k;
      });
    }
    if (scheme === 'neighbors') {
      // DSATUR graph colouring of touching faces
      const col = new Array(n).fill(-1);
      const sat = F.map(() => new Set());
      const deg = F.map(r => new Set(r.nb).size);
      for (let step = 0; step < n; step++) {
        let best = -1;
        for (let i = 0; i < n; i++) {
          if (col[i] >= 0) continue;
          if (best < 0 || sat[i].size > sat[best].size || (sat[i].size === sat[best].size && deg[i] > deg[best])) best = i;
        }
        let c = 0;
        while (sat[best].has(c)) c++;
        col[best] = c;
        F[best].nb.forEach(g => sat[g].add(c));
      }
      return col;
    }
    return F.map(() => 0);
  }

  function centroid(p) { let x = 0, y = 0; p.forEach(v => { x += v[0]; y += v[1]; }); return [x / p.length, y / p.length]; }

  return { prepare, buildPattern, packItems, pieceSignature, colorScheme, centroid, tabPolygon, triOverlap, convexOverlap };
})();
if (typeof module !== 'undefined') module.exports = Engine;
