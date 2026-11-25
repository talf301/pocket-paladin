"""Print the mean colour of the rim of every hex on every tile (a check on the hand-transcribed terrain)."""
import math, sys
from pathlib import Path
import numpy as np
from PIL import Image
for f in sorted(Path(sys.argv[1]).glob("[gb][1-5].webp")):
    im = np.asarray(Image.open(f).convert("RGB")).astype(float)
    H, W, _ = im.shape
    w = W / 3; s = w / math.sqrt(3)
    out = []
    for row in range(4):
        cells = []
        for k in range(3 if row % 2 == 0 else 2):
            cx = (k + (0.5 if row % 2 == 0 else 1.0)) * w; cy = s + row * 1.5 * s
            px = []
            for a in range(0, 360, 6):
                for rr in (0.62, 0.7, 0.78):
                    x = int(cx + rr * s * math.cos(math.radians(a))); y = int(cy + rr * s * math.sin(math.radians(a)))
                    px.append(im[y, x])
            m = np.mean(px, axis=0); sd = np.std(np.mean(px, axis=1))
            r, g, b = m
            if b > 180 and r < 170: t = "lake"
            elif r > 220 and g > 190: t = "desert"
            elif r > 140 and g < 140: t = "waste"
            elif r > 120 and g > 180 and b < 80: t = "grass"
            elif b > 75 and g < 150: t = "forest"
            else: t = "hills?"
            cells.append(f"{t}({int(r)},{int(g)},{int(b)};{int(sd)})")
        out.append("  ".join(cells))
    print(f.stem); print("\n".join("   " + o for o in out))
