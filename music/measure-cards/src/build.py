"""Rebuild measure-cards.html from the files in this folder.

Run from anywhere:  python3 music/measure-cards/src/build.py
The result is one self-contained page with nothing to install.
"""
from pathlib import Path

SRC = Path(__file__).resolve().parent
OUT = SRC.parent / "measure-cards.html"


def read(name):
    return (SRC / name).read_text(encoding="utf-8")


page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Measure Cards</title>
<script>
{read("vendor/vexflow-4.2.5.min.js").rstrip()}
</script>
<style>
{read("style.css")}</style>
</head>
<body>

{read("body.html")}
<script>
{read("engine.js")}</script>
<script>
{read("app.js")}</script>
</body>
</html>
"""

OUT.write_text(page, encoding="utf-8")
print(f"wrote {OUT.relative_to(SRC.parent.parent.parent)} ({len(page):,} bytes)")
