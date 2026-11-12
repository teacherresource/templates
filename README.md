# Teacher Resource Templates

Classroom tools that each run as a single web page. Download the `.html` file, open it in any
browser, and it works: no install, no account, no internet needed once it's on your computer.

## Templates

| Subject | Template | What it does |
| --- | --- | --- |
| Any subject | [Half-Sheet Flash Cards](general/half-sheet-flash-cards/) | Type-your-own question and answer cards with quick style buttons, printed one per half page (8.5 × 5.5 in). |
| Music | [Measure Cards](music/measure-cards/) | Printable and projectable flash cards for rhythm, note reading, shape notes, grand staff and lyrics. |

## How this repository is organised

Each template lives in its own folder under a subject:

```
<subject>/
  <template-name>/
    <template-name>.html   the finished page people download and open
    README.md              what it does and how to use it
    src/                   editable source files (optional)
      build.py             rebuilds <template-name>.html from src/
      vendor/              third-party libraries, with their version in the file name
```

When adding a template:

1. Put it in the subject folder that fits (`music/`, `math/`, `reading/`, `science/` and so on),
   creating the subject folder if it's new. Templates that work for any subject go in `general/`.
2. Name the folder and the page in lowercase with hyphens, and give both the same name.
3. Give it a `README.md`; copying an existing one and changing it is fine.
4. If it has a `src/` folder, rebuild the page after editing and commit both together, so the
   downloadable page always matches its source.
5. Add a row to the table above.
