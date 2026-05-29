# CHANGELOG

## 2026-05-28 — Sprint 1–4: Buggfixar, kodkvalitet, tillgänglighet och säkerhet

### 🐛 Buggfixar (Sprint 1)

- **`public_html/js/game.js`**
  - Fixade `ReferenceError: deckToggle is not defined` som krashade skriptet för icke-värdar i multiplayer-rum.

- **`public_html/js/socket-client.js`**
  - Fixade ackumulerande event handlers vid reconnect. Tidigare lades nya Socket.IO-handlers till vid varje reconnect utan att gamla togs bort, vilket gav flera callbacks per event efter upprepad reconnect.
  - Införde `forwardedHandlers` (Map) som sparar referenser till varje socket-handler för korrekt `socket.off()` vid reattach.

- **`server/sockets/game-end.js`**
  - Fixade `isFirstWin`-buggen: `player.gamesPlayed === 0` kontrollerades på `standings`-objektet från `GameEngine`, som saknar egenskapen `gamesPlayed`. Achievement "Första segern" delades därför aldrig ut.
  - Hämtar nu användarens `games_played` från databasen före `updateStats()`.
  - Tog bort onödigt anrop `game.getGameData()` vars resultat ignorerades.

- **`server/game/GameEngine.js`**
  - Fixade `checkGameOver()` som felaktigt avslutade spelet när leken var tom och *någon* spelare hade 0 kort. Spelet avslutas nu korrekt endast när alla händer är tomma och leken är tom, eller när färre än 2 aktiva spelare återstår.

- **`public_html/js/app.js`**
  - Fixade dubbel submit i join-modal. Både formulärets `submit`-event och knappens `click`-event triggade `confirmJoinRoom()`, vilket gjorde att funktionen anropades två gånger.

### 🔧 Kodkvalitet & DRY (Sprint 2)

- **`server/sockets/handlers.js`**
  - Skapade intern helper-funktion `broadcastToRoom(game, event, basePayload, includeGameState)`.
  - Ersatte 5 duplicerade broadcast-mönster (summa ~50 rader) med enradare:
    - `start_game`, `ask_cards` (AI-resultat), `respond_to_ask`, `surrender`, `disconnect` (auto-resolve).
  - Lade till try-catch runt chat-achievement-flödet så att databasfel inte sväljs tyst.

- **`server/game/GameEngine.js`**
  - Extraherade gemensam logik från `askForCards()` och `respondToAsk()` till två privata metoder:
    - `_processAskSuccess(asker, target, rank, matchingCards)` — hanterar kortöverföring, par-bildning, achievements och gameOver.
    - `_processAskFish(asker, target, rank)` — hanterar fiskning, kortdragning, lucky fish, tur-övergång.
  - `askForCards` gick från ~160 rader till ~60 rader.
  - `respondToAsk` gick från ~150 rader till ~50 rader.
  - Fixade `filterChat()` så att svordomar censureras med word boundaries. Tidigare blev t.ex. `"fantastisk"` → `"f***tastisk"`. Använder nu regex med explicit svenskt teckenstöd.

- **`public_html/js/game.js`**
  - Ersatte individuella `addEventListener` på matchande kort vid `pendingCardRequest` med **event delegation** på `player-hand`-containern.
  - Ersatte `onclick`-direktilldelningar i `showCardRequest` med registrerade event listeners i `setupUI()`.

- **`server/sockets/game-end.js`**
  - Parallelliserade ELO/deltagare-loop och stats/achievements-loop med `Promise.all()`, vilket ger väsentligt snabbare sparande vid flera mänskliga spelare.

### ♿ Tillgänglighet & Prestanda (Sprint 3)

- **Viewport-meta** — `index.html`, `game.html`, `leaderboard.html`
  - Tog bort `maximum-scale=1.0, user-scalable=no` som bröt WCAG 1.4.4 (Resize text).

- **`game.html`**
  - Lade till `defer` på alla 9 script-taggar. Sidan renderas nu omedelbart utan att blockera på script-laddning.

- **CSS — `prefers-reduced-motion`**
  - **`animations.css`**: Generell regel som sätter alla animationer och transitions till `0.01ms` för användare som föredrar reducerad rörelse.
  - **`main.css`**: Döljer `particle-bg`, stoppar `float-card` och `hero-card`.
  - **`game.css`**: Stoppar `timer-progress`, `thinking-dots`, `card-request-highlight` och `pair-cards-popup`.

- **ARIA-attribut**
  - **8 modaler** fick `role="dialog"`, `aria-modal="true"` och `aria-labelledby` (pekar på rubrikens ID).
  - Rubriker i modaler fick korresponderande `id` (t.ex. `id="login-modal-title"`).
  - Stäng-knappar (`×`) fick `aria-label="Stäng"`.
  - `toggle-chat`-knappen fick `title` och `aria-label="Minimera chatt"`.

- **`game.css`**
  - Fixade saknade CSS-variabler i `.rules-modal-content`: `--surface` → `--bg-secondary`, `--border` → `--border-color`.
  - Tog bort ogiltigt `gap: -20px` (ersatt med kommentar; margin-left på korten används istället).

### 🛡️ Testning & Säkerhet (Sprint 4)

- **Tester**
  - **`tests/game/GameEngine.test.js`**: +4 nya tester för `askForCards` (validering, framgång, fisk) och `surrender`.
  - **`tests/game/RoomManager.test.js`**: Ny testfil med 15 tester för `createRoom`, `joinRoom`, `leaveRoom`, `kickPlayer`, `reconnect`, `getPublicRoomList`.
  - Totalt: **31 → 50 tester** (+61 %).

- **`jest.config.js`**
  - Lade till `coverageThreshold` för att förhindra att täckningen sjunker obemärkt:
    - `branches: 25`, `functions: 30`, `lines: 30`, `statements: 30`.

- **`package.json`**
  - Uppgraderade `sqlite3` från `^5.1.6` till `^6.0.1` för att åtgärda kända säkerhetssårbarheter.

- **`.github/workflows/ci.yml`**
  - Lade till steg `Run security audit` som kör `npm audit --audit-level=moderate` med `continue-on-error: true`.

- **`server/auth/auth.js`**
  - Lade till hårt krav: om `NODE_ENV === 'production'` och `JWT_SECRET` saknas, kastas ett fel och servern **avbryter uppstarten**.
  - Tidigare fallbackade den till `'default-secret-change-me'`, vilket i praktiken innebar obefintligt auth-skydd.

## 2026-05-28 — Admin: Fas 1 av kortrendering (pip-mönster, face cards, mönsterbakgrunder)

### 🎨 Nytt kortrenderingssystem i `public_html/admin/admin.js`

Helt omskriven Canvas-rendering för kortleksgeneratorn. Tidigare visade alla kort en stor emoji i mitten utan skillnad mellan valörer. Nu:

- **Pip-mönster för 2–10**: Varje valör får ett klassiskt spelkortsmönster med pipar (emoji-symboler) placerade enligt standardspelkortsgeometri — 2, 3, 4, 5, 6, 7, 8, 9, 10 har alla unika positioner med korrekt rotation för nedre halvan.
- **Differentierade face cards (J, Q, K, A)**:
  - **Ess (A)**: Krona 👑 + "ESS" + färgsymbol
  - **Knekt (J)**: Svärd ⚔️ + "KNEKT" + "Riddare"
  - **Dam (Q)**: Krona 👑 + "DAM" + "Drottning"
  - **Kung (K)**: Krona 👑 + "KUNG" + "Konung"
  - Dekorativ banner-bakgrund bakom titeln
- **Corner rank med färgsymbol**: Övre vänster och nedre höger visar nu både valör och färgsymbol (♥️ ♦️ ♣️ ♠️), roterad 180° i nedre hörnet.
- **Rundade hörn**: Alla kort renderas nu med `border-radius: 24px` via Canvas `clip()`.
- **Förbättrad ram**: Dubbel ram — yttre guld-liknande linje + inre accent-linje + hörn-ornament.
- **Mönsterbakgrunder** (5 varianter, väljs per färg):
  - `dots` — prickar i rutnät
  - `grid` — linjer
  - `diamonds` — diamanter i offset-rader
  - `waves` — sinuskurvor
  - `stars` — stjärnliknande punkter
- **Förbättrad gradient**: Radialgradient får nu en mörkare ytterkant (`darkenColor()`) för mer djup.
- **Refaktorerad arkitektur**: Rendering uppdelad i dedikerade funktioner: `renderCardBackground()`, `renderPattern()`, `renderCardBorder()`, `renderCornerRank()`, `renderPips()`, `renderFaceCard()`, `renderCenterImage()`, `renderCenterEmoji()`, `drawRoundedRect()`.

## 2026-05-28 — Admin: Fas 2–4 (face card-ramar, templates, effekter)

### 🎭 Fas 2: Unika face card-ramar och färgaccenter

- **`renderFaceCard()`** — total omskrivning med 4 unika ramstilar:
  - **Ess (A)** = `elegant`: Dubbel rundad ram med guld-liknande accent-prickar i hörnen
  - **Knekt (J)** = `angular`: Spetsig ram med sneda hörn (pilform)
  - **Dam (Q)** = `round`: Oval ram med prick-kedja runt kanten
  - **Kung (K)** = `royal`: Tjock kunglig ram med ♛-symboler i hörnen
- **Färgaccenter per färg** (`SUIT_ACCENTS`): Hjärter = rött, Ruter = blått, Klöver = grönt, Spader = lila. Används i banners, ramar och skuggor.
- **Förbättrad banner**: Gradient med accent-färg + horisontella linjer ovanför och under.
- **Dubbla kronor**: Ess och Dam får 👑👑, Knekt får ⚔️🛡️, Kung får 👑⚜️.
- **Färgsymboler under titeln**: Två små suit-symboler under subtitle.

### 🏗️ Fas 3: Mallar (templates)

- **5 förinställda mallar** i `public_html/admin/admin.js`:
  | Mall | Innehåll |
  |------|----------|
  | **Frukt** | 🍎🍊🍇🍓🍑🍒🍍🥝🍋🍉🥭🍐🍌 |
  | **Grönsaker** | 🥕🥦🌽🍆🧅🥬🫑🥒🍄🧄🌶️🫛🥔 |
  | **Djur** | 🦁🦊🐻🐼🐨🐯🐷🐸🐙🦉🦅🦋🐺 |
  | **Fordon** | 🚗🚕🚌🚓🚑🚒🚜🚲🛵🚁🚂✈️🚀 |
  | **Sport** | ⚽🏀🏈⚾🎾🏐🏉🎱🏓🏸🥊⛳🏆 |
- **UI**: Dropdown + "Applicera"-knapp i creator-form. Mallen fyller alla 52 kort (13 valörer × 4 färger) med emojis.
- **`applyTemplate()`**: Tömmer befintlig data, fyller `rankData` och `cardData`, synkar alla input-fält och previewer.

### ✨ Fas 4: Effekter

- **`renderGloss()`** — Diagonal glans-linje (`overlay` composite) som ger en subtil metallic-känsla över kortet.
- **`renderTexture()`** — Linen-textur: ett rutnät av tunna vita linjer med 3 % opacitet.
- **`renderVignette()`** — Radial gradient som mörkar kanterna och drar ögat mot mittens innehåll.
- **`renderDropShadow()`** — Skugga under kortet (blur: 24px, offsetY: 12px) som ger 3D-känsla.
- **`hexToRgba()`** — Ny helper för att konvertera HEX till RGBA med alpha-kanal.

## 2026-05-28 — Admin: Fas 5–7 (live preview, kortbaksida, import/export)

### 👁️ Fas 5: Live real-time preview

- **Synlig preview-canvas** (`#live-preview-canvas`) ovanför editorn som visar det aktuella kortet i realtid.
- **Auto-utlösning**: När man ändrar en emoji, bild, färg, gradient eller mönster renderas kortet om automatiskt med 80 ms throttle.
- **Kontextuell**: Klick på ett kort i simple editor → preview visar det kortet i alla 4 färger (börjar med hjärter). Klick på ett kort i advanced editor → preview visar just det kortet. Byte av färg-tab → preview växlar till första ifyllda kortet i den färgen.
- **UI**: Label under canvas visar "A ♥️ Hjärter" etc.

### 🃏 Fas 6: Kortbaksida (card back)

- **Ny sektion** i creator-form med fälten:
  - **Bakgrundsfärg** — valfri färg
  - **Mönster** — 5 varianter: Inget, Prickar, Korsrutigt, Ringar, Diagonala linjer
  - **Center-symbol** — emoji som visas i mitten
- **`renderCardBackToCanvas()`** — dedikerad renderingsfunktion som ritar:
  - Rundade hörn med clip
  - Bakgrundsfärg + mönster
  - Dubbel ram med vita linjer
  - Center-symbol med skugga
  - Hörn-ornament (4 prickar)
  - Linen-textur och vignette (återanvänder befintliga effekter)
- **Inkluderas i ZIP-export**: `back.png` läggs i roten av ZIP-filen bredvid de 4 färg-mapparna.

### 💾 Fas 7: Import/export av kortlekskonfiguration

- **"Spara konfiguration (JSON)"** — exporterar allt arbete till en `.json`-fil:
  - `themeName`, `cardData`, `rankData`, `suitSettings`, `backSettings`
  - JSON är pretty-printed för läsbarhet
- **"Ladda konfiguration"** — fil-input som läser JSON och återställer:
  - Alla kortdata (simple + advanced)
  - Färginställningar per färg
  - Kortbaksidesinställningar
  - Tema-namn
  - Alla UI-inputs synkas automatiskt
- **Felhantering**: Ogiltig JSON eller saknade fält ger tydligt felmeddelande via `showToast()`.

## 2026-05-28 — Admin: Symbol-läge (dölj valörer)

### 🎴 Symbol-läge — inga spelkortsvärden synliga

- **Ny toggle** i creator-form: "🎴 Symbol-läge — visa endast bilder/emojis, inga valörer"
- När aktiverat (`symbolMode = true`):
  - **Inga corner ranks** — inga A/2/3/J/Q/K i hörnen
  - **Inga face cards** — inga "ESS"/"KNEKT"-titlar, inga kronor, inga unika ramar
  - **Inga pip-mönster** — ingen 7-prickar-layout etc.
  - **Alla 52 kort ser likadana ut**: endast center emoji/bild (200px för emoji, 260px för bild)
  - Live preview-labeln visar bara färg, t.ex. "♥️ Hjärter" istället för "A ♥️ Hjärter"
- **Användningsfall**: Memory-spel, temakort för barn, eller rena bildkortlekar där man bara matchar symboler utan koppling till traditionella spelkort.
- **Export/import**: `symbolMode` sparas och läses in med JSON-konfigurationen.

## 2026-05-28 — Admin: Fas 8–9 (bakgrundsbilder, batch-åtgärder, validering)

### 🖼️ Fas 8: Bakgrundsbilder per färg

- **Uppladdningsbar bakgrundsbild** per färg i advanced-läget:
  - File-input + "❌"-knapp för att ta bort bilden
  - Bilden ritas som `object-fit: cover` över hela kortet
  - Gradient/färg läggs ovanpå med 75% opacitet så färgkänslan bevaras
  - Mönster och effekter (textur, vignette) ritas ovanpå som vanligt
- **`renderCardBackground()`** är nu `async` och anropar `renderBgImage()` vid behov.
- **`renderBgImage()`** — laddar bild via `Image()` och ritar med cover-skala.
- **`bgImage`** läggs till i `suitSettings` per färg.

### 🎲 Fas 9: Batch-åtgärder och validering

- **Statistik-ruta**: Visar "X/52 kort ifyllda" med färgkodning:
  - 🟢 Grönt när alla 52 är klara
  - 🔴 Rött när inga är ifyllda
  - 🟠 Orange för allt däremellan
- **"🎲 Fyll tomma med slumpade emojis"**:
  - Fyller alla tomma kort med unika emojis från en pool på 117 symboler (frukt, grönsaker, djur, fordon, sport, natur, väder)
  - Undviker dubletter om möjligt
  - Uppdaterar både simple och advanced UI
- **"🗑️ Rensa alla kort"**:
  - Tömmer all data med `confirm()`-dialog
  - Rensar alla input-fält och previewer
- **Validering före export**:
  - Om 0/52 kort → felmeddelande, export stoppas
  Om < 52/52 kort → `confirm()`-dialog: "Endast X/52 kort är ifyllda. Vill du fortsätta ändå?"
  - Full kortlek → export går direkt igenom
- **`updateBatchStats()`** anropas automatiskt vid varje ändring, mall-applicering, import och init.

## 2026-05-28 — Admin: Fas 10 — Speltestare (playtest / mini-spel)

### 🎮 Speltestare — se kortleken i ett riktigt spel

- **Mini-spelvy** i admin-panelen med ett virtuellt bord:
  - **Korthög** (deck pile) — visar kortbaksidan, klicka för att dra kort
  - **Hand** — visar dragna kort i en överlappande rad (som i ett riktigt kortspel)
  - **Flip** — klicka på ett kort i handen för att vända det (framsida ↔ baksida)
- **3D CSS-transform** på korten:
  - `rotateY(180deg)` vid flip med `transform-style: preserve-3d`
  - `backface-visibility: hidden` på båda sidor
  - Snygg `cubic-bezier` animation vid drag
- **Kontroller**:
  - **"🃏 Dra kort"** — tar översta kortet från leken, visar med deal-animation
  - **"🔀 Blanda lek"** — genererar alla 52 kort som dataURLs, blandar dem slumpmässigt
  - **"🗑️ Kasta hand"** — lägger tillbaka handen i leken
- **Status-text** visar vad som händer: "Drog: 7 ♥️. 51 kort kvar i leken."
- **Räknare** på korthögen visar antal kort kvar.
- Generering av 52 kort sker asynkront vid första "Blanda lek" eller första kortdraget.
- Baksidan renderas dynamiskt från kortbaksidesinställningarna.

## 2026-05-28 — Admin: Fas 11 — Undo/Redo + Auto-spara

### ↩️ Undo/Redo med historik

- **Historik-stack** som sparar snapshots av hela state (max 50 steg):
  - `cardData`, `rankData`, `suitSettings`, `backSettings`, `symbolMode`, `themeName`
- **Debounced inspelning**: Ändringar sparas till historiken 600ms efter att användaren slutat ändra (undviker att varje tangenttryck blir ett steg).
- **Event delegation**: Alla `input`/`change` inom creator-tab fångas automatiskt.
- **Knappar**: "↩️ Ångra" och "↪️ Gör om" i historik-baren ovanför editorn.
- **Keyboard shortcuts**:
  - `Ctrl+Z` — Ångra
  - `Ctrl+Y` eller `Ctrl+Shift+Z` — Gör om
- **`restoreState()`** — återställer allt state och synkar alla UI-element (simple + advanced inputs, previewer, settings, symbolMode, etc.).

### 💾 Auto-spara till localStorage

- **Sparar automatiskt** var 10:e sekund till `localStorage`.
- **Status-indikator** visar "Sparad" i historik-baren.
- **Vid sidladdning**: Om ett utkast finns frågar en `confirm()`-dialog:
  - "Det finns ett osparat utkast från för X min sedan. Vill du återställa det?"
  - Vid "Ja": återställs allt state och historiken nollställs med utkastet som bas.
  - Vid "Nej": auto-sparad data rensas.
- **`clearAutoSave()`** — rensar localStorage (anropas vid lyckad export eller när användaren väljer att inte återställa).

## 2026-05-28 — Admin: Fas 12 — Mass-uppladdning av bilder (drag & drop)

### 🖼️ Drag & drop för flera bilder

- **Drop-zone** i creator-form med tydlig visuell feedback:
  - Standard: dashed border med grönaktig bakgrund
  - Hover: starkare färg
  - Drag-over: solid border + scale(1.01)
- **Klicka för att välja** — fungerar också som fil-input
- **Stödjer 1–52 bilder** med smart auto-fördelning:

| Antal bilder | Fördelning |
|-------------|------------|
| **52** | 1 bild per kort (A→K i Hjärter, Ruter, Klöver, Spader) |
| **13** | 1 bild per valör (alla 4 färger får samma bild för samma valör) |
| **4** | 1 bild per färg (alla 13 valörer i samma färg får samma bild) |
| **1** | Samma bild för alla 52 kort |
| **>52** | Använder första 52 |
| **>13** | Använder första 13 |
| **>4** | Använder första 4 |

- **Preview-modal** visar alla 52 kort med deras tilldelade bilder innan confirm:
  - Grid med 70px-kort och label under varje
  - "Avbryt" / "Applicera"-knappar
  - Klicka utanför modal för att stänga
- **`applyBulkImages()`** — applicerar bilderna, synkar simple mode, uppdaterar previewer, batch-stats, historik och live preview.
