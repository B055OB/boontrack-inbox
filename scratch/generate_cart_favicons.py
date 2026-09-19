import math
from PIL import Image, ImageDraw

def create_sleek_cart_icon(size=512):
    upscale = 4
    canvas_size = size * upscale
    img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))

    padding = int(24 * upscale * (size / 512))
    corner_radius = int(116 * upscale * (size / 512))
    rect_box = [padding, padding, canvas_size - padding, canvas_size - padding]

    # Background gradient: Indigo-Violet (#6366F1 to #4338CA)
    bg_img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg_img)
    bg_draw.rounded_rectangle(rect_box, radius=corner_radius, fill=(99, 102, 241, 255))

    for y in range(padding, canvas_size - padding):
        factor = (y - padding) / (canvas_size - 2 * padding)
        r = int(99 + factor * (67 - 99))
        g = int(102 + factor * (56 - 102))
        b = int(241 + factor * (202 - 241))
        bg_draw.line([(padding, y), (canvas_size - padding, y)], fill=(r, g, b, 255))

    mask = Image.new('L', (canvas_size, canvas_size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle(rect_box, radius=corner_radius, fill=255)

    img.paste(bg_img, (0, 0), mask=mask)
    draw = ImageDraw.Draw(img)

    # Subtle inner border
    border_w = int(7 * upscale * (size / 512))
    draw.rounded_rectangle(rect_box, radius=corner_radius, outline=(255, 255, 255, 60), width=border_w)

    scale = upscale * (size / 512)

    def s(val):
        return int(val * scale)

    # 1. Cart Wheels
    w1 = (s(210), s(385))
    w2 = (s(360), s(385))
    r_wheel = s(28)
    r_hub = s(10)

    # Wheel 1
    draw.ellipse([w1[0] - r_wheel, w1[1] - r_wheel, w1[0] + r_wheel, w1[1] + r_wheel], fill=(255, 255, 255, 255))
    draw.ellipse([w1[0] - r_hub, w1[1] - r_hub, w1[0] + r_hub, w1[1] + r_hub], fill=(67, 56, 202, 255))

    # Wheel 2
    draw.ellipse([w2[0] - r_wheel, w2[1] - r_wheel, w2[0] + r_wheel, w2[1] + r_wheel], fill=(255, 255, 255, 255))
    draw.ellipse([w2[0] - r_hub, w2[1] - r_hub, w2[0] + r_hub, w2[1] + r_hub], fill=(67, 56, 202, 255))

    # 2. Sleek Shopping Basket Body (Solid filled white with subtle inner cutouts)
    # Basket Polygon (Trapezoid with rounded corners)
    basket_pts = [
        (s(165), s(175)),  # Top Left
        (s(405), s(175)),  # Top Right
        (s(370), s(305)),  # Bottom Right
        (s(205), s(305))   # Bottom Left
    ]

    # Draw solid basket
    draw.polygon(basket_pts, fill=(255, 255, 255, 255))

    # Cutout interior slots for cart wire effect (giving iconic modern look)
    slot_color = (79, 70, 229, 255) # matching dark indigo
    slot_w = s(38)
    slot_h = s(85)
    r_slot = s(12)

    # 3 vertical slots
    for sx in [s(215), s(275), s(335)]:
        draw.rounded_rectangle([sx, s(195), sx + slot_w, s(195) + slot_h], radius=r_slot, fill=slot_color)

    # 3. Handle & Undercarriage Frame
    frame_w = s(26)
    # Handle grip & drop
    draw.line([(s(115), s(140)), (s(165), s(140))], fill=(255, 255, 255, 255), width=frame_w)
    draw.line([(s(165), s(140)), (s(210), s(315))], fill=(255, 255, 255, 255), width=frame_w)
    
    # Bottom chassis connecting wheels
    draw.line([(s(195), s(325)), (s(380), s(325))], fill=(255, 255, 255, 255), width=frame_w)

    # Rounded caps on handle
    draw.ellipse([s(115) - frame_w//2, s(140) - frame_w//2, s(115) + frame_w//2, s(140) + frame_w//2], fill=(255, 255, 255, 255))

    # 4. Top-Right Emerald Badge with Sparkle / Plus
    b_center = (s(400), s(115))
    b_rad = s(46)
    b_border = s(7)

    # Badge background (Emerald #10B981)
    draw.ellipse([b_center[0] - b_rad, b_center[1] - b_rad, b_center[0] + b_rad, b_center[1] + b_rad],
                 fill=(16, 185, 129, 255), outline=(255, 255, 255, 255), width=b_border)

    # Sparkle Star inside Badge
    star_r1 = s(26)
    star_r2 = s(9)
    star_pts = []
    for step in range(8):
        angle = step * math.pi / 4
        cur_r = star_r1 if step % 2 == 0 else star_r2
        sx = b_center[0] + int(cur_r * math.sin(angle))
        sy = b_center[1] - int(cur_r * math.cos(angle))
        star_pts.append((sx, sy))
    draw.polygon(star_pts, fill=(255, 255, 255, 255))

    return img.resize((size, size), Image.Resampling.LANCZOS)

print("Generating sleek cart favicons...")
icon_512 = create_sleek_cart_icon(512)
icon_192 = create_sleek_cart_icon(192)
icon_180 = create_sleek_cart_icon(180)

icon_512.save("public/shopping-cart.png", "PNG")
icon_512.save("public/cart-icon.png", "PNG")
icon_512.save("public/favicon-512.png", "PNG")
icon_192.save("public/icon-192.png", "PNG")
icon_180.save("public/apple-touch-icon.png", "PNG")
icon_180.save("app/apple-touch-icon.png", "PNG")

icon_512.save("public/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
icon_512.save("app/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
icon_512.save("public/shopping-cart.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

print("Done!")
