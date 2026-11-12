"""Rebuild paper-polyhedra.html from the files in this folder.

Run from anywhere:  python3 math/paper-polyhedra/src/build.py
The result is one self-contained page with nothing to install: the model data, the
PDF and triangulation libraries and the fonts are all inside it.
"""
import base64
from pathlib import Path

SRC = Path(__file__).resolve().parent
OUT = SRC.parent / "paper-polyhedra.html"


def read(name):
    return (SRC / name).read_text(encoding="utf-8")


def font_face(family, file, weight, style="normal"):
    data = base64.b64encode((SRC / "vendor" / "fonts" / file).read_bytes()).decode("ascii")
    return (f"@font-face{{font-family:'{family}';font-style:{style};font-weight:{weight};font-display:swap;"
            f"src:url(data:font/woff2;base64,{data}) format('woff2')}}")


fonts = "\n".join([
    font_face("Atkinson Hyperlegible", "atkinson-hyperlegible-latin-400-normal.woff2", 400),
    font_face("Atkinson Hyperlegible", "atkinson-hyperlegible-latin-700-normal.woff2", 700),
    font_face("Atkinson Hyperlegible", "atkinson-hyperlegible-latin-400-italic.woff2", 400, "italic"),
    font_face("Bricolage Grotesque", "bricolage-grotesque-latin-500-normal.woff2", 500),
    font_face("Bricolage Grotesque", "bricolage-grotesque-latin-700-normal.woff2", 700),
    font_face("Bricolage Grotesque", "bricolage-grotesque-latin-800-normal.woff2", 800),
])


def script(text):
    # keep a stray closing tag from ending the script early
    return text.replace("</script", "<\\/script")


page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paper Polyhedra</title>
<style>
{fonts}
</style>
<style>
{read("style.css")}</style>
<script>
/* jsPDF 2.5.1, MIT License, https://github.com/parallax/jsPDF */
{script(read("vendor/jspdf-2.5.1.umd.min.js").rstrip())}
</script>
<script>
/* earcut 2.2.4, ISC License, https://github.com/mapbox/earcut */
{script(read("vendor/earcut-2.2.4.min.js").rstrip())}
</script>
</head>
<body>

{read("body.html")}
<script>
/* Visible surfaces of Wenninger's 119 polyhedron models, made by tools/build_models.py from Antiprism. */
const MODELS = {script(read("data/models.json").strip())};
</script>
<script>
{script(read("engine.js"))}</script>
<script>
{script(read("viewer.js"))}</script>
<script>
{script(read("app.js"))}</script>
</body>
</html>
"""

OUT.write_text(page, encoding="utf-8")
print(f"wrote {OUT.relative_to(SRC.parent.parent.parent)} ({len(page):,} bytes)")
