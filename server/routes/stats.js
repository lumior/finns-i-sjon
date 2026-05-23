const express = require('express');
const Game = require('../models/Game');

const router = express.Router();

router.get('/total-games', async (req, res) => {
    try {
        const count = await Game.getTotalCount();
        res.json({ count });
    } catch {
        res.status(500).json({ error: 'Kunde inte hämta statistik' });
    }
});

module.exports = router;
