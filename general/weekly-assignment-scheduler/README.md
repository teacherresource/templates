# Weekly Assignment Scheduler

Plan each week's assignments for several grades in one grid, then print a schedule sheet for
every student plus a teacher copy. It runs on your own computer: no account and no internet
after the first start, and your schedule never leaves your computer.

Unlike the other templates here it isn't a single page: it's a small program that needs
**Python** (free) installed once. Setup takes about 10 minutes the first time.

## What it does

- **Type the week like a spreadsheet:** one grid per grade, Monday to Friday across and one row per
  period. **Tab** goes to the next day, **Enter** to the next row, and everything saves as you type.
- **Start from last week:** one click copies last week's subjects in the same order and moves the
  lesson numbers forward (Lesson 16 → 17, 3.9 → 3.10, Worksheet 8 → 9). The lesson names are left
  blank (`Lesson 17 ~ `) with the cursor ready, and a counter shows how many still need a name.
- **Linked grades:** when two grades share a subject, link the cells and type it once.
- **⋯ on any cell:** give one student their own version, leave a student out, copy or link to
  other grades, fill the rest of the week, or delete (with Undo). Drag ⠿ to move or swap cells.
- **Day and week numbers** are counted from your first day of school, skipping weekends and the days off you list.
- **Weekly assignments** (spelling list, memory verse…) and **teacher notes** are kept per week.
- **Tests stand out:** anything with "test", "quiz" or "exam" (you choose the words) gets a ⚑.
- **Printing:** a sheet per student with checkboxes, a two-page landscape teacher copy, or one
  grade or one student at a time.

## Setting it up

### 1. Download

Download [this whole collection as a ZIP](https://github.com/teacherresource/templates/archive/refs/heads/main.zip),
open it, and copy the **`general/weekly-assignment-scheduler`** folder somewhere you'll keep it,
such as your **Documents** folder. Your schedule is saved inside this folder, so don't leave it in
Downloads if you tidy that out.

### 2. Install Python and start it

<details open>
<summary><b>Windows 10 / 11</b></summary>

1. Go to <https://www.python.org/downloads/> and click the yellow **Download Python** button.
2. Run the installer. **On the first screen, tick "Add python.exe to PATH"**, then click
   **Install Now**.
3. In the scheduler folder, double-click **`Start Scheduler - Windows.bat`**.
   - If Windows shows "Windows protected your PC", click **More info → Run anyway**.
     It only appears the first time.
   - The first start takes a minute while it sets itself up (it needs the internet this once).
4. Your web browser opens the scheduler. **Keep the black window open** while you use it; close
   it when you're done.

To make it easy to find: right-click the `.bat` file → **Show more options → Send to → Desktop
(create shortcut)**.
</details>

<details open>
<summary><b>Mac</b></summary>

1. Go to <https://www.python.org/downloads/> and click the yellow **Download Python** button.
   Open the downloaded file and click through the installer.
2. In the scheduler folder, **right-click** (or Control-click) **`Start Scheduler - Mac.command`**
   and choose **Open**, then **Open** again. macOS only asks this the first time, because
   the file came from the internet. After that you can just double-click it.
   - The first start takes a minute while it sets itself up (it needs the internet this once).
3. Your web browser opens the scheduler. **Keep the Terminal window open** while you use it;
   close it when you're done.

If double-clicking opens a text editor instead: open **Terminal**, type `bash ` (with a space),
drag the `.command` file into the window, and press Return.
</details>

<details open>
<summary><b>Linux, Raspberry Pi, or a Chromebook with Linux turned on</b></summary>

Python is usually already installed. Open a terminal in the scheduler folder and run:

```bash
sudo apt install python3-venv      # Debian, Ubuntu, Raspberry Pi OS, Mint, Chromebook
./start-scheduler-linux.sh
```

(Fedora: `sudo dnf install python3`.) If you'd rather not download anything, `sudo apt install
python3-flask` works too; the script uses it automatically. Your browser opens the
scheduler. Keep the terminal open; press **Ctrl+C** to stop.
</details>

The address is **http://127.0.0.1:8642**. Bookmark it, but remember it only works while the
scheduler window is open. Double-clicking the launcher when it's already running just opens the
browser again.

### 3. First things to set (Settings tab)

1. **Grades:** add your grade levels (or classes, or children's names for a homeschool).
2. **School calendar:** your first day of school, plus days off (holidays, breaks), so the
   Day numbers come out right.
3. **Printout text:** the title, a subtitle such as your school's name, and the footers.
4. **Students** tab: add students to each grade. Every student gets their own printed sheet.

Then go to the **Schedule** tab and start typing.

## A normal week

1. Click **›** to go to next week, then **Start from …**. The subjects come over and the lesson
   numbers move forward.
2. Type the lesson names. **Next ›** in the yellow bar jumps to the next one that's missing.
3. Fix anything special (a test day, a field trip), then **Print ▾**.

## Your schedule and backups

- Everything is saved in **`scheduler.db`** in the scheduler folder.
- Each time the scheduler starts, a copy is saved in the **`backups`** folder (the last 15 are kept).
  To go back to one, close the scheduler, then copy the backup over `scheduler.db`.
- **Moving to another computer:** copy the whole folder (or just `scheduler.db`) to the other
  computer and set it up there.
- **Updating to a newer version:** download the new folder, then copy your `scheduler.db` (and
  `backups` if you like) into it. Older schedules are upgraded automatically, after a backup.

## Using it from a tablet or phone

Normally only the computer running the scheduler can open it. To let a tablet or phone **on the
same Wi-Fi** open it too, start it with `--share`:

- **Windows:** right-click `Start Scheduler - Windows.bat` → **Edit**, change `app.py` near the
  end to `app.py --share`, and save.
- **Mac:** open `Start Scheduler - Mac.command` in TextEdit and change the last line to
  `exec .venv/bin/python app.py --share`.
- **Linux:** `./start-scheduler-linux.sh --share`

The window then shows an address like `http://192.168.1.20:8642` to type on the tablet. While
sharing is on, **anyone on that Wi-Fi can open and change the schedule**, so only use it on a
network you trust (not a public or large school network).

## If something goes wrong

| Problem | Fix |
| --- | --- |
| "Python is not installed yet" | Install it from python.org (on Windows, tick **Add python.exe to PATH**), then start again. |
| "Setup didn't finish" | Check the internet connection and start again. If it keeps failing, delete the `.venv` folder inside the scheduler folder (on a Mac press Cmd+Shift+. to see it) and try once more. |
| Mac: "can't be opened because it is from an unidentified developer" | Right-click the file → **Open** → **Open**. |
| Linux: "venv module is missing" | `sudo apt install python3-venv` |
| The browser says it can't connect | The scheduler window was closed. Start it again. |
| The page looks out of date after an update | Press **Ctrl+F5** (Mac: **Cmd+Shift+R**). |

## For tinkerers

`app.py` is the whole program: [Flask](https://flask.palletsprojects.com/) with
SQLite, no other libraries. The editor is plain JavaScript in `static/`, and the print layouts are
in `templates/print_*.html`. Run it directly with `python app.py` (`--share`, `--no-browser`;
`SCHEDULER_PORT` and `SCHEDULER_DB` change the port and the database file).
