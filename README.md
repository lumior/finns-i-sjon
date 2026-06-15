# 🎣 Finns i sjön PRO

> **Top-Notch Multiplayer Card Game** – Det klassiska svenska kortspelet, återuppfunnet för webben med realtidsmultiplayer, AI-motståndare, ELO-rankning och mycket mer.

## ✨ Funktioner

### 🎮 Spel
- **Realtidsmultiplayer** – Spela med vänner över hela världen via WebSocket
- **4 AI-svårighetsgrader** – Från nybörjare till mästare med avancerade strategier
- **Rumsbaserade bord** – Skapa privata eller publika spelbord
- **Spectator-läge** – Titta på pågående spel som åskådare
- **Tur-timer** – 3 minuter per tur för att hålla tempot uppe
- **Kompletta spelregler** – Automatisk par-detektering, "Finns i sjön!"-logik

### 👤 Användare
- **JWT-autentisering** – Säker inloggning och registrering
- **ELO-rankningssystem** – Matchmaking-baserad rating som uppdateras efter varje spel
- **Spelarprofiler** – Statistik, achievements och spelhistorik
- **Topplista** – Global ranking av alla spelare
- **Online-status** – Se vilka som är online

### 🎨 Upplevelse
- **Ljudeffekter** – Web Audio API med kortljud, fiskesplash, vinstfanfar
- **Animationer** – Kortflygningar, partikeleffekter, konfetti
- **Responsiv design** – Fungerar på desktop, tablet och mobil
- **Mörkt tema** – Elegant UI med glassmorphism-effekter
- **3 kortstilar** – Klassisk, modern, minimal

### 🎙️ Röst- & Videochatt
- **WebRTC P2P** – Röstkommunikation direkt mellan spelare
- **Video vid PTT** – Video visas när du håller inne mellanslag (Push-to-Talk)
- **Ljudindikator** – Se vem som pratar just nu

> ⚠️ **Safari-användare:** WebRTC-video fungerar inte på `localhost`. Använd `127.0.0.1` istället, t.ex. `http://127.0.0.1:3000`

### 🤖 AI
- **Naiv** – Slumpmässiga drag (800 ELO)
- **Smart** – Kommer ihåg vad motståndare frågat efter (1100 ELO)
- **Expert** – Sannolikhetsberäkningar och korträkning (1400 ELO)
- **Master** – Psykologi, bait-strategier, endgame-optimering (1700 ELO)

## 🚀 Snabbstart

### Krav
- Node.js 18+
- npm eller yarn

### Installation

```bash
# 1. Klona eller packa upp projektet
cd finns-i-sjon-pro

# 2. Installera beroenden
npm install

# 3. Initiera databasen (skapar SQLite-filen)
npm run init-db

# 4. Starta utvecklingsservern
npm run dev

# 5. Öppna webbläsaren
# Gå till http://localhost:3000
```

## 📁 Projektstruktur

```
finns-i-sjon-pro/
├── server/
│   ├── server.js              # Huvudserver + Socket.IO
│   ├── config/database.js     # SQLite-anslutning
│   ├── models/User.js         # Användarhantering
│   ├── models/Game.js         # Spelhistorik
│   ├── auth/auth.js           # JWT-autentisering
│   ├── game/
│   │   ├── GameEngine.js      # Spelregler & logik
│   │   ├── RoomManager.js     # Rums- & spelarhantering
│   │   ├── CardDeck.js        # Kortlekslogik
│   │   └── AIPlayer.js        # AI med 4 svårighetsgrader
│   └── utils/
│       ├── constants.js       # Spelkonstanter
│       └── elo.js             # ELO-beräkningar
├── public/
│   ├── index.html             # Lobby / Landing page
│   ├── game.html              # Spelbräde
│   ├── leaderboard.html       # Topplista
│   ├── css/
│   │   ├── main.css           # Huvudstyling
│   │   ├── game.css           # Spelbrädes-styling
│   │   └── animations.css     # Animationer & effekter
│   └── js/
│       ├── app.js             # Lobby-klient
│       ├── game.js            # Spelklient
│       ├── socket-client.js   # WebSocket-wrapper
│       ├── audio.js           # Ljudsystem
│       └── animations.js      # Animationssystem
├── package.json
├── .env                       # Miljövariabler
└── README.md
```

## 🎓 AI-strategier

AI:n använder fyra olika strategier baserade på forskning om optimal Go Fish-strategi:

1. **Naiv:** Slumpmässiga val – som en nybörjare
2. **Smart:** Kommer ihåg vad motståndare frågat efter och när
3. **Expert:** Hypergeometrisk sannolikhetsberäkning för alla kort
4. **Master:** Kombinerar allt + bait-strategier, endgame-optimering, psykologi

## 📜 Licens

MIT License – Fri att använda, modifiera och distribuera.

**🎣 Finns i sjön PRO © 2026 – Ett svenskt kortspel för hela världen**
