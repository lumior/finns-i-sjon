# Bugfix: Mobil-spelare kastas över till åskådare vid reconnect

**Datum:** 2026-05-13  
**Status:** ✅ Åtgärdad

---

## Problem

När en spelare spelade på mobil och anslutningen tappades (t.ex. skärmlås, app i bakgrund, nätverksbyte) reconnectade Socket.IO automatiskt, men spelaren kastades plötsligt över till att vara **åskådare** mitt i pågående spel.

## Rotorsak

**Race condition mellan `reconnect_attempt` och `join_room`.**

När socket tappade anslutning och reconnectade med ett nytt socket-id skickade klienten båda eventen samtidigt:

1. Servern hanterade `reconnect_attempt` först → spelaren återanslöts korrekt (`connected = true`, nytt `socketId`).
2. Servern hanterade sedan `join_room` → såg att spelaren redan fanns och var ansluten (`!p.connected` matchade inte). Eftersom spelet pågår och `spectatorMode` är aktiverat, blev spelaren automatiskt **åskådare**.

### Berörda filer (före fix)

- `public_html/js/socket-client.js` — skickade `connected`-event utan att markera om det var reconnect.
- `public_html/js/game.js` — skickade alltid `join_room` vid `connected`, även vid reconnect.
- `server/sockets/handlers.js` — svarade inte med något vid misslyckad `reconnect_attempt`.

---

## Lösning

### 1. `public_html/js/socket-client.js`

`connected`-eventet skickar nu med flaggan `isReconnect: true` när det är en återanslutning (dvs. det finns ett tidigare `socketId` i `localStorage`).

```javascript
const isReconnect = oldSocketId && currentRoom && oldSocketId !== this.socket.id;
// ...
this.trigger('connected', { socketId: this.socket.id, isReconnect });
```

### 2. `public_html/js/game.js`

Vid `connected` med `isReconnect === true`:
- Skicka **inte** `join_room` direkt.
- Sätt en fallback-timeout på 3 sekunder.
- Om `reconnected` kommer från servern → avbryt timeouten, spelaren är tillbaka.
- Om `reconnect_failed` kommer → avbryt timeouten och skicka `join_room`.
- Om inget svar kommer inom 3 sekunder → skicka `join_room` som fallback.

```javascript
gameSocket.on('connected', (data) => {
    if (data?.isReconnect) {
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            this.joinRoom();
        }, 3000);
    } else {
        this.joinRoom();
    }
});

gameSocket.on('reconnected', (data) => {
    if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
    }
    this.handleReconnection(data);
});

gameSocket.on('reconnect_failed', () => {
    if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
    }
    this.joinRoom();
});
```

### 3. `server/sockets/handlers.js`

Servern skickar nu explicit `reconnect_failed` till klienten om `reconnect_attempt` misslyckas (t.ex. spelaren togs bort efter timeout).

```javascript
socket.on('reconnect_attempt', data => {
    // ...
    if (result) {
        // ... återanslutning lyckades
    } else {
        socket.emit('reconnect_failed');
    }
});
```

---

## Testning

För att verifiera fixen på mobil:

1. Gå med i ett pågående spel på mobil.
2. Lås skärmen i några sekunder eller byt till en annan app.
3. Lås upp / gå tillbaka till webbläsaren.
4. **Förväntat resultat:** Du återansluter som spelare med dina kort intakta.
5. **Före fix:** Du kastades över till åskådare med meddelandet "Du tittar på som åskådare".

---

## Relaterade filer

- `server/game/RoomManager.js` — `joinRoom()` logik som gjorde återanslutna spelare till åskådare.
- `server/game/GameEngine.js` — `reconnectPlayer()` hanterar själva återanslutningen av spelardata.
