"""
Weekly Assignment Scheduler (stand-alone)
=========================================
Plan each week in a grid and print a sheet for every student plus a teacher
copy. Runs on your own computer; everything is saved in scheduler.db in this
folder. A backup copy is saved in the backups folder every time it starts.

Start it with the launcher for your computer (see README.md), or:
    python app.py            only this computer can open it
    python app.py --share    tablets and phones on the same Wi-Fi can open it too
"""
from flask import Flask, render_template, request, jsonify, redirect, url_for, g, abort
import sqlite3, os, re, uuid, glob
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

app = Flask(__name__)
app.json.sort_keys = False

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.environ.get('SCHEDULER_DB') or os.path.join(BASE, 'scheduler.db')
BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(DB)), 'backups')
DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
DAY_IDX = {d: i for i, d in enumerate(DAYS)}
SCHEMA_VERSION = 2
KEEP_STARTUP_BACKUPS = 15

DEFAULT_SETTINGS = {
    'school_start_date': '', 'current_week_override': '', 'current_school_day': '',
    'print_header_line1': 'Weekly Assignment Schedule', 'print_header_line2': '',
    'print_tagline': '', 'print_footer_left': 'Keep this sheet in your binder',
    'print_footer_center': '', 'print_footer_right': '',
    'color_primary': '#1e3054', 'color_accent': '#b8860b',
    'test_highlight_color': '#b5451b', 'test_highlight_keywords': 'test,quiz,exam,review',
    'day_adjust': '0', 'week_adjust': '0',
}
EDITABLE_SETTINGS = [k for k in DEFAULT_SETTINGS if k not in ('current_week_override', 'current_school_day')]
PRINT_KEYS = ['print_header_line1', 'print_header_line2', 'print_tagline',
              'print_footer_left', 'print_footer_center', 'print_footer_right',
              'color_primary', 'color_accent', 'test_highlight_color', 'test_highlight_keywords']


# ─────────────────────────────────────────────────────────────── database ──
def connect():
    c = sqlite3.connect(DB, timeout=10)
    c.row_factory = sqlite3.Row
    return c

def db():
    if 'db' not in g:
        g.db = connect()
    return g.db

@app.teardown_appcontext
def _close_db(exc):
    c = g.pop('db', None)
    if c is not None:
        c.close()

def rows(sql, args=()):
    return [dict(r) for r in db().execute(sql, args).fetchall()]

def one(sql, args=()):
    r = db().execute(sql, args).fetchone()
    return dict(r) if r else None

def setting(key, c=None):
    c = c or db()
    r = c.execute('SELECT value FROM settings WHERE key=?', (key,)).fetchone()
    return r['value'] if r and r['value'] is not None else DEFAULT_SETTINGS.get(key, '')

def all_settings(c=None):
    c = c or db()
    out = dict(DEFAULT_SETTINGS)
    for r in c.execute('SELECT key, value FROM settings'):
        if r['value'] is not None:
            out[r['key']] = r['value']
    return out

def new_link():
    return uuid.uuid4().hex[:12]


# ─────────────────────────────────────────────────────────────── backups ──
def make_backup(tag):
    if not os.path.exists(DB) or os.path.getsize(DB) == 0:
        return None
    os.makedirs(BACKUP_DIR, exist_ok=True)
    dst = os.path.join(BACKUP_DIR, f"scheduler_{tag}_{datetime.now():%Y-%m-%d_%H%M%S}.db")
    src = sqlite3.connect(DB); out = sqlite3.connect(dst)
    src.backup(out); out.close(); src.close()
    if tag == 'startup':
        old = sorted(glob.glob(os.path.join(BACKUP_DIR, 'scheduler_startup_*.db')))
        for f in old[:-KEEP_STARTUP_BACKUPS]:
            try: os.remove(f)
            except OSError: pass
    return dst


# ────────────────────────────────────────────────────────────── migration ──
def init_db():
    fresh = not os.path.exists(DB) or os.path.getsize(DB) == 0
    c = connect()
    c.executescript("""
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS grades (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
            color TEXT DEFAULT '#1e3054', sort_order INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
            grade_id INTEGER NOT NULL, active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (grade_id) REFERENCES grades(id));
        CREATE TABLE IF NOT EXISTS schedule_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT, grade_id INTEGER NOT NULL,
            week_start TEXT NOT NULL DEFAULT '',
            day TEXT NOT NULL, subject TEXT NOT NULL, lesson_text TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS year_template (
            id INTEGER PRIMARY KEY AUTOINCREMENT, grade_id INTEGER NOT NULL,
            day TEXT NOT NULL, subject TEXT NOT NULL, lesson_text TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS weekly_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT NOT NULL,
            description TEXT NOT NULL, sort_order INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS weekly_assignment_grades (
            weekly_id INTEGER NOT NULL, grade_id INTEGER NOT NULL,
            PRIMARY KEY (weekly_id, grade_id));
        CREATE TABLE IF NOT EXISTS teacher_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            day TEXT NOT NULL UNIQUE, note_text TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS entry_exclusions (
            entry_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
            PRIMARY KEY (entry_id, student_id));
    """)
    cols = {r['name'] for r in c.execute('PRAGMA table_info(schedule_entries)')}
    for col, ddl in [('week_start', "TEXT DEFAULT ''"), ('student_id', 'INTEGER'), ('link_id', 'TEXT')]:
        if col not in cols:
            c.execute(f'ALTER TABLE schedule_entries ADD COLUMN {col} {ddl}')
    # ── version 2 tables (new, so version 1 keeps working untouched) ──
    c.executescript("""
        CREATE TABLE IF NOT EXISTS weekly_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT, week_start TEXT NOT NULL,
            subject TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
            sort_order INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS weekly_item_grades (
            item_id INTEGER NOT NULL, grade_id INTEGER NOT NULL,
            PRIMARY KEY (item_id, grade_id));
        CREATE TABLE IF NOT EXISTS week_notes (
            week_start TEXT NOT NULL, day TEXT NOT NULL, note_text TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (week_start, day));
        CREATE TABLE IF NOT EXISTS no_school_days (
            day_date TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT '');
        CREATE INDEX IF NOT EXISTS idx_entries_week ON schedule_entries (week_start, grade_id, day);
        CREATE INDEX IF NOT EXISTS idx_weekly_items_week ON weekly_items (week_start);
    """)
    for k, v in DEFAULT_SETTINGS.items():
        c.execute('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)', (k, v))
    c.execute("UPDATE schedule_entries SET week_start=? WHERE week_start='' OR week_start IS NULL",
              (monday_of(),))
    c.commit()

    ver = int(setting('schema_version', c) or 0)
    if ver < 2:
        if not fresh:
            make_backup('before-v2')
        migrate_to_v2(c)
        c.execute('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', ('schema_version', '2'))
        c.commit()
    c.close()


def migrate_to_v2(c):
    """One-time move of the old single-set data into the per-week tables."""
    today_mon = monday_of()
    latest = c.execute("SELECT MAX(week_start) m FROM schedule_entries").fetchone()['m']
    target_weeks = sorted({today_mon} | ({latest} if latest else set()))

    # Weekly assignments & teacher notes were one shared set; give that set to
    # this week and the latest planned week, so both look exactly like before.
    old_weekly = c.execute('SELECT * FROM weekly_assignments ORDER BY sort_order,id').fetchall()
    for ws in target_weeks:
        if c.execute('SELECT 1 FROM weekly_items WHERE week_start=?', (ws,)).fetchone():
            continue
        for i, w in enumerate(old_weekly):
            nid = c.execute('INSERT INTO weekly_items (week_start,subject,description,sort_order) VALUES (?,?,?,?)',
                            (ws, w['subject'], w['description'], i)).lastrowid
            for gr in c.execute('SELECT grade_id FROM weekly_assignment_grades WHERE weekly_id=?', (w['id'],)):
                c.execute('INSERT OR IGNORE INTO weekly_item_grades VALUES (?,?)', (nid, gr['grade_id']))
    notes = {r['day']: r['note_text'] for r in c.execute('SELECT day,note_text FROM teacher_notes')}
    for ws in target_weeks:
        for d in DAYS:
            if (notes.get(d) or '').strip():
                c.execute('INSERT OR IGNORE INTO week_notes (week_start,day,note_text) VALUES (?,?,?)',
                          (ws, d, notes[d]))

    # Guess days off: a weekday with nothing scheduled in a week that is
    # otherwise scheduled, between the start date and today.
    start = parse_date(setting('school_start_date', c))
    if start:
        today = date.today()
        per_week = defaultdict(set)
        for r in c.execute('SELECT DISTINCT week_start, day FROM schedule_entries'):
            per_week[r['week_start']].add(r['day'])
        for ws, days_used in per_week.items():
            mon = parse_date(ws)
            if not mon or len(days_used) == 0:
                continue
            for i, d in enumerate(DAYS):
                dt = mon + timedelta(days=i)
                if d not in days_used and start <= dt <= today:
                    c.execute('INSERT OR IGNORE INTO no_school_days (day_date,label) VALUES (?,?)',
                              (dt.isoformat(), 'No school (found empty in your schedule)'))

    # Link identical entries across grades in every week.
    for r in c.execute('SELECT DISTINCT week_start FROM schedule_entries').fetchall():
        autolink_week(c, r['week_start'])


# ──────────────────────────────────────────────────────────── calendars ──
def parse_date(s):
    try: return date.fromisoformat((s or '').strip()[:10])
    except Exception: return None

def monday_of(d=None):
    d = d or date.today()
    return (d - timedelta(days=d.weekday())).isoformat()

def parse_week(param):
    d = parse_date(param)
    return monday_of(d) if d else monday_of()

def fmt_week_range(ws):
    mon = date.fromisoformat(ws); fri = mon + timedelta(days=4)
    if mon.month == fri.month:
        return f"{mon.strftime('%b')} {mon.day}–{fri.day}, {mon.year}"
    return f"{mon.strftime('%b')} {mon.day} – {fri.strftime('%b')} {fri.day}, {fri.year}"

def fmt_date_short(d): return d.strftime('%b ') + str(d.day)
def fmt_date_long(d): return d.strftime('%A, %B ') + str(d.day) + d.strftime(', %Y')

def _int(v, default=0):
    try: return int(str(v).strip())
    except Exception: return default

class Calendar:
    """School-day and school-week numbering, skipping days off."""
    def __init__(self, c=None):
        c = c or db()
        self.start = parse_date(setting('school_start_date', c))
        self.off = {r['day_date'] for r in c.execute('SELECT day_date FROM no_school_days')}
        self.day_adj = _int(setting('day_adjust', c))
        self.week_adj = _int(setting('week_adjust', c))

    def is_school_day(self, d):
        return bool(self.start) and d >= self.start and d.weekday() < 5 and d.isoformat() not in self.off

    def day_number(self, d):
        if not self.is_school_day(d):
            return None
        n, cur = 0, self.start
        while cur <= d:
            if self.is_school_day(cur): n += 1
            cur += timedelta(days=1)
        n += self.day_adj
        return n if n > 0 else None

    def week_number(self, monday):
        if not self.start:
            return None
        week_days = [monday + timedelta(days=i) for i in range(5)]
        if not any(self.is_school_day(d) for d in week_days):
            return None
        n, cur = 0, self.start - timedelta(days=self.start.weekday())
        while cur <= monday:
            if any(self.is_school_day(cur + timedelta(days=i)) for i in range(5)): n += 1
            cur += timedelta(days=7)
        n += self.week_adj
        return n if n > 0 else None

def week_info(ws, cal=None):
    cal = cal or Calendar()
    mon = date.fromisoformat(ws)
    today = date.today()
    dates = {DAYS[i]: mon + timedelta(days=i) for i in range(5)}
    return dict(
        week_num=cal.week_number(mon),
        day_num=cal.day_number(today),
        today_str=fmt_date_long(today),
        week_dates={d: fmt_date_short(v) for d, v in dates.items()},
        week_iso={d: v.isoformat() for d, v in dates.items()},
        week_school_days={d: n for d, v in dates.items() if (n := cal.day_number(v))},
        off_days={d: v.isoformat() in cal.off for d, v in dates.items()},
    )


# ──────────────────────────────────────────────────────── lesson numbers ──
# Lessons look like "Lesson 12 ~ Adding Fractions", "3.4 ~ Factoring",
# "Worksheet 8 ~ ...", "Group F", "Lesson 3". The part before "~" holds the
# number; the part after is the lesson name.
HEAD_NUM = re.compile(r'^(?P<pre>\D*?)(?P<num>\d+(?:\.\d+)?)(?P<post>.*)$')
HEAD_LET = re.compile(r'^(?P<pre>.*\s)(?P<num>[A-Z])$')

def split_lesson(text):
    text = text or ''
    i = text.find('~')
    if i >= 0:
        return text[:i].strip(), text[i + 1:].strip(), True
    return text.strip(), '', False

def parse_lesson(text):
    """-> dict(pre, post, kind, val, sep, title) or None."""
    head, title, sep = split_lesson(text)
    if not head:
        return None
    m = HEAD_NUM.match(head)
    if m:
        num = m.group('num')
        if '.' in num:
            a, b = num.split('.')
            kind, val = 'dot', (int(a), int(b))
        else:
            kind, val = 'int', int(num)
        return dict(pre=m.group('pre'), post=m.group('post'), kind=kind, val=val, sep=sep, title=title)
    m = HEAD_LET.match(head)
    if m:
        return dict(pre=m.group('pre'), post='', kind='let', val=ord(m.group('num')), sep=sep, title=title)
    return None

def _fmt_val(kind, val):
    if kind == 'dot': return f'{val[0]}.{val[1]}'
    if kind == 'let': return chr(max(65, min(90, val)))
    return str(val)

def _step(kind, a, b):
    """How far the source moved from a to b (0 = same lesson repeated)."""
    if kind == 'dot':
        if a[0] != b[0]: return 1
        d = b[1] - a[1]
    else:
        d = b - a
    return d if 0 <= d <= 3 else 1

def _add(kind, v, n):
    if kind == 'dot': return (v[0], v[1] + n)
    return v + n

def lesson_text_for(p, kind, val, keep_title=False):
    head = f"{p['pre']}{_fmt_val(kind, val)}{p['post']}"
    if p['sep']:
        return f"{head} ~ {p['title']}" if keep_title and p['title'] else f"{head} ~ "
    return head

def advance_track(texts):
    """Given one subject's lesson texts for a week (in day order), return the
    texts for the following week: numbers continue, lesson names left blank.
    Subjects without numbers are copied unchanged."""
    parsed = [parse_lesson(t) for t in texts]
    tmpl_count = Counter((p['pre'], p['post'], p['kind']) for p in parsed if p)
    if not tmpl_count:
        return list(texts)
    tmpl = tmpl_count.most_common(1)[0][0]
    numbered = [p if p and (p['pre'], p['post'], p['kind']) == tmpl else None for p in parsed]
    vals = [p['val'] for p in numbered if p]
    # Same number every day (e.g. a workbook "1205" used all week) → keep it.
    if len(vals) >= 3 and all(v == vals[0] for v in vals):
        return list(texts)
    kind = tmpl[2]
    model = dict(pre=tmpl[0], post=tmpl[1], sep=any(p and p['sep'] for p in parsed), title='')
    out, cur, prev = [], None, None
    for p in numbered:
        if cur is None:
            cur = _add(kind, vals[-1], 1)
        else:
            cur = _add(kind, cur, _step(kind, prev, p['val']) if (p and prev is not None) else 1)
        prev = p['val'] if p else None
        out.append(lesson_text_for(model, kind, cur))
    return out

def advance_weekly_text(text):
    """Weekly items only move a 'Lesson N' / 'Unit N' / 'Week N' number."""
    def bump(m):
        return f"{m.group(1)}{int(m.group(2)) + 1}"
    return re.sub(r'\b((?:Lesson|Unit|Week)\s+)(\d+)\b', bump, text or '', count=1)

def needs_name(text):
    return bool(re.search(r'~\s*$', text or ''))

def print_lesson(text):
    """Hide an unfinished ' ~ ' at the end so a blank name never prints."""
    return re.sub(r'\s*~\s*$', '', text or '')


# ─────────────────────────────────────────────────────────── entry logic ──
def entry_dict(r, excl_map):
    d = dict(r)
    d['excluded'] = sorted(excl_map.get(d['id'], []))
    return d

def week_entries(ws):
    ents = rows('SELECT * FROM schedule_entries WHERE week_start=? ORDER BY sort_order,id', (ws,))
    ids = [e['id'] for e in ents]
    excl = defaultdict(list)
    if ids:
        q = ','.join('?' * len(ids))
        for r in db().execute(f'SELECT entry_id,student_id FROM entry_exclusions WHERE entry_id IN ({q})', ids):
            excl[r['entry_id']].append(r['student_id'])
    return [entry_dict(e, excl) for e in ents]

def get_entry(eid):
    e = one('SELECT * FROM schedule_entries WHERE id=?', (eid,))
    if not e:
        abort(404)
    e['excluded'] = [r['student_id'] for r in
                     db().execute('SELECT student_id FROM entry_exclusions WHERE entry_id=?', (eid,))]
    return e

def entries_by_ids(ids):
    out = []
    for i in dict.fromkeys(ids):
        e = one('SELECT * FROM schedule_entries WHERE id=?', (i,))
        if e:
            e['excluded'] = [r['student_id'] for r in
                             db().execute('SELECT student_id FROM entry_exclusions WHERE entry_id=?', (i,))]
            out.append(e)
    return out

def free_slot(grade_id, ws, day, preferred):
    used = {r['sort_order'] for r in db().execute(
        'SELECT sort_order FROM schedule_entries WHERE grade_id=? AND week_start=? AND day=?',
        (grade_id, ws, day))}
    if preferred is not None and preferred not in used:
        return preferred
    return (max(used) + 1) if used else 0

def slot_taken(grade_id, ws, day, slot, exclude_id=None):
    r = db().execute('SELECT id FROM schedule_entries WHERE grade_id=? AND week_start=? AND day=? AND sort_order=?'
                     + (' AND id<>?' if exclude_id else ''),
                     (grade_id, ws, day, slot) + ((exclude_id,) if exclude_id else ())).fetchone()
    return r['id'] if r else None

def insert_entry(grade_id, ws, day, slot, subject, lesson, student_id=None, link_id=None):
    return db().execute(
        'INSERT INTO schedule_entries (grade_id,week_start,day,subject,lesson_text,sort_order,student_id,link_id) '
        'VALUES (?,?,?,?,?,?,?,?)', (grade_id, ws, day, subject, lesson, slot, student_id, link_id)).lastrowid

def set_exclusions(eid, student_ids):
    db().execute('DELETE FROM entry_exclusions WHERE entry_id=?', (eid,))
    for s in student_ids or []:
        db().execute('INSERT OR IGNORE INTO entry_exclusions (entry_id,student_id) VALUES (?,?)', (eid, int(s)))

def link_members(link_id, exclude_id=None):
    if not link_id:
        return []
    return rows('SELECT * FROM schedule_entries WHERE link_id=?' + (' AND id<>?' if exclude_id else ''),
                (link_id,) + ((exclude_id,) if exclude_id else ()))

def tidy_link(link_id):
    """A link with only one member left is no link at all."""
    if link_id and len(link_members(link_id)) < 2:
        db().execute('UPDATE schedule_entries SET link_id=NULL WHERE link_id=?', (link_id,))

def autolink_week(c, ws):
    """Link class-wide entries that are identical (same day, subject and
    lesson) across two or more grades. Blank lessons are never linked, since
    two empty "English" cells are usually different courses."""
    groups = defaultdict(list)
    for r in c.execute("SELECT id,grade_id,day,subject,lesson_text,link_id FROM schedule_entries "
                       "WHERE week_start=? AND student_id IS NULL AND TRIM(lesson_text)<>'' "
                       "ORDER BY sort_order,id", (ws,)):
        if needs_name(r['lesson_text']):
            continue                      # "Lesson 42 ~ " in two grades is not the same lesson
        key = (r['day'], r['subject'].strip().lower(), (r['lesson_text'] or '').strip())
        groups[key].append(dict(r))
    made = 0
    for members in groups.values():
        by_grade = {}
        for m in members:
            by_grade.setdefault(m['grade_id'], m)
        ms = list(by_grade.values())
        if len(ms) < 2:
            continue
        existing = {m['link_id'] for m in ms if m['link_id']}
        if len(existing) > 1:
            continue
        lid = existing.pop() if existing else new_link()
        for m in ms:
            if not m['link_id']:
                c.execute('UPDATE schedule_entries SET link_id=? WHERE id=?', (lid, m['id']))
                made += 1
    return made


# ───────────────────────────────────────────────────────────── page data ──
def base_data(ws):
    s = all_settings()
    grades = rows('SELECT * FROM grades ORDER BY sort_order,id')
    students = rows('SELECT * FROM students WHERE active=1 ORDER BY sort_order,name')
    return s, grades, students

def keyword_matcher(s):
    kws = [k.strip().lower() for k in (s.get('test_highlight_keywords') or '').split(',') if k.strip()]
    pats = [re.compile(r'\b' + re.escape(k) + r'\b') for k in kws]
    return lambda subj, les: any(p.search(f'{subj} {les}'.lower()) for p in pats)

def history_weeks():
    cur = monday_of()
    return [dict(week_start=r['week_start'], label=fmt_week_range(r['week_start']),
                 count=r['cnt'], is_current=r['week_start'] == cur)
            for r in db().execute("SELECT week_start, COUNT(*) cnt FROM schedule_entries "
                                  "WHERE week_start<>'' GROUP BY week_start ORDER BY week_start DESC")]

def weekly_for(ws):
    items = rows('SELECT * FROM weekly_items WHERE week_start=? ORDER BY sort_order,id', (ws,))
    gmap = defaultdict(list)
    if items:
        q = ','.join('?' * len(items))
        for r in db().execute(f'SELECT * FROM weekly_item_grades WHERE item_id IN ({q})', [i['id'] for i in items]):
            gmap[r['item_id']].append(r['grade_id'])
    for i in items:
        i['grade_ids'] = gmap.get(i['id'], [])
    return items

def notes_for(ws):
    return {r['day']: r['note_text'] for r in db().execute(
        'SELECT day,note_text FROM week_notes WHERE week_start=?', (ws,))}

def previous_week_with_entries(ws):
    r = db().execute('SELECT MAX(week_start) m FROM schedule_entries WHERE week_start<?', (ws,)).fetchone()
    return r['m'] if r and r['m'] else None


# ──────────────────────────────────────────────────────────────── pages ──
@app.route('/__scheduler')
def whoami():
    return 'weekly-assignment-scheduler', 200, {'Content-Type': 'text/plain'}


@app.route('/')
def index():
    return render_template('app.html')

@app.route('/api/state')
def api_state():
    ws = parse_week(request.args.get('week'))
    s, grades, students = base_data(ws)
    cal = Calendar()
    info = week_info(ws, cal)
    cur = monday_of()
    prev_ws = (date.fromisoformat(ws) - timedelta(days=7)).isoformat()
    next_ws = (date.fromisoformat(ws) + timedelta(days=7)).isoformat()
    src = previous_week_with_entries(ws)
    all_ids = {r['id'] for r in db().execute('SELECT id FROM students')}
    orphans = db().execute('SELECT COUNT(*) n FROM schedule_entries WHERE student_id IS NOT NULL '
                           'AND student_id NOT IN (SELECT id FROM students)').fetchone()['n']
    orphans += db().execute('SELECT COUNT(*) n FROM entry_exclusions WHERE student_id NOT IN (SELECT id FROM students) '
                            'OR entry_id NOT IN (SELECT id FROM schedule_entries)').fetchone()['n']
    return jsonify(
        week=ws, week_label=fmt_week_range(ws), prev_week=prev_ws, next_week=next_ws,
        current_week=cur, is_current_week=ws == cur,
        source_week=src, source_label=fmt_week_range(src) if src else None,
        prev_has_weekly=bool(one('SELECT 1 x FROM weekly_items WHERE week_start<? LIMIT 1', (ws,))),
        days=DAYS, **info,
        grades=grades, students=students, all_student_ids=sorted(all_ids),
        entries=week_entries(ws), weekly=weekly_for(ws), notes=notes_for(ws),
        settings=s, history=history_weeks(),
        no_school=rows('SELECT * FROM no_school_days ORDER BY day_date'),
        leftovers=orphans,
    )


# ─────────────────────────────────────────────────────────── entry API ──
def _body():
    return request.get_json(silent=True) or {}

@app.post('/api/entries')
def api_create_entry():
    b = _body()
    ws = parse_week(b.get('week'))
    gid = int(b['grade_id']); day = b['day']
    if day not in DAY_IDX:
        abort(400)
    subject = (b.get('subject') or '').strip() or 'Untitled'
    lesson = b.get('lesson_text') or ''
    sid = b.get('student_id') or None
    slot = b.get('sort_order')
    slot = int(slot) if slot is not None and not slot_taken(gid, ws, day, int(slot)) else free_slot(gid, ws, day, None)
    link_id = b.get('link_id') or None
    eid = insert_entry(gid, ws, day, slot, subject, lesson, sid, link_id)
    if not sid and b.get('excluded'):
        set_exclusions(eid, b['excluded'])
    db().commit()
    return jsonify(changed=entries_by_ids([eid]))

@app.patch('/api/entries/<int:eid>')
def api_update_entry(eid):
    b = _body()
    e = get_entry(eid)
    changed = [eid]
    sets, args = [], []
    for f in ('subject', 'lesson_text'):
        if f in b:
            v = b[f] if f == 'lesson_text' else (b[f] or '').strip() or e['subject']
            sets.append(f'{f}=?'); args.append(v)
    link_id = e['link_id']
    if 'student_id' in b:
        sid = b['student_id'] or None
        sets.append('student_id=?'); args.append(sid)
        if sid:
            set_exclusions(eid, [])
            if link_id:                       # a personal version can't stay linked
                sets.append('link_id=NULL')
    if sets:
        db().execute(f'UPDATE schedule_entries SET {", ".join(sets)} WHERE id=?', args + [eid])
    eff_sid = (b.get('student_id') or None) if 'student_id' in b else e['student_id']
    if 'excluded' in b and not eff_sid:
        set_exclusions(eid, b['excluded'])
    # keep linked grades in step
    if link_id and ('subject' in b or 'lesson_text' in b) and not ('student_id' in b and b['student_id']):
        cur = one('SELECT subject, lesson_text FROM schedule_entries WHERE id=?', (eid,))
        for m in link_members(link_id, eid):
            db().execute('UPDATE schedule_entries SET subject=?, lesson_text=? WHERE id=?',
                         (cur['subject'], cur['lesson_text'], m['id']))
            changed.append(m['id'])
    if 'student_id' in b and b['student_id'] and link_id:
        changed += [m['id'] for m in link_members(link_id)]
        tidy_link(link_id)
    db().commit()
    return jsonify(changed=entries_by_ids(changed))

@app.delete('/api/entries/<int:eid>')
def api_delete_entry(eid):
    e = get_entry(eid)
    ids = [eid]
    if request.args.get('linked') == '1' and e['link_id']:
        ids += [m['id'] for m in link_members(e['link_id'], eid)]
    for i in ids:
        db().execute('DELETE FROM schedule_entries WHERE id=?', (i,))
        db().execute('DELETE FROM entry_exclusions WHERE entry_id=?', (i,))
    # (the link id is left on any remaining partner so Undo can re-join them)
    db().commit()
    return jsonify(deleted=ids, changed=entries_by_ids([m['id'] for m in link_members(e['link_id'])]))

@app.post('/api/entries/<int:eid>/move')
def api_move_entry(eid):
    """Drag & drop: move to an empty cell, or swap with whatever is there."""
    b = _body()
    e = get_entry(eid)
    gid, day, slot = int(b['grade_id']), b['day'], int(b['sort_order'])
    other = slot_taken(gid, e['week_start'], day, slot, eid)
    changed = [eid]

    def place(entry, ngid, nday, nslot):
        db().execute('UPDATE schedule_entries SET grade_id=?, day=?, sort_order=? WHERE id=?',
                     (ngid, nday, nslot, entry['id']))
        if ngid != entry['grade_id']:     # new grade: personal settings & links don't carry over
            db().execute('UPDATE schedule_entries SET student_id=NULL, link_id=NULL WHERE id=?', (entry['id'],))
            set_exclusions(entry['id'], [])
            if entry['link_id']:
                changed.extend(m['id'] for m in link_members(entry['link_id']))
                tidy_link(entry['link_id'])

    if other:
        o = get_entry(other)
        place(o, e['grade_id'], e['day'], e['sort_order'])
        changed.append(other)
    place(e, gid, day, slot)
    db().commit()
    return jsonify(changed=entries_by_ids(changed))

@app.post('/api/entries/<int:eid>/copy')
def api_copy_entry(eid):
    """Copy (linked or not) into other grades, same day and row if that row is free."""
    b = _body()
    e = get_entry(eid)
    link = bool(b.get('link', True))
    targets = [int(x) for x in b.get('grade_ids', []) if int(x) != e['grade_id']]
    changed = [eid]
    lid = e['link_id']
    if link and targets and not lid and not e['student_id']:
        lid = new_link()
        db().execute('UPDATE schedule_entries SET link_id=? WHERE id=?', (lid, eid))
    have = {m['grade_id'] for m in link_members(lid)} if (link and lid) else set()
    for t in targets:
        if t in have:
            continue
        slot = free_slot(t, e['week_start'], e['day'], e['sort_order'])
        nid = insert_entry(t, e['week_start'], e['day'], slot, e['subject'], e['lesson_text'],
                           None, lid if (link and not e['student_id']) else None)
        changed.append(nid)
    db().commit()
    return jsonify(changed=entries_by_ids(changed))

@app.post('/api/entries/<int:eid>/link')
def api_link_entry(eid):
    """Link this entry with an existing entry in another grade (that one takes this text)."""
    b = _body()
    e = get_entry(eid)
    o = get_entry(int(b['other_id']))
    if e['student_id'] or o['student_id']:
        abort(400)
    lid = e['link_id'] or new_link()
    old = o['link_id']
    db().execute('UPDATE schedule_entries SET link_id=? WHERE id=?', (lid, eid))
    db().execute('UPDATE schedule_entries SET link_id=?, subject=?, lesson_text=? WHERE id=?',
                 (lid, e['subject'], e['lesson_text'], o['id']))
    if old and old != lid:
        tidy_link(old)
    db().commit()
    return jsonify(changed=entries_by_ids([eid, o['id']] + [m['id'] for m in link_members(lid)]))

@app.post('/api/entries/<int:eid>/unlink')
def api_unlink_entry(eid):
    e = get_entry(eid)
    lid = e['link_id']
    members = [m['id'] for m in link_members(lid)]
    db().execute('UPDATE schedule_entries SET link_id=NULL WHERE id=?', (eid,))
    tidy_link(lid)
    db().commit()
    return jsonify(changed=entries_by_ids([eid] + members))

@app.post('/api/entries/<int:eid>/fill-week')
def api_fill_week(eid):
    """Continue this lesson across the rest of the week in the same row
    (skipping days off and cells that already have something)."""
    e = get_entry(eid)
    p = parse_lesson(e['lesson_text'])
    cal = Calendar()
    mon = date.fromisoformat(e['week_start'])
    sibling_grades = [m['grade_id'] for m in link_members(e['link_id'], eid)] if e['link_id'] else []
    changed = []
    cur = p['val'] if p else None
    for day in DAYS[DAY_IDX[e['day']] + 1:]:
        dt = mon + timedelta(days=DAY_IDX[day])
        if cal.start and not cal.is_school_day(dt):
            continue
        taken = slot_taken(e['grade_id'], e['week_start'], day, e['sort_order'])
        if taken:                              # keep counting from what's already there
            t = one('SELECT subject, lesson_text FROM schedule_entries WHERE id=?', (taken,))
            tp = parse_lesson(t['lesson_text'])
            if p and tp and t['subject'].strip().lower() == e['subject'].strip().lower() and tp['kind'] == p['kind']:
                cur = tp['val']
            continue
        if p:
            cur = _add(p['kind'], cur, 1)
        text = lesson_text_for(p, p['kind'], cur) if p else ''
        lid = new_link() if sibling_grades else None
        changed.append(insert_entry(e['grade_id'], e['week_start'], day, e['sort_order'],
                                    e['subject'], text, e['student_id'], lid))
        for sg in sibling_grades:
            slot = free_slot(sg, e['week_start'], day, e['sort_order'])
            changed.append(insert_entry(sg, e['week_start'], day, slot, e['subject'], text, None, lid))
    db().commit()
    return jsonify(changed=entries_by_ids(changed))


# ─────────────────────────────────────────────────────────────── rows ──
@app.post('/api/rows')
def api_rows():
    """Row tools for one grade's grid: insert a blank row, delete a row,
    or swap two rows (all five days at once)."""
    b = _body()
    ws = parse_week(b.get('week'))
    gid = int(b['grade_id']); action = b['action']; at = int(b['at'])
    c = db()
    if action == 'insert':
        c.execute('UPDATE schedule_entries SET sort_order=sort_order+1 WHERE grade_id=? AND week_start=? AND sort_order>=?',
                  (gid, ws, at))
    elif action == 'delete':
        ids = [r['id'] for r in c.execute('SELECT id FROM schedule_entries WHERE grade_id=? AND week_start=? AND sort_order=?',
                                          (gid, ws, at))]
        links = {r['link_id'] for r in c.execute(
            'SELECT link_id FROM schedule_entries WHERE grade_id=? AND week_start=? AND sort_order=? AND link_id IS NOT NULL',
            (gid, ws, at))}
        for i in ids:
            c.execute('DELETE FROM schedule_entries WHERE id=?', (i,))
            c.execute('DELETE FROM entry_exclusions WHERE entry_id=?', (i,))
        for l in links:
            tidy_link(l)
        c.execute('UPDATE schedule_entries SET sort_order=sort_order-1 WHERE grade_id=? AND week_start=? AND sort_order>?',
                  (gid, ws, at))
    elif action == 'swap':
        to = int(b['to'])
        c.execute('UPDATE schedule_entries SET sort_order=-999 WHERE grade_id=? AND week_start=? AND sort_order=?', (gid, ws, at))
        c.execute('UPDATE schedule_entries SET sort_order=? WHERE grade_id=? AND week_start=? AND sort_order=?', (at, gid, ws, to))
        c.execute('UPDATE schedule_entries SET sort_order=? WHERE grade_id=? AND week_start=? AND sort_order=-999', (to, gid, ws))
    elif action == 'compact':
        for day in DAYS:
            ids = [r['id'] for r in c.execute('SELECT id FROM schedule_entries WHERE grade_id=? AND week_start=? AND day=? '
                                              'ORDER BY sort_order,id', (gid, ws, day))]
            for i, x in enumerate(ids):
                c.execute('UPDATE schedule_entries SET sort_order=? WHERE id=?', (i, x))
    else:
        abort(400)
    c.commit()
    return jsonify(entries=week_entries(ws))


# ─────────────────────────────────────────────────────── week actions ──
@app.post('/api/week/start')
def api_start_week():
    """Build this week from an earlier one.
    mode 'advance' moves lesson numbers on and leaves names blank,
    mode 'copy' copies everything exactly.
    Only cells that are missing are added; nothing already typed is touched."""
    b = _body()
    ws = parse_week(b.get('week'))
    src = parse_week(b.get('source'))
    advance = b.get('mode', 'advance') == 'advance'
    parts = set(b.get('parts') or ['schedule', 'weekly', 'notes'])
    c = db()
    cal = Calendar()
    mon = date.fromisoformat(ws)
    student_ids = {r['id'] for r in c.execute('SELECT id FROM students')}
    grade_ids = {r['id'] for r in c.execute('SELECT id FROM grades')}
    added = 0

    if 'schedule' in parts:
        src_entries = week_entries(src)
        src_entries = [e for e in src_entries if e['grade_id'] in grade_ids
                       and (not e['student_id'] or e['student_id'] in student_ids)]
        src_entries.sort(key=lambda e: (DAY_IDX.get(e['day'], 9), e['sort_order'], e['id']))
        # number each subject's lessons as one continuing track
        tracks = defaultdict(list)
        for e in src_entries:
            tracks[(e['grade_id'], e['subject'].strip().lower(), e['student_id'])].append(e)
        new_text = {}
        for members in tracks.values():
            texts = advance_track([m['lesson_text'] for m in members]) if advance else [m['lesson_text'] for m in members]
            for m, t in zip(members, texts):
                new_text[m['id']] = t
        # linked entries must stay identical
        by_link = defaultdict(list)
        for e in src_entries:
            if e['link_id']:
                by_link[e['link_id']].append(e)
        for members in by_link.values():
            t = new_text[members[0]['id']]
            for m in members:
                new_text[m['id']] = t
        existing = {(r['grade_id'], r['day'], r['subject'].strip().lower(), r['student_id'])
                    for r in c.execute('SELECT * FROM schedule_entries WHERE week_start=?', (ws,))}
        link_map = {}
        for e in src_entries:
            dt = mon + timedelta(days=DAY_IDX[e['day']])
            if cal.start and dt.isoformat() in cal.off:
                continue
            key = (e['grade_id'], e['day'], e['subject'].strip().lower(), e['student_id'])
            if key in existing:
                continue
            lid = None
            if e['link_id']:
                lid = link_map.setdefault(e['link_id'], new_link())
            slot = free_slot(e['grade_id'], ws, e['day'], e['sort_order'])
            nid = insert_entry(e['grade_id'], ws, e['day'], slot, e['subject'], new_text[e['id']], e['student_id'], lid)
            if not e['student_id']:
                set_exclusions(nid, [s for s in e['excluded'] if s in student_ids])
            existing.add(key)
            added += 1
        for l in link_map.values():
            tidy_link(l)

    if 'weekly' in parts and not c.execute('SELECT 1 FROM weekly_items WHERE week_start=?', (ws,)).fetchone():
        wsrc = c.execute('SELECT MAX(week_start) m FROM weekly_items WHERE week_start<=? AND week_start<>?', (src, ws)).fetchone()['m'] \
            or c.execute('SELECT MAX(week_start) m FROM weekly_items WHERE week_start<?', (ws,)).fetchone()['m']
        if wsrc:
            for i, w in enumerate(weekly_for(wsrc)):
                nid = c.execute('INSERT INTO weekly_items (week_start,subject,description,sort_order) VALUES (?,?,?,?)',
                                (ws, w['subject'], advance_weekly_text(w['description']) if advance else w['description'], i)).lastrowid
                for gid in w['grade_ids']:
                    c.execute('INSERT OR IGNORE INTO weekly_item_grades VALUES (?,?)', (nid, gid))

    if 'notes' in parts and not any((v or '').strip() for v in notes_for(ws).values()):
        nsrc = c.execute("SELECT MAX(week_start) m FROM week_notes WHERE week_start<? AND TRIM(note_text)<>''", (ws,)).fetchone()['m']
        if nsrc:
            for d, t in notes_for(nsrc).items():
                c.execute('INSERT OR REPLACE INTO week_notes (week_start,day,note_text) VALUES (?,?,?)', (ws, d, t))
    c.commit()
    return jsonify(added=added)

@app.post('/api/week/clear')
def api_clear_week():
    b = _body()
    ws = parse_week(b.get('week'))
    gid = b.get('grade_id')
    c = db()
    q, a = 'SELECT id FROM schedule_entries WHERE week_start=?', [ws]
    if gid:
        q += ' AND grade_id=?'; a.append(int(gid))
    ids = [r['id'] for r in c.execute(q, a)]
    for i in ids:
        c.execute('DELETE FROM entry_exclusions WHERE entry_id=?', (i,))
        c.execute('DELETE FROM schedule_entries WHERE id=?', (i,))
    for r in c.execute('SELECT DISTINCT link_id FROM schedule_entries WHERE week_start=? AND link_id IS NOT NULL', (ws,)).fetchall():
        tidy_link(r['link_id'])
    c.commit()
    return jsonify(deleted=len(ids))

@app.post('/api/week/autolink')
def api_autolink():
    ws = parse_week(_body().get('week'))
    n = autolink_week(db(), ws)
    db().commit()
    return jsonify(linked=n)


# ───────────────────────────────────────────────────── weekly & notes ──
@app.post('/api/weekly')
def api_weekly_create():
    b = _body()
    ws = parse_week(b.get('week'))
    n = db().execute('SELECT COUNT(*) n FROM weekly_items WHERE week_start=?', (ws,)).fetchone()['n']
    wid = db().execute('INSERT INTO weekly_items (week_start,subject,description,sort_order) VALUES (?,?,?,?)',
                       (ws, (b.get('subject') or '').strip() or 'Untitled', b.get('description') or '', n)).lastrowid
    for gid in b.get('grade_ids', []):
        db().execute('INSERT OR IGNORE INTO weekly_item_grades VALUES (?,?)', (wid, int(gid)))
    db().commit()
    return jsonify(weekly=weekly_for(ws))

@app.patch('/api/weekly/<int:wid>')
def api_weekly_update(wid):
    b = _body()
    w = one('SELECT * FROM weekly_items WHERE id=?', (wid,)) or abort(404)
    if 'subject' in b:
        db().execute('UPDATE weekly_items SET subject=? WHERE id=?', ((b['subject'] or '').strip() or w['subject'], wid))
    if 'description' in b:
        db().execute('UPDATE weekly_items SET description=? WHERE id=?', (b['description'] or '', wid))
    if 'grade_ids' in b:
        db().execute('DELETE FROM weekly_item_grades WHERE item_id=?', (wid,))
        for gid in b['grade_ids']:
            db().execute('INSERT OR IGNORE INTO weekly_item_grades VALUES (?,?)', (wid, int(gid)))
    if 'move' in b:
        items = [r['id'] for r in db().execute('SELECT id FROM weekly_items WHERE week_start=? ORDER BY sort_order,id', (w['week_start'],))]
        i = items.index(wid); j = i + int(b['move'])
        if 0 <= j < len(items):
            items[i], items[j] = items[j], items[i]
        for k, x in enumerate(items):
            db().execute('UPDATE weekly_items SET sort_order=? WHERE id=?', (k, x))
    db().commit()
    return jsonify(weekly=weekly_for(w['week_start']))

@app.delete('/api/weekly/<int:wid>')
def api_weekly_delete(wid):
    w = one('SELECT * FROM weekly_items WHERE id=?', (wid,)) or abort(404)
    db().execute('DELETE FROM weekly_items WHERE id=?', (wid,))
    db().execute('DELETE FROM weekly_item_grades WHERE item_id=?', (wid,))
    db().commit()
    return jsonify(weekly=weekly_for(w['week_start']))

@app.put('/api/notes')
def api_notes():
    b = _body()
    ws = parse_week(b.get('week'))
    day = b.get('day')
    if day not in DAY_IDX:
        abort(400)
    db().execute('INSERT OR REPLACE INTO week_notes (week_start,day,note_text) VALUES (?,?,?)',
                 (ws, day, b.get('text') or ''))
    db().commit()
    return jsonify(ok=True)


# ──────────────────────────────────────────── grades, students, settings ──
@app.post('/api/grades')
def api_grade_create():
    b = _body()
    name = (b.get('name') or '').strip()
    if not name:
        abort(400)
    n = db().execute('SELECT COALESCE(MAX(sort_order),-1)+1 n FROM grades').fetchone()['n']
    db().execute('INSERT INTO grades (name,color,sort_order) VALUES (?,?,?)', (name, b.get('color') or '#1e3054', n))
    db().commit()
    return jsonify(ok=True)

@app.patch('/api/grades/<int:gid>')
def api_grade_update(gid):
    b = _body()
    if b.get('name', '').strip():
        db().execute('UPDATE grades SET name=? WHERE id=?', (b['name'].strip(), gid))
    if b.get('color'):
        db().execute('UPDATE grades SET color=? WHERE id=?', (b['color'], gid))
    if 'move' in b:
        ids = [r['id'] for r in db().execute('SELECT id FROM grades ORDER BY sort_order,id')]
        i = ids.index(gid); j = i + int(b['move'])
        if 0 <= j < len(ids):
            ids[i], ids[j] = ids[j], ids[i]
        for k, x in enumerate(ids):
            db().execute('UPDATE grades SET sort_order=? WHERE id=?', (k, x))
    db().commit()
    return jsonify(ok=True)

@app.delete('/api/grades/<int:gid>')
def api_grade_delete(gid):
    c = db()
    ids = [r['id'] for r in c.execute('SELECT id FROM schedule_entries WHERE grade_id=?', (gid,))]
    links = {r['link_id'] for r in c.execute('SELECT DISTINCT link_id FROM schedule_entries WHERE grade_id=? AND link_id IS NOT NULL', (gid,))}
    for i in ids:
        c.execute('DELETE FROM entry_exclusions WHERE entry_id=?', (i,))
    sids = [r['id'] for r in c.execute('SELECT id FROM students WHERE grade_id=?', (gid,))]
    for s in sids:
        c.execute('DELETE FROM entry_exclusions WHERE student_id=?', (s,))
    for t, col in [('schedule_entries', 'grade_id'), ('year_template', 'grade_id'),
                   ('weekly_assignment_grades', 'grade_id'), ('weekly_item_grades', 'grade_id'),
                   ('students', 'grade_id'), ('grades', 'id')]:
        c.execute(f'DELETE FROM {t} WHERE {col}=?', (gid,))
    for l in links:
        tidy_link(l)
    c.commit()
    return jsonify(ok=True)

@app.post('/api/students')
def api_student_create():
    b = _body()
    name = (b.get('name') or '').strip()
    if not name or not b.get('grade_id'):
        abort(400)
    gid = int(b['grade_id'])
    n = db().execute('SELECT COALESCE(MAX(sort_order),-1)+1 n FROM students WHERE grade_id=?', (gid,)).fetchone()['n']
    db().execute('INSERT INTO students (name,grade_id,sort_order) VALUES (?,?,?)', (name, gid, n))
    db().commit()
    return jsonify(ok=True)

@app.patch('/api/students/<int:sid>')
def api_student_update(sid):
    b = _body()
    s = one('SELECT * FROM students WHERE id=?', (sid,)) or abort(404)
    if b.get('name', '').strip():
        db().execute('UPDATE students SET name=? WHERE id=?', (b['name'].strip(), sid))
    if b.get('grade_id') and int(b['grade_id']) != s['grade_id']:
        n = db().execute('SELECT COALESCE(MAX(sort_order),-1)+1 n FROM students WHERE grade_id=?', (int(b['grade_id']),)).fetchone()['n']
        db().execute('UPDATE students SET grade_id=?, sort_order=? WHERE id=?', (int(b['grade_id']), n, sid))
    if 'move' in b:
        ids = [r['id'] for r in db().execute('SELECT id FROM students WHERE grade_id=? ORDER BY sort_order,name', (s['grade_id'],))]
        i = ids.index(sid); j = i + int(b['move'])
        if 0 <= j < len(ids):
            ids[i], ids[j] = ids[j], ids[i]
        for k, x in enumerate(ids):
            db().execute('UPDATE students SET sort_order=? WHERE id=?', (k, x))
    db().commit()
    return jsonify(ok=True)

@app.delete('/api/students/<int:sid>')
def api_student_delete(sid):
    c = db()
    c.execute('DELETE FROM entry_exclusions WHERE student_id=?', (sid,))
    c.execute('DELETE FROM entry_exclusions WHERE entry_id IN (SELECT id FROM schedule_entries WHERE student_id=?)', (sid,))
    c.execute('DELETE FROM schedule_entries WHERE student_id=?', (sid,))
    c.execute('DELETE FROM students WHERE id=?', (sid,))
    c.commit()
    return jsonify(ok=True)

@app.post('/api/cleanup')
def api_cleanup():
    """Remove 'only for' entries and 'leave out' marks for students that no longer exist."""
    c = db()
    n = c.execute('DELETE FROM entry_exclusions WHERE student_id NOT IN (SELECT id FROM students) '
                  'OR entry_id NOT IN (SELECT id FROM schedule_entries)').rowcount
    n += c.execute('DELETE FROM schedule_entries WHERE student_id IS NOT NULL '
                   'AND student_id NOT IN (SELECT id FROM students)').rowcount
    c.commit()
    return jsonify(removed=n)

@app.put('/api/settings')
def api_settings():
    b = _body()
    for k, v in b.items():
        if k in EDITABLE_SETTINGS:
            db().execute('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', (k, str(v)))
    db().commit()
    return jsonify(settings=all_settings())

@app.post('/api/noschool')
def api_noschool_add():
    b = _body()
    a = parse_date(b.get('from')); z = parse_date(b.get('to')) or a
    if not a:
        abort(400)
    if z < a:
        a, z = z, a
    label = (b.get('label') or '').strip()
    cur = a
    while cur <= z:
        if cur.weekday() < 5:
            db().execute('INSERT OR REPLACE INTO no_school_days (day_date,label) VALUES (?,?)', (cur.isoformat(), label))
        cur += timedelta(days=1)
    db().commit()
    return jsonify(ok=True)

@app.delete('/api/noschool/<day_date>')
def api_noschool_delete(day_date):
    db().execute('DELETE FROM no_school_days WHERE day_date=?', (day_date,))
    db().commit()
    return jsonify(ok=True)


# ─────────────────────────────────────────────────────────────── prints ──
def print_context(ws):
    """Everything the (unchanged) print templates expect."""
    s, grades, students = base_data(ws)
    hl = keyword_matcher(s)
    names = {st['id']: st['name'] for st in students}
    known = {r['id'] for r in db().execute('SELECT id FROM students')}
    grid = {gr['id']: {d: [] for d in DAYS} for gr in grades}
    for e in week_entries(ws):
        if e['grade_id'] not in grid:
            continue
        if e['student_id'] and e['student_id'] not in known:
            continue                          # left over from a removed student
        e['lesson_text'] = print_lesson(e['lesson_text'])
        e['highlighted'] = hl(e['subject'], e['lesson_text'])
        e['student_name'] = names.get(e['student_id']) if e['student_id'] else None
        e['excluded_names'] = [names[i] for i in e['excluded'] if i in names]
        grid[e['grade_id']][e['day']].append(e)
    weekly = weekly_for(ws)
    ctx = dict(grades=grades, students=students, schedule=grid, days=DAYS,
               weekly=weekly, weekly_grades={w['id']: w['grade_ids'] for w in weekly},
               teacher_notes={d: notes_for(ws).get(d, '') for d in DAYS},
               **{k: s.get(k, '') for k in PRINT_KEYS})
    info = week_info(ws)
    ctx.update(week_num=info['week_num'], day_num=info['day_num'], today_str=info['today_str'],
               week_dates=info['week_dates'], week_school_days=info['week_school_days'])
    return ctx

def resolve_for_student(day_entries, student_id):
    """Same rules as before: drop other students' versions and entries this
    student is left out of; their own version replaces the class version of
    the same subject. Order is untouched."""
    mine = {e['subject'].strip().lower() for e in day_entries if e.get('student_id') == student_id}
    out = []
    for e in day_entries:
        sid = e.get('student_id')
        if sid and sid != student_id: continue
        if student_id in e.get('excluded', []): continue
        if not sid and e['subject'].strip().lower() in mine: continue
        out.append(e)
    return out

@app.route('/print/teacher')
def print_teacher():
    return render_template('print_teacher.html', **print_context(parse_week(request.args.get('week'))))

@app.route('/print/student/<int:student_id>')
def print_student(student_id):
    ctx = print_context(parse_week(request.args.get('week')))
    student = one('SELECT * FROM students WHERE id=?', (student_id,))
    if not student:
        return redirect(url_for('index'))
    grade = next((x for x in ctx['grades'] if x['id'] == student['grade_id']), None)
    raw = ctx['schedule'].get(student['grade_id'], {d: [] for d in DAYS})
    return render_template('print_student.html',
        student=student, grade=grade,
        grade_schedule={d: resolve_for_student(raw.get(d, []), student['id']) for d in DAYS},
        grade_weekly=[w for w in ctx['weekly'] if student['grade_id'] in w['grade_ids']],
        days=DAYS, week_num=ctx['week_num'], day_num=ctx['day_num'], today_str=ctx['today_str'],
        week_dates=ctx['week_dates'], week_school_days=ctx['week_school_days'],
        **{k: ctx[k] for k in PRINT_KEYS})

@app.route('/print/bulk')
def print_bulk():
    ctx = print_context(parse_week(request.args.get('week')))
    only_grade = request.args.get('grade', type=int)
    order = {gr['id']: i for i, gr in enumerate(ctx['grades'])}
    studs = sorted(ctx['students'], key=lambda s: (order.get(s['grade_id'], 99), s['name']))
    if only_grade:
        studs = [s for s in studs if s['grade_id'] == only_grade]
    sdata = []
    for s in studs:
        grade = next((x for x in ctx['grades'] if x['id'] == s['grade_id']), None)
        raw = ctx['schedule'].get(s['grade_id'], {d: [] for d in DAYS})
        sdata.append(dict(student=s, grade=grade,
                          schedule={d: resolve_for_student(raw.get(d, []), s['id']) for d in DAYS},
                          weekly=[w for w in ctx['weekly'] if s['grade_id'] in w['grade_ids']]))
    return render_template('print_bulk.html', student_data=sdata, days=DAYS,
        week_num=ctx['week_num'], day_num=ctx['day_num'], today_str=ctx['today_str'],
        week_dates=ctx['week_dates'], week_school_days=ctx['week_school_days'],
        **{k: ctx[k] for k in PRINT_KEYS})


DEFAULT_PORT = 8642          # 5000 is taken by AirPlay on newer Macs


def _already_running(port):
    import urllib.request
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/__scheduler', timeout=1.5) as r:
            return r.read().decode() == 'weekly-assignment-scheduler'
    except Exception:
        return False

def _port_free(host, port):
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind((host, port)); return True
    except OSError:
        return False
    finally:
        s.close()

def _lan_address():
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1)); return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


if __name__ == '__main__':
    import sys, webbrowser, threading
    share = '--share' in sys.argv or os.environ.get('SCHEDULER_SHARE') == '1'
    host = '0.0.0.0' if share else '127.0.0.1'
    first = int(os.environ.get('SCHEDULER_PORT', DEFAULT_PORT))
    open_browser = os.environ.get('SCHEDULER_NO_BROWSER') != '1' and '--no-browser' not in sys.argv

    port = None
    for p in range(first, first + 10):
        if _already_running(p):          # started twice: just show the one that's running
            print(f'The scheduler is already running at http://127.0.0.1:{p}')
            if open_browser:
                webbrowser.open(f'http://127.0.0.1:{p}')
            sys.exit(0)
        if _port_free(host, p):
            port = p
            break
    if port is None:
        sys.exit(f'Ports {first}-{first + 9} are all in use. Close other programs or set SCHEDULER_PORT.')

    make_backup('startup')
    init_db()
    url = f'http://127.0.0.1:{port}'
    print()
    print(f'  Weekly Assignment Scheduler is running:  {url}')
    if share:
        lan = _lan_address()
        if lan:
            print(f'  On a tablet or phone on the same Wi-Fi:  http://{lan}:{port}')
        print('  (Anyone on this network can open it. Leave off --share to keep it to this computer.)')
    print(f'  Your schedule is saved in: {DB}')
    print('  Keep this window open while you use it. Close it (or press Ctrl+C) to stop.')
    print()
    if open_browser:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    import logging, flask.cli
    logging.getLogger('werkzeug').setLevel(logging.ERROR)   # no request log or server banner
    flask.cli.show_server_banner = lambda *args, **kwargs: None
    app.run(host=host, port=port, debug=False)
