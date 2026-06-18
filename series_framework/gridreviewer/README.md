# GridReviewer

The grid companion to [PrefDeck](../prefdeck/). Where PrefDeck shows one card at a
time for fast triage, GridReviewer lays out **all** items at once in a responsive
grid so the user can scan everything and click to toggle a binary state — e.g.
"I have read this" (green outline) vs not (red outline). Dependency-free, reusable
for any set of N images.

## Files

- `gridreviewer.js` — UMD module (`window.GridReviewer` or `module.exports`).
- `gridreviewer.css` — theme via CSS variables on `.gr-root`.

## Quick start

```html
<link rel="stylesheet" href="gridreviewer.css">
<div id="grid"></div>
<script src="gridreviewer.js"></script>
<script>
  const grid = GridReviewer.create({
    mount: "#grid",
    items: [
      { id: "a", imageUrl: "a.jpg", title: "Book A", subtitle: "1990", href: "https://..." },
      { id: "b", imageUrl: "b.jpg", title: "Book B", subtitle: "1994" },
    ],
    initial: ["a"],                         // pre-selected
    selectedLabel: "Read",
    onChange: (ids) => console.log(ids),    // ["a", ...]
  });
</script>
```

## Config

| option | type | notes |
|---|---|---|
| `mount` | selector/element | **required** |
| `items` | array | `{ id, imageUrl?, title?, subtitle?, meta?, href? }` |
| `initial` | string[] | ids that start selected |
| `selectedLabel` | string | chip text on selected cells (default `✓`) |
| `resolveImage` | `(item) => url \| Promise<url>` | lazy image resolver when `imageUrl` absent |
| `onToggle` | `(id, selected, item, all)` | per-click |
| `onChange` | `(allSelectedIds)` | any change |

## API

```js
grid.selected()            // -> ["id", ...]
grid.isSelected(id)
grid.setSelected(id, bool)
grid.selectAll(bool)
grid.setItems(items, initial)   // swap the whole grid (e.g. a different author)
grid.destroy()
```

## Theming

Variables on `.gr-root`: `--gr-card`, `--gr-text`, `--gr-muted`, `--gr-line`,
`--gr-on` (selected outline), `--gr-off` (unselected outline), `--gr-cell` (min
cell width — controls how many columns fit).
