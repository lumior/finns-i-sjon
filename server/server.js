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
const { GAME_STATES, AI_DIFFICULTIES } = require('./utils/constants');
const WebRTCSignaling = require('./webrtc/signaling');
const { escapeHtml } = require('./utils/sanitize');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: true, methods: ["GET", "POST"], credentials: true },
    pingTimeout: 60000,
    pingInterval: 25000
});

const roomManager = new RoomManager();
const webRTC = new WebRTCSignaling(io, roomManager);
const PORT = process.env.PORT || 3000;

// JWT_SECRET måste vara satt — varna starkt om det saknas
if (!process.env.JWT_SECRET) {
    console.error('⚠️  VARNING: JWT_SECRET saknas i miljövariabler. Sätt ett starkt secret i .env för produktion!');
}

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://fonts.googleapis.com"],
            scriptSrcAttr: ["'unsafe-inline'"], // Tillåt inline event handlers (onerror på img-taggar)
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            upgradeInsecureRequests: null // disable — breaks localhost HTTP
        }
    }
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public_html')));

const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    skip: (req) => req.method === 'GET' && (req.path === '/rooms' || req.path === '/users/online' || req.path === '/stats/total-games')
});
app.use('/api/', limiter);

app.use(Auth.middleware());

// ===== AUTH ENDPOINTS =====

app.post('/api/auth/register', async (req, res) => {
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

app.post('/api/auth/login', async (req, res) => {
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

app.get('/api/auth/me', async (req, res) => {
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

app.post('/api/auth/logout', async (req, res) => {
    if (req.user) {
        await User.setOnlineStatus(req.user.id, false);
    }
    res.json({ success: true });
});

// ===== USER ENDPOINTS =====

app.get('/api/users/leaderboard', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const leaderboard = await User.getLeaderboard(limit);
        res.json(leaderboard);
    } catch (error) {
        res.status(500).json({ error: 'Kunde inte hämta topplista' });
    }
});

app.get('/api/stats/total-games', async (req, res) => {
    try {
        const count = await Game.getTotalCount();
        res.json({ count });
    } catch (error) {
        res.status(500).json({ error: 'Kunde inte hämta statistik' });
    }
});

app.get('/api/users/online', async (req, res) => {
    try {
        const users = await User.getOnlineUsers();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Kunde inte hämta online-användare' });
    }
});

app.get('/api/users/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.length < 2) {
            return res.status(400).json({ error: 'Sökterm måste vara minst 2 tecken' });
        }
        const users = await User.searchUsers(query);
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Sökning misslyckades' });
    }
});

app.get('/api/users/:id/profile', async (req, res) => {
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
    } catch (error) {
        res.status(500).json({ error: 'Kunde inte hämta profil' });
    }
});

// ===== GAME ENDPOINTS =====

app.get('/api/games/history', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Inte inloggad' });
    }
    
    try {
        const limit = parseInt(req.query.limit) || 20;
        const history = await Game.getUserHistory(req.user.id, limit);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Kunde inte hämta spelhistorik' });
    }
});

app.get('/api/games/:id', async (req, res) => {
    try {
        const game = await Game.getGameDetails(req.params.id);
        if (!game) {
            return res.status(404).json({ error: 'Spel hittades inte' });
        }
        res.json(game);
    } catch (error) {
        res.status(500).json({ error: 'Kunde inte hämta speldetaljer' });
    }
});

// ===== ROOM ENDPOINTS =====

app.get('/api/rooms', (req, res) => {
    res.json(roomManager.getPublicRoomList());
});

app.get('/api/rooms/:id', (req, res) => {
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
        gameType: room.game.gameType,
        hasPassword: !!room.password,
        hostName: room.game.players[0]?.name
    });
});

// ===== SOCKET.IO =====

io.use(Auth.socketAuth);

io.on('connection', (socket) => {
    console.log(`🔌 Anslutning: ${socket.id} ${socket.user ? `(${socket.user.username})` : '(gäst)'}`);

    if (socket.user) {
        User.setOnlineStatus(socket.user.id, true);
    }

    socket.on('reconnect_attempt', (data) => {
        const { oldSocketId } = data;
        const result = roomManager.reconnect(oldSocketId, socket.id, socket.user);
        
        if (result) {
            socket.join(result.roomId);
            socket.emit('reconnected', {
                roomId: result.roomId,
                gameState: result.game.getPublicState(socket.id),
                chatHistory: result.game.getChatHistory()
            });
            
            socket.to(result.roomId).emit('player_reconnected', {
                playerId: result.player.id,
                playerName: result.player.name
            });
            
            io.to(result.roomId).emit('game_state_update', 
                result.game.getPublicState(socket.id)
            );
        }
    });

    socket.on('create_room', async (data) => {
        console.log('🔍 SERVER create_room:', data?.playerName, 'socket:', socket.id);
        const { playerName, roomName, password, gameType, settings } = data;
        
        if (!playerName || playerName.trim().length < 2) {
            socket.emit('error', { message: 'Ange ett giltigt namn (minst 2 tecken)' });
            return;
        }

        const result = roomManager.createRoom(playerName.trim(), socket.id, {
            roomName: roomName?.trim(),
            password: password?.trim(),
            gameType: gameType || 'standard',
            ...settings
        });
        
        if (!result.success) {
            socket.emit('error', { message: result.error });
            return;
        }

        socket.join(result.roomId);
        
        socket.emit('room_created', {
            roomId: result.roomId,
            gameState: result.game.getPublicState(socket.id),
            isHost: true,
            settings: result.game.settings
        });
        
        io.emit('lobby_update', roomManager.getPublicRoomList());
    });

    socket.on('join_room', async (data) => {
        console.log('🔍 SERVER join_room:', data?.roomId, data?.playerName, 'socket:', socket.id);
        const { roomId, playerName, password } = data;
        
        if (!playerName || playerName.trim().length < 2) {
            socket.emit('error', { message: 'Ange ett giltigt namn' });
            return;
        }

        const userData = socket.user ? {
            id: socket.user.id,
            elo: socket.user.elo,
            avatar: socket.user.avatarUrl
        } : null;

        const result = roomManager.joinRoom(roomId, playerName.trim(), socket.id, password?.trim(), userData);
        
        if (!result.success) {
            socket.emit('error', { message: result.error });
            return;
        }

        socket.join(roomId);
        
        if (result.isSpectator) {
            socket.emit('spectator_joined', {
                roomId,
                gameState: result.game.getSpectatorState(),
                roomName: result.roomName
            });
            return;
        }

        const room = roomManager.getRoomBySocket(socket.id);
        socket.emit('room_joined', {
            roomId,
            gameState: result.game.getPublicState(socket.id),
            chatHistory: result.game.getChatHistory(),
            isHost: room ? room.hostSocketId === socket.id : false,
            settings: result.game.settings
        });

        socket.to(roomId).emit('player_joined', {
            playerName: playerName.trim(),
            playerCount: result.game.players.filter(p => !p.isAI).length,
            aiCount: result.game.aiPlayers.length
        });

        io.to(roomId).emit('game_state_update', 
            result.game.getPublicState(socket.id)
        );
        
        io.emit('lobby_update', roomManager.getPublicRoomList());
    });

    socket.on('add_ai', (data) => {
        console.log('🔍 SERVER add_ai:', data?.difficulty, 'socket:', socket.id);
        const { difficulty } = data;
        const room = roomManager.getRoomBySocket(socket.id);
        
        if (!room) {
            socket.emit('error', { message: 'Du är inte i ett rum' });
            return;
        }
        
        if (room.hostSocketId !== socket.id) {
            socket.emit('error', { message: 'Endast värden kan lägga till AI' });
            return;
        }
        
        const result = roomManager.addAIToRoom(room.game.roomId, difficulty);
        if (!result.success) {
            socket.emit('error', { message: result.error });
            return;
        }
        
        io.to(room.game.roomId).emit('ai_added', {
            player: result.player,
            gameState: room.game.getPublicState(socket.id)
        });
        
        io.emit('lobby_update', roomManager.getPublicRoomList());
    });

    socket.on('dev_ai_vs_ai', () => {
        const room = roomManager.getRoomBySocket(socket.id);
        if (!room) {
            socket.emit('error', { message: 'Du är inte i ett rum' });
            return;
        }
        
        if (room.hostSocketId !== socket.id) {
            socket.emit('error', { message: 'Endast värden kan starta AI vs AI' });
            return;
        }
        
        const game = room.game;
        
        // Lägg till en andra AI om det bara finns en
        if (game.aiPlayers.length < 2) {
            const result = roomManager.addAIToRoom(game.roomId, 'smart');
            if (!result.success) {
                socket.emit('error', { message: result.error });
                return;
            }
        }
        
        // Ta bort den mänskliga spelaren och gör till spectator
        const humanPlayer = game.players.find(p => !p.isAI);
        if (humanPlayer) {
            game.forceRemovePlayer(humanPlayer.socketId);
            roomManager.playerRooms.delete(humanPlayer.socketId);
            game.addSpectator(socket.id);
        }
        
        // Uppdatera host till första AI:n
        const firstAI = game.players.find(p => p.isAI);
        if (firstAI) {
            room.hostSocketId = firstAI.socketId;
        }
        
        // Starta spelet
        game.setIo(io);
        game.startGame();
        
        io.to(game.roomId).emit('game_started', {
            gameState: game.getPublicState(socket.id),
            firstPlayer: game.getCurrentPlayer()?.name
        });
        
        io.to(game.roomId).emit('game_state_update', 
            game.getPublicState(socket.id)
        );
        
        // Starta AI:tur direkt
        const currentPlayer = game.getCurrentPlayer();
        if (currentPlayer?.isAI) {
            setTimeout(() => game.makeAIMove(io), 1500);
        }
    });

    socket.on('remove_ai', (data) => {
        const { aiId } = data;
        const room = roomManager.getRoomBySocket(socket.id);
        
        if (!room || room.hostSocketId !== socket.id) {
            socket.emit('error', { message: 'Endast värden kan ta bort AI' });
            return;
        }
        
        const result = roomManager.removeAIFromRoom(room.game.roomId, aiId);
        if (result.success) {
            io.to(room.game.roomId).emit('ai_removed', { aiId });
            io.to(room.game.roomId).emit('game_state_update', 
                room.game.getPublicState(socket.id)
            );
        }
    });

    socket.on('start_game', () => {
        const room = roomManager.getRoomBySocket(socket.id);
        if (!room) return;
        
        if (room.hostSocketId !== socket.id) {
            socket.emit('error', { message: 'Endast värden kan starta spelet' });
            return;
        }

        const game = room.game;
        if (!game.canStart()) {
            socket.emit('error', { message: 'Minst 2 spelare krävs för att starta' });
            return;
        }

        game.setIo(io);
        game.startGame();
        
        game.players.forEach(player => {
            const state = game.getPublicState(player.socketId);
            io.to(player.socketId).emit('game_started', { gameState: state });
        });
        
        game.spectators.forEach(spectatorId => {
            io.to(spectatorId).emit('game_started', { 
                gameState: game.getSpectatorState() 
            });
        });
        
        const currentPlayer = game.getCurrentPlayer();
        if (currentPlayer && currentPlayer.isAI) {
            setTimeout(() => game.makeAIMove(io), 2000);
        }
    });

    socket.on('ask_cards', (data) => {
        const { targetId, rank } = data;
        const room = roomManager.getRoomBySocket(socket.id);
        if (!room) return;

        const game = room.game;
        
        // Kolla om target är AI — då används direktflödet
        const target = game.players.find(p => p.id === targetId || p.socketId === targetId);
        if (target?.isAI) {
            const result = game.askForCards(socket.id, targetId, rank);

            if (!result.success) {
                socket.emit('turn_result', {
                    ...result,
                    gameState: game.getPublicState(socket.id)
                });
                return;
            }

            if (result.gameOver) {
                handleGameEnd(game, room);
                return;
            }

            game.players.forEach(player => {
                if (player.connected) {
                    io.to(player.socketId).emit('turn_result', {
                        ...result,
                        gameState: game.getPublicState(player.socketId)
                    });
                }
            });
            
            game.spectators.forEach(spectatorId => {
                io.to(spectatorId).emit('turn_result', {
                    ...result,
                    gameState: game.getSpectatorState()
                });
            });

            const nextPlayer = game.getCurrentPlayer();
            if (nextPlayer && nextPlayer.isAI) {
                setTimeout(() => game.makeAIMove(io), 1500);
            }
            return;
        }
        
        // Mänsklig motståndare — nytt interaktivt flöde
        const result = game.requestAsk(socket.id, targetId, rank);
        
        if (!result.success) {
            socket.emit('turn_result', {
                ...result,
                gameState: game.getPublicState(socket.id)
            });
            return;
        }
        
        // Skicka till asker: bekräftelse att frågan skickats
        socket.emit('ask_pending', {
            targetName: result.targetName,
            rank: result.rank
        });
        
        // Skicka till target: du har blivit tillfrågad
        io.to(target.socketId).emit('card_request', {
            askerName: result.askerName,
            rank: result.rank
        });
    });
    
    socket.on('respond_to_ask', (data) => {
        const { hasCard, rank } = data;
        const room = roomManager.getRoomBySocket(socket.id);
        if (!room) return;
        
        const game = room.game;
        const result = game.respondToAsk(socket.id, hasCard, rank);
        
        if (!result.success) {
            socket.emit('turn_result', {
                ...result,
                gameState: game.getPublicState(socket.id)
            });
            return;
        }
        
        if (result.gameOver) {
            handleGameEnd(game, room);
            return;
        }
        
        game.players.forEach(player => {
            if (player.connected) {
                io.to(player.socketId).emit('turn_result', {
                    ...result,
                    gameState: game.getPublicState(player.socketId)
                });
            }
        });
        
        game.spectators.forEach(spectatorId => {
            io.to(spectatorId).emit('turn_result', {
                ...result,
                gameState: game.getSpectatorState()
            });
        });
        
        const nextPlayer = game.getCurrentPlayer();
        if (nextPlayer && nextPlayer.isAI) {
            setTimeout(() => game.makeAIMove(io), 1500);
        }
    });

    socket.on('chat_message', async (data) => {
        let { message } = data;
        const room = roomManager.getRoomBySocket(socket.id);
        if (!room) return;

        // XSS-sanering: escape HTML i chat-meddelanden
        message = escapeHtml(message);

        const game = room.game;
        const chatMsg = game.addChatMessage(socket.id, message);
        
        if (chatMsg) {
            io.to(room.game.roomId).emit('chat_message', chatMsg);
            
            const player = game.players.find(p => p.socketId === socket.id);
            if (player && player.userId) {
                const chatAchievements = game.checkAchievements(player, 'chat');
                for (const achievement of chatAchievements) {
                    await User.addAchievement(player.userId, achievement);
                    io.to(socket.id).emit('achievement_unlocked', { achievement });
                }
            }
        }
    });

    socket.on('kick_player', (data) => {
        const { targetSocketId } = data;
        const room = roomManager.getRoomBySocket(socket.id);
        
        if (!room) return;
        
        const result = roomManager.kickPlayer(room.game.roomId, targetSocketId, socket.id);
        if (result.success) {
            io.to(room.game.roomId).emit('player_kicked', {
                playerName: result.playerName,
                byHost: true
            });
            
            io.to(targetSocketId).emit('kicked', {
                reason: 'Du blev kickad av värden'
            });
        } else {
            socket.emit('error', { message: result.error });
        }
    });

    socket.on('surrender', () => {
        const room = roomManager.getRoomBySocket(socket.id);
        if (!room) return;

        const result = room.game.surrender(socket.id);
        if (result.success) {
            io.to(room.game.roomId).emit('player_surrendered', {
                playerId: result.player.id,
                playerName: result.player.name,
                gameState: room.game.getPublicState(socket.id)
            });

            if (result.gameOver) {
                // Skicka game_over till ALLA (inklusive den som gav upp)
                room.game.players.forEach(player => {
                    io.to(player.socketId).emit('game_over', {
                        gameState: room.game.getPublicState(player.socketId),
                        winner: room.game.winner,
                        standings: room.game.finalStandings,
                        duration: room.game.duration,
                        totalTurns: room.game.totalTurns
                    });
                });
                room.game.spectators.forEach(spectatorId => {
                    io.to(spectatorId).emit('game_over', {
                        gameState: room.game.getSpectatorState(),
                        winner: room.game.winner,
                        standings: room.game.finalStandings,
                        duration: room.game.duration,
                        totalTurns: room.game.totalTurns
                    });
                });
            } else {
                // Skicka game_state_update till ALLA (inklusive den som gav upp)
                room.game.players.forEach(player => {
                    io.to(player.socketId).emit('game_state_update', 
                        room.game.getPublicState(player.socketId)
                    );
                });
                room.game.spectators.forEach(spectatorId => {
                    io.to(spectatorId).emit('game_state_update', 
                        room.game.getSpectatorState()
                    );
                });

                // Om nästa spelare är AI, starta dess tur
                const nextPlayer = room.game.getCurrentPlayer();
                if (nextPlayer?.isAI) {
                    setTimeout(() => room.game.makeAIMove(io), 1500);
                }
            }
        } else {
            socket.emit('error', { message: result.error });
        }
    });

    socket.on('update_settings', (data) => {
        const room = roomManager.getRoomBySocket(socket.id);
        if (!room || room.hostSocketId !== socket.id) {
            socket.emit('error', { message: 'Endast värden kan ändra inställningar' });
            return;
        }
        
        const game = room.game;
        if (data.allowAI !== undefined) game.settings.allowAI = data.allowAI;
        if (data.turnTimer !== undefined) game.settings.turnTimer = data.turnTimer;
        if (data.spectatorMode !== undefined) game.settings.spectatorMode = data.spectatorMode;
        if (data.maxPlayers !== undefined) game.settings.maxPlayers = Math.min(6, Math.max(2, data.maxPlayers));
        
        io.to(room.game.roomId).emit('settings_updated', game.settings);
    });

    socket.on('disconnect', async () => {
        console.log(`🔌 Frånkoppling: ${socket.id}`);
        
        if (socket.user) {
            await User.setOnlineStatus(socket.user.id, false);
        }
        
        // Markera spelaren som frånkopplad direkt (så att reconnect kan hitta dem)
        const result = roomManager.leaveRoom(socket.id);
        
        if (result && result.room) {
            const { roomId, player } = result;
            const game = result.room.game;
            
            // Om det finns en pending ask och någon involverad spelare kopplade från — auto-lös den
            if (game.pendingAsk) {
                const pending = game.pendingAsk;
                const asker = game.players.find(p => p.id === pending.askerId);
                const target = game.players.find(p => p.id === pending.targetId);
                if (!asker?.connected || !target?.connected) {
                    console.log(`🎣 Auto-löser pending ask efter disconnect (asker connected: ${asker?.connected}, target connected: ${target?.connected})`);
                    const pendingResult = game.autoResolvePendingAsk();
                    if (pendingResult) {
                        if (pendingResult.gameOver) {
                            handleGameEnd(game, result.room);
                        } else {
                            game.players.forEach(p => {
                                if (p.connected) {
                                    io.to(p.socketId).emit('turn_result', {
                                        ...pendingResult,
                                        gameState: game.getPublicState(p.socketId)
                                    });
                                }
                            });
                            game.spectators.forEach(spectatorId => {
                                io.to(spectatorId).emit('turn_result', {
                                    ...pendingResult,
                                    gameState: game.getSpectatorState()
                                });
                            });
                            const nextPlayer = game.getCurrentPlayer();
                            if (nextPlayer?.isAI) {
                                setTimeout(() => game.makeAIMove(io), 1500);
                            }
                        }
                    }
                }
            }
            
            if (player && game.state === GAME_STATES.PLAYING) {
                io.to(roomId).emit('player_left', {
                    playerName: player.name,
                    playerId: player.id,
                    reason: 'disconnected'
                });
                io.to(roomId).emit('game_state_update', 
                    game.getPublicState(socket.id)
                );
            }
            
            // Vänta 5 sekunder och ta sedan bort spelaren helt om de inte återanslutit
            setTimeout(() => {
                const forceResult = roomManager.leaveRoom(socket.id, true);
                if (forceResult && forceResult.player) {
                    console.log(`🗑️ Spelare ${forceResult.player.name} togs bort efter timeout`);
                    io.emit('lobby_update', roomManager.getPublicRoomList());
                }
            }, 5000);
        }
    });

    socket.on('leave_room', () => {
        const result = roomManager.leaveRoom(socket.id, true);
        if (result) {
            socket.leave(result.roomId);
            socket.emit('left_room');
            
            if (result.player) {
                io.to(result.roomId).emit('player_left', {
                    playerName: result.player.name,
                    playerId: result.player.id,
                    reason: 'left'
                });
            }
            
            io.emit('lobby_update', roomManager.getPublicRoomList());
        }
    });
});

async function handleGameEnd(game, room) {
    const standings = game.calculateWinner();
    const gameData = game.getGameData();
    
    try {
        let winnerId = null;
        const winner = standings[0];
        if (winner && winner.userId) {
            winnerId = winner.userId;
        }
        
        const gameId = await Game.create(
            game.roomId,
            game.gameType,
            standings.length,
            winnerId,
            winner?.name,
            game.duration,
            game.totalTurns
        );
        
        const eloResults = [];
        const humanPlayers = standings.filter(p => p.userId);
        
        if (humanPlayers.length >= 2) {
            const ratings = humanPlayers.map(p => ({
                userId: p.userId,
                rating: p.elo
            }));
            
            const positions = humanPlayers.map(p => ({
                userId: p.userId,
                position: p.rank
            }));
            
            const newRatings = ELO.calculateNewRatings(ratings, positions);
            
            for (const rating of newRatings) {
                await User.updateElo(rating.userId, rating.newRating);
                await Game.addParticipant(
                    gameId,
                    rating.userId,
                    standings.find(s => s.userId === rating.userId)?.pairs || 0,
                    standings.find(s => s.userId === rating.userId)?.rank || 0,
                    rating.change
                );
                
                eloResults.push({
                    userId: rating.userId,
                    oldRating: rating.oldRating,
                    newRating: rating.newRating,
                    change: rating.change
                });
            }
        }
        
        const isTie = standings.filter(s => s.rank === 1).length > 1;
        
        for (const player of standings) {
            if (player.userId) {
                const isWinner = !isTie && player.rank === 1;
                await User.updateStats(player.userId, {
                    games_played: 1,
                    games_won: isWinner ? 1 : 0,
                    games_lost: isWinner ? 0 : (isTie ? 0 : 1),
                    total_pairs: player.pairs
                });
                
                const gamePlayer = game.players.find(p => p.id === player.id);
                const achievements = game.checkAchievements(
                    gamePlayer,
                    'game_end',
                    {
                        isWinner,
                        isFirstWin: isWinner && player.gamesPlayed === 0,
                        hasAI: standings.some(s => s.isAI),
                        opponentCount: standings.length - 1
                    }
                );
                
                for (const achievement of achievements) {
                    await User.addAchievement(player.userId, achievement);
                }
            }
        }
        
        game.players.forEach(player => {
            if (player.connected) {
                const playerElo = eloResults.find(e => e.userId === player.userId);
                io.to(player.socketId).emit('game_over', {
                    gameState: game.getPublicState(player.socketId),
                    winner: game.winner,
                    standings,
                    duration: game.duration,
                    totalTurns: game.totalTurns,
                    eloChange: playerElo || null
                });
            }
        });
        
        game.spectators.forEach(spectatorId => {
            io.to(spectatorId).emit('game_over', {
                gameState: game.getSpectatorState(),
                winner: game.winner,
                standings,
                duration: game.duration,
                totalTurns: game.totalTurns
            });
        });
        
    } catch (error) {
        console.error('Error saving game:', error);
        
        game.players.forEach(player => {
            if (player.connected) {
                io.to(player.socketId).emit('game_over', {
                    gameState: game.getPublicState(player.socketId),
                    winner: game.winner,
                    standings,
                    duration: game.duration,
                    totalTurns: game.totalTurns
                });
            }
        });
    }
    
    io.emit('lobby_update', roomManager.getPublicRoomList());
}

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
