/* SFFTimeline — shared publication-year timeline used by both the series mode
 * and the author modes. Generic over "rows", each with a label and a list of
 * books that carry a year, a cover, and a read flag.
 *
 * rows: [{ label, sublabel, books: [{ id, title, year, cover_url?, read }] }]
 *
 * Renders sticky left labels + a horizontally scrollable track, supports a zoom
 * level (px per year), a fit-to-width helper, and a dependency-free PNG export
 * (drawn on a canvas so it works offline and dodges cross-origin cover tainting).
 */
(function (global) {
  "use strict";
  const LABEL_W = 200;
  const COLORS = { bg: "#14161c", panel: "#1d212c", line: "#2a3040",
                   text: "#eef1f7", muted: "#98a1b2", read: "#2fbf71", unread: "#e5484d" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function geometry(rows, pxPerYear) {
    let minY = Infinity, maxY = -Infinity;
    rows.forEach(r => r.books.forEach(b => { minY = Math.min(minY, b.year); maxY = Math.max(maxY, b.year); }));
    if (!isFinite(minY)) { minY = 2000; maxY = 2001; }
    minY -= 1; maxY += 1;
    const span = Math.max(1, maxY - minY);
    const trackWidth = span * pxPerYear + 80;
    const coverW = Math.max(14, Math.min(58, Math.round(pxPerYear * 1.05)));
    const coverH = Math.round(coverW * 1.5);
    const rowH = coverH + 44;
    const jitter = Math.max(6, Math.round(coverW * 0.32));
    const xFor = (yr) => ((yr - minY) / span) * (trackWidth - 70) + 35;
    return { minY, maxY, span, trackWidth, coverW, coverH, rowH, jitter, xFor };
  }

  function fit(canvasEl, rows) {
    const avail = (canvasEl.clientWidth || 900) - LABEL_W - 90;
    let minY = Infinity, maxY = -Infinity;
    rows.forEach(r => r.books.forEach(b => { minY = Math.min(minY, b.year); maxY = Math.max(maxY, b.year); }));
    if (!isFinite(minY)) return 46;
    const span = Math.max(1, (maxY + 1) - (minY - 1));
    return Math.max(6, Math.min(64, Math.floor(avail / span)));
  }

  function render(canvasEl, statEl, rows, pxPerYear, resolveImage) {
    if (!rows.length) {
      canvasEl.innerHTML = '<div class="empty">Nothing to plot yet.</div>';
      if (statEl) statEl.textContent = "";
      return null;
    }
    const g = geometry(rows, pxPerYear);
    const totalWidth = LABEL_W + g.trackWidth;
    if (statEl) statEl.textContent = `${rows.length} ${rows.length === 1 ? "row" : "rows"} · ${g.minY + 1}–${g.maxY - 1}`;

    const domMap = {};
    let dc = 0;
    const rowsHtml = rows.map(r => {
      const byYear = {};
      const covers = r.books.map(b => {
        byYear[b.year] = (byYear[b.year] || 0);
        const offset = byYear[b.year]++;
        const x = g.xFor(b.year) + offset * g.jitter;
        const domid = "tb" + (dc++);
        domMap[domid] = b;
        return `<div class="tl-book ${b.read ? "read" : ""}" data-domid="${domid}" style="left:${x}px; width:${g.coverW}px;">
            <div class="cov" style="width:${g.coverW}px; height:${g.coverH}px;"><span class="ph">${esc(b.title.slice(0, 22))}</span></div>
            <div class="yr">${b.year}</div>
          </div>`;
      }).join("");
      const years = r.books.map(b => b.year);
      const x1 = g.xFor(Math.min.apply(null, years)), x2 = g.xFor(Math.max.apply(null, years));
      return `<div class="tl-row" style="height:${g.rowH}px;">
          <div class="tl-label"><div class="nm">${esc(r.label)}</div><div class="au">${esc(r.sublabel || "")}</div></div>
          <div class="tl-track" style="width:${g.trackWidth}px;">
            <div class="tl-line" style="left:${x1}px; width:${Math.max(2, x2 - x1)}px;"></div>
            ${covers}
          </div>
        </div>`;
    }).join("");

    let ticks = "";
    const step = g.span > 60 ? 20 : g.span > 30 ? 10 : 5;
    const startTick = Math.ceil((g.minY + 1) / step) * step;
    for (let y = startTick; y < g.maxY; y += step)
      ticks += `<div class="tl-tick" style="left:${g.xFor(y)}px;">${y}</div>`;

    canvasEl.innerHTML = `<div style="width:${totalWidth}px;">${rowsHtml}
      <div class="tl-axis"><div class="tl-axis-spacer"></div>
        <div class="tl-axis-track" style="width:${g.trackWidth}px;">${ticks}</div></div></div>`;

    canvasEl.querySelectorAll(".tl-book").forEach(node => {
      const b = domMap[node.dataset.domid];
      const cov = node.querySelector(".cov");
      const setImg = (url) => {
        if (!url) return;
        const img = new Image();
        img.onload = () => { cov.innerHTML = ""; cov.appendChild(img); };
        img.src = url;
      };
      if (b.cover_url) setImg(b.cover_url);
      else if (typeof resolveImage === "function")
        Promise.resolve(resolveImage(b)).then(setImg).catch(() => {});
    });
    return g;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrapText(ctx, text, x, y, maxW, lh, maxLines, fromMiddle) {
    const words = String(text).split(/\s+/);
    const lines = []; let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
      else line = t;
      if (lines.length >= maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
      let last = lines[maxLines - 1];
      while (ctx.measureText(last + "…").width > maxW && last.length) last = last.slice(0, -1);
      lines[maxLines - 1] = last + "…";
    }
    const startY = fromMiddle ? y - (lines.length - 1) * lh / 2 : y;
    lines.forEach((ln, i) => ctx.fillText(ln, x, startY + i * lh));
  }

  function exportPNG(rows, pxPerYear, filename) {
    if (!rows.length) { alert("Nothing to export yet."); return; }
    const g = geometry(rows, pxPerYear);
    const DPR = 2, W = LABEL_W + g.trackWidth, H = rows.length * g.rowH + 40;
    const cv = document.createElement("canvas");
    cv.width = W * DPR; cv.height = H * DPR;
    const ctx = cv.getContext("2d");
    ctx.scale(DPR, DPR);
    const C = COLORS;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

    rows.forEach((r, ri) => {
      const top = ri * g.rowH, mid = top + g.rowH / 2;
      ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, top + g.rowH); ctx.lineTo(W, top + g.rowH); ctx.stroke();
      const years = r.books.map(b => b.year);
      const x1 = LABEL_W + g.xFor(Math.min.apply(null, years)), x2 = LABEL_W + g.xFor(Math.max.apply(null, years));
      ctx.strokeStyle = C.line; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x1, mid); ctx.lineTo(x2, mid); ctx.stroke();
      const byYear = {};
      r.books.forEach(b => {
        const off = (byYear[b.year] = (byYear[b.year] || 0), byYear[b.year]++);
        const cx = LABEL_W + g.xFor(b.year) + off * g.jitter;
        const w = g.coverW, h = g.coverH, x = cx - w / 2, y = mid - h / 2;
        ctx.fillStyle = C.panel; roundRect(ctx, x, y, w, h, 4); ctx.fill();
        ctx.strokeStyle = b.read ? C.read : C.unread; ctx.lineWidth = 3;
        roundRect(ctx, x, y, w, h, 4); ctx.stroke();
        ctx.fillStyle = C.muted; ctx.textAlign = "center";
        ctx.font = "8px -apple-system, Segoe UI, Roboto, sans-serif";
        wrapText(ctx, b.title, cx, y + 11, w - 6, 9, Math.max(2, Math.floor(h / 11) - 1));
        ctx.font = "9px -apple-system, Segoe UI, Roboto, sans-serif";
        ctx.fillText(String(b.year), cx, y + h + 11);
      });
      ctx.fillStyle = C.panel; ctx.fillRect(0, top, LABEL_W, g.rowH);
      ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(LABEL_W, top); ctx.lineTo(LABEL_W, top + g.rowH); ctx.stroke();
      ctx.textAlign = "left";
      ctx.fillStyle = C.text; ctx.font = "600 13px -apple-system, Segoe UI, Roboto, sans-serif";
      wrapText(ctx, r.label, 14, mid - 4, LABEL_W - 24, 15, 2, true);
      ctx.fillStyle = C.muted; ctx.font = "11px -apple-system, Segoe UI, Roboto, sans-serif";
      ctx.fillText((r.sublabel || "").slice(0, 26), 14, mid + 16);
    });

    const ay = rows.length * g.rowH;
    ctx.fillStyle = C.bg; ctx.fillRect(0, ay, W, 40);
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, ay); ctx.lineTo(W, ay); ctx.stroke();
    const step = g.span > 60 ? 20 : g.span > 30 ? 10 : 5;
    ctx.fillStyle = C.muted; ctx.font = "11px -apple-system, Segoe UI, Roboto, sans-serif"; ctx.textAlign = "center";
    for (let y = Math.ceil((g.minY + 1) / step) * step; y < g.maxY; y += step)
      ctx.fillText(String(y), LABEL_W + g.xFor(y), ay + 16);
    ctx.fillStyle = C.panel; ctx.fillRect(0, ay, LABEL_W, 40);

    cv.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename || ("timeline_" + new Date().toISOString().slice(0, 10) + ".png");
      a.click();
    }, "image/png");
  }

  const API = { LABEL_W, geometry, fit, render, exportPNG };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else global.SFFTimeline = API;
})(typeof window !== "undefined" ? window : this);
