# Finns i sjön PRO - Debuggning & Bugfix-logg

## Sammanfattning
Detta dokument innehåller alla buggar, fixar och ändringar som gjordes under debuggningen av spelet "Finns i sjön PRO".

---

## Huvudbuggar som hittades och fixades

### 1. "Bordet är fullt" vid AI-spel
**Problem:** När man skapade ett spel mot AI och sedan laddade om till game.html, så blev det "Bordet är fullt".

**Rotorsak:** 
- app.js skapade rum + AI, sedan navigerade till game.html
- Under navigeringen stängdes socket-anslutningen
- Servern tog bort spelaren direkt från rummet (i waiting-läge)
- AI:n fanns kvar, vilket gjorde rummet fullt (1 AI + försök att lägga till ny spelare = 2)

**Fix:**
- `GameEngine.removePlayer()`: I waiting-läge markeras spelaren bara som frånkopplad (inte borttagen)
- `RoomManager.leaveRoom()`: Ny parameter `forceRemove` - vid disconnect markeras bara som frånkopplad, vid aktivt "Lämna rum" tas spelaren bort direkt
- `GameEngine.forceRemovePlayer()`: Ny metod för att aktivt ta bort spelare
- `disconnect`-hanteraren i server.js: Markerar spelaren som frånkopplad direkt, väntar 5 sekunder innan borttagning (ger tid för återanslutning)

### 2. WebSocket-anslutning tappas efter sidomladdning
**Problem:** "xhr poll error" och "network connection was lost" efter navigering från app.js till game.html.

**Rotorsak:** Safari/WebKit stänger WebSocket när sidan laddas om. Socket.IO faller tillbaka på HTTP-polling.

**Fix:**
- `socket-client.js`: `reconnect_attempt` skickas vid återanslutning
- `app.js`: Rensar `previousSocketId` från localStorage innan navigering till game.html (förhindrar onödig reconnect)
- `RoomManager.reconnect()`: Uppdaterar `hostSocketId` om spelaren som återansluter var host
- `RoomManager.joinRoom()`: Sparar host-status vid återanslutning med samma namn

### 3. Stavfel: `makeAIMMove` istället för `makeAIMove`
**Problem:** Servern kraschade med `TypeError: this.makeAIMMove is not a function`.

**Fix:** Bytte `makeAIMMove` till `makeAIMove` på rad 508 i `GameEngine.js`.

### 4. Saknade AI-avatar-bilder
**Problem:** `ai-naive.png` returnerade 404.

**Fix:** Skapade placeholder-bilder för alla AI-svårighetsgrader:
- `ai-naive.png`
- `ai-smart.png`
- `ai-master.png`
- `ai-expert.png`

### 5. Host-status tappas vid återanslutning
**Problem:** Efter sidomladdning kunde host inte starta spelet ("Endast värden kan starta spelet").

**Rotorsak:** Servern skickade alltid `isHost: false` i `room_joined`-eventet.

**Fix:** `server.js`: Kollar faktiskt om spelarens socketId matchar `room.hostSocketId` innan `isHost` skickas.

### 6. Oändlig loop i `nextPlayer()`
**Problem:** Spelet hängde sig när alla spelare hade tomma händer och leken var tom.

**Rotorsak:** `do-while`-loopen i `nextPlayer()` snurrade för evigt när ingen spelare var "giltig".

**Fix:** Lade till säkerhetsventil med `maxIterations` som avbryter loopen och returnerar `null`.

### 7. Spelet hänger sig när AI gör ogiltigt drag
**Problem:** AI:n försökte fråga om ett kort den inte hade. `askForCards` returnerade `success: false`, men turen gick aldrig vidare.

**Rotorsak:** När `askForCards` returnerade `success: false`, anropades aldrig `nextPlayer()`.

**Fix:** I `makeAIMove()`: Om `result.success === false`, anropa `nextPlayer()` och skicka `game_state_update`.

### 8. AI:ns hand synkroniseras inte
**Problem:** AI:n trodde den hade kort som den redan hade gett bort.

**Rotorsak:** AI-objektets `hand` uppdaterades inte när spelarens hand ändrades (t.ex. vid `askForCards`).

**Fix:** Ny metod `syncAIHand(player)` som synkroniserar AI:ns hand med spelarens hand. Anropas efter varje `askForCards`.

### 9. UI uppdateras inte när AI avslutar tur
**Problem:** Efter AI:s tur stod det fortfarande "Nybörjar-Nisses tur..." trots att det var människans tur.

**Rotorsak:** `game_state_update` skickades aldrig när AI:n avslutade sin tur normalt (bara vid `turn_result`).

**Fix:** I `makeAIMove()`: Skicka `game_state_update` i alla fall när AI:n avslutar sin tur.

### 10. Spelet slutar inte när spelare har 0 kort och leken är tom
**Problem:** Spelet fortsatte trots att en spelare hade 0 kort och leken var tom.

**Rotorsak:** `checkGameOver()` krävde att ALLA händer var tomma, inte bara en.

**Fix:** Lade till kriteriet: om leken är tom och minst en spelare har 0 kort, så är spelet slut (inga drag kan göras).

### 11. AI vs AI fastnar
**Problem:** När två AI-spelare spelade mot varandra, så startades aldrig nästa AI:s tur.

**Rotorsak:** `makeAIMove()` anropades bara när:
1. Spelet startade (via `dev_ai_vs_ai`)
2. En AI fick extra tur
Men INTE när en AI avslutade sin tur normalt och nästa spelare också var en AI.

**Fix:** I `makeAIMove()`: Efter varje tur, kolla om nästa spelare också är AI. Om ja, starta `makeAIMove` med timeout.

### 12. Åskådare får inga events i AI vs AI
**Problem:** Som åskådare såg man inte när AI:na spelade.

**Rotorsak:** Events (`turn_result`, `game_state_update`) skickades bara till `players`, inte till `spectators`.

**Fix:** Lade till `this.spectators.forEach(...)` i alla ställen i `makeAIMove()` där events skickas.

---

## Debug-funktioner som lades till

### Server-sida debug-loggning
- `GameEngine.debugLog(label, data)`: Skriver till `game-debug.log`
- Loggar alla drag, tur-byten, AI-beslut, game over-kontroller

### Klient-sida debug-loggning
- `console.log` för alla `game_state_update` och `turn_result` events
- Visar `currentPlayer`, `isYou`, `gotCards`, `fishedSuccess`

### Dev-knappar i spelet
- **"⚙️ Dev: Lägg till AI"**: Lägger till ytterligare en AI (upp till 6 totalt)
- **"🤖🆚🤖 Dev: Kör AI vs AI"**: Tar bort den mänskliga spelaren, startar spelet med bara AI, användaren blir åskådare

---

## Arkitektur-förändringar

### GameEngine.js
- `removePlayer()`: I waiting-läge → markerar som frånkopplad
- `forceRemovePlayer()`: Tar bort spelaren helt
- `syncAIHand()`: Synkroniserar AI:ns hand
- `debugLog()`: Debug-loggningsmetod
- `addAI()`: Tillåter fler AI än maxPlayers (upp till 6 totalt)
- `canStart()`: Tillåter start med bara AI (minst 2 AI)
- `checkGameOver()`: Nya kriterier för game over
- `nextPlayer()`: Säkerhetsventil mot oändlig loop
- `makeAIMove()`: Kedjar AI-turer automatiskt

### RoomManager.js
- `leaveRoom(socketId, forceRemove)`: Hanterar soft/hard remove
- `reconnect()`: Uppdaterar hostSocketId
- `joinRoom()`: Sparar host-status vid återanslutning

### server.js
- `disconnect`-hanterare: Timeout-baserad borttagning
- `dev_ai_vs_ai`-event: Startar AI vs AI-läge
- `add_ai`-hanterare: Tillåter fler AI

### game.js (klient)
- Event-lyssnare för `add_ai_dev_btn` och `ai_vs_ai_dev_btn`
- Debug-loggning för alla events

---

## Kvarstående problem / TODO

1. **WebSocket "suspension" i Safari**: Socket.IO hanterar detta via fallback, men det kan vara långsamt.
2. **Cleanup av gamla rum**: Rum med bara frånkopplade spelare tas bort efter 5 minuter, men detta kan vara för långt.
3. **AI-strategi**: AI:n gör ibland ogiltiga drag (frågar om kort den inte har). Root cause: Hand-synkronisering kan fortfarande ha edge cases.
4. **Spelets slut**: När spelet är slut i AI vs AI-läge, visas fortfarande "väntar på din tur" i UI:t (eftersom åskådaren inte får korrekt game_over-state).
5. **Turn timeout**: När en spelare har 0 kort och leken är tom, går timern fortfarande ut efter 45 sekunder istället för att spelet slutar direkt.

---

## Filändringar

### Modifierade filer:
- `server/game/GameEngine.js` - Omfattande ändringar
- `server/game/RoomManager.js` - leaveRoom, reconnect, joinRoom
- `server/server.js` - disconnect, dev_ai_vs_ai, add_ai
- `public/js/game.js` - Dev-knappar, debug-loggning
- `public/js/app.js` - Rensar previousSocketId
- `public/js/socket-client.js` - reconnect_attempt
- `public/game.html` - Dev-knappar

### Skapade filer:
- `public/assets/images/ai-naive.png`
- `public/assets/images/ai-smart.png`
- `public/assets/images/ai-master.png`
- `public/assets/images/ai-expert.png`
- `game-debug.log` (runtime)
- `server.log` (runtime)
- `DEBUGGING_LOG.md` (denna fil)

---

## Nyckelinsikter

1. **Socket.IO disconnect vid sidomladdning**: När en webbsida navigerar till en annan sida, stängs alla WebSocket-anslutningar. Detta måste hanteras genom att antingen:
   - Vänta med borttagning av spelaren (timeout)
   - Markera som frånkopplad istället för att ta bort
   - Tillåta återanslutning med samma namn

2. **AI vs AI**: För att två AI ska spela mot varandra måste:
   - `makeAIMove` kedja till nästa AI automatiskt
   - Events skickas till spectators/åskådare
   - Spelet kunna starta utan mänsklig spelare

3. **Event-ordering**: `turn_result` och `game_state_update` måste skickas i rätt ordning och till alla mottagare (spelare + spectators).

4. **Game over-logik**: `checkGameOver` måste hantera edge cases som "leken är tom men inte alla händer är tomma".

---

*Logg skapad: 2026-05-06*
