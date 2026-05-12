# Kortleks-bilder — Grönsakstema 🥗

Detta temat ersätter standard-färgerna (♥♦♣♠) med grönsaker. Varje "färg" i kortleken motsvarar en grönsak:

| Färg | Grönsak | Mapp |
|------|---------|------|
| ♥ Hearts | 🍆 Aubergine | `aubergine/` |
| ♦ Diamonds | Rädisa | `radish/` |
| ♣ Clubs | 🌶️ Paprika | `pepper/` |
| ♠ Spades | 🥔 Potatis | `potato/` |

## Totalt: 52 bilder (13 per grönsak/färg)

## Filnamn per mapp

```
A.png, 2.png, 3.png, 4.png, 5.png, 6.png, 7.png, 8.png, 9.png, 10.png, J.png, Q.png, K.png
```

## Mappstruktur

```
public/assets/cards/
├── aubergine/     → 13 bilder (hearts)
├── radish/        → 13 bilder (diamonds)
├── pepper/        → 13 bilder (clubs)
└── potato/        → 13 bilder (spades)
```

## Format

- **Format**: PNG (WebP och JPG fungerar också)
- **Storlek**: Ca 200×280 px eller större
- **Proportioner**: 5:7 (standard kortproportion)
- **Bakgrund**: Bilden täcker hela kortytan

## Fallback

Om en bild saknas visas kortet automatiskt med standard Unicode-rendering (rank + färg-symbol) istället.
