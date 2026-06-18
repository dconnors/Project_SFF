# PrefDeck

A dependency-free, framework-agnostic **image-preference deck**. Drop it into any
project where a user should sweep through a set of *N* pictures and tag each one
(like / dislike / skip, or any custom set of verdicts). Drag-to-swipe, keyboard
shortcuts, undo, progress bar, and a pluggable async image resolver.

It knows nothing about books. Feed it any items that have an image and it works —
photos, products, logos, candidate headshots, anything.

## Files

- `prefdeck.js` — the module (UMD: sets `window.PrefDeck`, or `module.exports`).
- `prefdeck.css` — styling, themeable via CSS variables on `.pd-root`.

No build step, no dependencies. Works from `file://` in any modern browser.

## Quick start

```html
<link rel="stylesheet" href="prefdeck.css">
<div id="deck"></div>
<script src="prefdeck.js"></script>
<script>
  const deck = PrefDeck.create({
    mount: "#deck",
    items: [
      { id: "a", imageUrl: "a.jpg", title: "First",  subtitle: "caption" },
      { id: "b", imageUrl: "b.jpg", title: "Second", subtitle: "caption" },
    ],
    onChange: (verdicts) => console.log(verdicts), // { a: "yes", ... }
  });
</script>
```

## Config

| option | type | notes |
|---|---|---|
| `mount` | selector or element | **required** — where to render |
| `items` | array | `{ id, imageUrl?, title?, subtitle?, meta?, badges?, href? }` |
| `actions` | array | verdict buttons; default `yes / no / skip`. Each: `{ key, label, glyph?, cls?, keys? }` where `keys` are keyboard shortcuts |
| `initial` | object | `{ itemId: verdictKey }` to restore prior state |
| `resolveImage` | `(item) => url \| Promise<url>` | lazy cover resolver used when `item.imageUrl` is absent |
| `enableSwipe` | bool | default `true` |
| `enableKeyboard` | bool | default `true` |
| `onDecision` | `(id, verdict, item, all)` | fired per card decision |
| `onChange` | `(all)` | fired on every mutation (decide / undo / reset) |
| `onComplete` | `(all)` | fired when the deck is exhausted |

### Custom verdicts (any N)

```js
actions: [
  { key: "love", label: "Love", glyph: "♥", cls: "pd-pos",     keys: ["ArrowRight"] },
  { key: "meh",  label: "Meh",  glyph: "–", cls: "pd-neutral", keys: ["ArrowDown"] },
  { key: "nope", label: "Nope", glyph: "✗", cls: "pd-neg",     keys: ["ArrowLeft"] },
]
```

Swipe gestures map to `yes` (right), `no` (left), and `skip` (down) when those
keys exist; otherwise use the buttons/keyboard for custom verdicts.

## API

```js
deck.verdicts()           // -> { id: verdictKey, ... }
deck.setVerdict(id, key)  // set/override; pass null to clear
deck.undo()               // also Cmd/Ctrl-Z or Backspace
deck.reset()
deck.goTo(index)
deck.remaining()          // count of unsorted items
deck.destroy()            // unbind + clear
```

## Theming

Override any variable on `.pd-root` (or a wrapper) — `--pd-bg`, `--pd-card`,
`--pd-text`, `--pd-pos`, `--pd-neg`, `--pd-neutral`, `--pd-accent`, `--pd-radius`.

## Persistence

PrefDeck holds verdicts in memory and reports them via `onChange`. Persist them
however you like — `localStorage`, a JSON download, or a backend. The SFF demo in
`../demo/` shows a `localStorage` + JSON-export pattern that survives a schema
evolving over time (each saved blob carries a `schema_version`).
