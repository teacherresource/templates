/* ============================================================
   App
   ============================================================ */
(function () {
'use strict';
var VF = (window.Vex && window.Vex.Flow) || window.VexFlow;
if (!VF) {
  document.body.innerHTML =
    '<p style="padding:40px;font-family:Georgia,serif">The music engine did not load. ' +
    'Try opening this file again, or download it again.</p>';
  return;
}

var $ = function (s) { return document.querySelector(s); };
var $$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };
function openDlg(d) { if (d.showModal) { try { d.showModal(); return; } catch (e) {} } d.setAttribute('open', ''); }
function closeDlg(d) { if (d.close) { try { d.close(); return; } catch (e) {} } d.removeAttribute('open'); }
function radio(name) { var r = document.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ''; }
function setRadio(name, v) { $$('input[name="' + name + '"]').forEach(function (r) { r.checked = r.value === String(v); }); }
function isTyping(el) {
  if (!el) return false;
  var t = el.tagName;
  return t === 'TEXTAREA' || t === 'SELECT' || (t === 'INPUT' && /^(text|search|number)$/i.test(el.type));
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }

var LETTERS = Notation.LETTERS;
var KEYS = [['C','A'],['G','E'],['D','B'],['A','F#'],['E','C#'],['B','G#'],['F#','D#'],['C#','A#'],
            ['F','D'],['Bb','G'],['Eb','C'],['Ab','F'],['Db','Bb'],['Gb','Eb'],['Cb','Ab']];
var TIMES = ['4/4','3/4','2/4','2/2','5/4','6/8','9/8','12/8','3/8','6/4'];
var CLEFS = ['treble','bass','alto','tenor'];
var LAYOUTS = ['single','grand','rhythm'];
var SLOTS = 9, MAX_VERSES = 4;
var PART_NAMES = ['Soprano','Alto','Tenor','Bass'];
var CLEF_SETS = {
  treble: { lines:['E','G','B','D','F'], spaces:['F','A','C','E'] },
  bass:   { lines:['G','B','D','F','A'], spaces:['A','C','E','G'] },
  alto:   { lines:['F','A','C','E','G'], spaces:['G','B','D','F'] },
  tenor:  { lines:['D','F','A','C','E'], spaces:['E','G','B','D'] }
};
function pretty(name) { return name.replace(/#/g, '♯').replace(/b$/, '♭').replace(/b(?=\s)/, '♭'); }

/* ---------- cards ---------- */
function blankCard(seed) {
  return Object.assign({
    layout:'single', parts:['c4/q d e f','','',''], lyrics:[],
    clef:'treble', key:'C', time:'4/4',
    showClef:true, showKey:true, showTime:true, endBar:true, shapes:'',
    letters:['','','','','','','','',''], letters2:['','','','','','','','',''],
    title:'', caption:'', answer:''
  }, seed || {});
}
/* Anything loaded from a file or from the browser goes through here, so an
   old or hand-edited deck can't leave a card in a shape the editor can't show.
   Decks saved by the earlier Measure Cards (one voice, "measures") are read too. */
function normCard(c) {
  c = c && typeof c === 'object' ? c : {};
  var n = blankCard(c);
  if (LAYOUTS.indexOf(n.layout) < 0 || c.layout === undefined) {
    n.layout = String(c.staffLines) === '1' ? 'rhythm' : (LAYOUTS.indexOf(c.layout) >= 0 ? c.layout : 'single');
  }
  var parts = Array.isArray(c.parts) ? c.parts
    : [Array.isArray(c.measures) ? c.measures.join(' | ') : (c.parts === undefined && c.measures === undefined ? n.parts[0] : '')];
  n.parts = [];
  for (var p = 0; p < 4; p++) n.parts[p] = String(parts[p] == null ? '' : parts[p]);
  n.lyrics = (Array.isArray(c.lyrics) ? c.lyrics : []).slice(0, MAX_VERSES).map(function (l) { return String(l == null ? '' : l); });
  delete n.measures; delete n.staffLines; delete n.size;
  if (CLEFS.indexOf(n.clef) < 0) n.clef = 'treble';
  if (!Object.prototype.hasOwnProperty.call(Notation.KEY_SIGS, n.key)) n.key = 'C';
  if (TIMES.indexOf(n.time) < 0) n.time = '4/4';
  n.shapes = (n.shapes === '4' || n.shapes === '7' || n.shapes === 4 || n.shapes === 7) ? String(n.shapes) : '';
  ['letters','letters2'].forEach(function (k) {
    var l = Array.isArray(c[k]) ? c[k] : [];
    n[k] = [];
    for (var i = 0; i < SLOTS; i++) n[k][i] = String(l[i] == null ? '' : l[i]).slice(0, 4);
  });
  ['showClef','showKey','showTime','endBar'].forEach(function (k) { n[k] = n[k] !== false; });
  ['title','caption','answer'].forEach(function (k) { n[k] = String(n[k] == null ? '' : n[k]); });
  return n;
}
function setupOf(c) {
  return { layout:c.layout, clef:c.clef, key:c.key, time:c.time, showClef:c.showClef,
           showKey:c.showKey, showTime:c.showTime, endBar:c.endBar, shapes:c.shapes,
           letters:c.letters.slice(), letters2:c.letters2.slice() };
}
function freshFrom(c) { return blankCard(Object.assign(setupOf(c), { parts:['','','',''], lyrics:[] })); }

var state = {
  name:'Untitled deck',
  cards:[ blankCard() ],
  sel:0,
  orient:'landscape', perPage:1, answers:false, seq:true, size:'l', tempo:84,
  margin:0.4
};
function cur() { return state.cards[state.sel]; }

/* which parts a card shows, and the clef each is written in */
function visibleParts(c) { return c.layout === 'grand' ? [0, 1, 2, 3] : [0]; }
function clefOfPart(c, v) { return c.layout === 'grand' ? (v < 2 ? 'treble' : 'bass') : (c.layout === 'rhythm' ? 'treble' : c.clef); }
function defOct(c, v) { return Notation.defOctFor(clefOfPart(c, v)); }

/* ---------- keeping the deck in this browser ---------- */
var STORE = 'measure-cards-deck-v1';
var stored = true;
function serialize() {
  return JSON.stringify({ format:'measure-cards-2', name:state.name, orient:state.orient, perPage:state.perPage,
    size:state.size, answers:state.answers, seq:state.seq, tempo:state.tempo, sel:state.sel, cards:state.cards });
}
function persist() {
  try { window.localStorage.setItem(STORE, serialize()); stored = true; }
  catch (e) { stored = false; }
  var s = $('#saveStatus');
  s.textContent = stored ? 'Saved in this browser' : 'Not saved yet. Use Deck › Save';
  s.classList.toggle('bad', !stored);
  if (!stored) $('#tipStore').innerHTML = 'This browser won\'t keep the deck for you, so use <b>Deck › Save deck to a file</b> before closing the page.';
}
function applyDeck(d) {
  if (!d || !Array.isArray(d.cards) || !d.cards.length) return false;
  state.cards = d.cards.map(normCard);
  state.name = String(d.name || 'Untitled deck');
  state.orient = d.orient === 'portrait' ? 'portrait' : 'landscape';
  state.perPage = [1, 2, 4].indexOf(parseInt(d.perPage, 10)) >= 0 ? parseInt(d.perPage, 10) : 1;
  state.size = ['xl','l','m','s'].indexOf(d.size) >= 0 ? d.size : 'l';
  if (typeof d.answers === 'boolean') state.answers = d.answers;
  if (typeof d.seq === 'boolean') state.seq = d.seq;
  var bpm = parseInt(d.tempo, 10);
  if (bpm >= 30 && bpm <= 240) state.tempo = bpm;
  state.sel = Math.max(0, Math.min(state.cards.length - 1, parseInt(d.sel, 10) || 0));
  syncDeckControls();
  return true;
}
function syncDeckControls() {
  $('#deckName').value = state.name;
  setRadio('optOrient', state.orient);
  setRadio('optPerPage', state.perPage);
  $('#optSize').value = state.size;
  $('#optAnswers').checked = state.answers;
  $('#optSeq').checked = state.seq;
  $('#optTempo').value = state.tempo;
  applyPageStyle();
}

/* ---------- undo and redo ---------- */
var hist = [], hpos = -1, histTimer = null;
function snap() { return JSON.stringify({ name:state.name, cards:state.cards }); }
function histNow() {
  clearTimeout(histTimer); histTimer = null;
  var s = snap();
  if (hpos >= 0 && hist[hpos] === s) { persist(); return; }
  hist = hist.slice(0, hpos + 1);
  hist.push(s);
  if (hist.length > 200) hist.shift();
  hpos = hist.length - 1;
  syncUndo();
  persist();
}
function histSoon() { clearTimeout(histTimer); histTimer = setTimeout(histNow, 600); }
function syncUndo() {
  $('#btnUndo').disabled = hpos <= 0;
  $('#btnRedo').disabled = hpos >= hist.length - 1;
}
/* Land on the card that actually changed, so an undo is never invisible. */
function restore(s) {
  var before = state.cards.map(function (c) { return JSON.stringify(c); });
  var d = JSON.parse(s);
  state.name = d.name;
  state.cards = d.cards.map(normCard);
  var changed = -1;
  for (var i = 0; i < Math.max(before.length, state.cards.length); i++) {
    if (before[i] !== (state.cards[i] ? JSON.stringify(state.cards[i]) : undefined)) { changed = i; break; }
  }
  if (changed >= 0) state.sel = changed;
  state.sel = Math.max(0, Math.min(state.cards.length - 1, state.sel));
  $('#deckName').value = state.name;
  picked = null;
  renderAll();
  syncUndo();
  persist();
}
function undo() { if (histTimer) histNow(); if (hpos <= 0) return; hpos--; restore(hist[hpos]); hideToast(); }
function redo() { if (hpos >= hist.length - 1) return; hpos++; restore(hist[hpos]); }

/* ---------- toast ---------- */
var toastTimer = null;
function toast(msg, undoable) {
  $('#toastMsg').textContent = msg;
  $('#toastUndo').hidden = !undoable;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 7000);
}
function hideToast() { $('#toast').hidden = true; clearTimeout(toastTimer); }

/* ---------- page geometry ---------- */
function grid(perPage) { return perPage === 4 ? { cols:2, rows:2 } : perPage === 2 ? { cols:1, rows:2 } : { cols:1, rows:1 }; }
function pageSize() {
  var w = state.orient === 'landscape' ? 11 : 8.5;
  var h = state.orient === 'landscape' ? 8.5 : 11;
  return { w: w - state.margin * 2, h: h - state.margin * 2 };
}
var PAGE_PAD = 0.10;
function slotSize() {
  var p = pageSize(), g = grid(state.perPage);
  return { w: (p.w - PAGE_PAD * 2) / g.cols, h: (p.h - PAGE_PAD * 2) / g.rows };
}

/* cards: up to perPage cards; a missing entry keeps its part of the sheet empty */
function buildPage(cards, startIndex, total, perPage) {
  var size = pageSize(), g = grid(perPage);
  var page = document.createElement('div');
  page.className = 'page';
  page.style.width = size.w + 'in';
  page.style.height = size.h + 'in';
  page.style.padding = PAGE_PAD + 'in';
  page.style.gridTemplateColumns = 'repeat(' + g.cols + ', minmax(0, 1fr))';
  page.style.gridTemplateRows = 'repeat(' + g.rows + ', minmax(0, 1fr))';
  for (var i = 0; i < perPage; i++) {
    var c = cards[i], slot;
    if (c) slot = buildSlot(c, startIndex + i, total, perPage, state.answers, state.seq);
    else { slot = document.createElement('div'); slot.className = 'page-slot'; }
    if (i >= g.cols) slot.classList.add('cut-top');
    if (i % g.cols > 0) slot.classList.add('cut-left');
    page.appendChild(slot);
  }
  return page;
}

function buildSlot(card, index, total, perPage, showAnswers, showSeq) {
  var slot = document.createElement('div');
  slot.className = 'page-slot';
  var shrink = perPage === 4 ? 0.5 : perPage === 2 ? 0.56 : 1;
  if (card.title) {
    var t = document.createElement('div');
    t.className = 'card-title';
    t.textContent = card.title;
    t.style.fontSize = Math.round(38 * shrink) + 'px';
    slot.appendChild(t);
  }
  var music = document.createElement('div');
  music.className = 'card-music';
  slot.appendChild(music);
  if (card.caption) {
    var cap = document.createElement('div');
    cap.className = 'card-caption';
    cap.textContent = card.caption;
    cap.style.fontSize = Math.round(32 * shrink) + 'px';
    slot.appendChild(cap);
  }
  var ans = showAnswers && card.answer;
  if (ans || showSeq) {
    var foot = document.createElement('div');
    foot.className = 'card-foot';
    var a = document.createElement('span');
    a.className = 'card-answer';
    a.textContent = ans ? card.answer : '';
    var s = document.createElement('span');
    s.className = 'card-seq';
    s.textContent = showSeq ? (index + 1) + ' / ' + total : '';
    foot.appendChild(a); foot.appendChild(s);
    slot.appendChild(foot);
  }
  slot._music = music;
  slot._card = Object.assign({}, card, { size: state.size });
  return slot;
}

/* One bad card should never blank the whole page. */
function drawCard(host, card) {
  try { return Notation.renderCard(VF, host, card); }
  catch (e) {
    host.innerHTML = '';
    return { warning: 'This card could not be drawn. Check the notes for a typo.', geom: null };
  }
}
function drawPage(page) {
  $$('.page-slot', page).forEach(function (slot) { if (slot._music) drawCard(slot._music, slot._card); });
}

/* ---------- the live card ---------- */
var scaler = $('#scaler');
var stageGeom = null, stageMusic = null;
function renderPreview() {
  var card = cur();
  stopPlay();
  scaler.innerHTML = '';
  scaler.style.transform = 'none';
  stageGeom = null; stageMusic = null;
  if (!card) return;
  var size = slotSize();
  var page = document.createElement('div');
  page.className = 'page';
  page.style.width = size.w + 'in';
  page.style.height = size.h + 'in';
  page.style.padding = (state.perPage === 1 ? PAGE_PAD : 0.04) + 'in';
  var slot = buildSlot(card, state.sel, state.cards.length, state.perPage, state.answers, state.seq);
  page.appendChild(slot);
  scaler.appendChild(page);
  var r = drawCard(slot._music, slot._card);
  stageGeom = r.geom; stageMusic = slot._music;

  var frame = $('#sheetFrame');
  var pxW = size.w * 96, pxH = size.h * 96;
  var availW = frame.clientWidth - 28, availH = frame.clientHeight - 14;
  var scale = Math.max(0.2, Math.min(1.25, availW / pxW, availH / pxH));
  scaler.style.transform = 'scale(' + scale + ')';
  scaler.style.width = pxW + 'px';
  scaler.style.height = pxH + 'px';
  scaler.style.marginRight = (pxW * scale - pxW) + 'px';
  scaler.style.marginBottom = (pxH * scale - pxH) + 'px';

  var box = $('#musicWarn');
  box.hidden = !r.warning;
  box.textContent = r.warning || '';
  paintPicked();
}

/* ---------- card list ---------- */
var thumbCache = {}, thumbCount = 0;
function thumbKey(c) {
  return JSON.stringify([c.layout, c.parts, c.lyrics, c.clef, c.key, c.time, c.showClef, c.showKey,
                         c.showTime, c.endBar, c.letters, c.letters2, c.shapes]);
}
function fillThumb(el, card) {
  var k = thumbKey(card);
  if (thumbCache[k] !== undefined) { el.innerHTML = thumbCache[k]; return; }
  drawCard(el, Object.assign({}, card, { size: 'l' }));
  var svg = el.querySelector('svg');
  if (svg) {
    try {
      var b = svg.getBBox();
      if (b.width > 4) svg.setAttribute('viewBox', [b.x - 4, b.y - 4, b.width + 8, b.height + 8].join(' '));
    } catch (e) {}
  }
  if (thumbCount > 500) { thumbCache = {}; thumbCount = 0; }
  thumbCache[k] = el.innerHTML; thumbCount++;
}
function cardLabel(card) {
  if (card.title) return card.title;
  if (card.lyrics[0]) return card.lyrics[0];
  if (card.caption) return card.caption;
  if (card.answer) return card.answer;
  var m = visibleParts(card).map(function (v) { return card.parts[v]; }).filter(Boolean).join(' / ').trim();
  return m || 'empty card';
}

var dragFrom = -1;
function renderList() {
  var ul = $('#deckList');
  var keep = ul.scrollTop;
  ul.innerHTML = '';
  state.cards.forEach(function (card, i) {
    var li = document.createElement('li');
    li.draggable = true;
    var b = document.createElement('button');
    b.className = 'deck-item';
    b.type = 'button';
    b.setAttribute('aria-current', i === state.sel ? 'true' : 'false');
    b.innerHTML = '<span class="deck-num"></span><span class="deck-body"><span class="thumb"></span><span class="deck-label"></span></span>';
    b.querySelector('.deck-num').textContent = i + 1;
    b.querySelector('.deck-label').textContent = cardLabel(card);
    b.addEventListener('click', function () { select(i); });
    li.appendChild(b);
    li.addEventListener('dragstart', function (e) {
      dragFrom = i; li.classList.add('dragging');
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); } catch (x) {}
    });
    li.addEventListener('dragend', function () { dragFrom = -1; clearDrop(); li.classList.remove('dragging'); });
    li.addEventListener('dragover', function (e) {
      if (dragFrom < 0) return;
      e.preventDefault();
      var r = li.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
      clearDrop();
      li.classList.add(after ? 'drop-after' : 'drop-before');
    });
    li.addEventListener('drop', function (e) {
      if (dragFrom < 0) return;
      e.preventDefault();
      var r = li.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
      var to = i + (after ? 1 : 0);
      var from = dragFrom;
      dragFrom = -1; clearDrop();
      moveCard(from, to);
    });
    ul.appendChild(li);
    fillThumb(b.querySelector('.thumb'), card);
  });
  ul.scrollTop = keep;
  $('#deckCount').textContent = state.cards.length + (state.cards.length === 1 ? ' card' : ' cards');
  syncTitles();
}
function clearDrop() { $$('#deckList li').forEach(function (l) { l.classList.remove('drop-before', 'drop-after'); }); }
/* Typing only touches the one card being edited. */
function refreshItem(i) {
  var b = $$('#deckList .deck-item')[i];
  if (!b) return;
  b.querySelector('.deck-label').textContent = cardLabel(state.cards[i]);
  fillThumb(b.querySelector('.thumb'), state.cards[i]);
}
function scrollSelIntoView() {
  var b = $$('#deckList .deck-item')[state.sel];
  if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' });
}
function syncTitles() {
  var n = state.cards.length;
  $('#editorTitle').textContent = 'Card ' + (state.sel + 1);
  $('#pagerPos').textContent = 'Card ' + (state.sel + 1) + ' of ' + n;
  $('#btnPrev').disabled = state.sel <= 0;
  $('#btnNext').disabled = state.sel >= n - 1;
  $('#btnUp').disabled = state.sel <= 0;
  $('#btnDown').disabled = state.sel >= n - 1;
}

/* ---------- editor: building the fixed parts ---------- */
function fillSelects() {
  var k = $('#fKey');
  var groups = [['No sharps or flats', 0, 1], ['Sharps', 1, 8], ['Flats', 8, 15]];
  groups.forEach(function (g) {
    var og = document.createElement('optgroup');
    og.label = g[0];
    KEYS.slice(g[1], g[2]).forEach(function (pair) {
      var o = document.createElement('option');
      var n = Math.abs(Notation.KEY_SIGS[pair[0]]);
      var sign = Notation.KEY_SIGS[pair[0]] > 0 ? 'sharp' : 'flat';
      o.value = pair[0];
      o.textContent = pretty(pair[0]) + ' major / ' + pretty(pair[1]) + ' minor' +
        (n ? '  (' + n + ' ' + sign + (n > 1 ? 's' : '') + ')' : '');
      og.appendChild(o);
    });
    k.appendChild(og);
  });
  var t = $('#fTime');
  TIMES.forEach(function (v) {
    var o = document.createElement('option'); o.value = v; o.textContent = v; t.appendChild(o);
  });
}

var active = 0;   // the part that buttons and clicks write into
var palClef = '';
function buildVoices() {
  var host = $('#voices');
  for (var v = 0; v < 4; v++) {
    var row = document.createElement('div');
    row.className = 'voice'; row.dataset.v = String(v);
    var lab = document.createElement('label');
    lab.htmlFor = 'fPart' + v; lab.textContent = PART_NAMES[v];
    var inp = document.createElement('input');
    inp.type = 'text'; inp.id = 'fPart' + v; inp.className = 'notes-input';
    inp.spellcheck = false; inp.autocomplete = 'off'; inp.setAttribute('autocapitalize', 'off');
    inp.dataset.v = String(v);
    inp.addEventListener('input', function () { picked = null; onEdit(); });
    inp.addEventListener('focus', function () { setActive(+this.dataset.v); });
    var beats = document.createElement('div');
    beats.className = 'beats'; beats.setAttribute('aria-live', 'polite');
    row.appendChild(lab); row.appendChild(inp); row.appendChild(beats);
    host.appendChild(row);
  }
}
function partInput(v) { return $('#fPart' + v); }
function setActive(v) {
  var c = cur(), vis = visibleParts(c);
  if (vis.indexOf(v) < 0) v = vis[0];
  active = v;
  $$('#voices .voice').forEach(function (r) { r.classList.toggle('active', +r.dataset.v === active); });
  /* the octave buttons follow the clef, but only when the clef actually changes */
  var clef = clefOfPart(c, active);
  if (clef !== palClef) { palClef = clef; pal.oct = defOct(c, active); }
  syncPalette();
}

function slotLetter(clef, p) {
  var set = CLEF_SETS[clef] || CLEF_SETS.treble;
  return p % 2 === 0 ? set.lines[p / 2] : set.spaces[(p - 1) / 2];
}
function slotSyllable(card, clef, p) {
  return Notation.syllableFor(slotLetter(clef, p).toLowerCase(), card.key, card.shapes === '4' ? '4' : '7');
}
function buildLetterStaves() {
  var host = $('#letterStaves');
  host.innerHTML = '';
  [0, 1].forEach(function (si) {
    var box = document.createElement('div');
    box.className = 'letter-staff'; box.dataset.staff = String(si);
    var h = document.createElement('h4');
    box.appendChild(h);
    for (var p = SLOTS - 1; p >= 0; p--) {
      var onLine = p % 2 === 0;
      var row = document.createElement('div');
      row.className = 'ls-row ' + (onLine ? 'is-line' : 'is-space');
      var inp = document.createElement('input');
      inp.type = 'text'; inp.maxLength = 4; inp.spellcheck = false; inp.autocomplete = 'off';
      inp.dataset.slot = String(p); inp.dataset.staff = String(si);
      var name = onLine ? ('line ' + (p / 2 + 1)) : ('space ' + ((p + 1) / 2));
      inp.setAttribute('aria-label', 'Label for ' + name);
      inp.addEventListener('input', onEdit);
      var tag = document.createElement('span');
      tag.textContent = name;
      row.appendChild(inp); row.appendChild(tag);
      box.appendChild(row);
    }
    host.appendChild(box);
  });
}
function letterInputs() { return $$('#letterStaves input'); }
function lettersOf(c, si) { return si === 1 ? c.letters2 : c.letters; }
function labelClef(c, si) { return c.layout === 'grand' ? (si === 0 ? 'treble' : 'bass') : c.clef; }

function renderVerses() {
  var c = cur(), host = $('#verses');
  host.innerHTML = '';
  var list = c.lyrics.length ? c.lyrics : [''];
  list.forEach(function (text, i) {
    var row = document.createElement('div');
    row.className = 'verse';
    var lab = document.createElement('label');
    lab.textContent = list.length > 1 ? 'Verse ' + (i + 1) : 'Words';
    lab.htmlFor = 'fVerse' + i;
    var inp = document.createElement('input');
    inp.type = 'text'; inp.id = 'fVerse' + i; inp.value = text; inp.autocomplete = 'off';
    inp.placeholder = i === 0 ? 'for example: A-maz-ing grace, how sweet the sound' : '';
    inp.addEventListener('input', onEdit);
    var chip = document.createElement('span');
    chip.className = 'beat'; chip.hidden = true;
    row.appendChild(lab); row.appendChild(inp); row.appendChild(chip);
    if (list.length > 1) {
      var x = document.createElement('button');
      x.type = 'button'; x.className = 'x'; x.textContent = '×';
      x.title = 'Remove this verse'; x.setAttribute('aria-label', 'Remove verse ' + (i + 1));
      x.addEventListener('click', function () {
        pullEditor();
        cur().lyrics.splice(i, 1);
        renderVerses(); afterChange(true);
      });
      row.appendChild(x);
    }
    host.appendChild(row);
  });
  $('#btnVerse').disabled = list.length >= MAX_VERSES;
}
function verseInputs() { return $$('#verses input'); }

function loadEditor() {
  var c = cur();
  if (!c) return;
  for (var v = 0; v < 4; v++) partInput(v).value = c.parts[v];
  setRadio('fLayout', c.layout);
  $('#fClef').value = c.clef;
  $('#fKey').value = c.key;
  $('#fTime').value = c.time;
  $('#fShowClef').checked = c.showClef;
  $('#fShowKey').checked = c.showKey;
  $('#fShowTime').checked = c.showTime;
  $('#fEndBar').checked = c.endBar;
  setRadio('fShapes', c.shapes);
  $('#fTitle').value = c.title;
  $('#fCaption').value = c.caption;
  $('#fAnswer').value = c.answer;
  letterInputs().forEach(function (inp) { inp.value = lettersOf(c, +inp.dataset.staff)[+inp.dataset.slot] || ''; });
  renderVerses();
  syncEditorState();
}

/* Show, enable or explain whatever does or doesn't apply to the current card. */
function syncEditorState() {
  var c = cur();
  var one = c.layout === 'rhythm', grand = c.layout === 'grand';
  var vis = visibleParts(c);
  $('#voices').classList.toggle('solo', !grand);
  $$('#voices .voice').forEach(function (r) {
    var v = +r.dataset.v;
    r.hidden = vis.indexOf(v) < 0;
    partInput(v).placeholder = grand ? (v < 2 ? 'top staff' : 'bottom staff') + (v % 2 ? ', stems down' : ', stems up')
      : (one ? 'x/q x x/8 x x/q' : 'c4/q d e f');
    partInput(v).setAttribute('aria-label', grand ? PART_NAMES[v] + ' notes' : 'Notes');
  });
  $('#fClef').disabled = one || grand;
  ['fKey','fShowClef','fShowKey'].forEach(function (id) { $('#' + id).disabled = one; });
  $$('input[name="fShapes"]').forEach(function (r) { r.disabled = one; });
  $$('#letterStaves .letter-staff').forEach(function (box) {
    var si = +box.dataset.staff;
    box.hidden = one || (si === 1 && !grand);
    box.querySelector('h4').textContent = grand ? (si === 0 ? 'Treble staff' : 'Bass staff') : '';
    box.querySelector('h4').hidden = !grand;
  });
  $('#lettersNote').hidden = !one;
  ['btnLtrLines','btnLtrSpaces','btnLtrAll','btnLtrClear'].forEach(function (id) { $('#' + id).disabled = one; });
  $$('input[name="ltrMode"]').forEach(function (r) { r.disabled = one; });
  $('#palette').classList.toggle('rhythm', one);
  $('#editorSub').textContent = one ? 'rhythm line, ' + c.time
    : (grand ? 'Grand staff, ' : c.clef.charAt(0).toUpperCase() + c.clef.slice(1) + ' clef, ') +
      pretty(c.key) + ' major, ' + c.time + (c.shapes ? ', ' + c.shapes + ' shapes' : '');
  $('#stageHint').innerHTML = one ? '<b>Click the line</b> to add a note of the chosen length'
    : '<b>Click the staff</b> to add a note · click a note to select it · Shift-click to stack a chord';
  setActive(active);
  renderShapeInfo();
  updateBeats();
}

function pullEditor() {
  var c = cur();
  if (!c) return;
  for (var v = 0; v < 4; v++) c.parts[v] = partInput(v).value.trim();
  var lay = radio('fLayout');
  c.layout = LAYOUTS.indexOf(lay) >= 0 ? lay : 'single';
  c.clef = $('#fClef').value;
  c.key = $('#fKey').value;
  c.time = $('#fTime').value;
  c.showClef = $('#fShowClef').checked;
  c.showKey = $('#fShowKey').checked;
  c.showTime = $('#fShowTime').checked;
  c.endBar = $('#fEndBar').checked;
  c.shapes = radio('fShapes');
  letterInputs().forEach(function (inp) { lettersOf(c, +inp.dataset.staff)[+inp.dataset.slot] = inp.value.trim(); });
  var verses = verseInputs().map(function (i) { return i.value; });
  while (verses.length && !verses[verses.length - 1].trim()) verses.pop();
  c.lyrics = verses;
  c.title = $('#fTitle').value;
  c.caption = $('#fCaption').value;
  c.answer = $('#fAnswer').value;
}

/* Typing: update the card and its thumbnail, but never rewrite the
   field the person is typing in. */
function onEdit() {
  pullEditor();
  afterChange(false);
}
function afterChange(now) {
  refreshItem(state.sel);
  renderPreview();
  updateBeats();
  if (now) histNow(); else histSoon();
}
/* Clef, key, staff and shape changes: labels that were filled automatically
   follow along, so a treble E G B D F never sits on a bass staff. */
function onSetup() {
  var before = clone(cur());
  pullEditor();
  var c = cur();
  if (before.layout !== c.layout) {
    picked = null;
    /* a bass-clef tune becomes the bass part of a grand staff rather than jumping up to the treble */
    if (c.layout === 'grand' && before.layout === 'single' && (before.clef === 'bass' || before.clef === 'tenor') &&
        c.parts[0] && !c.parts[2] && !c.parts[3]) {
      c.parts[3] = c.parts[0]; c.parts[0] = '';
      active = 3;
    } else if (c.layout !== 'grand') active = 0;
    for (var v = 0; v < 4; v++) partInput(v).value = c.parts[v];
  }
  [0, 1].forEach(function (si) {
    var was = labelClef(before, si), now = labelClef(c, si), arr = lettersOf(c, si);
    for (var p = 0; p < SLOTS; p++) {
      var val = (arr[p] || '').toLowerCase();
      if (!val) continue;
      if (val === slotLetter(was, p).toLowerCase()) arr[p] = slotLetter(now, p);
      else if (val === slotSyllable(before, was, p)) arr[p] = slotSyllable(c, now, p);
    }
  });
  letterInputs().forEach(function (inp) { inp.value = lettersOf(c, +inp.dataset.staff)[+inp.dataset.slot] || ''; });
  syncEditorState();
  refreshItem(state.sel);
  renderPreview();
  histNow();
}

/* ---------- beat meter ---------- */
function amount(n) {
  var whole = Math.floor(n + 1e-9), frac = Math.round((n - whole) * 8);
  var fr = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'][frac] || '';
  if (frac === 8) { whole++; fr = ''; }
  return (whole ? String(whole) : (fr ? '' : '0')) + fr;
}
function updateBeats() {
  var c = cur();
  var unitName = { 2:'half note', 4:'beat', 8:'eighth', 16:'sixteenth' };
  function plural(n, u) { return u + (n > 1 + 1e-9 || n === 0 ? 's' : ''); }
  var grand = c.layout === 'grand';
  visibleParts(c).forEach(function (v) {
    var box = $$('#voices .voice')[v].querySelector('.beats');
    box.innerHTML = '';
    var info = Notation.countBeats(c.parts[v], c.time, defOct(c, v)).measures;
    var empty = info.length === 1 && info[0].notes === 0;
    if (empty) {
      if (!grand) {
        var e = document.createElement('span');
        e.className = 'beat'; e.textContent = 'empty';
        box.appendChild(e);
      }
      return;
    }
    info.forEach(function (b, i) {
      if (!b.notes && i === info.length - 1) return;   // an open bar waiting for notes
      var chip = document.createElement('span');
      var u = unitName[b.unit] || 'beat';
      var diff = b.have - b.need;
      var label = info.length > 1 ? (i + 1) + ': ' : '';
      var words;
      if (!c.showTime) { chip.className = 'beat'; words = amount(b.have) + ' ' + plural(b.have, u); chip.textContent = label + amount(b.have); }
      else if (Math.abs(diff) < 1e-6) { chip.className = 'beat ok'; words = 'full'; chip.textContent = label + '✓'; }
      else if (diff < 0) { chip.className = 'beat short'; words = amount(-diff) + ' ' + plural(-diff, u) + ' short'; chip.textContent = label + '−' + amount(-diff); }
      else { chip.className = 'beat over'; words = amount(diff) + ' ' + plural(diff, u) + ' too many'; chip.textContent = label + '+' + amount(diff); }
      if (!grand && info.length === 1) chip.textContent = words;
      chip.title = (info.length > 1 ? 'Measure ' + (i + 1) + ': ' : '') + words;
      box.appendChild(chip);
    });
  });
  /* lyrics: do the syllables line up with the notes? */
  var notes = Notation.lyricNotes(Notation.buildModel(c)).length;
  $$('#verses .verse').forEach(function (row) {
    var chip = row.querySelector('.beat'), text = row.querySelector('input').value;
    var n = Notation.parseLyrics(text).length;
    chip.hidden = !n;
    if (!n) return;
    chip.className = 'beat ' + (n === notes ? 'ok' : n < notes ? 'short' : 'over');
    chip.textContent = n === notes ? '✓' : n + ' of ' + notes;
    chip.title = n + (n === 1 ? ' syllable' : ' syllables') + ' for ' + notes + (notes === 1 ? ' note' : ' notes');
  });
}

function renderShapeInfo() {
  var c = cur();
  var on = c.layout !== 'rhythm' && (c.shapes === '4' || c.shapes === '7');
  $('#shapeInfo').hidden = !on;
  $('#shapeOff').hidden = on;
  if (!on) return;
  var tonic = LETTERS.indexOf(c.key.charAt(0).toLowerCase());
  var legend = $('#shapeLegend');
  legend.innerHTML = '';
  for (var d = 0; d < 7; d++) {
    var syl = Notation.SYLLABLES[c.shapes][d];
    var shape = syl === 'fa' ? 'faUp' : syl;
    var letter = LETTERS[(tonic + d) % 7].toUpperCase();
    var fig = document.createElement('figure');
    fig.innerHTML = '<svg width="36" height="28" viewBox="0 0 36 28" aria-hidden="true">' +
      '<path d="' + Notation.shapePath(shape, 11, 14, 14) + '" fill="#000"/></svg>' +
      '<figcaption></figcaption>';
    fig.querySelector('figcaption').textContent = syl;
    fig.title = syl + ' is ' + pretty(letter) + ' in this key';
    legend.appendChild(fig);
  }
  var tonicName = pretty(c.key);
  $('#shapeNote').textContent = c.shapes === '4'
    ? 'Shapes follow the key signature: ' + tonicName + ' is fa. Minor tunes start on la. Sharps and flats keep their letter\'s shape.'
    : 'Shapes follow the key signature: ' + tonicName + ' is do. Sharps and flats keep their letter\'s shape.';
}

function fillLetters(which) {
  var c = cur();
  var mode = radio('ltrMode');
  letterInputs().forEach(function (inp) {
    var p = +inp.dataset.slot, si = +inp.dataset.staff, onLine = p % 2 === 0;
    if (si === 1 && c.layout !== 'grand') return;
    var clef = labelClef(c, si);
    var want = which === 'all' || (which === 'lines' && onLine) || (which === 'spaces' && !onLine);
    inp.value = want ? (mode === 'syllables' ? slotSyllable(c, clef, p) : slotLetter(clef, p)) : '';
  });
  pullEditor(); afterChange(true);
}

/* ---------- reading and rewriting one part's notes ---------- */
function getItems(v) { return Notation.parseVoice(partInput(v).value, defOct(cur(), v)).items; }
function setItems(v, items) {
  partInput(v).value = Notation.serializeVoice(items, defOct(cur(), v));
  pullEditor();
}
function lastNote(items) {
  for (var i = items.length - 1; i >= 0; i--) if (items[i].t === 'n') return items[i];
  return null;
}
function newNote(fields) {
  return Object.assign({ t:'n', rest:false, x:false, pitches:[], dur:pal.dur, dots:pal.dots,
                         tie:false, ferm:false, slurS:false, slurE:false, tupS:false, tupE:false }, fields);
}
/* Is the last measure already full? Then the next note belongs in a new one. */
function lastBarFull(v) {
  var c = cur();
  if (!c.showTime) return false;
  var info = Notation.countBeats(partInput(v).value, c.time, defOct(c, v)).measures;
  var last = info[info.length - 1];
  return !!last && last.notes > 0 && last.have >= last.need - 1e-6;
}
/* at: the item index to insert before, or null to add at the end */
function addNote(v, note, at) {
  var items = getItems(v);
  if (pal.slurOn === 1) { note.slurS = true; pal.slurOn = 2; }
  if (pal.trip > 0) {
    if (pal.trip === 3) note.tupS = true;
    if (pal.trip === 1) note.tupE = true;
    pal.trip--;
  }
  if (at === null || at === undefined || at >= items.length) {
    if (lastBarFull(v) && !note.tupE && !(pal.trip > 0 && !note.tupS)) items.push({ t:'b', kind:'|' });
    items.push(note);
  } else items.splice(at, 0, note);
  pal.acc = ''; pal.dots = 0;
  syncPalette();
  picked = null;
  setItems(v, items);
  afterChange(true);
}

/* ---------- note palette ---------- */
var pal = { dur:'q', dots:0, oct:4, acc:'', trip:0, slurOn:0 };
var DUR_NAMES = { w:'whole', h:'half', q:'quarter', '8':'eighth', '16':'sixteenth', '32':'thirty-second' };
function noteIcon(kind) {
  var s = '<svg width="22" height="24" viewBox="0 0 24 26" aria-hidden="true">';
  var head = '<ellipse cx="9" cy="19" rx="6" ry="4.4" transform="rotate(-20 9 19)"';
  var stem = '<line x1="14.6" y1="18" x2="14.6" y2="3" stroke-width="1.8"/>';
  if (kind === 'w') s += head + ' class="open" stroke-width="2"/>';
  else if (kind === 'h') s += head + ' class="open" stroke-width="2"/>' + stem;
  else s += head + ' stroke="none"/>' + stem;
  if (kind === '8') s += '<path class="open" d="M14.6 3 C19 5.5 20 8 18.4 11.5" stroke-width="1.8"/>';
  if (kind === '16') s += '<path class="open" d="M14.6 3 C19 5.5 20 7.5 18.4 10.5" stroke-width="1.8"/>' +
                          '<path class="open" d="M14.6 8 C19 10.5 20 12.5 18.4 15.5" stroke-width="1.8"/>';
  return s + '</svg>';
}
function palBtn(text, cls, title, fn) {
  var b = document.createElement('button');
  b.type = 'button'; b.className = 'pal-btn' + (cls ? ' ' + cls : '');
  if (text.charAt(0) === '<') b.innerHTML = text; else b.textContent = text;
  if (title) { b.title = title; b.setAttribute('aria-label', title); }
  b.addEventListener('click', fn);
  return b;
}
function gap() { var s = document.createElement('span'); s.className = 'pal-gap'; return s; }
/* Buttons act on the selected note if there is one, otherwise on the next note added. */
function editPicked(fn) {
  var p = pickedItem();
  if (!p) return false;
  fn(p.it, p.items);
  setItems(picked.v, p.items);
  afterChange(true);
  syncPalette();
  return true;
}
function buildPalette() {
  var row = $('#palDur');
  [['w','Whole note'],['h','Half note'],['q','Quarter note'],['8','Eighth note'],['16','Sixteenth note']].forEach(function (d) {
    var b = palBtn(noteIcon(d[0]), '', d[1], function () {
      if (!editPicked(function (it) { it.dur = d[0]; })) { pal.dur = d[0]; syncPalette(); }
    });
    b._dur = d[0];
    row.appendChild(b);
  });
  row.appendChild(gap());
  var dot = palBtn('dotted', '', 'Dotted: half as long again', function () {
    if (!editPicked(function (it) { it.dots = it.dots ? 0 : 1; })) { pal.dots = pal.dots ? 0 : 1; syncPalette(); }
  });
  dot._isDot = true;
  row.appendChild(dot);
  var trip = palBtn('triplet', '', 'The next three notes become a triplet', function () {
    pal.trip = pal.trip ? 0 : 3; syncPalette();
  });
  trip._isTrip = true;
  row.appendChild(trip);

  var prow = $('#palPitch');
  'CDEFGAB'.split('').forEach(function (L) {
    prow.appendChild(palBtn(L, 'pal-note pitch-only', 'Add ' + L, function () {
      addNote(active, newNote({ pitches:[{ letter:L.toLowerCase(), acc:pal.acc || null, oct:pal.oct }] }), null);
    }));
  });
  prow.appendChild(palBtn('Add note', 'rhythm-only', 'Add a note', function () {
    addNote(active, newNote({ x:true, pitches:[{ letter:'b', acc:null, oct:4 }] }), null);
  }));
  prow.appendChild(palBtn('Rest', '', 'Add a rest', function () { addNote(active, newNote({ rest:true }), null); }));
  var g1 = gap(); g1.classList.add('pitch-only'); prow.appendChild(g1);
  [['#','♯','Sharp'],['b','♭','Flat'],['n','♮','Natural']].forEach(function (a) {
    var b = palBtn(a[1], 'pal-acc pitch-only', a[2], function () {
      var done = editPicked(function (it) {
        var p = it.pitches[picked.head] || it.pitches[0];
        if (p) p.acc = p.acc === a[0] ? null : a[0];
      });
      if (!done) { pal.acc = pal.acc === a[0] ? '' : a[0]; syncPalette(); }
    });
    b._acc = a[0];
    prow.appendChild(b);
  });
  var oct = document.createElement('span');
  oct.className = 'oct pitch-only';
  oct.appendChild(document.createTextNode('octave'));
  oct.appendChild(palBtn('–', '', 'Lower octave', function () { pal.oct = Math.max(1, pal.oct - 1); syncPalette(); }));
  var ob = document.createElement('b'); ob.id = 'octNow'; oct.appendChild(ob);
  oct.appendChild(palBtn('+', '', 'Higher octave', function () { pal.oct = Math.min(7, pal.oct + 1); syncPalette(); }));
  var g2 = gap(); g2.classList.add('pitch-only');
  row.appendChild(g2);
  row.appendChild(oct);

  var mrow = $('#palMarks');
  var tie = palBtn('Tie', '', 'Tie this note to the next one', function () {
    if (editPicked(function (it) { it.tie = !it.tie; })) return;
    var items = getItems(active), n = lastNote(items);
    if (!n || n.rest) { toast('Add a note first, then tie it to the next one.'); return; }
    n.tie = !n.tie;
    setItems(active, items); afterChange(true);
  });
  mrow.appendChild(tie);
  var slur = palBtn('Slur', '', 'Start a slur on the next note; press again to end it on the last note', function () {
    if (pal.slurOn === 2) {
      var items = getItems(active), n = lastNote(items);
      if (n) { n.slurE = true; setItems(active, items); afterChange(true); }
      pal.slurOn = 0;
    } else pal.slurOn = pal.slurOn ? 0 : 1;
    syncPalette();
  });
  slur._isSlur = true;
  mrow.appendChild(slur);
  mrow.appendChild(palBtn('Fermata', '', 'Hold: a fermata over the note', function () {
    if (editPicked(function (it) { it.ferm = !it.ferm; })) return;
    var items = getItems(active), n = lastNote(items);
    if (!n) return;
    n.ferm = !n.ferm;
    setItems(active, items); afterChange(true);
  }));
  mrow.appendChild(gap());
  [['|','Barline: start the next measure'],['||','Double barline'],['|:','Start repeat'],[':|','End repeat']].forEach(function (b) {
    mrow.appendChild(palBtn(b[0], 'pal-bar', b[1], function () {
      var items = getItems(active);
      if (b[0] === '|:' && !items.length) items.push({ t:'b', kind:'|:' });
      else items.push({ t:'b', kind:b[0] });
      picked = null;
      setItems(active, items); afterChange(true);
    }));
  });
  mrow.appendChild(gap());
  mrow.appendChild(palBtn('Remove last', '', 'Remove the last note or barline', function () {
    var items = getItems(active);
    items.pop();
    picked = null;
    setItems(active, items); afterChange(true);
  }));
  mrow.appendChild(palBtn('Clear', '', 'Clear this part', function () {
    picked = null;
    partInput(active).value = ''; pullEditor(); afterChange(true);
  }));
}
function syncPalette() {
  var p = pickedItem(), it = p && p.it;
  var head = it && !it.rest ? (it.pitches[picked.head] || it.pitches[0]) : null;
  $$('#palDur .pal-btn').forEach(function (b) {
    if (b._dur) b.setAttribute('aria-pressed', (it ? it.dur : pal.dur) === b._dur ? 'true' : 'false');
    if (b._isDot) b.setAttribute('aria-pressed', (it ? it.dots : pal.dots) ? 'true' : 'false');
    if (b._isTrip) { b.setAttribute('aria-pressed', pal.trip ? 'true' : 'false'); b.textContent = pal.trip && pal.trip < 3 ? 'triplet ' + (4 - pal.trip) + '/3' : 'triplet'; }
  });
  $$('#palPitch .pal-btn').forEach(function (b) {
    if (b._acc) b.setAttribute('aria-pressed', (head ? (head.acc || '') : pal.acc) === b._acc ? 'true' : 'false');
  });
  $$('#palMarks .pal-btn').forEach(function (b) {
    if (b._isSlur) { b.setAttribute('aria-pressed', pal.slurOn ? 'true' : 'false'); b.textContent = pal.slurOn === 2 ? 'End slur' : 'Slur'; }
  });
  var n = $('#octNow');
  if (n) n.textContent = pal.oct;
  var bar = $('#selBar');
  bar.hidden = !it;
  if (it) {
    var what = it.rest ? 'rest' : it.x ? 'note' : it.pitches.map(function (q) {
      return q.letter.toUpperCase() + (q.acc === '#' ? '♯' : q.acc === 'b' ? '♭' : q.acc === 'n' ? '♮' : '') + q.oct;
    }).join(' + ');
    $('#selText').textContent = 'Selected: ' + (it.dots ? 'dotted ' : '') + DUR_NAMES[it.dur] + ' ' + what +
      (cur().layout === 'grand' ? ' in the ' + PART_NAMES[picked.v].toLowerCase() : '') +
      '. Drag it, press ↑ ↓, or use the buttons below.';
  }
}

/* ---------- clicking on the staff ---------- */
var picked = null;      // {v, idx, head} the selected note, by its place in the part's item list
var drag = null;
function pickedItem() {
  if (!picked) return null;
  var items = getItems(picked.v), it = items[picked.idx];
  if (!it || it.t !== 'n') { picked = null; return null; }
  return { items: items, it: it };
}
function paintPicked() {
  if (!stageMusic) return;
  $$('.sel-note', stageMusic).forEach(function (el) { el.classList.remove('sel-note'); });
  if (!picked || !stageGeom) return;
  stageGeom.notes.forEach(function (n) {
    if (n.part !== picked.v || n.idx !== picked.idx) return;
    var el = stageMusic.querySelector('[id="' + n.id + '"]');
    if (el) el.classList.add('sel-note');
  });
}
function svgPoint(e) {
  var svg = stageMusic && stageMusic.querySelector('svg');
  if (!svg || !svg.getScreenCTM) return null;
  var m = svg.getScreenCTM();
  if (!m) return null;
  var pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(m.inverse());
}
/* What is under the pointer: which staff, which line or space, which note. */
function probe(e) {
  var g = stageGeom, pt = svgPoint(e);
  if (!g || !pt) return null;
  var best = null;
  g.staves.forEach(function (st, si) {
    var mid = g.oneLine ? st.top : st.top + 20;
    var d = Math.abs(pt.y - mid);
    if (!best || d < best.d) best = { si: si, st: st, d: d };
  });
  if (!best || best.d > (g.oneLine ? 34 : 74)) return null;
  if (pt.x < g.measures[0].x0 - 4 || pt.x > g.measures[g.measures.length - 1].x1 + 4) return null;
  var st = best.st;
  var step = g.oneLine ? 0 : Math.max(-9, Math.min(17, Math.round((st.top + 40 - pt.y) / 5)));
  var hit = null;
  g.notes.forEach(function (n) {
    if (st.parts.indexOf(n.part) < 0) return;
    var dx = Math.abs(pt.x - n.x);
    if (dx > 8.5) return;
    var dy = Math.min.apply(null, n.ys.map(function (y) { return Math.abs(pt.y - y); }));
    if (dy > (n.rest ? 14 : 6)) return;
    if (!hit || dx + dy < hit.score) hit = { n: n, score: dx + dy };
  });
  return { x: pt.x, y: pt.y, si: best.si, st: st, step: step, hit: hit ? hit.n : null,
           snapY: g.oneLine ? st.top : st.top + 40 - step * 5 };
}
function partForStaff(st) {
  return st.parts.indexOf(active) >= 0 ? active : st.parts[0];
}
function clearGhost() { if (stageMusic) $$('.ghost', stageMusic).forEach(function (el) { el.remove(); }); }
function drawGhost(p) {
  clearGhost();
  var svg = stageMusic && stageMusic.querySelector('svg');
  if (!svg || !p || p.hit) return;
  var NS = 'http://www.w3.org/2000/svg';
  var g = document.createElementNS(NS, 'g');
  g.setAttribute('class', 'ghost');
  var head = document.createElementNS(NS, 'ellipse');
  head.setAttribute('cx', p.x); head.setAttribute('cy', p.snapY);
  head.setAttribute('rx', 6.3); head.setAttribute('ry', 4.5);
  head.setAttribute('transform', 'rotate(-20 ' + p.x + ' ' + p.snapY + ')');
  g.appendChild(head);
  if (!stageGeom.oneLine) {
    var s;
    function ledger(y) {
      var l = document.createElementNS(NS, 'rect');
      l.setAttribute('x', p.x - 10); l.setAttribute('y', y - 0.6);
      l.setAttribute('width', 20); l.setAttribute('height', 1.2);
      g.appendChild(l);
    }
    for (s = -2; s >= p.step; s -= 2) ledger(p.st.top + 40 - s * 5);
    for (s = 10; s <= p.step; s += 2) ledger(p.st.top + 40 - s * 5);
    var pitch = Notation.pitchAtStep(p.st.clef, p.step);
    var t = document.createElementNS(NS, 'text');
    t.setAttribute('x', p.x + 12); t.setAttribute('y', p.snapY - 7);
    t.setAttribute('font-size', '9'); t.setAttribute('font-family', 'sans-serif'); t.setAttribute('stroke', 'none');
    t.textContent = pitch.letter.toUpperCase() + pitch.oct;
    g.appendChild(t);
  }
  svg.appendChild(g);
}
function nearestHead(c, v, it, step) {
  var clef = clefOfPart(c, v), best = 0, bd = 99;
  it.pitches.forEach(function (p, i) {
    var d = Math.abs(Notation.stepOfPitch(clef, p) - step);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
function stageDown(e) {
  if (e.button !== undefined && e.button !== 0) return;
  var p = probe(e);
  if (!p) { if (picked) { picked = null; paintPicked(); syncPalette(); } return; }
  e.preventDefault();
  $('#sheetFrame').focus({ preventScroll: true });
  if (histTimer) histNow();
  var c = cur(), one = c.layout === 'rhythm';
  clearGhost();
  if (p.hit && !e.shiftKey) {
    /* select, and get ready to drag */
    var items = getItems(p.hit.part), it = items[p.hit.idx];
    if (!it || it.t !== 'n') return;
    picked = { v: p.hit.part, idx: p.hit.idx, head: it.rest || it.x ? 0 : nearestHead(c, p.hit.part, it, p.step) };
    setActive(p.hit.part);
    paintPicked(); syncPalette();
    if (!it.rest && !it.x && !one) {
      drag = { step: p.step, moved: false, id: e.pointerId };
      try { scaler.setPointerCapture(e.pointerId); } catch (x) {}
    }
    return;
  }
  var v = partForStaff(p.st);
  setActive(v);
  var pitch = one ? null : Notation.pitchAtStep(p.st.clef, p.step);
  var mine = stageGeom.notes.filter(function (n) { return n.part === v; });
  if (e.shiftKey && !one) {
    /* stack onto the nearest note of this part */
    var near = null;
    mine.forEach(function (n) { if (!n.rest && (!near || Math.abs(n.x - p.x) < Math.abs(near.x - p.x))) near = n; });
    if (near && Math.abs(near.x - p.x) <= 16) {
      var its = getItems(v), target = its[near.idx];
      var dup = target.pitches.some(function (q) { return q.letter === pitch.letter && q.oct === pitch.oct; });
      if (!dup) {
        target.pitches.push({ letter: pitch.letter, acc: pal.acc || null, oct: pitch.oct });
        pal.acc = '';
        picked = null;
        setItems(v, its); afterChange(true); syncPalette();
      }
      return;
    }
  }
  var at = null;
  for (var i = 0; i < mine.length; i++) if (mine[i].x > p.x) { at = mine[i].idx; break; }
  addNote(v, one ? newNote({ x:true, pitches:[{ letter:'b', acc:null, oct:4 }] })
                 : newNote({ pitches:[{ letter: pitch.letter, acc: pal.acc || null, oct: pitch.oct }] }), at);
}
function stageMove(e) {
  if (drag) {
    var pt = svgPoint(e), g = stageGeom;
    if (!pt || !g || !picked) return;
    var c = cur(), st = null;
    g.staves.forEach(function (s) { if (s.parts.indexOf(picked.v) >= 0) st = s; });
    if (!st) return;
    var step = Math.max(-9, Math.min(17, Math.round((st.top + 40 - pt.y) / 5)));
    if (step === drag.step) return;
    drag.step = step; drag.moved = true;
    var p = pickedItem();
    if (!p) return;
    var np = Notation.pitchAtStep(st.clef, step), head = p.it.pitches[picked.head];
    if (!head || p.it.pitches.some(function (q, i) { return i !== picked.head && q.letter === np.letter && q.oct === np.oct; })) return;
    head.letter = np.letter; head.oct = np.oct; head.acc = null;
    setItems(picked.v, p.items);
    refreshItem(state.sel); renderPreview(); syncPalette();
    void c;
    return;
  }
  drawGhost(probe(e));
}
function stageUp() {
  if (!drag) return;
  var moved = drag.moved;
  drag = null;
  if (moved) { updateBeats(); histNow(); }
}
/* arrow keys and Delete on the selected note */
function stepPicked(by) {
  var p = pickedItem();
  if (!p || p.it.rest || p.it.x) return;
  var c = cur(), clef = clefOfPart(c, picked.v), head = p.it.pitches[picked.head] || p.it.pitches[0];
  var step = Math.max(-12, Math.min(20, Notation.stepOfPitch(clef, head) + by));
  var np = Notation.pitchAtStep(clef, step);
  head.letter = np.letter; head.oct = np.oct; head.acc = null;
  setItems(picked.v, p.items); afterChange(false); syncPalette();
}
function movePick(by) {
  var p = pickedItem();
  if (!p) return;
  var i = picked.idx + by;
  while (i >= 0 && i < p.items.length && p.items[i].t !== 'n') i += by;
  if (i < 0 || i >= p.items.length) return;
  picked = { v: picked.v, idx: i, head: 0 };
  paintPicked(); syncPalette();
}
function removePicked() {
  var p = pickedItem();
  if (!p) return;
  p.items.splice(picked.idx, 1);
  var v = picked.v;
  picked = null;
  setItems(v, p.items); afterChange(true); syncPalette();
}
scaler.addEventListener('pointerdown', function (e) { if (e.target.closest && e.target.closest('.card-music')) stageDown(e); });
scaler.addEventListener('pointermove', function (e) { if (drag || (e.target.closest && e.target.closest('.card-music'))) stageMove(e); else clearGhost(); });
scaler.addEventListener('pointerup', stageUp);
window.addEventListener('pointerup', stageUp);
scaler.addEventListener('pointercancel', stageUp);
scaler.addEventListener('pointerleave', function () { if (!drag) clearGhost(); });
$('#sheetFrame').addEventListener('keydown', function (e) {
  if (!picked) return;
  var k = e.key;
  if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); stepPicked((k === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 7 : 1)); }
  else if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); movePick(k === 'ArrowLeft' ? -1 : 1); }
  else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); removePicked(); }
  else if (k === 'Escape') { e.preventDefault(); picked = null; paintPicked(); syncPalette(); }
});
$('#selDel').addEventListener('click', removePicked);
$('#selDone').addEventListener('click', function () { picked = null; paintPicked(); syncPalette(); });

/* ---------- playback ---------- */
var audio = null, playing = null;
function beatQuarters(time) {
  var t = Notation.tsParts(time);
  if (t.d === 8 && t.n % 3 === 0) return 1.5;
  if (t.d === 2) return 2;
  return 1;
}
function stopPlay() {
  if (!playing) return;
  var p = playing; playing = null;
  p.timers.forEach(clearTimeout);
  try { p.master.gain.cancelScheduledValues(audio.currentTime); p.master.gain.setTargetAtTime(0, audio.currentTime, 0.02); } catch (e) {}
  setTimeout(function () { p.nodes.forEach(function (n) { try { n.stop(); } catch (e) {} }); try { p.master.disconnect(); } catch (e) {} }, 120);
  $$('.playing', p.root).forEach(function (el) { el.classList.remove('playing'); });
  syncPlayButtons();
}
function syncPlayButtons() {
  $('#btnPlay').querySelector('span').textContent = playing ? 'Stop' : 'Play';
  $('#btnPlay').querySelector('path').setAttribute('d', playing ? 'M3 2.5h8v9h-8z' : 'M3 1.5v11l9-5.5z');
  $('#presentPlay').textContent = playing ? 'Stop' : 'Play';
}
function play(card, root, geom) {
  if (playing) { stopPlay(); return; }
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { toast('This browser can\'t play sound.'); return; }
  var tl = Notation.timeline(card);
  if (!tl.events.length) { toast('Nothing to play yet. Add some notes first.'); return; }
  try { audio = audio || new AC(); if (audio.state === 'suspended') audio.resume(); }
  catch (e) { toast('This browser can\'t play sound.'); return; }
  var spq = 60 / state.tempo / beatQuarters(card.time);
  var t0 = audio.currentTime + 0.12;
  var master = audio.createGain();
  master.gain.value = 0.9;
  master.connect(audio.destination);
  var p = { timers: [], nodes: [], master: master, root: root };
  var byNote = {};
  if (geom) geom.notes.forEach(function (n) { byNote[n.part + ':' + n.idx] = n.id; });
  tl.events.forEach(function (ev) {
    var start = t0 + ev.at * spq, len = Math.max(0.09, ev.dur * spq);
    var pitches = ev.click ? [76] : ev.midi;
    var level = (ev.click ? 0.2 : 0.17) / Math.sqrt(Math.max(1, pitches.length));
    pitches.forEach(function (m) {
      var f = 440 * Math.pow(2, (m - 69) / 12);
      var g = audio.createGain();
      var hold = ev.click ? Math.min(len, 0.5) * 0.92 : len * 0.94;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(level, start + 0.012);
      g.gain.exponentialRampToValueAtTime(level * (ev.click ? 0.35 : 0.5), start + Math.min(hold, 0.35));
      g.gain.setValueAtTime(level * (ev.click ? 0.35 : 0.5), start + hold);
      g.gain.linearRampToValueAtTime(0.0001, start + hold + 0.06);
      g.connect(master);
      [['triangle', 1, 1], ['sine', 2, 0.28], ['sine', 3, 0.08]].forEach(function (part) {
        var o = audio.createOscillator(), og = audio.createGain();
        o.type = part[0]; o.frequency.value = f * part[1]; og.gain.value = part[2];
        o.connect(og); og.connect(g);
        o.start(start); o.stop(start + hold + 0.1);
        p.nodes.push(o);
      });
    });
    ev.marks.forEach(function (mk) {
      var id = byNote[mk.part + ':' + mk.idx];
      if (!id) return;
      var on = (t0 - audio.currentTime + mk.at * spq) * 1000;
      p.timers.push(setTimeout(function () {
        var el = root.querySelector('[id="' + id + '"]'); if (el) el.classList.add('playing');
      }, on));
      p.timers.push(setTimeout(function () {
        var el = root.querySelector('[id="' + id + '"]'); if (el) el.classList.remove('playing');
      }, on + Math.max(90, mk.dur * spq * 1000 - 20)));
    });
  });
  p.timers.push(setTimeout(stopPlay, (t0 - audio.currentTime + tl.length * spq) * 1000 + 250));
  playing = p;
  syncPlayButtons();
}
$('#btnPlay').addEventListener('click', function () {
  if (histTimer) histNow();
  play(Object.assign({}, cur()), stageMusic || scaler, stageGeom);
});
$('#optTempo').addEventListener('change', function () {
  var v = Math.max(30, Math.min(240, parseInt(this.value, 10) || 84));
  this.value = v; state.tempo = v; stopPlay(); persist();
});

/* ---------- deck operations ---------- */
function select(i) {
  if (histTimer) histNow();
  state.sel = Math.max(0, Math.min(state.cards.length - 1, i));
  picked = null;
  $$('#deckList .deck-item').forEach(function (b, j) { b.setAttribute('aria-current', j === state.sel ? 'true' : 'false'); });
  syncTitles();
  loadEditor();
  renderPreview();
  scrollSelIntoView();
  persist();
}
function renderAll() {
  renderList();
  loadEditor();
  renderPreview();
  scrollSelIntoView();
}
function moveCard(from, to) {
  if (from < 0 || from >= state.cards.length) return;
  if (to > from) to--;
  to = Math.max(0, Math.min(state.cards.length - 1, to));
  if (to === from) return;
  var c = state.cards.splice(from, 1)[0];
  state.cards.splice(to, 0, c);
  state.sel = to;
  renderAll(); histNow();
}

$('#btnAdd').addEventListener('click', function () {
  if (histTimer) histNow();
  state.cards.splice(state.sel + 1, 0, freshFrom(cur()));
  state.sel += 1; picked = null;
  renderAll(); histNow();
  partInput(visibleParts(cur())[0]).focus();
});
$('#btnDup').addEventListener('click', function () {
  if (histTimer) histNow();
  state.cards.splice(state.sel + 1, 0, clone(cur()));
  state.sel += 1; picked = null;
  renderAll(); histNow();
});
$('#btnDel').addEventListener('click', function () {
  if (histTimer) histNow();
  var n = state.sel + 1;
  if (state.cards.length === 1) { state.cards = [freshFrom(cur())]; state.sel = 0; }
  else { state.cards.splice(state.sel, 1); state.sel = Math.min(state.sel, state.cards.length - 1); }
  picked = null;
  renderAll(); histNow();
  toast('Card ' + n + ' deleted.', true);
});
$('#btnUp').addEventListener('click', function () { moveCard(state.sel, state.sel - 1); });
$('#btnDown').addEventListener('click', function () { moveCard(state.sel, state.sel + 2); });
$('#btnPrev').addEventListener('click', function () { select(state.sel - 1); });
$('#btnNext').addEventListener('click', function () { select(state.sel + 1); });

$('#deckList').addEventListener('keydown', function (e) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  var d = e.key === 'ArrowUp' ? -1 : 1;
  if (e.altKey) moveCard(state.sel, state.sel + (d > 0 ? 2 : -1));
  else select(state.sel + d);
  var b = $$('#deckList .deck-item')[state.sel];
  if (b) b.focus();
});

$('#btnLtrLines').addEventListener('click', function () { fillLetters('lines'); });
$('#btnLtrSpaces').addEventListener('click', function () { fillLetters('spaces'); });
$('#btnLtrAll').addEventListener('click', function () { fillLetters('all'); });
$('#btnLtrClear').addEventListener('click', function () { fillLetters('none'); });

$('#btnVerse').addEventListener('click', function () {
  pullEditor();
  var c = cur();
  if (!c.lyrics.length) c.lyrics.push('');
  if (c.lyrics.length < MAX_VERSES) c.lyrics.push('');
  renderVerses(); updateBeats();
  var ins = verseInputs();
  ins[ins.length - 1].focus();
});

$('#btnApplyAll').addEventListener('click', function () {
  if (histTimer) histNow();
  var s = setupOf(cur());
  state.cards.forEach(function (c, i) {
    if (i !== state.sel) Object.assign(c, clone(s));
  });
  renderAll(); histNow();
  toast('Every card now uses this staff setup.', true);
});

$('#deckName').addEventListener('input', function () { state.name = this.value || 'Untitled deck'; histSoon(); });
['fTitle','fCaption','fAnswer'].forEach(function (id) { $('#' + id).addEventListener('input', onEdit); });
['fClef','fKey','fTime'].forEach(function (id) { $('#' + id).addEventListener('change', onSetup); });
$$('input[name="fLayout"], input[name="fShapes"]').forEach(function (r) { r.addEventListener('change', onSetup); });
['fShowClef','fShowKey','fShowTime','fEndBar'].forEach(function (id) { $('#' + id).addEventListener('change', onSetup); });

$$('input[name="optOrient"]').forEach(function (r) {
  r.addEventListener('change', function () { state.orient = radio('optOrient'); applyPageStyle(); renderPreview(); persist(); });
});
$$('input[name="optPerPage"]').forEach(function (r) {
  r.addEventListener('change', function () { state.perPage = parseInt(radio('optPerPage'), 10); renderPreview(); persist(); });
});
$('#optSize').addEventListener('change', function () { state.size = this.value; renderPreview(); persist(); });
$('#optAnswers').addEventListener('change', function () { state.answers = this.checked; renderPreview(); persist(); });
$('#optSeq').addEventListener('change', function () { state.seq = this.checked; renderPreview(); persist(); });

$$('[data-close]').forEach(function (b) { b.addEventListener('click', function () { closeDlg(b.closest('dialog')); }); });

$('#btnUndo').addEventListener('click', undo);
$('#btnRedo').addEventListener('click', redo);
$('#toastUndo').addEventListener('click', undo);

/* tabs: the open one is remembered per browser, purely as a convenience */
function showTab(name) {
  var found = false;
  $$('.tab').forEach(function (t) { var on = t.dataset.tab === name; found = found || on; t.setAttribute('aria-selected', on ? 'true' : 'false'); });
  if (!found) return showTab('staff');
  $$('.tabpanel').forEach(function (p) { p.hidden = p.dataset.panel !== name; });
  try { window.localStorage.setItem('measure-cards-tab', name); } catch (e) {}
}
$$('.tab').forEach(function (t) { t.addEventListener('click', function () { showTab(t.dataset.tab); }); });

/* the Deck menu closes after a choice or a click elsewhere */
var deckMenu = $('#deckMenu');
document.addEventListener('click', function (e) {
  if (!deckMenu.open) return;
  if (!deckMenu.contains(e.target) || (e.target.closest && e.target.closest('.menu-list button'))) deckMenu.open = false;
});
function openHelp() { openDlg($('#dlgHelp')); }
$('#btnHelp').addEventListener('click', openHelp);
$('#btnHelp2').addEventListener('click', openHelp);

/* ---------- print ---------- */
var pageStyle = document.createElement('style');
document.head.appendChild(pageStyle);
function applyPageStyle() {
  pageStyle.textContent = '@page { size: Letter ' + state.orient + '; margin: ' + state.margin + 'in; }';
}
function clearPrint() { $('#printroot').innerHTML = ''; }
window.addEventListener('afterprint', clearPrint);
$('#btnPrint').addEventListener('click', function () {
  if (histTimer) histNow();
  stopPlay();
  var root = $('#printroot');
  root.innerHTML = '';
  var per = state.perPage;
  for (var i = 0; i < state.cards.length; i += per) {
    root.appendChild(buildPage(state.cards.slice(i, i + per), i, state.cards.length, per));
  }
  $$('.page', root).forEach(drawPage);
  setTimeout(function () { window.print(); }, 60);
});

/* ---------- files ---------- */
$('#btnSave').addEventListener('click', function () {
  if (histTimer) histNow();
  var blob = new Blob([JSON.stringify(JSON.parse(serialize()), null, 2)], { type:'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  var base = state.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase();
  a.download = (base || 'music-cards') + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
});
$('#btnOpen').addEventListener('click', function () { $('#fileIn').click(); });
$('#fileIn').addEventListener('change', function () {
  var f = this.files && this.files[0];
  if (!f) return;
  var r = new FileReader();
  r.onload = function () {
    var ok = false;
    try { ok = applyDeck(JSON.parse(r.result)); } catch (e) { ok = false; }
    if (!ok) { toast('That file isn\'t a Measure Cards deck. Pick a .json file saved from this page.'); return; }
    state.sel = 0; picked = null;
    renderAll(); histNow();
    toast('Opened "' + state.name + '".', true);
  };
  r.readAsText(f);
  this.value = '';
});
$('#btnNew').addEventListener('click', function () {
  if (histTimer) histNow();
  state.name = 'Untitled deck';
  state.cards = [blankCard({ parts:['','','',''] })];
  state.sel = 0; picked = null; active = 0;
  $('#deckName').value = state.name;
  renderAll(); histNow();
  toast('Started a new deck.', true);
  partInput(0).focus();
});

/* ---------- add many ---------- */
$('#btnBulk').addEventListener('click', function () { openDlg($('#dlgBulk')); $('#bulkText').focus(); });
$('#bulkGo').addEventListener('click', function () {
  var lines = $('#bulkText').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  if (!lines.length) { closeDlg($('#dlgBulk')); return; }
  if (histTimer) histNow();
  var base = setupOf(cur());
  var made = lines.map(function (line) {
    var bits = line.split('//').map(function (s) { return s.trim(); });
    return normCard(Object.assign(clone(base), {
      parts: [bits[0], '', '', ''],
      title: bits[1] || '', caption: bits[2] || '', answer: bits[3] || '',
      lyrics: bits[4] ? [bits[4]] : []
    }));
  });
  if ($('#bulkReplace').checked) { state.cards = made; state.sel = 0; }
  else { state.cards = state.cards.concat(made); state.sel = state.cards.length - made.length; }
  picked = null;
  closeDlg($('#dlgBulk'));
  $('#bulkText').value = '';
  renderAll(); histNow();
  toast(made.length + (made.length === 1 ? ' card added.' : ' cards added.'), true);
});

/* ---------- starter decks ---------- */
function rhythmDeck(pats) {
  return pats.map(function (p) {
    return blankCard({ parts:[p[0], '', '', ''], lyrics:[p[1]], layout:'rhythm', showClef:false, showKey:false });
  });
}
function one(notes, more) { return blankCard(Object.assign({ parts:[notes, '', '', ''] }, more || {})); }
var STARTERS = [
  { group:'Rhythm', name:'Quarters and eighths', note:'8 one-measure patterns on a rhythm line, with counting words under the notes',
    make:function () { return rhythmDeck([
      ['x/q x x x', 'ta ta ta ta'],
      ['x/8 x x/q x x', 'ti-ti ta ta ta'],
      ['x/q x/8 x x/q x', 'ta ti-ti ta ta'],
      ['x/q x x/8 x x/q', 'ta ta ti-ti ta'],
      ['x/8 x x x x/q x', 'ti-ti ti-ti ta ta'],
      ['x/q x/8 x x x x/q', 'ta ti-ti ti-ti ta'],
      ['x/8 x x/q x/8 x x/q', 'ti-ti ta ti-ti ta'],
      ['x/8 x x x x x x x', 'ti-ti ti-ti ti-ti ti-ti']]); } },
  { group:'Rhythm', name:'Adding rests', note:'6 patterns mixing notes and quarter rests',
    make:function () { return rhythmDeck([
      ['x/q x r x', 'ta ta ta'],
      ['x/q r x x', 'ta ta ta'],
      ['x/8 x x/q r x', 'ti-ti ta ta'],
      ['x/q x/8 x r/q x', 'ta ti-ti ta'],
      ['r/q x x/8 x x/q', 'ta ti-ti ta'],
      ['x/h r/h', 'ta\u2011a']]); } },
  { group:'Rhythm', name:'Half, dotted half and whole', note:'6 patterns for longer notes',
    make:function () { return rhythmDeck([
      ['x/w', 'ta-a-a-a'],
      ['x/h x', 'ta-a ta-a'],
      ['x/h. x/q', 'ta-a-a ta'],
      ['x/q x x/h', 'ta ta ta-a'],
      ['x/h x/q x', 'ta-a ta ta'],
      ['x/q x/h x/q', 'ta ta-a ta']].map(function (p) { return [p[0], p[1].replace(/-a/g, '\u2011a')]; })); } },
  { group:'Rhythm', name:'Sixteenths, ties and triplets', note:'7 measures for older students, 4/4',
    make:function () { return rhythmDeck([
      ['x/16 x x x x/q x x', 'ti-ka-ti-ka ta ta ta'],
      ['x/q x/16 x x x x/q x', 'ta ti-ka-ti-ka ta ta'],
      ['x/8 x/16 x x/q x x', 'ti-ti-ka ta ta ta'],
      ['x/16 x x x x/8 x x/q x', 'ti-ka-ti-ka ti-ti ta ta'],
      ['x/8. x/16 x/q x x', 'tim-ka ta ta ta'],
      ['x/q~ x/8 x x/q x', 'ta ti ta ta'],
      ['{x/8 x x} x/q {x/8 x x} x/q', 'tri-o-la ta tri-o-la ta']]); } },
  { group:'Reading pitch', name:'Treble staff: name that note', note:'11 whole notes from middle C up, with answers',
    make:function () {
      return ['c4','d4','e4','f4','g4','a4','b4','c5','d5','e5','f5'].map(function (p) {
        return one(p + '/w', { showTime:false, clef:'treble', answer:p[0].toUpperCase() });
      }); } },
  { group:'Reading pitch', name:'Bass staff: name that note', note:'11 whole notes below middle C, with answers',
    make:function () {
      return ['c2','d2','e2','f2','g2','a2','b2','c3','d3','e3','f3'].map(function (p) {
        return one(p + '/w', { showTime:false, clef:'bass', answer:p[0].toUpperCase() });
      }); } },
  { group:'Reading pitch', name:'Steps, skips and leaps', note:'8 two-note cards for melodic motion',
    make:function () {
      var pairs = [['c4 d4','step up'],['e4 d4','step down'],['c4 e4','skip up'],['g4 e4','skip down'],
                   ['f4 g4','step up'],['a4 f4','skip down'],['c4 g4','leap up'],['g4 c4','leap down']];
      return pairs.map(function (p) {
        return one(p[0].split(' ').map(function (n) { return n + '/h'; }).join(' '), { showTime:false, answer:p[1] });
      }); } },
  { group:'Reading pitch', name:'The grand staff', note:'Lines and spaces labelled on both staves, then middle C from each side',
    make:function () {
      var g = { layout:'grand', showTime:false };
      return [
        blankCard(Object.assign({}, g, { parts:['','','',''], title:'Lines', letters:['E','','G','','B','','D','','F'], letters2:['G','','B','','D','','F','','A'] })),
        blankCard(Object.assign({}, g, { parts:['','','',''], title:'Spaces', letters:['','F','','A','','C','','E',''], letters2:['','A','','C','','E','','G',''] })),
        blankCard(Object.assign({}, g, { parts:['c4/w','','',''], answer:'Middle C, written for the right hand' })),
        blankCard(Object.assign({}, g, { parts:['','','c4/w',''], answer:'Middle C, written for the left hand' })),
        blankCard(Object.assign({}, g, { parts:['c4/q d e f | g/w','','c3/q d e f | g/w',''], showTime:true, answer:'C position, hands an octave apart' }))
      ]; } },
  { group:'Songs with words', name:'Melody with lyrics', note:'Two short tunes with a syllable under each note',
    make:function () {
      return [
        one('e4/q d c d | e e e/h', { title:'Mary Had a Little Lamb', lyrics:['Ma-ry had a lit-tle lamb,'] }),
        one('d4/q d d/h | e/q e e/h', { lyrics:['lit-tle lamb, lit-tle lamb,'] }),
        one('c4/q c g g | a a g/h', { title:'Twinkle, Twinkle', lyrics:['Twin-kle, twin-kle, lit-tle star,'] }),
        one('f4/q f e e | d d c/h', { lyrics:['how I won-der what you are.'] })
      ]; } },
  { group:'Songs with words', name:'Hymn in four parts', note:'Old Hundredth on a grand staff: soprano and alto above, tenor and bass below, two verses between',
    make:function () {
      var h = { layout:'grand', key:'G' };
      return [
        blankCard(Object.assign({}, h, { title:'Old Hundredth',
          parts:['g4/h g/q f | e d g a | b/w', 'd4/h d/q d | b3 b b d4 | d/w', 'b3/h b/q a | g f g f | g/w', 'g3/h g/q d | e b2 e3 d | g2/w'],
          lyrics:['Praise God, from whom all bless-ings flow;', 'Praise Him, all crea-tures here be-low;'] })),
        blankCard(Object.assign({}, h, { shapes:'7', title:'The same phrase in seven shapes',
          parts:['g4/h g/q f | e d g a | b/w', 'd4/h d/q d | b3 b b d4 | d/w', 'b3/h b/q a | g f g f | g/w', 'g3/h g/q d | e b2 e3 d | g2/w'],
          lyrics:['Praise God, from whom all bless-ings flow;'] }))
      ]; } },
  { group:'Shape notes', name:'Seven shapes: the scale', note:'Do to do in C, then one card per shape with the syllable as the answer',
    make:function () {
      var notes = ['c4','d4','e4','f4','g4','a4','b4','c5'];
      var cards = [one('c4/8 d e f g a b c5', { shapes:'7', lyrics:['do re mi fa sol la ti do'] })];
      notes.slice(0, 7).forEach(function (p) {
        cards.push(one(p + '/q', { shapes:'7', showTime:false, answer:Notation.syllableFor(p[0], 'C', '7') }));
      });
      return cards; } },
  { group:'Shape notes', name:'Four shapes: fa sol la mi', note:'The scale in G, then one card per shape with the syllable as the answer',
    make:function () {
      var cards = [one('g4/8 a b c5 d e f g', { key:'G', shapes:'4', lyrics:['fa sol la fa sol la mi fa'] })];
      ['g4','a4','b4','c5','d5','e5','f5'].forEach(function (p) {
        cards.push(one(p + '/q', { key:'G', shapes:'4', showTime:false, answer:Notation.syllableFor(p[0], 'G', '4') }));
      });
      return cards; } }
];
$('#btnStarter').addEventListener('click', function () {
  var box = $('#starterList');
  box.innerHTML = '';
  var lastGroup = '';
  STARTERS.forEach(function (s) {
    if (s.group !== lastGroup) {
      var h = document.createElement('div'); h.className = 'choice-group'; h.textContent = s.group;
      box.appendChild(h); lastGroup = s.group;
    }
    var b = document.createElement('button');
    b.className = 'deck-choice'; b.type = 'button';
    b.innerHTML = '<b></b><span></span>';
    b.querySelector('b').textContent = s.name;
    b.querySelector('span').textContent = s.note;
    b.addEventListener('click', function () {
      if (histTimer) histNow();
      state.cards = s.make().map(normCard); state.name = s.name; state.sel = 0;
      picked = null; active = 0;
      $('#deckName').value = s.name;
      closeDlg($('#dlgStarter'));
      renderAll(); histNow();
      toast('Loaded "' + s.name + '".', true);
    });
    box.appendChild(b);
  });
  openDlg($('#dlgStarter'));
});

/* ---------- present mode ---------- */
var present = $('#present'), presentOn = false, presentAns = false, presentFrom = null;
var presentGeom = null, presentMusic = null;
function showPresent(i) {
  stopPlay();
  state.sel = Math.max(0, Math.min(state.cards.length - 1, i));
  var host = $('#presentPage');
  host.innerHTML = '';
  var card = cur();
  var slot = buildSlot(card, state.sel, state.cards.length, 1, false, false);
  if (presentAns && card.answer) {
    var rev = document.createElement('div');
    rev.className = 'card-reveal';
    rev.textContent = card.answer;
    slot.appendChild(rev);
  }
  host.appendChild(slot);
  presentGeom = drawCard(slot._music, slot._card).geom;
  presentMusic = slot._music;
  $('#presentPos').textContent = (state.sel + 1) + ' / ' + state.cards.length;
  $('#presentPrev').disabled = state.sel <= 0;
  $('#presentNext').disabled = state.sel >= state.cards.length - 1;
  var ab = $('#presentAnswer');
  ab.hidden = !card.answer;
  ab.textContent = presentAns ? 'Hide answer' : 'Show answer';
}
function startPresent() {
  if (histTimer) histNow();
  stopPlay();
  presentOn = true; presentAns = false;
  presentFrom = document.activeElement;
  hideToast();
  present.classList.add('on');
  showPresent(state.sel);
  present.focus();
}
function endPresent() {
  stopPlay();
  presentOn = false;
  present.classList.remove('on');
  picked = null;
  renderAll();
  if (presentFrom && presentFrom.focus) presentFrom.focus();
}
function presentPlay() { play(Object.assign({}, cur()), presentMusic, presentGeom); }
$('#btnPresent').addEventListener('click', startPresent);
$('#presentClose').addEventListener('click', endPresent);
$('#presentPrev').addEventListener('click', function () { showPresent(state.sel - 1); });
$('#presentNext').addEventListener('click', function () { showPresent(state.sel + 1); });
$('#presentAnswer').addEventListener('click', function () { presentAns = !presentAns; showPresent(state.sel); });
$('#presentPlay').addEventListener('click', presentPlay);
$('#presentPage').addEventListener('click', function (e) {
  var r = this.getBoundingClientRect();
  showPresent(state.sel + (e.clientX < r.left + r.width / 3 ? -1 : 1));
});

document.addEventListener('keydown', function (e) {
  if (presentOn) {
    if (e.key === 'Escape') { e.preventDefault(); endPresent(); }
    else if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && e.target === present)) { e.preventDefault(); showPresent(state.sel + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); showPresent(state.sel - 1); }
    else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); presentAns = !presentAns; showPresent(state.sel); }
    else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); presentPlay(); }
    else if (e.key === 'Home') { e.preventDefault(); showPresent(0); }
    else if (e.key === 'End') { e.preventDefault(); showPresent(state.cards.length - 1); }
    return;
  }
  var mod = e.ctrlKey || e.metaKey;
  if (mod && !isTyping(e.target) && !document.querySelector('dialog[open]')) {
    var k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
  }
});

/* ---------- go ---------- */
/* redraw the card whenever the room it has changes: window resizes, a taller tab, another verse */
var resizeTimer, frameW = 0, frameH = 0;
function frameChanged() {
  var f = $('#sheetFrame');
  if (f.clientWidth === frameW && f.clientHeight === frameH) return;
  frameW = f.clientWidth; frameH = f.clientHeight;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function () { if (!drag && !playing) renderPreview(); }, 90);
}
window.addEventListener('resize', frameChanged);
if (window.ResizeObserver) new ResizeObserver(frameChanged).observe($('#sheetFrame'));

fillSelects();
buildVoices();
buildLetterStaves();
buildPalette();
var saved = null;
try { saved = window.localStorage.getItem(STORE); } catch (e) { saved = null; }
var restored = false;
if (saved) { try { restored = applyDeck(JSON.parse(saved)); } catch (e) { restored = false; } }
if (!restored) syncDeckControls();
var tab0 = 'staff';
try { tab0 = window.localStorage.getItem('measure-cards-tab') || 'staff'; } catch (e) {}
renderAll();
showTab(tab0);
histNow();
if (restored) toast('Picked up where you left off: "' + state.name + '".');
})();
