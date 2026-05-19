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
const registerSocketHandlers = require('./sockets');

const app = express();
app.set('trust proxy', 1); // Krävs för korrekt rate limiting bakom Railway's proxy
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: true, methods: ['GET', 'POST'], credentials: true },
    pingTimeout: 60000,
    pingInterval: 10000 // Kortare ping för att hålla Android-anslutningar vid liv
});

const roomManager = new RoomManager();
const webRTC = new WebRTCSignaling(io, roomManager);
const PORT = process.env.PORT || 3000;

// JWT_SECRET måste vara satt — varna starkt om det saknas
if (!process.env.JWT_SECRET) {
    console.error('⚠️  VARNING: JWT_SECRET saknas i miljövariabler. Sätt ett starkt secret i .env för produktion!');
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
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
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
    max: 100
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

// Socket.IO
registerSocketHandlers(io, roomManager, {
    Game,
    User,
    db,
    ELO,
    escapeHtml
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('🎣 ==========================================');
    console.log('🎴  FINNS I SJÖN PRO - Top-Notch Edition');
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

module.exports = { app, server, io };
