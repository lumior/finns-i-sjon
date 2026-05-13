const express = require('express');

function createRoomRouter(roomManager) {
    const router = express.Router();

    router.get('/', (req, res) => {
        res.json(roomManager.getPublicRoomList());
    });

    router.get('/:id', (req, res) => {
        const room = roomManager.rooms.get(req.params.id.toUpperCase());
        if (!room) {
            return res.status(404).json({ error: 'Rummet finns inte' });
        }

        res.json({
            roomId: req.params.id,
            name: room.name,
            state: room.game.state,
            playerCount: room.game.players.length,
            maxPlayers: room.game.settings.maxPlayers,
            isPrivate: room.isPrivate,
            hostName: room.game.players.find(p => p.socketId === room.hostSocketId)?.name
        });
    });

    return router;
}

module.exports = createRoomRouter;
