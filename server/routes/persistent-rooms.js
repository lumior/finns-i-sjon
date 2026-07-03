const express = require('express');
const PersistentRoom = require('../models/PersistentRoom');
const router = express.Router();

// Lista inloggad användares egna persistenta rum
router.get('/', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Du måste vara inloggad' });
    }

    try {
        const rooms = await PersistentRoom.getByOwner(req.user.id);
        res.json({ rooms });
    } catch (err) {
        console.error('Failed to list persistent rooms:', err.message);
        res.status(500).json({ error: 'Kunde inte hämta sparade bord' });
    }
});

// Gör ett befintligt rum persistent (eller uppdatera inställningar)
router.post('/', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Du måste vara inloggad' });
    }

    const { roomId, roomName, gameType, maxPlayers, allowAI, turnTimer, spectatorMode, deckTheme, isPrivate } =
        req.body;
    if (!roomId) {
        return res.status(400).json({ error: 'roomId krävs' });
    }

    try {
        const existing = await PersistentRoom.getById(roomId.toUpperCase());
        if (existing) {
            if (existing.ownerUserId !== req.user.id) {
                return res.status(403).json({ error: 'Du äger inte detta rum' });
            }
            const updated = await PersistentRoom.update(roomId.toUpperCase(), {
                room_name: roomName,
                game_type: gameType,
                max_players: maxPlayers,
                allow_ai: allowAI,
                turn_timer: turnTimer,
                spectator_mode: spectatorMode,
                deck_theme: deckTheme,
                is_private: isPrivate
            });
            return res.json({ success: true, room: updated });
        }

        const created = await PersistentRoom.create({
            roomId: roomId.toUpperCase(),
            ownerUserId: req.user.id,
            roomName: roomName || `Bord ${roomId.toUpperCase()}`,
            gameType: gameType || 'standard',
            maxPlayers: maxPlayers || 6,
            allowAI: allowAI !== undefined ? allowAI : true,
            turnTimer: turnTimer !== undefined ? turnTimer : true,
            spectatorMode: spectatorMode !== undefined ? spectatorMode : true,
            deckTheme: deckTheme || 'standard',
            isPrivate: isPrivate || false
        });

        res.json({ success: true, room: created });
    } catch (err) {
        console.error('Failed to save persistent room:', err.message);
        res.status(500).json({ error: 'Kunde inte spara bordet' });
    }
});

// Ta bort ett persistent rum
router.delete('/:roomId', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Du måste vara inloggad' });
    }

    try {
        const result = await PersistentRoom.delete(req.params.roomId.toUpperCase(), req.user.id);
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to delete persistent room:', err.message);
        res.status(500).json({ error: 'Kunde inte ta bort bordet' });
    }
});

module.exports = router;
