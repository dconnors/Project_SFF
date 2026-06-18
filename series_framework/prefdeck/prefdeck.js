/*!
 * PrefDeck — a dependency-free image-preference deck.
 *
 * A reusable module that lets a user sweep through a set of N images and assign
 * each one a verdict (e.g. "yes / no / skip", or any custom set). Drag-to-swipe,
 * keyboard shortcuts, undo, progress, and a pluggable async image resolver.
 *
 * It knows nothing about books — feed it any items with an image and it works.
 * Used here for the SFF series demo, but designed to drop into other projects.
 *
 * Usage:
 *   const deck = PrefDeck.create({
 *     mount: document.querySelector('#deck'),  // element or selector
 *     items: [{ id, imageUrl, title, subtitle, meta, href, badges }],
 *     actions: [                               // 1..N verdict buttons
 *       { key:'yes',  label:'Yes', glyph:'✓', cls:'pd-pos', keys:['ArrowRight','d'] },
 *       { key:'no',   label:'No',  glyph:'✗', cls:'pd-neg', keys:['ArrowLeft','a'] },
 *       { key:'skip', label:'Skip',glyph:'↓', cls:'pd-neutral', keys:['ArrowDown','s'] },
 *     ],
 *     initial: { itemId: 'yes' },              // restore prior verdicts
 *     resolveImage: async (item) => urlOrNull, // optional lazy cover resolver
 *     onDecision: (id, verdict, item, all) => {},
 *     onChange:   (allVerdicts) => {},         // fires on every mutation
 *     onComplete: (allVerdicts) => {},
 *   });
 *
 * Public API: deck.verdicts(), deck.setVerdict(id,key), deck.undo(),
 *             deck.reset(), deck.goTo(index), deck.remaining(), deck.destroy().
 */
(function (global) {
  "use strict";

  const DEFAULT_ACTIONS = [
    { key: "yes",  label: "Yes",  glyph: "✓", cls: "pd-pos",     keys: ["ArrowRight", "d"] },
    { key: "no",   label: "No",   glyph: "✗", cls: "pd-neg",     keys: ["ArrowLeft", "a"] },
    { key: "skip", label: "Skip", glyph: "↓", cls: "pd-neutral", keys: ["ArrowDown", "s"] },
  ];

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function PrefDeck(opts) {
    this.opts = opts || {};
    this.mount = typeof opts.mount === "string"
      ? document.querySelector(opts.mount) : opts.mount;
    if (!this.mount) throw new Error("PrefDeck: mount element not found");

    this.items = (opts.items || []).slice();
    this.actions = (opts.actions || DEFAULT_ACTIONS).slice();
    this.verdictMap = Object.assign({}, opts.initial || {});
    this.history = [];            // [{id, prev}] for undo
    this.index = 0;               // pointer into items
    this._resolved = {};          // id -> resolved image url (cache)
    this._boundKey = null;

    this._buildShell();
    this._advanceToUndecided();
    this._render();
    this._bindKeys();
  }

  PrefDeck.prototype._buildShell = function () {
    this.mount.classList.add("pd-root");
    this.mount.innerHTML = "";

    this.progressEl = el("div", "pd-progress");
    this.barEl = el("div", "pd-bar");
    this.progressEl.appendChild(this.barEl);
    this.countEl = el("div", "pd-count");

    this.stage = el("div", "pd-stage");
    this.controls = el("div", "pd-controls");
    this.undoBtn = el("button", "pd-undo", "↶ Undo");
    this.undoBtn.type = "button";
    this.undoBtn.addEventListener("click", () => this.undo());

    // verdict buttons
    this.actions.forEach(a => {
      const b = el("button", "pd-action " + (a.cls || ""),
        `<span class="pd-glyph">${esc(a.glyph || "")}</span><span class="pd-label">${esc(a.label)}</span>`);
      b.type = "button";
      b.dataset.key = a.key;
      b.addEventListener("click", () => this.decideCurrent(a.key));
      this.controls.appendChild(b);
    });
    this.controls.appendChild(this.undoBtn);

    const top = el("div", "pd-top");
    top.appendChild(this.countEl);
    top.appendChild(this.progressEl);

    this.mount.appendChild(top);
    this.mount.appendChild(this.stage);
    this.mount.appendChild(this.controls);
  };

  PrefDeck.prototype._advanceToUndecided = function () {
    while (this.index < this.items.length &&
           this.verdictMap[this.items[this.index].id] != null) {
      this.index++;
    }
  };

  PrefDeck.prototype._render = function () {
    const total = this.items.length;
    const decided = Object.keys(this.verdictMap).length;
    this.barEl.style.width = total ? (decided / total * 100) + "%" : "0%";
    this.countEl.textContent = `${decided} / ${total} sorted`;
    this.undoBtn.disabled = this.history.length === 0;

    this.stage.innerHTML = "";
    const item = this.items[this.index];

    if (!item) {
      this.stage.appendChild(el("div", "pd-done",
        `<div class="pd-done-emoji">✦</div><div class="pd-done-title">All sorted</div>
         <div class="pd-done-sub">${decided} of ${total} reviewed.</div>`));
      this.controls.querySelectorAll(".pd-action").forEach(b => b.disabled = true);
      if (typeof this.opts.onComplete === "function") this.opts.onComplete(this.verdicts());
      return;
    }
    this.controls.querySelectorAll(".pd-action").forEach(b => b.disabled = false);

    // peek card behind for depth
    const next = this.items[this.index + 1];
    if (next) this.stage.appendChild(this._cardEl(next, true));
    const card = this._cardEl(item, false);
    this.stage.appendChild(card);
    this._enableDrag(card, item);
  };

  PrefDeck.prototype._cardEl = function (item, isPeek) {
    const card = el("div", "pd-card" + (isPeek ? " pd-peek" : ""));
    const imgWrap = el("div", "pd-img");
    const ph = el("div", "pd-img-ph", esc(item.title || "")); // placeholder shows while loading
    imgWrap.appendChild(ph);
    card.appendChild(imgWrap);

    const meta = el("div", "pd-meta");
    meta.innerHTML =
      (item.title ? `<div class="pd-title">${esc(item.title)}</div>` : "") +
      (item.subtitle ? `<div class="pd-sub">${esc(item.subtitle)}</div>` : "") +
      (item.meta ? `<div class="pd-extra">${esc(item.meta)}</div>` : "") +
      (Array.isArray(item.badges) && item.badges.length
        ? `<div class="pd-badges">${item.badges.map(b => `<span class="pd-badge">${esc(b)}</span>`).join("")}</div>`
        : "");
    card.appendChild(meta);

    // verdict stamp overlay (shown during drag)
    this.actions.forEach(a => {
      const stamp = el("div", "pd-stamp pd-stamp-" + a.key, esc(a.label));
      stamp.dataset.key = a.key;
      card.appendChild(stamp);
    });

    if (!isPeek) this._loadImage(item, imgWrap, ph);
    else this._loadImage(item, imgWrap, ph);
    return card;
  };

  PrefDeck.prototype._loadImage = function (item, wrap, ph) {
    const self = this;
    const set = (url) => {
      if (!url) return; // keep placeholder
      const img = new Image();
      img.alt = item.title || "";
      img.className = "pd-img-el";
      img.onload = () => { wrap.innerHTML = ""; wrap.appendChild(img); };
      img.onerror = () => { /* leave placeholder */ };
      img.src = url;
    };
    if (this._resolved[item.id]) return set(this._resolved[item.id]);
    if (item.imageUrl) { this._resolved[item.id] = item.imageUrl; return set(item.imageUrl); }
    if (typeof this.opts.resolveImage === "function") {
      Promise.resolve(this.opts.resolveImage(item)).then(url => {
        if (url) { self._resolved[item.id] = url; set(url); }
      }).catch(() => {});
    }
  };

  // ---- decisions ----------------------------------------------------------
  PrefDeck.prototype.decideCurrent = function (key, animate) {
    const item = this.items[this.index];
    if (!item) return;
    this._setVerdictInternal(item.id, key);
    this.history.push({ id: item.id, index: this.index });
    if (typeof this.opts.onDecision === "function")
      this.opts.onDecision(item.id, key, item, this.verdicts());

    const card = this.stage.querySelector(".pd-card:not(.pd-peek)");
    const dir = key === "no" ? -1 : (key === "yes" ? 1 : 0);
    if (card && animate !== false) {
      card.classList.add("pd-fly");
      card.style.transform = `translate(${dir * 140}%, ${dir ? -8 : 24}%) rotate(${dir * 18}deg)`;
      card.style.opacity = "0";
      const advance = () => { this.index++; this._advanceToUndecided(); this._render(); };
      let done = false;
      card.addEventListener("transitionend", () => { if (!done) { done = true; advance(); } }, { once: true });
      setTimeout(() => { if (!done) { done = true; advance(); } }, 320);
    } else {
      this.index++; this._advanceToUndecided(); this._render();
    }
  };

  PrefDeck.prototype._setVerdictInternal = function (id, key) {
    if (key == null) delete this.verdictMap[id];
    else this.verdictMap[id] = key;
    if (typeof this.opts.onChange === "function") this.opts.onChange(this.verdicts());
  };

  PrefDeck.prototype.setVerdict = function (id, key) {
    this._setVerdictInternal(id, key);
    this._render();
  };

  PrefDeck.prototype.undo = function () {
    const last = this.history.pop();
    if (!last) return;
    this._setVerdictInternal(last.id, null);
    this.index = last.index;
    this._render();
  };

  PrefDeck.prototype.reset = function () {
    this.verdictMap = {};
    this.history = [];
    this.index = 0;
    if (typeof this.opts.onChange === "function") this.opts.onChange(this.verdicts());
    this._render();
  };

  PrefDeck.prototype.goTo = function (i) {
    this.index = Math.max(0, Math.min(i, this.items.length));
    this._render();
  };

  PrefDeck.prototype.verdicts = function () { return Object.assign({}, this.verdictMap); };
  PrefDeck.prototype.remaining = function () {
    return this.items.filter(it => this.verdictMap[it.id] == null).length;
  };

  // ---- drag / swipe -------------------------------------------------------
  PrefDeck.prototype._enableDrag = function (card, item) {
    if (this.opts.enableSwipe === false) return;
    const self = this;
    let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false;

    const onDown = (e) => {
      dragging = true;
      const p = e.touches ? e.touches[0] : e;
      startX = p.clientX; startY = p.clientY;
      card.classList.add("pd-dragging");
    };
    const onMove = (e) => {
      if (!dragging) return;
      const p = e.touches ? e.touches[0] : e;
      dx = p.clientX - startX; dy = p.clientY - startY;
      card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
      // light up the matching stamp
      const yes = card.querySelector(".pd-stamp-yes");
      const no = card.querySelector(".pd-stamp-no");
      const skip = card.querySelector(".pd-stamp-skip");
      if (yes) yes.style.opacity = dx > 40 ? Math.min(1, dx / 120) : 0;
      if (no) no.style.opacity = dx < -40 ? Math.min(1, -dx / 120) : 0;
      if (skip) skip.style.opacity = dy > 60 ? Math.min(1, dy / 120) : 0;
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      card.classList.remove("pd-dragging");
      const TH = 90;
      let key = null;
      if (dx > TH) key = "yes";
      else if (dx < -TH) key = "no";
      else if (dy > TH) key = (self.actions.find(a => a.key === "skip") ? "skip" : null);
      if (key && self.actions.find(a => a.key === key)) {
        self.decideCurrent(key);
      } else {
        card.style.transform = "";
        card.querySelectorAll(".pd-stamp").forEach(s => s.style.opacity = 0);
      }
      dx = dy = 0;
    };

    card.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    card.addEventListener("touchstart", onDown, { passive: true });
    card.addEventListener("touchmove", onMove, { passive: true });
    card.addEventListener("touchend", onUp);
    // store removers so destroy() can clean up
    this._dragCleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  };

  // ---- keyboard -----------------------------------------------------------
  PrefDeck.prototype._bindKeys = function () {
    if (this.opts.enableKeyboard === false) return;
    const map = {};
    this.actions.forEach(a => (a.keys || []).forEach(k => map[k] = a.key));
    this._boundKey = (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if ((e.key === "z" && (e.metaKey || e.ctrlKey)) || e.key === "Backspace") {
        e.preventDefault(); this.undo(); return;
      }
      const k = map[e.key];
      if (k) { e.preventDefault(); this.decideCurrent(k); }
    };
    document.addEventListener("keydown", this._boundKey);
  };

  PrefDeck.prototype.destroy = function () {
    if (this._boundKey) document.removeEventListener("keydown", this._boundKey);
    if (this._dragCleanup) this._dragCleanup();
    this.mount.innerHTML = "";
    this.mount.classList.remove("pd-root");
  };

  // ---- export -------------------------------------------------------------
  const API = {
    create: (opts) => new PrefDeck(opts),
    DEFAULT_ACTIONS,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else global.PrefDeck = API;
})(typeof window !== "undefined" ? window : this);
