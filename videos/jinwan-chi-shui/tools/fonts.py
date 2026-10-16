"""Subset the display/UI fonts to the glyphs this film uses.

Scans index.html and assets/js/*.js for characters, then writes woff2 files
to assets/fonts/. Re-run after any copy change.
usage: python fonts.py <dir with source ttf files>
"""
import glob
import os
import sys

from fontTools import subset

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = sys.argv[1]

text = set()
files = [os.path.join(ROOT, "index.html")] + glob.glob(os.path.join(ROOT, "assets", "js", "*.js"))
for p in files:
    with open(p, encoding="utf-8") as fh:
        text.update(fh.read())
text.update(chr(c) for c in range(0x20, 0x7F))
text.update("¥·—…“”‘’《》「」『』【】、，。！？：；（）～▲▼★☆✓✔→←↑↓％")
chars = "".join(sorted(c for c in text if c.isprintable()))

FONTS = {
    "NotoSansSC.ttf": "noto-sc.woff2",
    "ZCOOLKuaiLe.ttf": "kuaile.woff2",
    "ZCOOLQingKeHuangYou.ttf": "huangyou.woff2",
    "Fredoka.ttf": "fredoka.woff2",
}
out_dir = os.path.join(ROOT, "assets", "fonts")
os.makedirs(out_dir, exist_ok=True)
for src, dst in FONTS.items():
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    font = subset.load_font(os.path.join(SRC, src), opts)
    sub = subset.Subsetter(opts)
    sub.populate(text=chars)
    sub.subset(font)
    subset.save_font(font, os.path.join(out_dir, dst), opts)
    print(dst, os.path.getsize(os.path.join(out_dir, dst)) // 1024, "KB")
print(len(chars), "chars")
