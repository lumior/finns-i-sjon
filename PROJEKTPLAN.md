# 🎣 Finns i Sjön PRO – Projektplan

## Projektöversikt

**Projektnamn:** Finns i Sjön PRO  
**Version:** 2.0.0  
**Typ:** Multiplayer kortspel (real-time webbaserat)  
**Teknikstack:** Node.js, Express, Socket.IO, SQLite3, vanilla JavaScript  
**Skapat:** 2026-05-06  

> Det klassiska svenska kortspelet "Finns i sjön" (Go Fish) återuppfunnet för webben med realtidsmultiplayer, AI-motståndare, ELO-rankning, chatt, achievements och modern UI.

---

## 📁 Komplett filstruktur (26 filer)

```
finns-i-sjon-pro/
├── 📦 Konfiguration (3 filer)
│   ├── package.json              # NPM-beroenden och scripts
│   ├── .env                      # Miljövariabler (PORT, JWT_SECRET, DB_PATH)
│   ├── .gitignore                # Git-ignore-regler
│   │
│   ├── 🖥️ Server-konfiguration (3 filer)
│   │   ├── server/config/database.js     # SQLite-anslutning + tabellinitiering
│   │   ├── server/utils/constants.js     # Spelkonstanter (kort, tillstånd, achievements)
│   │   └── server/utils/elo.js           # ELO-rankningsalgoritm
│   │
│   ├── 🗄️ Modeller (2 filer)
│   │   ├── server/models/User.js         # CRUD för användare + statistik
│   │   └── server/models/Game.js         # Spelhistorik + event-loggning
│   │
│   ├── 🔐 Auth (1 fil)
│   │   └── server/auth/auth.js           # JWT-generering, verifiering, middleware
│   │
│   ├── 🎮 Spelmotor (4 filer)
│   │   ├── server/game/CardDeck.js       # Kortlek: skapa, blanda, dra
│   │   ├── server/game/AIPlayer.js       # AI med 4 svårighetsgrader
│   │   ├── server/game/RoomManager.js    # Rums-CRUD, join/leave/kick/ban
│   │   └── server/game/GameEngine.js     # Huvudspelregler, turhantering, par
│   │
│   ├── 🌐 Huvudserver (1 fil)
│   │   └── server/server.js              # Express + Socket.IO + alla endpoints
│   │
│   ├── 🎨 Frontend HTML (3 filer)
│   │   ├── public/index.html             # Lobby / landing page
│   │   ├── public/game.html              # Spelbräde (3-sektionslayout)
│   │   └── public/leaderboard.html       # Full topplista
│   │
│   ├── 🎨 Frontend CSS (3 filer)
│   │   ├── public/css/main.css           # Huvudstyling, komponenter, layout
│   │   ├── public/css/game.css           # Spelbrädes-styling, kort, timer
│   │   └── public/css/animations.css     # Keyframes, utility-klasser, partiklar
│   │
│   └── ⚡ Frontend JS (5 filer)
│       ├── public/js/app.js              # Lobby: auth, rum, AI-setup
│       ├── public/js/socket-client.js    # WebSocket-wrapper med reconnect
│       ├── public/js/audio.js            # Web Audio API (syntetiska ljudeffekter)
│       ├── public/js/animations.js       # Partikeleffekter, kortanimationer
│       └── public/js/game.js             # Spelklient: rendering, turhantering
│
└── 📚 Dokumentation
    └── README.md                         # Snabbstart + projektstruktur
    └── PROJEKTPLAN.md                    # DENNA FIL
```

---

## 🏗️ Arkitekturöversikt

### Backend-arkitektur

```
┌─────────────────────────────────────────────────────────────┐
│                      Express Server                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  REST API   │  │  Socket.IO  │  │    Statiska filer   │ │
│  │  /api/*     │  │  Events     │  │    public/          │ │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────┘ │
│         │                │                                   │
│  ┌──────▼──────┐  ┌──────▼──────┐                           │
│  │  Auth Layer │  │ Game Engine │                           │
│  │  JWT        │  │  (stateful) │                           │
│  └─────────────┘  └──────┬──────┘                           │
│                          │                                   │
│              ┌───────────┼───────────┐                       │
│              ▼           ▼           ▼                       │
│         ┌────────┐  ┌────────┐  ┌────────┐                  │
│         │ Models │  │  ELO   │  │  AI    │                  │
│         │User/Game│  │System  │  │Players │                  │
│         └───┬────┘  └────────┘  └────────┘                  │
│             │                                                │
│             ▼                                                │
│         ┌────────────┐                                       │
│         │  SQLite3   │                                       │
│         │  game.db   │                                       │
│         └────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

### Frontend-arkitektur

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser Client                            │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   app.js     │  │   game.js    │  │  leaderboard.html│  │
│  │   (Lobby)    │  │ (Game Board) │  │   (Standalone)   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────┘  │
│         │                 │                                  │
│  ┌──────▼───────┐  ┌──────▼───────┐                         │
│  │ socket-client│  │ socket-client│                         │
│  │   (shared)   │  │   (shared)   │                         │
│  └──────┬───────┘  └──────┬───────┘                         │
│         │                 │                                  │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────────────────┐  │
│  │   audio.js   │  │ animations.js│  │   CSS (3 filer)  │  │
│  │  (Web Audio) │  │ (Particles)  │  │  main/game/anim  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🗄️ Databasschema (SQLite3)

### Tabeller

```sql
users
├── id INTEGER PRIMARY KEY AUTOINCREMENT
├── username TEXT UNIQUE NOT NULL
├── email TEXT UNIQUE NOT NULL
├── password_hash TEXT NOT NULL
├── display_name TEXT
├── avatar_url TEXT DEFAULT '/assets/images/default-avatar.png'
├── elo_rating INTEGER DEFAULT 1200
├── games_played INTEGER DEFAULT 0
├── games_won INTEGER DEFAULT 0
├── games_lost INTEGER DEFAULT 0
├── total_pairs INTEGER DEFAULT 0
├── total_fishings INTEGER DEFAULT 0
├── total_asks INTEGER DEFAULT 0
├── successful_asks INTEGER DEFAULT 0
├── longest_streak INTEGER DEFAULT 0
├── created_at DATETIME DEFAULT CURRENT_TIMESTAMP
├── last_login DATETIME
└── is_online INTEGER DEFAULT 0

games
├── id INTEGER PRIMARY KEY AUTOINCREMENT
├── room_id TEXT NOT NULL
├── game_type TEXT DEFAULT 'standard'
├── player_count INTEGER
├── winner_id INTEGER → users.id
├── winner_name TEXT
├── duration_seconds INTEGER
├── total_turns INTEGER
└── created_at DATETIME DEFAULT CURRENT_TIMESTAMP

game_participants
├── id INTEGER PRIMARY KEY AUTOINCREMENT
├── game_id INTEGER → games.id
├── user_id INTEGER → users.id
├── final_pairs INTEGER
├── final_rank INTEGER
└── elo_change INTEGER

game_events
├── id INTEGER PRIMARY KEY AUTOINCREMENT
├── game_id INTEGER → games.id
├── event_type TEXT
├── player_id INTEGER
├── target_id INTEGER
├── rank TEXT
├── success INTEGER
└── timestamp DATETIME DEFAULT CURRENT_TIMESTAMP

friendships
├── id INTEGER PRIMARY KEY AUTOINCREMENT
├── user_id INTEGER
├── friend_id INTEGER
├── status TEXT DEFAULT 'pending'
├── created_at DATETIME DEFAULT CURRENT_TIMESTAMP
└── UNIQUE(user_id, friend_id)

achievements
├── id INTEGER PRIMARY KEY AUTOINCREMENT
├── user_id INTEGER
├── achievement_type TEXT
├── unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP
└── UNIQUE(user_id, achievement_type)
```

---

## 🔌 API-endpoints (REST)

### Auth (`/api/auth/*`)

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| POST  | `/api/auth/register` | Registrera ny användare |
| POST  | `/api/auth/login` | Logga in, få JWT-token |
| GET   | `/api/auth/me` | Hämta inloggad användares profil |
| POST  | `/api/auth/logout` | Logga ut, sätt offline |

### Users (`/api/users/*`)

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET   | `/api/users/leaderboard?limit=N` | Global topplista |
| GET   | `/api/users/online` | Spelare online just nu |
| GET   | `/api/users/search?q=...` | Sök användare |
| GET   | `/api/users/:id/profile` | Publik profil + achievements + historik |

### Games (`/api/games/*`)

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET   | `/api/games/history` | Inloggad användares spelhistorik |
| GET   | `/api/games/:id` | Speldetaljer med deltagare & events |

### Rooms (`/api/rooms/*`)

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET   | `/api/rooms` | Lista publika väntande rum |
| GET   | `/api/rooms/:id` | Grundinfo om specifikt rum |

---

## ⚡ Socket.IO Events

### Klient → Server

| Event | Data | Beskrivning |
|-------|------|-------------|
| `create_room` | `{playerName, roomName, password, gameType, settings}` | Skapa nytt rum |
| `join_room` | `{roomId, playerName, password}` | Gå med i rum |
| `reconnect_attempt` | `{oldSocketId}` | Återanslut efter disconnect |
| `start_game` | – | Värd startar spelet |
| `ask_cards` | `{targetId, rank}` | Fråga motståndare om kort |
| `chat_message` | `{message}` | Skicka chattmeddelande |
| `add_ai` | `{difficulty}` | Lägg till AI-spelare |
| `remove_ai` | `{aiId}` | Ta bort AI-spelare |
| `kick_player` | `{targetSocketId}` | Kicka spelare (värden) |
| `update_settings` | `{allowAI, turnTimer, spectatorMode, maxPlayers}` | Uppdatera rum |
| `leave_room` | – | Lämna rum |

### Server → Klient

| Event | Data | Beskrivning |
|-------|------|-------------|
| `room_created` | `{roomId, gameState, isHost, settings}` | Bekräftelse rums-skapande |
| `room_joined` | `{roomId, gameState, chatHistory, isHost}` | Bekräftelse rums-join |
| `spectator_joined` | `{roomId, gameState, roomName}` | Bekräftelse åskådare |
| `game_started` | `{gameState}` | Spelet har börjat |
| `game_state_update` | `gameState` | Allmän state-uppdatering |
| `turn_result` | `{..., gameState, aiReasoning?}` | Resultat av ett drag |
| `game_over` | `{gameState, winner, standings, duration, eloChange}` | Spelet slut |
| `chat_message` | `{id, player, message, timestamp, isSystem}` | Nytt chattmeddelande |
| `player_joined` | `{playerName, playerCount, aiCount}` | Spelare gick med |
| `player_left` | `{playerName, playerId, reason}` | Spelare lämnade |
| `player_reconnected` | `{playerId, playerName}` | Spelare återanslöt |
| `player_kicked` | `{playerName, byHost}` | Spelare blev kickad |
| `kicked` | `{reason}` | Du blev kickad |
| `ai_added` | `{player, gameState}` | AI tillagd |
| `ai_removed` | `{aiId}` | AI borttagen |
| `settings_updated` | `settings` | Inställningar ändrade |
| `reconnected` | `{roomId, gameState, chatHistory}` | Återanslutning OK |
| `left_room` | – | Bekräftelse lämna |
| `lobby_update` | `rooms[]` | Lobby-lista uppdaterad |
| `error` | `{message}` | Felmeddelande |

---

## 🎮 Game Engine – Spelflöde

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   WAITING    │────▶│   DEALING    │────▶│   PLAYING    │
│  (spelare    │     │ (dela kort,  │     │ (turväxling, │
│   ansluter)  │     │  hitta par)  │     │  fråga, fiska)│
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  ▼
                                           ┌──────────────┐
                                           │   FINISHED   │
                                           │ (beräkna     │
                                           │  vinnare,     │
                                           │  spara, ELO)  │
                                           └──────────────┘
```

### Kärnregler

1. **Dela ut:** 5 kort/spelare (7 vid 2 spelare), resten blir "sjön"
2. **Initiala par:** Alla spelare kontrollerar och lägger ut par direkt
3. **Fråga:** Fråga en motståndare om en valör du själv har
4. **Träff:** Får korten → fortsätt din tur → kontrollera nya par
5. **Miss:** "Finns i sjön!" → dra ett kort från sjön → kontrollera par
6. **Lucky fish:** Om du drar rätt kort → fortsätt din tur
7. **Game over:** Alla händer tomma + sjön tom → flest par vinner

### Tur-timeout
- 45 sekunder per tur (konfigurerbart)
- Vid timeout: drar automatiskt ett kort, nästa spelares tur

---

## 🤖 AI-strategier (4 nivåer)

### 1. Naiv (ELO ~800)
- **Strategi:** Helt slumpmässiga val av motståndare och valör
- **Minne:** Inget
- **Användning:** Perfekt för nybörjare som vill lära sig spelet

### 2. Smart (ELO ~1100)
- **Strategi:** Minnesbaserad med poängsystem
- **Minne:**
  - `askedCards` – Vilka valörer som frågats och hur många gånger
  - `givenCards` – Vilka valörer som getts bort
  - `missingCards` – Vilka valörer någon SA "finns i sjön" om
- **Poänglogik:**
  - +15 poäng per tidigare frågan valör
  - +25 extra om frågat ≥2 gånger
  - -50 om motståndaren sagt "finns i sjön" om valören
  - -30 om motståndaren gett bort valören tidigare
  - +40 om spelaren har 3 av samma valör (1 kvar)

### 3. Expert (ELO ~1400)
- **Strategi:** Sannolikhetsberäkning med hypergeometrisk fördelning
- **Beräkning:**
  - `P(äger valör)` = (återstående valörer / okända kort) × min(kort, 3)
  - Justerar med minne: +20% per tidigare frågan, ×0.1 om "finns i sjön"
- **Expected Value:** Sannolikhet × bonus för stora händer

### 4. Master (ELO ~1700)
- **Strategi:** Kombinerar allt + avancerad psykologi
- **Extra funktioner:**
  - **Bait-strategi:** Efter 5 turer, 15% chans att lura motståndare med ensamt kort
  - **Exakt kunskap:** Om någon frågat samma valör 2+ gånger → 90% säker
  - **Endgame:** När <10 kort i sjön → attackera rikaste motståndare
  - **Confidence boost:** +10% per konsekutiv fråga

---

## 🏆 Achievements-system

| Achievement | Villkor | Ikon |
|-------------|---------|------|
| `first_win` | Första segern | 🏆 |
| `fisherman` | 5+ framgångsrika frågor i ett spel | 🎣 |
| `master_fisherman` | 10+ framgångsrika frågor i ett spel | 🧜 |
| `lucky_star` | 3+ lucky fiskar i ett spel | ⭐ |
| `pair_master` | 5+ par i ett spel | 🃏 |
| `speed_demon` | Vinst på ≤10 turer | ⚡ |
| `comeback_kid` | Vinst efter att ha haft färre par | 🔄 |
| `solo_victory` | Vinst mot 3+ motståndare | 🥇 |
| `ai_slayer` | Vinst mot AI | 🤖 |
| `chat_master` | 50+ chattmeddelanden | 💬 |

---

## 🎨 Frontend-designsystem

### Färgpalett

```css
:root {
  --primary: #6366f1;        /* Indigo */
  --primary-dark: #4f46e5;
  --primary-light: #818cf8;
  --secondary: #10b981;      /* Emerald */
  --accent: #f59e0b;         /* Amber */
  --danger: #ef4444;         /* Red */
  --bg-primary: #0f172a;     /* Slate 900 */
  --bg-secondary: #1e293b;   /* Slate 800 */
  --bg-tertiary: #334155;    /* Slate 700 */
  --text-primary: #f8fafc;   /* Slate 50 */
  --text-secondary: #94a3b8; /* Slate 400 */
  --text-muted: #64748b;     /* Slate 500 */
  --table-green: #065f46;    /* Emerald 800 */
  --table-dark: #022c22;     /* Emerald 950 */
}
```

### Komponenter

- **Knappar:** 5 varianter (primary, secondary, outline, glow, icon)
- **Modaler:** Overlay + glass-effect, 3 storlekar (small, default, large)
- **Kort:** 3 stilar (classic, modern, minimal) med 3D-hover
- **Formulär:** Fokus-ringar med primary-glow
- **Tabbar:** Understreck-indikator med animation
- **Timer:** SVG-cirkel med stroke-dasharray-animation

### Responsiva brytpunkter

| Breakpoint | Ändringar |
|------------|-----------|
| ≤1024px | Chatt flyttas till botten |
| ≤768px | Header-kompakt, kort mindre, nav göms |
| ≤480px | Vertikala knappar, minimala kort |

---

## 🔊 Ljudsystem (Web Audio API)

| Event | Ljudtyp | Frekvens |
|-------|---------|----------|
| Kort delas ut | Sine sweep | 800→400 Hz |
| Kort vänds | Triangle sweep | 600→900 Hz |
| Framgång (träff) | Major-arp | 523→1046 Hz |
| Misslyckas | Sawtooth fall | 300→150 Hz |
| Fiska (drar kort) | Brus + lowpass | Filter 1000→200 Hz |
| Lucky fish | Major-triad | 880→1320 Hz |
| Tur-start | Sine upp | 440→660 Hz |
| Vinst | Fanfar | 6 toner |
| Förlust | Sawtooth fall | 300→150→100 Hz |
| Chatt | Kort pip | 1200 Hz |
| Bakgrundsmusik | 4 sinus-vågor | 220→440 Hz + lowpass |

---

## ✨ Animationssystem

### Kortanimationer
- `cardDeal` – 3D-fall från toppen med rotation
- `cardFlip` – Y-axel rotation
- `cardFly` – Flygning mellan element med skalning
- `cardReceive` – Slide-in från höger
- `cardShake` – Horisontell vibration

### Partikeleffekter
- **SpawnParticles:** Explosion av färgade cirklar (guld, blå, grön, röd)
- **SpawnConfetti:** 50 fallande rektanglar i regnbågsfärger
- **FishSplash:** Vattenemoji med skalning
- **PairMatch:** Guld-partiklar vid par-bildning

### UI-animationer
- `fadeIn/fadeInUp/fadeInScale` – Opacitet + transform
- `slideInLeft/Right` – Horisontell slide
- `currentTurnPulse` – Glowing border-puls
- `thinkingDot` – Tre punkter som pulserar i fas
- `achievementPop` – Skala + rotation vid unlock

---

## 📋 Kända begränsningar & TODO

### Befintliga buggar som kan fixas

1. **GameEngine.js rad ~540:** `makeAIMMove` är felstavat (ska vara `makeAIMove`) – orsakar runtime-fel när AI får extra tur
2. **server.js:** `handleGameEnd` använder `eloResults` men `standings` innehåller inte `eloChange` per spelare från backend – frontend förväntar sig `p.eloChange` men server skickar inte detta fält i standings-arrayen
3. **app.js:** `createRoom` och `startAIGame` skapar nya Socket.IO-anslutningar men stänger dem aldrig – kan orsaka minnesläcka
4. **RoomManager.leaveRoom:** Timeout för att ta bort tomma rum körs alltid, även om nya spelare ansluter under väntetiden
5. **GameEngine:** `getChatHistory()` anropas i `join_room` men metoden finns inte definierad i GameEngine

### Saknade features (potentiella förbättringar)

- [ ] E-postverifiering vid registrering
- [ ] Lösenordsåterställning
- [ ] Matchmaking (automatiskt hitta motståndare)
- [ ] Turneringar med bracket-system
- [ ] Privata meddelanden mellan vänner
- [ ] Vännerlista (friendships-tabellen finns men används inte)
- [ ] Spelarkonfiguration (avatar-uppladdning)
- [ ] Admin-panel
- [ ] Rate-limiting på Socket.IO-events (endast REST har rate limit)
- [ ] HTTPS/WSS-stöd för produktion
- [ ] Docker-containerisering
- [ ] Enhetstester (Jest/Mocha)
- [ ] WebRTC-röstchatt

---

## 🚀 Driftsättning

### Utveckling
```bash
npm install
npm run init-db    # Skapar database/game.db
npm run dev        # Nodemon + auto-restart
```

### Produktion
```bash
npm install --production
npm start          # node server/server.js
```

### Miljövariabler (.env)
```env
PORT=3000
JWT_SECRET=<generera stark nyckel>
DB_PATH=./database/game.db
NODE_ENV=production
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
```

### Säkerhetschecklista för produktion
- [ ] Ändra `JWT_SECRET` till stark slumpmässig sträng
- [ ] Sätt `NODE_ENV=production`
- [ ] Aktivera HTTPS (Let's Encrypt)
- [ ] Konfigurera CORS till specifika origins (inte `*`)
- [ ] Aktivera Helmet CSP (justera från `false`)
- [ ] Sätt upp reverse proxy (Nginx)
- [ ] Aktivera loggning (Winston/Pino)
- [ ] Övervakning (PM2/Docker)

---

## 📊 Statistik

| Mått | Värde |
|------|-------|
| Totalt antal filer | 26 |
| Backend-filer | 14 |
| Frontend-filer | 12 |
| Rader JavaScript (backend) | ~1 400 |
| Rader JavaScript (frontend) | ~1 200 |
| Rader CSS | ~1 500 |
| Rader HTML | ~800 |
| NPM-beroenden | 10 |
| Dev-beroenden | 1 (nodemon) |
| Databastabeller | 6 |
| Socket.IO events | 22 |
| REST endpoints | 10 |
| AI-svårighetsgrader | 4 |
| Achievements | 10 |
| Skärmar/sidor | 3 |

---

## 📝 Utvecklingshistorik

| Datum | Händelse |
|-------|----------|
| 2026-05-06 | Projekt skapat, alla 26 filer skrivna |
| 2026-05-06 | Projektplan dokumenterad |

---

**🎣 Finns i Sjön PRO – Ett svenskt kortspel för hela världen**
