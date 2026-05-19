# AGENTS.md — Finns i Sjön PRO

> **Målgrupp:** AI-kodningsagenter som arbetar med detta projekt.  
> **Språk:** Projektets källkod och dokumentation är primärt på **svenska** (användarsidor, kommentarer, loggmeddelanden, API-svar). Denna fil skrivs på svenska för konsekvens, med tekniska termer på engelska där det är naturligt.

---

## 1. Projektöversikt

**Finns i Sjön PRO** är ett realtidsmultiplayer-kortspel (svenska "Finns i sjön" / Go Fish) för webben. Det har stöd för:

- Rumsbaserade spelbord med privata/publika rum
- AI-motståndare på 4 svårighetsgrader
- Användarkonton med JWT-autentisering och ELO-rankning
- Spectator-läge (åskådare)
- WebRTC-baserad röst- och videochatt (P2P)
- Achievements, spelhistorik och topplista

**Huvudentry:** `server/server.js`  
**Port:** `process.env.PORT || 3000`  
**Statiska filer:** `public_html/` (inte `public/` — notera skillnaden mot README)

---

## 2. Teknikstack

| Lager | Teknik |
|-------|--------|
| Runtime | Node.js 18+ |
| Backend | Express 4, Socket.IO 4 |
| Databas | SQLite3 (dev), MariaDB/MySQL eller PostgreSQL (prod) |
| Auth | JWT (`jsonwebtoken`), bcryptjs |
| Security | Helmet, express-rate-limit, CORS |
| Testing | Jest 30 |
| Linting | ESLint 10 (flat config), Prettier 3 |
| CI/CD | GitHub Actions (`.github/workflows/ci.yml`) |
| Deploy | Railway (via GitHub + Procfile) |

---

## 3. Projektstruktur

```
finns-i-sjon-pro/
├── server/                    # Backend (CommonJS)
│   ├── server.js              # Huvudserver: Express + Socket.IO + routes
│   ├── config/
│   │   └── database.js        # Abstraktionslager: PostgreSQL → MariaDB → SQLite
│   ├── auth/
│   │   └── auth.js            # JWT-generering, verifiering, middleware, socketAuth
│   ├── models/
│   │   ├── User.js            # CRUD för användare, statistik, achievements
│   │   └── Game.js            # Spelhistorik, event-loggning
│   ├── routes/
│   │   ├── auth.js            # POST /register, /login, GET /me, POST /logout
│   │   ├── users.js           # GET /leaderboard, /online, /search, /:id/profile
│   │   ├── games.js           # GET /history, /:id
│   │   ├── rooms.js           # GET /, /:id (kräver RoomManager-instans)
│   │   └── stats.js           # Statistikendpoints
│   ├── game/
│   │   ├── GameEngine.js      # Spelregler, turhantering, par, AI-anslutning
│   │   ├── RoomManager.js     # Rums-CRUD, join/leave/kick, reconnection
│   │   ├── CardDeck.js        # Kortlekslogik (skapa, blanda, dra)
│   │   ├── AIPlayer.js        # AI med 4 svårighetsgrader
│   │   └── utils.js           # extractPairs etc.
│   ├── sockets/
│   │   ├── index.js           # Registrerar alla Socket.IO-handlers
│   │   ├── handlers.js        # Huvudsakliga event-handlers (create_room, ask_cards, etc.)
│   │   └── game-end.js        # Hanterar game_over, ELO-beräkning, persistens
│   ├── utils/
│   │   ├── constants.js       # Spelkonstanter, achievements, tillstånd
│   │   ├── elo.js             # ELO-beräkningsalgoritm
│   │   ├── sanitize.js        # XSS-sanering (escapeHtml)
│   │   └── logger.js          # Loggningshjälpare
│   └── webrtc/
│       └── signaling.js       # WebRTC-signaling (offer/answer/ICE) via Socket.IO
│
├── public_html/               # Frontend (vanilla JS, HTML, CSS)
│   ├── index.html             # Lobby / landing page
│   ├── game.html              # Spelbräde
│   ├── leaderboard.html       # Topplista (standalone)
│   ├── css/
│   │   ├── main.css           # Huvudstyling, design-system
│   │   ├── game.css           # Spelbräde, kort, timer
│   │   ├── animations.css     # Keyframes, partiklar, utility-klasser
│   │   ├── voice-chat.css     # Röstchatt-UI
│   │   └── video-chat.css     # Videochatt-UI
│   ├── js/
│   │   ├── app.js             # Lobby: auth, rum-lista, AI-setup
│   │   ├── game.js            # Spelklient: rendering, interaktion
│   │   ├── socket-client.js   # Socket.IO-wrapper med reconnect
│   │   ├── audio.js           # Web Audio API (syntetiska ljudeffekter)
│   │   ├── animations.js      # Partikeleffekter, kortanimationer
│   │   ├── leaderboard.js     # Topplista-hantering
│   │   ├── voice-chat.js      # WebRTC-röstklient
│   │   ├── voice-ui.js        # Röstchatt-UI-kontroller
│   │   ├── video-chat.js      # WebRTC-videoklient
│   │   └── video-ui.js        # Videochatt-UI-kontroller
│   └── assets/
│       ├── cards/             # Kortbilder (4 teman: aubergine, pepper, potato, radish)
│       └── images/            # Avatarer, AI-porträtt
│
├── tests/                     # Jest-tester
│   ├── game/
│   │   ├── GameEngine.test.js
│   │   ├── CardDeck.test.js
│   │   └── AIPlayer.test.js
│   └── utils/
│       └── elo.test.js
│
├── database/
│   └── game.db                # SQLite-fil (skapas vid init-db)
├── .github/workflows/ci.yml   # GitHub Actions: lint + format-check + test
├── package.json               # NPM-scripts och beroenden
├── jest.config.js             # Jest-konfiguration
├── eslint.config.js           # ESLint flat config (CommonJS, browser+node+jest globals)
├── .prettierrc                # Prettier-konfig (4 spaces, singleQuote, semi)
├── .env / .env.example        # Miljövariabler
└── Procfile                   # Railway: "web: node server/server.js"
```

---

## 4. Bygg- och testkommandon

```bash
# Installera beroenden
npm install

# Starta utvecklingsserver (nodemon med auto-restart)
npm run dev

# Starta produktionsserver
npm start

# Initiera databas (kör `connect()` i database.js)
npm run init-db

# Tester
npm test              # Kör alla Jest-tester en gång (--forceExit)
npm run test:watch    # Kör i bevakningsläge
npm run test:coverage # Kör med coverage-rapport

# Kodkvalitet
npm run lint          # ESLint på server/ och tests/
npm run lint:fix      # Auto-fixa ESLint-problem
npm run format        # Prettier --write på server/ och tests/
npm run format:check  # Prettier --check (används i CI)
```

---

## 5. Kodstil och konventioner

### Allmänt
- **Modulsystem:** CommonJS (`require` / `module.exports`)
- **ES-version:** `ecmaVersion: 'latest'` (ESLint)
- **Indentering:** 4 mellanslag (Prettier)
- **Semikolon:** Ja
- **Citattecken:** Enkla (`'string'`)
- **Radbredd:** 120 tecken
- **Pilfunktioner:** Undvik parenteser vid enkel parameter: `x => x + 1`

### ESLint-regler (se `eslint.config.js`)
- `no-unused-vars`: warn (args som börjar med `_` ignoreras)
- `no-console`: off (tillåtet i detta projekt)
- `eqeqeq`: error (alltid `===` / `!==`)
- `curly`: error (alltid måsvingar, även för enraders block)
- `prefer-const`: warn

### Namngivning och språk
- **Kommentarer och loggmeddelanden:** Skriv på **svenska**. Detta är projektstandard.
- **API-felsvar:** Skriv på svenska (t.ex. `"Ange ett giltigt namn"`, `"Endast värden kan starta spelet"`).
- **Variabler:** camelCase (`playerName`, `socketId`, `gameState`)
- **Klasser:** PascalCase (`GameEngine`, `RoomManager`)
- **Konstanter:** UPPERCASE_SNAKE_CASE i `constants.js`

---

## 6. Testning

- **Ramverk:** Jest med Node-miljö (`testEnvironment: 'node'`)
- **Testmönster:** `**/tests/**/*.test.js`
- **Coverage:** Samlas från `server/**/*.js`, exkluderar `server/server.js` och `server/config/database.js`
- **Viktigt:** Jest körs alltid med `--forceExit` eftersom Socket.IO kan hålla event-loopen vid liv.
- **CI:** GitHub Actions kör `npm run lint`, `npm run format:check`, och `npm test -- --forceExit` vid varje push/PR till `main`.

### Existerande testfiler
- `tests/game/GameEngine.test.js` — Spelregler, turhantering, utdelning
- `tests/game/CardDeck.test.js` — Kortlekslogik
- `tests/game/AIPlayer.test.js` — AI-beteenden
- `tests/utils/elo.test.js` — ELO-beräkningar

---

## 7. Säkerhetsöverväganden

### Autentisering
- JWT med 7 dagars giltighet. `JWT_SECRET` **måste** bytas i produktion.
- Token skickas i `Authorization: Bearer <token>`-header för REST, och i `socket.handshake.auth.token` för Socket.IO.
- Auth-middleware sätter `req.user` / `socket.user` till `null` vid saknad/ogiltig token (aldrig hårda fel).

### Databas
- SQL-injektionsskydd: alla queries använder parametriserade uttryck (`?` / `$1`).
- Lösenord hashade med bcrypt (salt rounds: 10).

### Input-sanering
- All användarchatt saneras via `escapeHtml()` innan broadcast.
- Helmet CSP är aktiverat. Justera `contentSecurityPolicy` i `server/server.js` om nya externa resurser läggs till.

### Rate limiting
- `/api/auth/*`: 10 förfrågningar / 15 minuter
- Läs-endpoints (rooms, online, leaderboard): 120 / minut
- Övriga API: 100 / 15 minuter
- **Obs:** Socket.IO-events har **inte** rate limiting för närvarande.

---

## 8. Databasarkitektur

Databaslagret (`server/config/database.js`) har en **fallback-kedja**:

1. **PostgreSQL** — om `DATABASE_URL` är satt (Railway-standard)
2. **MariaDB/MySQL** — om `DB_HOST` etc. är satt
3. **SQLite3** — fallback för utveckling (`DB_PATH=./database/game.db`)

Tabeller: `users`, `games`, `game_participants`, `game_events`, `friendships`, `achievements`, `game_snapshots`.

Se `PROJEKTPLAN.md` för fullständigt schema.

---

## 9. Socket.IO-arkitektur

- **Namespace:** Default `/`
- **Auth-middleware:** `Auth.socketAuth` körs före `connection`-event
- **Huvudmodul:** `server/sockets/index.js` sätter ihop `handlers.js` och `game-end.js`
- **Viktiga events:**
  - `create_room`, `join_room`, `start_game`
  - `ask_cards` + `respond_to_ask` (mänskliga spelare)
  - `chat_message`
  - `reconnect_attempt` (stöd för sidomladdning/ny flik)

Spelet använder **två ask-flöden**:
- Direkt `askForCards()` för AI-motståndare (svarar synkront)
- `requestAsk()` + `respond_to_ask()` för mänskliga spelare (asynkront pending-ask-mönster)

---

## 10. Driftsättning

### Railway (primär metod)
1. Repo på GitHub, kopplat till Railway
2. `Procfile` anger startkommando: `web: node server/server.js`
3. Miljövariabler i Railway:
   - `JWT_SECRET` — lång slumpmässig sträng
   - `NODE_ENV=production`
   - `PORT=3000`
   - `DATABASE_URL` — för PostgreSQL (rekommenderat för persistent data)

**Viktigt:** På Railways gratisplan är filsystemet "ephemeral". Använd PostgreSQL (`DATABASE_URL`) för att inte förlora användardata vid omstart.

### Lokalt
```bash
cp .env.example .env
npm install
npm run init-db
npm run dev
# Öppna http://localhost:3000
```

---

## 11. Utvecklingskonventioner

### Innan du commitar
1. Kör `npm run lint` — fixa fel
2. Kör `npm run format` — formatera kod
3. Kör `npm test` — se till att alla tester går igenom
4. Kontrollera att `npm run format:check` är grön

### Att lägga till en ny API-endpoint
1. Skapa route-fil under `server/routes/` (eller utöka befintlig)
2. Registrera i `server/server.js` med `app.use('/api/xxx', ...)`
3. Använd `Auth.middleware()` för autentisering om det behövs (körs redan globalt, sätt `req.user` till `null` för öppna endpoints)

### Att lägga till ett Socket.IO-event
1. Lägg till handler i `server/sockets/handlers.js`
2. Vid speländringar: använd `roomManager.getRoomBySocket(socket.id)` för att hämta aktuellt rum
3. Använd `io.to(roomId).emit(...)` för broadcast och `socket.emit(...)` för direktsvar

---

## 12. Kända begränsningar (från PROJEKTPLAN.md)

- `makeAIMMove` är felstavat i `GameEngine.js` (ska vara `makeAIMove`)
- `handleGameEnd` skickar inte `eloChange` per spelare i `standings`-arrayen
- `friendships`-tabellen finns men används inte i frontend
- WebRTC-video fungerar inte på Safari `localhost` — använd `127.0.0.1`

---

## 13. Snabbreferens: Viktiga filer att läsa

| Om du ska... | Läs dessa filer |
|--------------|-----------------|
| Ändra spelregler | `server/game/GameEngine.js`, `server/game/utils.js` |
| Ändra AI-beteende | `server/game/AIPlayer.js` |
| Ändra rumshantering | `server/game/RoomManager.js` |
| Ändra databas/schema | `server/config/database.js`, `server/models/*.js` |
| Ändra frontend-lobby | `public_html/js/app.js`, `public_html/index.html` |
| Ändra spelbräde | `public_html/js/game.js`, `public_html/game.html` |
| Ändra ljud/animationer | `public_html/js/audio.js`, `public_html/js/animations.js` |
| Ändra auth | `server/auth/auth.js`, `server/routes/auth.js` |
| Ändra WebRTC | `server/webrtc/signaling.js`, `public_html/js/voice-chat.js` |

---

**🎣 Finns i Sjön PRO — Ett svenskt kortspel för hela världen**
