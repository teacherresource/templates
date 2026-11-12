'use strict';
/* Weekly Assignment Scheduler — editor. Plain JavaScript, no libraries, works offline. */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const key = (g, d, s) => `${g}|${d}|${s}`;

const S = {
  data: null, week: null,
  entries: new Map(),      // id -> entry (with any local typing applied)
  server: new Map(),       // id -> {subject, lesson_text} as last saved
  drafts: new Map(),       // "grade|day|row" -> {subject, lesson_text} not yet created
  local: new Map(),        // id -> {v, sent} typing versions
  creating: new Set(),
  timers: new Map(),       // key -> {t, fn}
  inflight: 0, rendering: false, pointer: false, drag: null, kw: [],
};

/* ───────────────────────────── server calls ───────────────────────────── */
function setSave(state) {
  const el = $('#saveState');
  el.dataset.state = state;
  el.textContent = state === 'saving' ? 'Saving…' : state === 'error' ? 'Not saved — check the app window' : 'All changes saved';
}
async function api(method, url, body) {
  S.inflight++; setSave('saving');
  try {
    const r = await fetch(url, {
      method, keepalive: method !== 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const j = await r.json();
    S.inflight--;
    if (!S.inflight) setSave('idle');
    return j;
  } catch (e) {
    S.inflight--;
    setSave('error');
    toast('Could not save. Is the scheduler window still open? (' + e.message + ')', { err: true, ms: 7000 });
    throw e;
  }
}
function schedule(k, fn, ms = 600) {
  const old = S.timers.get(k);
  if (old) clearTimeout(old.t);
  const t = setTimeout(() => { S.timers.delete(k); fn(); }, ms);
  S.timers.set(k, { t, fn });
}
function cancel(k) { const o = S.timers.get(k); if (o) { clearTimeout(o.t); S.timers.delete(k); } }
function flush(k) { const o = S.timers.get(k); if (!o) return Promise.resolve(); clearTimeout(o.t); S.timers.delete(k); return Promise.resolve(o.fn()); }
async function flushAll() {
  await Promise.all([...S.timers.keys()].map(flush));
  for (let i = 0; i < 50 && S.inflight; i++) await new Promise(r => setTimeout(r, 60));
}

/* ───────────────────────────── helpers ───────────────────────────── */
const DAYS = () => S.data.days;
const grade = id => S.data.grades.find(g => g.id === id);
const shortGrade = id => { const g = grade(id); return g ? (g.name.replace(/\s*grade\s*/i, '').trim() || g.name) : '?'; };
const studentsOf = gid => S.data.students.filter(s => s.grade_id === gid);
const studentName = id => (S.data.students.find(s => s.id === id) || {}).name;
const needsName = t => /~\s*$/.test(t || '');
function isTest(subj, les) { const t = `${subj} ${les}`.toLowerCase(); return S.kw.some(r => r.test(t)); }
function entryAt(g, d, s) {
  for (const e of S.entries.values()) if (e.grade_id === g && e.day === d && e.sort_order === s) return e;
  return null;
}
function inheritedSubject(g, di, s) {
  const days = DAYS();
  const look = i => { const e = entryAt(g, days[i], s); if (e && e.subject.trim()) return e.subject; const dr = S.drafts.get(key(g, days[i], s)); return dr && dr.subject.trim() ? dr.subject : ''; };
  for (let i = di - 1; i >= 0; i--) { const v = look(i); if (v) return v; }
  for (let i = di + 1; i < days.length; i++) { const v = look(i); if (v) return v; }
  return '';
}
function remember(e) { S.server.set(e.id, { subject: e.subject, lesson_text: e.lesson_text }); }
function bump(id) { const l = S.local.get(id) || { v: 0, sent: 0 }; l.v++; S.local.set(id, l); }
function autoGrow(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
function cellEl(e) { return $(`.cell[data-id="${e.id}"]`); }
function weekUrl(path, extra = '') { return `${path}?week=${S.week}${extra}`; }

function toast(msg, { err = false, action, onAction, ms = 4500 } = {}) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action;
    b.onclick = () => { t.remove(); onAction(); };
    t.appendChild(b);
  }
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/* ───────────────────────────── loading ───────────────────────────── */
async function load(week) {
  await flushAll();
  const r = await fetch('/api/state' + (week ? '?week=' + encodeURIComponent(week) : ''));
  const d = await r.json();
  S.data = d; S.week = d.week;
  S.entries = new Map(d.entries.map(e => [e.id, e]));
  S.server.clear(); d.entries.forEach(remember);
  S.drafts.clear(); S.local.clear();
  applyTheme();
  renderHeader(); renderSchedule(); renderWeekly(); renderStudents(); renderSettings();
  const u = new URL(location.href);
  u.searchParams.set('week', d.week);
  history.replaceState(null, '', u);
}
function applyTheme() {
  const st = S.data.settings;
  document.documentElement.style.setProperty('--accent', st.color_primary || '#1e3054');
  document.documentElement.style.setProperty('--accent-soft', (st.color_primary || '#1e3054') + '1f');
  document.documentElement.style.setProperty('--hl', st.test_highlight_color || '#b5451b');
  S.kw = (st.test_highlight_keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
    .map(k => new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'));
}

/* ───────────────────────────── header ───────────────────────────── */
function renderHeader() {
  const d = S.data;
  $('#weekLabel').textContent = (d.week_num ? `Week ${d.week_num} · ` : '') + d.week_label;
  const nums = Object.values(d.week_school_days);
  const sub = d.is_current_week ? 'This week' : (d.week < d.current_week ? 'Past week' : 'Planning ahead');
  $('#weekSub').textContent = sub + (nums.length ? ` · Days ${Math.min(...nums)}–${Math.max(...nums)}` : '');
  $('#todayBtn').hidden = d.is_current_week;
  document.title = `${d.week_label} · Weekly Assignment Scheduler`;
}

/* ───────────────────────────── schedule tab ───────────────────────────── */
function renderSchedule() {
  renderToolbar();
  const box = $('#grids');
  if (!S.data.grades.length) {
    box.innerHTML = `<div class="empty-week"><h3>No grades yet</h3><p>Add your grade levels in Settings first.</p>
      <div class="row"><button class="btn primary" data-goto="settings">Open Settings</button></div></div>`;
    return;
  }
  box.innerHTML = S.data.grades.map(g => `<div class="grade-card" data-grade-card="${g.id}" style="--gc:${esc(g.color)}"></div>`).join('');
  S.data.grades.forEach(g => renderGrade(g.id));
}
function renderAllGrades() { S.data.grades.forEach(g => renderGrade(g.id)); renderToolbar(); }

function renderToolbar() {
  const tb = $('#scheduleToolbar');
  const d = S.data;
  const ents = [...S.entries.values()];
  if (!ents.length && d.grades.length) {
    tb.innerHTML = `<div class="empty-week" style="flex:1">
      <h3>Nothing planned for ${esc(d.week_label)} yet</h3>
      <p>${d.source_week ? `Start from <b>${esc(d.source_label)}</b>: same subjects and order, lesson numbers moved forward, lesson names left blank for you to fill in.` : 'Just start typing in the grid below.'}</p>
      <div class="row">
        ${d.source_week ? `<button class="btn primary" data-act="start-quick">Start from ${esc(d.source_label)}</button>
        <button class="btn" data-act="start-dialog">Other options…</button>` : ''}
      </div></div>`;
    return;
  }
  const need = ents.filter(e => needsName(e.lesson_text)).length;
  tb.innerHTML = `
    <span class="chip">${ents.length} assignment${ents.length === 1 ? '' : 's'}</span>
    <span id="needChip">${needChipHTML(need)}</span>
    <span class="spacer"></span>
    ${d.source_week ? `<button class="btn" data-act="start-dialog">Fill in from ${esc(d.source_label)}…</button>` : ''}
    <button class="btn" data-act="week-menu">Week ⋯</button>`;
}
function needChipHTML(n) {
  if (!S.entries.size) return '';
  return n ? `<span class="chip warn">${n} lesson${n === 1 ? '' : 's'} still need${n === 1 ? 's' : ''} a name <button data-act="next-need">Next ›</button></span>`
           : `<span class="chip ok">✓ Every lesson has a name</span>`;
}
function updateNeedChip() {
  const el = $('#needChip');
  if (el) el.innerHTML = needChipHTML([...S.entries.values()].filter(e => needsName(e.lesson_text)).length);
}

function renderGrade(gid) {
  const card = $(`[data-grade-card="${gid}"]`);
  const g = grade(gid);
  if (!card || !g) return;
  const f = captureFocus(card);
  S.rendering = true;
  const days = DAYS();
  let max = -1;
  for (const e of S.entries.values()) if (e.grade_id === gid) max = Math.max(max, e.sort_order);
  for (const k of S.drafts.keys()) { const [kg, , ks] = k.split('|'); if (+kg === gid) max = Math.max(max, +ks); }
  const nRows = Math.max(max + 2, 3);
  const studs = studentsOf(gid).map(s => s.name).join(', ');
  let h = `<div class="grade-head"><h3>${esc(g.name)}</h3><span class="students">${esc(studs)}</span><span class="spacer"></span>
    <button class="btn sm ghost" data-act="grade-menu" data-g="${gid}" tabindex="-1">⋯</button></div>
    <div class="grid-scroll"><table class="grid"><thead><tr><th class="rowcol"></th>`;
  days.forEach(d => {
    const off = S.data.off_days[d], dn = S.data.week_school_days[d];
    h += `<th class="${off ? 'off' : ''}"><span class="d">${d}</span> ${esc(S.data.week_dates[d])}${off ? '<span class="dn">No school</span>' : dn ? `<span class="dn">Day ${dn}</span>` : ''}</th>`;
  });
  h += '</tr></thead><tbody>';
  for (let s = 0; s < nRows; s++) {
    const filled = s <= max;
    h += `<tr><td class="rownum">${s + 1}${filled ? `<div class="rn-tools">
      <button tabindex="-1" data-act="row" data-op="up" data-g="${gid}" data-s="${s}" title="Move row up">↑</button>
      <button tabindex="-1" data-act="row" data-op="down" data-g="${gid}" data-s="${s}" title="Move row down">↓</button>
      <button tabindex="-1" data-act="row" data-op="insert" data-g="${gid}" data-s="${s}" title="Insert empty row above">＋</button>
      <button tabindex="-1" class="del" data-act="row" data-op="delete" data-g="${gid}" data-s="${s}" title="Delete this row (all days)">✕</button></div>` : ''}</td>`;
    days.forEach((d, di) => { h += cellHTML(gid, d, di, s); });
    h += '</tr>';
  }
  h += '</tbody></table></div>';
  card.innerHTML = h;
  $$('textarea.les', card).forEach(autoGrow);
  restoreFocus(card, f);
  S.rendering = false;
}

function cellHTML(g, d, di, s) {
  const e = entryAt(g, d, s);
  const dr = e ? null : S.drafts.get(key(g, d, s));
  const subj = e ? e.subject : dr ? dr.subject : '';
  const les = e ? e.lesson_text : dr ? dr.lesson_text : '';
  const inh = e ? '' : inheritedSubject(g, di, s);
  const cls = ['cell', e ? 'has' : 'empty'];
  if (S.data.off_days[d]) cls.push('off');
  if (e && isTest(subj, les)) cls.push('test');
  if (e && needsName(les)) cls.push('needs');
  const subjTab = (e || inh) ? -1 : 0;
  return `<td class="${cls.join(' ')}" data-g="${g}" data-d="${d}" data-s="${s}"${e ? ` data-id="${e.id}"` : ''}>
    <div class="ci"><input class="subj${inh ? '' : ' noinh'}" value="${esc(subj)}" placeholder="${esc(inh || 'Subject')}" tabindex="${subjTab}" spellcheck="false" autocomplete="off" aria-label="Subject, ${d} row ${s + 1}">
    <textarea class="les" rows="1" aria-label="Lesson, ${d} row ${s + 1}">${esc(les)}</textarea>
    <div class="tags">${e ? tagsHTML(e) : ''}</div></div>
    <button class="more" tabindex="-1" data-act="cell-menu" title="Options: only for, leave out, link/copy to other grades, delete">⋯</button>
    <span class="grip" draggable="true" title="Drag to move or swap">⠿</span></td>`;
}
function tagsHTML(e) {
  let t = '';
  if (e.link_id) {
    const others = [...S.entries.values()].filter(x => x.link_id === e.link_id && x.id !== e.id).map(x => shortGrade(x.grade_id));
    if (others.length) t += `<span class="tag link" title="Linked — typing here also changes ${esc(others.join(', '))}">↔ ${esc(others.join(', '))}</span>`;
  }
  if (e.student_id) {
    const n = studentName(e.student_id);
    t += n ? `<span class="tag only" title="Prints only on ${esc(n)}'s sheet, in place of the class version">only ${esc(n)}</span>`
           : `<span class="tag gone" title="This student was removed, so this prints for nobody. Settings → Clean up removes it.">removed student</span>`;
  }
  const ns = (e.excluded || []).map(studentName).filter(Boolean);
  if (ns.length) t += `<span class="tag not" title="Left off these students' sheets">not ${esc(ns.join(', '))}</span>`;
  return t;
}
function updateCell(c, e) {
  c.classList.toggle('test', isTest(e.subject, e.lesson_text));
  c.classList.toggle('needs', needsName(e.lesson_text));
}
function patchCell(e) {
  const c = cellEl(e);
  if (!c) return;
  const si = $('.subj', c), li = $('.les', c);
  if (document.activeElement !== si && si.value !== e.subject) si.value = e.subject;
  if (document.activeElement !== li && li.value !== e.lesson_text) { li.value = e.lesson_text; autoGrow(li); }
  $('.tags', c).innerHTML = tagsHTML(e);
  updateCell(c, e);
}
function captureFocus(root) {
  const a = document.activeElement;
  if (!a || !root.contains(a)) return null;
  const c = a.closest('.cell');
  if (!c) return null;
  return { d: c.dataset.d, s: c.dataset.s, cls: a.classList.contains('subj') ? 'subj' : 'les', ss: a.selectionStart, se: a.selectionEnd };
}
function restoreFocus(root, f) {
  if (!f) return;
  const el = $(`.cell[data-d="${f.d}"][data-s="${f.s}"] .${f.cls}`, root);
  if (!el) return;
  S.restoring = true;
  el.focus({ preventScroll: true });
  try { el.setSelectionRange(f.ss, f.se); } catch (_) {}
  S.restoring = false;
}

/* merge entries returned by the server */
function mergeChanged(list) {
  let structural = false;
  for (const ne of list || []) {
    const old = S.entries.get(ne.id);
    const l = S.local.get(ne.id);
    remember(ne);
    if (old && l && l.v > l.sent) { ne.subject = old.subject; ne.lesson_text = old.lesson_text; }
    if (!old || old.grade_id !== ne.grade_id || old.day !== ne.day || old.sort_order !== ne.sort_order ||
        old.link_id !== ne.link_id || old.student_id !== ne.student_id || String(old.excluded) !== String(ne.excluded)) structural = true;
    S.entries.set(ne.id, ne);
    if (!structural) patchCell(ne);
  }
  if (structural) renderAllGrades(); else updateNeedChip();
}

/* ───────────────────────────── typing & saving ───────────────────────────── */
function onCellInput(ev) {
  const el = ev.target;
  const c = el.closest('.cell');
  if (!c || !(el.classList.contains('subj') || el.classList.contains('les'))) return;
  const field = el.classList.contains('subj') ? 'subject' : 'lesson_text';
  if (field === 'lesson_text') autoGrow(el);
  const g = +c.dataset.g, d = c.dataset.d, s = +c.dataset.s;
  if (c.dataset.id) {
    const id = +c.dataset.id, e = S.entries.get(id);
    e[field] = el.value; bump(id);
    if (e.link_id) {                       // mirror into linked grades right away
      for (const x of S.entries.values()) {
        if (x.link_id !== e.link_id || x.id === id) continue;
        x[field] = el.value;
        const xc = cellEl(x);
        if (xc) { const xi = $(field === 'subject' ? '.subj' : '.les', xc); xi.value = el.value; if (field === 'lesson_text') autoGrow(xi); updateCell(xc, x); }
      }
    }
    updateCell(c, e);
    schedule('e' + id, () => saveEntry(id));
  } else {
    const k = key(g, d, s);
    const dr = S.drafts.get(k) || { subject: '', lesson_text: '' };
    dr[field] = el.value;
    S.drafts.set(k, dr);
    c.classList.remove('subj-missing');
    schedule('d' + k, () => saveDraft(g, d, s));
  }
  if (field === 'subject') refreshRow(g, s);
  updateNeedChip();
}
/* empty cells show (and use) the subject from their row */
function refreshRow(g, s) {
  DAYS().forEach((d, di) => {
    const c = $(`.cell[data-g="${g}"][data-d="${d}"][data-s="${s}"]`);
    if (!c || c.dataset.id) return;
    const si = $('.subj', c);
    const dr = S.drafts.get(key(g, d, s));
    const inh = inheritedSubject(g, di, s);
    si.placeholder = inh || 'Subject';
    si.classList.toggle('noinh', !inh);
    si.tabIndex = (inh || (dr && dr.subject)) && document.activeElement !== si ? -1 : 0;
  });
}

async function saveEntry(id) {
  const e = S.entries.get(id);
  const l = S.local.get(id);
  if (!e || !l || l.v === l.sent) return;
  if (!e.subject.trim()) return;           // never save a blank subject
  l.sent = l.v;
  const r = await api('PATCH', `/api/entries/${id}`, { subject: e.subject, lesson_text: e.lesson_text });
  mergeChanged(r.changed);
}

async function saveDraft(g, d, s) {
  const k = key(g, d, s);
  const dr = S.drafts.get(k);
  if (!dr || S.creating.has(k)) { if (dr) schedule('d' + k, () => saveDraft(g, d, s), 300); return; }
  let subject = dr.subject.trim();
  if (!subject) {
    if (!dr.lesson_text.trim()) return;
    subject = inheritedSubject(g, DAYS().indexOf(d), s);
    if (!subject) {
      const c = $(`.cell[data-g="${g}"][data-d="${d}"][data-s="${s}"]`);
      if (c) c.classList.add('subj-missing');
      return;
    }
  }
  const sent = { ...dr };
  S.creating.add(k);
  try {
    const r = await api('POST', '/api/entries', { week: S.week, grade_id: g, day: d, sort_order: s, subject, lesson_text: dr.lesson_text });
    const ne = r.changed[0];
    remember(ne);
    const cur = S.drafts.get(k) || sent;
    S.drafts.delete(k);
    if (cur.subject.trim()) ne.subject = cur.subject;
    ne.lesson_text = cur.lesson_text;
    S.entries.set(ne.id, ne);
    if (cur.lesson_text !== sent.lesson_text || (cur.subject.trim() && cur.subject !== sent.subject)) {
      S.local.set(ne.id, { v: 1, sent: 0 });
      schedule('e' + ne.id, () => saveEntry(ne.id), 300);
    }
    renderGrade(g); renderToolbar();
  } finally { S.creating.delete(k); }
}

function onCellLeave(c) {
  const g = +c.dataset.g, d = c.dataset.d, s = +c.dataset.s;
  if (!c.dataset.id) { flush('d' + key(g, d, s)); return; }
  const id = +c.dataset.id, e = S.entries.get(id);
  if (!e) return;
  if (!e.subject.trim() && !e.lesson_text.trim()) { cancel('e' + id); deleteEntry(id); return; }
  if (!e.subject.trim()) {                  // put the subject back rather than save a blank one
    e.subject = (S.server.get(id) || {}).subject || 'Untitled';
    patchCell(e);
  }
  flush('e' + id);
}

async function deleteEntry(id, { linked = false } = {}) {
  const e = S.entries.get(id);
  if (!e) return;
  const snap = [e, ...(linked && e.link_id ? [...S.entries.values()].filter(x => x.link_id === e.link_id && x.id !== id) : [])]
    .map(x => ({ ...x, ...(S.server.get(x.id) || {}) }));
  const r = await api('DELETE', `/api/entries/${id}${linked ? '?linked=1' : ''}`);
  r.deleted.forEach(x => { S.entries.delete(x); cancel('e' + x); });
  mergeChanged(r.changed);
  renderAllGrades();
  toast(`Deleted “${snap[0].subject}”${snap.length > 1 ? ` in ${snap.length} grades` : ''}`, {
    action: 'Undo', ms: 7000, onAction: async () => {
      const back = [];
      for (const x of snap) {
        const rr = await api('POST', '/api/entries', { week: x.week_start, grade_id: x.grade_id, day: x.day, sort_order: x.sort_order,
          subject: x.subject, lesson_text: x.lesson_text, student_id: x.student_id, excluded: x.excluded, link_id: x.link_id });
        back.push(...rr.changed);
      }
      if (snap[0].week_start === S.week) { back.forEach(remember); back.forEach(b => S.entries.set(b.id, b)); renderAllGrades(); }
    },
  });
}

function kbFocus(el) {
  el.focus();
  const n = el.value.length;
  try { el.setSelectionRange(n, n); } catch (_) {}
  el.closest('.cell')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function moveFocus(c, dy) {
  const t = $(`.cell[data-g="${c.dataset.g}"][data-d="${c.dataset.d}"][data-s="${+c.dataset.s + dy}"] .les`);
  if (t) kbFocus(t);
}

function wireGrid() {
  const grids = $('#grids');
  grids.addEventListener('input', onCellInput);
  grids.addEventListener('pointerdown', () => { S.pointer = true; setTimeout(() => { S.pointer = false; }, 400); });
  grids.addEventListener('focusin', ev => {
    const el = ev.target;
    if (S.restoring || S.pointer || !el.classList.contains('les')) return;
    const n = el.value.length;                 // keyboard arrival: cursor to the end ("Lesson 37 ~ |")
    try { el.setSelectionRange(n, n); } catch (_) {}
  });
  grids.addEventListener('focusout', ev => {
    if (S.rendering) return;
    const c = ev.target.closest && ev.target.closest('.cell');
    if (!c || (ev.relatedTarget && c.contains(ev.relatedTarget))) return;
    onCellLeave(c);
  });
  grids.addEventListener('keydown', ev => {
    const el = ev.target, c = el.closest && el.closest('.cell');
    if (!c) return;
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      if (el.classList.contains('subj')) kbFocus($('.les', c)); else moveFocus(c, 1);
    } else if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && el.classList.contains('les') && !el.value.includes('\n') && !ev.shiftKey) {
      ev.preventDefault(); moveFocus(c, ev.key === 'ArrowDown' ? 1 : -1);
    } else if (ev.key === 'Escape') {
      el.blur();
    }
  });
  // drag & drop
  grids.addEventListener('dragstart', ev => {
    const grip = ev.target.closest && ev.target.closest('.grip');
    if (!grip) { if (!ev.target.closest || !ev.target.closest('textarea,input')) ev.preventDefault(); return; }
    const c = grip.closest('.cell');
    S.drag = +c.dataset.id;
    ev.dataTransfer.setData('text/plain', '');
    ev.dataTransfer.effectAllowed = 'move';
    try { ev.dataTransfer.setDragImage(c, 16, 16); } catch (_) {}
    setTimeout(() => c.classList.add('dragging'), 0);
  });
  grids.addEventListener('dragover', ev => {
    if (S.drag == null) return;
    const c = ev.target.closest('.cell');
    $$('.cell.drop-target').forEach(x => x !== c && x.classList.remove('drop-target'));
    if (!c || +c.dataset.id === S.drag) return;
    ev.preventDefault();
    c.classList.add('drop-target');
  });
  grids.addEventListener('drop', async ev => {
    if (S.drag == null) return;
    ev.preventDefault();
    const c = ev.target.closest('.cell');
    const id = S.drag;
    endDrag();
    if (!c || +c.dataset.id === id) return;
    await flushAll();
    const r = await api('POST', `/api/entries/${id}/move`, { grade_id: +c.dataset.g, day: c.dataset.d, sort_order: +c.dataset.s });
    mergeChanged(r.changed);
    renderAllGrades();
  });
  grids.addEventListener('dragend', endDrag);
}
function endDrag() { S.drag = null; $$('.cell.dragging,.cell.drop-target').forEach(x => x.classList.remove('dragging', 'drop-target')); }

/* ───────────────────────────── cell options popover ───────────────────────────── */
function closePop() { const p = $('#popover'); p.hidden = true; p.innerHTML = ''; p.dataset.id = ''; p.classList.remove('as-menu'); }
function placePop(p, anchor) {
  const r = anchor.getBoundingClientRect();
  p.hidden = false;
  const w = p.offsetWidth, h = p.offsetHeight;
  let left = r.right + window.scrollX - w, top = r.bottom + window.scrollY + 6;
  left = Math.max(8 + window.scrollX, Math.min(left, window.scrollX + document.documentElement.clientWidth - w - 8));
  if (r.bottom + h + 12 > window.innerHeight && r.top - h - 6 > 0) top = r.top + window.scrollY - h - 6;
  p.style.left = left + 'px'; p.style.top = top + 'px';
}
async function openCellMenu(btn) {
  const c = btn.closest('.cell');
  const id = +c.dataset.id;
  await flush('e' + id);
  renderCellMenu(id, btn);
}
function renderCellMenu(id, anchor) {
  const e = S.entries.get(id);
  const p = $('#popover');
  if (!e) { closePop(); return; }
  const g = grade(e.grade_id);
  const studs = studentsOf(e.grade_id);
  const others = S.data.grades.filter(x => x.id !== e.grade_id);
  const siblings = e.link_id ? [...S.entries.values()].filter(x => x.link_id === e.link_id && x.id !== e.id) : [];
  let h = `<h4>${esc(e.subject)}</h4><div class="sub">${esc(g.name)} · ${e.day} · row ${e.sort_order + 1}</div>`;
  if (studs.length) {
    h += `<div class="sec"><div class="sec-title">Who gets this</div>
      <select class="input" data-pop="student" style="width:100%">
        <option value="">Everyone in ${esc(g.name)}</option>
        ${studs.map(s => `<option value="${s.id}" ${e.student_id === s.id ? 'selected' : ''}>Only ${esc(s.name)} (replaces the class ${esc(e.subject)} on their sheet)</option>`).join('')}
        ${e.student_id && !studentName(e.student_id) ? '<option selected value="gone">Removed student</option>' : ''}
      </select>`;
    if (!e.student_id) {
      h += `<div style="margin-top:8px" class="small muted">Leave off these students' sheets:</div><div class="checks" style="margin-top:5px">
        ${studs.map(s => `<label><input type="checkbox" data-pop="exclude" value="${s.id}" ${(e.excluded || []).includes(s.id) ? 'checked' : ''}>${esc(s.name)}</label>`).join('')}</div>`;
    }
    h += '</div>';
  }
  if (others.length && !e.student_id) {
    h += `<div class="sec"><div class="sec-title">Other grades</div>`;
    for (const o of others) {
      const sib = siblings.find(x => x.grade_id === o.id);
      const theirs = !sib && [...S.entries.values()].find(x => x.grade_id === o.id && x.day === e.day && !x.student_id && x.subject.trim().toLowerCase() === e.subject.trim().toLowerCase());
      h += `<div class="grow" style="--gc:${esc(o.color)}"><span class="gname"><span class="dot"></span>${esc(o.name)}</span><span class="actions">`;
      if (sib) h += `<span class="tag link">linked</span><button class="btn sm" data-pop="unlink" data-id="${sib.id}">Unlink</button>`;
      else if (theirs) h += `<button class="btn sm" data-pop="link" data-other="${theirs.id}" title="Their ${esc(e.subject)} becomes this text, and stays in step from now on">Link to theirs</button>`;
      else h += `<button class="btn sm" data-pop="copy" data-g="${o.id}" data-link="1" title="Adds it there and keeps both in step">Add linked</button>
                 <button class="btn sm ghost" data-pop="copy" data-g="${o.id}" data-link="0" title="A separate copy you can change on its own">Copy</button>`;
      h += '</span></div>';
    }
    h += `<div class="small muted" style="margin-top:4px">Linked cells change together when you type.</div></div>`;
  }
  const canFill = DAYS().indexOf(e.day) < DAYS().length - 1;
  h += `<div class="sec actions">
    ${canFill ? `<button class="btn sm" data-pop="fill" title="Adds the next lesson numbers in this row's empty cells to the right">Fill rest of week →</button>` : ''}
    ${siblings.length ? `<button class="btn sm danger" data-pop="delete" data-linked="1">Delete in all ${siblings.length + 1} grades</button>` : ''}
    <button class="btn sm danger" data-pop="delete" data-linked="0">${siblings.length ? 'Delete here only' : 'Delete'}</button>
  </div>`;
  p.innerHTML = h;
  p.dataset.id = id;
  if (anchor) placePop(p, anchor);
}
async function onPopAction(ev) {
  const t = ev.target.closest('[data-pop]');
  if (!t) return;
  const id = +$('#popover').dataset.id;
  const e = S.entries.get(id);
  if (!e) return;
  const act = t.dataset.pop;
  let r;
  if (act === 'student' && ev.type === 'change') {
    if (t.value === 'gone') return;
    r = await api('PATCH', `/api/entries/${id}`, { student_id: t.value ? +t.value : null });
  } else if (act === 'exclude' && ev.type === 'change') {
    const ids = $$('[data-pop="exclude"]:checked', $('#popover')).map(x => +x.value);
    r = await api('PATCH', `/api/entries/${id}`, { excluded: ids });
  } else if (ev.type !== 'click') {
    return;
  } else if (act === 'unlink') {
    r = await api('POST', `/api/entries/${t.dataset.id}/unlink`);
  } else if (act === 'link') {
    r = await api('POST', `/api/entries/${id}/link`, { other_id: +t.dataset.other });
  } else if (act === 'copy') {
    r = await api('POST', `/api/entries/${id}/copy`, { grade_ids: [+t.dataset.g], link: t.dataset.link === '1' });
  } else if (act === 'fill') {
    r = await api('POST', `/api/entries/${id}/fill-week`);
    toast(r.changed.length ? `Added ${r.changed.length} cell${r.changed.length === 1 ? '' : 's'}` : 'Nothing to fill: the cells to the right are already used or are days off');
    closePop();
  } else if (act === 'delete') {
    closePop();
    return deleteEntry(id, { linked: t.dataset.linked === '1' });
  }
  if (r) {
    mergeChanged(r.changed);
    renderAllGrades();
    if (!$('#popover').hidden) {
      const btn = $(`.cell[data-id="${id}"] .more`);
      renderCellMenu(id, btn || null);
      if (!btn) closePop();
    }
  }
}

/* ───────────────────────────── menus ───────────────────────────── */
function openMenu(anchor, html, onClick) {
  closePop();
  const p = $('#popover');
  p.innerHTML = `<div class="menu-inner">${html}</div>`;
  p.dataset.id = '';
  p.classList.add('as-menu');
  placePop(p, anchor);
  p.onclickMenu = onClick;
}
function printMenu(anchor) {
  const d = S.data;
  let h = `<div class="menu" style="position:static;box-shadow:none;border:0;padding:0">
    <div class="label">${esc(d.week_label)}</div>
    <a href="${weekUrl('/print/teacher')}" data-print>Teacher copy <span class="cnt">2 pages, landscape</span></a>
    <a href="${weekUrl('/print/bulk')}" data-print>All students <span class="cnt">${d.students.length} pages</span></a>`;
  for (const g of d.grades) {
    const ss = studentsOf(g.id);
    if (!ss.length) continue;
    h += `<div class="sep"></div><div class="label">${esc(g.name)}</div>`;
    if (ss.length > 1) h += `<a href="${weekUrl('/print/bulk', '&grade=' + g.id)}" data-print>Everyone in ${esc(g.name)}</a>`;
    for (const s of ss) h += `<a href="${weekUrl('/print/student/' + s.id)}" data-print>${esc(s.name)}</a>`;
  }
  h += '</div>';
  openMenu(anchor, h);
}
function weekMenu(anchor) {
  openMenu(anchor, `<div class="menu" style="position:static;box-shadow:none;border:0;padding:0">
    ${S.data.source_week ? `<button data-m="start-dialog">Fill in from an earlier week…</button>` : ''}
    <button data-m="autolink">Link matching entries across grades</button>
    <div class="sep"></div>
    <button data-m="clear" style="color:var(--danger)">Clear this whole week…</button></div>`);
}
function gradeMenu(anchor, gid) {
  const g = grade(gid);
  openMenu(anchor, `<div class="menu" style="position:static;box-shadow:none;border:0;padding:0">
    <a href="${weekUrl('/print/bulk', '&grade=' + gid)}" data-print>Print ${esc(g.name)} students</a>
    <button data-m="compact" data-g="${gid}">Close up empty gaps in rows</button>
    <div class="sep"></div>
    <button data-m="clear-grade" data-g="${gid}" style="color:var(--danger)">Clear ${esc(g.name)} for this week…</button></div>`);
}
function weekPicker(anchor) {
  const d = S.data;
  const hist = d.history.slice(0, 40);
  openMenu(anchor, `<div class="menu" style="position:static;box-shadow:none;border:0;padding:0">
    <div style="padding:6px 8px 8px;display:flex;gap:6px"><input type="date" class="input" id="jumpDate" value="${d.week}" style="flex:1"><button class="btn sm primary" data-m="jump">Go</button></div>
    <button data-m="goto" data-w="${d.current_week}">This week</button>
    <div class="sep"></div><div class="label">Saved weeks</div>
    ${hist.map(h => `<button data-m="goto" data-w="${h.week_start}" class="${h.week_start === d.week ? 'cur' : ''}">${esc(h.label)}<span class="cnt">${h.count}</span></button>`).join('')}
  </div>`);
}
async function onMenuClick(ev) {
  const a = ev.target.closest('a[data-print]');
  if (a) { ev.preventDefault(); closePop(); return openPrint(a.getAttribute('href')); }
  const b = ev.target.closest('[data-m]');
  if (!b) return;
  const m = b.dataset.m;
  if (m === 'jump') { const v = $('#jumpDate').value; closePop(); if (v) load(v); return; }
  closePop();
  if (m === 'goto') return load(b.dataset.w);
  if (m === 'start-dialog') return openStartDialog();
  if (m === 'autolink') {
    const r = await api('POST', '/api/week/autolink', { week: S.week });
    toast(r.linked ? `Linked ${r.linked} cells that were identical across grades` : 'No new matches to link');
    return load(S.week);
  }
  if (m === 'clear') {
    if (!confirm(`Delete every assignment for ${S.data.week_label}? (Weekly assignments and notes stay.)`)) return;
    await api('POST', '/api/week/clear', { week: S.week });
    return load(S.week);
  }
  if (m === 'clear-grade') {
    const g = grade(+b.dataset.g);
    if (!confirm(`Delete all ${g.name} assignments for ${S.data.week_label}?`)) return;
    await api('POST', '/api/week/clear', { week: S.week, grade_id: g.id });
    return load(S.week);
  }
  if (m === 'compact') {
    await flushAll();
    const r = await api('POST', '/api/rows', { week: S.week, grade_id: +b.dataset.g, action: 'compact', at: 0 });
    return reloadEntries(r.entries);
  }
}
async function openPrint(url) {
  const w = window.open('about:blank', '_blank');
  await flushAll();
  if (w) w.location.href = url; else location.href = url;
}
function reloadEntries(list) {
  S.entries = new Map(list.map(e => [e.id, e]));
  S.server.clear(); list.forEach(remember);
  renderAllGrades();
}

async function rowAction(b) {
  const g = +b.dataset.g, s = +b.dataset.s, op = b.dataset.op;
  await flushAll();
  let body;
  if (op === 'up') { if (s === 0) return; body = { action: 'swap', at: s, to: s - 1 }; }
  else if (op === 'down') body = { action: 'swap', at: s, to: s + 1 };
  else if (op === 'insert') body = { action: 'insert', at: s };
  else if (op === 'delete') {
    const n = [...S.entries.values()].filter(e => e.grade_id === g && e.sort_order === s).length;
    if (n && !confirm(`Delete row ${s + 1} of ${grade(g).name} (${n} assignment${n === 1 ? '' : 's'}, all days)?`)) return;
    body = { action: 'delete', at: s };
  }
  const r = await api('POST', '/api/rows', { week: S.week, grade_id: g, ...body });
  reloadEntries(r.entries);
}

/* ───────────────────────────── start a week ───────────────────────────── */
function openStartDialog() {
  const d = S.data;
  const weeks = d.history.filter(h => h.week_start !== d.week);
  if (!weeks.length) { toast('There are no other weeks to start from yet'); return; }
  const def = d.source_week || weeks[0].week_start;
  const hasAny = S.entries.size > 0;
  const box = $('#modalBox');
  box.innerHTML = `
    <h3>${hasAny ? 'Fill in' : 'Start'} ${esc(d.week_label)}</h3>
    <p class="lead">${hasAny ? 'Adds what’s missing from an earlier week. Nothing you’ve already typed is changed.' : 'Copies the subjects and order of an earlier week.'} Days off are skipped.</p>
    <label class="field"><span>Start from</span>
      <select class="input" id="srcWeek">${weeks.map(h => `<option value="${h.week_start}" ${h.week_start === def ? 'selected' : ''}>${esc(h.label)} (${h.count})</option>`).join('')}</select></label>
    <div class="opts">
      <label class="opt"><input type="radio" name="smode" value="advance" checked><span><b>Move lesson numbers forward</b>
        <small>Lesson 36 → 37, 3.9 → 3.10, Worksheet 64 → 65. Names are left blank (“Lesson 37 ~ ”) and the blank “~” never prints. Spelling “Lesson 6” in weekly assignments becomes 7.</small></span></label>
      <label class="opt"><input type="radio" name="smode" value="copy"><span><b>Copy exactly</b><small>Same text as that week, word for word.</small></span></label>
    </div>
    <div class="field"><span>Include</span><div class="inline-checks">
      <label><input type="checkbox" id="incS" checked> Schedule</label>
      <label><input type="checkbox" id="incW" ${d.weekly.length ? 'disabled' : 'checked'}> Weekly assignments${d.weekly.length ? ' (already set)' : ''}</label>
      <label><input type="checkbox" id="incN" ${Object.values(d.notes).some(v => (v || '').trim()) ? 'disabled' : 'checked'}> Teacher notes${Object.values(d.notes).some(v => (v || '').trim()) ? ' (already set)' : ''}</label>
    </div></div>
    <div class="foot"><button class="btn" data-modal="close">Cancel</button><button class="btn primary" data-modal="go">${hasAny ? 'Fill in' : 'Start week'}</button></div>`;
  $('#modal').hidden = false;
  box.onclick = async ev => {
    const b = ev.target.closest('[data-modal]');
    if (!b) return;
    if (b.dataset.modal === 'close') { $('#modal').hidden = true; return; }
    const parts = [['schedule', '#incS'], ['weekly', '#incW'], ['notes', '#incN']].filter(([, s]) => $(s).checked && !$(s).disabled).map(([p]) => p);
    const mode = $('input[name="smode"]:checked').value;
    b.disabled = true;
    await startWeek($('#srcWeek').value, mode, parts);
    $('#modal').hidden = true;
  };
}
async function startWeek(source, mode = 'advance', parts = ['schedule', 'weekly', 'notes']) {
  await flushAll();
  const r = await api('POST', '/api/week/start', { week: S.week, source, mode, parts });
  await load(S.week);
  toast(r.added ? `Added ${r.added} assignment${r.added === 1 ? '' : 's'}${mode === 'advance' ? '. Now fill in the lesson names.' : ''}` : 'Nothing new to add');
  if (mode === 'advance') setTimeout(nextNeed, 100);
}
function nextNeed() {
  const cells = $$('.cell.needs .les');
  if (!cells.length) return;
  const cur = document.activeElement;
  const i = cells.indexOf(cur);
  kbFocus(cells[(i + 1) % cells.length]);
}

/* ───────────────────────────── weekly & notes ───────────────────────────── */
function renderWeekly() {
  const d = S.data;
  $('#weeklyWeek').textContent = d.week_label;
  const list = $('#weeklyList');
  if (!d.weekly.length) {
    list.innerHTML = `<p class="muted">No weekly assignments for this week yet.</p>
      ${d.prev_has_weekly ? `<p><button class="btn" data-w-act="copy">Copy last week’s (Lesson numbers +1)</button></p>` : ''}`;
  } else {
    list.innerHTML = d.weekly.map((w, i) => `<div class="witem" data-w="${w.id}">
      <div class="wrow"><input class="wsubj" value="${esc(w.subject)}" placeholder="Subject" aria-label="Subject">
        <button class="btn sm ghost" data-w-act="up" ${i ? '' : 'disabled'} title="Move up">↑</button>
        <button class="btn sm ghost" data-w-act="down" ${i < d.weekly.length - 1 ? '' : 'disabled'} title="Move down">↓</button>
        <button class="btn sm ghost danger" data-w-act="del" title="Delete">✕</button></div>
      <textarea class="wdesc" rows="1" placeholder="Details, e.g. Lesson 7 ~ list A by Tuesday, list B by Friday" aria-label="Details">${esc(w.description)}</textarea>
      <div class="gchips">${d.grades.map(g => `<button class="gchip ${w.grade_ids.includes(g.id) ? 'on' : ''}" style="--gc:${esc(g.color)}" data-w-act="grade" data-g="${g.id}">${esc(g.name)}</button>`).join('')}</div>
    </div>`).join('');
    $$('.wdesc', list).forEach(autoGrow);
  }
  const notes = $('#notesList');
  const anyNotes = Object.values(d.notes).some(v => (v || '').trim());
  notes.innerHTML = (!anyNotes ? `<p><button class="btn sm" data-n-act="copy">Copy last week’s notes</button></p>` : '') +
    d.days.map(day => `<div class="note-day"><label class="field"><span><b>${day}</b><em class="muted" style="font-style:normal">${esc(d.week_dates[day])}</em></span>
      <textarea class="input" data-note="${day}" placeholder="Reminders for ${day}">${esc(d.notes[day] || '')}</textarea></label></div>`).join('');
}
function wireWeekly() {
  const list = $('#weeklyList');
  list.addEventListener('input', ev => {
    const it = ev.target.closest('.witem');
    if (!it) return;
    const id = +it.dataset.w;
    if (ev.target.classList.contains('wdesc')) autoGrow(ev.target);
    const body = { subject: $('.wsubj', it).value, description: $('.wdesc', it).value };
    const w = S.data.weekly.find(x => x.id === id);
    if (w) { w.subject = body.subject; w.description = body.description; }
    schedule('w' + id, () => api('PATCH', `/api/weekly/${id}`, body));
  });
  list.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-w-act]');
    if (!b) return;
    const act = b.dataset.wAct;
    if (act === 'copy') {
      const r = await api('POST', '/api/week/start', { week: S.week, source: S.data.source_week || S.week, mode: 'advance', parts: ['weekly'] });
      return load(S.week).then(() => switchTab('weekly'));
    }
    const it = b.closest('.witem'), id = +it.dataset.w;
    await flush('w' + id);
    let r;
    if (act === 'del') { if (!confirm('Delete this weekly assignment for this week?')) return; r = await api('DELETE', `/api/weekly/${id}`); }
    if (act === 'up' || act === 'down') r = await api('PATCH', `/api/weekly/${id}`, { move: act === 'up' ? -1 : 1 });
    if (act === 'grade') {
      const w = S.data.weekly.find(x => x.id === id);
      const g = +b.dataset.g;
      const ids = w.grade_ids.includes(g) ? w.grade_ids.filter(x => x !== g) : [...w.grade_ids, g];
      r = await api('PATCH', `/api/weekly/${id}`, { grade_ids: ids });
    }
    if (r) { S.data.weekly = r.weekly; renderWeekly(); }
  });
  $('#addWeekly').addEventListener('click', async () => {
    const r = await api('POST', '/api/weekly', { week: S.week, subject: 'New assignment', description: '', grade_ids: S.data.grades.map(g => g.id) });
    S.data.weekly = r.weekly; renderWeekly();
    const last = $$('.witem .wsubj').pop();
    if (last) { last.focus(); last.select(); }
  });
  const notes = $('#notesList');
  notes.addEventListener('input', ev => {
    const day = ev.target.dataset.note;
    if (!day) return;
    S.data.notes[day] = ev.target.value;
    schedule('n' + day, () => api('PUT', '/api/notes', { week: S.week, day, text: ev.target.value }));
  });
  notes.addEventListener('click', async ev => {
    if (!ev.target.closest('[data-n-act="copy"]')) return;
    await api('POST', '/api/week/start', { week: S.week, source: S.data.source_week || S.week, mode: 'copy', parts: ['notes'] });
    await load(S.week); switchTab('weekly');
  });
}

/* ───────────────────────────── students ───────────────────────────── */
function renderStudents() {
  const d = S.data, pane = $('#studentsPane');
  if (!d.grades.length) { pane.innerHTML = '<div class="card"><p class="muted">Add grade levels in Settings first.</p></div>'; return; }
  pane.innerHTML = `<div class="settings-grid">${d.grades.map(g => {
    const ss = studentsOf(g.id);
    return `<div class="card" style="--gc:${esc(g.color)}">
      <div class="card-head"><h2 style="display:flex;align-items:center;gap:8px"><span class="dot"></span>${esc(g.name)}</h2>
        ${ss.length ? `<a class="btn sm" href="${weekUrl('/print/bulk', '&grade=' + g.id)}" data-print-link>Print all</a>` : ''}</div>
      ${ss.map((s, i) => `<div class="srow" data-s="${s.id}">
        <input class="sname" value="${esc(s.name)}" aria-label="Name">
        <select class="input" data-s-act="grade" style="padding:4px 6px" aria-label="Grade">${d.grades.map(x => `<option value="${x.id}" ${x.id === g.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <button class="btn sm ghost" data-s-act="up" ${i ? '' : 'disabled'} title="Move up">↑</button>
        <button class="btn sm ghost" data-s-act="down" ${i < ss.length - 1 ? '' : 'disabled'} title="Move down">↓</button>
        <a class="btn sm" href="${weekUrl('/print/student/' + s.id)}" data-print-link>Print</a>
        <button class="btn sm ghost danger" data-s-act="del" title="Remove">✕</button></div>`).join('') || '<p class="muted small">No students yet.</p>'}
      <form class="form-inline" data-add-student="${g.id}" style="margin-top:10px">
        <input class="input" name="name" placeholder="Add a student to ${esc(g.name)}" style="flex:1" required>
        <button class="btn">Add</button></form>
    </div>`;
  }).join('')}</div>`;
}
function wireStudents() {
  const pane = $('#studentsPane');
  pane.addEventListener('submit', async ev => {
    const f = ev.target.closest('[data-add-student]');
    if (!f) return;
    ev.preventDefault();
    await api('POST', '/api/students', { name: f.name.value, grade_id: +f.dataset.addStudent });
    await load(S.week); switchTab('students');
    $(`[data-add-student="${f.dataset.addStudent}"] input`)?.focus();
  });
  pane.addEventListener('change', async ev => {
    const row = ev.target.closest('.srow');
    if (!row) return;
    const id = +row.dataset.s;
    if (ev.target.classList.contains('sname')) await api('PATCH', `/api/students/${id}`, { name: ev.target.value });
    if (ev.target.dataset.sAct === 'grade') await api('PATCH', `/api/students/${id}`, { grade_id: +ev.target.value });
    await load(S.week); switchTab('students');
  });
  pane.addEventListener('click', async ev => {
    const a = ev.target.closest('[data-print-link]');
    if (a) { ev.preventDefault(); return openPrint(a.getAttribute('href')); }
    const b = ev.target.closest('[data-s-act]');
    if (!b || b.tagName === 'SELECT') return;
    const row = b.closest('.srow'), id = +row.dataset.s, act = b.dataset.sAct;
    const name = $('.sname', row).value;
    if (act === 'del') {
      if (!confirm(`Remove ${name}?\n\nAny “only ${name}” assignments and “leave out ${name}” marks (in every week) are removed too.`)) return;
      await api('DELETE', `/api/students/${id}`);
    } else if (act === 'up' || act === 'down') {
      await api('PATCH', `/api/students/${id}`, { move: act === 'up' ? -1 : 1 });
    } else return;
    await load(S.week); switchTab('students');
  });
}

/* ───────────────────────────── settings ───────────────────────────── */
function renderSettings() {
  const d = S.data, st = d.settings;
  const txt = (k, label, ph = '') => `<label class="field"><span>${label}</span><input class="input" data-set="${k}" value="${esc(st[k])}" placeholder="${esc(ph)}"></label>`;
  const col = (k, label) => `<label class="field"><span>${label}</span><span style="display:flex;gap:6px;align-items:center"><input type="color" class="color-in" data-set="${k}" value="${esc(st[k])}"><code class="small">${esc(st[k])}</code></span></label>`;
  $('#settingsPane').innerHTML = `<div class="settings-grid">
    <div class="card"><div class="card-head"><h2>Grades</h2><span class="muted small">Name, color and order</span></div>
      ${d.grades.map((g, i) => `<div class="srow" data-gr="${g.id}">
        <input type="color" class="color-in" data-g-act="color" value="${esc(g.color)}" title="Grade color">
        <input class="sname" data-g-act="name" value="${esc(g.name)}">
        <button class="btn sm ghost" data-g-act="up" ${i ? '' : 'disabled'}>↑</button>
        <button class="btn sm ghost" data-g-act="down" ${i < d.grades.length - 1 ? '' : 'disabled'}>↓</button>
        <button class="btn sm ghost danger" data-g-act="del" title="Delete grade">✕</button></div>`).join('')}
      <form class="form-inline" id="addGrade" style="margin-top:10px">
        <input type="color" class="color-in" name="color" value="#1e3054"><input class="input" name="name" placeholder="e.g. 11th Grade" style="flex:1" required><button class="btn">Add grade</button></form>
    </div>

    <div class="card"><div class="card-head"><h2>School calendar</h2></div>
      <div class="stat-row" style="margin-bottom:12px">
        <div class="stat"><b>${d.day_num ?? '—'}</b><span>Today’s day</span></div>
        <div class="stat"><b>${d.week_num ?? '—'}</b><span>Week shown</span></div></div>
      <div class="form-rows">
        <label class="field"><span>First day of school</span><input type="date" class="input" data-set="school_start_date" value="${esc(st.school_start_date)}"></label>
        <div class="form-inline">
          <label class="field"><span>Day number adjustment</span><input type="number" class="input" data-set="day_adjust" value="${esc(st.day_adjust)}" style="width:110px"></label>
          <label class="field"><span>Week number adjustment</span><input type="number" class="input" data-set="week_adjust" value="${esc(st.week_adjust)}" style="width:110px"></label>
        </div>
        <p class="help" style="margin:0">Days are counted from the first day, skipping weekends and the days off below. Use an adjustment only if your school counts differently (e.g. −2).</p>
        <div class="field"><span>Days off (${d.no_school.length})</span>
          <div class="offlist">${d.no_school.map(n => `<div class="offrow"><b>${fmtDate(n.day_date)}</b><span class="lbl">${esc(n.label)}</span><button class="btn sm ghost danger" data-off-del="${n.day_date}" title="Remove">✕</button></div>`).join('') || '<div class="offrow muted">None yet</div>'}</div></div>
        <form class="form-inline" id="addOff">
          <label class="field"><span>From</span><input type="date" class="input" name="from" required></label>
          <label class="field"><span>To (optional)</span><input type="date" class="input" name="to"></label>
          <label class="field" style="flex:1;min-width:120px"><span>Reason</span><input class="input" name="label" placeholder="Thanksgiving"></label>
          <button class="btn">Add</button></form>
      </div></div>

    <div class="card"><div class="card-head"><h2>Printout text</h2><span class="muted small">Same printed layout as before</span></div>
      <div class="form-rows">
        ${txt('print_header_line1', 'Title', 'Weekly Assignment Schedule')}
        ${txt('print_header_line2', 'Subtitle', 'e.g. 2026-2027 ~ Your School')}
        ${txt('print_tagline', 'Tagline (italic, under the title)')}
        <div class="form-inline">${txt('print_footer_left', 'Footer left')}${txt('print_footer_center', 'Footer center')}${txt('print_footer_right', 'Footer right', 'grade name')}</div>
      </div></div>

    <div class="card"><div class="card-head"><h2>Colors &amp; test highlighting</h2></div>
      <div class="form-rows">
        <div class="form-inline">${col('color_primary', 'Main color')}${col('color_accent', 'Accent')}${col('test_highlight_color', 'Test highlight')}</div>
        ${txt('test_highlight_keywords', 'Highlight words (comma separated)', 'test,quiz,exam,review')}
        <p class="help" style="margin:0">Anything containing these words is tinted and gets a ⚑ on printouts.</p>
      </div></div>

    <div class="card"><div class="card-head"><h2>Housekeeping</h2></div>
      <p class="small">${d.leftovers ? `<b>${d.leftovers}</b> leftover item${d.leftovers === 1 ? '' : 's'} from students who were removed (their “only for” assignments and “leave out” marks). They don’t print for anyone.` : 'No leftovers from removed students.'}</p>
      ${d.leftovers ? '<button class="btn" id="cleanup">Clean up leftovers</button>' : ''}
      <p class="help">Each time the scheduler starts it saves a backup copy of your data in the <b>backups</b> folder next to the app (the last 15 are kept).</p>
    </div>
  </div>`;
}
function fmtDate(iso) { const [y, m, dd] = iso.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); }
function wireSettings() {
  const pane = $('#settingsPane');
  pane.addEventListener('change', async ev => {
    const t = ev.target;
    if (t.dataset.set) {
      await api('PUT', '/api/settings', { [t.dataset.set]: t.value });
      await load(S.week); switchTab('settings');
      return;
    }
    const row = t.closest('[data-gr]');
    if (row && (t.dataset.gAct === 'name' || t.dataset.gAct === 'color')) {
      await api('PATCH', `/api/grades/${row.dataset.gr}`, { [t.dataset.gAct]: t.value });
      await load(S.week); switchTab('settings');
    }
  });
  pane.addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.offDel) { await api('DELETE', `/api/noschool/${b.dataset.offDel}`); await load(S.week); return switchTab('settings'); }
    if (b.id === 'cleanup') {
      if (!confirm('Remove the leftovers from removed students? (A backup was made when the app started.)')) return;
      const r = await api('POST', '/api/cleanup'); toast(`Removed ${r.removed} leftover items`);
      await load(S.week); return switchTab('settings');
    }
    const row = b.closest('[data-gr]');
    if (!row) return;
    const id = +row.dataset.gr, g = grade(id);
    if (b.dataset.gAct === 'del') {
      if (!confirm(`Delete ${g.name}?\n\nThis removes its students and every one of its assignments in every week. This can't be undone (except from a backup).`)) return;
      await api('DELETE', `/api/grades/${id}`);
    } else if (b.dataset.gAct === 'up' || b.dataset.gAct === 'down') {
      await api('PATCH', `/api/grades/${id}`, { move: b.dataset.gAct === 'up' ? -1 : 1 });
    } else return;
    await load(S.week); switchTab('settings');
  });
  pane.addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    if (f.id === 'addGrade') await api('POST', '/api/grades', { name: f.name.value, color: f.color.value });
    if (f.id === 'addOff') await api('POST', '/api/noschool', { from: f.from.value, to: f.to.value, label: f.label.value });
    await load(S.week); switchTab('settings');
  });
}

/* ───────────────────────────── tabs & global wiring ───────────────────────────── */
function switchTab(t) {
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  $$('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + t));
  if (location.hash !== '#' + t) history.replaceState(null, '', '#' + t);
  if (t === 'weekly') $$('.wdesc').forEach(autoGrow);
  if (t === 'schedule') $$('#grids textarea.les').forEach(autoGrow);
}

function wire() {
  wireGrid(); wireWeekly(); wireStudents(); wireSettings();
  $('#tabs').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) switchTab(b.dataset.tab); });
  $('#prevWeek').onclick = () => load(S.data.prev_week);
  $('#nextWeek').onclick = () => load(S.data.next_week);
  $('#todayBtn').onclick = () => load(S.data.current_week);
  $('#weekTitle').onclick = ev => { ev.stopPropagation(); weekPicker(ev.currentTarget); };
  $('#printBtn').onclick = ev => { ev.stopPropagation(); printMenu(ev.currentTarget); };

  document.addEventListener('click', ev => {
    const pop = $('#popover');
    if (!pop.hidden && pop.contains(ev.target)) {
      if (pop.classList.contains('as-menu')) onMenuClick(ev); else onPopAction(ev);
      return;
    }
    const act = ev.target.closest('[data-act]');
    const go = ev.target.closest('[data-goto]');
    if (go) { switchTab(go.dataset.goto); return; }
    if (!act) { if (!pop.hidden) closePop(); return; }
    ev.stopPropagation();
    const a = act.dataset.act;
    if (a === 'cell-menu') { pop.classList.remove('as-menu'); openCellMenu(act); }
    else if (a === 'start-quick') startWeek(S.data.source_week);
    else if (a === 'start-dialog') openStartDialog();
    else if (a === 'week-menu') weekMenu(act);
    else if (a === 'grade-menu') gradeMenu(act, +act.dataset.g);
    else if (a === 'row') rowAction(act);
    else if (a === 'next-need') nextNeed();
  });
  $('#popover').addEventListener('change', ev => { if (!$('#popover').classList.contains('as-menu')) onPopAction(ev); });
  $('#popover').addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'jumpDate') { ev.preventDefault(); const v = ev.target.value; closePop(); if (v) load(v); } });
  $('#modal').addEventListener('click', ev => { if (ev.target.id === 'modal') $('#modal').hidden = true; });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { closePop(); $('#modal').hidden = true; }
    if (ev.altKey && ev.key === 'PageUp') { ev.preventDefault(); load(S.data.prev_week); }
    if (ev.altKey && ev.key === 'PageDown') { ev.preventDefault(); load(S.data.next_week); }
  });
  window.addEventListener('scroll', () => { if (!$('#popover').hidden && !$('#popover').classList.contains('as-menu')) closePop(); }, { passive: true });
  window.addEventListener('beforeunload', ev => {
    if (S.timers.size || S.inflight) { flushAll(); ev.preventDefault(); ev.returnValue = ''; }
  });
}

wire();
load(new URL(location.href).searchParams.get('week')).then(() => {
  const t = (location.hash || '').slice(1);
  if (['schedule', 'weekly', 'students', 'settings'].includes(t)) switchTab(t);
});
