<!-- AGENTS.md — Finns i Sjön PRO -->

> **Målgrupp:** AI-kodningsagenter som arbetar med detta projekt.  
> **Språk:** Projektets källkod och dokumentation är primärt på **svenska** (användarsidor, kommentarer, loggmeddelanden, API-svar). Denna fil skrivs på svenska för konsekvens, med tekniska termer på engelska där det är naturligt.

---

## 1. Projektöversikt

**Finns i Sjön PRO** (v2.0.0) är ett realtidsmultiplayer-kortspel (svenska "Finns i sjön" / Go Fish) för webben. Det har stöd för:

- Rumsbaserade spelbord med privata/publika rum
- AI-motståndare på 4 svårighetsgrader
- Användarkonton med JWT-autentisering och ELO-rankning
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
│   │   ├── rooms.js           # Factory: createRoomRouter(roomManager)
│   │   ├── stats.js           # GET /total-games
│   │   └── admin.js           # GET /themes, /themes/:theme (kortlekshantering)
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
│   │   └── logger.js          # Loggningshjälpare (färgad dev / JSON prod)
│   └── webrtc/
│       └── signaling.js       # WebRTC-signaling (offer/answer/ICE) via Socket.IO
│
├── public_html/               # Frontend (vanilla JS, HTML, CSS)
│   ├── index.html             # Lobby / landing page
│   ├── game.html              # Spelbräde
│   ├── leaderboard.html       # Topplista (standalone)
│   ├── admin/                 # Admin-panel för temahantering
│   │   ├── index.html
│   │   ├── admin.js
│   │   ├── admin.css
│   │   ├── FileSaver.min.js
│   │   └── jszip.min.js
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
│   │   └── RoomManager.test.js
│   ├── models/
│   │   └── Friendship.test.js
│   └── utils/
│       ├── elo.test.js
│       └── socket-rate-limit.test.js
│
├── scripts/
│   └── update-user-avatars.js # One-off migration: uppdaterar default-avatarer
├── database/
│   └── game.db                # SQLite-fil (skapas vid init-db, gitignored)
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
- **Coverage:** Samlas från `server/**/*.js`, exkluderar `server/server.js` och `server/config/database.js`
- **Coverage-thresholds:** `branches: 25`, `functions: 30`, `lines: 30`, `statements: 30` (se `jest.config.js`).
- **Viktigt:** Jest körs alltid med `--forceExit` eftersom Socket.IO kan hålla event-loopen vid liv.
- **CI:** GitHub Actions kör `npm audit --audit-level=moderate` (continue-on-error), `npm run lint`, `npm run format:check`, och `npm test -- --forceExit` vid varje push/PR till `main`.
- **Inga frontend- eller E2E-tester:** Alla befintliga tester är backend-enhetstester.

### Existerande testfiler
| Fil | Antal tester | Innehåll |
|-----|--------------|----------|
| `tests/game/GameEngine.test.js` | 16 | Spelregler, turhantering, utdelning, par, återanslutning, ask/fish/surrender |
| `tests/game/CardDeck.test.js` | 6 | Kortleksinitiering (52 kort), blanda, dra, `isEmpty`, `remaining` |
| `tests/game/RoomManager.test.js` | 18 | Rums-CRUD, join/leave (force/soft), kick, **ban**, reconnect, lösenord, spectator, bannade spelare |
| `tests/game/AIPlayer.test.js` | 9 | AI-initiering, minne, beslutsfattning, pruning, konsekutiva frågor, svårighetsgrader |
| `tests/models/Friendship.test.js` | 13 | Vänförfrågningar: skicka, acceptera, avböja, ta bort, lista, kontrollera om vänner |
| `tests/utils/elo.test.js` | 4 | ELO-beräkning: vinnare/förlorare, upset-win, 3+ spelare, konstant summa |
| `tests/utils/socket-rate-limit.test.js` | 9 | Rate limiting: gränser, återställning, separata buckets, shorthand-anrop |

**Totalt:** 75 tester fördelade på 7 testfiler.

---

## 7. Säkerhetsöverväganden

### Autentisering
- JWT med 7 dagars giltighet (`expiresIn: '7d'`).
- `JWT_SECRET` **måste** vara satt i produktion (`NODE_ENV=production`). Servern kastar ett fel och avbryter uppstarten om den saknas. Fallback i kod (`'default-secret-change-me'`) gäller endast för utveckling.
- Token skickas i `Authorization: Bearer <token>`-header för REST, och i `socket.handshake.auth.token` för Socket.IO.
- Auth-middleware sätter `req.user` / `socket.user` till `null` vid saknad/ogiltig token (aldrig hårda fel).
- Middleware läser även token från `req.query.token` som fallback. Observera att `req.cookies?.token` finns i koden men är ej funktionellt eftersom `cookie-parser` inte är installerat.
- Token-payload: `{ userId, username, displayName }`.

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
  - `join_room`, `add_ai`, `remove_ai`, `kick_player`, `update_settings`, `reconnect_attempt`, `leave_room`: 10 / minut
  - `chat_message`, `toggle_ready`: 30 / minut
  - `ask_cards`, `respond_to_ask`: 60 / minut
  - WebRTC (`voice_join`, `voice_leave`, `webrtc_offer`, `webrtc_answer`): 10–60 / minut
  - `webrtc_ice_candidate`: 120 / minut (ICE-kandidater kan komma i snabb följd)
  - Vid överskridande skickas `error`-event med meddelandet `"För många förfrågningar. Vänta en stund."`

### Body size limits
- `express.json({ limit: '50mb' })` är satt i `server/server.js` för att hantera stora base64-uppladdningar av kortleksbilder via admin-API:t.

### Övrigt
- `friendships`-tabellen används nu av vännerlistan (modell: `server/models/Friendship.js`, routes: `server/routes/friends.js`).
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
- `users` — användarkonton, ELO, statistik
- `games` — spelmetadata (vinnare, duration, antal turer)
- `game_participants` — deltagare per spel med slutlig rank och ELO-förändring
- `game_events` — händelselogg (frågor, fiskningar, par)
- `friendships` — vänförfrågningar (status: `pending`/`accepted`); används av vännerlista-API:t
- `achievements` — upplåsta achievements per användare
- `game_snapshots` — JSON-snapshots av spelstatus för crash-recovery
- `theme_files` — base64-kodade kortleksbilder för persistens på ephemeral filesystem

### Index
Följande index skapas vid initiering av **PostgreSQL och MariaDB**:
- `idx_users_elo` (users.elo_rating DESC)
- `idx_users_online` (users.is_online)
- `idx_achievements_user` (achievements.user_id)
- `idx_games_created` (games.created_at DESC)
- `idx_game_participants_user` (game_participants.user_id)
- `idx_game_events_game` (game_events.game_id)

**Observera:** SQLite-fallback initierar **inte** dessa index.

### Snapshots
- `game_snapshots` sparas asynkront vid state-ändringar, men är **throttlad** till max en gång per 30 sekunder under pågående spel.
- Snapshots skrivs till databasen men **läses inte automatiskt tillbaka** vid serveromstart eller när ett rum skapas.

### Tema-filsynk (DB ↔ Filsystem)
- `database.js` innehåller `saveThemeFiles(themeName)` och `restoreThemeFiles()` för att hantera kortleksbilder på Railways ephemeral filesystem.
- Vid serverstart återställs temafiler från databasen om de saknas på disk (`server.js` anropar `db.restoreThemeFiles()`).
- Nya teman sparas till både filsystem och databas via admin-API:t.

---

## 9. Socket.IO-arkitektur

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
| `respond_to_ask` | Svara på pågående förfrågan (hasCard, rank) |
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
- **Tur-timer:** 45 sekunder (`TURN_TIMEOUT`). Om en spelare inte svarar på en `card_request` i tid auto-löser servern förfrågan som "Fisk!" via `autoResolvePendingAsk()`.
- **AI-drag-fördröjning:** 1500 ms för normala AI-drag; 2000 ms för spelets första AI-drag. `AIPlayer.js` internt använder 1000–3000 ms för sitt beslutsfattande.
- **Disconnect-grace:** Vid `disconnect` väntar servern **60 sekunder** innan `forceRemove` körs, vilket ger utrymme för återanslutning.
- **Rumsrensning:** Om inga mänskliga spelare återstår eller spelet är avslutat schemaläggs rummet för borttagning efter **5 minuter**.
- **Reconnection:** Klienten sparar `previousSocketId` och `reconnectToken` i `localStorage`; vid återanslutning skickas `reconnect_attempt`.
- **Tom hand-hantering:** `ensureCurrentPlayerHasCards()` drar automatiskt 1 kort om den aktiva spelaren har 0 kort och leken inte är tom. `nextPlayer()` hoppar över spelare med tom hand om leken är slut.

### Broadcast-helper
Inuti `createSocketHandlers` finns en closure `broadcastToRoom(game, event, basePayload, includeGameState = false)` som fångar `io` från det yttre scopet. Den skickar individuell `gameState` per spelare via `game.getPublicState()` och spectator-state via `game.getSpectatorState()`. Undvik att manuellt loopa över `game.players` och `game.spectators` — detta mönster upprepades på 5+ ställen och är nu centraliserat.

---

## 10. WebRTC-signaleringsarkitektur

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

## 11. Kortleks-teman och tillgångar

Kortleksbilderna ligger under `public_html/assets/cards/` och är organiserade i **tema-kategorier** (t.ex. `vegetable`, `frukt`, `saker`). Varje kategori innehåller 4 undermappar som motsvarar "färger":

| Färg (suit) | Mappnamn |
|-------------|----------|
| Hearts      | `aubergine` |
| Diamonds    | `radish` |
| Clubs       | `pepper` |
| Spades      | `potato` |

Varje färg-mapp innehåller 13 bildfiler: `A.png`, `2.png` … `10.png`, `J.png`, `Q.png`, `K.png`.

**Fallback:** Om en bild saknas renderas kortet med standard Unicode (rank + färgsymbol).

**Admin-API:** `server/routes/admin.js` exponerar `/api/admin/themes` och `/api/admin/themes/:theme` för att lista och inspektera teman. Admin-panelen finns under `public_html/admin/`.

---

## 12. Driftsättning

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

**Viktigt:** På Railways gratisplan är filsystemet "ephemeral". Använd PostgreSQL (`DATABASE_URL`) för att inte förlora användardata vid omstart. Servern kör `app.set('trust proxy', 1)` för korrekt rate-limiting bakom Railways proxy. Temafiler sparas även till databasen (`theme_files`-tabellen) och återställs vid uppstart.

**Se även:** `DEPLOY_RAILWAY.md` för en mer detaljerad steg-för-steg-guide.

### Lokalt
```bash
cp .env.example .env
npm install
npm run init-db
npm run dev
# Öppna http://localhost:3000
```

---

## 13. Utvecklingskonventioner

### Innan du commitar
1. Kör `npm run lint` — fixa fel
2. Kör `npm run format` — formatera kod
3. Kör `npm test` — se till att alla tester går igenom
4. Kontrollera att `npm run format:check` är grön

### Att lägga till en ny API-endpoint
1. Skapa route-fil under `server/routes/` (eller utöka befintlig)
2. Registrera i `server/server.js` med `app.use('/api/xxx', ...)`
3. Auth-middleware körs globalt och sätter `req.user` till `null` för gäster

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
4. Använd `io.to(roomId).emit(...)` för broadcast och `socket.emit(...)` för direktsvar

### Att broadcasta till rum med individuell gameState
Använd den interna helper-funktionen `broadcastToRoom(game, event, basePayload, includeGameState = false)` inuti `createSocketHandlers`. Den fångar `io` från det yttre scopet och skickar individuell `gameState` per spelare via `game.getPublicState()` och spectator-state via `game.getSpectatorState()`. Undvik att manuellt loopa över `game.players` och `game.spectators` — detta mönster upprepades på 5+ ställen och är nu centraliserat.

### Att ändra spelregler (ask/fisk)
Spelmotorn använder två privata metoder för gemensam logik:
- `_processAskSuccess(asker, target, rank, matchingCards)` — hanterar kortöverföring, par-bildning, achievements och gameOver.
- `_processAskFish(asker, target, rank)` — hanterar fiskning, kortdragning, lucky fish och tur-övergång.

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

### HTML — tillgänglighet
- **Modaler** måste ha `role="dialog"`, `aria-modal="true"`, och `aria-labelledby` (pekar på rubrikens ID).
- **Stäng-knappar** med `&times;` måste ha `aria-label="Stäng"` (skärmläsare läser annars bara "times").
- **Ikon-knappar** utan text måste ha `aria-label` (inte bara `title`, även om `title` är bra för tooltips).

### Projektroten — dokumentationskonventioner
Projektet har en uppsättning markdown-filer i roten som komplement till denna fil:
- **`ANALYS.md`** — djupanalys av arkitektur, säkerhet, prestanda och UX
- **`DEPLOY_RAILWAY.md`** — detaljerad deploy-guide för Railway
- **`PROJEKTPLAN.md`** — originalplan med achievements, färgpalett, ljudsystem och animationer
- **`DEBUGGING_LOG.md`** — historisk debugg- och bugfix-logg
- **`CHANGELOG_SESSION_YYYY-MM-DD.md`** / **`CHAT_SESSION_YYYY-MM-DD.md`** — loggar från tidigare utvecklingssessioner
- **`BUGFIX_*.md`** — dokumentation av specifika buggfixar (t.ex. mobil spectator-buggen)

### Vanliga fallgropar
- **`README.md` refererar ibland till `public/`** — projektets faktiska statiska mapp är `public_html/`.
- **`scripts/`** innehåller one-off migrationer (t.ex. `update-user-avatars.js`). De körs manuellt vid behov, inte som en del av byggprocessen.
- **Kortleksstrukturen** har ändrats från flat (`assets/cards/aubergine/`) till kategoriserad (`assets/cards/vegetable/aubergine/`). Kod som läser teman (t.ex. admin-routes) hanterar båda nivåerna.
- **`filterChat()` använder word boundaries med svenskt teckenstöd** (`[^a-zåäöA-ZÅÄÖ]`). `\b` fungerar inte korrekt med åäö i JavaScript.

---

## 14. Kända begränsningar

- ~~`friendships`-tabellen finns men används inte i frontend eller backend.~~ ✅ Åtgärdat — vännerlista finns nu i lobby.
- ~~`banPlayer` finns i `RoomManager` men saknar en Socket.IO-handler.~~ ✅ Åtgärdat — `ban_player` är exponerad.
- WebRTC-video fungerar inte på Safari `localhost` — använd `127.0.0.1`.
- Standings-arrayen i `game_over`-eventet innehåller inte `eloChange` per spelare; varje mottagare får istället ett separat `eloChange`-objekt direkt i event-payloaden.
- `README.md` anger ibland fel statisk mapp (`public/` istället för `public_html/`).
- `game_snapshots` skrivs till databasen men läses **inte** automatiskt tillbaka vid serveromstart (inget automatiskt crash-recovery på rum-nivå).
- Cookie-parser är inte installerat, så `req.cookies?.token`-fallbacken i auth-middleware är ej funktionell.

---

## 15. Snabbreferens: Viktiga filer att läsa

| Om du ska… | Läs dessa filer |
|------------|-----------------|
| Ändra spelregler | `server/game/GameEngine.js`, `server/game/utils.js` |
| Ändra AI-beteende | `server/game/AIPlayer.js` |
| Ändra rumshantering | `server/game/RoomManager.js` |
| Ändra databas/schema | `server/config/database.js`, `server/models/*.js` |
| Ändra frontend-lobby | `public_html/js/app.js`, `public_html/index.html` |
| Ändra spelbräde | `public_html/js/game.js`, `public_html/game.html` |
| Ändra socket-återanslutning | `public_html/js/socket-client.js` |
| Ändra ljud/animationer | `public_html/js/audio.js`, `public_html/js/animations.js` |
| Ändra auth | `server/auth/auth.js`, `server/routes/auth.js` |
| Ändra vännerlista | `server/models/Friendship.js`, `server/routes/friends.js`, `public_html/js/app.js` |
| Ändra WebRTC | `server/webrtc/signaling.js`, `public_html/js/voice-chat.js`, `public_html/js/video-chat.js` |
| Ändra CI/CD | `.github/workflows/ci.yml` |
| Ändra linting/format/test-konfig | `eslint.config.js`, `.prettierrc`, `jest.config.js` |
| Kör one-off migrationer | `scripts/update-user-avatars.js` |
| Förstå avatar-generering | `generate-avatars.py` |
| Hantera kortleksteman | `server/routes/admin.js`, `public_html/assets/cards/README.md` |
| Felsöka serverloggar | `server/utils/logger.js` |

---

**🎣 Finns i Sjön PRO — Ett svenskt kortspel för hela världen**
