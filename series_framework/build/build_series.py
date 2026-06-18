# -*- coding: utf-8 -*-
"""
Build data/series.json from series_data.SERIES.

For every book we attach (best-effort, browser fills the rest):
  - a stable id
  - publication year (curated; reconciled with OpenLibrary first_pub_year)
  - cover_url + ol_key when the title|author is found in readmore's caches
  - Goodreads search links (author / series / book)

Indexes emitted at top level so the data is queryable by author, by series,
and by book — all linking back to Goodreads.
"""
import json, re, os, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def find_readmore():
    """Locate the readmore tree (the one holding site/data.json). Works whether
    this folder sits next to Project_Readmore or lives inside the readmore repo.
    Override with the READMORE_DIR env var."""
    cands = [
        os.environ.get("READMORE_DIR"),
        os.path.join(ROOT, "..", "Project_Readmore", "mount-readmore-main"),
        os.path.join(ROOT, ".."),        # series_framework/ at repo root
        os.path.join(ROOT, "..", ".."),
    ]
    for c in cands:
        if c and os.path.exists(os.path.join(c, "site", "data.json")):
            return c
    return os.path.join(ROOT, "..", "Project_Readmore", "mount-readmore-main")


READMORE = find_readmore()

from series_data import SERIES


def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s


def norm_key(title, author):
    """Match readmore's openlib_cache key format: 'title|author' lowercased."""
    def clean(x):
        x = unicodedata.normalize("NFKD", x).encode("ascii", "ignore").decode("ascii")
        return x.strip().lower()
    return f"{clean(title)}|{clean(author)}"


# ---- load readmore caches -------------------------------------------------
def load_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return {}


openlib = load_json(os.path.join(READMORE, "data", "openlib_cache.json"))
data_json = load_json(os.path.join(READMORE, "site", "data.json"))

# Build a title|author -> {cover_url, ol_key, isbn, first_pub_year} index from
# both the openlib cache and the live data.json books (which carry isbn too).
cover_index = {}
for k, v in openlib.items():
    cover_index[k] = {
        "cover_url": v.get("cover_url"),
        "ol_key": v.get("ol_key"),
        "first_pub_year": v.get("first_pub_year"),
    }
for b in data_json.get("books", []):
    for auth in (b.get("authors") or [b.get("author_raw", "")]):
        k = norm_key(b.get("title", ""), auth)
        entry = cover_index.setdefault(k, {})
        if b.get("cover_url") and not entry.get("cover_url"):
            entry["cover_url"] = b["cover_url"]
        if b.get("ol_key") and not entry.get("ol_key"):
            entry["ol_key"] = b["ol_key"]
        if b.get("isbn") and not entry.get("isbn"):
            entry["isbn"] = b["isbn"]
        if b.get("first_pub_year") and not entry.get("first_pub_year"):
            entry["first_pub_year"] = b["first_pub_year"]


def gr_search(q):
    from urllib.parse import quote_plus
    return f"https://www.goodreads.com/search?q={quote_plus(q)}"


# ---- assemble -------------------------------------------------------------
series_out = []
authors_index = {}
matched = 0
total_books = 0

for genre, author, name, books in SERIES:
    series_id = slugify(f"{name}-{author}")
    book_list = []
    for idx, (title, year) in enumerate(books, start=1):
        total_books += 1
        key = norm_key(title, author)
        hit = cover_index.get(key, {})
        if hit.get("cover_url"):
            matched += 1
        book_list.append({
            "id": f"{series_id}--{slugify(title)}",
            "title": title,
            "series_index": idx,
            "year": year,
            "first_pub_year": hit.get("first_pub_year") or year,
            "cover_url": hit.get("cover_url"),     # None -> browser resolves
            "ol_key": hit.get("ol_key"),
            "isbn": hit.get("isbn"),
            "goodreads_url": gr_search(f"{title} {author}"),
        })
    entry = {
        "id": series_id,
        "series": name,
        "author": author,
        "genre": genre,
        "book_count": len(book_list),
        "year_start": min(b["year"] for b in book_list),
        "year_end": max(b["year"] for b in book_list),
        "goodreads_series_url": gr_search(f"{name} {author} series"),
        "goodreads_author_url": gr_search(author),
        "books": book_list,
    }
    series_out.append(entry)
    authors_index.setdefault(author, []).append(series_id)

# enforce: SERIES ONLY (more than one book)
series_out = [s for s in series_out if s["book_count"] > 1]

# top-level book index (id -> series_id) for cross-referencing
book_index = {}
for s in series_out:
    for b in s["books"]:
        book_index[b["id"]] = {"series_id": s["id"], "title": b["title"], "year": b["year"]}

out = {
    "meta": {
        "generated_by": "build_series.py",
        "series_count": len(series_out),
        "book_count": sum(s["book_count"] for s in series_out),
        "covers_prefilled": matched,
        "genres": sorted({s["genre"] for s in series_out}),
        "cover_resolution": "covers with null cover_url are resolved client-side via openlibrary.org/search.json",
        "sources": [
            "https://www.goodreads.com/list/show/2486.Best_Science_Fiction_Series",
            "https://www.freddythefrogcaster.com/must-read-fantasy-book-series-you-should-try/",
            "https://www.thrillist.com/entertainment/nation/best-fantasy-book-series-sci-fi-science-fiction",
        ],
    },
    "by_author": {a: ids for a, ids in sorted(authors_index.items())},
    "book_index": book_index,
    "series": sorted(series_out, key=lambda s: (s["genre"], s["author"], s["year_start"])),
}

outpath = os.path.join(ROOT, "data", "series.json")
with open(outpath, "w") as f:
    json.dump(out, f, indent=2, ensure_ascii=False)

# Also emit a <script>-loadable copy so the demo works from file:// without a
# server (browsers block fetch() of local files).
jspath = os.path.join(ROOT, "demo", "series_data.js")
with open(jspath, "w") as f:
    f.write("/* Auto-generated by build_series.py — do not edit by hand. */\n")
    f.write("window.SFF_DATA = ")
    json.dump(out, f, ensure_ascii=False)
    f.write(";\n")

print(f"series: {len(series_out)}  books: {out['meta']['book_count']}  "
      f"covers prefilled: {matched}/{total_books}")
print("wrote", outpath)
print("wrote", jspath)
