#!/bin/bash
# Weekly Assignment Scheduler — double-click to start (Mac).
# First time: right-click this file → Open → Open (macOS asks once because it was downloaded).
cd "$(dirname "$0")" || exit 1

python_ok() { "$1" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' >/dev/null 2>&1; }

PY=""
for c in /Library/Frameworks/Python.framework/Versions/Current/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
  if [ -x "$c" ] && python_ok "$c"; then PY="$c"; break; fi
done
# Apple's own python3 only works once the Command Line Tools are installed;
# without them it pops up an install dialog, so only use it if they're there.
if [ -z "$PY" ] && xcode-select -p >/dev/null 2>&1 && python_ok /usr/bin/python3; then PY=/usr/bin/python3; fi

if [ -z "$PY" ]; then
  echo
  echo "  Python is not installed yet."
  echo "  1. Install it from https://www.python.org/downloads/ (the big yellow button)."
  echo "  2. Then double-click this file again."
  echo
  open "https://www.python.org/downloads/"
  read -r -p "Press Return to close."
  exit 1
fi

if [ ! -x .venv/bin/python ]; then
  echo "First-time setup, this takes a minute..."
  "$PY" -m venv .venv || { echo "Setup didn't finish."; read -r -p "Press Return to close."; exit 1; }
fi
if ! .venv/bin/python -c 'import flask' >/dev/null 2>&1; then
  echo "Installing Flask (needs the internet this one time)..."
  .venv/bin/python -m pip install --disable-pip-version-check -q -r requirements.txt || {
    echo "Setup didn't finish. Check the internet connection and try again."
    echo "If it keeps failing, delete the .venv folder next to this file and try once more."
    read -r -p "Press Return to close."; exit 1; }
fi

# To let tablets on your Wi-Fi open it too, add --share after app.py
exec .venv/bin/python app.py
