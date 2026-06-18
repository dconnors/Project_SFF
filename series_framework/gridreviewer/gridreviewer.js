/*!
 * GridReviewer — a dependency-free grid of images with a binary toggle.
 *
 * The companion to PrefDeck: instead of one-card-at-a-time swiping, it lays out
 * ALL items at once in a responsive grid so the user can scan everything and
 * click to toggle a state (e.g. "I have read this" → green outline). Reusable for
 * any set of N images, not just books.
 *
 * Usage:
 *   const grid = GridReviewer.create({
 *     mount: "#grid",
 *     items: [{ id, imageUrl, title, subtitle, meta, href }],
 *     initial: ["id1", "id2"],                  // pre-selected ids
 *     resolveImage: (item) => urlOrPromise,      // optional lazy resolver
 *     selectedLabel: "Read",                     // chip shown on selected cells
 *     onToggle: (id, selected, item, all) => {},
 *     onChange: (allSelectedIds) => {},
 *   });
 *
 * API: grid.selected(), grid.isSelected(id), grid.setSelected(id, bool),
 *      grid.selectAll(bool), grid.setItems(items, initial), grid.destroy().
 */
(function (global) {
  "use strict";

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function GridReviewer(opts) {
    this.opts = opts || {};
    this.mount = typeof opts.mount === "string" ? document.querySelector(opts.mount) : opts.mount;
    if (!this.mount) throw new Error("GridReviewer: mount not found");
    this.items = (opts.items || []).slice();
    this.sel = new Set(opts.initial || []);
    this.selectedLabel = opts.selectedLabel || "✓";
    this._resolved = {};
    this.mount.classList.add("gr-root");
    this._render();
  }

  GridReviewer.prototype._render = function () {
    this.mount.innerHTML = "";
    if (!this.items.length) {
      this.mount.appendChild(el("div", "gr-empty", "Nothing to show."));
      return;
    }
    const grid = el("div", "gr-grid");
    this.items.forEach(item => grid.appendChild(this._cell(item)));
    this.mount.appendChild(grid);
  };

  GridReviewer.prototype._cell = function (item) {
    const cell = el("div", "gr-cell" + (this.sel.has(item.id) ? " gr-on" : ""));
    cell.dataset.id = item.id;

    const cov = el("div", "gr-cov");
    cov.appendChild(el("span", "gr-ph", esc(item.title || "")));
    cov.appendChild(el("div", "gr-check", esc(this.selectedLabel)));
    if (item.badge) cov.appendChild(el("div", "gr-badge", esc(item.badge)));
    cell.appendChild(cov);

    const meta = el("div", "gr-meta",
      (item.title ? `<div class="gr-title">${esc(item.title)}</div>` : "") +
      (item.subtitle ? `<div class="gr-sub">${esc(item.subtitle)}</div>` : "") +
      (item.meta ? `<div class="gr-extra">${esc(item.meta)}</div>` : ""));
    cell.appendChild(meta);

    if (item.href) {
      const a = el("a", "gr-link", "↗");
      a.href = item.href; a.target = "_blank"; a.rel = "noopener";
      a.title = "Open reference";
      a.addEventListener("click", e => e.stopPropagation());
      cell.appendChild(a);
    }

    cell.addEventListener("click", () => this.toggle(item.id));
    this._loadImage(item, cov);
    return cell;
  };

  GridReviewer.prototype._loadImage = function (item, cov) {
    const self = this;
    const set = (url) => {
      if (!url) return;
      const img = new Image();
      img.alt = item.title || "";
      img.className = "gr-img";
      img.onload = () => { const ph = cov.querySelector(".gr-ph"); if (ph) ph.remove(); cov.insertBefore(img, cov.firstChild); };
      img.src = url;
    };
    if (this._resolved[item.id]) return set(this._resolved[item.id]);
    if (item.imageUrl) { this._resolved[item.id] = item.imageUrl; return set(item.imageUrl); }
    if (typeof this.opts.resolveImage === "function") {
      Promise.resolve(this.opts.resolveImage(item)).then(u => { if (u) { self._resolved[item.id] = u; set(u); } }).catch(() => {});
    }
  };

  GridReviewer.prototype.toggle = function (id) {
    const on = !this.sel.has(id);
    this.setSelected(id, on);
  };
  GridReviewer.prototype.setSelected = function (id, on) {
    if (on) this.sel.add(id); else this.sel.delete(id);
    const cell = this.mount.querySelector('.gr-cell[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    if (cell) cell.classList.toggle("gr-on", on);
    const item = this.items.find(i => i.id === id);
    if (typeof this.opts.onToggle === "function") this.opts.onToggle(id, on, item, this.selected());
    if (typeof this.opts.onChange === "function") this.opts.onChange(this.selected());
  };
  GridReviewer.prototype.selectAll = function (on) {
    this.items.forEach(i => { if (on) this.sel.add(i.id); else this.sel.delete(i.id); });
    this._render();
    if (typeof this.opts.onChange === "function") this.opts.onChange(this.selected());
  };
  GridReviewer.prototype.isSelected = function (id) { return this.sel.has(id); };
  GridReviewer.prototype.selected = function () { return [...this.sel]; };
  GridReviewer.prototype.setItems = function (items, initial) {
    this.items = (items || []).slice();
    if (initial) this.sel = new Set(initial);
    this._resolved = {};
    this._render();
  };
  GridReviewer.prototype.destroy = function () {
    this.mount.innerHTML = "";
    this.mount.classList.remove("gr-root");
  };

  const API = { create: (o) => new GridReviewer(o) };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else global.GridReviewer = API;
})(typeof window !== "undefined" ? window : this);
