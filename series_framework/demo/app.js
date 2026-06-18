/* SFF Series demo — wires PrefDeck + read-marking + timeline over series_data.js.
 * All state lives in localStorage on this machine; export/import as JSON. */
function sffShowError(msg) {
  var d = document.getElementById("deck") || document.body;
  d.innerHTML = '<div style="border:1px solid #e5484d;background:#2a1416;color:#ffd7d7;' +
    'padding:18px 20px;border-radius:12px;font-size:14px;line-height:1.5;max-width:560px;margin:20px auto;">' +
    '<strong>The demo could not start.</strong><br>' + msg +
    '<br><br>Most often this means a data/script file did not load. ' +
    'Use the single-file version <code>SFF_Series_Demo.html</code>, which has everything built in.</div>';
}
window.addEventListener("error", function (e) {
  sffShowError("JavaScript error: " + (e && e.message ? e.message : "unknown") + ".");
});

(function () {
  "use strict";

  const DATA = window.SFF_DATA;
  if (!DATA || !DATA.series) {
    sffShowError("Series data was not found (window.SFF_DATA is missing — series_data.js did not load).");
    return;
  }
  const SERIES = DATA.series;
  const SERIES_BY_ID = {};
  SERIES.forEach(s => (SERIES_BY_ID[s.id] = s));

  // ---------------- persistence ----------------
  const STORE_KEY = "sff_picks_v1";
  const COVER_KEY = "sff_cover_cache_v1";
  const SCHEMA_VERSION = 1;

  function loadStore() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (raw && raw.series) return raw;
    } catch (e) {}
    return { schema_version: SCHEMA_VERSION, updated_at: null, series: {} };
  }
  let STORE = loadStore();
  function saveStore() {
    STORE.schema_version = SCHEMA_VERSION;
    STORE.updated_at = new Date().toISOString();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(STORE)); } catch (e) {}
    refreshCounts();
  }
  function seriesState(sid) {
    if (!STORE.series[sid]) STORE.series[sid] = { verdict: null, books_read: [] };
    return STORE.series[sid];
  }

  // verdict mapping: PrefDeck keys -> our stored verdicts
  const V = { yes: "top", no: "pass", skip: "skip" };

  // ---------------- cover resolution (browser has internet) ----------------
  let COVERS = {};
  try { COVERS = JSON.parse(localStorage.getItem(COVER_KEY) || "{}"); } catch (e) {}
  function saveCovers() { try { localStorage.setItem(COVER_KEY, JSON.stringify(COVERS)); } catch (e) {} }

  function resolveCover(book) {
    // returns a Promise<url|null>. Only successful URLs are cached — misses are
    // NOT cached, so a transient failure or a coverless top hit is retried next
    // time instead of being stuck blank forever.
    if (book.cover_url) return Promise.resolve(book.cover_url);
    if (COVERS[book.id]) return Promise.resolve(COVERS[book.id]);   // truthy = a real cached URL
    if (book.isbn) {
      const u = `https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg`;
      COVERS[book.id] = u; saveCovers(); return Promise.resolve(u);
    }
    const series = SERIES_BY_ID[bookSeriesId(book.id)];
    const author = series ? series.author : "";
    // Pull several matches (not just the top one) and take the first that
    // actually has a cover — OpenLibrary's top hit is often a coverless edition.
    const q = `https://openlibrary.org/search.json?title=${encodeURIComponent(book.title)}` +
              `&author=${encodeURIComponent(author)}&limit=15&fields=cover_i,isbn,edition_count`;
    return fetch(q).then(r => r.json()).then(j => {
      const docs = (j.docs || []);
      const withCover = docs.find(d => d.cover_i);
      const withIsbn = docs.find(d => d.isbn && d.isbn[0]);
      let url = null;
      if (withCover) url = `https://covers.openlibrary.org/b/id/${withCover.cover_i}-M.jpg`;
      else if (withIsbn) url = `https://covers.openlibrary.org/b/isbn/${withIsbn.isbn[0]}-M.jpg`;
      if (url) { COVERS[book.id] = url; saveCovers(); }   // cache hits only
      return url;
    }).catch(() => null);
  }
  function bookSeriesId(bookId) { return bookId.split("--")[0]; }

  function imgInto(wrap, book, phText) {
    wrap.innerHTML = `<span class="ph">${escapeHtml(phText || book.title)}</span>`;
    resolveCover(book).then(url => {
      if (!url) return;
      const img = new Image();
      img.onload = () => { wrap.innerHTML = ""; wrap.appendChild(img); };
      img.onerror = () => {};
      img.src = url;
    });
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------------- tabs ----------------
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(t => t.addEventListener("click", () => {
    tabs.forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    t.classList.add("active");
    document.getElementById("view-" + t.dataset.view).classList.add("active");
    if (t.dataset.view === "read") renderReadList();
    if (t.dataset.view === "timeline") renderTimeline();
    if (t.dataset.view === "data") renderData();
  }));

  // ---------------- 1: SORT DECK ----------------
  let activeGenres = new Set(DATA.meta.genres);
  let deck = null;

  function buildGenreFilters() {
    const host = document.getElementById("genreFilters");
    host.innerHTML = "";
    DATA.meta.genres.forEach(g => {
      const c = document.createElement("button");
      c.className = "chip on";
      c.textContent = g;
      c.addEventListener("click", () => {
        if (activeGenres.has(g)) { activeGenres.delete(g); c.classList.remove("on"); }
        else { activeGenres.add(g); c.classList.add("on"); }
        if (activeGenres.size === 0) { activeGenres.add(g); c.classList.add("on"); return; }
        buildDeck();
      });
      host.appendChild(c);
    });
  }

  function buildDeck() {
    const items = SERIES
      .filter(s => activeGenres.has(s.genre))
      .map(s => ({
        id: s.id,
        title: s.series,
        subtitle: s.author,
        meta: `${s.book_count} books · ${s.year_start}–${s.year_end} · ${s.genre}`,
        badges: [s.genre],
        _firstBook: s.books[0],
      }));

    const initial = {};
    items.forEach(it => {
      const v = STORE.series[it.id] && STORE.series[it.id].verdict;
      if (v) initial[it.id] = (v === "top" ? "yes" : v === "pass" ? "no" : "skip");
    });

    if (deck) deck.destroy();
    deck = PrefDeck.create({
      mount: "#deck",
      items,
      actions: [
        { key: "yes",  label: "Ultimate", glyph: "★", cls: "pd-pos",     keys: ["ArrowRight", "d"] },
        { key: "no",   label: "Pass",     glyph: "✗", cls: "pd-neg",     keys: ["ArrowLeft", "a"] },
        { key: "skip", label: "Skip",     glyph: "↓", cls: "pd-neutral", keys: ["ArrowDown", "s"] },
      ],
      initial,
      resolveImage: (item) => resolveCover(item._firstBook),
      onDecision: (id, key) => {
        const st = seriesState(id);
        st.verdict = V[key];
        saveStore();
      },
    });
  }

  // ---------------- 2: MARK BOOKS READ ----------------
  function seriesForReading() {
    // any series the reader engaged with: flagged ultimate, or has read marks
    return SERIES.filter(s => {
      const st = STORE.series[s.id];
      return st && (st.verdict === "top" || (st.books_read && st.books_read.length));
    });
  }

  function renderReadList() {
    const host = document.getElementById("readList");
    const list = seriesForReading();
    if (!list.length) {
      host.innerHTML = `<div class="empty">No series flagged yet. Head to <strong>Sort Series</strong> and mark a few as Ultimate (swipe right).</div>`;
      return;
    }
    host.innerHTML = "";
    const reads = window.SFFReads ? window.SFFReads.snapshot() : new Set();
    const isReadCross = (b, s) => window.SFFReads && reads.has(window.SFFReads.key(b.title, s.author));
    list.forEach(s => {
      const st = seriesState(s.id);
      const readSet = new Set(st.books_read);
      const block = document.createElement("div");
      block.className = "series-block";
      block.innerHTML = `
        <div class="series-head">
          ${st.verdict === "top" ? '<span class="tag-top">ULTIMATE</span>' : ""}
          <div class="meta">
            <div class="nm">${escapeHtml(s.series)}</div>
            <div class="au">${escapeHtml(s.author)} · ${s.book_count} books</div>
          </div>
          <a href="${s.goodreads_series_url}" target="_blank" rel="noopener">Goodreads ↗</a>
        </div>
        <div class="quickrow">
          <span>Quick set read through:</span>
        </div>
        <div class="books-row"></div>`;
      const quick = block.querySelector(".quickrow");
      s.books.forEach((b, i) => {
        const btn = document.createElement("button");
        btn.textContent = "#" + (i + 1);
        btn.title = `Mark first ${i + 1} as read`;
        btn.addEventListener("click", () => {
          st.books_read = s.books.slice(0, i + 1).map(x => x.id);
          saveStore(); renderReadList();
        });
        quick.appendChild(btn);
      });
      const clr = document.createElement("button");
      clr.textContent = "none";
      clr.addEventListener("click", () => { st.books_read = []; saveStore(); renderReadList(); });
      quick.appendChild(clr);

      const row = block.querySelector(".books-row");
      s.books.forEach(b => {
        const bk = document.createElement("div");
        bk.className = "bk" + ((readSet.has(b.id) || isReadCross(b, s)) ? " read" : "");
        const award = window.SFFAwards ? window.SFFAwards.label(b.title, s.author) : "";
        bk.innerHTML = `
          <div class="cov"><span class="ph">${escapeHtml(b.title)}</span><div class="check">✓</div>${award ? `<div class="award-badge">${escapeHtml(award)}</div>` : ""}</div>
          <div class="ttl">${escapeHtml(b.title)}</div>
          <div class="yr">${b.year}</div>`;
        imgInto(bk.querySelector(".cov"), b);
        bk.addEventListener("click", () => {
          const set = new Set(st.books_read);
          if (set.has(b.id)) set.delete(b.id); else set.add(b.id);
          st.books_read = s.books.filter(x => set.has(x.id)).map(x => x.id); // keep series order
          saveStore();
          bk.classList.toggle("read");
        });
        row.appendChild(bk);
      });
      host.appendChild(block);
    });
  }

  // ---------------- 3: TIMELINE ----------------
  function seriesForTimeline() {
    return SERIES.filter(s => {
      const st = STORE.series[s.id];
      return st && (st.verdict === "top" || (st.books_read && st.books_read.length));
    }).sort((a, b) => a.year_start - b.year_start || a.series.localeCompare(b.series));
  }

  let tlPxPerYear = 46;     // zoom level, driven by the slider / Fit button

  // Build generic timeline rows (one per series) for the shared SFFTimeline module.
  function seriesTimelineRows() {
    const reads = window.SFFReads ? window.SFFReads.snapshot() : new Set();
    return seriesForTimeline().map(s => {
      const readSet = new Set((STORE.series[s.id] || {}).books_read || []);
      return {
        label: s.series,
        sublabel: s.author,
        books: s.books.map(b => ({
          id: b.id, title: b.title, year: b.year,
          cover_url: b.cover_url || (COVERS[b.id] || null),
          read: readSet.has(b.id) || (window.SFFReads && reads.has(window.SFFReads.key(b.title, s.author))),
          _book: b,
        })),
      };
    });
  }

  function renderTimeline() {
    const canvas = document.getElementById("timelineCanvas");
    const stat = document.getElementById("tlStat");
    const rows = seriesTimelineRows();
    if (!rows.length) {
      canvas.innerHTML = `<div class="empty">Nothing to plot yet. Flag some Ultimate series and mark what you've read.</div>`;
      stat.textContent = "";
      return;
    }
    SFFTimeline.render(canvas, stat, rows, tlPxPerYear, (b) => resolveCover(b._book));
  }

  // ---------------- DATA tab ----------------
  function renderData() {
    document.getElementById("dataDump").textContent = JSON.stringify(STORE, null, 2);
    const top = Object.values(STORE.series).filter(s => s.verdict === "top").length;
    const reads = Object.values(STORE.series).reduce((n, s) => n + (s.books_read ? s.books_read.length : 0), 0);
    document.getElementById("dataStat").textContent =
      `${top} ultimate series · ${reads} books marked read · schema v${STORE.schema_version}` +
      (STORE.updated_at ? ` · updated ${new Date(STORE.updated_at).toLocaleString()}` : "");
  }

  document.getElementById("btnExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(STORE, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sff_picks_" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
  });
  document.getElementById("btnImport").addEventListener("click", () => document.getElementById("fileInput").click());
  document.getElementById("fileInput").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const obj = JSON.parse(fr.result);
        if (obj && obj.series) { STORE = obj; saveStore(); renderData(); buildDeck();
          alert("Imported."); }
        else alert("That file doesn't look like an SFF picks export.");
      } catch (err) { alert("Could not parse JSON."); }
    };
    fr.readAsText(f);
  });
  document.getElementById("btnReset").addEventListener("click", () => {
    if (!confirm("Erase all your picks on this machine?")) return;
    STORE = { schema_version: SCHEMA_VERSION, updated_at: null, series: {} };
    saveStore(); renderData(); buildDeck();
  });

  // ---- timeline zoom / fit / export ----
  const zoomEl = document.getElementById("tlZoom");
  zoomEl.addEventListener("input", () => { tlPxPerYear = +zoomEl.value; renderTimeline(); });
  document.getElementById("tlFit").addEventListener("click", () => {
    const rows = seriesTimelineRows();
    if (!rows.length) return;
    tlPxPerYear = SFFTimeline.fit(document.getElementById("timelineCanvas"), rows);
    zoomEl.value = tlPxPerYear;
    renderTimeline();
  });
  document.getElementById("tlPng").addEventListener("click", () => {
    SFFTimeline.exportPNG(seriesTimelineRows(), tlPxPerYear, "sff_series_timeline_" + new Date().toISOString().slice(0, 10) + ".png");
  });

  // ---------------- counts ----------------
  function refreshCounts() {
    const top = Object.values(STORE.series).filter(s => s.verdict === "top").length;
    const eng = seriesForReading().length;
    document.getElementById("tabSortN").textContent = top ? `(${top}★)` : "";
    document.getElementById("tabReadN").textContent = eng ? `(${eng})` : "";
  }

  // ---------------- init ----------------
  buildGenreFilters();
  buildDeck();
  refreshCounts();
})();
