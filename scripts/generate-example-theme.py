#!/usr/bin/env python3
"""
Genererar ett exempeltema med 26 par (52 kort) för spelet.
Varje par får en unik färg, bokstav och beskrivande namn.
"""

import os
import json
from PIL import Image, ImageDraw, ImageFont

THEME_FOLDER = 'exempeltema'
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public_html', 'assets', 'cards', THEME_FOLDER)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 26 par med bokstav, namn och accentfärg
PAIRS = [
    ('A', 'Äpple', '#ef4444'),
    ('B', 'Bil', '#3b82f6'),
    ('C', 'Citron', '#eab308'),
    ('D', 'Duva', '#64748b'),
    ('E', 'Eld', '#f97316'),
    ('F', 'Fisk', '#06b6d4'),
    ('G', 'Gris', '#f472b6'),
    ('H', 'Hund', '#8b5cf6'),
    ('I', 'Is', '#38bdf8'),
    ('J', 'Juvel', '#ec4899'),
    ('K', 'Katt', '#f59e0b'),
    ('L', 'Lök', '#a3e635'),
    ('M', 'Moln', '#94a3b8'),
    ('N', 'Natt', '#1e293b'),
    ('O', 'Ost', '#fde047'),
    ('P', 'Päron', '#84cc16'),
    ('Q', 'Quiz', '#c084fc'),
    ('R', 'Ros', '#fb7185'),
    ('S', 'Sol', '#fcd34d'),
    ('T', 'Träd', '#15803d'),
    ('U', 'Uggla', '#78350f'),
    ('V', 'Vulkan', '#991b1b'),
    ('W', 'Varg', '#475569'),
    ('X', 'Xylofon', '#db2777'),
    ('Y', 'Yacht', '#0ea5e9'),
    ('Z', 'Zebra', '#18181b'),
]

CARD_WIDTH = 300
CARD_HEIGHT = 420
BORDER_RADIUS = 20


def get_font(size):
    """Försök hitta ett läsbart typsnitt."""
    for font_name in ['Helvetica.ttc', 'Arial.ttf', 'DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        try:
            return ImageFont.truetype(font_name, size)
        except Exception:
            continue
    return ImageFont.load_default()


def hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def darken(rgb, factor=0.6):
    return tuple(int(c * factor) for c in rgb)


def generate_card(letter, name, color):
    img = Image.new('RGB', (CARD_WIDTH, CARD_HEIGHT), '#0f172a')
    draw = ImageDraw.Draw(img)

    # Bakgrundsfärg med rundade hörn
    bg_rgb = hex_to_rgb(color)
    draw.rounded_rectangle(
        [(12, 12), (CARD_WIDTH - 12, CARD_HEIGHT - 12)],
        radius=BORDER_RADIUS,
        fill=bg_rgb,
        outline=darken(bg_rgb, 0.7),
        width=4
    )

    # Inre ram
    draw.rounded_rectangle(
        [(28, 28), (CARD_WIDTH - 28, CARD_HEIGHT - 28)],
        radius=BORDER_RADIUS - 8,
        outline=(255, 255, 255, 100),
        width=2
    )

    # Stor bokstav i mitten
    big_font = get_font(140)
    bbox = draw.textbbox((0, 0), letter, font=big_font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (CARD_WIDTH - text_w) // 2
    y = (CARD_HEIGHT - text_h) // 2 - 40
    draw.text((x, y), letter, font=big_font, fill='white')

    # Namn under bokstaven
    name_font = get_font(36)
    bbox = draw.textbbox((0, 0), name, font=name_font)
    text_w = bbox[2] - bbox[0]
    x = (CARD_WIDTH - text_w) // 2
    draw.text((x, 290), name, font=name_font, fill='white')

    # Liten bokstav uppe till vänster och nere till höger
    small_font = get_font(32)
    draw.text((28, 28), letter, font=small_font, fill='white')
    draw.text((CARD_WIDTH - 50, CARD_HEIGHT - 58), letter, font=small_font, fill='white')

    return img


def generate_back():
    img = Image.new('RGB', (CARD_WIDTH, CARD_HEIGHT), '#1e293b')
    draw = ImageDraw.Draw(img)

    # Mönstrad baksida
    for i in range(0, CARD_WIDTH, 30):
        draw.line([(i, 0), (i, CARD_HEIGHT)], fill='#334155', width=1)
    for i in range(0, CARD_HEIGHT, 30):
        draw.line([(0, i), (CARD_WIDTH, i)], fill='#334155', width=1)

    draw.rounded_rectangle(
        [(20, 20), (CARD_WIDTH - 20, CARD_HEIGHT - 20)],
        radius=BORDER_RADIUS,
        outline='#475569',
        width=4
    )

    font = get_font(48)
    text = 'FISK'
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (CARD_WIDTH - text_w) // 2
    y = (CARD_HEIGHT - text_h) // 2
    draw.text((x, y), text, font=font, fill='#f59e0b')

    return img


def main():
    config = {
        'themeName': 'exempeltema',
        'displayName': 'Exempeltema',
        'pairs': []
    }

    for idx, (letter, name, color) in enumerate(PAIRS):
        pair_id = f'pair-{letter}'
        filename = f'{pair_id}.png'
        filepath = os.path.join(OUTPUT_DIR, filename)

        card = generate_card(letter, name, color)
        card.save(filepath, 'PNG')

        config['pairs'].append({
            'pairId': pair_id,
            'name': name,
            'sortOrder': idx,
            'imagePath': f'{THEME_FOLDER}/{filename}'
        })
        print(f'Genererade {filename}: {name}')

    back = generate_back()
    back.save(os.path.join(OUTPUT_DIR, 'back.png'), 'PNG')
    print('Genererade back.png')

    # Spara konfiguration som kan användas vid seedning
    config_path = os.path.join(OUTPUT_DIR, 'config.json')
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    print(f'Sparade konfiguration till {config_path}')


if __name__ == '__main__':
    main()
