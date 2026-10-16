"""
Generate original, professional icons for the Etsy Profit Assistant browser extension.
Generates 16x16, 32x32, 48x48, and 128x128 PNG icons using Python PIL with supersampling.
Branding aligns with the app's palette: Deep Teal (#244f49), Warm Surface (#f7f5ef), and Gold (#e6b864).
"""
import os
from PIL import Image, ImageDraw

def create_icon(size):
    # Render at 4x resolution for anti-aliasing
    scale = 4
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Padding and geometry
    pad = int(canvas_size * 0.08)
    corner_radius = int(canvas_size * 0.22)
    
    # 1. Background rounded rectangle with deep teal (#244f49)
    bg_color = (36, 79, 73, 255)
    border_color = (46, 101, 93, 255)
    border_width = max(1, int(scale * 1.5))
    
    # Rounded rect bounding box
    rect = [pad, pad, canvas_size - pad, canvas_size - pad]
    draw.rounded_rectangle(rect, radius=corner_radius, fill=bg_color, outline=border_color, width=border_width)

    # 2. Draw modern geometric Sigma (∑) mark
    # Coordinates normalized within inner area
    cx = canvas_size / 2
    cy = canvas_size / 2
    
    # Stroke width scaled appropriately for visibility at small sizes
    if size <= 16:
        stroke = int(canvas_size * 0.16)
    elif size <= 32:
        stroke = int(canvas_size * 0.14)
    else:
        stroke = int(canvas_size * 0.12)
        
    symbol_color = (247, 245, 239, 255)  # #f7f5ef paper / warm light
    accent_color = (230, 184, 100, 255)  # #e6b864 warm gold/amber

    # Sigma points
    left_x = int(canvas_size * 0.28)
    right_x = int(canvas_size * 0.68)
    top_y = int(canvas_size * 0.26)
    bot_y = int(canvas_size * 0.74)
    mid_y = int(canvas_size * 0.50)
    center_x = int(canvas_size * 0.44)

    # Top horizontal bar
    draw.line([(left_x, top_y), (right_x, top_y)], fill=symbol_color, width=stroke)
    # Bottom horizontal bar
    draw.line([(left_x, bot_y), (right_x, bot_y)], fill=symbol_color, width=stroke)
    # Upper diagonal: from right_x, top_y to center_x, mid_y
    draw.line([(right_x, top_y), (center_x, mid_y)], fill=symbol_color, width=stroke)
    # Lower diagonal: from center_x, mid_y to right_x, bot_y
    draw.line([(center_x, mid_y), (right_x, bot_y)], fill=symbol_color, width=stroke)

    # Small accent dot/bar in gold symbolizing positive profit/ledger margin
    accent_r = max(int(canvas_size * 0.06), stroke // 2)
    accent_cx = int(canvas_size * 0.68)
    accent_cy = int(canvas_size * 0.50)
    
    # For small sizes (16, 32), an accent dot in the center-right notch of the Sigma
    draw.ellipse([accent_cx - accent_r, accent_cy - accent_r, accent_cx + accent_r, accent_cy + accent_r], fill=accent_color)

    # Downscale with high quality Lanczos filter
    final_img = img.resize((size, size), Image.Resampling.LANCZOS)
    return final_img

def main():
    icons_dir = os.path.join(os.path.dirname(__file__), "icons")
    os.makedirs(icons_dir, exist_ok=True)
    
    for s in [16, 32, 48, 128]:
        out_path = os.path.join(icons_dir, f"icon{s}.png")
        icon = create_icon(s)
        icon.save(out_path, "PNG")
        print(f"Generated {out_path} ({s}x{s})")

if __name__ == "__main__":
    main()
