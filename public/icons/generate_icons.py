#!/usr/bin/env python3
"""
Generate Kairos extension icons in PNG format
Requires: pip install pillow
"""

from PIL import Image, ImageDraw

def create_icon(size):
    """Create a single icon of the specified size"""
    # Create image with transparent background
    img = Image.new('RGBA', (size, size), (10, 10, 10, 255))
    draw = ImageDraw.Draw(img)

    center = size / 2
    radius = size * 0.3

    # Outer circle
    line_width = 3 if size > 32 else 2
    draw.ellipse(
        [center - radius, center - radius, center + radius, center + radius],
        outline=(57, 255, 20, 255),
        width=line_width
    )

    # Center dot
    dot_radius = radius * 0.2
    draw.ellipse(
        [center - dot_radius, center - dot_radius,
         center + dot_radius, center + dot_radius],
        fill=(57, 255, 20, 255)
    )

    # Cross marks (only for larger icons)
    if size > 32:
        mark_length = radius * 0.5
        mark_start = center - radius - mark_length
        mark_end = center - radius

        # Top
        draw.line([(center, mark_start), (center, mark_end)],
                  fill=(57, 255, 20, 255), width=line_width)

        # Bottom
        draw.line([(center, size - mark_start), (center, size - mark_end)],
                  fill=(57, 255, 20, 255), width=line_width)

        # Left
        draw.line([(mark_start, center), (mark_end, center)],
                  fill=(57, 255, 20, 255), width=line_width)

        # Right
        draw.line([(size - mark_start, center), (size - mark_end, center)],
                  fill=(57, 255, 20, 255), width=line_width)

    return img

# Generate icons
for size in [16, 48, 128]:
    icon = create_icon(size)
    icon.save(f'icon{size}.png')
    print(f'Generated icon{size}.png')

print('All icons generated successfully!')
