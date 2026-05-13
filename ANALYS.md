# Djupanalys: Finns i sjön PRO

> Genomförd: 2026-05-11 | Fokus: Arkitektur, säkerhet, prestanda, UX, mobil

---

## Sammanfattning

Spelet är en imponerande fullstack-applikation med realtidsmultiplayer via Socket.IO, WebRTC-röst/video-chatt, AI-motståndare på 4 nivåer, ELO-rankning, achievements och ett genomtänkt UI. **Kärnan är solid**, men det finns **systematiska förbättringsområden** inom säkerhet, skalbarhet, kodorganisation och mobilupplevelse.

---

## 1. Arkitektur & Kodkvalitet

### 1.1 Starka sidor
- **Tydlig separation** mellan GameEngine (spellogik), RoomManager (rumshantering) och server.js (transportlager)
- **AI-arkitekturen** är välstrukturerad med strategimönster (naive → smart → expert → master)
- **State-hantering** i GameEngine är explicit med GAME_STATES-konstanter
- **Fallback-databas** (SQLite om MariaDB saknas) gör lokal utveckling enkel

### 1.2 Problemområden

#### A. `server.js` är 1012 rader — en "God Class"
All Socket.IO-eventhantering, alla API-endpoints, game-over-hantering och autentisering ligger i en enda fil.

**Risk:** Svårt att navigera, svårt att testa isolerat, hög risk för merge-konflikter.

**Förslag:** Dela upp i moduler:
```
server/routes/
  auth.js       # /api/auth/*
  users.js      # /api/users/*
  rooms.js      # /api/rooms, /api/stats/*
server/socket/
  gameEvents.js     # ask_cards, respond_to_ask, etc.
  roomEvents.js     # join_room, create_room, leave_room
  chatEvents.js     # chat_message
  webrtcEvents.js   # voice_join, webrtc_offer, etc.
```

#### B. Frontend `game.js` är 1437 rader
GameClient-klassen hanterar socket-lyssnare, UI-rendering, animationshantering, dialoger, inställningar och röstchatt. Single Responsibility Principle bryts tydligt.

**Förslag:** Dela upp i:
```
js/game/
  GameClient.js      # socket-hantering & state
  UIRenderer.js      # all DOM-manipulation
  AskDialog.js       # fråga-kort-logik
  CardRequest.js     # svara-på-förfrågan-overlay
  SettingsManager.js # localStorage & inställningar
```

#### C. Globala variabler (`window.gameClient`, `window.socket`)
Gör koden svår att testa och skapa sidoeffekter som är svåra att spåra.

**Förslag:** Använd explicit dependency injection eller en global state-hanterare (t.ex. en enkel EventBus).

#### D. Magic numbers och strängar
```javascript
// Exempel från GameEngine.js
turnTimeout: 45000,
maxTurnTime: 60000,
setTimeout(() => this.makeAIMove(this.io), 1500);  // AI-delay
setTimeout(() => { ... }, 5000);  // disconnect-timeout
```

**Förslag:** Alla timeouts, delays och gränser bör ligga i `server/config/constants.js` eller `.env`.

---

## 2. Säkerhet

### 2.1 Kritiska brister

#### A. **CSP (`unsafe-inline`)**
```javascript
scriptSrc: ["'self'", "'unsafe-inline'", ...],
scriptSrcAttr: ["'unsafe-inline'"],
```
`unsafe-inline` i `scriptSrc` innebär att **vilken XSS-injicering som helst kan exekvera kod**. Inline-event handlers (`onclick`, `onerror`) används frekvent i HTML-templates.

**Förslag:**
1. Generera en nonce per request och använd `script-src 'nonce-xyz'`
2. Eller flytta alla inline-handlers till JS (vilket delvis gjorts för `closeError`)
3. Ta bort `'unsafe-inline'` helt från `scriptSrc`

#### B. **Ingen input-sanering i chatten**
```javascript
// server.js
socket.on('chat_message', async (data) => {
    const { message } = data;
    const chatMsg = game.addChatMessage(socket.id, message);
```
Chat-meddelanden sparas och sänds vidare **rakt av**. En angripare kan injicera HTML/JS som renderas hos andra spelare.

**Förslag:** Sanera alla användarinput med en bibliotek som `DOMPurify` eller `he` (HTML entities):
```javascript
const sanitized = DOMPurify.sanitize(message, { ALLOWED_TAGS: [] });
```

#### C. **Lösenordshantering**
```javascript
// auth/auth.js — bcryptjs används (bra!)
```
Men i registrerings-endpointen valideras endast längd (≥6). Ingen kontroll av lösenordsstyrka.

**Förslag:** Lägg till minimumkrav: minst en siffra, en stor bokstav, eller en passphrase-check.

#### D. **Rate limiting är för grov**
```javascript
max: 100,  // per 15 minuter
skip: (req) => req.method === 'GET' && ...
```
GET-exkluderingen löser problemet med polling, men **alla andra endpoints** (POST register, login, chat) delar på 100 requests. Om någon spammar chatten blockeras alla.

**Förslag:** Separata limiters per endpoint-typ:
```javascript
const authLimiter = rateLimit({ max: 10, windowMs: 15 * 60 * 1000 });
const chatLimiter = rateLimit({ max: 60, windowMs: 60 * 1000 });
app.use('/api/auth/', authLimiter);
app.use('/api/rooms/:id/chat', chatLimiter);
```

#### E. **JWT Secret i kod**
```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';
```
Om `JWT_SECRET` saknas i miljön används ett **hårdkodat default-värde**. Detta är en kritisk säkerhetsrisk om någon glömmer sätta env-variabeln.

**Förslag:** Kasta ett fel vid uppstart om `JWT_SECRET` saknas:
```javascript
if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET måste sättas i miljövariabler');
}
```

### 2.2 Medelallvarliga brister

#### F. **Ingen CSRF-skydd**
API:et använder JWT i header/cookie men saknar CSRF-token för cookie-baserad auth.

#### G. **Socket-auth kan misslyckas tyst**
```javascript
// auth/auth.js socketAuth
if (!token) { socket.user = null; return next(); }
```
Om token saknas får socket ansluta som "gäst" utan varning. Detta är rimligt för spelet, men det finns ingen loggning av misslyckade auth-försök.

---

## 3. Prestanda & Skalbarhet

### 3.1 Databas
- **SQLite på Railway:** SQLite är **inte lämpligt för produktion** med flera instanser. Railway kan skala horisontellt, men SQLite är en fil-baserad databas som inte hanterar samtidiga skrivningar väl.
- **MariaDB-koden finns men används inte:** `mysql2` är en dependency men Railway verkar köra SQLite-fallback.

**Förslag:** Migrera till PostgreSQL (Railways standard) eller se till att MariaDB konfigureras korrekt i Railway.

### 3.2 Socket.IO
- **`io.to(roomId).emit(...)`** skickar till alla i rummet inklusive avsändaren. Detta är korrekt, men vid stora rum kan det bli mycket trafik.
- **Ingen rooms-hantering för spectators:** Spectators hamnar i samma Socket.IO-rum som spelare.

### 3.3 Frontend
- **Komplett DOM-rewrite vid varje state-update:** `renderGame()` manipulerar DOM direkt utan virtual DOM. För detta spelets omfång är det acceptabelt, men vid frekventa updates (t.ex. animations-loopar) kan det bli trögt.
- **Polling var 10:e sekund:** Acceptabelt nu, men med 100+ aktiva användare blir det 30 req/s. Socket.IO-broadcast av lobby-uppdateringar vore mer elegant.

### 3.4 Bilder & Assets
- **Kortlek med PNG-bilder:** Varje kort laddas som en separat bild. På långsamma mobilnätverk kan detta vara märkbart.

**Förslag:** Använd en sprite-sheet eller SVG-kort som renderas inline (redan delvis implementerat för klassiska kort).

---

## 4. Användarupplevelse (UX)

### 4.1 Game flow-problem

#### A. **Återanslutning är begränsad**
```javascript
// RoomManager.js
if (game.state !== 'waiting') {
    const existingPlayer = game.players.find(p => p.name === playerName && !p.connected);
    if (existingPlayer) {
        return { success: false, error: 'Spelet pågår - använd återanslutning' };
    }
}
```
Återanslutning kräver exakt samma namn OCH att spelaren är frånkopplad. Om man byter enhet eller råkar ange ett annat namn går det inte att komma tillbaka.

**Förslag:** Implementera återanslutning via `userId` (för inloggade) eller ett sparat "reconnect token" i localStorage.

#### B. **Spelet fortsätter när spelare disconnectar**
Om en spelare lämnar spelet (t.ex. pga. nätverksproblem) fortsätter spelet med kvarvarande spelare. Detta kan ge orättvisa resultat — en spelare som ligger sist kan "rage quitta" och påverka spelet.

**Förslag:** Lägg till en paus-mekanism eller AI-ersättning vid disconnect (redan delvis — AI kan läggas till manuellt).

#### C. **Ingen "redo"-indikator**
Värdet vet inte när alla spelare är redo att starta. Det finns ingen "ready"-knapp.

### 4.2 UI-problem

#### D. **Game-over-modal blockerar allt**
Efter spelet visas en modal som täcker hela skärmen. Man kan inte se slutställningen i bakgrunden.

#### E. **Ingen handhistorik / replay**
Spelet loggar alla händelser men det finns inget sätt att spela upp eller analysera en match i efterhand.

#### F. **Spectator-läge är gömt**
SpectatorMode finns i inställningarna men det finns ingen UI-indikation för åskådare.

---

## 5. Mobilupplevelse

### 5.1 Betydande förbättringar gjorda (bra jobbat!)
- Kompakt 45px-header
- Horisontell motspelar-rad
- Fixed bottom action-bar
- Card-request overlay som banner
- Video-thumbnails i center-area

### 5.2 Kvarstående problem

#### A. **iPhone Safari-specifika problem**
- **WebRTC kräver HTTPS + user gesture** — detta fungerar nu på Railway, men om någon hostar lokalt (HTTP) fungerar det inte.
- **Safe area insets:** CSS använder `env(safe-area-inset-bottom)` men inte `env(safe-area-inset-top)`, vilket kan ge problem med iPhones med Dynamic Island.

#### B. **Landscape-orientering är inte testad**
All mobil-CSS bygger på portrait (smal skärm). I landscape kan korten bli för små eller layouten brytas.

#### C. **Pinch-to-zoom är tillåten**
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```
Saknar `user-scalable=no` eller `maximum-scale=1`, vilket kan leda till oavsiktlig zoom när man dubbelklickar på knappar.

#### D. **Långsamma animationer på äldre mobiler**
Confetti- och turn-animationer använder CSS-animations och DOM-manipulation som kan vara tunga på äldre enheter.

---

## 6. WebRTC / Röstchatt

### 6.1 Starka sidor
- **ICE-restart vid disconnect** — mycket bra återhämtningslogik
- **MutationObserver** för att flytta video-element till rätt opponent
- **PTT (Push-to-Talk)** finns som alternativ

### 6.2 Problem

#### A. **Ingen TURN-server**
```javascript
iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
]
```
Bara STUN, ingen TURN. Om två spelare sitter bakom symmetriska NAT:ar (vanligt i företagsnätverk och vissa mobilnät) **kommer WebRTC att misslyckas helt**.

**Förslag:** Lägg till en TURN-server (t.ex. Twilio, Xirsys, eller en egen coturn-instans).

#### B. **Signaling-servern hanterar inte rum korrekt**
```javascript
// webrtc/signaling.js
socket.to(roomId).emit('voice_peer_joined', ...);
```
`voice_peer_joined` skickas via `socket.to(roomId)` men voice_join kontrollerar bara att spelaren är i ett rum — det finns ingen explicit join av Socket.IO-rummet för WebRTC.

**Förslag:** Efter `socket.join(roomId)` i `join_room`, skicka WebRTC-events i samma rum.

#### C. **Peer-connections läcker vid snabb återanslutning**
Om en spelare snabbt disconnectar och reconnectar kan gamla RTCPeerConnections finnas kvar i `video-chat.js`'s `Map`.

---

## 7. Databas & Persistence

### 7.1 Schema-design
- **Bra normalisering:** users, games, game_participants, game_events, achievements, friendships
- **Index finns** på elo_rating, created_at, user_id

### 7.2 Problem

#### A. **Spel som kraschar sparas inte**
Om servern kraschar under ett pågående spel försvinner all state. GameEngine håller allt i minnet.

**Förslag:** Spara spel-tillstånd periodiskt (t.ex. varje tur) till databasen med en "in_progress"-status.

#### B. **`gameEvents` lagras aldrig**
```javascript
this.gameEvents = [];  // i GameEngine
```
`gameEvents` fylls med data men sparas inte till databasen. `Game.logEvent()` finns men används inte i spellogiken.

#### C. **SQLite AUTOINCREMENT kan slå i taket**
SQLite's `INTEGER PRIMARY KEY AUTOINCREMENT` har en teoretisk gräns, men mer praktiskt: SQLite-filen växer obegränsat på disken.

---

## 8. Spellogik & Spelbalans

### 8.1 Game over-betingelser
```javascript
if ((allHandsEmpty && deckEmpty) || activePlayers.length < 2 || (deckEmpty && anyHandEmpty)) {
```
- **`deckEmpty && anyHandEmpty`:** Om leken är tom och EN spelare har 0 kort avslutas spelet — även om andra spelare fortfarande har kort. Detta är korrekt för "Finns i sjön" men kan kännas abrupt.
- **Ingen "last turn"-varning:** Spelaren får ingen indikation att spelet är nära slut.

### 8.2 AI-balans
- **AI:n vet exakt vilka kort som spelats** via gameState. Detta är en fördel över mänskliga spelare som måste komma ihåg.
- **Master-AI har obegränsad minne** — mänskliga spelare glömmer. En "human-like" AI med begränsat minne vore mer rättvist.

### 8.3 ELO-systemet
- ELO beräknas endast för registrerade användare i spel med ≥2 mänskliga spelare.
- Gästspelare påverkar inte ELO — men de kan påverka spelets utfall (t.ex. hjälpa en vän).

---

## 9. Testing & DevOps

### 9.1 Brister
- **Inga tester alls** — varken unit, integration eller E2E
- **Ingen linting** — ingen ESLint/Prettier-konfiguration
- **Ingen CI/CD** — deployment sker manuellt via Git-push till Railway
- **Ingen health-check endpoint** — Railway kan inte avgöra om appen är frisk

### 9.2 Logging
- **Console.log överallt** — i produktion blir detta brus i loggarna
- **Debug-logg till fil** i GameEngine skrivs bara i utveckling (`NODE_ENV !== 'production'`) — bra!
- **Ingen strukturerad logging** (t.ex. JSON-format för korrelation)

---

## 10. Prioriterade Quick Wins (högst → lägst)

| # | Åtgärd | Prio | Komplexitet | Impact |
|---|--------|------|-------------|--------|
| 1 | **Sanera chatten mot XSS** | 🔴 Kritisk | Låg | Skyddar alla spelare |
| 2 | **CSP: ta bort `unsafe-inline`** | 🔴 Kritisk | Medel | Skyddar mot XSS-injicering |
| 3 | **JWT_SECRET: kräv env-variabel** | 🔴 Kritisk | Låg | Förhindrar svag auth |
| 4 | **Separate rate limiters** | 🟠 Hög | Låg | Förhindrar DoS/missbruk |
| 5 | **TURN-server för WebRTC** | 🟠 Hög | Medel | Röstchatt fungerar överallt |
| 6 | **SQLite → PostgreSQL/MariaDB** | 🟠 Hög | Medel | Produktionsduglig DB |
| 7 | **iPhone: pinch-zoom disable** | 🟡 Medel | Låg | Bättre mobil-UX |
| 8 | **Landscape CSS** | 🟡 Medel | Medel | Stöd för alla orienteringar |
| 9 | **Refactor server.js** | 🟡 Medel | Hög | Underhållbarhet |
| 10 | **Unit-tester för GameEngine** | 🟡 Medel | Medel | Färre buggar |
| 11 | **Ready-knapp före start** | 🟢 Låg | Låg | Bättre UX |
| 12 | **Spara spel-tillstånd periodiskt** | 🟢 Låg | Medel | Crash-resiliens |

---

## Slutsats

**Finns i sjön PRO är ett välbyggt spel med imponerande funktionalitet** — realtidsmultiplayer, AI, WebRTC, rankning och achievements. Kärnarkitekturen är sund, men projektet har vuxit till en punkt där kodorganisation, säkerhet och produktionsreadiness behöver uppmärksamhet.

**Rekommendation:** Prioritera säkerhetsfixarna (XSS, CSP, JWT) omedelbart. Därefter infrastrukturen (DB, TURN, rate limiting). Kodrefaktorering och tester kan göras parallellt med ny feature-utveckling.
