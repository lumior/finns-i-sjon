const express = require('express');
const User = require('../models/User');
const Game = require('../models/Game');

const router = express.Router();

router.get('/leaderboard', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const leaderboard = await User.getLeaderboard(limit);
        res.json(leaderboard);
    } catch {
        res.status(500).json({ error: 'Kunde inte hämta topplista' });
    }
});

router.get('/online', async (req, res) => {
    try {
        const users = await User.getOnlineUsers();
        res.json(users);
    } catch {
        res.status(500).json({ error: 'Kunde inte hämta online-användare' });
    }
});

router.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.length < 2) {
            return res.status(400).json({ error: 'Sökterm måste vara minst 2 tecken' });
        }
        const users = await User.searchUsers(query);
        res.json(users);
    } catch {
        res.status(500).json({ error: 'Sökning misslyckades' });
    }
});

router.get('/:id/profile', async (req, res) => {
    try {
        const profile = await User.getPublicProfile(req.params.id);
        if (!profile) {
            return res.status(404).json({ error: 'Användare hittades inte' });
        }

        const achievements = await User.getAchievements(req.params.id);
        const history = await Game.getUserHistory(req.params.id, 10);

        res.json({
            ...profile,
            achievements: achievements.map(a => ({
                type: a.achievement_type,
                unlockedAt: a.unlocked_at
            })),
            recentGames: history
        });
    } catch {
        res.status(500).json({ error: 'Kunde inte hämta profil' });
    }
});

module.exports = router;
