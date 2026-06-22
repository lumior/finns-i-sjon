<!-- AGENTS.md — Finns i Sjön PRO -->

> **Målgrupp:** AI-kodningsagenter som arbetar med detta projekt.  
> **Språk:** Projektets källkod och dokumentation är primärt på **svenska** (användarsidor, kommentarer, loggmeddelanden, API-svar). Denna fil skrivs på svenska för konsekvens, med tekniska termer på engelska där det är naturligt.

---

## 1. Projektöversikt

**Finns i Sjön PRO** (v2.0.0) är ett realtidsmultiplayer-kortspel (svenska "Finns i sjön" / Go Fish) för webben. Det har stöd för:

- Rumsbaserade spelbord med privata/publika rum
- AI-motståndare på 4 svårighetsgrader
- Användarkonton med JWT-autentisering, ELO-rankning, e-postverifiering och lösenordsåterställning
- Spectator-läge (åskådare)
- WebRTC-baserad röst- och videochatt (P2P)
- Achievements, spelhistorik och topplista
- Admin-API för kortlekstemahantering

**Huvudentry:** `server/server.js`  
**Port:** `process.env.PORT || 3000`  
**Statiska filer:** `public_html/` (inte `public/` — notera skillnaden mot README)

---

## 2. Teknikstack

| Lager | Teknik |
|-------|--------|
| Runtime | Node.js 18+ (CI använder Node 20) |
| Backend | Express 4, Socket.IO 4 |
| Databas | SQLite3 (dev), MariaDB/MySQL eller PostgreSQL (prod) |
| Auth | JWT (`jsonwebtoken`), bcryptjs |
| E-post | Nodemailer (SMTP) |
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
│   │   ├── Game.js            # Spelhistorik, event-loggning (inaktiv persistens)
│   │   ├── Friendship.js      # Vänförfrågningar och vännerlista
│   │   └── Theme.js           # Kortleksteman och par
│   ├── routes/
│   │   ├── auth.js            # Auth-endpoints
│   │   ├── users.js           # Leaderboard, online, sök, profiler
│   │   ├── games.js           # Spelhistorik
│   │   ├── rooms.js           # Factory: createRoomRouter(roomManager)
│   │   ├── stats.js           # Totala spel
│   │   ├── admin.js           # Admin-API för kortleksteman (kräver admin-roll)
│   │   ├── themes.js          # Publika tema-endpoints
│   │   └── friends.js         # Vännerlista-API
│   ├── game/
│   │   ├── GameEngine.js      # Spelregler, turhantering, par, AI-anslutning
│   │   ├── RoomManager.js     # Rums-CRUD, join/leave/kick, reconnection, ban
│   │   ├── CardDeck.js        # Kortlekslogik (skapa, blanda, dra)
│   │   ├── AIPlayer.js        # AI med 4 svårighetsgrader
│   │   └── utils.js           # extractPairs, getPlayerAvatar etc.
│   ├── sockets/
│   │   ├── index.js           # Registrerar alla Socket.IO-handlers
│   │   ├── handlers.js        # Huvudsakliga event-handlers (create_room, ask_cards, etc.)
│   │   └── game-end.js        # Hanterar game_over, ELO-beräkning, persistens
│   ├── utils/
│   │   ├── constants.js       # Spelkonstanter, achievements, tillstånd
│   │   ├── elo.js             # ELO-beräkningsalgoritm
│   │   ├── sanitize.js        # XSS-sanering (escapeHtml)
│   │   ├── logger.js          # Loggningshjälpare (färgad dev / JSON prod)
│   │   ├── email.js           # SMTP-e-post: verifiering & lösenordsåterställning
│   │   └── socket-rate-limit.js # In-memory rate limiter för Socket.IO-events
│   └── webrtc/
│       └── signaling.js       # WebRTC-signaling (offer/answer/ICE) via Socket.IO
│
├── public_html/               # Frontend (vanilla JS, HTML, CSS)
│   ├── index.html             # Lobby / landing page
│   ├── game.html              # Spelbräde
│   ├── leaderboard.html       # Topplista (standalone)
│   ├── verify-email.html      # Landningssida för e-postverifiering
│   ├── reset-password.html    # Formulär för lösenordsåterställning
│   ├── admin/                 # Admin-panel för temahantering
│   │   ├── index.html         # Huvudpanel (legacy suit/rank-designer)
│   │   ├── pairs.html         # Primär par-baserad temaeditor
│   │   ├── admin.js
│   │   ├── pairs.js
│   │   ├── admin.css
│   │   ├── FileSaver.min.js
│   │   └── jszip.min.js
│   ├── css/
│   │   ├── main.css           # Huvudstyling, design-system
│   │   ├── game.css           # Spelbräde, kort, timer
│   │   ├── animations.css     # Keyframes, partiklar, utility-klasser
│   │   ├── voice-chat.css     # Röstchatt-UI
│   │   ├── video-chat.css     # Videochatt-UI
│   │   └── pull-to-refresh.css # Pull-to-refresh-indikator
│   ├── js/
│   │   ├── app.js             # Lobby: auth, rum-lista, AI-setup
│   │   ├── game.js            # Spelklient: rendering, interaktion
│   │   ├── socket-client.js   # Socket.IO-wrapper med reconnect
│   │   ├── audio.js           # Web Audio API (syntetiska ljudeffekter)
│   │   ├── animations.js      # Partikeleffekter, kortanimationer
│   │   ├── leaderboard.js     # Topplista-hantering
│   │   ├── pull-to-refresh.js # Mobile pull-to-refresh-polyfill
│   │   ├── voice-chat.js      # WebRTC-röstklient (basklass)
│   │   ├── voice-ui.js        # Röstchatt-UI-kontroller
│   │   ├── video-chat.js      # WebRTC-videoklient (extends voice)
│   │   ├── video-ui.js        # Videochatt-UI-kontroller (extends voice)
│   │   ├── socket.io.min.js   # Socket.IO-klientbibliotek (vendored)
│   │   └── socket.io.min.js.map
│   └── assets/
│       ├── cards/             # Kortleksbilder per tema-kategori och färg
│       │   ├── vegetable/     # Grönsakstema
│       │   │   ├── aubergine/ → Hearts
│       │   │   ├── radish/    → Diamonds
│       │   │   ├── pepper/    → Clubs
│       │   │   └── potato/    → Spades
│       │   ├── frukt/         # Frukt-tema
│       │   └── saker/         # Sak-tema (t.ex. verktyg)
│       └── images/            # Avatarer, AI-porträtt, bakgrund
│
├── tests/                     # Jest-tester (backend-enhetstester, inga E2E-tester)
│   ├── game/
│   │   ├── GameEngine.test.js
│   │   ├── CardDeck.test.js
│   │   ├── AIPlayer.test.js
│   │   ├── RoomManager.test.js
│   │   └── test-theme-helper.js
│   ├── models/
│   │   ├── Friendship.test.js
│   │   └── User.test.js
│   ├── utils/
│   │   ├── elo.test.js
│   │   └── socket-rate-limit.test.js
│   ├── global-setup.js
│   └── setup.js
│
├── scripts/
│   ├── generate-example-theme.py
│   ├── seed-example-theme.js
│   └── update-user-avatars.js
├── database/
│   ├── game.db                # SQLite-fil (skapas vid init-db, gitignored)
│   └── test-game.db           # SQLite-fil för tester
├── .github/workflows/ci.yml   # GitHub Actions: lint + format-check + test
├── package.json               # NPM-scripts och beroenden (v2.0.0)
├── jest.config.js             # Jest-konfiguration
├── eslint.config.js           # ESLint flat config (CommonJS, browser+node+jest globals)
├── .prettierrc                # Prettier-konfig
├── .env / .env.example        # Miljövariabler
├── generate-avatars.py        # Python-skript för att generera spelar-avatarer
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

# Initiera databas (laddar server/config/database.js som side-effect)
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

**Noteringar:**
- `npm run init-db` initierar tabeller genom att ladda `database.js` som side-effect (skapar tabeller vid första anrop).
- `npm test` inkluderar redan `--forceExit`; CI-kommandot `npm test -- --forceExit` dubblerar därför flaggan (ofarligt).
- Tester tvingar alltid SQLite via `tests/global-setup.js` och `tests/setup.js` (`DB_PATH=./database/test-game.db`).
- CI kör Node.js 20 och använder `npm ci` för rena installationer.

---

## 5. Kodstil och konventioner

### Allmänt
- **Modulsystem:** CommonJS (`require` / `module.exports`)
- **ES-version:** `ecmaVersion: 'latest'` (ESLint)
- **Indentering:** 4 mellanslag (Prettier)
- **Semikolon:** Ja
- **Citattecken:** Enkla (`'string'`)
- **Radbredd:** 120 tecken
- **Pilfunktioner:** Undvik parenteser vid enkel parameter: `x => x + 1` (Prettier: `arrowParens: avoid`)
- **Trailing commas:** Nej (`trailingComma: none`)
- **Bracket spacing:** Ja (`{ foo: bar }`)

### ESLint-regler (se `eslint.config.js`)
- `no-unused-vars`: warn (args som börjar med `_` ignoreras)
- `no-console`: off (tillåtet i detta projekt)
- `no-debugger`: warn
- `eqeqeq`: error (alltid `===` / `!==`)
- `curly`: error (alltid måsvingar, även för enraders block)
- `no-throw-literal`: error
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
- **Global setup:** `tests/global-setup.js` sätter SQLite-testdatabasen före alla tester.
- **Setup files:** `tests/setup.js` samma SQLite-override plus rensning av `require.cache` för `database.js`.
- **Coverage:** Samlas från `server/**/*.js`, exkluderar `server/server.js` och `server/config/database.js`
- **Coverage-thresholds:** `branches: 25`, `functions: 30`, `lines: 30`, `statements: 30` (se `jest.config.js`).
- **Viktigt:** Jest körs alltid med `--forceExit` eftersom Socket.IO kan hålla event-loopen vid liv.
- **CI:** GitHub Actions kör `npm audit --audit-level=moderate` (continue-on-error), `npm run lint`, `npm run format:check`, och `npm test -- --forceExit` vid varje push/PR till `main`.
- **Inga frontend- eller E2E-tester:** Alla befintliga tester är backend-enhetstester.

### Existerande testfiler
| Fil | Antal tester | Innehåll |
|-----|--------------|----------|
| `tests/game/GameEngine.test.js` | 17 | Spelregler, turhantering, utdelning, par, återanslutning, ask/fish/surrender |
| `tests/game/CardDeck.test.js` | 6 | Kortleksinitiering (52 kort), blanda, dra, `isEmpty`, `remaining` |
| `tests/game/RoomManager.test.js` | 19 | Rums-CRUD, join/leave (force/soft), kick, **ban**, reconnect, lösenord, spectator, bannade spelare |
| `tests/game/AIPlayer.test.js` | 9 | AI-initiering, minne, beslutsfattning, pruning, konsekutiva frågor, svårighetsgrader |
| `tests/models/Friendship.test.js` | 15 | Vänförfrågningar: skicka, acceptera, avböja, ta bort, lista, kontrollera om vänner |
| `tests/models/User.test.js` | 9 | User-modell: skapa, hitta, validera, tokens, verifiering, lösenordsåterställning |
| `tests/utils/elo.test.js` | 4 | ELO-beräkning: vinnare/förlorare, upset-win, 3+ spelare, konstant summa |
| `tests/utils/socket-rate-limit.test.js` | 9 | Rate limiting: gränser, återställning, separata buckets, shorthand-anrop |

**Totalt:** 88 tester fördelade på 8 testfiler.

---

## 7. Säkerhetsöverväganden

### Autentisering
- JWT med 7 dagars giltighet (`expiresIn: '7d'`).
- `JWT_SECRET` **måste** vara satt i produktion (`NODE_ENV=production`). Modulen `server/auth/auth.js` kastar ett fel vid import om kravet inte är uppfyllt, vilket stoppar serveruppstarten. Fallback i kod (`'default-secret-change-me'`) gäller endast för utveckling.
- Token skickas i `Authorization: Bearer <token>`-header för REST, och i `socket.handshake.auth.token` för Socket.IO.
- Auth-middleware sätter `req.user` / `socket.user` till `null` vid saknad/ogiltig token (aldrig hårda fel).
- Middleware läser även token från `req.query.token` som fallback. Observera att `req.cookies?.token` finns i koden men är ej funktionellt eftersom `cookie-parser` inte är installerat.
- Token-payload: `{ userId, username, displayName, isAdmin }`.
- `req.user` / `socket.user` innehåller: `{ id, username, displayName, avatarUrl, elo, isAdmin }`.

### Admin-rättigheter
- Admin-API:t (`/api/admin/*`) är **inte** öppet för alla. Det är skyddat av `requireAdmin`-middleware i `server/routes/admin.js` som kontrollerar `req.user.isAdmin`.
- En användare blir admin genom att `is_admin = 1` sätts i databasen (finns ingen registreringsendpoint för detta).

### Databas
- SQL-injektionsskydd: alla queries använder parametriserade uttryck (`?` / `$1`).
- Lösenord hashade med bcrypt (salt rounds: 10).

### Input-sanering
- All användarchatt saneras via `escapeHtml()` innan broadcast.
- `GameEngine.filterChat()` censurerar dessutom svordomar (`fan`, `jävla`, `helvete`, `skit`).
- Helmet CSP är aktiverat. Justera `contentSecurityPolicy` i `server/server.js` om nya externa resurser läggs till. Nuvarande policy tillåter bland annat `fonts.googleapis.com`, `fonts.gstatic.com`, `ws:`, `wss:` och `blob:`.

### Rate limiting
- `/api/auth/*`: 10 förfrågningar / 15 minuter
- Läs-endpoints (`/api/rooms`, `/api/users/online`, `/api/stats/total-games`, `/api/users/leaderboard`): 120 / minut
- Övriga API: 600 / 15 minuter
- Socket.IO-events: per-event-begränsningar via `server/utils/socket-rate-limit.js`:
  - `create_room`, `start_game`, `surrender`, `dev_ai_vs_ai`: 5 / minut
  - `join_room`, `add_ai`, `remove_ai`, `kick_player`, `ban_player`, `update_settings`, `reconnect_attempt`, `leave_room`: 10 / minut
  - `chat_message`, `toggle_ready`: 30 / minut
  - `ask_cards`, `respond_to_ask`: 60 / minut
  - WebRTC (`voice_join`, `voice_leave`, `webrtc_offer`, `webrtc_answer`): 10–60 / minut
  - `webrtc_ice_candidate`: 120 / minut (ICE-kandidater kan komma i snabb följd)
  - Vid överskridande skickas `error`-event med meddelandet `"För många förfrågningar. Vänta en stund."`

### Body size limits
- `express.json({ limit: '50mb' })` är satt i `server/server.js` för att hantera stora base64-uppladdningar av kortleksbilder via admin-API:t.

### Övrigt
- `friendships`-tabellen används av vännerlistan (modell: `server/models/Friendship.js`, routes: `server/routes/friends.js`).
- `banPlayer` finns i `RoomManager` och exponeras via Socket.IO-eventet `ban_player` (wrappad med rate limit). Bannade inloggade spelare spåras även via `userId` så att de inte kan återansluta med ny socket.

---

## 8. Databasarkitektur

Databaslagret (`server/config/database.js`) har en **fallback-kedja**:

1. **PostgreSQL** — om `DATABASE_URL` är satt (Railway-standard). SSL: `rejectUnauthorized: false` i produktion.
2. **MariaDB/MySQL** — om `DB_HOST` etc. är satt
3. **SQLite3** — fallback för utveckling (`DB_PATH=./database/game.db`), såvida inte `DB_FALLBACK=false`

### Viktiga miljövariabler
- `DATABASE_URL` — PostgreSQL-anslutningssträng
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — MariaDB
- `DB_PATH` — SQLite-sökväg
- `DB_FALLBACK=false` — inaktiverar SQLite-fallback och tvingar fram MariaDB
- `RATE_LIMIT_WINDOW` / `RATE_LIMIT_MAX` — valfria rate-limit-överskridningar (från `.env.example`: 900000 ms / 100)
- `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` — valfria anpassade TURN-servrar

### Tabeller
- `users` — användarkonton, ELO, statistik, `email_verified`, `is_admin`
- `user_tokens` — engångstokens för e-postverifiering (`email_verify`) och lösenordsåterställning (`password_reset`)
- `games` — spelmetadata (vinnare, duration, antal turer)
- `game_participants` — deltagare per spel med slutlig rank och ELO-förändring
- `game_events` — händelselogg (frågor, fiskningar, par). **Observera:** tabellen finns och `Game.logEvent()` är definierat, men det anropas för närvarande inte från spelmotorn. Händelser lagras endast i minnet (`this.gameEvents`) och i JSON-snapshots.
- `friendships` — vänförfrågningar (status: `pending`/`accepted`); används av vännerlista-API:t
- `achievements` — upplåsta achievements per användare
- `game_snapshots` — JSON-snapshots av spelstatus för crash-recovery
- `themes` — metadata för kortleksteman (`folder_name`, `display_name`, `description`, `is_active`)
- `theme_pairs` — par per tema (`pair_id`, `name`, `description`, `sort_order`, `image_path`, `image_path_b`)
- `theme_files` — base64-kodade kortleksbilder för persistens på ephemeral filesystem

### Index
Följande index skapas vid initiering av **PostgreSQL och MariaDB**:
- `idx_users_elo` (users.elo_rating DESC)
- `idx_users_online` (users.is_online)
- `idx_achievements_user` (achievements.user_id)
- `idx_games_created` (games.created_at DESC)
- `idx_game_participants_user` (game_participants.user_id)
- `idx_game_events_game` (game_events.game_id)
- `idx_theme_pairs_theme` (theme_pairs.theme_id)

**Observera:** SQLite-fallback initierar **inte** dessa index.

### Snapshots
- `game_snapshots` sparas asynkront vid state-ändringar, men är **throttlad** till max en gång per 30 sekunder under pågående spel.
- Snapshots skrivs till databasen men **läses inte automatiskt tillbaka** vid serveromstart eller när ett rum skapas.

### Tema-filsynk (DB ↔ Filsystem)
- `database.js` innehåller `saveThemeFiles(themeName)` och `restoreThemeFiles()` för att hantera kortleksbilder på Railways ephemeral filesystem.
- Vid serverstart återställs temafiler från databasen om de saknas på disk (`server.js` anropar `db.waitForConnection().then(db.restoreThemeFiles)`).
- Nya teman sparas till både filsystem och databas via admin-API:t.

---

## 9. REST API

### Auth (`/api/auth`)
| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| POST | `/register` | Registrera ny användare, skicka verifieringsmail |
| POST | `/login` | Logga in, returnera JWT |
| GET | `/me` | Aktuell användares profil + achievements |
| POST | `/logout` | Sätt offline-status |
| GET | `/verify-email/:token` | Verifiera e-postadress |
| POST | `/resend-verification` | Skicka ny verifieringslänk |
| POST | `/forgot-password` | Skicka lösenordsåterställningsmail |
| POST | `/reset-password` | Uppdatera lösenord med token |

### Users (`/api/users`)
| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/leaderboard` | Topplista (max `?limit=`) |
| GET | `/online` | Online-användare |
| GET | `/search?q=` | Sök användare (minst 2 tecken) |
| GET | `/:id/profile` | Publik profil + achievements + senaste spel |

### Games (`/api/games`)
| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/history` | Aktuell användares spelhistorik |
| GET | `/:id` | Detaljer för ett spel |

### Rooms (`/api/rooms`)
| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/` | Lista publika rum |
| GET | `/:id` | Detaljer för ett rum |

### Stats (`/api/stats`)
| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/total-games` | Totalt antal spelade spel |

### Friends (`/api/friends`) — kräver inloggning
| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/` | Vänner, mottagna/skickade förfrågningar |
| POST | `/request` | Skicka vänförfrågan (`username` eller `userId`) |
| POST | `/accept/:requestId` | Acceptera förfrågan |
| POST | `/reject/:requestId` | Avböj förfrågan |
| DELETE | `/:friendId` | Ta bort vän |

### Admin (`/api/admin`) — kräver **admin-roll** (`req.user.isAdmin`)
| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/themes` | Lista alla kortleksteman |
| GET | `/themes/:theme` | Detaljer för ett tema (suit-status, bildsökvägar) |
| GET | `/themes/:theme/config` | Hämta `config.json` för redigering |
| POST | `/themes` | Skapa nytt tema (base64-bilder + config) |
| PUT | `/themes/:theme` | Uppdatera befintligt tema |
| PUT | `/themes/:theme/pairs` | Uppdatera par-namn/sortering |
| POST | `/themes/:theme/upload` | Ladda upp tema i dataURL-format (bakåtkompatibel) |

### Publika teman (`/api/themes`)
| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/` | Lista aktiva teman med par |
| GET | `/:folder` | Detaljer för ett specifikt tema |

### Övriga publika endpoints
| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/health` | Hälsokontroll (`{ status: 'ok', timestamp }`) |

---

## 10. Socket.IO-arkitektur

- **Namespace:** Default `/`
- **Auth-middleware:** `Auth.socketAuth` körs före `connection`-event
- **Huvudmodul:** `server/sockets/index.js` sätter ihop `handlers.js` och `game-end.js`
- **Server-konfig:** `pingTimeout: 60000`, `pingInterval: 10000`

### Klient → Server (utöver grundläggande rumshantering)
| Event | Beskrivning |
|-------|-------------|
| `create_room` | Skapa nytt rum |
| `join_room` | Gå med i rum (stöd för lösenord och spectator) |
| `reconnect_attempt` | Återanslut efter disconnect med `oldSocketId` + `reconnectToken` |
| `start_game` | Värd startar spelet (stödjer omstart om state är FINISHED) |
| `toggle_ready` | Växla ready-status i vänteläge |
| `ask_cards` | Fråga motståndare om kort (AI = synkront, människa = pending-ask) |
| `respond_to_ask` | Svara på pågående förfrågan (hasCard, pairId) |
| `chat_message` | Skicka chattmeddelande (saneras, achievements möjliga) |
| `add_ai` | Lägg till AI-spelare |
| `remove_ai` | Ta bort AI-spelare |
| `kick_player` | Kicka spelare (värden) |
| `ban_player` | Banna spelare (värden) — kickar och förbjuder återinträde |
| `surrender` | Ge upp — avslutar spelarens deltagande |
| `update_settings` | Uppdatera rum (allowAI, turnTimer, spectatorMode, maxPlayers, deckTheme) |
| `leave_room` | Lämna rum |
| `dev_ai_vs_ai` | Dev-only: starta AI vs AI med åskådare |

### Server → Klient (viktiga events)
| Event | Beskrivning |
|-------|-------------|
| `room_created` / `room_joined` / `spectator_joined` | Bekräftelser |
| `reconnected` | Återanslutning lyckades (roomId, gameState, chatHistory) |
| `reconnect_failed` | Återanslutning misslyckades |
| `game_started` | Spelet har börjat |
| `game_state_update` | Allmän state-uppdatering |
| `turn_result` | Resultat av ett drag (innehåller `gameState`, `aiReasoning` för AI-drag) |
| `ask_pending` | Väntar på svar från motståndare |
| `card_request` | Någon frågar dig om kort |
| `game_over` | Spelet slut (innehåller `winner`, `standings`, `eloChange`) |
| `chat_message` | Nytt chattmeddelande |
| `player_joined` / `player_left` / `player_reconnected` / `player_kicked` / `player_banned` / `player_surrendered` | Spelarhändelser |
| `ai_added` / `ai_removed` | AI-händelser |
| `settings_updated` / `ready_status_update` | Rumstillstånd |
| `achievement_unlocked` | Achievement upplåst |
| `lobby_update` | Uppdatering av publik rumslista |
| `left_room` | Bekräftelse att du lämnat rummet |
| `error` | Felmeddelande |

### Två ask-flöden
- **Direkt `askForCards()`** för AI-motståndare (svarar synkront)
- **`requestAsk()` + `respond_to_ask()`** för mänskliga spelare (asynkront pending-ask-mönster)

### Timeout och återanslutning
- **Tur-timer:** 3 minuter (`TURN_TIMEOUT = 180000` i `constants.js`). Om en spelare inte svarar på en `card_request` i tid auto-löser servern förfrågan som "Fisk!" via `autoResolvePendingAsk()`.
- **AI-drag-fördröjning:** 1500 ms för normala AI-drag; 2000 ms för spelets första AI-drag. `AIPlayer.js` internt använder 1000–3000 ms för sitt beslutsfattande.
- **Disconnect-grace:** Vid `disconnect` väntar servern **60 sekunder** innan `forceRemove` körs, vilket ger utrymme för återanslutning.
- **Rumsrensning:** Om inga mänskliga spelare återstår eller spelet är avslutat schemaläggs rummet för borttagning efter **5 minuter**.
- **Reconnection:** Klienten sparar `previousSocketId` och `reconnectToken` i `localStorage`; vid återanslutning skickas `reconnect_attempt`.
- **Tom hand-hantering:** `ensureCurrentPlayerHasCards()` drar automatiskt 1 kort om den aktiva spelaren har 0 kort och leken inte är tom. `nextPlayer()` hoppar över spelare med tom hand om leken är slut.

### Broadcast-helper
Inuti `createSocketHandlers` finns en closure `broadcastToRoom(game, event, basePayload, includeGameState = false)` som fångar `io` från det yttre scopet. Den skickar individuell `gameState` per spelare via `game.getPublicState()` och spectator-state via `game.getSpectatorState()`. Undvik att manuellt loopa över `game.players` och `game.spectators` — detta mönster upprepades på 5+ ställen och är nu centraliserat.

---

## 11. WebRTC-signaleringsarkitektur

Fil: `server/webrtc/signaling.js`

Klassen `WebRTCSignaling` hanterar P2P-röstchatt via Socket.IO:
- `voice_join` / `voice_leave` — anslut/lämna röstchatt i ett rum
- `webrtc_offer` / `webrtc_answer` / `webrtc_ice_candidate` — standard WebRTC-signaleringsflöde
- `voice_peer_joined` / `voice_peer_left` / `voice_peers_list` — peer-hantering

ICE-servrar:
- **Google STUN:** `stun.l.google.com:19302`, `stun1.l.google.com:19302`
- **Open Relay TURN (fallback):** `relay.metered.ca:80` och `:443`, credentials `openrelayproject`
- **Anpassad TURN** via miljövariabler: `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`

**Notering:** `getIceServers()` finns på serversidan men är **inte** exponerad via någon HTTP-route. Klienten (`public_html/js/voice-chat.js` och `video-chat.js`) har samma ICE-konfiguration hårdkodad.

---

## 12. Kortleks-teman och tillgångar

Spelet använder en **par-baserad kortlek**. Varje tema består av 25–26 par (50–52 kort). Ett par är två kort med samma `pairId`. Som standard har båda korten samma bild, men admin-panelen stöder även **olika bilder** på de två korten i paret.

### Databasmodell

- `themes` — metadata för varje tema (`folder_name`, `display_name`, `description`, `is_active`).
- `theme_pairs` — varje pars `pair_id`, `name`, `description`, `sort_order`, `image_path` (kort A) och `image_path_b` (valfritt, kort B).
- `theme_files` — base64-kodade bilder för persistens på ephemeral filesystem.

### Filsystem

Bilderna ligger under `public_html/assets/cards/{tema}/{pairId}.png` (t.ex. `frukt/pair-1.png`). Om de två korten i paret har olika bilder sparas den andra som `{tema}/{pairId}-b.png` (t.ex. `frukt/pair-1-b.png`). Baksidan sparas som `{tema}/back.png`.

Vid serverstart seedas `themes`/`theme_pairs` från befintliga filsystemstemat via `Theme.seedFromFilesystem()`. Gamla teman med suit/rank-struktur (`{tema}/{suit}/{rank}.png`) migreras till par baserat på valörer.

### Admin-API

- `GET /api/themes` — publik lista över teman och par.
- `GET /api/admin/themes` — admin-lista (kräver admin).
- `GET /api/admin/themes/:theme` — tema med par (kräver admin).
- `GET /api/admin/themes/:theme/config` — hämta `config.json` (kräver admin).
- `PUT /api/admin/themes/:theme/pairs` — uppdatera par-namn/sortering (kräver admin).
- `POST /api/admin/themes/:theme/upload` — ladda upp par-bilder (kräver admin).
- `POST /api/admin/themes`, `PUT /api/admin/themes/:theme` — skapa/uppdatera tema med par (kräver admin).

### Admin-panel

- `public_html/admin/pairs.html` + `pairs.js` — **primär editor** för att skapa nya par-baserade teman med 26 par, anpassade `pairId`, namn, beskrivning och en eller två bilder per par. Innehåller AI-generering via Pollinations.ai baserat på beskrivning + valda färger.
- `public_html/admin/index.html` — huvudpanel med länk till par-hantering (klassisk suit/rank-designer finns kvar för legacy-teman).

---

## 13. Driftsättning

### Railway (primär metod)
1. Repo på GitHub, kopplat till Railway
2. `Procfile` anger startkommando: `web: node server/server.js`
3. Miljövariabler i Railway:
   - `JWT_SECRET` — lång slumpmässig sträng (minst 64 tecken rekommenderas)
   - `NODE_ENV=production`
   - `PORT=3000`
   - `DATABASE_URL` — för PostgreSQL (rekommenderat för persistent data)
   - `RATE_LIMIT_WINDOW` / `RATE_LIMIT_MAX` — valfria rate-limit-överskridningar
   - `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` — valfria anpassade TURN-servrar
   - `DB_FALLBACK=false` — rekommenderas i prod för att undvika SQLite
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — för e-postutskick
   - `FRONTEND_URL` eller `BASE_URL` — för länkar i e-post. Railway sätter även `RAILWAY_PUBLIC_DOMAIN` automatiskt.

**Viktigt:** På Railways gratisplan är filsystemet "ephemeral". Använd PostgreSQL (`DATABASE_URL`) för att inte förlora användardata vid omstart. Servern kör `app.set('trust proxy', 1)` för korrekt rate-limiting bakom Railways proxy. Temafiler sparas även till databasen (`theme_files`-tabellen) och återställs vid uppstart.

**Se även:** `DEPLOY_RAILWAY.md` för en mer detaljerad steg-för-steg-guide inklusive SMTP-konfiguration.

### Lokalt
```bash
cp .env.example .env
npm install
npm run init-db
npm run dev
# Öppna http://localhost:3000
```

---

## 14. Utvecklingskonventioner

### Innan du commitar
1. Kör `npm run lint` — fixa fel
2. Kör `npm run format` — formatera kod
3. Kör `npm test` — se till att alla tester går igenom
4. Kontrollera att `npm run format:check` är grön

### Att lägga till en ny API-endpoint
1. Skapa route-fil under `server/routes/` (eller utöka befintlig)
2. Registrera i `server/server.js` med `app.use('/api/xxx', ...)`
3. Auth-middleware körs globalt och sätter `req.user` till `null` för gäster
4. För admin-endpoints, använd `requireAdmin`-mönstret från `server/routes/admin.js`

### Att lägga till ett Socket.IO-event
1. Lägg till handler i `server/sockets/handlers.js`
2. Wrappa handler med `rateLimit(eventName, max, windowMs, handler)` för att aktivera rate limiting. Exempel:
   ```js
   socket.on(
       'my_event',
       rateLimit('my_event', 10, 60000, data => {
           // ...handler-logik
       })
   );
   ```
3. Vid speländringar: använd `roomManager.getRoomBySocket(socket.id)` för att hämta aktuellt rum
4. Använd `broadcastToRoom(game, event, payload, true)` för rum-broadcast med individuell gameState

### Att broadcasta till rum med individuell gameState
Använd den interna helper-funktionen `broadcastToRoom(game, event, basePayload, includeGameState = false)` inuti `createSocketHandlers`. Den fångar `io` från det yttre scopet och skickar individuell `gameState` per spelare via `game.getPublicState()` och spectator-state via `game.getSpectatorState()`. Undvik att manuellt loopa över `game.players` och `game.spectators` — detta mönster upprepades på 5+ ställen och är nu centraliserat.

### Att ändra spelregler (ask/fisk)
Spelmotorn använder två privata metoder för gemensam logik:
- `_processAskSuccess(asker, target, pairId, matchingCards)` — hanterar kortöverföring, par-bildning, achievements och gameOver.
- `_processAskFish(asker, target, pairId)` — hanterar fiskning, kortdragning, lucky fish och tur-övergång.

Både `askForCards()` (synkront, AI-motståndare) och `respondToAsk()` (asynkront, mänskliga spelare) anropar dessa. Lägg inte till duplicerad logik i någon av dem — extraktera istället till en ny privat metod.

### Frontend — event delegation
När du hanterar klick på dynamiskt skapade element (t.ex. kort i handen), använd **event delegation** på förälder-containern istället för individuella `addEventListener` på varje element. Detta förhindrar minnesläckor när element återskapas via `innerHTML`.

Exempel:
```js
// Bra — en enda listener på containern
handContainer.addEventListener('click', (e) => {
    const cardEl = e.target.closest('.card');
    if (!cardEl) return;
    // ...hantera klick
});

// Undvik — skapar duplicerade listeners vid varje render
container.querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', ...);
});
```

### Frontend — diffing och mobil-UI
- `game.js` använder DOM-diffing i `renderOpponents()` för att undvika att förstöra och återskapa motståndar-kort vid varje state-uppdatering.
- Mobil-UI har en dedikerad botten-sheet (`#mobile-sheet`), flytande action-knapp (`#mobile-fab`) och separata start-/redo-containrar. Vid ändringar, testa alltid både desktop- och mobil-vy.
- Lobby (`app.js`) pollar publik rumslista var 10:e sekund (`setInterval`, 10000 ms).

### CSS — tillgänglighet
- Lägg alltid till `@media (prefers-reduced-motion: reduce)` när du skapar nya animationer eller transitions. Använd den generiska regeln i `animations.css` som mall, eller lägg till specifika overrides per komponent.
- Använd aldrig `user-scalable=no` eller `maximum-scale=1.0` i viewport-meta — det bryter WCAG 1.4.4.

### HTML
- Använd semantisk HTML där det är möjligt.
- Se till att alla interaktiva element har tillräcklig kontrast och tydliga fokus-stilar.
