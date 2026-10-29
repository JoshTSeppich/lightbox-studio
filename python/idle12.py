"""12-pose idle, played on twos: 24 frames at 12 fps = 2 s. Nothing in a drawing is changed.

usage: idle12.py OUT.png KEYSHEET.png HALF2_2TO3.png HALF3_3TO4.png SECONDHALF6.png
  KEYSHEET: the 2x4 no-tongue key sheet (keys 1-8).
  HALF2_2TO3 / HALF3_3TO4: 3-figure pair sheets (copy, halfway pose, copy) for keys 2->3 and 3->4.
  SECONDHALF6: 6-figure row: copy of key 5, four new poses (the shift onto the other leg), copy of key 8.
Drawing order (12): K1 K2 H2 K3 H3 K4 | K5 N2 N3 N4 N5 K8. New poses are scaled by real-key height / ChatGPT-copy height.
Writes OUT.png with 24 frames (each drawing twice, "on twos") and OUT_drawings.png with the 12 drawings once.
"""
import json
import sys
from pathlib import Path

from cutlib import assemble, height, scaled, sheet_cells

out, ks, h2, h3, sec = sys.argv[1:6]
K = sheet_cells(ks, 2, 4)


def mids(path, ncol, a, b):
    c = sheet_cells(path, 1, ncol)
    s = (height(a) + height(b)) / (height(c[0]) + height(c[-1]))
    return [scaled(x, s) for x in c[1:-1]], round(s, 4)


m2, s2 = mids(h2, 3, K[1], K[2])
m3, s3 = mids(h3, 3, K[2], K[3])
n, sn = mids(sec, 6, K[4], K[7])
draw = [("K1", K[0]), ("K2", K[1]), ("H2", m2[0]), ("K3", K[2]), ("H3", m3[0]), ("K4", K[3]),
        ("K5", K[4]), ("N2", n[0]), ("N3", n[1]), ("N4", n[2]), ("N5", n[3]), ("K8", K[7])]
info12 = assemble(draw, str(Path(out).with_name(Path(out).stem + "_drawings.png")))
twos = [d for d in draw for _ in (0, 1)]
info24 = assemble(twos, out)
Path(out).with_suffix(".json").write_text(json.dumps({"scales": {"H2": s2, "H3": s3, "second_half": sn}, "drawings": info12,
                                                    "frames": "each drawing twice (on twos), 24 frames at 12 fps = 2 s"}, indent=1))
print("scales", s2, s3, sn); print([(i["from"], i["height"], i["stroke_px"]) for i in info12])
