# Measure Cards

Make music flash cards, then print them or show them full screen in class.

**To use it:** download [`measure-cards.html`](measure-cards.html) and open it in Chrome, Edge,
Firefox or Safari. Your deck is kept in that browser as you work; use **Deck › Save deck to a
file** to keep a copy or move it to another computer.

## What it does

- **Staves:** single staff (treble, bass, alto or tenor), grand staff, or a one-line rhythm staff,
  in any key and common time signatures.
- **Grand staff in four parts:** soprano and alto on the top staff, tenor and bass on the bottom,
  hymnal style.
- **Lyrics:** a syllable under each note, up to four verses. On a grand staff they sit between
  the staves.
- **Shape notes:** four-shape (fa sol la mi) or seven-shape (do re mi fa sol la ti) heads, following
  the key signature.
- **Notation:** dotted notes, rests, chords, accidentals, ties, slurs, triplets, fermatas, double
  bars and repeat signs.
- **Three ways to write:** type short codes, use the note buttons, or click the staff and drag notes
  up and down.
- **Playback:** hear any card at your chosen tempo, with the notes lighting up as they sound.
- **Labels:** letter names or syllables printed beside any line or space.
- **Headings, captions and answers:** answers stay hidden until you print them or press **A** while
  presenting.
- **Printing:** 1, 2 or 4 cards per page, landscape or portrait.
- **Present mode:** one card at a time on the projector, with the arrow keys to move between them.
- **Starter decks:** ready-made rhythm, note-reading, grand staff, song, hymn and shape-note cards.
- **Old decks:** decks saved from the earlier version of Measure Cards open as they are.

Inside the page, **How to** lists the typing codes.

## Editing the source

The page is built from the files in `src/`:

| File | What's in it |
| --- | --- |
| `engine.js` | Reading the note codes, spacing, shape notes, lyrics, drawing, playback timing |
| `app.js` | Everything on screen: editor, card list, clicking the staff, playback, print, present mode |
| `style.css` | Layout and look |
| `body.html` | The page's markup |
| `vendor/vexflow-4.2.5.min.js` | [VexFlow](https://github.com/0xfe/vexflow), the music-engraving library (MIT licence) |

After changing any of them, rebuild the page from the repository root:

```
python3 music/measure-cards/src/build.py
```

Then commit the changed source and the rebuilt `measure-cards.html` together.
