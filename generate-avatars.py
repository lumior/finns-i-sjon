#!/usr/bin/env python3
"""Generera unika spelar-avatarer för Finns i Sjön PRO."""

from PIL import Image, ImageDraw
import os

OUTPUT_DIR = "public_html/assets/images/avatars"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 8 unika avatarer: (filnamn, bakgrundsfärg, emoji)
AVATARS = [
    ("player-1.png",  "#3b82f6", "🧢"),  # Blå
    ("player-2.png",  "#ef4444", "🎩"),  # Röd
    ("player-3.png",  "#22c55e", "🌿"),  # Grön
    ("player-4.png",  "#a855f7", "🎭"),  # Lila
    ("player-5.png",  "#f97316", "🦁"),  # Orange
    ("player-6.png",  "#ec4899", "🌸"),  # Rosa
    ("player-7.png",  "#eab308", "⭐"),  # Gul
    ("player-8.png",  "#06b6d4", "🐬"),  # Cyan
]

SIZE = 128

for filename, color, emoji in AVATARS:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rita rund bakgrund
    draw.ellipse([0, 0, SIZE - 1, SIZE - 1], fill=color)

    # Rita subtil skugga/djup (mörkare kant)
    draw.ellipse([0, 0, SIZE - 1, SIZE - 1], outline=(0, 0, 0, 40), width=2)

    # Sätt emoji i mitten
    img = img.convert("RGBA")

    # Skapa en temporär bild för emoji-text
    from PIL import ImageFont
    emoji_img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    emoji_draw = ImageDraw.Draw(emoji_img)

    # Försök hitta en font som stödjer emojis
    font_size = 64
    font = None
    for font_name in ["Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"]:
        try:
            font = ImageFont.truetype(font_name, font_size)
            break
        except:
            pass

    if font is None:
        # Fallback: använd default font, emoji visas kanske inte perfekt
        font = ImageFont.load_default()

    bbox = emoji_draw.textbbox((0, 0), emoji, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (SIZE - text_w) // 2 - bbox[0]
    y = (SIZE - text_h) // 2 - bbox[1]

    emoji_draw.text((x, y), emoji, font=font, embedded_color=True)

    # Sätt ihop bakgrund och emoji
    img = Image.alpha_composite(img, emoji_img)

    # Spara
    out_path = os.path.join(OUTPUT_DIR, filename)
    img.save(out_path, "PNG")
    print(f"  ✅ {out_path}")

print(f"\n🎭 {len(AVATARS)} avatarer genererade i {OUTPUT_DIR}/")
