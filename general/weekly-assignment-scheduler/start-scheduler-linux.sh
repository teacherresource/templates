#!/bin/bash
# Weekly Assignment Scheduler — Linux / Raspberry Pi / Chromebook (Linux apps)
#   ./start-scheduler-linux.sh           only this computer can open it
#   ./start-scheduler-linux.sh --share   tablets and phones on the same Wi-Fi can too
cd "$(dirname "$0")" || exit 1

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 isn't installed. Install it with:  sudo apt install python3 python3-venv"
  exit 1
fi

# Already have Flask from the system (e.g. sudo apt install python3-flask)? Use it.
if python3 -c 'import flask' >/dev/null 2>&1 && [ ! -d .venv ]; then
  exec python3 app.py "$@"
fi

if [ ! -x .venv/bin/python ]; then
  echo "First-time setup, this takes a minute..."
  if ! python3 -m venv .venv; then
    rm -rf .venv
    echo
    echo "Python's venv module is missing. Install it, then run this again:"
    echo "  sudo apt install python3-venv      (Debian, Ubuntu, Raspberry Pi OS, Mint)"
    echo "  sudo dnf install python3           (Fedora)"
    echo "Or use the system Flask instead:  sudo apt install python3-flask"
    exit 1
  fi
fi
if ! .venv/bin/python -c 'import flask' >/dev/null 2>&1; then
  echo "Installing Flask (needs the internet this one time)..."
  .venv/bin/python -m pip install --disable-pip-version-check -q -r requirements.txt || {
    echo "Setup didn't finish. Check the internet connection and run this again."
    exit 1; }
fi

exec .venv/bin/python app.py "$@"
