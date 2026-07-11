<!-- AGENTS.md — Finns i Sjön PRO -->

> **Målgrupp:** AI-kodningsagenter som arbetar med detta projekt.  
> **Språk:** Projektets källkod, kommentarer, loggmeddelanden och API-felsvar är primärt på **svenska**. Denna fil skrivs på svenska, med tekniska termer på engelska där det är naturligt.

---

## 1. Projektöversikt

**Finns i Sjön PRO** (v2.0.0, npm-paket `finns-i-sjon-pro`) är ett realtidsmultiplayer-kortspel för webben, baserat på det svenska spelet ”Finns i sjön” / Go Fish. Projektet marknadsförs även under namnet **FISK**.

- **Huvudentry:** `server/server.js`
- **Port:** `process.env.PORT || 3000`
- **Statiska filer:** `public_html/` (observera att den faktiska mappen heter `public_html/`, inte `public/` som `README.md` ibland anger)
- **Modulsystem:** CommonJS (`require` / `module.exports`)

### Kärnfunktioner

- Rumsbaserade spelbord med publika/privata rum och lösenord
- AI-motståndare på 4 svårighetsgrader
- Användarkonton med JWT-autentisering, ELO-rankning, e-postverifiering och lösenordsåterställning
- Spectator-läge (åskådare)
- WebRTC-baserad röst- och videochatt (P2P)
- Achievements, spelhistorik och topplista
- Vännerlista med förfrågningar och inbjudningar till rum
- Persistenta rum som sparas mellan sessioner
- Admin-API och admin-panel för hantering av kortleksteman

---

## 2. Teknikstack

| Lager | Teknik | Version (ur `package.json`) |
|-------|--------|-----------------------------|
| Runtime | Node.js | 18+ lokalt, Node 20 i CI |
| Backend | Express | `^4.18.2` |
| WebSocket | Socket.IO | `^4.6.1` |
| Databas | SQLite3 (dev), MariaDB/MySQL, PostgreSQL | `sqlite3 ^6.0.1`, `mysql2 ^3.22.3`, `pg ^8.20.0` |
| Auth | jsonwebtoken, bcryptjs | `^9.0.2`, `^2.4.3` |
| E-post | Nodemailer | `^8.0.10` |
| Säkerhet | Helmet, express-rate-limit, CORS | `^7.1.0`, `^7.1.0`, `^2.8.5` |
| Test | Jest | `^30.4.2` |
| Lint/Format | ESLint (flat config), Prettier | `^10.3.0`, `^3.8.3` |
| Övrigt | dotenv, uuid | `^16.3.1`, `^9.0.0` |

### Viktiga konfigurationsfiler

- `package.json` — beroenden och npm-scripts
- `jest.config.js` — testmiljö, setup-filer och coverage-thresholds
- `eslint.config.js` — ESLint flat config med projektspecifika regler
- `.prettierrc` — Prettier-konfiguration
- `.env` / `.env.example` — miljövariabler
- `Procfile` — Railway-startkommando: `web: node server/server.js`
- `.github/workflows/ci.yml` — GitHub Actions CI-pipeline

**Notering:** `package.json` har ingen `engines`-sektion. CI använder explicit Node.js 20.

---

## 3. Projektstruktur

```
finns-i-sjon-pro/
├── server/                         # Backend (CommonJS)
│   ├── server.js                   # Huvudserver: Express + Socket.IO + routes
│   ├── config/
│   │   └── database.js             # Databasabstraktion: PostgreSQL → MariaDB → SQLite
│   ├── auth/
│   │   └── auth.js                 # JWT-generering, verifiering, middleware, socketAuth
│   ├── models/
│   │   ├── User.js                 # CRUD för användare, statistik, achievements, tokens
│   │   ├── Game.js                 # Spelhistorik, event-loggning (inaktiv persistens)
│   │   ├── Friendship.js           # Vänförfrågningar och vännerlista
│   │   ├── Theme.js                # Kortleksteman och par
│   │   ├── PersistentRoom.js       # Sparade/persistenta rum
│   │   └── RoomInvite.js           # Inbjudningar till rum för offline-vänner
│   ├── routes/
│   │   ├── auth.js                 # Auth-endpoints
│   │   ├── users.js                # Leaderboard, online, sök, profiler
│   │   ├── games.js                # Spelhistorik
│   │   ├── rooms.js                # Factory: createRoomRouter(roomManager)
│   │   ├── stats.js                # Totalt antal spel
│   │   ├── admin.js                # Admin-API för kortleksteman
│   │   ├── themes.js               # Publika tema-endpoints
│   │   ├── friends.js              # Vännerlista-API
│   │   └── persistent-rooms.js     # Persistenta rum (sparade bord)
│   ├── game/
│   │   ├── GameEngine.js           # Spelregler, turhantering, par, AI-anslutning
│   │   ├── RoomManager.js          # Rums-CRUD, join/leave/kick/ban/reconnect
│   │   ├── CardDeck.js             # Kortlekslogik (skapa, blanda, dra)
│   │   ├── AIPlayer.js             # AI med 4 svårighetsgrader
│   │   └── utils.js                # findPairs, extractPairs, getPlayerAvatar m.m.
│   ├── sockets/
│   │   ├── index.js                # Registrerar auth + handlers + game-end
│   │   ├── handlers.js             # Huvudsakliga Socket.IO-event-handlers
│   │   └── game-end.js             # Hanterar game_over, ELO, persistens
│   ├── utils/
│   │   ├── constants.js            # Spelkonstanter, achievements, tillstånd
│   │   ├── elo.js                  # ELO-beräkningsalgoritm
│   │   ├── sanitize.js             # XSS-sanering (escapeHtml)
│   │   ├── logger.js               # Loggningshjälpare
│   │   ├── email.js                # SMTP-e-post
│   │   └── socket-rate-limit.js    # In-memory rate limiter för Socket.IO-events
│   └── webrtc/
│       └── signaling.js            # WebRTC-signaling via Socket.IO
│
├── public_html/                    # Frontend (vanilla JS, HTML, CSS)
│   ├── index.html                  # Lobby / landing page
│   ├── game.html                   # Spelbräde
│   ├── leaderboard.html            # Topplista
│   ├── verify-email.html           # Landningssida för e-postverifiering
│   ├── reset-password.html         # Formulär för lösenordsåterställning
│   ├── admin/                      # Admin-panel för temahantering
│   │   ├── index.html              # Huvudpanel (legacy suit/rank-designer)
│   │   ├── pairs.html              # Primär par-baserad temaeditor
│   │   ├── admin.js
│   │   ├── pairs.js
│   │   ├── admin.css
│   │   ├── FileSaver.min.js
│   │   └── jszip.min.js
│   ├── css/
│   │   ├── main.css
│   │   ├── game.css
│   │   ├── animations.css
│   │   ├── voice-chat.css
│   │   ├── video-chat.css
│   │   └── pull-to-refresh.css
│   ├── js/
│   │   ├── app.js                  # Lobby: auth, rum-lista, AI-setup, vänner
│   │   ├── game.js                 # Spelklient: rendering, interaktion
│   │   ├── socket-client.js        # Socket.IO-wrapper med reconnect
│   │   ├── audio.js                # Web Audio API-ljud
│   │   ├── animations.js           # Partikeleffekter, kortanimationer
│   │   ├── leaderboard.js
│   │   ├── pull-to-refresh.js
│   │   ├── voice-chat.js           # WebRTC-röstklient (basklass)
│   │   ├── voice-ui.js
│   │   ├── video-chat.js           # WebRTC-videoklient (ärver voice)
│   │   ├── video-ui.js
│   │   ├── socket.io.min.js        # Vendored Socket.IO-klient
│   │   └── socket.io.min.js.map
│   └── assets/
│       ├── cards/                  # Kortleksbilder per tema
│       │   ├── vegetable/
│       │   ├── frukt/
│       │   ├── saker/
│       │   └── exempeltema/
│       └── images/                 # Avatarer, AI-porträtt, bakgrund
│
├── tests/                          # Jest-enhetstester (backend, inga E2E-tester)
│   ├── game/
│   │   ├── GameEngine.test.js
│   │   ├── CardDeck.test.js
│   │   ├── AIPlayer.test.js
│   │   ├── RoomManager.test.js
│   │   └── test-theme-helper.js
│   ├── models/
│   │   ├── Friendship.test.js
│   │   ├── User.test.js
│   │   ├── PersistentRoom.test.js
│   │   └── RoomInvite.test.js
│   ├── utils/
│   │   ├── elo.test.js
│   │   └── socket-rate-limit.test.js
│   ├── global-setup.js
│   └── setup.js
│
├── scripts/
│   ├── generate-example-theme.py   # Genererar exempeltema med 26 par (kräver PIL)
│   ├── seed-example-theme.js       # Seedar exempeltemat till databasen
│   └── update-user-avatars.js      # Migrerar användare till unika avatarer
│
├── database/
│   ├── game.db                     # SQLite-fil (skapas vid init-db, gitignored)
│   └── test-game.db                # SQLite-fil för tester
│
├── .github/workflows/ci.yml        # GitHub Actions: lint + format-check + test
├── package.json                    # NPM-scripts och beroenden (v2.0.0)
├── jest.config.js                  # Jest-konfiguration
├── eslint.config.js                # ESLint flat config
├── .prettierrc                     # Prettier-konfig
├── .env / .env.example             # Miljövariabler
├── generate-avatars.py             # Python-skript för att generera avatarer
└── Procfile                        # Railway: "web: node server/server.js"
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
npm run format        # Prettier --write på server/**/*.js och tests/**/*.js
npm run format:check  # Prettier --check (används i CI)
```

### Viktiga noteringar

- `npm run init-db` initierar tabeller genom att ladda `server/config/database.js` som side-effect. Inga separata migrations-skript körs.
- `npm test` inkluderar redan `--forceExit`; CI-kommandot `npm test -- --forceExit` dubblerar därför flaggan (ofarligt).
- Tester tvingar alltid SQLite via `tests/global-setup.js` och `tests/setup.js` (`DB_PATH=./database/test-game.db`).
- `tests/setup.js` rensar även `require.cache` för `server/config/database.js` så att testmiljön laddas på nytt.
- CI kör Node.js 20 och använder `npm ci` för rena installationer.
- Formatering gäller endast `server/**/*.js` och `tests/**/*.js`; frontend-filer i `public_html/` formateras inte automatiskt.

---

## 5. Kodstil och konventioner

### Allmänt

- **Modulsystem:** CommonJS (`require` / `module.exports`).
- **ES-version:** `ecmaVersion: 'latest'` (se `eslint.config.js`).
- **Indentering:** 4 mellanslag.
- **Semikolon:** Ja.
- **Citattecken:** Enkla (`'string'`).
- **Radbredd:** 120 tecken.
- **Pilfunktioner:** Undvik parenteser vid enkel parameter (`x => x + 1`).
- **Trailing commas:** Nej.
- **Bracket spacing:** Ja (`{ foo: bar }`).

### ESLint-regler

Se `eslint.config.js`:

- `no-unused-vars`: `warn` (argument som börjar med `_` ignoreras).
- `no-console`: `off` (tillåtet i detta projekt).
- `no-debugger`: `warn`.
- `eqeqeq`: `error` (alltid `===` / `!==`).
- `curly`: `error` (alltid måsvingar, även för enraders block).
- `no-throw-literal`: `error`.
- `prefer-const`: `warn`.

ESLint ignorerar `node_modules/**`, `public_html/js/socket.io.js` och `coverage/**`.

### Namngivning och språk

- **Kommentarer, loggmeddelanden och API-felsvar:** Skriv på **svenska**. Detta är projektstandard.
- **Variabler:** `camelCase` (`playerName`, `socketId`, `gameState`).
- **Klasser:** `PascalCase` (`GameEngine`, `RoomManager`).
- **Konstanter:** `UPPERCASE_SNAKE_CASE` i `server/utils/constants.js`.

---

## 6. Testning

- **Ramverk:** Jest med Node-miljö (`testEnvironment: 'node'`).
- **Testmönster:** `**/tests/**/*.test.js`.
- **Global setup:** `tests/global-setup.js` sätter SQLite-testdatabasen före alla tester.
- **Setup files:** `tests/setup.js` samma SQLite-override plus rensning av `require.cache`.
- **Coverage:** Samlas från `server/**/*.js`, exkluderar `server/server.js` och `server/config/database.js`.
- **Coverage-thresholds:** `branches: 25`, `functions: 30`, `lines: 30`, `statements: 30`.
- **Viktigt:** Jest körs alltid med `--forceExit` eftersom Socket.IO kan hålla event-loopen vid liv.
- **CI:** GitHub Actions kör `npm audit --audit-level=moderate` (continue-on-error), `npm run lint`, `npm run format:check` och `npm test -- --forceExit` vid varje push/PR till `main`.
- **Inga frontend- eller E2E-tester:** Alla befintliga tester är backend-enhetstester.

### Existerande testfiler

| Fil | Antal tester | Innehåll |
|-----|--------------|----------|
| `tests/game/GameEngine.test.js` | 21 | Spelregler, turhantering, utdelning, par, återanslutning, ask/fisk/surrender, pending-ask |
| `tests/game/CardDeck.test.js` | 6 | Kortleksinitiering (52 kort), blanda, dra, `isEmpty`, `remaining` |
| `tests/game/RoomManager.test.js` | 19 | Rums-CRUD, join/leave, kick, ban, reconnect, lösenord, spectator, persistenta rum |
| `tests/game/AIPlayer.test.js` | 9 | AI-initiering, minne, beslutsfattning, svårighetsgrader |
| `tests/models/Friendship.test.js` | 15 | Vänförfrågningar: skicka, acceptera, avböja, ta bort, lista |
| `tests/models/User.test.js` | 9 | User-modell: tokens, verifiering, lösenordsåterställning |
| `tests/models/PersistentRoom.test.js` | 5 | Persistenta rum: skapa, hämta, uppdatera, ta bort, ägarskap |
| `tests/models/RoomInvite.test.js` | 4 | Ruminbjudningar: skapa, dublettskydd, pending-lista, markera delivered |
| `tests/utils/elo.test.js` | 4 | ELO-beräkning: vinnare/förlorare, upset-win, 3+ spelare |
| `tests/utils/socket-rate-limit.test.js` | 9 | Rate limiting: gränser, återställning, separata buckets, shorthand |

**Totalt:** 107 tester fördelade på 10 testfiler.

---

## 7. Säkerhetsöverväganden

### Autentisering

- JWT med 7 dagars giltighet (`expiresIn: '7d'`) i `server/auth/auth.js`.
- `JWT_SECRET` **måste** vara satt i produktion (`NODE_ENV=production`). `server/auth/auth.js` kastar ett fel vid import om kravet inte är uppfyllt, vilket stoppar serveruppstarten. Fallback-värdet `'default-secret-change-me'` gäller endast för utveckling.
- Token skickas i `Authorization: Bearer <token>`-header för REST, och i `socket.handshake.auth.token` (eller `socket.handshake.query.token`) för Socket.IO.
- Auth-middleware sätter `req.user` / `socket.user` till `null` vid saknad/ogiltig token (aldrig hårda fel).
- Middleware läser även token från `req.cookies?.token`, men `cookie-parser` är inte installerat, så det är i praktiken inaktivt.
- Token-payload: `{ userId, username, displayName, isAdmin }`.
- `req.user` / `socket.user` innehåller: `{ id, username, displayName, avatarUrl, elo, isAdmin }`.

### Admin-rättigheter

- Admin-API:t (`/api/admin/*`) är skyddat av `requireAdmin`-middleware i `server/routes/admin.js` som kontrollerar `req.user.isAdmin`.
- En användare blir admin genom att `is_admin = 1` sätts i databasen (finns ingen registreringsendpoint för detta).

### Databas

- SQL-injektionsskydd: alla queries använder parametriserade uttryck (`?` / `$1`).
- Lösenord hashas med bcrypt (salt rounds: 10) i `server/models/User.js`.

### Input-sanering

- All användarchatt saneras via `escapeHtml()` i `server/utils/sanitize.js` innan broadcast.
- `GameEngine.filterChat()` censurerar dessutom svordomar (`fan`, `jävla`, `helvete`, `skit`).
- Helmet CSP är aktiverat i `server/server.js`. Justera `contentSecurityPolicy` om nya externa resurser läggs till. Nuvarande policy tillåter bland annat `fonts.googleapis.com`, `fonts.gstatic.com`, `ws:`, `wss:`, `blob:` och `data:`.

### Rate limiting

- `/api/auth/*`: 10 förfrågningar / 15 minuter.
- Läs-endpoints (`/api/rooms`, `/api/users/online`, `/api/stats/total-games`, `/api/users/leaderboard`): 120 / minut.
- Övriga API: 600 / 15 minuter.
- Socket.IO-events: per-event-begränsningar via `server/utils/socket-rate-limit.js`:
  - `create_room`, `start_game`, `surrender`, `dev_ai_vs_ai`: 5 / minut
  - `join_room`, `add_ai`, `remove_ai`, `kick_player`, `ban_player`, `update_settings`, `reconnect_attempt`, `leave_room`: 10 / minut
  - `chat_message`, `toggle_ready`: 30 / minut
  - `ask_cards`, `respond_to_ask`: 60 / minut
  - WebRTC: `voice_join`/`voice_leave` 10 / minut, `webrtc_offer`/`webrtc_answer` 60 / minut, `webrtc_ice_candidate` 120 / minut
  - Vid överskridande skickas `error`-event med meddelandet `"För många förfrågningar. Vänta en stund."`

### Body size limits

- `express.json({ limit: '50mb' })` är satt i `server/server.js` för att hantera stora base64-uppladdningar av kortleksbilder via admin-API:t.

### Övrigt

- `friendships`-tabellen används av vännerlistan (modell: `server/models/Friendship.js`, routes: `server/routes/friends.js`).
- `room_invites`-tabellen används för att bjuda in offline-vänner till rum (modell: `server/models/RoomInvite.js`, routes: `server/routes/friends.js`).
- `banPlayer` finns i `RoomManager` och exponeras via Socket.IO-eventet `ban_player` (wrappad med rate limit). Bannade inloggade spelare spåras även via `userId` så att de inte kan återansluta med ny socket.

---

## 8. Databasarkitektur

Databaslagret (`server/config/database.js`) har en **fallback-kedja**:

1. I `NODE_ENV=test` tvingas alltid SQLite oavsett övriga variabler.
2. **PostgreSQL** — om `DATABASE_URL` är satt (Railway-standard). SSL: `rejectUnauthorized: false` i produktion.
3. **MariaDB/MySQL** — om `DB_HOST` etc. är satta.
4. **SQLite3** — fallback för utveckling (`DB_PATH=./database/game.db`), såvida inte `DB_FALLBACK=false`.

I produktion krävs PostgreSQL eller MariaDB om inte `DB_FALLBACK=true` sätts medvetet.

### Viktiga miljövariabler

| Variabel | Syfte |
|----------|-------|
| `PORT` | Serverport (default 3000) |
| `NODE_ENV` | `development` / `production` / `test` |
| `JWT_SECRET` | JWT-signering (krävs i produktion) |
| `DATABASE_URL` | PostgreSQL-anslutningssträng |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MariaDB/MySQL |
| `DB_PATH` | SQLite-sökväg (default `./database/game.db`) |
| `DB_FALLBACK` | `true`/`false` — tillåt SQLite-fallback |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | E-postutskick |
| `FRONTEND_URL` / `BASE_URL` / `RAILWAY_PUBLIC_DOMAIN` | Länkar i e-post |
| `RATE_LIMIT_WINDOW`, `RATE_LIMIT_MAX` | HTTP-rate-limit (default 15 min / 100) |
| `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | Anpassad TURN-server för WebRTC |

### Tabeller

- `users` — användarkonton, ELO, statistik, `email_verified`, `is_admin`
- `user_tokens` — engångstokens för e-postverifiering (`email_verify`) och lösenordsåterställning (`password_reset`)
- `games` — spelmetadata (vinnare, duration, antal turer)
- `game_participants` — deltagare per spel med slutlig rank och ELO-förändring
- `game_events` — händelselogg (frågor, fiskningar, par). **Observera:** tabellen finns och `Game.logEvent()` är definierat, men det anropas för närvarande inte från spelmotorn. Händelser lagras endast i minnet (`this.gameEvents`) och i JSON-snapshots.
- `friendships` — vänförfrågningar (status: `pending`/`accepted`)
- `achievements` — upplåsta achievements per användare
- `game_snapshots` — JSON-snapshots av spelstatus för crash-recovery
- `themes` — metadata för kortleksteman (`folder_name`, `display_name`, `description`, `is_active`)
- `theme_pairs` — par per tema (`pair_id`, `name`, `description`, `sort_order`, `image_path`, `image_path_b`)
- `theme_files` — base64-kodade kortleksbilder för persistens på ephemeral filesystem
- `persistent_rooms` — sparade rum med inställningar (ägare, maxPlayers, allowAI, turnTimer, spectatorMode, deckTheme, isPrivate)
- `room_invites` — inbjudningar till rum för offline-vänner (`room_id`, `friend_user_id`, `delivered`, `created_at`)

### Index

Följande index skapas vid initiering av **PostgreSQL och MariaDB**:

- `idx_users_elo` (`users.elo_rating` DESC)
- `idx_users_online` (`users.is_online`)
- `idx_achievements_user` (`achievements.user_id`)
- `idx_games_created` (`games.created_at` DESC)
- `idx_game_participants_user` (`game_participants.user_id`)
- `idx_game_events_game` (`game_events.game_id`)
- `idx_theme_pairs_theme` (`theme_pairs.theme_id`)
- `idx_persistent_rooms_owner` (`persistent_rooms.owner_user_id`)
- `idx_room_invites_friend` (`room_invites.friend_user_id`, `delivered`)

**SQLite-fallback** initierar `idx_theme_pairs_theme` och `idx_persistent_rooms_owner`; övriga index saknas.

### Query-abstraktion

- Databas-klassen exponerar `query`, `get`, `run`.
- PostgreSQL-konvertering sker internt: `?`-placeholders ersätts med `$1,$2...` via `_pgSql()`.
- `run()` returnerar `{ id, changes }` där `id` är senaste insert-id.

### Snapshots

- `game_snapshots` sparas asynkront vid state-ändringar, men är **throttlad** till max en gång per 30 sekunder under pågående spel.
- Snapshots skrivs till databasen men **läses inte automatiskt tillbaka** vid serveromstart eller när ett rum skapas.

### Tema-filsynk (DB ↔ Filsystem)

- `database.js` innehåller `saveThemeFiles(themeName)` och `restoreThemeFiles()` för att hantera kortleksbilder på Railways ephemeral filesystem.
- Vid serverstart återställs temafiler från databasen om de saknas på disk (`server.js` anropar `db.waitForConnection().then(db.restoreThemeFiles).then(Theme.seedFromFilesystem)`).
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
| GET | `/online` | Online-vänner |
| GET | `/invites` | Väntande ruminbjudningar för aktuell användare |
| POST | `/invites/:inviteId/delivered` | Markera en ruminbjudan som levererad |
| POST | `/request` | Skicka vänförfrågan (`username` eller `userId`) |
| POST | `/accept/:requestId` | Acceptera förfrågan |
| POST | `/reject/:requestId` | Avböj förfrågan |
| DELETE | `/:friendId` | Ta bort vän |

### Persistenta rum (`/api/persistent-rooms`) — kräver inloggning

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/` | Lista inloggad användares sparade rum |
| POST | `/` | Spara/uppdatera ett persistent rum (skapar om det inte finns) |
| DELETE | `/:roomId` | Ta bort ett persistent rum (endast ägare) |

### Admin (`/api/admin`) — kräver **admin-roll** (`req.user.isAdmin`)

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/themes` | Lista alla kortleksteman |
| GET | `/themes/:theme` | Detaljer för ett tema (par, bildsökvägar) |
| GET | `/themes/:theme/config` | Hämta `config.json` för redigering |
| POST | `/themes` | Skapa nytt tema (base64-bilder + config) |
| PUT | `/themes/:theme` | Uppdatera befintligt tema |
| PUT | `/themes/:theme/pairs` | Updatera par-namn/sortering |
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
- **Auth-middleware:** `Auth.socketAuth` körs före `connection`-event.
- **Huvudmodul:** `server/sockets/index.js` sätter ihop `handlers.js` och `game-end.js`.
- **Server-konfig:** `pingTimeout: 60000`, `pingInterval: 10000`. CORS är konfigurerat med `methods: ['GET', 'POST']` och `credentials: true`.

### Klient → Server (utöver grundläggande rumshantering)

| Event | Beskrivning |
|-------|-------------|
| `create_room` | Skapa nytt rum |
| `join_room` | Gå med i rum (stöd för lösenord och spectator) |
| `reconnect_attempt` | Återanslut efter disconnect med `oldSocketId` + `reconnectToken` |
| `start_game` | Värd startar spelet (stödjer omstart om state är `FINISHED`) |
| `toggle_ready` | Växla ready-status i vänteläge |
| `ask_cards` | Fråga motståndare om kort (AI = synkront, människa = pending-ask) |
| `respond_to_ask` | Svara på pågående förfrågan (`hasCard`, `pairId`) |
| `chat_message` | Skicka chattmeddelande (saneras, achievements möjliga) |
| `add_ai` | Lägg till AI-spelare |
| `remove_ai` | Ta bort AI-spelare |
| `kick_player` | Kicka spelare (värden) |
| `ban_player` | Banna spelare (värden) — kickar och förbjuder återinträde |
| `surrender` | Ge upp — avslutar spelarens deltagande |
| `update_settings` | Uppdatera rum (`allowAI`, `turnTimer`, `spectatorMode`, `maxPlayers`, `deckTheme`) |
| `leave_room` | Lämna rum |
| `invite_friend` | Bjud in en vän till aktuellt rum (skapar `room_invites` om offline) |
| `dev_ai_vs_ai` | Dev-only: starta AI vs AI med åskådare |

### Server → Klient (viktiga events)

| Event | Beskrivning |
|-------|-------------|
| `room_created` / `room_joined` / `spectator_joined` | Bekräftelser |
| `reconnected` | Återanslutning lyckades (`roomId`, `gameState`, `chatHistory`) |
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
| `room_invite` | Inbjudan till rum mottagen |
| `invite_sent` | Bekräftelse att inbjudan skickats |
| `left_room` | Bekräftelse att du lämnat rummet |
| `error` | Felmeddelande |

### Två ask-flöden

- **Direkt `askForCards()`** för AI-motståndare (svarar synkront).
- **`requestAsk()` + `respond_to_ask()`** för mänskliga spelare (asynkront pending-ask-mönster).

### Timeout och återanslutning

- **Tur-timer:** 3 minuter (`TURN_TIMEOUT = 180000` i `constants.js`). Om en spelare inte svarar på en `card_request` i tid auto-löser servern förfrågan som "Fisk!" via `autoResolvePendingAsk()`.
- **AI-drag-fördröjning:** 1500 ms för normala AI-drag; 2000 ms för spelets första AI-drag.
- **Disconnect-grace:** Vid `disconnect` väntar servern **60 sekunder** innan `forceRemove` körs, vilket ger utrymme för återanslutning.
- **Rumsrensning:** När `forceRemove` körs schemaläggs rummet för borttagning efter **5 minuter** om inga mänskliga spelare återstår eller spelet är avslutat.
- **Reconnection:** Klienten sparar `previousSocketId` och `reconnectToken` i `localStorage`; vid återanslutning skickas `reconnect_attempt`.
- **Tom hand-hantering:** `ensureCurrentPlayerHasCards()` drar automatiskt 1 kort om den aktiva spelaren har 0 kort och leken inte är tom. `nextPlayer()` hoppar över spelare med tom hand om leken är slut.

### Broadcast-helper

Inuti `createSocketHandlers` finns en closure `broadcastToRoom(game, event, basePayload, includeGameState = false)` som fångar `io` från det yttre scopet. Den skickar individuell `gameState` per spelare via `game.getPublicState()` och spectator-state via `game.getSpectatorState()`. Undvik att manuellt loopa över `game.players` och `game.spectators` — detta mönster upprepades på flera ställen och är nu centraliserat.

---

## 11. WebRTC-signaleringsarkitektur

Fil: `server/webrtc/signaling.js`.

Klassen `WebRTCSignaling` hanterar P2P-röst- och videochatt via Socket.IO:

- `voice_join` / `voice_leave` — anslut/lämna röstchatt i ett rum.
- `webrtc_offer` / `webrtc_answer` / `webrtc_ice_candidate` — standard WebRTC-signaleringsflöde.
- `voice_peer_joined` / `voice_peer_left` / `voice_peers_list` — peer-hantering.

### ICE-servrar

- **Google STUN:** `stun.l.google.com:19302`, `stun1.l.google.com:19302`
- **Open Relay TURN (fallback):** `relay.metered.ca:80` och `:443`, credentials `openrelayproject`
- **Anpassad TURN** via miljövariabler: `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`

**Notering:** `getIceServers()` finns på serversidan men är **inte** exponerad via någon HTTP-route. Klienten (`public_html/js/voice-chat.js` och `video-chat.js`) har motsvarande ICE-konfiguration hårdkodad.

---

## 12. Kortleks-teman och tillgångar

Spelet använder en **par-baserad kortlek**. Varje tema består av 25–26 par (50–52 kort). Ett par är två kort med samma `pairId`. Som standard har båda korten samma bild, men admin-panelen stöder även **olika bilder** på de två korten i paret (`image_path` och `image_path_b`).

### Databasmodell

- `themes` — metadata för varje tema (`folder_name`, `display_name`, `description`, `is_active`).
- `theme_pairs` — varje pars `pair_id`, `name`, `description`, `sort_order`, `image_path` (kort A) och `image_path_b` (valfritt, kort B).
- `theme_files` — base64-kodade bilder för persistens på ephemeral filesystem.

### Filsystem

Bilderna ligger under `public_html/assets/cards/{tema}/{pairId}.png` (t.ex. `frukt/pair-1.png`). Om de två korten i paret har olika bilder sparas den andra som `{tema}/{pairId}-b.png` (t.ex. `frukt/pair-1-b.png`). Baksidan sparas som `{tema}/back.png`.

För närvarande finns följande bildbaserade teman i `public_html/assets/cards/`: `vegetable`, `frukt`, `saker`, `exempeltema`. Temat `standard` renderas med Unicode-färger/rank istället för bilder.

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

- `public_html/admin/pairs.html` + `pairs.js` — **primär editor** för att skapa nya par-baserade teman med 26 par, anpassade `pairId`, namn, beskrivning och en eller två bilder per par. Innehåller AI-generering av bilder via Pollinations.ai baserat på beskrivning + valda färger.
- `public_html/admin/index.html` — huvudpanel med länk till par-hantering (klassisk suit/rank-designer finns kvar för legacy-teman).

---

## 13. Driftsättning

### Railway (primär metod)

1. Repo på GitHub, kopplat till Railway.
2. `Procfile` anger startkommando: `web: node server/server.js`.
3. Miljövariabler i Railway:
   - `JWT_SECRET` — lång slumpmässig sträng (minst 64 tecken rekommenderas).
   - `NODE_ENV=production`
   - `PORT=3000`
   - `DATABASE_URL` — för PostgreSQL (rekommenderat för persistent data).
   - `RATE_LIMIT_WINDOW` / `RATE_LIMIT_MAX` — valfria rate-limit-överskridningar.
   - `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` — valfria anpassade TURN-servrar.
   - `DB_FALLBACK=false` — rekommenderas i prod för att undvika SQLite.
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — för e-postutskick.
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

1. Kör `npm run lint` — fixa fel.
2. Kör `npm run format` — formatera kod.
3. Kör `npm test` — se till att alla tester går igenom.
4. Kontrollera att `npm run format:check` är grön.

### Att lägga till en ny API-endpoint

1. Skapa route-fil under `server/routes/` (eller utöka befintlig).
2. Registrera i `server/server.js` med `app.use('/api/xxx', ...)`. Observera att `server/routes/themes.js` redan mountas inline i `server.js`.
3. Auth-middleware körs globalt och sätter `req.user` till `null` för gäster.
4. För admin-endpoints, använd `requireAdmin`-mönstret från `server/routes/admin.js`.

### Att lägga till ett Socket.IO-event

1. Lägg till handler i `server/sockets/handlers.js`.
2. Wrappa handler med `rateLimit(eventName, max, windowMs, handler)` för att aktivera rate limiting. Exempel:

   ```js
   socket.on(
       'my_event',
       rateLimit('my_event', 10, 60000, data => {
           // ...handler-logik
       })
   );
   ```

3. Vid speländringar: använd `roomManager.getRoomBySocket(socket.id)` för att hämta aktuellt rum.
4. Använd `broadcastToRoom(game, event, payload, true)` för rum-broadcast med individuell gameState.

### Att broadcasta till rum med individuell gameState

Använd den interna helper-funktionen `broadcastToRoom(game, event, basePayload, includeGameState = false)` inuti `createSocketHandlers`. Den fångar `io` från det yttre scopet och skickar individuell `gameState` per spelare via `game.getPublicState()` och spectator-state via `game.getSpectatorState()`. Undvik att manuellt loopa över `game.players` och `game.spectators`.

### Att ändra spelregler (ask/fisk)

Spelmotorn använder två privata metoder för gemensam logik:

- `_processAskSuccess(asker, target, pairId, matchingCards)` — hanterar kortöverföring, par-bildning, achievements och game-over-kontroll.
- `_processAskFish(asker, target, pairId)` — hanterar "Finns i sjön!", drag från leken, lyckad fisk, turbyte och timer.

Använd dessa för att säkerställa konsekvent beteende mellan direkta AI-drag (`askForCards`) och mänskliga svar (`respondToAsk`).

### Att lägga till ett achievement

1. Lägg till konstanten i `server/utils/constants.js` under `ACHIEVEMENTS`.
2. Lägg till utlösningslogik i `GameEngine.checkAchievements()`.
3. Se till att `game-end.js` sparar achievement via `User.addAchievement()` vid `game_end`-händelser.
4. Klienten (`public_html/js/game.js`) visar achievements som får `achievement_unlocked`-eventet.

### Att lägga till eller ändra ett kortlekstema

1. Använd helst admin-panelen `public_html/admin/pairs.html` för par-baserade teman.
2. Alternativt kör `scripts/generate-example-theme.py` (kräver Python 3 + PIL) för att skapa bilder + `config.json`.
3. Seeda till databasen med `scripts/seed-example-theme.js`.
4. Vid manuella ändringar: se till att både filsystem (`public_html/assets/cards/{tema}/`) och databas (`themes`/`theme_pairs`/`theme_files`) är synkade; använd `db.saveThemeFiles()` om du ändrar via kod.

---

## 15. Vanliga fällor och saker att tänka på

- **SQLite-index:** SQLite-fallback skapar inte alla prestandaindex som PostgreSQL/MariaDB gör. I produktion ska du därför använda PostgreSQL eller MariaDB.
- **game_events-tabellen:** Även om tabellen finns och `Game.logEvent()` är definierat, skrivs inga händelser dit under normalt spel. Händelser finns i `game.gameEvents` och snapshots.
- **Cookie-parser:** Inte installerat — `req.cookies?.token` i `auth.js` är i praktiken inaktivt.
- **JWT_SECRET i prod:** Om `JWT_SECRET` saknas i produktion kastar `server/auth/auth.js` ett fel vid import och servern startar inte.
- **Theme seeding:** Vid uppstart seedas teman från filsystemet. Om du lägger till ett nytt tema manuellt i databasen, se till att filsystemsbilderna också finns, eller använd admin-API:t.
- **Reconnection race conditions:** Reconnection matchar på `oldSocketId`, `reconnectToken` och till sist `userId`. Var försiktig med timing när du ändrar disconnect/forceRemove-logiken.
- **AI vs mänsklig tur:** `askForCards` används för AI, `requestAsk` + `respond_to_ask` för människor. Blanda inte dessa flöden.
- **Pull-to-refresh på mobil:** `public_html/js/pull-to-refresh.js` polyfillar pull-to-refresh för vissa mobila webbläsare.
- **Frontend-sökvägar:** README anger ibland `public/`, men den faktiska mappen är `public_html/`.
- **Safari + WebRTC:** WebRTC-video fungerar inte på `localhost` i Safari; använd `http://127.0.0.1:3000`.
- **Persistenta rum:** Ett `persistent_rooms`-sparande lagrar endast inställningar och återställer rummet vid återanslutning; det pågående spelet lagras inte persistent (endast `game_snapshots` som inte läses vid uppstart).
- **Room invites:** Inbjudningar har en utgångstid och markeras som `delivered` när mottagaren är online; använd `friends.js`-endpoints för att hämta och markera dem.
