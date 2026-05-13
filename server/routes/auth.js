const express = require('express');
const Auth = require('../auth/auth');
const User = require('../models/User');

const router = express.Router();

router.post('/register', async (req, res) => {
    try {
        const { username, email, password, displayName } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Alla fält krävs' });
        }

        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: 'Användarnamn måste vara 3-20 tecken' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Lösenord måste vara minst 6 tecken' });
        }

        const existingUser = await User.findByUsername(username);
        if (existingUser) {
            return res.status(409).json({ error: 'Användarnamnet är upptaget' });
        }

        const existingEmail = await User.findByEmail(email);
        if (existingEmail) {
            return res.status(409).json({ error: 'E-postadressen är redan registrerad' });
        }

        const userId = await User.create(username, email, password, displayName);
        const user = await User.findById(userId);
        const token = Auth.generateToken(user);

        res.status(201).json({
            token,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.display_name,
                elo: user.elo_rating,
                avatar: user.avatar_url
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registrering misslyckades' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findByUsername(username);
        if (!user) {
            return res.status(401).json({ error: 'Felaktigt användarnamn eller lösenord' });
        }

        const validPassword = await User.validatePassword(user, password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Felaktigt användarnamn eller lösenord' });
        }

        await User.setOnlineStatus(user.id, true);
        const token = Auth.generateToken(user);

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.display_name,
                elo: user.elo_rating,
                avatar: user.avatar_url,
                gamesPlayed: user.games_played,
                gamesWon: user.games_won
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Inloggning misslyckades' });
    }
});

router.get('/me', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Inte inloggad' });
    }

    const profile = await User.getPublicProfile(req.user.id);
    const achievements = await User.getAchievements(req.user.id);

    res.json({
        ...profile,
        achievements: achievements.map(a => a.achievement_type)
    });
});

router.post('/logout', async (req, res) => {
    if (req.user) {
        await User.setOnlineStatus(req.user.id, false);
    }
    res.json({ success: true });
});

module.exports = router;
