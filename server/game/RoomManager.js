const GameEngine = require('./GameEngine');
const PersistentRoom = require('../models/PersistentRoom');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.playerRooms = new Map();
        this.userRooms = new Map();
    }

    async createRoom(hostName, hostSocketId, options = {}) {
        const {
            roomId: requestedRoomId = null,
            roomName = null,
            password = null,
            gameType = 'standard',
            maxPlayers = 6,
            allowAI = true,
            turnTimer = true,
            spectatorMode = true,
            deckTheme = 'standard',
            isPersistent = false,
            ownerUserId = null
        } = options;

        const roomId = requestedRoomId ? requestedRoomId.toUpperCase() : uuidv4().substr(0, 8).toUpperCase();
        const game = new GameEngine(roomId, gameType);

        game.settings.maxPlayers = maxPlayers;
        game.settings.allowAI = allowAI;
        game.settings.turnTimer = turnTimer;
        game.settings.spectatorMode = spectatorMode;
        game.settings.deckTheme = deckTheme;

        console.log('🔍 DEBUG createRoom:', roomId, 'maxPlayers:', maxPlayers, 'allowAI:', allowAI);

        const result = game.addPlayer(hostSocketId, hostName);
        if (!result.success) {
            return { success: false, error: result.error };
        }

        const passwordHash = password ? await bcrypt.hash(password, 10) : null;

        const room = {
            game,
            name: roomName || `Bord ${roomId}`,
            createdAt: new Date(),
            hostSocketId,
            passwordHash,
            isPrivate: !!password,
            bannedPlayers: new Set(),
            bannedUserIds: new Set(),
            isPersistent: false,
            ownerUserId: null
        };

        if (isPersistent && ownerUserId) {
            room.isPersistent = true;
            room.ownerUserId = ownerUserId;
            try {
                await PersistentRoom.create({
                    roomId,
                    ownerUserId,
                    roomName: room.name,
                    gameType,
                    maxPlayers,
                    allowAI,
                    turnTimer,
                    spectatorMode,
                    deckTheme,
                    passwordHash,
                    isPrivate: !!password
                });
            } catch (err) {
                console.error('❌ Failed to create persistent room:', err.message);
                return { success: false, error: `Kunde inte spara återkommande bord: ${err.message}` };
            }
        }

        this.rooms.set(roomId, room);
        this.playerRooms.set(hostSocketId, roomId);

        return { success: true, roomId, game };
    }

    async createRoomFromPersistent(persistentRoom) {
        const game = new GameEngine(persistentRoom.roomId, persistentRoom.gameType);

        game.settings.maxPlayers = persistentRoom.maxPlayers;
        game.settings.allowAI = persistentRoom.allowAI;
        game.settings.turnTimer = persistentRoom.turnTimer;
        game.settings.spectatorMode = persistentRoom.spectatorMode;
        game.settings.deckTheme = persistentRoom.deckTheme;

        this.rooms.set(persistentRoom.roomId, {
            game,
            name: persistentRoom.roomName,
            createdAt: persistentRoom.createdAt || new Date(),
            hostSocketId: null,
            passwordHash: persistentRoom.passwordHash,
            isPrivate: persistentRoom.isPrivate,
            bannedPlayers: new Set(),
            bannedUserIds: new Set(),
            isPersistent: true,
            ownerUserId: persistentRoom.ownerUserId
        });

        return { success: true, roomId: persistentRoom.roomId, game };
    }

    async joinRoom(roomId, playerName, socketId, password = null, userData = null) {
        console.log(`🔍 [JOIN] ${playerName} → ${roomId}, socket=${socketId}, rooms=${this.rooms.size}`);
        let room = this.rooms.get(roomId.toUpperCase());

        if (!room) {
            const persistentRoom = await PersistentRoom.getById(roomId.toUpperCase());
            if (persistentRoom && persistentRoom.isActive) {
                const restored = await this.createRoomFromPersistent(persistentRoom);
                if (restored.success) {
                    room = this.rooms.get(roomId.toUpperCase());
                }
            }
        }

        if (!room) {
            return { success: false, error: 'Rummet finns inte' };
        }

        if (room.bannedPlayers.has(socketId)) {
            return { success: false, error: 'Du är bannad från detta rum' };
        }

        if (userData?.id && room.bannedUserIds.has(userData.id)) {
            return { success: false, error: 'Du är bannad från detta rum' };
        }

        if (room.passwordHash) {
            const valid = await bcrypt.compare(password || '', room.passwordHash);
            if (!valid) {
                return { success: false, error: 'Fel lösenord' };
            }
        }

        const game = room.game;

        // Om spelet är avslutat, återställ för ny match
        if (game.state === 'finished') {
            game.resetGame();
        }

        if (game.state !== 'waiting') {
            // Om samma inloggade användare redan finns och är connected (race condition vid reconnect),
            // uppdatera socketId istället för att lägga till som spectator
            if (userData?.id) {
                const existingUser = game.players.find(p => p.userId === userData.id && p.connected);
                if (existingUser) {
                    this.playerRooms.delete(existingUser.socketId);
                    existingUser.socketId = socketId;
                    this.playerRooms.set(socketId, roomId.toUpperCase());
                    return { success: true, game, roomName: room.name };
                }
            }

            const existingPlayer = game.players.find(p => p.name === playerName && !p.connected);
            if (existingPlayer) {
                return { success: false, error: 'Spelet pågår - använd återanslutning' };
            }

            if (game.settings.spectatorMode) {
                game.addSpectator(socketId);
                this.playerRooms.set(socketId, roomId);
                return {
                    success: true,
                    game,
                    isSpectator: true,
                    roomName: room.name
                };
            }

            return { success: false, error: 'Spelet har redan börjat' };
        }

        const existingByName = game.players.find(p => p.name === playerName);
        if (existingByName) {
            const wasHost = room.hostSocketId === existingByName.socketId;
            this.playerRooms.delete(existingByName.socketId);
            existingByName.socketId = socketId;
            existingByName.connected = true;
            if (userData) {
                existingByName.userId = userData.id;
                existingByName.elo = userData.elo;
            }
            this.playerRooms.set(socketId, roomId.toUpperCase());
            // Om spelaren var host, uppdatera hostSocketId
            if (wasHost) {
                room.hostSocketId = socketId;
            }
            return { success: true, game, roomName: room.name };
        }

        const result = game.addPlayer(socketId, playerName, userData);
        if (!result.success) {
            return { success: false, error: result.error };
        }

        // Om rummet är återskapat från persistent lagring finns ingen host än
        if (!room.hostSocketId) {
            room.hostSocketId = socketId;
        }

        this.playerRooms.set(socketId, roomId.toUpperCase());

        if (userData?.id) {
            this.userRooms.set(userData.id, roomId.toUpperCase());
        }

        return { success: true, game, roomName: room.name };
    }

    addAIToRoom(roomId, difficulty = 'smart') {
        console.log('🔍 DEBUG addAIToRoom:', roomId, 'rooms:', this.rooms.size);
        const room = this.rooms.get(roomId.toUpperCase());
        if (!room) {
            return { success: false, error: 'Rummet finns inte' };
        }

        const game = room.game;
        const result = game.addAI(difficulty);

        return result;
    }

    removeAIFromRoom(roomId, aiId) {
        const room = this.rooms.get(roomId.toUpperCase());
        if (!room) {
            return { success: false, error: 'Rummet finns inte' };
        }

        const game = room.game;
        const removed = game.removeAI(aiId);

        return { success: removed };
    }

    leaveRoom(socketId, forceRemove = false) {
        const roomId = this.playerRooms.get(socketId);
        if (!roomId) {
            return null;
        }

        const room = this.rooms.get(roomId);
        if (!room) {
            return null;
        }

        const game = room.game;
        let result;

        if (forceRemove) {
            // Användaren aktivt lämnade (t.ex. klickade "Lämna rum")
            result = game.forceRemovePlayer(socketId);
            this.playerRooms.delete(socketId);
        } else {
            // Frånkoppling (t.ex. sidomladdning) - markera bara som frånkopplad
            // Ta INTE bort från playerRooms så att återanslutning/reconnect fungerar
            result = game.removePlayer(socketId);
        }

        if (!result) {
            return null;
        }

        if (room.hostSocketId === socketId && game.players.length > 0) {
            const newHost = game.players.find(p => p.connected && !p.isAI);
            if (newHost) {
                room.hostSocketId = newHost.socketId;
            }
        }

        const connectedHumans = game.players.filter(p => p.connected && !p.isAI).length;
        if (connectedHumans === 0 || game.state === 'finished') {
            if (room.isPersistent) {
                // Återställ persistent rum till waiting-läge och spara aktuella inställningar
                game.resetGame();
                PersistentRoom.update(roomId, {
                    room_name: room.name,
                    game_type: game.gameType,
                    max_players: game.settings.maxPlayers,
                    allow_ai: game.settings.allowAI,
                    turn_timer: game.settings.turnTimer,
                    spectator_mode: game.settings.spectatorMode,
                    deck_theme: game.settings.deckTheme,
                    is_private: room.isPrivate,
                    is_active: true
                }).catch(err => console.error('Failed to update persistent room:', err.message));
                this.rooms.delete(roomId);
                console.log(`💾 Persistent rum ${roomId} sparat och taget ur minnet`);
            } else {
                setTimeout(() => {
                    const currentRoom = this.rooms.get(roomId);
                    if (currentRoom) {
                        const currentHumans = currentRoom.game.players.filter(p => p.connected && !p.isAI).length;
                        if (currentHumans === 0 || currentRoom.game.state === 'finished') {
                            this.rooms.delete(roomId);
                            console.log(`🗑️ Rum ${roomId} borttaget`);
                        }
                    }
                }, 300000);
            }
        }

        return { room, player: result?.player, roomId, disconnected: result?.disconnected };
    }

    reconnect(oldSocketId, newSocketId, userData = null, reconnectToken = null) {
        for (const [roomId, room] of this.rooms) {
            const game = room.game;
            const reconnected = game.reconnectPlayer(oldSocketId, newSocketId, userData, reconnectToken);
            if (reconnected) {
                this.playerRooms.delete(oldSocketId);
                this.playerRooms.set(newSocketId, roomId);
                // Om spelaren var host, uppdatera hostSocketId
                if (room.hostSocketId === oldSocketId) {
                    room.hostSocketId = newSocketId;
                }
                return { roomId, game, player: reconnected };
            }
        }
        return null;
    }

    getRoomBySocket(socketId) {
        const roomId = this.playerRooms.get(socketId);
        return roomId ? this.rooms.get(roomId) : null;
    }

    getRoomIdBySocket(socketId) {
        return this.playerRooms.get(socketId);
    }

    async getPublicRoomList() {
        const list = [];
        for (const [roomId, room] of this.rooms) {
            if (room.game.state === 'waiting' && !room.isPrivate) {
                list.push({
                    roomId,
                    name: room.name,
                    playerCount: room.game.players.filter(p => !p.isAI).length,
                    aiCount: room.game.aiPlayers.length,
                    maxPlayers: room.game.settings.maxPlayers,
                    hostName: room.game.players[0]?.name || 'Okänd',
                    hasPassword: !!room.passwordHash,
                    gameType: room.game.gameType,
                    deckTheme: room.game.settings.deckTheme,
                    createdAt: room.createdAt
                });
            }
        }

        // Lägg även till aktiva, tomma återkommande rum från databasen
        try {
            const persistentRooms = await PersistentRoom.getActivePublic();
            for (const pr of persistentRooms) {
                if (!this.rooms.has(pr.roomId)) {
                    list.push({
                        roomId: pr.roomId,
                        name: pr.roomName,
                        playerCount: 0,
                        aiCount: 0,
                        maxPlayers: pr.maxPlayers,
                        hostName: pr.ownerDisplayName || pr.ownerUsername || 'Okänd',
                        hasPassword: !!pr.passwordHash,
                        gameType: pr.gameType,
                        deckTheme: pr.deckTheme,
                        createdAt: pr.createdAt
                    });
                }
            }
        } catch (err) {
            console.error('❌ Kunde inte hämta återkommande rum för lobbyn:', err.message);
        }

        return list.sort((a, b) => b.createdAt - a.createdAt);
    }

    kickPlayer(roomId, targetSocketId, requesterSocketId) {
        const room = this.rooms.get(roomId.toUpperCase());
        if (!room) {
            return { success: false, error: 'Rummet finns inte' };
        }
        if (room.hostSocketId !== requesterSocketId) {
            return { success: false, error: 'Endast värden kan kicka spelare' };
        }

        const targetPlayer = room.game.players.find(p => p.socketId === targetSocketId);
        if (!targetPlayer) {
            return { success: false, error: 'Spelare inte funnen' };
        }
        if (targetPlayer.socketId === requesterSocketId) {
            return { success: false, error: 'Du kan inte kicka dig själv' };
        }

        room.game.removePlayer(targetSocketId);
        this.playerRooms.delete(targetSocketId);

        return { success: true, playerName: targetPlayer.name };
    }

    banPlayer(roomId, targetSocketId, requesterSocketId) {
        const result = this.kickPlayer(roomId, targetSocketId, requesterSocketId);
        if (!result.success) {
            return result;
        }

        const room = this.rooms.get(roomId.toUpperCase());
        room.bannedPlayers.add(targetSocketId);

        const targetPlayer = room.game.players.find(p => p.socketId === targetSocketId);
        if (targetPlayer?.userId) {
            room.bannedUserIds.add(targetPlayer.userId);
        }

        return { success: true, playerName: result.playerName, banned: true };
    }
}

module.exports = RoomManager;
