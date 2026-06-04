const express = require('express');
const crypto = require('crypto');
const Auth = require('../auth/auth');
const User = require('../models/User');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

const router = express.Router();

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function isEmailVerified(user) {
    // Bakåtkompatibilitet: användare som registrerades före verifiering
    // har email_verified = undefined/null, vilket vi tolkar som verifierade
    return user.email_verified !== 0;
}

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

        // Skicka verifieringsmail
        const verifyToken = generateToken();
        await User.createToken(userId, verifyToken, 'email_verify', 24);
        await sendVerificationEmail(email, verifyToken);

        res.status(201).json({
            token,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.display_name,
                elo: user.elo_rating,
                avatar: user.avatar_url,
                emailVerified: false
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
                gamesWon: user.games_won,
                emailVerified: isEmailVerified(user)
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
        achievements: achievements.map(a => a.achievement_type),
        emailVerified: isEmailVerified(profile)
    });
});

router.post('/logout', async (req, res) => {
    if (req.user) {
        await User.setOnlineStatus(req.user.id, false);
    }
    res.json({ success: true });
});

router.get('/verify-email/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const record = await User.findToken(token, 'email_verify');

        if (!record) {
            return res.status(400).json({ error: 'Ogiltig eller utgången verifieringslänk' });
        }

        await User.setEmailVerified(record.user_id, true);
        await User.markTokenUsed(token);

        res.json({ success: true, message: 'Din e-postadress är nu verifierad!' });
    } catch (error) {
        console.error('Verify email error:', error);
        res.status(500).json({ error: 'Kunde inte verifiera e-postadressen' });
    }
});

router.post('/resend-verification', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Du måste vara inloggad' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'Användare hittades inte' });
        }

        if (isEmailVerified(user)) {
            return res.status(400).json({ error: 'Din e-postadress är redan verifierad' });
        }

        await User.deleteUserTokens(user.id, 'email_verify');
        const token = generateToken();
        await User.createToken(user.id, token, 'email_verify', 24);
        await sendVerificationEmail(user.email, token);

        res.json({ success: true, message: 'Ny verifieringslänk skickad' });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ error: 'Kunde inte skicka verifieringslänk' });
    }
});

router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Ange en e-postadress' });
        }

        const user = await User.findByEmail(email.trim());
        if (!user) {
            // Säkerhetsmässigt: returnera alltid samma meddelande oavsett om e-post finns
            return res.json({ success: true, message: 'Om e-postadressen finns har ett återställningsmail skickats' });
        }

        await User.deleteUserTokens(user.id, 'password_reset');
        const token = generateToken();
        await User.createToken(user.id, token, 'password_reset', 1);
        await sendPasswordResetEmail(user.email, token);

        res.json({ success: true, message: 'Om e-postadressen finns har ett återställningsmail skickats' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Kunde inte skicka återställningslänk' });
    }
});

router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ error: 'Token och lösenord krävs' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Lösenord måste vara minst 6 tecken' });
        }

        const record = await User.findToken(token, 'password_reset');
        if (!record) {
            return res.status(400).json({ error: 'Ogiltig eller utgången återställningslänk' });
        }

        await User.updatePassword(record.user_id, password);
        await User.markTokenUsed(token);
        await User.deleteUserTokens(record.user_id, 'password_reset');

        res.json({ success: true, message: 'Ditt lösenord har uppdaterats' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Kunde inte uppdatera lösenordet' });
    }
});

module.exports = router;
