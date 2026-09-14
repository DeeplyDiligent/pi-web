#!/usr/bin/env python3
"""Generate high-contrast PWA icons from the existing Pi mark (requires Pillow).

Keep icon-512.png as the original artwork. New filenames let installed apps
notice the change without reusing the old service-worker/launcher cache.
"""
from pathlib import Path
import math
from PIL import Image, ImageDraw

ICONS = Path(__file__).resolve().parent.parent / "public" / "icons"
BACKGROUND = "#2563eb"
SIZE = 512

# Extract the original white pi, excluding the dark teal speech-bubble shape.
# Red is the highest-contrast channel between the original teal (35,69,75)
# and white. Restrict extraction to the opaque artwork to avoid edge halos.
source = Image.open(ICONS / "icon-512.png").convert("RGBA")
assert source.size == (SIZE, SIZE)
mask = Image.new("L", source.size)
mask.putdata([
    round(max(0, min(1, (red - 35) / 220)) * 255) if alpha == 255 and red > 80 else 0
    for red, green, blue, alpha in source.getdata()
])
# Centre the mark optically within the icon rather than the old speech bubble.
mark = mask.crop(mask.getbbox())
mask = Image.new("L", source.size)
mask.paste(mark, ((SIZE - mark.width) // 2, (SIZE - mark.height) // 2))
# Android can crop maskable icons to a circle of radius 40% of the image.
assert all(
    math.hypot(x + 0.5 - SIZE / 2, y + 0.5 - SIZE / 2) < SIZE * 0.4
    for y in range(SIZE) for x in range(SIZE) if mask.getpixel((x, y)) > 0
), "Pi mark must fit inside the maskable safe zone"

full = Image.new("RGB", source.size, BACKGROUND)
full.paste("white", mask=mask)

# Non-maskable contexts get a rounded icon, while Android's maskable entry
# supplies its own edge-to-edge background under the launcher's chosen shape.
rounding = Image.new("L", (SIZE * 4, SIZE * 4))
ImageDraw.Draw(rounding).rounded_rectangle(
    (0, 0, SIZE * 4 - 1, SIZE * 4 - 1), radius=SIZE * 4 * 0.22, fill=255
)
for variant in ("", "-work"):
    artwork = full.copy()
    if variant:
        # Keep the bottom-right badge within Android's circular safe zone too.
        cx, cy, radius = 363, 362, 43
        assert math.hypot(cx - SIZE / 2, cy - SIZE / 2) + radius < SIZE * 0.4
        badge = Image.new("RGBA", (SIZE * 4, SIZE * 4))
        draw = ImageDraw.Draw(badge)
        def box(coords):
            return tuple(value * 4 for value in coords)
        draw.ellipse(box((cx-radius, cy-radius, cx+radius, cy+radius)), fill="white", outline=BACKGROUND, width=12)
        ink = "#1e3a8a"
        draw.rounded_rectangle(box((351, 338, 375, 353)), radius=12, outline=ink, width=20)
        draw.rounded_rectangle(box((338, 349, 388, 379)), radius=16, fill=ink)
        draw.line(box((339, 362, 387, 362)), fill="white", width=6)
        draw.rounded_rectangle(box((360, 358, 366, 366)), radius=4, fill="white")
        artwork.paste(badge.resize(source.size, Image.Resampling.LANCZOS), (0, 0), badge.resize(source.size, Image.Resampling.LANCZOS))
    artwork.save(ICONS / f"icon-blue-v2{variant}-maskable-512.png", optimize=True)
    artwork.resize((180, 180), Image.Resampling.LANCZOS).save(
        ICONS / f"apple-touch-icon-blue-v2{variant}.png", optimize=True
    )
    regular = artwork.convert("RGBA")
    regular.putalpha(rounding.resize(source.size, Image.Resampling.LANCZOS))
    for size in (192, 512):
        regular.resize((size, size), Image.Resampling.LANCZOS).save(
            ICONS / f"icon-blue-v2{variant}-{size}.png", optimize=True
        )
print("Generated plain and work PWA icons; artwork fits the Android maskable safe zone.")
