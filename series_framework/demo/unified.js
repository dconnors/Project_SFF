/* SFFReads + SFFAwards — cross-mode read identity and award lookup.
 *
 * A book is identified by a normalized "title||author" key (same normalization as
 * build_awards.py). This lets a "read" mark made in ANY mode (series, sci-fi author,
 * fantasy author) show up everywhere the same book appears, and lets Hugo/Nebula
 * award status from readmore attach to matched books.
 *
 * Reads are derived live from both localStorage stores — no extra storage, no sync
 * to keep in step. SFFReads never mutates the stores.
 */
(function (global) {
  "use strict";
  const SERIES_KEY = "sff_picks_v1";
  const AUTHOR_KEY = "sff_author_picks_v1";
  const ARTICLES = ["the ", "a ", "an "];

  var DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
  function stripAccents(s) {
    return String(s).normalize("NFKD").replace(DIACRITICS, "");
  }
  function normTitle(t) {
    let s = stripAccents(t).toLowerCase().replace(/&/g, " and ");
    s = s.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
    for (const a of ARTICLES) if (s.startsWith(a)) { s = s.slice(a.length); break; }
    return s.trim();
  }
  function normAuthor(a) {
    let s = stripAccents(a).toLowerCase().replace(/\./g, " ");
    return s.split(/\s+/).filter(t => t.length > 1 || /\d/.test(t)).join(" ");
  }
  function key(title, author) { return normTitle(title) + "||" + normAuthor(author); }

  function parse(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }

  // ---- maps over the static datasets ----
  let _seriesBookById = null, _seriesByAuthorNorm = null, _authorNameById = null;
  function ensureMaps() {
    if (_seriesBookById) return;
    _seriesBookById = {};
    _seriesByAuthorNorm = {};
    const D = global.SFF_DATA;
    if (D && D.series) {
      D.series.forEach(s => {
        (_seriesByAuthorNorm[normAuthor(s.author)] = _seriesByAuthorNorm[normAuthor(s.author)] || []).push(s);
        s.books.forEach(b => { _seriesBookById[b.id] = { title: b.title, year: b.year, cover_url: b.cover_url, author: s.author }; });
      });
    }
    _authorNameById = {};
    const A = global.SFF_AUTHORS;
    if (A && A.authors) A.authors.forEach(a => { _authorNameById[a.id] = a.name; });
  }

  // ---- the union of read book keys across both stores ----
  function snapshot() {
    ensureMaps();
    const set = new Set();
    const ser = parse(SERIES_KEY);
    if (ser && ser.series) {
      Object.keys(ser.series).forEach(sid => {
        (ser.series[sid].books_read || []).forEach(bid => {
          const b = _seriesBookById[bid];
          if (b) set.add(key(b.title, b.author));
        });
      });
    }
    const auth = parse(AUTHOR_KEY);
    if (auth && auth.authors) {
      Object.keys(auth.authors).forEach(aid => {
        const name = _authorNameById[aid] || "";
        const st = auth.authors[aid];
        (st.books_read || []).forEach(bid => {
          const m = (st.books_meta || {})[bid];
          if (m && name) set.add(key(m.title, name));
        });
      });
    }
    return set;
  }

  // All read books attributed to an author (merged across both stores), deduped.
  function readBooksByAuthor(name) {
    ensureMaps();
    const out = {}; // normTitle -> {title,year,cover_url}
    const na = normAuthor(name);
    const ser = parse(SERIES_KEY);
    if (ser && ser.series) {
      (_seriesByAuthorNorm[na] || []).forEach(s => {
        const st = ser.series[s.id];
        if (!st) return;
        (st.books_read || []).forEach(bid => {
          const b = _seriesBookById[bid];
          if (b) out[normTitle(b.title)] = { title: b.title, year: b.year, cover_url: b.cover_url };
        });
      });
    }
    const auth = parse(AUTHOR_KEY);
    if (auth && auth.authors) {
      Object.keys(auth.authors).forEach(aid => {
        if (normAuthor(_authorNameById[aid] || "") !== na) return;
        const st = auth.authors[aid];
        (st.books_read || []).forEach(bid => {
          const m = (st.books_meta || {})[bid];
          if (m) { const k = normTitle(m.title); if (!out[k] || !out[k].cover_url) out[k] = { title: m.title, year: m.year, cover_url: m.cover_url }; }
        });
      });
    }
    return Object.values(out).filter(b => b.year);
  }

  // ---- awards ----
  function awardLookup(title, author) {
    const A = global.SFF_AWARDS;
    if (!A || !A.index) return null;
    return A.index[key(title, author)] || null;
  }
  // short label, e.g. "Hugo ★ · Nebula"
  function awardLabel(title, author) {
    const a = awardLookup(title, author);
    if (!a) return "";
    const names = { hugo: "Hugo", nebula: "Nebula", retro_hugo: "Retro Hugo" };
    return Object.keys(a).map(k => (names[k] || k) + (a[k] === "winner" ? " ★" : "")).join(" · ");
  }

  const API = { normTitle, normAuthor, key, snapshot, readBooksByAuthor };
  const AwardsAPI = { lookup: awardLookup, label: awardLabel };
  if (typeof module !== "undefined" && module.exports) module.exports = { SFFReads: API, SFFAwards: AwardsAPI };
  else { global.SFFReads = API; global.SFFAwards = AwardsAPI; }
})(typeof window !== "undefined" ? window : this);
