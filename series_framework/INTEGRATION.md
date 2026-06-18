# Adding the Ultimate SFF (Series + Authors) system to the readmore repo

**Short version:** exactly **one file** ships to production — a fully self-contained
HTML page. Drop it into readmore's `site/` directory and you're done. It shares
nothing with the existing readmore app, so it cannot break (or be broken by) the
Hugo/Nebula tracker.

## What ships (runtime)

```
series_framework/dist/sff/index.html      →  <readmore-repo>/site/sff/index.html
```

That single file has everything inlined: the series + author datasets, the embedded
Hugo/Nebula award index, the PrefDeck / GridReviewer / SFFTimeline / SFFReads modules,
all CSS, and all app logic. Nothing else is required at runtime.

After deploy it's live at **`https://readmoresff.org/sff/`**.

## Steps

1. Copy the folder into the readmore site directory:
   ```bash
   cp -R series_framework/dist/sff  <readmore-repo>/site/sff
   ```
2. Commit and push to `main`. The existing Cloudflare Pages workflow
   (`.github/workflows/cloudflare-pages.yml`) already runs `pages deploy site`, so the
   new `site/sff/` ships automatically. No workflow changes needed.
3. (Optional) Add one nav link in `site/index.html`, just before `<span id="auth-slot">`:
   ```html
   <a href="/sff/">Ultimate SFF</a>
   ```
   This is a plain path link (not a `#/` hash route), so it does a normal navigation to
   the new page and is not touched by readmore's SPA router.

## Why nothing breaks (verified)

- **No shared files.** The page is one self-contained `index.html`; it does not import,
  include, or overwrite any of readmore's `app.js`, `styles.css`, `auth.js`,
  `config.js`, `data.json`, or `functions/`.
- **No routing conflict.** readmore has no SPA catch-all (`_redirects` / `_routes.json`),
  so the real file at `/sff/index.html` is served directly. readmore's hash routes
  (`#/discover`, etc.) are unaffected.
- **No storage collision.** This system uses `sff_*` localStorage keys
  (`sff_picks_v1`, `sff_author_picks_v1`, `sff_cover_cache_v1`, `sff_ol_cache_v2`).
  readmore uses `mr-*` and Supabase `sb-*` keys. No overlap.
- **No auth / network coupling.** The page never loads Supabase and never reads
  readmore's data at runtime — award data is baked in at build time. Covers, author
  photos, and book lists come from OpenLibrary directly in the browser.
- **No global JS collisions.** Modules are namespaced (`PrefDeck`, `GridReviewer`,
  `SFFTimeline`, `SFFReads`, `SFFAwards`, `SFF_DATA`, `SFF_AUTHORS`, `SFF_AWARDS`).

### Do NOT touch

Nothing in `site/` other than (optionally) adding the one nav `<a>` above. Leave
`app.js`, `styles.css`, `auth.js`, `config.js`, `data.json`, `_headers`, and
`functions/` exactly as they are.

## Rebuilding the bundle (only when you change the data/modules)

The source lives in `series_framework/`. You can keep it **outside** `site/` (so it is
never served) — e.g. at the repo root or in a `tools/` directory. To regenerate:

```bash
cd series_framework/build
python3 build_series.py     # series.json   (+ demo/series_data.js)
python3 build_authors.py    # authors.json  (+ demo/authors_data.js)
python3 build_awards.py     # awards.json   (+ demo/awards_data.js)  — reads readmore data.json
python3 bundle.py           # -> demo/SFF_Series_Demo.html AND dist/sff/index.html
```

`build_series.py` and `build_awards.py` read readmore's `site/data.json` (for cover
prefill + the award index). They auto-detect the readmore tree whether
`series_framework/` sits next to it or inside the repo; override with
`READMORE_DIR=/path/to/readmore` if needed. Only the Python standard library is used —
no extra pip installs, so it won't affect readmore's CI dependencies.

Then re-copy `dist/sff/` into `site/sff/` and commit.

### Optional: rebuild in CI

If you want the bundle regenerated on every push, add one step to
`cloudflare-pages.yml` **before** the deploy step (no new dependencies required):

```yaml
      - name: Rebuild SFF bundle
        run: |
          cd tools/series_framework/build   # wherever you put the source
          python3 build_series.py && python3 build_authors.py && python3 build_awards.py && python3 bundle.py
          mkdir -p "$GITHUB_WORKSPACE/site/sff"
          cp dist/sff/index.html "$GITHUB_WORKSPACE/site/sff/index.html"
```

If you'd rather keep CI untouched, just commit the prebuilt `site/sff/index.html` — it's
self-contained and needs no build.
