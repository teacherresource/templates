# Paper Polyhedra

Print patterns with glue tabs for all 119 polyhedron models in Magnus Wenninger's *Polyhedron
Models*, then cut, fold and glue them from colored paper or cardstock.

**To use it:** download [`paper-polyhedra.html`](paper-polyhedra.html) and open it in Chrome, Edge,
Firefox or Safari. Pick a model, set the size and paper, and press **Download PDF**. Print at 100%
("Actual size"), not "Fit to page"; each sheet has a scale bar to check.

## What it does

- **All 119 Wenninger models:** the 5 Platonic solids (W1–W5), the 13 Archimedean solids (W6–W18),
  the 4 Kepler–Poinsot star polyhedra, the stellations of the octahedron, icosahedron,
  cuboctahedron and icosidodecahedron, the compounds, and the 53 uniform star polyhedra
  (W67–W119). Browse them by family, or search by name or W number.
- **Only what you can see:** star polyhedra and stellations have faces that pass through each
  other. The patterns are for the visible outer surface, the way Wenninger built his models.
- **Sections, not one big net:** each model is split into compact sections that are easy to fold
  and join. Choose large sections, easy sections, small pieces or single faces. The Platonic solids
  have hand-picked sections (two pentagon flowers for the dodecahedron, and so on).
- **Glue tabs:** two tabs per seam glued back to back, one tab tucked under the next face, or no
  tabs for taping. Tabs shrink in tight corners so they never overlap.
- **Mountain and valley folds:** dashed lines fold away from you, dash-dot lines fold toward you
  (for the hollows between the points of star shapes).
- **Glue numbers and piece letters** so every seam has a match, also shown on the turning 3D model.
- **Colors:** one color per piece, matching shapes, each solid of a compound in its own color,
  parallel faces, no touching faces alike, every face different, or paint faces yourself. Sheets
  can be sorted by paper color so each piece comes from one sheet of construction paper.
- **Tracing templates:** one of each piece shape, labeled with how many to cut in which colors,
  for paper that won't go through a printer.
- **Size:** set the overall size or the edge length, in inches or millimeters, on Letter, Legal,
  Tabloid, A4, A3 or construction paper sizes.
- **Saves:** PDF of every sheet, or any single sheet as SVG.

## Editing the source

The page is built from the files in `src/`:

| File | What's in it |
| --- | --- |
| `engine.js` | Sections, unfolding pieces flat, glue tabs, fold types, packing pieces onto sheets |
| `viewer.js` | The 3D model (WebGL): shading, seams, hover, glue numbers |
| `app.js` | Everything on screen: settings, model browser, sheets, PDF and SVG output |
| `style.css` | Layout and look |
| `body.html` | The page's markup |
| `data/models.json` | The 119 models' visible surfaces, made by `tools/build_models.py` |
| `vendor/jspdf-2.5.1.umd.min.js` | [jsPDF](https://github.com/parallax/jsPDF), for the PDF (MIT licence) |
| `vendor/earcut-2.2.4.min.js` | [earcut](https://github.com/mapbox/earcut), splits faces into triangles (ISC licence) |
| `vendor/fonts/` | Atkinson Hyperlegible and Bricolage Grotesque (SIL Open Font Licence) |

After changing any of them, rebuild the page from the repository root:

```
python3 math/paper-polyhedra/src/build.py
```

Then commit the changed source and the rebuilt `paper-polyhedra.html` together.

## Remaking the model data

You only need this to change the models themselves. The shapes come from
[Antiprism](https://github.com/antiprism/antiprism), which can make every Wenninger model.
`tools/surface.py` finds each model's visible outer surface (it cuts every face where other faces
pass through it and keeps the parts you can see from outside), and `tools/meta.py` holds the
names and facts from Wikipedia's
[List of Wenninger polyhedron models](https://en.wikipedia.org/wiki/List_of_Wenninger_polyhedron_models).

1. Build Antiprism (see its README).
2. Install the Python packages: `pip install numpy scipy mapbox_earcut`.
3. Run, from `src/tools/`:

   ```
   python3 build_models.py --antiprism /path/to/antiprism/build/src
   ```

   This writes `src/data/models.json`. The three hardest models take about a minute each.
4. Rebuild the page with `build.py`.
