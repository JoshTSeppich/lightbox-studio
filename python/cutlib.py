"""Shared mechanical cutting helpers (nothing in a drawing is ever changed: only cut, scaled as a whole, and moved)."""
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage.morphology import skeletonize

REGRID = str(Path(__file__).with_name("regrid.py"))


def ink(im):
    return np.asarray(im.convert("L")) < 150


def sil(im):
    return ndi.binary_fill_holes(ndi.binary_closing(ink(im), structure=np.ones((9, 9), bool)))


def split_rows(im, nrows=2):
    """Cut a sheet into rows at the emptiest band near each row boundary."""
    if nrows == 1:
        return [im]
    a = ink(im); H = a.shape[0]; rs = a.sum(axis=1); cuts = [0]
    for k in range(1, nrows):
        y0, y1 = int(H * (k / nrows - 0.12)), int(H * (k / nrows + 0.12))
        band = rs[y0:y1]; z = np.nonzero(band == band.min())[0]; cuts.append(y0 + int(z[len(z) // 2]))
    cuts.append(H)
    return [im.crop((0, cuts[i], im.width, cuts[i + 1])) for i in range(nrows)]


def split_rows_by_shape(im, nrows):
    """Like split_rows, but each separate drawn shape goes to the row its centre falls in, so a pose that reaches
    into the row above (a chair held overhead) is kept whole and nothing from a neighbouring row leaks in."""
    if nrows == 1:
        return [im]
    a = np.asarray(im.convert("RGB")); H = a.shape[0]
    s = sil(im); lab, n = ndi.label(s)
    cuts = [0] + [int(H * k / nrows) for k in range(1, nrows)] + [H]
    rows = []
    for r in range(nrows):
        keep = np.zeros(n + 1, bool)
        for i, (ys, xs) in enumerate(ndi.find_objects(lab), 1):
            cy = (ys.start + ys.stop) / 2
            if cuts[r] <= cy < cuts[r + 1]:
                keep[i] = True
        m = keep[lab]
        out = np.full_like(a, 255); out[m] = a[m]
        ys = np.nonzero(m.any(axis=1))[0]
        rows.append(Image.fromarray(out).crop((0, max(0, ys.min() - 10), im.width, min(H, ys.max() + 10))))
    return rows


def cells_of(row_im, cols):
    """regrid.py: every separate drawn shape goes to the column its centre falls in; returns one image per column."""
    with tempfile.TemporaryDirectory() as td:
        src, dst = Path(td) / "row.png", Path(td) / "grid.png"
        row_im.save(src)
        r = subprocess.run([sys.executable, REGRID, str(src), str(dst), str(cols)], capture_output=True, text=True)
        if r.returncode:
            sys.exit(r.stdout + r.stderr)
        g = Image.open(dst).convert("RGB"); g.load()
    cw = g.width // cols
    return [g.crop((i * cw, 0, (i + 1) * cw, g.height)) for i in range(cols)]


def sheet_cells(path, rows, cols):
    im = Image.open(path).convert("RGB")
    return [c for row in split_rows_by_shape(im, rows) for c in cells_of(row, cols)]


def box(im):
    ys, xs = np.nonzero(sil(im)); return int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())


def height(im):
    b = box(im); return b[1] - b[0]


def feet_x(im):
    s = sil(im); ys, xs = np.nonzero(s); low = ys >= ys.max() - (ys.max() - ys.min()) * 0.12
    return float((xs[low].min() + xs[low].max()) / 2)


def stroke_w(im):
    a = ink(im); sk = skeletonize(a)
    return float(a.sum() / max(1, sk.sum()))


def scaled(im, s):
    return im if abs(s - 1) < 0.005 else im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)


def assemble(frames, out):
    """frames: list of (label, image). One ground line, feet lined up, equal cells. Returns per-frame info."""
    boxes = [box(c) for _, c in frames]; xs = [feet_x(c) for _, c in frames]
    left = max(x - b[2] for x, b in zip(xs, boxes)) + 40; right = max(b[3] - x for x, b in zip(xs, boxes)) + 40
    W = int(left + right); H = int(max(b[1] - b[0] for b in boxes) + 70)
    strip = Image.new("RGB", (W * len(frames), H), "white"); info = []
    for i, ((lab, c), b, x) in enumerate(zip(frames, boxes, xs)):
        ox = i * W + int(round(left - x)); oy = int(H - 30 - b[1])
        y0, y1, x0, x1 = max(0, b[0] - 6), min(c.height, b[1] + 7), max(0, b[2] - 6), min(c.width, b[3] + 7)
        crop = c.crop((x0, y0, x1, y1))
        strip.paste(crop, (ox + x0, oy + y0))
        info.append({"frame": i + 1, "from": lab, "height": b[1] - b[0], "stroke_px": round(stroke_w(crop), 2)})
    strip.save(out)
    return info
