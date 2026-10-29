"""A 30-drawing move from three ChatGPT sheets (3x4 = 1-12, 3x4 = 13-24, 2x3 = 25-30) -> 60 frames on twos at 12 fps.
Nothing in a drawing is changed. Sheets 2 and 3 are scaled as a whole to match sheet 1, using the sneakers (the width of
the planted feet, median over the sheet), which stay the same size whatever the pose does; then one ground line,
feet lined up.
usage: move30.py OUT.png S1.png S2.png S3.png
"""
import json
import sys
from pathlib import Path

import numpy as np

from cutlib import assemble, scaled, sheet_cells, sil


def feet_w(im):
    s = sil(im); ys, xs = np.nonzero(s); low = ys >= ys.max() - (ys.max() - ys.min()) * 0.10
    return float(xs[low].max() - xs[low].min())


out, s1, s2, s3 = sys.argv[1:5]
A, B, C = sheet_cells(s1, 3, 4), sheet_cells(s2, 3, 4), sheet_cells(s3, 2, 3)
ref = np.median([feet_w(c) for c in A])
sc = {}
for name, cs in (("s2", B), ("s3", C)):
    sc[name] = float(ref / np.median([feet_w(c) for c in cs]))
B = [scaled(c, sc["s2"]) for c in B]; C = [scaled(c, sc["s3"]) for c in C]
draw = [(f"D{i + 1}", c) for i, c in enumerate(A + B + C)]
info = assemble(draw, str(Path(out).with_name(Path(out).stem + "_drawings.png")))
assemble([d for d in draw for _ in (0, 1)], out)
Path(out).with_suffix(".json").write_text(json.dumps({"sheets": [s1, s2, s3], "scale_to_sheet1": sc, "drawings": info,
                                                    "frames": "30 drawings on twos: 60 frames at 12 fps = 5 s"}, indent=1))
print("scales", {k: round(v, 3) for k, v in sc.items()}, "heights", [i["height"] for i in info])
