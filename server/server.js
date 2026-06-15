require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const RoomManager = require('./game/RoomManager');
const Auth = require('./auth/auth');
const User = require('./models/User');
const Game = require('./models/Game');
const ELO = require('./utils/elo');
const WebRTCSignaling = require('./webrtc/signaling');
const db = require('./config/database');
const { escapeHtml } = require('./utils/sanitize');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const gamesRoutes = require('./routes/games');
const createRoomRouter = require('./routes/rooms');
const statsRoutes = require('./routes/stats');
const adminRoutes = require('./routes/admin');
const friendsRoutes = require('./routes/friends');
const registerSocketHandlers = require('./sockets');

// Bestäm tillåtna CORS-origins. I produktion används FRONTEND_URL/RAILWAY_PUBLIC_DOMAIN/BASE_URL.
function getAllowedOrigins() {
    const origins = [];
    if (process.env.FRONTEND_URL) {
        origins.push(process.env.FRONTEND_URL);
    }
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        origins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    }
    if (process.env.BASE_URL) {
        origins.push(process.env.BASE_URL);
    }
    if (process.env.NODE_ENV !== 'production') {
        origins.push('http://localhost:3000', 'http://127.0.0.1:3000');
    }
    return origins.length > 0 ? origins : true;
}

const corsOrigin = getAllowedOrigins();

const app = express();
app.set('trust proxy', 1); // Krävs för korrekt rate limiting bakom Railway's proxy
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'], credentials: true },
    pingTimeout: 60000,
    pingInterval: 10000 // Kortare ping för att hålla Android-anslutningar vid liv
});

const roomManager = new RoomManager();
new WebRTCSignaling(io, roomManager);
const PORT = process.env.PORT || 3000;

// Debug: skriv ut miljövariabler för felsökning (maskerade)
console.log('🔧 Miljövariabler:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    DATABASE_URL: process.env.DATABASE_URL ? 'satt' : 'saknas',
    JWT_SECRET: process.env.JWT_SECRET ? 'satt' : 'SAKNAS',
    DB_PATH: process.env.DB_PATH
});

// JWT_SECRET måste vara satt — varna starkt om det saknas
if (!process.env.JWT_SECRET) {
    console.error('⚠️  VARNING: JWT_SECRET saknas i miljövariabler.');
    console.error('   Lokal utveckling: skapa .env med JWT_SECRET=<lång slumpmässig sträng>');
    console.error('   Railway: gå till Variables → New Variable → JWT_SECRET');
}

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", 'https://fonts.googleapis.com'],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                imgSrc: ["'self'", 'data:', 'blob:'],
                connectSrc: ["'self'", 'ws:', 'wss:'],
                upgradeInsecureRequests: null
            }
        }
    })
);
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public_html')));

// Separata rate limiters per endpoint-typ
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'För många försök. Försök igen senare.' }
});

const readLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 120
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    message: { error: 'För många förfrågningar. Vänta en stund och försök igen.' }
});

app.use('/api/auth/', authLimiter);
app.use('/api/rooms', readLimiter);
app.use('/api/users/online', readLimiter);
app.use('/api/stats/total-games', readLimiter);
app.use('/api/users/leaderboard', readLimiter);
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/', apiLimiter);

app.use(Auth.middleware());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/rooms', createRoomRouter(roomManager));
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/themes', require('./routes/themes'));
app.use('/api/friends', friendsRoutes);

// Publika teman — listar alla kortleksteman
app.get('/api/themes', (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const cardsDir = path.join(__dirname, '../public_html/assets/cards');

        if (!fs.existsSync(cardsDir)) {
            return res.json({ themes: [] });
        }

        const themes = [];
        const entries = fs.readdirSync(cardsDir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory() && entry.name !== 'README.md') {
                themes.push({
                    id: entry.name,
                    name: entry.name.charAt(0).toUpperCase() + entry.name.slice(1)
                });
            }
        }

        res.json({ themes: [{ id: 'standard', name: 'Standard' }, ...themes] });
    } catch (err) {
        console.error('Themes API error:', err);
        res.status(500).json({ error: 'Kunde inte läsa teman' });
    }
});

// Socket.IO
registerSocketHandlers(io, roomManager, {
    Game,
    User,
    db,
    ELO,
    escapeHtml
});

// Vänta på databasanslutning och återställ temafiler vid start (Railway ephemeral filesystem)
db.waitForConnection()
    .then(() => db.restoreThemeFiles())
    .then(() => {
        const Theme = require('./models/Theme');
        return Theme.seedFromFilesystem();
    })
    .catch(err => {
        console.error('Fel vid återställning av temafiler:', err.message);
    });

const httpServer = server.listen(PORT, '0.0.0.0', () => {
    console.log('🎣 ==========================================');
    console.log('🎴  FISK - Finns i sjön');
    console.log('🎣 ==========================================');
    console.log(`🌐 Server körs på port ${PORT}`);
    console.log(`📊 API: http://localhost:${PORT}/api`);
    console.log(`🎮 Spel: http://localhost:${PORT}`);
    console.log('');
    console.log('Funktioner:');
    console.log('  ✅ Realtidsmultiplayer (WebSocket)');
    console.log('  ✅ Användarkonton & JWT-auth');
    console.log('  ✅ ELO-rankningssystem');
    console.log('  ✅ 4 AI-svårighetsgrader');
    console.log('  ✅ Spectator-läge');
    console.log('  ✅ Chatt & spel-logg');
    console.log('  ✅ Turn-timer');
    console.log('  ✅ Privata rum med lösenord');
    console.log('  ✅ Achievements-system');
    console.log('  ✅ Spelhistorik & statistik');
    console.log('  ✅ Topplista & sökning');
    console.log('');
});

function gracefulShutdown(signal) {
    console.log(`\n${signal} mottaget. Stänger ner servern…`);
    httpServer.close(async () => {
        console.log('HTTP-server stängd.');
        io.close(() => {
            console.log('Socket.IO stängt.');
        });
        try {
            await db.close();
            console.log('Databasanslutning stängd.');
        } catch (err) {
            console.error('Fel vid stängning av databas:', err.message);
        }
        process.exit(0);
    });

    // Tvingad avstängning om graceful shutdown tar för lång tid
    setTimeout(() => {
        console.error('Tvingad avstängning efter timeout.');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, server, io };
