"""Cut a sheet of drawings (rows x cols, read left to right, top to bottom) into frames that share one canvas,
one ground line and lined-up feet. Nothing inside a drawing is changed: drawings are only cut out and moved.

usage: sheet_to_frames.py SHEET.png ROWS COLS OUT_DIR [--name NAME] [--hold 2] [--skip 1,6]

Writes to OUT_DIR:
  NAME_strip.png        all drawings side by side in equal cells (white paper)
  NAME_f1.png ...       one transparent PNG per drawing
  NAME.json             drawing count, cell size, per-drawing height and line width, and the hold (frames per drawing)
--skip drops cells (1-based), e.g. copies of neighbouring keys on an in-between sheet.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

from cutlib import assemble, sheet_cells

ap = argparse.ArgumentParser()
ap.add_argument("sheet")
ap.add_argument("rows", type=int)
ap.add_argument("cols", type=int)
ap.add_argument("out")
ap.add_argument("--name", default=None)
ap.add_argument("--hold", type=int, default=2)
ap.add_argument("--skip", default="")
a = ap.parse_args()

out = Path(a.out)
out.mkdir(parents=True, exist_ok=True)
name = a.name or Path(a.sheet).stem
skip = {int(s) for s in a.skip.split(",") if s.strip()}

cells = sheet_cells(a.sheet, a.rows, a.cols)
draw = [(f"D{i + 1}", c) for i, c in enumerate(cells) if i + 1 not in skip]
strip_path = out / f"{name}_strip.png"
info = assemble(draw, str(strip_path))

strip = Image.open(strip_path).convert("L")
n = len(draw)
cw = strip.width // n
for i in range(n):
    cell = np.asarray(strip.crop((i * cw, 0, (i + 1) * cw, strip.height)))
    rgba = np.zeros((*cell.shape, 4), np.uint8)
    rgba[..., 3] = 255 - cell          # ink becomes opaque, paper becomes transparent
    Image.fromarray(rgba, "RGBA").save(out / f"{name}_f{i + 1}.png")

(out / f"{name}.json").write_text(json.dumps({
    "source": str(a.sheet), "grid": [a.rows, a.cols], "skipped": sorted(skip),
    "drawings": n, "cell": [cw, strip.height], "hold": [a.hold] * n, "per_drawing": info,
}, indent=1))
print(json.dumps({"ok": True, "drawings": n, "out": str(out), "strip": str(strip_path)}))
