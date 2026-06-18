# -*- coding: utf-8 -*-
"""
Bundle the demo into ONE self-contained HTML file (demo/SFF_Series_Demo.html)
so it runs by double-clicking with zero external file dependencies — the most
reliable way to open from file:// on macOS.
"""
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEMO = os.path.join(ROOT, "demo")


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


html = read(os.path.join(DEMO, "index.html"))

# inline every local stylesheet (link) and script (src), in place
css_map = {
    '<link rel="stylesheet" href="../prefdeck/prefdeck.css">':
        os.path.join(ROOT, "prefdeck", "prefdeck.css"),
    '<link rel="stylesheet" href="../gridreviewer/gridreviewer.css">':
        os.path.join(ROOT, "gridreviewer", "gridreviewer.css"),
}
js_map = {
    '<script src="series_data.js"></script>': os.path.join(DEMO, "series_data.js"),
    '<script src="authors_data.js"></script>': os.path.join(DEMO, "authors_data.js"),
    '<script src="awards_data.js"></script>': os.path.join(DEMO, "awards_data.js"),
    '<script src="../prefdeck/prefdeck.js"></script>': os.path.join(ROOT, "prefdeck", "prefdeck.js"),
    '<script src="../gridreviewer/gridreviewer.js"></script>': os.path.join(ROOT, "gridreviewer", "gridreviewer.js"),
    '<script src="timeline.js"></script>': os.path.join(DEMO, "timeline.js"),
    '<script src="unified.js"></script>': os.path.join(DEMO, "unified.js"),
    '<script src="app.js"></script>': os.path.join(DEMO, "app.js"),
    '<script src="authors_app.js"></script>': os.path.join(DEMO, "authors_app.js"),
}
for tag, path in css_map.items():
    assert tag in html, f"missing css tag: {tag}"
    html = html.replace(tag, "<style>\n" + read(path) + "\n</style>")
for tag, path in js_map.items():
    assert tag in html, f"missing script tag: {tag}"
    html = html.replace(tag, "<script>\n" + read(path) + "\n</script>")

# sanity: no external local refs remain
leftover = [r for r in re.findall(r'(?:src|href)="(?!https?:|#)([^"]+)"', html)
            if "${" not in r]
assert not leftover, f"unbundled local refs remain: {leftover}"

out = os.path.join(DEMO, "SFF_Series_Demo.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(html)

# Also emit a deploy-ready drop-in for the readmore site/ directory:
#   copy dist/sff/  ->  <readmore>/site/sff/   (served at /sff/)
dist = os.path.join(ROOT, "dist", "sff")
os.makedirs(dist, exist_ok=True)
with open(os.path.join(dist, "index.html"), "w", encoding="utf-8") as f:
    f.write(html)

print("wrote", out, f"({len(html)//1024} KB, self-contained)")
print("wrote", os.path.join(dist, "index.html"), "(drop-in for <readmore>/site/sff/)")
