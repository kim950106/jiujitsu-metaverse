#!/usr/bin/env python3
"""Draws the app icons beside the hosted page: the same belt mark as the page's own favicon (a white
belt with its black rank bar on a dark tile, a line of lamp colour under it). Nobody's logo.

  python3 tools/icons.py        writes icon-192.png, icon-512.png, icon-maskable-512.png and
                                apple-touch-icon.png into the project folder
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INK = (15, 17, 20, 255)
BELT = (241, 239, 233, 255)
BAR = (17, 18, 20, 255)
LED = (255, 215, 154, 255)
TAPE = (241, 239, 233, 255)


def mark(size, round_corners, inset):
    """size: pixels. round_corners: a rounded tile on a clear ground (False: the tile fills the
    square, as launchers that cut their own shape want). inset: how much smaller the mark is drawn
    (0..1), so that such a cut never reaches it."""
    k = 4  # drawn four times as large, then scaled down, for smooth edges
    S = size * k
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if round_corners:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 14 / 64), fill=INK)
    else:
        d.rectangle([0, 0, S, S], fill=INK)
    # the mark is laid out on a 64-unit grid, like the favicon
    u = S / 64 * (1 - inset)
    ox = S * inset / 2
    oy = S * inset / 2

    def box(x, y, w, h, r, fill):
        d.rounded_rectangle([ox + x * u, oy + y * u, ox + (x + w) * u, oy + (y + h) * u], radius=r * u, fill=fill)

    box(8, 22, 48, 14, 2.2, BELT)          # the belt
    box(36, 22, 13, 14, 0, BAR)            # its rank bar
    for i in range(2):                     # two stripes of tape on the bar
        box(39.2 + i * 4.2, 22, 1.7, 14, 0, TAPE)
    box(8, 45, 48, 3.2, 1.6, LED)          # the lamp line
    return im.resize((size, size), Image.LANCZOS)


def main():
    out = {
        'icon-192.png': mark(192, True, 0),
        'icon-512.png': mark(512, True, 0),
        'icon-maskable-512.png': mark(512, False, 0.2),
        'apple-touch-icon.png': mark(180, False, 0.06).convert('RGB'),
    }
    for name, im in out.items():
        im.save(os.path.join(ROOT, name), optimize=True)
        print(name, im.size, os.path.getsize(os.path.join(ROOT, name)), 'bytes')


if __name__ == '__main__':
    main()
