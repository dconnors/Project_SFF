/* Author modes (Sci-Fi Authors / Fantasy Authors) + the top-level mode navigation.
 *
 * Phase 1: PrefDeck over authors of the active genre — flag the ultimate ones.
 * Phase 2: GridReviewer per ultimate author — click every book you've read (green).
 * Phase 3: SFFTimeline — one row per author, read books plotted by publication year.
 *
 * Author books, covers, and photos are resolved live from OpenLibrary and cached
 * in localStorage; every book also links back to Goodreads. Picks persist locally
 * under their own schema-versioned key, exportable as JSON.
 */
(function () {
  "use strict";
  if (!window.SFF_AUTHORS) { return; }   // author data not loaded; series mode still works

  const ADATA = window.SFF_AUTHORS;
  const AUTHORS = ADATA.authors;
  const AUTHORS_BY_ID = {};
  AUTHORS.forEach(a => (AUTHORS_BY_ID[a.id] = a));

  const STORE_KEY = "sff_author_picks_v1";
  const OL_KEY = "sff_ol_cache_v2";   // bumped: v1 may hold non-English cached titles
  const SCHEMA_VERSION = 1;

  let STORE = loadStore();
  let OL = loadOL();
  let currentGenre = "Science Fiction";
  let authorDeck = null;
  const grids = {};          // authorId -> GridReviewer instance
  let atlPxPerYear = 46;

  function loadStore() {
    try { const r = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); if (r && r.authors) return r; } catch (e) {}
    return { schema_version: SCHEMA_VERSION, updated_at: null, authors: {} };
  }
  function saveStore() {
    STORE.schema_version = SCHEMA_VERSION;
    STORE.updated_at = new Date().toISOString();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(STORE)); } catch (e) {}
    refreshAuthorCounts();
  }
  function aState(id) {
    if (!STORE.authors[id]) STORE.authors[id] = { verdict: null, books_read: [], books_meta: {} };
    if (!STORE.authors[id].books_meta) STORE.authors[id].books_meta = {};
    return STORE.authors[id];
  }
  function loadOL() {
    try { const r = JSON.parse(localStorage.getItem(OL_KEY) || "null"); if (r) return r; } catch (e) {}
    return { photo: {}, books: {} };
  }
  function saveOL() { try { localStorage.setItem(OL_KEY, JSON.stringify(OL)); } catch (e) {} }

  const V = { yes: "top", no: "pass", skip: "skip" };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function grBook(title, author) {
    return "https://www.goodreads.com/search?q=" + encodeURIComponent(title + " " + author) +
           "&search_type=books";
  }

  // ---------------- OpenLibrary resolvers (browser has internet) ----------------
  function olAuthorPhoto(author) {
    if (OL.photo[author.id] !== undefined) return Promise.resolve(OL.photo[author.id]);
    const q = "https://openlibrary.org/search/authors.json?q=" + encodeURIComponent(author.name) + "&limit=1";
    return fetch(q).then(r => r.json()).then(j => {
      const doc = j.docs && j.docs[0];
      let url = null;
      if (doc && doc.key) url = "https://covers.openlibrary.org/a/olid/" + doc.key + "-M.jpg?default=false";
      OL.photo[author.id] = url; saveOL();
      return url;
    }).catch(() => { OL.photo[author.id] = null; saveOL(); return null; });
  }

  function olAuthorBooks(author) {
    if (OL.books[author.id]) return Promise.resolve(OL.books[author.id]);
    // Ask OpenLibrary for English editions so Spanish/French titles don't contend
    // with the English version for the same work.
    const q = "https://openlibrary.org/search.json?author=" + encodeURIComponent(author.name) +
              "&language=eng&fields=title,first_publish_year,cover_i,edition_count,language&limit=150";
    return fetch(q).then(r => r.json()).then(j => {
      const docs = (j.docs || []).filter(d =>
        d.cover_i && d.first_publish_year &&
        // drop works that are known to have NO English edition
        !(Array.isArray(d.language) && d.language.length && d.language.indexOf("eng") === -1));
      const seen = {}; const out = [];
      docs.sort((a, b) => (b.edition_count || 0) - (a.edition_count || 0));
      for (const d of docs) {
        const key = String(d.title).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        if (seen[key]) continue; seen[key] = 1;
        out.push({
          id: author.id + "--" + slug(d.title).slice(0, 60),
          title: d.title,
          year: d.first_publish_year,
          cover_url: "https://covers.openlibrary.org/b/id/" + d.cover_i + "-M.jpg",
          goodreads_url: grBook(d.title, author.name),
        });
        if (out.length >= 48) break;
      }
      out.sort((a, b) => b.year - a.year);   // newest first for the grid
      OL.books[author.id] = out; saveOL();
      return out;
    }).catch(() => { OL.books[author.id] = []; saveOL(); return []; });
  }

  // ---------------- mode navigation ----------------
  function showMode(mode) {
    document.querySelectorAll(".mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
    const sectionId = (mode === "sf" || mode === "fantasy") ? "mode-authors" : "mode-" + mode;
    document.querySelectorAll(".mode").forEach(s => s.classList.toggle("active", s.id === sectionId));
    if (mode === "sf" || mode === "fantasy") {
      currentGenre = mode === "sf" ? "Science Fiction" : "Fantasy";
      document.getElementById("aPickGenre").textContent =
        (currentGenre === "Science Fiction" ? "Sci-Fi" : "Fantasy") + " authors";
      activateAuthorTab("apick");
      buildAuthorDeck();
      refreshAuthorCounts();
    }
  }
  document.querySelectorAll(".mode-btn").forEach(b => b.addEventListener("click", () => showMode(b.dataset.mode)));
  document.querySelectorAll(".land-card").forEach(c => c.addEventListener("click", () => showMode(c.dataset.goto)));

  function activateAuthorTab(view) {
    document.querySelectorAll(".atab").forEach(t => t.classList.toggle("active", t.dataset.aview === view));
    document.querySelectorAll(".aview").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
    if (view === "aread") renderAuthorReadList();
    if (view === "atimeline") renderAuthorTimeline();
    if (view === "adata") renderAuthorData();
  }
  document.querySelectorAll(".atab").forEach(t => t.addEventListener("click", () => activateAuthorTab(t.dataset.aview)));

  // ---------------- Phase 1: author deck ----------------
  function genreAuthors() { return AUTHORS.filter(a => a.genre === currentGenre); }

  function buildAuthorDeck() {
    const items = genreAuthors().map(a => ({
      id: a.id, title: a.name, subtitle: a.known_for,
      meta: a.genre, badges: [a.genre], _author: a,
    }));
    const initial = {};
    items.forEach(it => {
      const v = STORE.authors[it.id] && STORE.authors[it.id].verdict;
      if (v) initial[it.id] = (v === "top" ? "yes" : v === "pass" ? "no" : "skip");
    });
    if (authorDeck) authorDeck.destroy();
    authorDeck = PrefDeck.create({
      mount: "#authorDeck",
      items,
      actions: [
        { key: "yes",  label: "Ultimate", glyph: "★", cls: "pd-pos",     keys: ["ArrowRight", "d"] },
        { key: "no",   label: "Pass",     glyph: "✗", cls: "pd-neg",     keys: ["ArrowLeft", "a"] },
        { key: "skip", label: "Skip",     glyph: "↓", cls: "pd-neutral", keys: ["ArrowDown", "s"] },
      ],
      initial,
      resolveImage: (item) => olAuthorPhoto(item._author),
      onDecision: (id, key) => { aState(id).verdict = V[key]; saveStore(); },
    });
  }

  // ---------------- Phase 2: per-author book grids ----------------
  function authorsEngaged() {
    return genreAuthors().filter(a => {
      const st = STORE.authors[a.id];
      return st && (st.verdict === "top" || (st.books_read && st.books_read.length));
    });
  }

  function renderAuthorReadList() {
    const host = document.getElementById("authorReadList");
    const list = authorsEngaged();
    if (!list.length) {
      host.innerHTML = `<div class="empty">No ${currentGenre === "Science Fiction" ? "sci-fi" : "fantasy"} authors flagged yet. Go to <strong>Pick Authors</strong> and swipe a few as Ultimate.</div>`;
      return;
    }
    host.innerHTML = "";
    list.forEach(a => {
      const st = aState(a.id);
      const block = document.createElement("div");
      block.className = "author-block";
      block.innerHTML = `
        <div class="author-head">
          ${st.verdict === "top" ? '<span class="tag-top">ULTIMATE</span>' : ""}
          <div class="meta"><div class="nm">${esc(a.name)}</div><div class="kf">${esc(a.known_for)}</div></div>
          <a href="${a.goodreads_url}" target="_blank" rel="noopener">Goodreads ↗</a>
        </div>
        <div class="author-grid-wrap"><div class="author-loading">Loading books from OpenLibrary…</div><div class="grid-mount"></div></div>`;
      host.appendChild(block);

      const loading = block.querySelector(".author-loading");
      const mount = block.querySelector(".grid-mount");
      olAuthorBooks(a).then(books => {
        loading.style.display = "none";
        if (!books.length) { loading.style.display = ""; loading.textContent = "No books found on OpenLibrary for this author."; return; }
        // award badges + cross-mode read state (a book read in series mode shows here too)
        const reads = (window.SFFReads ? window.SFFReads.snapshot() : new Set());
        books.forEach(b => {
          if (window.SFFAwards) { const lbl = window.SFFAwards.label(b.title, a.name); if (lbl) b.badge = lbl; }
        });
        const initial = books
          .filter(b => (st.books_read || []).indexOf(b.id) !== -1 ||
                       (window.SFFReads && reads.has(window.SFFReads.key(b.title, a.name))))
          .map(b => b.id);
        grids[a.id] = GridReviewer.create({
          mount: mount,
          items: books,
          initial: initial,
          selectedLabel: "Read",
          onChange: (ids) => {
            st.books_read = ids;
            // persist meta for the selected books so the timeline survives offline
            const byId = {}; books.forEach(b => byId[b.id] = b);
            const meta = {};
            ids.forEach(id => { if (byId[id]) meta[id] = { title: byId[id].title, year: byId[id].year, cover_url: byId[id].cover_url, goodreads_url: byId[id].goodreads_url }; });
            st.books_meta = meta;
            saveStore();
          },
        });
      });
    });
  }

  // ---------------- Phase 3: author timeline ----------------
  function authorTimelineRows() {
    return genreAuthors().filter(a => {
      const st = STORE.authors[a.id];
      // include authors flagged ultimate OR with any read (in this or another mode)
      const merged = window.SFFReads ? window.SFFReads.readBooksByAuthor(a.name) : [];
      return (st && st.verdict === "top") || (st && st.books_read && st.books_read.length) || merged.length;
    }).map(a => {
      // merge read books across all modes (author grid + series mode), deduped by title
      const merged = window.SFFReads
        ? window.SFFReads.readBooksByAuthor(a.name)
        : (STORE.authors[a.id] && STORE.authors[a.id].books_read || []).map(id => (STORE.authors[a.id].books_meta || {})[id]).filter(Boolean);
      const books = merged.map(m => ({ id: m.title, title: m.title, year: m.year, cover_url: m.cover_url, read: true }));
      return { label: a.name, sublabel: a.known_for, books, _firstYear: books.length ? Math.min.apply(null, books.map(b => b.year)) : 9999 };
    }).filter(r => r.books.length)
      .sort((x, y) => x._firstYear - y._firstYear);
  }

  function renderAuthorTimeline() {
    const canvas = document.getElementById("authorTimelineCanvas");
    const stat = document.getElementById("atlStat");
    const rows = authorTimelineRows();
    if (!rows.length) {
      canvas.innerHTML = `<div class="empty">Nothing to plot yet. Flag Ultimate authors and mark some books read.</div>`;
      stat.textContent = "";
      return;
    }
    SFFTimeline.render(canvas, stat, rows, atlPxPerYear);
  }

  document.getElementById("atlZoom").addEventListener("input", (e) => { atlPxPerYear = +e.target.value; renderAuthorTimeline(); });
  document.getElementById("atlFit").addEventListener("click", () => {
    const rows = authorTimelineRows(); if (!rows.length) return;
    atlPxPerYear = SFFTimeline.fit(document.getElementById("authorTimelineCanvas"), rows);
    document.getElementById("atlZoom").value = atlPxPerYear;
    renderAuthorTimeline();
  });
  document.getElementById("atlPng").addEventListener("click", () => {
    SFFTimeline.exportPNG(authorTimelineRows(), atlPxPerYear,
      "sff_authors_" + (currentGenre === "Science Fiction" ? "scifi" : "fantasy") + "_timeline_" + new Date().toISOString().slice(0, 10) + ".png");
  });

  // ---------------- Data tab ----------------
  function renderAuthorData() {
    document.getElementById("aDataDump").textContent = JSON.stringify(STORE, null, 2);
    const top = Object.values(STORE.authors).filter(s => s.verdict === "top").length;
    const reads = Object.values(STORE.authors).reduce((n, s) => n + (s.books_read ? s.books_read.length : 0), 0);
    document.getElementById("aDataStat").textContent =
      `${top} ultimate authors · ${reads} books marked read · schema v${STORE.schema_version}` +
      (STORE.updated_at ? ` · updated ${new Date(STORE.updated_at).toLocaleString()}` : "");
  }
  document.getElementById("aExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(STORE, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sff_author_picks_" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
  });
  document.getElementById("aImport").addEventListener("click", () => document.getElementById("aFileInput").click());
  document.getElementById("aFileInput").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const obj = JSON.parse(fr.result);
        if (obj && obj.authors) { STORE = obj; saveStore(); renderAuthorData(); buildAuthorDeck(); alert("Imported."); }
        else alert("That file doesn't look like an author-picks export.");
      } catch (err) { alert("Could not parse JSON."); }
    };
    fr.readAsText(f);
  });
  document.getElementById("aReset").addEventListener("click", () => {
    if (!confirm("Erase all your author picks on this machine?")) return;
    STORE = { schema_version: SCHEMA_VERSION, updated_at: null, authors: {} };
    saveStore(); renderAuthorData(); buildAuthorDeck();
  });

  // ---------------- counts ----------------
  function refreshAuthorCounts() {
    const top = genreAuthors().filter(a => (STORE.authors[a.id] || {}).verdict === "top").length;
    const eng = authorsEngaged().length;
    document.getElementById("atabPickN").textContent = top ? `(${top}★)` : "";
    document.getElementById("atabReadN").textContent = eng ? `(${eng})` : "";
  }

  // expose for debugging / harness
  window.__SFF_AUTHORS_APP = { showMode, activateAuthorTab, authorTimelineRows, buildAuthorDeck };
})();
