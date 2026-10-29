"""Re-space a ChatGPT strip whose drawings spill over their column lines, so kit.py can slice it evenly.
Nothing in a drawing is changed or moved within its frame.

usage: regrid.py SRC.png OUT.png N [--main-only K,K,...] [--keep 1,2,...]

- Finds every separate drawn shape (outline filled in, like kit.py's cutout).
- Gives each shape to the column its centre falls in (ChatGPT centres one pose per column).
- Lays the N columns out again with wide margins, each shape at the same place relative to its own
  column as in the original, so a pose that leans past its column line is no longer cut.
- --main-only K,...: in those frames (1-based) keep only the biggest shape and what touches it, dropping
  separate objects drawn in the air (e.g. a thrown bottle the game animates itself).
- --keep 1,2,...: write only these frames (1-based), in this order.
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

args = sys.argv[1:]
src, out, n = args[0], args[1], int(args[2])
main_only = {int(k) for k in args[args.index("--main-only") + 1].split(",")} if "--main-only" in args else set()
keep = [int(k) for k in args[args.index("--keep") + 1].split(",")] if "--keep" in args else list(range(1, n + 1))

im = Image.open(src).convert("RGB")
a = np.asarray(im)
H, W = a.shape[:2]
cw = W / n
ink = a.min(axis=2) < 150
sil = ndi.binary_fill_holes(ndi.binary_closing(ink, structure=np.ones((9, 9), bool)))
sil = ndi.binary_dilation(sil, iterations=3)
lab, k = ndi.label(sil, structure=np.ones((3, 3)))
sizes = ndi.sum(sil, lab, range(1, k + 1))
coms = ndi.center_of_mass(sil, lab, range(1, k + 1))

cols = {c: [] for c in range(n)}
for i in range(k):
    if sizes[i] < 60:            # specks
        continue
    c = min(n - 1, max(0, int(coms[i][1] // cw)))
    cols[c].append(i + 1)

pad = int(cw * 0.5)
cell = int(round(cw)) + 2 * pad
res = Image.new("RGB", (cell * len(keep), H), "white")
r = np.asarray(res).copy()
for slot, fnum in enumerate(keep):
    c = fnum - 1
    ids = cols[c]
    if fnum in main_only and ids:
        big = max(ids, key=lambda j: sizes[j - 1])
        ids = [big]
    m = np.isin(lab, ids)
    ys, xs = np.nonzero(m)
    dx = slot * cell + pad - int(round(c * cw))
    nx = xs + dx
    ok = (nx >= slot * cell) & (nx < (slot + 1) * cell)
    if not ok.all():
        print(f"  frame {fnum}: {int((~ok).sum())} px still past the margin (dropped)")
    r[ys[ok], nx[ok]] = a[ys[ok], xs[ok]]
    print(f"frame {fnum}: {len(cols[c])} shapes, kept {len(ids)}, x {xs.min()}-{xs.max()} (column {int(c*cw)}-{int((c+1)*cw)})")
Image.fromarray(r).save(out)
print(out, res.size)
