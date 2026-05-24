#!/usr/bin/env python3
"""Generera unika spelar-avatarer för Finns i Sjön PRO."""

from PIL import Image, ImageDraw, ImageFont
import os

OUTPUT_DIR = "public_html/assets/images/avatars"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 32 unika avatarer: (filnamn, bakgrundsfärg, emoji)
# Principer för kontrast:
# - Mörka emojis → ljusa/mättade bakgrunder
# - Ljusa emojis → mörka/djupa bakgrunder
# - Färgade emojis → komplementfärger eller neutrala kontraster
AVATARS = [
    # Grupp 1: Blåa/kalla emojis på varma bakgrunder
    ("player-1.png",  "#e85d4e", "🧢"),   # Blå keps på röd/korall
    ("player-2.png",  "#f4a261", "🐬"),   # Blå delfin på aprikos
    ("player-3.png",  "#e9c46a", "🐳"),   # Blå val på guld/gul
    ("player-4.png",  "#f4a261", "❄️"),   # Snöflinga på aprikos
    ("player-5.png",  "#e76f51", "💎"),   # Diamant på terrakotta
    ("player-6.png",  "#f4a261", "🧊"),   # Isbit på aprikos
    ("player-7.png",  "#e9c46a", "🌊"),   # Våg på guld
    ("player-8.png",  "#e85d4e", "🥶"),   # Kall på röd

    # Grupp 2: Gröna emojis på lila/rosa/magenta bakgrunder
    ("player-9.png",  "#9b5de5", "🐸"),   # Groda på lila
    ("player-10.png", "#f15bb5", "🌿"),   # Ört på rosa
    ("player-11.png", "#c77dff", "🦎"),   # Ödla på ljuslila
    ("player-12.png", "#ff006e", "🌵"),   # Kaktus på cerise
    ("player-13.png", "#7209b7", "🍀"),   # Klöver på mörklila
    ("player-14.png", "#f15bb5", "🐢"),   # Sköldpadda på rosa
    ("player-15.png", "#9b5de5", "🥝"),   # Kiwi på lila
    ("player-16.png", "#ff006e", "🐊"),   # Krokodil på cerise

    # Grupp 3: Gula/orangea emojis på mörkblå/mörkgröna bakgrunder
    ("player-17.png", "#1d3557", "⭐"),   # Stjärna på mörkblå
    ("player-18.png", "#2a9d8f", "🦁"),   # Lejon på teal
    ("player-19.png", "#1b4332", "🌻"),   # Solros på mörkgrön
    ("player-20.png", "#264653", "🐥"),   # Kyckling på skifferblå
    ("player-21.png", "#1d3557", "🌟"),   # Glittrande stjärna på mörkblå
    ("player-22.png", "#2a9d8f", "🦊"),   # Räv på teal
    ("player-23.png", "#1b4332", "🌕"),   # Måne på mörkgrön
    ("player-24.png", "#264653", "🧡"),   # Orange hjärta på skifferblå

    # Grupp 4: Röda/lila emojis på ljusa/gröna/cyan bakgrunder
    ("player-25.png", "#90e0ef", "🌹"),   # Ros på ljusblå
    ("player-26.png", "#b7e4c7", "🍎"),   # Äpple på mintgrön
    ("player-27.png", "#caf0f8", "🎈"),   # Ballong på isblå
    ("player-28.png", "#d8f3dc", "🍓"),   # Jordgubbe på ljusgrön
    ("player-29.png", "#90e0ef", "🦩"),   # Flamingo på ljusblå
    ("player-30.png", "#b7e4c7", "🍄"),   # Svamp på mintgrön
    ("player-31.png", "#caf0f8", "🎪"),   # Cirkus på isblå
    ("player-32.png", "#d8f3dc", "🦑"),   # Bläckfisk på ljusgrön
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
