# Half-Sheet Flash Cards

Type your own questions and answers, style them with quick buttons, and print one card per
half page (8.5 × 5.5 in). Works for any subject.

**To use it:** download [`half-sheet-flash-cards.html`](half-sheet-flash-cards.html) and open it
in Chrome, Edge, Firefox or Safari. Your deck is kept in that browser as you work; use **Save** to
keep a copy as a file and **Open** to load it again, or to move it to another computer.

## What it does

- **Type on the card:** the question goes on the front and the answer on the back, shown at the
  real 8.5 × 5.5 shape so what you see is what prints.
- **Quick style buttons:** size from 16 to 80 pt, six fonts (Clean, Serif, Rounded, Hand, Slab,
  Mono), bold, italic, left/center/right, top or middle, and six ink colors. Each side of each
  card has its own style.
- **Fit:** picks the largest size that fits. A warning appears when text runs off a card, and
  **Shrink text that runs off** fixes the whole deck at once.
- **Whole-deck styling:** **Use this style on all fronts** (or backs) restyles every card, and new
  cards start with that style.
- **Bulk add:** paste one card per line as `question | answer`, or two columns copied from a
  spreadsheet. **Open** also accepts `.txt` and `.csv` lists.
- **Corner labels and card numbers:** an optional label such as "Chapter 3" on each card.
- **Printing:**
  - Letter paper with 2 cards per sheet and a dashed cut line (the default), or half-letter paper
    and card stock with 1 card per page.
  - Fronts and backs double-sided, question above answer for folding, questions only, or answers
    only.
  - Choose **Save as PDF** in the print dialog to make a PDF.

**Print settings:** margins **None**, scale **100%**, headers and footers off. For double-sided
letter sheets, flip on the long edge.

**Keyboard:** Ctrl + Enter adds a card, Ctrl + S saves, Ctrl + P prints.

## Fonts when offline

The six fonts load from Google Fonts. Without an internet connection the page still works, and
each font falls back to a similar one already on the computer (Verdana, Georgia, Comic Sans and
so on), so cards may look slightly different from the online preview.

## Editing

This template is a single file with no `src/` folder: edit `half-sheet-flash-cards.html` directly.
