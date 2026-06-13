#!/usr/bin/env python3
"""
Liquid-Glass displacement-map generator
=======================================

Implements the math from
    https://kube.io/blog/liquid-glass-css-svg/
to bake a physics-based refraction displacement map for use as the
backdrop-filter inside style.css.

Pure CSS can't compute per-pixel displacement at runtime, but it CAN
embed a pre-baked PNG via `<feImage href="data:image/png;base64,...">`
inside an SVG filter. So this script runs the article's math ONCE,
encodes the resulting displacement field as a base64 PNG, and prints a
ready-to-paste CSS data URL.

Math summary (Snell-Descartes refraction)
-----------------------------------------
1. The glass has a convex-squircle bezel profile:

        h(x) = (1 - (1 - x)^4)^(1/4)        for x in [0, 1]

   where x is the normalized distance from the outer edge of the glass
   (0 at the rim, 1 at the start of the flat interior). Apple's Liquid
   Glass uses this squircle - it gives a softer flat-to-curve
   transition than a plain circle does.

2. The surface normal is the derivative of h, rotated 90 degrees:

        normal = (-h'(x), 1)        (un-normalized)

   so the angle of incidence is theta1 = atan(h'(x)).

3. Snell's law for an incident ray that's perpendicular to the
   background plane (the article's simplifying assumption):

        n1 * sin(theta1) = n2 * sin(theta2)

   With n1 = 1 (air) and n2 = 1.5 (glass), the refracted angle is

        theta2 = asin(sin(theta1) / 1.5).

4. The ray travels through the glass thickness `T` (in pixels) and
   lands at a horizontal offset of

        displacement(t) = T * tan(theta1 - theta2)

   from where it would have landed without the glass. This is the
   per-pixel displacement magnitude that goes into the displacement
   map.

5. For a CIRCULAR glass shape, the displacement vector at every point
   in the bezel ring points OUTWARD radially from the center. We
   compute the magnitude on a single 1-D radius and rotate it around
   the disc to fill the full 2-D map.

6. Finally we encode each (dx, dy) vector into a single RGBA pixel:

        R = round(128 + (dx / max_d) * 127)        # X-axis displacement
        G = round(128 + (dy / max_d) * 127)        # Y-axis displacement
        B = 128                                      # ignored
        A = 255                                      # opaque

   where `max_d` is the largest displacement magnitude across the
   whole map - SVG's <feDisplacementMap> needs normalized values in
   [-1, 1] (encoded as 0..255 with 128 = neutral). We then pass
   `max_d` as the filter's `scale` attribute, which restores the real
   pixel-shift amount.

Usage
-----
    python3 tools/generate-liquid-glass.py

Prints the data URL + scale value for the CSS file.
"""

from __future__ import annotations

import base64
import io
import math

from PIL import Image


# Refractive indices used by the article.
N1 = 1.0   # ambient (air)
N2 = 1.5   # glass


def surface_height(x: float) -> float:
    """Convex-squircle bezel profile: h(x) = (1 - (1-x)^4)^(1/4).

    The squircle is what Apple's Liquid Glass uses - a softer flat-to-
    curve transition than a plain circular arc. Returns the glass
    height (0..1) at distance `x` (0..1) from the outer rim.
    """
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    return (1.0 - (1.0 - x) ** 4) ** 0.25


def surface_slope(x: float) -> float:
    """Numerical derivative of the surface function.

    The article uses a small symmetric finite-difference (delta=0.001)
    instead of the analytical derivative because the same code can swap
    in any height function (circle, squircle, lip, etc.) without
    re-deriving by hand.
    """
    delta = 0.001
    x1 = max(0.0, x - delta)
    x2 = min(1.0, x + delta)
    return (surface_height(x2) - surface_height(x1)) / (x2 - x1)


def refraction_displacement(t: float, glass_thickness_px: float) -> float:
    """Snell-Descartes refraction at a single bezel point.

    `t` is the normalized distance from the rim (0 at rim, 1 at flat
    interior). Returns the horizontal pixel offset the bent ray ends
    up shifted by, after travelling through `glass_thickness_px` of
    glass.
    """
    if t <= 0.0 or t >= 1.0:
        return 0.0

    slope = surface_slope(t)
    theta1 = math.atan(slope)

    # Snell's law. Clamp before asin in case of numerical drift.
    sin_t2 = math.sin(theta1) * (N1 / N2)
    sin_t2 = max(-1.0, min(1.0, sin_t2))
    theta2 = math.asin(sin_t2)

    bend = theta1 - theta2
    return glass_thickness_px * math.tan(bend)


def build_displacement_map(
    size: int,
    bezel_width_px: float,
    glass_thickness_px: float,
) -> tuple[bytes, float]:
    """Render the displacement map for a circular glass disc.

    Returns (png_bytes, max_displacement_in_px). `max_displacement_in_px`
    becomes the `scale` attribute on <feDisplacementMap> in the CSS.
    """
    cx = (size - 1) / 2.0
    cy = (size - 1) / 2.0
    radius = size / 2.0

    # First pass: compute raw (dx, dy) per pixel and find the max
    # magnitude. We need the max to normalize the values into the
    # 0..255 channel range that <feDisplacementMap> expects.
    raw: list[tuple[float, float]] = [(0.0, 0.0)] * (size * size)
    max_disp = 0.0

    for py in range(size):
        for px in range(size):
            dx = px - cx
            dy = py - cy
            d = math.hypot(dx, dy)

            disp_x = 0.0
            disp_y = 0.0

            if 0.0 < d < radius:
                dist_from_edge = radius - d
                if dist_from_edge < bezel_width_px:
                    # In the curved bezel ring. Compute the refraction
                    # displacement for this distance from the rim, then
                    # project it OUTWARD radially from the disc center
                    # (light bends away from the optically-denser
                    # interior toward the rim, so the apparent sample
                    # position shifts outward).
                    t = dist_from_edge / bezel_width_px
                    mag = refraction_displacement(t, glass_thickness_px)
                    disp_x = (dx / d) * mag
                    disp_y = (dy / d) * mag

            raw[py * size + px] = (disp_x, disp_y)
            mag2 = math.hypot(disp_x, disp_y)
            if mag2 > max_disp:
                max_disp = mag2

    # Second pass: normalize and encode to RGBA bytes following the
    # article's mapping:  R = 128 + (nx * 127),  G = 128 + (ny * 127).
    pixels = bytearray(size * size * 4)
    inv_max = (1.0 / max_disp) if max_disp > 0 else 0.0

    for i, (vx, vy) in enumerate(raw):
        nx = vx * inv_max
        ny = vy * inv_max
        r = max(0, min(255, round(128 + nx * 127)))
        g = max(0, min(255, round(128 + ny * 127)))
        o = i * 4
        pixels[o + 0] = r
        pixels[o + 1] = g
        pixels[o + 2] = 128  # blue: ignored by feDisplacementMap
        pixels[o + 3] = 255  # alpha: fully opaque

    img = Image.frombytes("RGBA", (size, size), bytes(pixels))
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue(), max_disp


def to_data_url(png_bytes: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")


def main() -> None:
    # We bake ONE displacement map at a representative size. SVG
    # filters scale the map non-uniformly to match the element box at
    # render time (feImage with explicit width/height inside the
    # filter region), so a single 256x256 map covers every glass
    # button - small OSD pills, the card play FAB, the homepage
    # library tiles. The downside is the bezel will look slightly
    # softer/sharper at extreme size ratios; for our use case (1:5
    # range from smallest pill to largest tile) it's imperceptible.
    SIZE = 256

    # Bezel + thickness in pixels (relative to a 256x256 canvas).
    # Tweak these to taste:
    #   - Bezel ~14% of the radius mirrors what the kube.io playground
    #     defaults to, and reads as a chunky-but-not-greasy rim on a
    #     ~2-3em circular button.
    #   - Glass thickness ~22px gives a noticeable but not cartoonish
    #     bend on a 1080p backdrop.
    BEZEL_WIDTH_PX = 18.0
    GLASS_THICKNESS_PX = 22.0

    png, max_disp = build_displacement_map(
        SIZE, BEZEL_WIDTH_PX, GLASS_THICKNESS_PX
    )
    url = to_data_url(png)

    print("/* === Liquid-Glass displacement map (auto-generated) ===")
    print(f"   size       = {SIZE}x{SIZE} px")
    print(f"   bezel      = {BEZEL_WIDTH_PX} px")
    print(f"   thickness  = {GLASS_THICKNESS_PX} px")
    print(f"   max disp   = {max_disp:.4f} px")
    print(f"   png bytes  = {len(png)}")
    print(f"   url bytes  = {len(url)}")
    print("*/")
    print()
    print(f"--liquid-scale: {max_disp:.4f};")
    print()
    print(f"--liquid-disp-url: url(\"{url}\");")


if __name__ == "__main__":
    main()
