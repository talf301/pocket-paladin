"""Cut the game art out of the Nightbreaker print-and-play PDF pages.

Usage:
  pdfimages -png "Nightbreaker PNP 1.3 - Flip on Long Edge.pdf" PAGES/p
  uv run --no-project --with pillow --with numpy python -I tools/extract.py PAGES public/img

PAGES holds one 2550x3300 image per PDF page (p-000.png is page 1, p-002.png page 2, ...).
The back pages are mirrored left-to-right relative to their fronts (flip on long edge).
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])


def page(n):
    return Image.open(SRC / f"p-{(n - 1) * 2:03d}.png").convert("RGB")


def save(img, name, quality=86, size=None):
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    if size:
        img = img.resize(size, Image.LANCZOS)
    img.save(path, "WEBP", quality=quality, method=6)


def circle(img, r):
    """Keep a centred disc of radius r, transparent outside (2x supersampled edge)."""
    w, h = img.size
    mask = Image.new("L", (w * 2, h * 2), 0)
    ImageDraw.Draw(mask).ellipse((w - 2 * r, h - 2 * r, w + 2 * r, h + 2 * r), fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask.resize((w, h), Image.LANCZOS))
    return out


def hexmask(img):
    """Pointy-top hexagon filling the image."""
    w, h = img.size
    mask = Image.new("L", (w * 2, h * 2), 0)
    W, H = w * 2, h * 2
    ImageDraw.Draw(mask).polygon([(W / 2, 0), (W, H / 4), (W, 3 * H / 4), (W / 2, H), (0, 3 * H / 4), (0, H / 4)], fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask.resize((w, h), Image.LANCZOS))
    return out


# ---------------------------------------------------------------- tokens (pages 5 and 6)
GX, GY, CELL = 447, 1161, 331.2
front, back = page(5), page(6)


def cell(img, col, row, half=98):
    cx, cy = GX + (col + 0.5) * CELL, GY + (row + 0.5) * CELL
    return img.crop((round(cx - half), round(cy - half), round(cx + half), round(cy + half)))


for i in range(20):
    row, col = 1 + i // 5, i % 5
    save(circle(cell(front, col, row), 95), f"enemy/T{i + 1}.webp")
    save(circle(cell(back, 4 - col, row), 95), f"ally/T{i + 1}.webp")
for col in range(5):
    save(circle(cell(front, col, 0), 95), f"goal/P{col + 1}.webp")
    save(circle(cell(back, 4 - col, 0), 95), f"ally/P{col + 1}.webp")
    save(circle(cell(front, col, 5), 95), f"shade/S{col + 1}a.webp")
    save(circle(cell(back, 4 - col, 5), 95), f"shade/S{col + 1}b.webp")

# side quests: 7 pointy-top hexes in a row, 2311 x 373 at (121, 127); the back row starts 3px further left
QW, QH = 2311 / 7, 373
for i in range(7):
    x = 121 + i * QW
    save(hexmask(front.crop((round(x), 127, round(x + QW), 127 + QH))), f"quest/Q{i + 1}h.webp")
    x = 118 + (6 - i) * QW
    save(hexmask(back.crop((round(x), 127, round(x + QW), 127 + QH))), f"quest/Q{i + 1}e.webp")

# element icons and the source shard
for name, cx in (("fire", 573), ("wind", 1039), ("earth", 1507)):
    save(circle(front.crop((cx - 50, 861 - 50, cx + 50, 861 + 50)), 47), f"el/{name}.webp")
save(front.crop((1975 - 205, 859 - 205, 1975 + 205, 859 + 205)), "el/source.webp")

# ---------------------------------------------------------------- mats (pages 1 and 3)
p1, p3 = page(1), page(3)
MATS = {"courage": (p1, 342, 328), "temperance": (p1, 342, 1210), "justice": (p1, 342, 2093), "wisdom": (p3, 359, 178)}
for name, (img, x, y) in MATS.items():
    save(img.crop((x, y, x + 640, y + 882)), f"mat/{name}-portrait.webp", quality=84)
    save(img.crop((x + 648, y, x + 1831, y + 882)), f"mat/{name}.webp", quality=88)
TRACKS = {"courage": (51, 1235), "justice": (1275, 1235), "temperance": (51, 2117), "wisdom": (1275, 2117)}
for name, (x, y) in TRACKS.items():
    save(p3.crop((x, y, x + 1224, y + 882)), f"mat/{name}-tracks.webp", quality=88)

# ---------------------------------------------------------------- reference cards (pages 11 and 12)
for n, rot in ((11, 270), (12, 90)):  # PIL rotates counter-clockwise
    img = page(n).crop((150, 412, 150 + 2250, 412 + 2476)).rotate(rot, expand=True)
    for r in range(2):
        for c in range(3):
            card = img.crop((round(c * 825.3), r * 1125, round(c * 825.3) + 825, r * 1125 + 1125))
            save(card, f"ref/R{n}-{r * 3 + c + 1}.webp", quality=80)
            if (n, r, c) == (12, 1, 0):  # the icon legend: cut the point-type icons out as black-on-transparent glyphs
                ICONS = {"pm": (120, 95), "mm": (120, 153), "pr": (120, 213), "mr": (120, 277), "pb": (120, 347), "mb": (120, 415), "move": (123, 492), "inf": (122, 567), "prec": (125, 662), "save": (122, 781)}
                for name, (cx, cy) in ICONS.items():
                    g = card.crop((cx - 32, cy - 32, cx + 32, cy + 32)).convert("L")
                    a = np.clip((235 - np.asarray(g).astype(float)) * 1.35, 0, 255).astype("uint8")
                    icon = Image.new("RGBA", g.size, (20, 18, 16, 255))
                    icon.putalpha(Image.fromarray(a))
                    icon.save(OUT / "el" / f"{name}.png")

# ---------------------------------------------------------------- map tiles (pages 7 and 9) and their backs
def tile(img, box):
    """Cut one tile, turn it upright (the sheet prints tiles on their side), clear the white background and
    crop to the hex grid: rows of 3, 2, 3, 2 pointy-top hexes."""
    t = img.crop(box).rotate(270, expand=True)  # 90 degrees clockwise
    a = np.asarray(t).astype(int)
    ink = (a.min(axis=2) < 243)
    cols = ink.sum(axis=0)
    xs = np.where(cols > 220)[0]  # the long vertical hex edges, not art that pokes out of the tile
    left, right = xs[0], xs[-1] + 1
    w = (right - left) / 3
    s = w / math.sqrt(3)
    # vertical position from the left and right edge runs of rows 0 and 2 (each run is one hex side, s tall)
    tops = []
    for band in (ink[:, left + 2:left + 8].all(axis=1), ink[:, right - 8:right - 2].all(axis=1)):
        ys = np.where(band)[0]
        runs = np.split(ys, np.where(np.diff(ys) > 3)[0] + 1)
        runs = [r for r in runs if len(r) > s * 0.6]
        if runs:
            tops.append(runs[0][0] - s / 2)
    top = float(np.median(tops))
    h = 6.5 * s
    # transparent outside the hexes
    yy, xx = np.mgrid[0:t.size[1], 0:t.size[0]]
    alpha = Image.new("L", (t.size[0] * 2, t.size[1] * 2), 0)
    d = ImageDraw.Draw(alpha)
    for row in range(4):
        for k in range(3 if row % 2 == 0 else 2):
            cx = left + (k + (0.5 if row % 2 == 0 else 1.0)) * w
            cy = top + s + row * 1.5 * s
            pts = [(cx + (s + 0.6) * math.cos(math.radians(60 * j - 90)), cy + (s + 0.6) * math.sin(math.radians(60 * j - 90))) for j in range(6)]
            d.polygon([(x * 2, y * 2) for x, y in pts], fill=255)
    out = t.convert("RGBA")
    out.putalpha(alpha.resize(t.size, Image.LANCZOS))
    out = out.crop((round(left), round(top), round(left + 3 * w), round(top + h)))
    return out, (w, s)


for n, prefix in ((7, "g"), (9, "b")):
    img = page(n)
    a = np.asarray(img).astype(int)
    ink = a.min(axis=2) < 243
    # tiles sit in a 2 x 3 grid; find the grid from the ink projections
    def spans(v, minlen, thresh):
        idx = np.where(v > thresh)[0]
        runs = np.split(idx, np.where(np.diff(idx) > 25)[0] + 1)
        return [(r[0], r[-1] + 1) for r in runs if len(r) > minlen]
    xr = spans(ink.sum(axis=0), 600, 150)
    yr = spans(ink.sum(axis=1), 500, 150)
    k = 0
    for (y0, y1) in yr:
        for (x0, x1) in xr:
            k += 1
            if k > 5:
                break
            out, (w, s) = tile(img, (x0 - 60, y0 - 60, x1 + 60, y1 + 60))
            print(prefix, k, out.size, round(w, 1), round(s, 1))
            save(out, f"tile/{prefix}{k}.webp", quality=88)
save(page(8).crop((400, 500, 900, 1000)), "tile/back-easy.webp", size=(200, 200))
save(page(10).crop((400, 500, 900, 1000)), "tile/back-hard.webp", size=(200, 200))

# ---------------------------------------------------------------- app icons (Courage portrait)
port = MATS["courage"][0].crop((342 + 60, 328 + 20, 342 + 60 + 580, 328 + 20 + 580))
for size in (512, 192, 180):
    port.resize((size, size), Image.LANCZOS).save(OUT.parent / f"icon-{size}.png")
print("done")
