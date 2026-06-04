const express = require('express');
const Friendship = require('../models/Friendship');
const User = require('../models/User');

const router = express.Router();

function requireAuth(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Du måste vara inloggad' });
    }
    next();
}

router.get('/', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const [friends, pendingReceived, pendingSent] = await Promise.all([
            Friendship.getFriends(userId),
            Friendship.getPendingReceived(userId),
            Friendship.getPendingSent(userId)
        ]);

        res.json({ friends, pendingReceived, pendingSent });
    } catch (err) {
        console.error('Fel vid hämtning av vänner:', err);
        res.status(500).json({ error: 'Kunde inte hämta vänner' });
    }
});

router.post('/request', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { username, userId: friendIdInput } = req.body;

        let friendId = friendIdInput;

        if (!friendId && username) {
            const friend = await User.findByUsername(username.trim());
            if (!friend) {
                return res.status(404).json({ error: 'Användare hittades inte' });
            }
            friendId = friend.id;
        }

        if (!friendId) {
            return res.status(400).json({ error: 'Ange användarnamn eller användar-ID' });
        }

        const result = await Friendship.sendRequest(userId, parseInt(friendId, 10));
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Fel vid skickande av vänförfrågan:', err);
        res.status(500).json({ error: 'Kunde inte skicka vänförfrågan' });
    }
});

router.post('/accept/:requestId', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const requestId = parseInt(req.params.requestId, 10);

        if (!requestId) {
            return res.status(400).json({ error: 'Ogiltig förfrågan' });
        }

        const result = await Friendship.acceptRequest(requestId, userId);
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Fel vid acceptering av vänförfrågan:', err);
        res.status(500).json({ error: 'Kunde inte acceptera förfrågan' });
    }
});

router.post('/reject/:requestId', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const requestId = parseInt(req.params.requestId, 10);

        if (!requestId) {
            return res.status(400).json({ error: 'Ogiltig förfrågan' });
        }

        const result = await Friendship.rejectRequest(requestId, userId);
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Fel vid avböjande av vänförfrågan:', err);
        res.status(500).json({ error: 'Kunde inte avböja förfrågan' });
    }
});

router.delete('/:friendId', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const friendId = parseInt(req.params.friendId, 10);

        if (!friendId) {
            return res.status(400).json({ error: 'Ogiltigt vän-ID' });
        }

        await Friendship.removeFriend(userId, friendId);
        res.json({ success: true });
    } catch (err) {
        console.error('Fel vid borttagning av vän:', err);
        res.status(500).json({ error: 'Kunde inte ta bort vän' });
    }
});

module.exports = router;
