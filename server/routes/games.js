const express = require('express');
const Game = require('../models/Game');

const router = express.Router();

router.get('/history', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Inte inloggad' });
    }

    try {
        const limit = parseInt(req.query.limit) || 20;
        const history = await Game.getUserHistory(req.user.id, limit);
        res.json(history);
    } catch {
        res.status(500).json({ error: 'Kunde inte hämta spelhistorik' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const game = await Game.getGameDetails(req.params.id);
        if (!game) {
            return res.status(404).json({ error: 'Spel hittades inte' });
        }
        res.json(game);
    } catch {
        res.status(500).json({ error: 'Kunde inte hämta speldetaljer' });
    }
});

module.exports = router;
