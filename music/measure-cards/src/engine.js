/* ============================================================
   Notation engine
   Reads the typed notes, lays them out and draws them with VexFlow.
   ============================================================ */
(function (global) {
  'use strict';
  var DUR = { w:'w', h:'h', q:'q', e:'8', s:'16', t:'32', '1':'w', '2':'h', '4':'q', '8':'8', '16':'16', '32':'32' };
  var QUARTERS = { w:4, h:2, q:1, '8':0.5, '16':0.25, '32':0.125 };
  var LETTERS = 'cdefgab';
  var SEMIS = { c:0, d:2, e:4, f:5, g:7, a:9, b:11 };

  /* Key signatures as a count: positive = sharps, negative = flats. */
  var KEY_SIGS = { C:0, G:1, D:2, A:3, E:4, B:5, 'F#':6, 'C#':7,
                   F:-1, Bb:-2, Eb:-3, Ab:-4, Db:-5, Gb:-6, Cb:-7 };

  var SYLLABLES = {
    '4': ['fa','sol','la','fa','sol','la','mi'],
    '7': ['do','re','mi','fa','sol','la','ti']
  };

  function keySigMap(key) {
    var n = KEY_SIGS[key] || 0, map = {}, order = n > 0 ? 'fcgdaeb' : 'beadgcf';
    for (var i = 0; i < Math.abs(n); i++) map[order[i]] = n > 0 ? '#' : 'b';
    return map;
  }
  function tonicIndex(key) { return LETTERS.indexOf(String(key || 'C').charAt(0).toLowerCase()); }

  /* Movable do: the key signature's major tonic is do (or fa, in four shapes). */
  function syllableFor(letter, key, system) {
    var set = SYLLABLES[system] || SYLLABLES['7'];
    var deg = (LETTERS.indexOf(letter) - tonicIndex(key) + 7) % 7;
    return set[deg];
  }

  function tsParts(ts) {
    var m = /^(\d+)\s*\/\s*(\d+)$/.exec(ts || '4/4');
    return m ? { n:parseInt(m[1], 10), d:parseInt(m[2], 10) } : { n:4, d:4 };
  }

  /* ---------- reading typed notes ----------
     A voice is one line of text. It becomes a flat list of items:
       {t:'n'}  a note, chord or rest      {t:'b'}  a barline      {t:'x'}  something unreadable
     A length or octave typed once keeps going until it is typed again. */
  function tokenize(text) {
    return String(text || '').match(/:\|:|:\||\|:|\|\||\|\]|\||[^\s,|:]+/g) || [];
  }
  function parseVoice(text, defOct) {
    var items = [], err = null, dur = 'q', dots = 0, oct = defOct;
    tokenize(text).forEach(function (tok) {
      if (/^[|:\]]+$/.test(tok)) { items.push({ t:'b', kind: tok === '|]' ? '|' : tok }); return; }
      var m = /^([({]*)(.*?)([~)}^]*)$/.exec(tok);
      var pre = m[1], core = m[2], post = m[3];
      var slash = core.indexOf('/');
      var body  = slash === -1 ? core : core.slice(0, slash);
      var dpart = slash === -1 ? ''   : core.slice(slash + 1);
      if (dpart) {
        var dm = dpart.toLowerCase().match(/^([whqest]|16|32|1|2|4|8)(\.{0,2})$/);
        if (!dm) {
          err = err || ('"' + tok + '" has a length I don\'t know. Use w, h, q, 8 or 16.');
          items.push({ t:'x', text:tok }); return;
        }
        dur = DUR[dm[1]]; dots = dm[2] ? dm[2].length : 0;
      }
      var it = { t:'n', rest:false, x:false, pitches:[], dur:dur, dots:dots,
                 tie: post.indexOf('~') >= 0, ferm: post.indexOf('^') >= 0,
                 slurS: pre.indexOf('(') >= 0, slurE: post.indexOf(')') >= 0,
                 tupS: pre.indexOf('{') >= 0, tupE: post.indexOf('}') >= 0 };
      var chordParts = body.split('+').filter(Boolean);
      if (chordParts.length === 1 && /^(r|-|_)$/i.test(chordParts[0])) { it.rest = true; items.push(it); return; }
      if (chordParts.length === 1 && /^x$/i.test(chordParts[0])) {
        it.x = true; it.pitches = [{ letter:'b', acc:null, oct:4 }]; items.push(it); return;
      }
      var bad = !chordParts.length, keep = oct;
      for (var c = 0; c < chordParts.length && !bad; c++) {
        var pm = chordParts[c].toLowerCase().match(/^([a-g])(#{1,2}|b{1,2}|n)?(-?\d)?$/);
        if (!pm) { bad = true; break; }
        if (pm[3] !== undefined && pm[3] !== '') oct = parseInt(pm[3], 10);
        it.pitches.push({ letter: pm[1], acc: pm[2] || null, oct: oct });
      }
      if (bad) {
        oct = keep;
        err = err || ('I could not read "' + tok + '". Notes look like c4, f#4 or bb3.');
        items.push({ t:'x', text:tok }); return;
      }
      items.push(it);
    });
    return { items: items, error: err };
  }

  /* The shortest text that reads back as the same items. */
  function serializeVoice(items, defOct) {
    var dur = 'q', dots = 0, oct = defOct, first = true, out = [];
    items.forEach(function (it) {
      if (it.t === 'b') { out.push(it.kind); return; }
      if (it.t === 'x') { out.push(it.text); return; }
      var body;
      if (it.rest) body = 'r';
      else if (it.x) body = 'x';
      else {
        body = it.pitches.map(function (p, i) {
          var o = (p.oct !== oct || (first && i === 0)) ? String(p.oct) : '';
          oct = p.oct;
          return p.letter + (p.acc || '') + o;
        }).join('+');
      }
      if (first || it.dur !== dur || it.dots !== dots) {
        body += '/' + it.dur + (it.dots === 2 ? '..' : it.dots === 1 ? '.' : '');
        dur = it.dur; dots = it.dots;
      }
      first = false;
      out.push((it.tupS ? '{' : '') + (it.slurS ? '(' : '') + body +
               (it.tie ? '~' : '') + (it.ferm ? '^' : '') + (it.slurE ? ')' : '') + (it.tupE ? '}' : ''));
    });
    return out.join(' ');
  }

  function itemQuarters(it, inTuplet) {
    var q = QUARTERS[it.dur] || 0;
    q *= it.dots === 2 ? 1.75 : it.dots === 1 ? 1.5 : 1;
    return inTuplet ? q * 2 / 3 : q;
  }

  /* Cut a voice into measures. Each note entry remembers its place in the
     item list (idx) so the editor can find it again after a click. */
  function splitMeasures(items) {
    var ms = [], cur = { notes:[], beg:null, end:null }, open = true, tup = null;
    function close(kind) {
      if (tup) tup = null;
      cur.end = kind; ms.push(cur);
      cur = { notes:[], beg:null, end:null };
    }
    items.forEach(function (it, idx) {
      if (it.t === 'x') return;
      if (it.t === 'b') {
        var k = it.kind;
        if (!ms.length && !cur.notes.length && cur.beg === null && (k === '|:' || k === '|')) {
          if (k === '|:') cur.beg = '|:';
          return;
        }
        if (k === '|:') { close('|'); cur.beg = '|:'; open = true; }
        else if (k === ':|:') { close(':|'); cur.beg = '|:'; open = true; }
        else if (k === ':|') { close(':|'); open = false; }
        else if (k === '||') { close('||'); open = false; }
        else { close('|'); open = true; }
        return;
      }
      var n = { it: it, idx: idx, tup: false };
      if (it.tupS) tup = [];
      if (tup) { tup.push(n); n.tup = true; }
      if (it.tupE && tup) {
        if (tup.length > 1) (cur.tuplets = cur.tuplets || []).push(tup);
        else n.tup = false;
        tup = null;
      }
      n.q = itemQuarters(it, n.tup);
      cur.notes.push(n);
      open = true;
    });
    if (cur.notes.length || !ms.length || open) ms.push(cur);
    /* an unclosed { is not a triplet */
    ms.forEach(function (m) {
      var done = [];
      (m.tuplets || []).forEach(function (g) { done = done.concat(g); });
      m.notes.forEach(function (n) { if (n.tup && done.indexOf(n) < 0) { n.tup = false; n.q = itemQuarters(n.it, false); } });
    });
    return ms;
  }

  function defOctFor(clef) { return clef === 'bass' || clef === 'tenor' ? 3 : 4; }

  /* Which staves a card has, and which of its four parts sits on each. */
  function staffPlan(card) {
    if (card.layout === 'grand') return [{ clef:'treble', parts:[0, 1] }, { clef:'bass', parts:[2, 3] }];
    if (card.layout === 'rhythm') return [{ clef:'treble', parts:[0] }];
    return [{ clef: card.clef || 'treble', parts:[0] }];
  }

  /* How full each measure of one voice is, counted in the time signature's own beat unit. */
  function countBeats(text, ts, defOct) {
    var t = tsParts(ts), p = parseVoice(text, defOct === undefined ? 4 : defOct);
    var ms = splitMeasures(p.items);
    return {
      error: p.error,
      measures: ms.map(function (m) {
        var q = 0;
        m.notes.forEach(function (n) { q += n.q; });
        return { have: q * t.d / 4, need: t.n, unit: t.d, notes: m.notes.length };
      })
    };
  }

  /* Everything the drawing and the playback both need to know about a card. */
  function buildModel(card) {
    var plan = staffPlan(card), ks = keySigMap(card.key || 'C');
    var parts = card.parts || [''];
    var voices = [], error = null;
    plan.forEach(function (st, si) {
      var live = st.parts.filter(function (pi) { return String(parts[pi] || '').trim(); });
      if (si === 0 && !live.length) live = [st.parts[0]];
      live.forEach(function (pi) {
        var p = parseVoice(parts[pi] || '', defOctFor(st.clef));
        if (p.error) error = error || p.error;
        voices.push({ part: pi, staff: si, clef: st.clef, pos: st.parts.indexOf(pi),
                      two: live.length > 1, items: p.items, measures: splitMeasures(p.items) });
      });
    });
    var count = 1;
    voices.forEach(function (v) { count = Math.max(count, v.measures.length); });
    var bars = [];
    for (var m = 0; m < count; m++) {
      var b = { beg:null, end:'|', len:0 };
      voices.forEach(function (v) {
        var vm = v.measures[m];
        if (!vm) return;
        if (vm.beg) b.beg = vm.beg;
        if (vm.end && vm.end !== '|') b.end = vm.end;
        var at = 0, inForce = {};
        vm.notes.forEach(function (n) {
          n.at = at; at += n.q;
          n.show = []; n.midi = [];
          if (n.it.rest) return;
          n.it.pitches.forEach(function (p) {
            var spot = p.letter + p.oct;
            var current = Object.prototype.hasOwnProperty.call(inForce, spot) ? inForce[spot] : (ks[p.letter] || '');
            var wanted = p.acc === null ? (ks[p.letter] || '') : (p.acc === 'n' ? '' : p.acc);
            /* a typed natural is always drawn: a teacher who types it wants it seen */
            n.show.push((p.acc === 'n' || wanted !== current) ? (wanted === '' ? 'n' : wanted) : null);
            inForce[spot] = wanted;
            var alter = wanted === '#' ? 1 : wanted === '##' ? 2 : wanted === 'b' ? -1 : wanted === 'bb' ? -2 : 0;
            n.midi.push(12 * (p.oct + 1) + SEMIS[p.letter] + alter);
          });
        });
        b.len = Math.max(b.len, at);
      });
      bars.push(b);
    }
    return { plan: plan, voices: voices, bars: bars, count: count, error: error,
             oneLine: card.layout === 'rhythm', grand: card.layout === 'grand' };
  }

  /* ---------- lyrics ----------
     Words are split on spaces, syllables on hyphens. A lone _ holds the
     previous syllable over one more note. */
  function parseLyrics(text) {
    var out = [];
    String(text || '').trim().split(/\s+/).filter(Boolean).forEach(function (word) {
      if (/^_+$/.test(word)) { for (var u = 0; u < word.length; u++) out.push(null); return; }
      var bits = word.split('-');
      bits.forEach(function (b, i) {
        if (b === '' && i === bits.length - 1) return;
        if (b === '_') { out.push(null); return; }
        out.push({ text: b.replace(/_/g, ' '), hy: i < bits.length - 1 });
      });
    });
    return out;
  }
  /* The notes that carry a syllable: the top voice, skipping rests and the far end of a tie. */
  function lyricNotes(model) {
    var v = model.voices[0], out = [], tied = false;
    if (!v) return out;
    v.measures.forEach(function (m) {
      m.notes.forEach(function (n) {
        if (n.it.rest) { tied = false; return; }
        if (!tied) out.push(n);
        tied = !!n.it.tie;
      });
    });
    return out;
  }

  var measureCtx = null;
  var LYR_FONT = 'Georgia, "Times New Roman", serif';
  function textWidth(text, size) {
    if (!measureCtx) {
      try { measureCtx = document.createElement('canvas').getContext('2d'); } catch (e) { measureCtx = false; }
    }
    if (!measureCtx) return text.length * size * 0.5;
    measureCtx.font = size + 'px ' + LYR_FONT;
    return measureCtx.measureText(text).width;
  }

  function beamGroups(VF, ts) {
    var t = tsParts(ts);
    if (t.d === 8 && t.n % 3 === 0) return [new VF.Fraction(3, 8)];
    if (t.d === 8) return [new VF.Fraction(2, 8)];
    if (t.d === 2) return [new VF.Fraction(1, 2)];
    return [new VF.Fraction(1, 4)];
  }

  var RHYTHM_KEY = 'f/5';   // sits exactly on the single line
  var REST_KEY = { treble:'b/4', bass:'d/3', alto:'c/4', tenor:'a/3' };
  var REST_HI  = { treble:'f/5', bass:'a/3', alto:'g/4', tenor:'e/4' };
  var REST_LO  = { treble:'e/4', bass:'g/2', alto:'f/3', tenor:'d/3' };
  var TOP = 110, PAD = 18, HEADROOM = 40;
  var BAND_TOP = 98, BAND_BOTTOM = 242;   // the slice of the canvas a plain staff occupies

  /* Smaller canvas width = larger notes on the printed page. */
  var SIZES = { xl:380, l:460, m:580, s:740 };

  /* ---------- spacing ----------
     Notes are spaced by how long they last, the way engraved music is: a half
     note gets about 1.4 times the room of a quarter, an eighth about 0.7.
     Nothing is ever closer than its own ink (accidentals, dots, lyrics) needs. */
  var UNIT = 30;          // quarter-to-quarter distance before stretching
  var STRETCH_MAX = 2.3;  // sparse cards stop spreading here and centre instead
  var NOTE_GAP = 5, LYR_GAP = 5, HYPHEN_ROOM = 5;
  var LEAD = 5, TAIL = 9, HEAD_HALF = 6;
  var EMPTY_BAR = 64;
  var LYR_SIZE = 13, LYR_STEP = 16;
  function phi(q) { return Math.pow(Math.max(q, 0.0625), 0.55); }

  function layoutMeasure(pos, s) {
    if (!pos.length) return { xs: [], width: EMPTY_BAR };
    var x = LEAD + Math.max(pos[0].L, pos[0].lyrL - 8), xs = [x];
    for (var i = 0; i < pos.length - 1; i++) {
      var a = pos[i], b = pos[i + 1];
      var d = Math.max(a.R + b.L + NOTE_GAP,
                       a.lyrR + b.lyrL + LYR_GAP + (a.hy ? HYPHEN_ROOM : 0),
                       UNIT * s * phi(a.dq));
      x += d; xs.push(x);
    }
    var last = pos[pos.length - 1];
    x += Math.max(last.R + TAIL, last.lyrR + 2, UNIT * s * phi(last.dq) * 0.82 + 4);
    return { xs: xs, width: x };
  }

  /* ---------- shape notes ---------- */

  /* Each shape is drawn in a box 2 units wide (u from -1 to 1, scaled by the
     head's half width) and about one staff space tall (v in canvas units,
     measured from the centre of the line or space the note sits on). */
  var K = 0.5523;
  var SHAPES = {
    'do':   { half:7.0, cmd:[['M',0,-5.3],['L',1,5.3],['L',-1,5.3]],                 hole:[0,1.77,0.42,0.42] },
    mi:     { half:6.7, cmd:[['M',0,-5.8],['L',1,0],['L',0,5.8],['L',-1,0]],         hole:[0,0,0.48,0.48] },
    la:     { half:6.2, cmd:[['M',-1,-4.8],['L',1,-4.8],['L',1,4.8],['L',-1,4.8]],   hole:[0,0,0.64,0.5] },
    faUp:   { half:6.4, cmd:[['M',1,-5.3],['L',1,5.3],['L',-1,5.3]],                 hole:[0.47,1.95,0.36,0.36] },
    faDown: { half:6.4, cmd:[['M',-1,5.3],['L',-1,-5.3],['L',1,-5.3]],               hole:[-0.47,-1.95,0.36,0.36] },
    re:     { half:6.4, cmd:[['M',-1,-4.6],['L',1,-4.6],
                             ['C',1,-4.6 + K * 9.9, K,5.3, 0,5.3],
                             ['C',-K,5.3, -1,-4.6 + K * 9.9, -1,-4.6]],              hole:[0,-0.7,0.6,0.5] },
    ti:     { half:6.4, cmd:[['M',-1,-0.2],['C',-1,-0.2 - K * 5.4, -K,-5.6, 0,-5.6],
                             ['C',K,-5.6, 1,-0.2 - K * 5.4, 1,-0.2],['L',0,5.8]],    hole:[0,-0.9,0.56,0.46] },
    sol:    { half:6.0, cmd:[['M',-1,0],['C',-1,-K * 4.6, -K,-4.6, 0,-4.6],['C',K,-4.6, 1,-K * 4.6, 1,0],
                             ['C',1,K * 4.6, K,4.6, 0,4.6],['C',-K,4.6, -1,K * 4.6, -1,0]], hole:[0,0,0.6,0.5] }
  };
  /* Where the stem meets each shape, as a distance below the head's centre.
     do joins at a corner of its base, re at a corner of its flat top, fa and
     la run the stem down their whole straight side. */
  var JOIN_UP   = { 'do':5.3, re:-4.6, mi:0, faUp:5.3, la:4.8, ti:-0.2 };
  var JOIN_DOWN = { 'do':5.3, re:-4.6, mi:0, faDown:-5.3, la:-4.8, ti:-0.2 };

  function shapeD(shape, cx, y, half, hollow) {
    var def = SHAPES[shape] || SHAPES.sol;
    function f(n) { return Math.round(n * 100) / 100; }
    function run(map) {
      return def.cmd.map(function (c) {
        var s = c[0];
        for (var i = 1; i < c.length; i += 2) {
          var p = map(c[i], c[i + 1]);
          s += f(cx + p[0] * half) + ' ' + f(y + p[1]) + ' ';
        }
        return s;
      }).join('') + 'Z';
    }
    var d = run(function (u, v) { return [u, v]; });
    if (hollow) {
      var h = def.hole;
      d += run(function (u, v) { return [h[0] + (u - h[0]) * h[2], h[1] + (v - h[1]) * h[3]]; });
    }
    return d;
  }
  /* Kept for the on-screen legend: a solid shape in a box w wide starting at x. */
  function shapePath(shape, x, y, w) { return shapeD(shape, x + w / 2, y, w / 2, false); }

  function drawShapeHead(shape, hollow, whole, up) {
    return function () {
      var ctx = this.checkContext();
      this.setRendered();
      var def = SHAPES[shape] || SHAPES.sol;
      var half = def.half * (whole ? 1.16 : 1);
      var full = this.getWidth(), x = this.getAbsoluteX(), cx;
      if (whole) cx = x + full / 2;
      else {
        /* the side that touches the stem stays exactly where VexFlow puts the stem */
        var stemOnRight = up ? !this.displaced : !!this.displaced;
        cx = stemOnRight ? x + full - half : x + half;
      }
      var g = ctx.openGroup('notehead shape-' + shape);
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', shapeD(shape, cx, this.getY(), half, hollow));
      path.setAttribute('fill', '#000000');
      path.setAttribute('fill-rule', 'evenodd');
      path.setAttribute('stroke', 'none');
      (g || ctx.svg).appendChild(path);
      ctx.closeGroup();
    };
  }

  /* Runs after beaming has settled every stem, because fa has to face its
     stem and each shape has its own place for the stem to join. */
  function applyShapes(VF, notes, card) {
    var system = card.shapes;
    if (!SYLLABLES[system]) return;
    notes.forEach(function (sn) {
      if (sn.isRest()) return;
      var dur = String(sn.getDuration());
      var whole = dur === '1' || dur === 'w';
      var hollow = whole || dur === '2' || dur === 'h';
      var up = sn.getStemDirection() === VF.Stem.UP;
      var kp = sn.keyProps || [];
      var low = null, high = null;
      sn.noteHeads.forEach(function (nh) {
        var line = nh.getLine();
        var prop = null;
        for (var j = 0; j < kp.length; j++) if (kp[j].line === line) { prop = kp[j]; break; }
        if (!prop) return;
        var syl = syllableFor(String(prop.key).charAt(0).toLowerCase(), card.key, system);
        var shape = syl === 'fa' ? (up ? 'faUp' : 'faDown') : syl;
        if (syl !== 'sol') nh.draw = drawShapeHead(shape, hollow, whole, up);
        if (!low || line < low.line) low = { line: line, shape: shape };
        if (!high || line > high.line) high = { line: line, shape: shape };
      });
      var stem = sn.getStem ? sn.getStem() : sn.stem;
      if (!stem || !low || whole) return;
      var joinUp = JOIN_UP[low.shape], joinDown = JOIN_DOWN[high.shape];
      var drawStem = stem.draw;
      stem.draw = function () {
        var u = this.stem_up_y_offset, dn = this.stem_down_y_offset;
        if (joinUp !== undefined) this.stem_up_y_offset = -joinUp;
        if (joinDown !== undefined) this.stem_down_y_offset = joinDown;
        drawStem.apply(this, arguments);
        this.stem_up_y_offset = u;
        this.stem_down_y_offset = dn;
      };
    });
  }

  /* One-line rhythm staves: draw the barlines ourselves. */
  function drawRhythmBars(ctx, stave, isFirst, bar, finalBar) {
    var y = stave.getYForLine(0), half = 20;
    var x0 = stave.getX(), x1 = stave.getX() + stave.getWidth();
    function dots(x) {
      ctx.beginPath(); ctx.arc(x, y - 6, 1.9, 0, Math.PI * 2, false); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y + 6, 1.9, 0, Math.PI * 2, false); ctx.fill();
    }
    ctx.save();
    ctx.setFillStyle('#000000');
    if (bar.beg === '|:') {
      ctx.fillRect(x0 - (isFirst ? 12 : 0), y - half, 3.4, half * 2);
      ctx.fillRect(x0 - (isFirst ? 12 : 0) + 5.6, y - half, 1.4, half * 2);
      dots(x0 - (isFirst ? 12 : 0) + 11.5);
    } else if (isFirst) ctx.fillRect(x0 - 12, y - half, 1.4, half * 2);
    if (bar.end === ':|') {
      dots(x1 - 11.5);
      ctx.fillRect(x1 - 7, y - half, 1.4, half * 2);
      ctx.fillRect(x1 - 3.4, y - half, 3.4, half * 2);
    } else if (finalBar) {
      ctx.fillRect(x1 - 6, y - half, 1.4, half * 2);
      ctx.fillRect(x1 - 3.4, y - half, 3.4, half * 2);
    } else if (bar.end === '||') {
      ctx.fillRect(x1 - 5, y - half, 1.4, half * 2);
      ctx.fillRect(x1 - 1.4, y - half, 1.4, half * 2);
    } else {
      ctx.fillRect(x1 - 1.4, y - half, 1.4, half * 2);
    }
    ctx.restore();
  }

  /* ---------- labels on lines and spaces ---------- */
  var LETTER_SLOTS = 9;   // bottom to top: even = a line, odd = the space above it
  function letterList(a) {
    if (!a || !a.length) return null;
    var any = false, out = [];
    for (var i = 0; i < LETTER_SLOTS; i++) {
      out[i] = String(a[i] || '').trim();
      if (out[i]) any = true;
    }
    return any ? out : null;
  }
  function slotY(stave, slot) {
    return slot % 2 === 0
      ? stave.getYForLine(4 - slot / 2)
      : stave.getYForLine(4 - (slot + 1) / 2) + 5;
  }
  /* Slots sit 5 units apart, so a label can only grow as far as its nearest
     filled neighbour in the same column. Label a few and they print large;
     label all nine and they shrink to fit between the lines. */
  function planLetters(letters) {
    if (!letters) return null;
    var cols = [[], []];
    for (var p = 0; p < LETTER_SLOTS; p++) {
      if (letters[p]) cols[p % 2 === 0 ? 0 : 1].push(p);
    }
    var plan = { items: [], twoCol: cols[0].length > 0 && cols[1].length > 0, width: [0, 0] };
    for (var c = 0; c < 2; c++) {
      var slots = cols[c];
      if (!slots.length) continue;
      var gap = 40;
      for (var i = 1; i < slots.length; i++) gap = Math.min(gap, (slots[i] - slots[i - 1]) * 5);
      var font = Math.max(7, Math.min(17, gap * 0.95));
      var wide = 0;
      slots.forEach(function (s) { wide = Math.max(wide, letters[s].length); });
      plan.width[c] = Math.max(font * 0.72, wide * font * 0.62);
      slots.forEach(function (s) {
        plan.items.push({ slot: s, text: letters[s], font: font, col: c });
      });
    }
    plan.gutter = plan.twoCol
      ? plan.width[0] + plan.width[1] + 20
      : Math.max(plan.width[0], plan.width[1]) + 14;
    return plan.items.length ? plan : null;
  }
  function svgText(svg, x, y, text, size, opts) {
    var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', Math.round(x * 100) / 100);
    t.setAttribute('y', Math.round(y * 100) / 100);
    t.setAttribute('text-anchor', (opts && opts.anchor) || 'middle');
    t.setAttribute('font-family', LYR_FONT);
    t.setAttribute('font-size', size.toFixed(2));
    if (opts && opts.bold) t.setAttribute('font-weight', 'bold');
    if (opts && opts.dy) t.setAttribute('dy', opts.dy);
    if (opts && opts.cls) t.setAttribute('class', opts.cls);
    t.setAttribute('fill', '#000000');
    t.setAttribute('stroke', 'none');
    t.textContent = text;
    svg.appendChild(t);
    return t;
  }
  function drawStaffLetters(svg, stave, plan, right) {
    plan.items.forEach(function (it) {
      var x = (plan.twoCol && it.col === 0)
        ? right - plan.width[1] - 10 - plan.width[0] / 2
        : right - plan.width[it.col] / 2;
      svgText(svg, x, slotY(stave, it.slot), it.text, it.font, { bold:true, dy:'0.35em' });
    });
  }

  /* ---------- drawing a card ---------- */
  function renderCard(VF, container, card) {
    container.innerHTML = '';
    var model = buildModel(card);
    var warning = model.error;
    var oneLine = model.oneLine, grand = model.grand;
    var t = tsParts(card.time);
    var showClef = !oneLine && card.showClef !== false;
    var showKey = !oneLine && card.showKey !== false && card.key && card.key !== 'C';
    var showTime = card.showTime !== false;
    var nStaves = model.plan.length;
    var staffPad = 12;   // VexFlow's own gap between a stave's opening and its first note

    function makeStave(m, si, x, y, w) {
      var stave = new VF.Stave(x, y, w);
      stave.setStyle({ strokeStyle:'#000000', fillStyle:'#000000', lineWidth:1 });
      var bar = model.bars[m], last = m === model.count - 1;
      if (oneLine) {
        stave.setNumLines(1);
        /* a one-line stave gives VexFlow no height to draw barlines into */
        stave.setBegBarType(VF.Barline.type.NONE);
        stave.setEndBarType(VF.Barline.type.NONE);
      } else {
        if (bar.beg === '|:') stave.setBegBarType(VF.Barline.type.REPEAT_BEGIN);
        if (bar.end === ':|') stave.setEndBarType(VF.Barline.type.REPEAT_END);
        else if (last && card.endBar !== false) stave.setEndBarType(VF.Barline.type.END);
        else if (bar.end === '||') stave.setEndBarType(VF.Barline.type.DOUBLE);
      }
      if (m === 0) {
        if (showClef) stave.addClef(model.plan[si].clef);
        if (showKey) stave.addKeySignature(card.key);
        if (showTime) {
          if (oneLine) {
            /* centre the two numbers on the single line, clear of the barline */
            var tsig = new VF.TimeSignature(card.time || '4/4', 20);
            tsig.topLine -= 2;
            tsig.bottomLine -= 2;
            stave.addModifier(tsig);
          } else {
            stave.addTimeSignature(card.time || '4/4');
          }
        }
      }
      return stave;
    }

    /* ---- pass 1: build every note, beam it, and learn how much room it needs ---- */
    var lyricLines = (card.lyrics || []).map(parseLyrics).filter(function (l) { return l.length; });
    if (lyricLines.length) {
      var carriers = lyricNotes(model);
      carriers.forEach(function (n, i) {
        n.lyr = lyricLines.map(function (l) { return l[i] || null; });
        var w = 0, hy = false;
        n.lyr.forEach(function (s) { if (s) { w = Math.max(w, textWidth(s.text, LYR_SIZE)); hy = hy || s.hy; } });
        n.lw = w; n.hy = hy;
      });
    }

    var cells = [];   // one per measure
    for (var m = 0; m < model.count; m++) {
      var cell = { groups: [], all: [], beams: [], tuplets: [], pos: [], ok: true };
      model.voices.forEach(function (v) {
        var vm = v.measures[m];
        if (!vm || !vm.notes.length) return;
        var dir = oneLine ? VF.Stem.UP : (v.two ? (v.pos === 0 ? VF.Stem.UP : VF.Stem.DOWN) : 0);
        var notes = vm.notes.map(function (n) {
          var it = n.it, sn;
          if (it.rest) {
            var rk = oneLine ? RHYTHM_KEY
              : (v.two ? (v.pos === 0 ? REST_HI : REST_LO) : REST_KEY)[v.clef] || 'b/4';
            sn = new VF.StaveNote({ keys:[rk], duration: it.dur + 'r', clef: v.clef });
          } else if (oneLine) {
            sn = new VF.StaveNote({ keys:[RHYTHM_KEY], duration: it.dur, clef:'treble' });
            sn.setStemDirection(VF.Stem.UP);
          } else {
            var o = { keys: it.pitches.map(function (p) { return p.letter + '/' + p.oct; }), duration: it.dur, clef: v.clef };
            if (dir) o.stem_direction = dir; else o.auto_stem = true;
            sn = new VF.StaveNote(o);
            /* VexFlow sorts chord keys low to high, so match accidentals by pitch */
            n.show.forEach(function (acc, a) {
              if (!acc) return;
              var want = it.pitches[a].letter + '/' + it.pitches[a].oct;
              var at = sn.getKeys().indexOf(want);
              sn.addModifier(new VF.Accidental(acc), at < 0 ? a : at);
            });
          }
          for (var d = 0; d < it.dots; d++) VF.Dot.buildAndAttach([sn], { all:true });
          if (it.ferm && !it.rest) {
            var below = dir === VF.Stem.DOWN;
            sn.addModifier(new VF.Articulation(below ? 'a@u' : 'a@a')
              .setPosition(below ? VF.Modifier.Position.BELOW : VF.Modifier.Position.ABOVE), 0);
          }
          n.sn = sn; n.voice = v; n.m = m;
          return sn;
        });
        (vm.tuplets || []).forEach(function (g) {
          try {
            cell.tuplets.push(new VF.Tuplet(g.map(function (n) { return n.sn; }), {
              num_notes: 3, notes_occupied: 2, ratioed: false,
              location: dir === VF.Stem.DOWN ? VF.Tuplet.LOCATION_BOTTOM : VF.Tuplet.LOCATION_TOP
            }));
          } catch (e) { /* drawn as plain notes */ }
        });
        /* Beam first: a note only drops its flag once it belongs to a beam,
           and the beam is what settles the stem direction. */
        var bo = { groups: beamGroups(VF, card.time), maintain_stem_directions: !!dir };
        cell.beams = cell.beams.concat(VF.Beam.generateBeams(notes, bo));
        var voice = new VF.Voice({ num_beats: t.n, beat_value: t.d });
        voice.setMode(VF.Voice.Mode.SOFT);
        voice.addTickables(notes);
        (cell.groups[v.staff] = cell.groups[v.staff] || []).push(voice);
        cell.all.push({ voice: voice, v: v, vm: vm, notes: notes });
      });

      if (cell.all.length) {
        var f = new VF.Formatter();
        try {
          cell.groups.forEach(function (g) { if (g && g.length) f.joinVoices(g); });
          var vs = cell.all.map(function (a) { return a.voice; });
          f.format(vs, 240);
          var tcx = f.getTickContexts ? f.getTickContexts() : f.tickContexts;
          var tcs = Object.keys(tcx.map).map(Number).sort(function (a, b) { return a - b; })
            .map(function (k) { return tcx.map[k]; });
          /* my own clock, so each tick context can be matched to a point in the bar */
          var starts = {};
          cell.all.forEach(function (a) {
            a.vm.notes.forEach(function (n) {
              var k = Math.round(n.at * 1920);
              var s = starts[k] || (starts[k] = { at: n.at, dq: n.q, lyrL: 0, lyrR: 0, hy: false });
              s.dq = Math.min(s.dq, n.q);
              if (n.lw) {
                s.lyrL = Math.max(s.lyrL, n.lw / 2 - HEAD_HALF);
                s.lyrR = Math.max(s.lyrR, n.lw / 2 + HEAD_HALF);
                s.hy = s.hy || n.hy;
              }
            });
          });
          var keys = Object.keys(starts).map(Number).sort(function (a, b) { return a - b; });
          if (keys.length !== tcs.length) throw new Error('clock mismatch');
          keys.forEach(function (k, i) {
            var s = starts[k], mt = tcs[i].getMetrics();
            s.tc = tcs[i];
            s.L = (mt.modLeftPx || 0) + (mt.leftDisplacedHeadPx || 0);
            s.R = (mt.glyphPx || 12) + (mt.modRightPx || 0) + (mt.rightDisplacedHeadPx || 0);
            if (i < keys.length - 1) s.dq = (keys[i + 1] - k) / 1920;
            cell.pos.push(s);
          });
        } catch (e) {
          cell.ok = false;
          warning = warning || 'That measure would not fit. Try fewer notes, or split it with a | into two measures.';
        }
      }
      cells.push(cell);
    }

    /* ---- widths ---- */
    var plans = [];
    if (!oneLine) {
      plans[0] = planLetters(letterList(card.letters));
      if (grand) plans[1] = planLetters(letterList(card.letters2));
    }
    var gutter = 0;
    plans.forEach(function (p) { if (p) gutter = Math.max(gutter, p.gutter); });
    var braceRoom = grand ? 14 : 0;

    /* what each measure's stave adds around its notes: clef, key, time, barlines */
    var chrome = [];
    for (m = 0; m < model.count; m++) {
      var lead = 0, tail = 0;
      for (var si = 0; si < nStaves; si++) {
        var tmp = makeStave(m, si, 0, TOP, 400);
        lead = Math.max(lead, tmp.getNoteStartX());
        tail = Math.max(tail, 400 - tmp.getNoteEndX());
      }
      if (oneLine && model.bars[m].beg === '|:') lead += 12;
      if (oneLine && model.bars[m].end === ':|') tail += 12;
      chrome.push({ lead: lead + staffPad, tail: tail });
    }
    function total(s) {
      var sum = gutter + braceRoom + PAD * 2;
      for (var i = 0; i < cells.length; i++) {
        cells[i].lay = cells[i].ok ? layoutMeasure(cells[i].pos, s) : { xs: null, width: 200 };
        sum += chrome[i].lead + cells[i].lay.width + chrome[i].tail;
      }
      return sum;
    }
    var sizeW = SIZES[card.size] || SIZES.l;
    var natural = total(1);
    var W = Math.max(sizeW, natural), stretch = 1, slack = 0;
    if (natural < W) {
      if (total(STRETCH_MAX) <= W) { stretch = STRETCH_MAX; slack = W - total(STRETCH_MAX); }
      else {
        var lo = 1, hi = STRETCH_MAX;
        for (var it2 = 0; it2 < 24; it2++) {
          var mid = (lo + hi) / 2;
          if (total(mid) > W) hi = mid; else lo = mid;
        }
        stretch = lo; slack = Math.max(0, W - total(lo));
      }
    }
    var slackEach = slack / cells.length;

    /* ---- heights: room under the top staff for lyrics, then the lower staff ---- */
    function extent(si) {
      var lo = 46, hi = -6;   // relative to the staff's top line
      model.voices.forEach(function (v) {
        if (v.staff !== si) return;
        v.measures.forEach(function (vm) {
          vm.notes.forEach(function (n) {
            if (!n.sn || n.it.rest) return;
            var lines = n.sn.keyProps.map(function (k) { return k.line; });
            var yLow = (5 - Math.min.apply(null, lines)) * 10, yHigh = (5 - Math.max.apply(null, lines)) * 10;
            var dirn = n.sn.getStemDirection(), stemmed = n.it.dur !== 'w';
            lo = Math.max(lo, yLow + (stemmed && dirn === VF.Stem.DOWN ? 40 : 9) + (n.it.tie || n.it.slurS || n.it.slurE ? 6 : 0));
            hi = Math.min(hi, yHigh - (stemmed && dirn === VF.Stem.UP ? 40 : 9) - (n.it.ferm ? 16 : 0) - (n.tup ? 14 : 0));
          });
        });
      });
      return { lo: lo, hi: hi };
    }
    /* a VexFlow stave's y is 40 above its top line (room it keeps for high notes) */
    var staffY = [TOP];
    var line0 = TOP + HEADROOM;
    var lyrTop = null;
    if (lyricLines.length) {
      lyrTop = oneLine ? line0 + 14 : line0 + extent(0).lo + 2;
    }
    var lyrBottom = lyrTop === null ? null : lyrTop + lyricLines.length * LYR_STEP;
    if (grand) {
      var e1 = extent(1);
      var floor = lyrBottom === null ? line0 + Math.max(extent(0).lo + 6, 96) : lyrBottom + 8;
      staffY[1] = Math.max(TOP + 96, floor - e1.hi - HEADROOM);
    }

    /* ---- pass 2: draw at the settled width ---- */
    var H = (staffY[nStaves - 1] || TOP) + 320;
    var renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
    renderer.resize(W, H);
    var ctx = renderer.getContext();
    var svg = ctx.svg || container.querySelector('svg');
    var geom = { W: W, oneLine: oneLine, staves: [], notes: [], measures: [] };
    model.plan.forEach(function (st, si) { geom.staves.push({ top: staffY[si] + HEADROOM, clef: st.clef, parts: st.parts }); });

    var x = PAD + gutter + braceRoom;
    var firstStaves = null;
    for (m = 0; m < cells.length; m++) {
      var c = cells[m];
      var wid = chrome[m].lead + c.lay.width + slackEach + chrome[m].tail;
      var staves = [];
      for (si = 0; si < nStaves; si++) staves.push(makeStave(m, si, x, staffY[si], wid));
      var startX = 0;
      staves.forEach(function (s) { startX = Math.max(startX, s.getNoteStartX()); });
      staves.forEach(function (s) { s.setNoteStartX(startX); s.setContext(ctx).draw(); });
      if (oneLine) drawRhythmBars(ctx, staves[0], m === 0, model.bars[m], m === cells.length - 1 && card.endBar !== false);
      if (m === 0) firstStaves = staves;
      geom.measures.push({ x0: x, x1: x + wid });

      if (grand) {
        var lastM = m === cells.length - 1, bar = model.bars[m];
        var conn = function (type) {
          new VF.StaveConnector(staves[0], staves[1]).setType(type).setContext(ctx).draw();
        };
        if (m === 0) { conn(VF.StaveConnector.type.BRACE); conn(VF.StaveConnector.type.SINGLE_LEFT); }
        /* hymnals stop the barlines at each staff so the words stay clear; piano music joins them */
        if (!lyricLines.length) {
          if (bar.end === ':|' || (lastM && card.endBar !== false)) conn(VF.StaveConnector.type.BOLD_DOUBLE_RIGHT);
          else if (bar.end === '||') conn(VF.StaveConnector.type.THIN_DOUBLE);
          else conn(VF.StaveConnector.type.SINGLE_RIGHT);
          if (bar.beg === '|:' && m > 0) conn(VF.StaveConnector.type.BOLD_DOUBLE_LEFT);
        }
      }

      if (c.all.length && c.ok) {
        try {
          var shift = slackEach / 2;
          /* the first note sits a fixed step after whatever opens the bar */
          var base = chrome[m].lead - (startX - x) - staffPad;
          c.pos.forEach(function (p, i) { p.tc.setX(base + c.lay.xs[i] + shift); });
          c.all.forEach(function (a) {
            if (!oneLine) applyShapes(VF, a.notes, card);
            a.voice.draw(ctx, staves[a.v.staff]);
          });
          c.beams.forEach(function (bm) { bm.setContext(ctx).draw(); });
          c.tuplets.forEach(function (tp) { tp.setContext(ctx).draw(); });
        } catch (e) {
          warning = warning || 'That measure would not fit. Try fewer notes, or split it with a | into two measures.';
        }
      }
      x += wid;
    }

    /* ties and slurs can cross a barline, so they wait until every bar is drawn */
    model.voices.forEach(function (v) {
      var seq = [];
      v.measures.forEach(function (vm) { vm.notes.forEach(function (n) { if (n.sn) seq.push(n); }); });
      var slurFrom = null;
      seq.forEach(function (n, i) {
        var next = seq[i + 1];
        try {
          if (n.it.tie && next && !n.it.rest && !next.it.rest) {
            var fi = [], li = [], ka = n.sn.getKeys(), kb = next.sn.getKeys();
            ka.forEach(function (k, a) { var b = kb.indexOf(k); if (b >= 0) { fi.push(a); li.push(b); } });
            if (!fi.length) { fi = [0]; li = [0]; }
            var tie = new VF.StaveTie({ first_note: n.sn, last_note: next.sn, first_indices: fi, last_indices: li });
            if (v.two && tie.setDirection) tie.setDirection(v.pos === 0 ? -1 : 1);
            tie.setContext(ctx).draw();
          }
          if (n.it.slurS && !n.it.rest) slurFrom = n;
          if (n.it.slurE && slurFrom && slurFrom !== n && !n.it.rest) {
            var pos = v.two ? VF.Curve.Position.NEAR_TOP : VF.Curve.Position.NEAR_HEAD;
            new VF.Curve(slurFrom.sn, n.sn, { position: pos, position_end: pos, cps: [{ x:0, y:8 }, { x:0, y:8 }] })
              .setContext(ctx).draw();
            slurFrom = null;
          }
        } catch (e) { /* a curve that can't be drawn is left out rather than losing the card */ }
      });
    });

    /* lyrics, on their own straight baselines */
    if (lyricLines.length && svg) {
      var carriers2 = lyricNotes(model).filter(function (n) { return n.sn && n.lyr; });
      lyricLines.forEach(function (line, li) {
        var y = lyrTop + LYR_SIZE + li * LYR_STEP - 2, prev = null;
        carriers2.forEach(function (n) {
          var s = n.lyr[li];
          var cx;
          try { cx = n.sn.getNoteHeadBeginX() + n.sn.getGlyphWidth() / 2; } catch (e) { return; }
          if (prev && s) {
            /* centre a hyphen in the gap between two syllables of one word */
            var gapL = prev.cx + prev.w / 2, gapR = cx - textWidth(s.text, LYR_SIZE) / 2;
            if (gapR - gapL > 4.5) svgText(svg, (gapL + gapR) / 2, y, '-', LYR_SIZE, { cls:'lyric' });
            else prev.el.textContent = prev.text + '-';
            prev = null;
          }
          if (!s) return;
          var el = svgText(svg, cx, y, s.text, LYR_SIZE, { cls:'lyric' });
          prev = s.hy ? { cx: cx, w: textWidth(s.text, LYR_SIZE), el: el, text: s.text } : null;
        });
        if (prev) prev.el.textContent = prev.text + '-';
      });
    }

    /* labels beside the lines and spaces */
    if (svg && firstStaves) {
      plans.forEach(function (p, si) {
        if (p && firstStaves[si]) drawStaffLetters(svg, firstStaves[si], p, firstStaves[si].getX() - 10 - braceRoom);
      });
    }

    /* where everything ended up, for clicking on the staff and for playback */
    model.voices.forEach(function (v) {
      v.measures.forEach(function (vm) {
        vm.notes.forEach(function (n) {
          if (!n.sn) return;
          try {
            var w = n.sn.getGlyphWidth();
            geom.notes.push({ part: v.part, idx: n.idx, m: n.m, rest: !!n.it.rest,
                              x: n.sn.getNoteHeadBeginX() + w / 2, ys: n.sn.getYs().slice(),
                              id: 'vf-' + n.sn.getAttribute('id') });
          } catch (e) {}
        });
      });
    });

    if (svg) fitViewBox(svg, W, geom);
    return { warning: warning, geom: geom };
  }

  /* Fixed width so every card in a deck prints at the same scale; the vertical
     band only grows when ledger lines, a second staff or lyrics need the room. */
  function fitViewBox(svg, W, geom) {
    var top = BAND_TOP, bottom = BAND_BOTTOM;
    try {
      var b = svg.getBBox();
      if (b && b.height > 4) {
        top = Math.min(top, b.y - 14);
        bottom = Math.max(bottom, b.y + b.height + 14);
      }
    } catch (e) { /* keep the standard band */ }
    svg.setAttribute('viewBox', [0, top, W, bottom - top].join(' '));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.width = '100%';
    svg.style.height = '100%';
    if (geom) { geom.top = top; geom.bottom = bottom; }
  }

  /* ---------- playback ----------
     A flat list of what sounds when, in quarter notes from the start.
     Repeats are played twice; a tied note is held, not struck again. */
  function timeline(card) {
    var model = buildModel(card);
    var order = [], start = 0, i;
    for (i = 0; i < model.count; i++) {
      if (model.bars[i].beg === '|:') start = i;
      order.push(i);
      if (model.bars[i].end === ':|') { for (var j = start; j <= i; j++) order.push(j); start = i + 1; }
    }
    var events = [], clock = 0;
    var held = {};   // per voice: the event a tie is still holding
    order.forEach(function (mi) {
      model.voices.forEach(function (v) {
        var vm = v.measures[mi];
        if (!vm) return;
        vm.notes.forEach(function (n) {
          if (n.it.rest) { held[v.part] = null; return; }
          var h = held[v.part];
          var same = h && h.midi.length === n.midi.length && h.midi.every(function (p, k) { return p === n.midi[k]; });
          if (same) { h.dur += n.q; h.marks.push({ part: v.part, idx: n.idx, at: clock + n.at, dur: n.q }); }
          else {
            h = { at: clock + n.at, dur: n.q, midi: n.midi.slice(), click: model.oneLine,
                  marks: [{ part: v.part, idx: n.idx, at: clock + n.at, dur: n.q }] };
            events.push(h);
          }
          held[v.part] = n.it.tie ? h : null;
        });
      });
      clock += model.bars[mi].len;
    });
    return { events: events, length: clock };
  }

  /* Staff position -> pitch, for clicking on the staff. Step 0 is the bottom line. */
  var BOTTOM_LINE = { treble: 4 * 7 + 2, bass: 2 * 7 + 4, alto: 3 * 7 + 3, tenor: 3 * 7 + 1 };
  function pitchAtStep(clef, step) {
    var d = (BOTTOM_LINE[clef] || BOTTOM_LINE.treble) + step;
    return { letter: LETTERS[((d % 7) + 7) % 7], oct: Math.floor(d / 7) };
  }
  function stepOfPitch(clef, p) {
    return p.oct * 7 + LETTERS.indexOf(p.letter) - (BOTTOM_LINE[clef] || BOTTOM_LINE.treble);
  }

  global.Notation = {
    renderCard: renderCard,
    parseVoice: parseVoice,
    serializeVoice: serializeVoice,
    splitMeasures: splitMeasures,
    countBeats: countBeats,
    parseLyrics: parseLyrics,
    lyricNotes: lyricNotes,
    buildModel: buildModel,
    staffPlan: staffPlan,
    defOctFor: defOctFor,
    timeline: timeline,
    pitchAtStep: pitchAtStep,
    stepOfPitch: stepOfPitch,
    shapePath: shapePath,
    syllableFor: syllableFor,
    tsParts: tsParts,
    SYLLABLES: SYLLABLES,
    KEY_SIGS: KEY_SIGS,
    LETTERS: LETTERS
  };
})(window);
