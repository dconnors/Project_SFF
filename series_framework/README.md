# Ultimate SFF — Framework & Demo

A build on top of your `readmore` SFF tracker. The demo opens on a **landing with
three modes**, each following the same three phases (pick the ultimate → mark what
you've read → see it on a publication timeline):

- **Sci-Fi Authors** — pick ultimate SF authors, mark their books read, plot by year.
- **Fantasy Authors** — same, for fantasy.
- **Ultimate SFF Series** — flag ultimate multi-book series, mark where you stopped.

Datasets:

1. **Series** — 131 top sci-fi & fantasy *series* (multi-book only), indexed by author,
   series, and book; every entry linked back to Goodreads, with years and cover art.
2. **Authors** — ~293 top authors (149 SF, 144 Fantasy, one primary genre each), each
   with a Goodreads author-search URL. Each author's actual books, covers, and photo
   are resolved live from OpenLibrary in the browser and cross-referenced to Goodreads.

Reusable, dependency-free modules (drop into other projects):

- **PrefDeck** (`prefdeck/`) — swipe yes/no/skip over any set of N images (phase 1).
- **GridReviewer** (`gridreviewer/`) — a grid of N images with a binary green toggle (phase 2).
- **SFFTimeline** (`demo/timeline.js`) — sticky-label publication timeline with zoom,
  fit-to-width, and PNG export (phase 3), shared by all three modes.

## How to run (macOS)

Just **double-click `demo/index.html`** — it opens in your browser and runs entirely
locally. No server, no install. The data is loaded via a `<script>` tag
(`demo/series_data.js`) specifically so it works from `file://` without CORS errors.

Cover images load from OpenLibrary over the internet at runtime; ~90 are pre-filled
from readmore's cache, the rest resolve on first view and are cached in your browser.
If you're offline, covers fall back to a title placeholder — everything else works.

Your picks are saved in this browser's `localStorage` and can be exported/imported as
JSON from the **Data & Export** tab.

## Layout

```
series_framework/
├── README.md
├── build/
│   ├── series_data.py      # the curated 131-series master list (edit here)
│   └── build_series.py     # enriches from readmore caches → data/series.json + demo/series_data.js
├── data/
│   └── series.json         # generated dataset (by_author / book_index / series)
├── prefdeck/               # the reusable module (no dependencies)
│   ├── prefdeck.js
│   ├── prefdeck.css
│   └── README.md           # full config/API docs
└── demo/
    ├── index.html          # the demo UI (Steps 2A + 3)
    ├── app.js              # demo logic: deck, read-marking, timeline, export
    └── series_data.js      # generated; window.SFF_DATA
```

## The three steps, mapped to the demo tabs

- **Step 1 — the dataset.** `data/series.json`. Each series carries `author`, `genre`,
  `book_count`, `year_start/end`, Goodreads links for the series and author, and a
  `books[]` list where every book has a year, a cover (or a runtime-resolved one), an
  OpenLibrary key/ISBN when known, and its own Goodreads link. Top-level `by_author`
  and `book_index` make it queryable by author, series, or individual book — all
  pointing back to Goodreads, mirroring how readmore references its canon.

- **Step 2 / 2A — sort + read-marking.** Tabs *Sort Series* and *Mark Books Read*.
  The reader swipes each series **Ultimate / Pass / Skip** (no ranking — just a flag),
  then, for each Ultimate series, clicks the covers they've read. The last green cover
  is where they stopped (e.g. *Dune*: read through book 2, the rest stay red). State is
  stored in a forward-compatible shape (`schema_version` on every saved blob).

- **Step 3 — timeline.** Tab *Timeline*. Each flagged series is a horizontal row;
  covers sit at their publication year along a shared year axis. **Read books are
  outlined green, unread red.** Multiple series stack on separate rows.

## Regenerating the data

```bash
cd build && python3 build_series.py
```

Edit `build/series_data.py` to add or adjust series, then re-run. It reconciles each
title against `../Project_Readmore/mount-readmore-main/data/openlib_cache.json` and the
live `site/data.json` to pre-attach covers and authoritative first-publication years.

## Reusing PrefDeck elsewhere

PrefDeck is fully decoupled from books — see `prefdeck/README.md`. Point it at any
items with images, define any set of verdict buttons, and read results back via
`onChange` / `deck.verdicts()`.
