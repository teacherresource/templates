/* Paper Polyhedra: everything on screen. Uses MODELS (data), Engine (engine.js) and Viewer (viewer.js). */
(function () {
'use strict';
const $ = id => document.getElementById(id);
const MM_PER_IN = 25.4;
const BY_W = new Map(MODELS.map(m => [m.w, m]));
const PAPERS = {
  letter: { label: 'Letter (8.5 × 11 in)', w: 215.9, h: 279.4 },
  legal: { label: 'Legal (8.5 × 14 in)', w: 215.9, h: 355.6 },
  tabloid: { label: 'Tabloid (11 × 17 in)', w: 279.4, h: 431.8 },
  cp9: { label: 'Construction paper 9 × 12 in', w: 228.6, h: 304.8, noPrint: true },
  cp12: { label: 'Construction paper 12 × 18 in', w: 304.8, h: 457.2, noPrint: true },
  a4: { label: 'A4 (210 × 297 mm)', w: 210, h: 297 },
  a3: { label: 'A3 (297 × 420 mm)', w: 297, h: 420 }
};
const MARGINS = [3.175, 6.35, 12.7];
const DEFAULT_PALETTE = [
  { name: 'Red', hex: '#D1352B' }, { name: 'Orange', hex: '#EF8A23' }, { name: 'Yellow', hex: '#F5CC3A' }, { name: 'Green', hex: '#3B9A4F' }, { name: 'Blue', hex: '#2E6BB4' },
  { name: 'Purple', hex: '#7A4A9E' }, { name: 'Pink', hex: '#EC7EAC' }, { name: 'Brown', hex: '#8A5A3A' }, { name: 'Black', hex: '#2B2B2B' }, { name: 'White', hex: '#F3F2EC' }
];
const DEFAULTS = {
  w: 5, units: 'in', sizeBy: 'across', across: 127, edge: 38.1, paper: 'letter', orient: 'portrait', margin: 6.35,
  grouping: 'easy', tabStyle: 'both', tabDepth: 6.35, tabAngle: 40,
  scheme: 'piece', colorSplit: true, fill: 'none', labels: 'both', letters: true, scaleBar: true, output: 'pattern',
  palette: DEFAULT_PALETTE, sel: 0, custom: {}, spin: true, nums: false, seams: true, theme: 'auto', big: false
};
const HEADER = 9, FOOTER = 5, GAP = 3;
const STORE = 'paper-polyhedra-v1';
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const GROUP_ONE = {
  'Platonic solids': 'Platonic solid', 'Archimedean solids': 'Archimedean solid', 'Kepler–Poinsot solids': 'Kepler–Poinsot solid',
  'Stellations of the octahedron': 'Stellation of the octahedron', 'Stellations of the icosahedron': 'Stellation of the icosahedron',
  'Stellations of the cuboctahedron': 'Stellation of the cuboctahedron', 'Stellations of the icosidodecahedron': 'Stellation of the icosidodecahedron',
  'Uniform star polyhedra': 'Uniform star polyhedron'
};
const GROUP_NOTE = {
  'Platonic solids': 'Five solids made of one kind of regular polygon, the same number meeting at every corner.',
  'Archimedean solids': 'Thirteen solids made of two or more kinds of regular polygon, with every corner alike.',
  'Kepler–Poinsot solids': 'The four regular star polyhedra.',
  'Stellations of the octahedron': 'Made by extending the faces of the octahedron until they meet again.',
  'Stellations of the icosahedron': 'Made by extending the 20 faces of the icosahedron. Several are compounds of simpler solids.',
  'Stellations of the cuboctahedron': 'Made by extending the 14 faces of the cuboctahedron.',
  'Stellations of the icosidodecahedron': 'Made by extending the 32 faces of the icosidodecahedron.',
  'Uniform star polyhedra': 'Polyhedra whose faces are regular polygons or regular stars, with every corner alike. Many faces pass through each other, so the paper model shows only the outside.'
};
const GROUPS = Object.keys(GROUP_NOTE).filter(g => MODELS.some(m => m.group === g));

let state = JSON.parse(JSON.stringify(DEFAULTS));
if (reduceMotion) state.spin = false;
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved && typeof saved === 'object') {
    for (const k of Object.keys(DEFAULTS)) if (saved[k] !== undefined && typeof saved[k] === typeof DEFAULTS[k]) state[k] = saved[k];
    if (!Array.isArray(state.palette) || state.palette.length !== 10) state.palette = JSON.parse(JSON.stringify(DEFAULT_PALETTE));
    if (!BY_W.has(state.w)) state.w = DEFAULTS.w;
    if (!PAPERS[state.paper]) state.paper = DEFAULTS.paper;
    if (!['large', 'easy', 'small', 'single'].includes(state.grouping)) state.grouping = 'easy';
  }
} catch (e) { /* storage unavailable: use defaults */ }
function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ } }

/* ---------- helpers ---------- */
const fmtLen = (mm, digits) => state.units === 'in'
  ? (+(mm / MM_PER_IN).toFixed(digits ?? 2)).toString() + ' in'
  : (+mm.toFixed(digits ?? 0)).toString() + ' mm';
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(hex, t) { const [r, g, b] = hexToRgb(hex); const m = c => Math.round(c * t + 255 * (1 - t)); return '#' + [m(r), m(g), m(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
function lum(hex) { const [r, g, b] = hexToRgb(hex).map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
const pal = i => state.palette[((i % state.palette.length) + state.palette.length) % state.palette.length];
const letterOf = i => { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const an = s => (/^[aeiou]/i.test(s) ? 'an ' : 'a ') + s;
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2600); }
function level(n) { return n <= 20 ? 'Starter' : n <= 100 ? 'Intermediate' : n <= 400 ? 'Advanced' : 'Expert'; }

function paperDims() { const p = PAPERS[state.paper]; return state.orient === 'portrait' ? { w: Math.min(p.w, p.h), h: Math.max(p.w, p.h) } : { w: Math.max(p.w, p.h), h: Math.min(p.w, p.h) }; }
function printArea() { const d = paperDims(), m = state.margin; return { w: d.w - 2 * m, h: d.h - 2 * m - HEADER - FOOTER }; }
const model = () => BY_W.get(state.w);
const prep = () => Engine.prepare(model());
// millimeters per model unit
function unitMM() {
  const m = model(), P = prep();
  return state.sizeBy === 'edge' ? state.edge / m.ref : state.across / (2 * P.R);
}
const acrossMM = () => 2 * prep().R * unitMM();
const edgeMM = () => model().ref * unitMM();

function schemeColors(P) {
  const m = P.m;
  let s = state.scheme;
  if (s === 'part' && !m.parts) s = 'type';
  if (s === 'custom') {
    const c = state.custom['w' + m.w];
    if (Array.isArray(c) && c.length === P.regions.length) return c.slice();
    return Engine.colorScheme(P, m.parts ? 'part' : 'type');
  }
  if (s === 'piece') return null;
  if (s === 'single') return P.regions.map(() => state.sel);
  return Engine.colorScheme(P, s);
}

/* ---------- compute ---------- */
let R = null;
function compute() {
  const P = prep();
  let colors = schemeColors(P);
  const res = Engine.buildPattern({
    model: model(), grouping: state.grouping, colors, colorSplit: state.colorSplit && !!colors,
    tabStyle: state.tabStyle, tabDepthMM: state.tabDepth, tabAngle: state.tabAngle,
    unitMM: unitMM(), area: printArea()
  });
  if (!colors) { colors = new Array(P.regions.length); res.pieces.forEach((p, i) => p.items.forEach(it => { colors[it.r.id] = i; })); }
  res.colors = colors;
  res.pieces.forEach(p => { p.color = colors[p.items[0].r.id]; p.mono = p.items.every(it => colors[it.r.id] === p.color); });
  res.split = state.colorSplit && state.scheme !== 'piece' && res.pieces.every(p => p.mono);
  res.hinge = new Set();
  res.labelOf = new Map();
  res.pieces.forEach(p => {
    p.hinges.forEach(s => res.hinge.add(s));
    p.edges.forEach(e => { if (e.label) res.labelOf.set(e.seam, e.label); });
  });
  res.valleyFolds = res.pieces.some(p => p.edges.some(e => e.kind === 'valley'));
  const lens = P.seams.map(s => s.len).sort((a, b) => a - b);
  res.medianEdgeMM = lens[Math.floor(lens.length / 2)] * unitMM();
  res.minEdgeMM = P.minEdge * unitMM();
  const area = printArea();
  let items = res.pieces;
  if (state.output === 'template') {
    const bySig = new Map();
    res.pieces.forEach(p => {
      const sig = Engine.pieceSignature(p);
      if (!bySig.has(sig)) bySig.set(sig, { rep: p, count: 0, colors: {} });
      const g = bySig.get(sig);
      g.count++;
      g.colors[p.color] = (g.colors[p.color] || 0) + 1;
    });
    items = [...bySig.values()].map(g => { g.rep.tmpl = g; return g.rep; });
  }
  res.pages = [];
  if (state.output === 'pattern' && res.split) {
    const byColor = {};
    items.forEach(p => { (byColor[p.color] = byColor[p.color] || []).push(p); });
    Object.keys(byColor).map(Number).sort((a, b) => a - b).forEach(c => {
      Engine.packItems(byColor[c], area.w, area.h, GAP).forEach(pg => res.pages.push({ items: pg, color: c }));
    });
  } else {
    Engine.packItems(items, area.w, area.h, GAP).forEach(pg => res.pages.push({ items: pg, color: null }));
  }
  let li = 0;
  res.regionLetter = new Map();
  res.pages.forEach(pg => {
    pg.items.sort((a, b) => a.y - b.y || a.x - b.x);
    pg.items.forEach(it => { it.item.letter = letterOf(li++); it.item.items.forEach(x => res.regionLetter.set(x.r.id, it.item.letter)); });
  });
  R = res;
  return res;
}

/* ---------- sheet primitives (mm) ---------- */
const STROKE = {
  cut: { stroke: '#111', w: 0.35 },
  fold: { stroke: '#555', w: 0.3, dash: [2.2, 1.4] },
  valley: { stroke: '#555', w: 0.3, dash: [3.2, 1.1, 0.5, 1.1] }
};
function sheetPrims(page, idx, total) {
  const d = paperDims(), m = state.margin;
  const prims = [];
  const title = 'W' + model().w + ' ' + model().name + (state.output === 'template' ? ', tracing templates' : '') + ', sheet ' + (idx + 1) + ' of ' + total;
  prims.push({ t: 'text', x: m, y: m + 3.2, s: 3.6, str: title, color: '#222', weight: 'bold', anchor: 'start' });
  let rx = d.w - m;
  if (state.scaleBar) {
    const L = state.units === 'in' ? 25.4 : 20;
    const lbl = state.units === 'in' ? '1 in' : '2 cm';
    prims.push({ t: 'line', a: [rx - L, m + 2], b: [rx, m + 2], stroke: '#222', w: 0.4 });
    prims.push({ t: 'line', a: [rx - L, m + 0.6], b: [rx - L, m + 3.4], stroke: '#222', w: 0.4 });
    prims.push({ t: 'line', a: [rx, m + 0.6], b: [rx, m + 3.4], stroke: '#222', w: 0.4 });
    prims.push({ t: 'text', x: rx - L / 2, y: m + 5.6, s: 2.3, str: 'should measure ' + lbl, color: '#444', anchor: 'middle' });
    rx -= L + 5;
  }
  if (page.color !== null && page.color !== undefined) {
    const c = pal(page.color);
    const txt = c.name + ' paper';
    const tw = txt.length * 1.75;
    prims.push({ t: 'text', x: rx, y: m + 3.2, s: 3.2, str: txt, color: '#222', weight: 'bold', anchor: 'end' });
    prims.push({ t: 'poly', pts: [[rx - tw - 6, m + 0.6], [rx - tw - 1.5, m + 0.6], [rx - tw - 1.5, m + 5.1], [rx - tw - 6, m + 5.1]], fill: c.hex, stroke: '#222', w: 0.25 });
  }
  const valleyNote = R.valleyFolds ? ' Dash-dot: valley fold (crease toward you).' : '';
  const foot = state.output === 'template'
    ? 'Trace around the outline onto colored paper. Solid line: cut. Dashed line: fold away from you.' + valleyNote
    : 'Solid line: cut. Dashed line: fold away from you.' + valleyNote + ' Glue matching numbers together.';
  prims.push({ t: 'text', x: m, y: d.h - m - 1, s: 2.4, str: foot, color: '#555', anchor: 'start' });

  const ox = m, oy = m + HEADER;
  const fsBase = Math.max(1.8, Math.min(5, R.medianEdgeMM * 0.085));
  const polys = [], lines = [], texts = [];
  const showNums = state.output === 'pattern' && state.labels !== 'off';
  page.items.forEach(({ item: p, x, y }) => {
    const T = v => [v[0] + ox + x, v[1] + oy + y];
    const faceFill = rid => {
      const c = pal(R.colors[rid]).hex;
      if (state.fill === 'full') return c;
      if (state.fill === 'tint') return mix(c, 0.28);
      return '#ffffff';
    };
    p.tabs.forEach(t => {
      const c = pal(R.colors[t.region]).hex;
      const fill = state.fill === 'full' ? mix(c, 0.5) : state.fill === 'tint' ? mix(c, 0.12) : '#ffffff';
      const Q = t.poly.map(T);
      polys.push({ t: 'poly', pts: Q, fill, face: t.region });
      for (let k = 1; k < 4; k++) lines.push({ t: 'line', a: Q[k], b: Q[(k + 1) % 4], ...STROKE.cut });
      if (showNums) {
        const A = Q[0], B = Q[1];
        const mid = [(Q[0][0] + Q[1][0] + Q[2][0] + Q[3][0]) / 4, (Q[0][1] + Q[1][1] + Q[2][1] + Q[3][1]) / 4];
        const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
        const h = Math.abs((B[0] - A[0]) * (Q[3][1] - A[1]) - (B[1] - A[1]) * (Q[3][0] - A[0])) / L;
        const s = Math.min(fsBase, h * 0.72, L * 0.3);
        if (s >= 0.9) texts.push({ t: 'text', x: mid[0], y: mid[1], s, str: String(t.label), color: '#333', anchor: 'middle', ang: readAngle(A, B), weight: 'bold' });
      }
    });
    // biggest region gets the piece letter
    let big = p.items[0];
    p.items.forEach(it => { if (it.r.area > big.r.area) big = it; });
    p.items.forEach(it => {
      const Q = it.pts.map(T);
      const fillHex = faceFill(it.r.id);
      polys.push({ t: 'poly', pts: Q, fill: fillHex, face: it.r.id });
      const C = labelPoint(it, T);
      let cy = C[1];
      const fs = Math.min(fsBase, Math.sqrt(it.r.area) * unitMM() * 0.25);
      if (state.letters && it === big && state.output === 'pattern') {
        texts.push({ t: 'text', x: C[0], y: cy, s: Math.max(1.6, fs * 1.7), str: p.letter, color: lum(fillHex) < 0.25 ? '#dddddd' : '#8a8a8a', anchor: 'middle', weight: 'bold' });
        cy += fs * 1.5;
      }
      if (state.output === 'pattern' && !R.split && state.fill === 'none' && state.scheme !== 'single' && fs >= 1.6) {
        texts.push({ t: 'text', x: C[0], y: cy, s: fs * 0.8, str: pal(R.colors[it.r.id]).name, color: '#777', anchor: 'middle' });
      }
      if (state.output === 'template' && it === big && p.tmpl) {
        const g = p.tmpl;
        const s1 = Math.max(1.8, fs * 1.3), s2 = Math.max(1.5, fs * 0.8);
        texts.push({ t: 'text', x: C[0], y: C[1] - s1 * 0.3, s: s1, str: 'Cut ' + g.count, color: '#333', anchor: 'middle', weight: 'bold' });
        const parts = Object.keys(g.colors).map(Number).sort((a, b) => a - b).map(c => g.colors[c] + ' ' + pal(c).name);
        const maxLen = Math.max(8, Math.floor(Math.sqrt(it.r.area) * unitMM() * 1.2 / (s2 * 0.55)));
        let line = '', ly = C[1] + s1 * 0.8;
        parts.forEach(part => {
          const add = (line ? ', ' : '') + part;
          if ((line + add).length > maxLen && line) { texts.push({ t: 'text', x: C[0], y: ly, s: s2, str: line + ',', color: '#555', anchor: 'middle' }); ly += s2 * 1.2; line = part; }
          else line += add;
        });
        if (line) texts.push({ t: 'text', x: C[0], y: ly, s: s2, str: line, color: '#555', anchor: 'middle' });
      }
    });
    p.edges.forEach(e => {
      const pts = e.it.pts, k = pts.length;
      const A = T(pts[e.i]), B = T(pts[(e.i + 1) % k]);
      const st = e.kind === 'cut' ? STROKE.cut : e.kind === 'valley' ? STROKE.valley : STROKE.fold;
      lines.push({ t: 'line', a: A, b: B, ...st });
      if (showNums && state.labels === 'both' && e.label) {
        const C = labelPoint(e.it, T);
        const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
        const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
        // step inward from the middle of the edge
        let nx = -(B[1] - A[1]) / L, ny = (B[0] - A[0]) / L;
        if (nx * (C[0] - M[0]) + ny * (C[1] - M[1]) < 0) { nx = -nx; ny = -ny; }
        const s = Math.min(fsBase * 0.85, L * 0.3);
        if (s < 0.9) return;
        const off = s * 1.05;
        const fillHex = faceFill(e.it.r.id);
        texts.push({ t: 'text', x: M[0] + nx * off, y: M[1] + ny * off, s, str: String(e.label), color: lum(fillHex) < 0.25 ? '#eeeeee' : '#555555', anchor: 'middle', ang: readAngle(A, B) });
      }
    });
  });
  return prims.concat(polys, lines, texts);
}
// a point well inside a placed region: centroid of its largest triangle
function labelPoint(it, T) {
  let best = null, ba = -1;
  const t = it.r.tris;
  for (let i = 0; i < t.length; i += 3) {
    const a = it.pts[t[i]], b = it.pts[t[i + 1]], c = it.pts[t[i + 2]];
    const ar = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
    if (ar > ba) { ba = ar; best = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]; }
  }
  return T(best);
}
function readAngle(A, B) {
  let a = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI;
  if (a > 90) a -= 180; if (a <= -90) a += 180;
  return a;
}

function primsToSVG(prims, forScreen) {
  const d = paperDims();
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.w} ${d.h}" ${forScreen ? '' : `width="${d.w}mm" height="${d.h}mm"`} font-family="Helvetica, Arial, sans-serif">`);
  if (!forScreen) out.push(`<rect width="${d.w}" height="${d.h}" fill="#fff"/>`);
  const f = n => +n.toFixed(3);
  for (const p of prims) {
    if (p.t === 'poly') {
      out.push(`<polygon points="${p.pts.map(v => f(v[0]) + ',' + f(v[1])).join(' ')}" fill="${p.fill}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.w}"` : ''}${p.face !== undefined && forScreen ? ` class="fc" data-face="${p.face}"` : ''}/>`);
    } else if (p.t === 'line') {
      out.push(`<line x1="${f(p.a[0])}" y1="${f(p.a[1])}" x2="${f(p.b[0])}" y2="${f(p.b[1])}" stroke="${p.stroke}" stroke-width="${p.w}" stroke-linecap="round"${p.dash ? ` stroke-dasharray="${p.dash.join(' ')}"` : ''}${forScreen ? ' pointer-events="none"' : ''}/>`);
    } else if (p.t === 'text') {
      const anchor = p.anchor === 'start' ? 'start' : p.anchor === 'end' ? 'end' : 'middle';
      const base = p.anchor === 'middle' ? ' dominant-baseline="central"' : '';
      const rot = p.ang ? ` transform="rotate(${f(p.ang)} ${f(p.x)} ${f(p.y)})"` : '';
      out.push(`<text x="${f(p.x)}" y="${f(p.y)}" font-size="${f(p.s)}" fill="${p.color}" text-anchor="${anchor}"${base}${p.weight ? ' font-weight="700"' : ''}${rot}${forScreen ? ' pointer-events="none"' : ''}>${esc(p.str)}</text>`);
    }
  }
  out.push('</svg>');
  return out.join('');
}

function primsToPDF(doc, prims) {
  const PT = 72 / 25.4;
  for (const p of prims) {
    if (p.t === 'poly') {
      doc.setLineDashPattern([], 0);
      doc.setFillColor(p.fill);
      if (p.stroke) { doc.setDrawColor(p.stroke); doc.setLineWidth(p.w); }
      const deltas = [];
      for (let i = 1; i < p.pts.length; i++) deltas.push([p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]]);
      doc.lines(deltas, p.pts[0][0], p.pts[0][1], [1, 1], p.stroke ? 'FD' : 'F', true);
    } else if (p.t === 'line') {
      doc.setDrawColor(p.stroke); doc.setLineWidth(p.w);
      doc.setLineDashPattern(p.dash || [], 0);
      doc.line(p.a[0], p.a[1], p.b[0], p.b[1]);
    } else if (p.t === 'text') {
      doc.setFont('helvetica', p.weight ? 'bold' : 'normal');
      doc.setFontSize(p.s * PT);
      doc.setTextColor(p.color);
      const w = doc.getTextWidth(p.str);
      const a = (p.ang || 0) * Math.PI / 180;
      const dir = [Math.cos(a), Math.sin(a)], down = [-Math.sin(a), Math.cos(a)];
      const shift = p.anchor === 'middle' ? -w / 2 : p.anchor === 'end' ? -w : 0;
      const vshift = p.anchor === 'middle' ? p.s * 0.35 : 0;
      const x = p.x + dir[0] * shift + down[0] * vshift;
      const y = p.y + dir[1] * shift + down[1] * vshift;
      doc.text(p.str, x, y, p.ang ? { angle: -p.ang } : undefined);
    }
  }
  doc.setLineDashPattern([], 0);
}

/* ---------- downloads ---------- */
let downloadsNS;
const downloadsReady = (window.claude && typeof window.claude.use === 'function')
  ? window.claude.use('downloads').then(ns => { downloadsNS = ns; return ns; }).catch(() => { downloadsNS = null; return null; })
  : Promise.resolve(undefined).then(() => { downloadsNS = undefined; });
async function saveFile(filename, data) {
  await downloadsReady;
  if (downloadsNS) {
    try { await downloadsNS.save({ filename, data }); toast('Saved ' + filename); }
    catch (e) {
      const code = e && e.code;
      if (code === 'declined') return;
      if (code === 'rate_limited') toast('A save prompt is already open.');
      else toast('This file could not be saved here.');
    }
    return;
  }
  if (downloadsNS === null) { toast('Downloads are not available in this view.'); return; }
  const blob = data instanceof Blob ? data : new Blob([data]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function baseName() {
  const slug = model().name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return 'w' + model().w + '-' + slug + '-' + (state.output === 'template' ? 'templates' : 'pattern');
}
async function downloadPDF() {
  if (!window.jspdf) { toast('The PDF tool did not load. Try reloading the page.'); return; }
  const d = paperDims();
  const orientation = d.w > d.h ? 'landscape' : 'portrait';
  const doc = new window.jspdf.jsPDF({ orientation, unit: 'mm', format: [d.w, d.h] });
  R.pages.forEach((pg, i) => {
    if (i > 0) doc.addPage([d.w, d.h], orientation);
    primsToPDF(doc, sheetPrims(pg, i, R.pages.length));
  });
  doc.setProperties({ title: 'W' + model().w + ' ' + model().name + ' paper model' });
  await saveFile(baseName() + '.pdf', doc.output('blob'));
}

/* ---------- 3D viewer ---------- */
const viewer = Viewer.create($('view3d'), $('viewLabels'));
if (!viewer) { $('noGL').hidden = false; $('view3d').hidden = true; }
let viewerModel = 0;
let hoverFace = -1, dragging = null, lastT = 0, labelTick = 0, needsDraw = true;
function regionHex() { return R.colors.map(c => pal(c).hex); }
function syncViewer() {
  if (!viewer) return;
  const P = prep();
  if (viewerModel !== P.m.w) { viewer.setModel(P); viewerModel = P.m.w; }
  viewer.setColors(regionHex());
  const lines = P.seams.map(s => {
    const cut = !R.hinge.has(s.id);
    if (!state.seams) return { a: s.a, b: s.b, color: [0.06, 0.08, 0.07], width: 0.9 };
    return cut ? { a: s.a, b: s.b, color: [0.05, 0.06, 0.06], width: 1.6 } : { a: s.a, b: s.b, color: [0.35, 0.38, 0.37], width: 0.55 };
  });
  viewer.setLines(lines);
  needsDraw = true;
}
function viewLabels() {
  if (!state.nums || state.output !== 'pattern') return null;
  const P = prep();
  return P.seams.filter(s => R.labelOf.has(s.id)).map(s => ({ a: s.a, b: s.b, r: s.r, g: s.g, text: String(R.labelOf.get(s.id)) }));
}
function render3D(withLabels) {
  if (!viewer || !R) return;
  viewer.hover = hoverFace;
  viewer.draw();
  if (withLabels) viewer.drawLabels(viewLabels());
}
const cv = $('view3d');
cv.addEventListener('pointerdown', e => { dragging = { x: e.clientX, y: e.clientY, moved: 0 }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => {
  if (!viewer) return;
  if (dragging) {
    const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
    dragging.moved += Math.abs(dx) + Math.abs(dy);
    dragging.x = e.clientX; dragging.y = e.clientY;
    viewer.rotate(dx * 0.01, dy * 0.01);
    needsDraw = true;
  } else {
    const f = viewer.pickAt(e.clientX, e.clientY);
    if (f !== hoverFace) setHover(f);
  }
});
cv.addEventListener('pointerup', e => {
  if (dragging && dragging.moved < 5 && viewer) { const f = viewer.pickAt(e.clientX, e.clientY); if (f >= 0) paintFace(f); }
  dragging = null;
  needsDraw = true;
});
cv.addEventListener('pointerleave', () => { if (!dragging) setHover(-1); });
cv.addEventListener('keydown', e => {
  const k = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] }[e.key];
  if (!k || !viewer) return;
  e.preventDefault();
  viewer.rotate(k[0], k[1]);
  needsDraw = true;
});
function tick(t) {
  const spinning = state.spin && !dragging && hoverFace < 0 && viewer;
  if (spinning) {
    const dt = lastT ? Math.min(50, t - lastT) : 16;
    viewer.rotate(dt * 0.00035, 0);
    labelTick++;
    render3D(state.nums && labelTick % 8 === 0);
    if (!state.nums) viewer.drawLabels(null);
    needsDraw = false;
  } else if (needsDraw) {
    render3D(true);
    needsDraw = false;
  }
  lastT = t;
  requestAnimationFrame(tick);
}
new ResizeObserver(() => { needsDraw = true; }).observe(cv);

function setHover(f) {
  hoverFace = f;
  document.querySelectorAll('#sheets .fc.hl').forEach(n => n.classList.remove('hl'));
  const cap = $('caption');
  if (f >= 0 && R) {
    document.querySelectorAll(`#sheets .fc[data-face="${f}"]`).forEach(n => n.classList.add('hl'));
    const parts = ['Face ' + (f + 1)];
    if (state.output === 'pattern' && R.regionLetter.has(f)) parts.push('piece ' + R.regionLetter.get(f));
    parts.push(pal(R.colors[f]).name);
    const P = prep();
    if (P.m.parts) parts.push('part of ' + an(P.m.parts[P.regions[f].comp]));
    cap.textContent = parts.join(', ') + '. Click to paint it ' + pal(state.sel).name.toLowerCase() + '.';
  } else {
    cap.textContent = 'Drag to turn the model. Click a face to paint it.';
  }
  needsDraw = true;
}
function paintFace(f) {
  const P = prep();
  const key = 'w' + state.w;
  if (state.scheme !== 'custom' || !Array.isArray(state.custom[key]) || state.custom[key].length !== P.regions.length) {
    state.custom[key] = R.colors.map(c => ((c % 10) + 10) % 10);
    state.scheme = 'custom';
  }
  state.custom[key][f] = state.sel;
  update();
  setHover(f);
}

/* ---------- thumbnails ---------- */
const thumbCanvas = $('thumbGL');
const thumbViewer = Viewer.create(thumbCanvas, null);
const thumbCache = new Map();
function thumbImage(w) {
  if (!thumbViewer) return null;
  if (thumbCache.has(w)) return thumbCache.get(w);
  const m = BY_W.get(w), P = Engine.prepare(m);
  thumbViewer.setModel(P);
  const col = Engine.colorScheme(P, m.parts ? 'part' : 'type');
  thumbViewer.setColors(col.map(c => DEFAULT_PALETTE[[4, 0, 2, 3, 1, 5, 6, 7, 9, 8][c % 10]].hex));
  thumbViewer.setLines(P.seams.map(s => ({ a: s.a, b: s.b, color: [0.08, 0.1, 0.09], width: P.regions.length > 400 ? 0.35 : 0.7 })));
  thumbViewer.draw();
  const img = document.createElement('canvas');
  img.width = thumbCanvas.width; img.height = thumbCanvas.height;
  img.getContext('2d').drawImage(thumbCanvas, 0, 0);
  thumbCache.set(w, img);
  return img;
}
function paintThumb(target, w) {
  const img = thumbImage(w);
  const c = target.getContext('2d');
  c.clearRect(0, 0, target.width, target.height);
  if (img) c.drawImage(img, 0, 0, target.width, target.height);
}

/* ---------- model browser ---------- */
let filterGroup = 'all';
const dlg = $('browser');
function modelMatches(m, q) {
  if (filterGroup !== 'all' && m.group !== filterGroup) return false;
  if (!q) return true;
  q = q.toLowerCase().trim();
  if (/^w?\d+$/.test(q)) return String(m.w) === q.replace(/^w/, '');
  return (m.name + ' ' + (m.alt || []).join(' ') + ' ' + m.group).toLowerCase().includes(q);
}
let thumbQueue = [], thumbTimer = null;
function queueThumb(cnv, w) {
  thumbQueue.push([cnv, w]);
  if (!thumbTimer) thumbTimer = setTimeout(drainThumbs, 0);
}
function drainThumbs() {
  thumbTimer = null;
  const t0 = performance.now();
  while (thumbQueue.length && performance.now() - t0 < 40) { const [c, w] = thumbQueue.shift(); paintThumb(c, w); }
  if (thumbQueue.length) thumbTimer = setTimeout(drainThumbs, 16);
}
const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  entries.forEach(en => { if (en.isIntersecting) { io.unobserve(en.target); queueThumb(en.target, +en.target.dataset.w); } });
}, { root: $('browserGrid'), rootMargin: '200px' }) : null;
function renderBrowser() {
  const q = $('browserSearch').value;
  const box = $('browserGrid');
  box.innerHTML = '';
  let shown = 0;
  GROUPS.forEach(g => {
    const list = MODELS.filter(m => m.group === g && modelMatches(m, q));
    if (!list.length) return;
    const h = document.createElement('h3'); h.textContent = g; box.appendChild(h);
    const note = document.createElement('p'); note.className = 'gnote'; note.textContent = GROUP_NOTE[g] || ''; box.appendChild(note);
    const grid = document.createElement('div'); grid.className = 'grid'; box.appendChild(grid);
    list.forEach(m => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mcell';
      if (m.w === state.w) b.setAttribute('aria-current', 'true');
      const c = document.createElement('canvas'); c.width = 192; c.height = 192; c.dataset.w = m.w; c.setAttribute('aria-hidden', 'true');
      const n = m.R.length;
      b.append(c);
      b.insertAdjacentHTML('beforeend', `<span class="w">W${m.w}</span><b>${esc(m.name)}</b><span class="lvl">${plural(n, 'face')} · ${level(n)}</span>`);
      b.addEventListener('click', () => { selectModel(m.w); dlg.close(); });
      grid.appendChild(b);
      if (io) io.observe(c); else queueThumb(c, m.w);
      shown++;
    });
  });
  if (!shown) box.innerHTML = '<p class="empty">No models match that search.</p>';
}
function renderFilters() {
  const box = $('browserFilters'); box.innerHTML = '';
  [['all', 'All 119']].concat(GROUPS.map(g => [g, g])).forEach(([v, lbl]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'fchip'; b.textContent = lbl;
    b.setAttribute('aria-pressed', v === filterGroup);
    b.addEventListener('click', () => { filterGroup = v; renderFilters(); renderBrowser(); });
    box.appendChild(b);
  });
}
function openBrowser() {
  renderFilters();
  renderBrowser();
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  const cur = $('browserGrid').querySelector('[aria-current="true"]');
  if (cur) cur.scrollIntoView({ block: 'center' });
  $('browserSearch').focus();
}
function selectModel(w) {
  if (!BY_W.has(w)) return;
  state.w = w;
  hoverFace = -1;
  if (viewer) viewer.reset();
  update();
}

/* ---------- controls ---------- */
function segment(id, key, after) {
  $(id).querySelectorAll('button').forEach(b => {
    b.type = 'button';
    b.addEventListener('click', () => { const prev = state[key]; state[key] = b.dataset.v; if (after) after(prev); update(); });
  });
}
function syncSeg(id, val) { $(id).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === val)); }
function radioGroup(id, name, key, options) {
  const box = $(id); box.innerHTML = '';
  options.forEach(o => {
    const l = document.createElement('label'); l.className = 'choice';
    l.innerHTML = `<input type="radio" name="${name}" value="${o.v}"><b></b><span></span>`;
    l.querySelector('b').textContent = o.title;
    l.querySelector('span').textContent = o.desc;
    l.querySelector('input').addEventListener('change', () => { state[key] = o.v; update(); });
    box.appendChild(l);
  });
}
const EASY_DESC = {
  1: 'Two diamonds of two triangles that wrap around each other.',
  2: 'Two four-triangle pyramids that glue base to base.',
  3: 'Two corner pieces of three squares each.',
  4: 'Two five-triangle caps and two five-triangle strips for the middle.',
  5: 'Two six-pentagon flowers that close into bowls.'
};
function groupingOptions() {
  const n = model().R.length;
  const cap = c => Math.min(c, Math.ceil(n / 2));
  return [
    { v: 'large', title: 'Large sections', desc: `Up to ${cap(12)} faces each. Fewer pieces, more folding in each.` },
    { v: 'easy', title: 'Easy sections (recommended)', desc: EASY_DESC[state.w] || `Compact sections of up to ${cap(6)} faces.` },
    { v: 'small', title: 'Small pieces', desc: `Up to ${cap(3)} faces each. More gluing, easier handling.` },
    { v: 'single', title: 'Single faces', desc: 'Every face is its own piece. Most flexible for colors.' }
  ];
}
const TAB_OPTS = [
  { v: 'both', title: 'Tabs on both sides', desc: 'Each seam has two tabs glued back to back. The most forgiving way to build.' },
  { v: 'one', title: 'One tab per seam', desc: 'Each tab slips under the neighboring face. Cleaner, needs a little more care.' },
  { v: 'none', title: 'No tabs', desc: 'Plain faces, for taping seams from the inside.' }
];

function initControls() {
  segment('units', 'units');
  segment('orient', 'orient');
  segment('output', 'output');
  segment('sizeBy', 'sizeBy', prev => {
    // keep the same physical size when switching how it's set
    if (prev === state.sizeBy) return;
    if (state.sizeBy === 'edge') state.edge = model().ref * (state.across / (2 * prep().R));
    else state.across = 2 * prep().R * (state.edge / model().ref);
  });
  radioGroup('tabStyle', 'tabs', 'tabStyle', TAB_OPTS);
  const paper = $('paper');
  Object.entries(PAPERS).forEach(([k, p]) => paper.add(new Option(p.label, k)));
  paper.addEventListener('change', () => { state.paper = paper.value; update(); });
  $('margin').addEventListener('change', e => { state.margin = +e.target.value; update(); });
  const setSize = v => {
    if (!isFinite(v) || v <= 0) return;
    const mm = state.units === 'in' ? v * MM_PER_IN : v;
    if (state.sizeBy === 'edge') state.edge = Math.min(400, Math.max(4, mm));
    else state.across = Math.min(1500, Math.max(25, mm));
    update();
  };
  $('sizeNum').addEventListener('change', e => setSize(parseFloat(e.target.value)));
  $('sizeRange').addEventListener('input', e => setSize(parseFloat(e.target.value)));
  $('tabDepth').addEventListener('input', e => { state.tabDepth = +e.target.value; update(); });
  $('tabAngle').addEventListener('input', e => { state.tabAngle = +e.target.value; update(); });
  $('scheme').addEventListener('change', e => { state.scheme = e.target.value; update(); });
  $('colorSplit').addEventListener('change', e => { state.colorSplit = e.target.checked; update(); });
  $('fill').addEventListener('change', e => { state.fill = e.target.value; update(); });
  $('labels').addEventListener('change', e => { state.labels = e.target.value; update(); });
  $('letters').addEventListener('change', e => { state.letters = e.target.checked; update(); });
  $('scaleBar').addEventListener('change', e => { state.scaleBar = e.target.checked; update(); });
  $('swColor').addEventListener('input', e => { state.palette[state.sel].hex = e.target.value.toUpperCase(); update(); });
  $('swName').addEventListener('input', e => { state.palette[state.sel].name = e.target.value.trim() || 'Color ' + (state.sel + 1); updateLight(); });
  $('swName').addEventListener('change', () => update());
  $('pdfBtn').addEventListener('click', async () => {
    const b = $('pdfBtn'); b.disabled = true; b.textContent = 'Preparing PDF…';
    await new Promise(r => setTimeout(r, 30));
    try { await downloadPDF(); } finally { b.disabled = false; b.textContent = 'Download PDF'; }
  });
  $('resetBtn').addEventListener('click', () => {
    const keep = { theme: state.theme, w: state.w };
    state = JSON.parse(JSON.stringify(DEFAULTS)); Object.assign(state, keep);
    if (reduceMotion) state.spin = false;
    update(); toast('Settings reset');
  });
  $('themeBtn').addEventListener('click', () => {
    state.theme = { auto: 'light', light: 'dark', dark: 'auto' }[state.theme] || 'auto';
    applyTheme(); save();
  });
  $('spinBtn').addEventListener('click', () => { state.spin = !state.spin; syncChips(); save(); needsDraw = true; });
  $('numsBtn').addEventListener('click', () => { state.nums = !state.nums; syncChips(); save(); needsDraw = true; });
  $('bigBtn').addEventListener('click', () => { state.big = !state.big; syncChips(); save(); });
  $('seamBtn').addEventListener('click', () => { state.seams = !state.seams; syncChips(); save(); syncViewer(); });
  $('resetView').addEventListener('click', () => { if (viewer) viewer.reset(); needsDraw = true; });
  $('modelCard').addEventListener('click', openBrowser);
  $('browseBtn').addEventListener('click', openBrowser);
  $('browserClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  $('browserSearch').addEventListener('input', renderBrowser);
  const step = d => {
    const ws = MODELS.map(m => m.w);
    const i = ws.indexOf(state.w);
    selectModel(ws[(i + d + ws.length) % ws.length]);
  };
  $('prevModel').addEventListener('click', () => step(-1));
  $('nextModel').addEventListener('click', () => step(1));
  const sheets = $('sheets');
  sheets.addEventListener('pointerover', e => { const n = e.target.closest('.fc'); setHover(n ? +n.dataset.face : -1); });
  sheets.addEventListener('pointerleave', () => setHover(-1));
  sheets.addEventListener('click', e => {
    const n = e.target.closest('.fc'); if (n) { paintFace(+n.dataset.face); return; }
    const btn = e.target.closest('[data-svg]');
    if (btn) {
      const i = +btn.dataset.svg;
      const svg = primsToSVG(sheetPrims(R.pages[i], i, R.pages.length), false);
      saveFile(baseName() + '-sheet-' + (i + 1) + '.svg', svg);
      return;
    }
    if (e.target.closest('[data-more]')) { sheetLimit += 24; renderSheets(); }
  });
}
function applyTheme() {
  if (state.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', state.theme);
  $('themeBtn').textContent = 'Theme: ' + state.theme;
}
function syncChips() {
  $('spinBtn').setAttribute('aria-pressed', state.spin);
  $('numsBtn').setAttribute('aria-pressed', state.nums);
  $('seamBtn').setAttribute('aria-pressed', state.seams);
  $('bigBtn').setAttribute('aria-pressed', state.big);
  $('sheets').classList.toggle('big', state.big);
}
function renderSwatches() {
  const box = $('swatches'); box.innerHTML = '';
  const used = {};
  if (R) R.colors.forEach(c => { const k = ((c % 10) + 10) % 10; used[k] = (used[k] || 0) + 1; });
  state.palette.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sw'; b.style.background = p.hex;
    b.setAttribute('aria-pressed', i === state.sel);
    b.setAttribute('aria-label', p.name + (used[i] ? `, used on ${used[i]} faces` : ''));
    b.title = p.name;
    if (used[i]) { const u = document.createElement('span'); u.className = 'u'; u.textContent = used[i]; b.appendChild(u); }
    b.addEventListener('click', () => { state.sel = i; save(); if (state.scheme === 'single') update(); else updateLight(); });
    box.appendChild(b);
  });
  $('swColor').value = pal(state.sel).hex.toLowerCase();
  $('swName').value = pal(state.sel).name;
}

/* ---------- update ---------- */
let groupingFor = 0;
function syncControls() {
  const m = model();
  syncSeg('units', state.units); syncSeg('orient', state.orient); syncSeg('output', state.output); syncSeg('sizeBy', state.sizeBy);
  if (groupingFor !== m.w) { radioGroup('grouping', 'grouping', 'grouping', groupingOptions()); groupingFor = m.w; }
  document.querySelectorAll('input[name=grouping]').forEach(i => { i.checked = i.value === state.grouping; });
  document.querySelectorAll('input[name=tabs]').forEach(i => { i.checked = i.value === state.tabStyle; });
  $('tabSizeRows').style.display = state.tabStyle === 'none' ? 'none' : '';
  $('paper').value = state.paper;
  const ms = $('margin'); ms.innerHTML = '';
  MARGINS.forEach(mm => ms.add(new Option(state.units === 'in' ? (mm / MM_PER_IN) + ' in' : Math.round(mm) + ' mm', mm)));
  if (!MARGINS.includes(state.margin)) state.margin = 6.35;
  ms.value = state.margin;
  const inch = state.units === 'in';
  const edgeMode = state.sizeBy === 'edge';
  const er = $('sizeRange'), en = $('sizeNum');
  if (edgeMode) { er.min = inch ? 0.25 : 6; er.max = inch ? 8 : 200; er.step = inch ? 0.125 : 1; }
  else { er.min = inch ? 2 : 50; er.max = inch ? 24 : 600; er.step = inch ? 0.25 : 5; }
  en.min = er.min; en.max = 10 * er.max; en.step = er.step;
  const mm = edgeMode ? state.edge : state.across;
  const v = inch ? +(mm / MM_PER_IN).toFixed(3) : Math.round(mm);
  er.value = v; if (document.activeElement !== en) en.value = v;
  $('sizeUnit').textContent = inch ? 'in' : 'mm';
  $('sizeLbl').textContent = edgeMode ? (m.refLabel ? 'Core edge' : 'Edge length') : 'Overall size';
  $('tabDepth').value = state.tabDepth;
  $('tabDepthOut').textContent = fmtLen(state.tabDepth, inch ? 2 : 1);
  $('tabAngle').value = state.tabAngle;
  $('tabAngleOut').textContent = state.tabAngle + '°';
  const partOpt = $('scheme').querySelector('option[value=part]');
  partOpt.disabled = !m.parts;
  partOpt.textContent = m.parts ? 'Each solid its own color' : 'Each solid its own color (compounds only)';
  $('scheme').value = state.scheme === 'part' && !m.parts ? 'type' : state.scheme;
  $('colorSplit').checked = state.colorSplit;
  $('fill').value = state.fill;
  $('labels').value = state.labels;
  $('letters').checked = state.letters;
  $('scaleBar').checked = state.scaleBar;
  // model card
  $('mcW').textContent = 'W' + m.w;
  $('mcName').textContent = m.name;
  $('mcMeta').textContent = plural(m.R.length, 'face') + ' · ' + level(m.R.length);
  paintThumb($('modelThumb'), m.w);
}
function updateLight() {
  renderSwatches();
  renderSheets();
  renderSummary();
  syncViewer();
}
let pending = null;
function update() {
  syncControls();
  syncChips();
  applyTheme();
  clearTimeout(pending);
  const heavy = model().R.length > 300;
  if (heavy) $('busy').hidden = false;
  pending = setTimeout(() => {
    try { compute(); updateLight(); save(); }
    finally { $('busy').hidden = true; }
  }, heavy ? 40 : 20);
}

let sheetLimit = 24, sheetsFor = '';
function renderSheets() {
  const box = $('sheets');
  const n = R.pages.length;
  const key = state.w + '|' + n;
  if (key !== sheetsFor) { sheetLimit = 24; sheetsFor = key; }
  $('sheetsTitle').textContent = plural(n, 'sheet') + ' of ' + PAPERS[state.paper].label.replace(/ \(.*\)/, '').toLowerCase() + ' paper';
  $('sheetsNote').textContent = state.output === 'template' ? 'One of each piece shape, labeled with how many to cut.' : 'Hover a face to find it on the model. Click to paint it.';
  const html = R.pages.slice(0, sheetLimit).map((pg, i) => {
    const bg = pg.color !== null ? mix(pal(pg.color).hex, 0.32) : '#ffffff';
    const label = pg.color !== null ? `Sheet ${i + 1}, ${esc(pal(pg.color).name)} paper` : `Sheet ${i + 1}`;
    return `<figure class="sheet" style="margin:0"><div class="paper" style="background:${bg}">${primsToSVG(sheetPrims(pg, i, n), true).replace('<svg ', `<svg role="img" aria-label="${label}" `)}</div>
      <figcaption class="sheet-bar"><span>${label}</span><button class="btn-quiet" type="button" data-svg="${i}">Save SVG</button></figcaption></figure>`;
  }).join('');
  const more = n > sheetLimit ? `<button class="chip more" type="button" data-more="1">Show ${Math.min(24, n - sheetLimit)} more of ${n - sheetLimit} remaining sheets</button>` : '';
  box.innerHTML = html + more;
  if (state.fill === 'none') box.querySelectorAll('.paper polygon[fill="#ffffff"]').forEach(p => p.setAttribute('fill-opacity', '0.01'));
  if (hoverFace >= 0) box.querySelectorAll(`.fc[data-face="${hoverFace}"]`).forEach(nd => nd.classList.add('hl'));
}

const TIPS = {
  1: 'Crease each diamond along its middle fold. Then fit the two folded diamonds together crosswise and glue the four seams.',
  2: 'Close each half into a four-sided pyramid first, then glue the two pyramids base to base.',
  3: 'Glue the two halves together one seam at a time, squaring each corner with your fingers while the glue grabs.',
  4: 'Close each cap into a shallow cone. Glue the two strips end to end into a ring, then glue a cap onto each open end of the ring.',
  5: 'Glue each flower’s petals to one another so it cups into a bowl. Then set one bowl on the other, turned so the zigzag rims mesh, and glue around.'
};
const SHAPE_NAMES = { 3: 'triangles', 4: 'squares', 5: 'pentagons', 6: 'hexagons', 8: 'octagons', 10: 'decagons' };
function renderSummary() {
  const m = model(), P = prep();
  $('kicker').textContent = 'W' + m.w + ' · ' + (GROUP_ONE[m.group] || m.group);
  $('title').textContent = m.name;
  $('title').classList.toggle('long', m.name.length > 34);
  $('subtitle').textContent = (m.alt && m.alt.length) ? 'Also called ' + m.alt.join(', ').replace(/, ([^,]*)$/, ' or $1') + '.' : '';
  const facts = [];
  if (m.parts) {
    const counts = {};
    m.parts.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
    facts.push(['Made of', Object.entries(counts).map(([n, c]) => c > 1 ? c + ' ' + (n.endsWith('on') ? n.slice(0, -2) + 'a' : n + 's') : an(n)).join(' and ')]);
  }
  if (m.faces) facts.push(['Faces', m.faces.replace(/\+/g, ' + ')]);
  if (m.vfig) facts.push(['Vertex figure', m.vfig]);
  if (m.wythoff) facts.push(['Wythoff symbol', m.wythoff]);
  if (m.dual) facts.push(['Dual', m.dual]);
  facts.push(['Symmetry', m.sym + (m.u ? ' · ' + m.u : '')]);
  $('facts').innerHTML = facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  const across = acrossMM();
  const stats = [
    [R.pieces.length, R.pieces.length === 1 ? 'piece' : 'pieces'],
    [R.pages.length, R.pages.length === 1 ? 'sheet' : 'sheets'],
    [P.regions.length, 'faces to cut'],
    [fmtLen(across, state.units === 'in' ? 1 : 0).replace(' ', ' '), 'across, finished']
  ];
  $('stats').innerHTML = stats.map(([b, s]) => `<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('');
  const ed = fmtLen(edgeMM(), state.units === 'in' ? 2 : 0);
  $('finished').textContent = state.sizeBy === 'edge'
    ? `The finished model will be about ${fmtLen(across, state.units === 'in' ? 1 : 0)} across at the corners.`
    : (m.refLabel ? `Its ${m.refLabel} has ${ed} edges.` : `Its edges are ${ed} long.`);

  const w = [];
  if (R.warnings.includes('toobig')) w.push('A single face is bigger than the printable area. Choose a smaller size or larger paper.');
  else if (R.autoSplit) w.push('Some sections were split so they fit on the paper. Choose a smaller size or larger paper to keep them whole.');
  if (state.colorSplit && state.scheme !== 'piece' && state.grouping !== 'single' && R.pieces.length >= P.regions.length * 0.8 && P.regions.length > 1 && state.scheme !== 'single')
    w.push('With this color pattern, faces of the same color rarely touch, so most faces become their own piece. Turn off “keep each piece one color” to print in color on white paper instead.');
  if (R.noTab) w.push(`${plural(R.noTab, 'seam')} had no room for a tab. Tape ${R.noTab === 1 ? 'it' : 'them'} from the inside.`);
  const tiny = P.seams.filter(s => s.len * unitMM() < 3).length;
  if (tiny && state.output === 'pattern') w.push(`${tiny === P.seams.length ? 'All' : tiny + ' of the ' + P.seams.length} edges are shorter than ${state.units === 'in' ? '⅛ in' : '3 mm'}. A larger size will be easier to cut and glue.`);
  $('warn').textContent = w.join(' ');

  const hints = {
    single: 'Every face uses the selected swatch.',
    type: 'Faces with the same shape share a color, the way Wenninger often colored his models.',
    part: m.parts ? 'Each solid in the compound gets its own color.' : 'Only compounds have separate solids, so this uses matching shapes instead.',
    parallel: 'Faces on parallel planes share a color.',
    neighbors: 'Uses few colors so that no two touching faces match.',
    each: 'Colors repeat after ten faces.',
    piece: 'Each printed piece gets its own color.',
    custom: 'Click faces to paint them with the selected swatch.'
  };
  $('schemeHint').textContent = hints[state.scheme] || '';
  const p = PAPERS[state.paper];
  $('paperHint').textContent = p.noPrint ? 'Most home printers can’t feed this size. Use tracing templates, or print on letter paper and trace.' : '';
  $('outputHint').textContent = state.output === 'template'
    ? 'Prints one of each piece shape to trace onto construction paper. Glue numbers are left off because every copy is the same.'
    : 'Prints every piece, numbered, ready to cut.';

  const steps = [];
  if (state.output === 'template') {
    steps.push('Print the templates at actual size (100%) on cardstock and cut them out.');
    steps.push('Trace each template onto construction paper as many times as its label says, in the listed colors.');
  } else {
    steps.push(R.split
      ? 'Print each sheet at actual size (100%) on the paper color named at its top. The sheet previews are tinted to match.'
      : 'Print all sheets at actual size (100%). Use cardstock if you can; it holds its shape better.');
  }
  steps.push('Score every dashed' + (R.valleyFolds ? ' and dash-dot' : '') + ' line with an empty ballpoint pen and a ruler.');
  steps.push(R.valleyFolds
    ? 'Cut along the solid lines. Crease dashed lines away from you and dash-dot lines toward you, so the printed side ends up outside.'
    : 'Cut along the solid lines, then crease each dashed line so the printed side ends up ' + (state.tabStyle === 'both' ? 'outside and the tabs point inward.' : 'outside.'));
  if (state.tabStyle === 'both') steps.push('At each seam, glue the two tabs with the same number back to back. Pinch until the glue grabs.');
  else if (state.tabStyle === 'one') steps.push('Glue each numbered tab under the face edge with the same number.');
  else steps.push('Tape the seams together from the inside, leaving one face open until last.');
  if (TIPS[m.w] && state.grouping === 'easy') steps.push(TIPS[m.w] + ' Close the last face last; a pencil pushed through a gap helps press the final tabs.');
  else steps.push('Fold each piece into shape and glue its own seams first. Then join the pieces, working outward from one area, and close the model last.');
  if (m.shells > 1) steps.push(`This model is ${m.shells} separate parts that touch only at their corners. Build each part on its own, then glue the parts together where their corners meet.`);
  if (m.parts && (state.scheme === 'part' || state.scheme === 'custom')) steps.push('Each color is one of the solids in the compound, so you can follow each solid as it weaves through the others.');
  if (P.regions.length > 400) steps.push('This is one of the hardest models in the book. Work in short sessions, and keep finished sections labeled.');
  $('steps').innerHTML = steps.map(s => `<li>${esc(s)}</li>`).join('');
  if (state.labels === 'off' && state.output === 'pattern') $('steps').insertAdjacentHTML('beforeend', '<li>Glue numbers are off, so use the model preview to see which edges meet.</li>');
  $('legend').innerHTML = '<span><i></i>Cut</span><span><i class="d"></i>Mountain fold</span>' + (R.valleyFolds ? '<span><i class="v"></i>Valley fold</span>' : '');
}

/* ---------- init ---------- */
initControls();
update();
compute(); renderSwatches(); renderSheets(); renderSummary(); syncViewer();
requestAnimationFrame(tick);
})();
