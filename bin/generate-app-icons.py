#!/usr/bin/env python3
"""Generate high-contrast PWA icons from the existing Pi mark (requires Pillow).

Keep icon-512.png as the original artwork. New filenames let installed apps
notice the change without reusing the old service-worker/launcher cache.
"""
from pathlib import Path
import math
from PIL import Image, ImageDraw

ICONS = Path(__file__).resolve().parent.parent / "public" / "icons"
PLAIN_BACKGROUND = "#2563eb"
WORK_BACKGROUND = "#7f1d1d"
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

# Non-maskable contexts get a rounded icon, while Android's maskable entry
# supplies its own edge-to-edge background under the launcher's chosen shape.
rounding = Image.new("L", (SIZE * 4, SIZE * 4))
ImageDraw.Draw(rounding).rounded_rectangle(
    (0, 0, SIZE * 4 - 1, SIZE * 4 - 1), radius=SIZE * 4 * 0.22, fill=255
)

def save_artwork(artwork, stem):
    artwork.save(ICONS / f"{stem}-maskable-512.png", optimize=True)
    artwork.resize((180, 180), Image.Resampling.LANCZOS).save(
        ICONS / f"apple-touch-{stem}.png", optimize=True
    )
    regular = artwork.convert("RGBA")
    regular.putalpha(rounding.resize(source.size, Image.Resampling.LANCZOS))
    for size in (192, 512):
        regular.resize((size, size), Image.Resampling.LANCZOS).save(
            ICONS / f"{stem}-{size}.png", optimize=True
        )

plain = Image.new("RGB", source.size, PLAIN_BACKGROUND)
plain.paste("white", mask=mask)
save_artwork(plain, "icon-blue-v1")

# Give the work icon its own colour and pull the Pi slightly up and left so the
# larger badge reads clearly instead of covering the lower-right leg.
work_mark = mark.resize(
    (round(mark.width * 0.92), round(mark.height * 0.92)),
    Image.Resampling.LANCZOS,
)
work_mask = Image.new("L", source.size)
work_mask.paste(
    work_mark,
    ((SIZE - work_mark.width) // 2 - 14, (SIZE - work_mark.height) // 2 - 14),
)
work = Image.new("RGB", source.size, WORK_BACKGROUND)
work.paste("white", mask=work_mask)

# Keep the enlarged bottom-right badge within Android's circular safe zone.
cx, cy, radius = 350, 350, 62
assert math.hypot(cx - SIZE / 2, cy - SIZE / 2) + radius < SIZE * 0.4
badge = Image.new("RGBA", (SIZE * 4, SIZE * 4))
draw = ImageDraw.Draw(badge)
def box(coords):
    return tuple(value * 4 for value in coords)
draw.ellipse(
    box((cx-radius, cy-radius, cx+radius, cy+radius)),
    fill="white",
    outline=WORK_BACKGROUND,
    width=16,
)
ink = "#581313"
draw.rounded_rectangle(box((332, 313, 368, 337)), radius=16, outline=ink, width=24)
draw.rounded_rectangle(box((313, 331, 387, 377)), radius=20, fill=ink)
draw.line(box((314, 351, 386, 351)), fill="white", width=8)
draw.rounded_rectangle(box((345, 345, 355, 357)), radius=5, fill="white")
badge = badge.resize(source.size, Image.Resampling.LANCZOS)
work.paste(badge, (0, 0), badge)
save_artwork(work, "icon-maroon-v2-work")

print("Generated blue plain and maroon work PWA icons; artwork fits the Android maskable safe zone.")
