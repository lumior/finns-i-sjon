const GameEngine = require('./GameEngine');
const { v4: uuidv4 } = require('uuid');

class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.playerRooms = new Map();
        this.userRooms = new Map();
    }

    createRoom(hostName, hostSocketId, options = {}) {
        const {
            roomName = null,
            password = null,
            gameType = 'standard',
            maxPlayers = 6,
            allowAI = true,
            turnTimer = true,
            spectatorMode = true
        } = options;

        const roomId = uuidv4().substr(0, 8).toUpperCase();
        const game = new GameEngine(roomId, gameType);
        
        game.settings.maxPlayers = maxPlayers;
        game.settings.allowAI = allowAI;
        game.settings.turnTimer = turnTimer;
        game.settings.spectatorMode = spectatorMode;
        
        console.log('🔍 DEBUG createRoom:', roomId, 'maxPlayers:', maxPlayers, 'allowAI:', allowAI);
        
        const result = game.addPlayer(hostSocketId, hostName);
        if (!result.success) return { success: false, error: result.error };

        this.rooms.set(roomId, {
            game,
            name: roomName || `Bord ${roomId}`,
            createdAt: new Date(),
            hostSocketId,
            password: password || null,
            isPrivate: !!password,
            bannedPlayers: new Set()
        });
        
        this.playerRooms.set(hostSocketId, roomId);
        
        return { success: true, roomId, game };
    }

    joinRoom(roomId, playerName, socketId, password = null, userData = null) {
        console.log('🔍 RM joinRoom:', roomId, 'name:', playerName, 'socket:', socketId, 'rooms:', this.rooms.size);
        const room = this.rooms.get(roomId.toUpperCase());
        if (!room) return { success: false, error: 'Rummet finns inte' };
        
        if (room.bannedPlayers.has(socketId)) {
            return { success: false, error: 'Du är bannad från detta rum' };
        }
        
        if (room.password && room.password !== password) {
            return { success: false, error: 'Fel lösenord' };
        }
        
        const game = room.game;
        
        // Om spelet är avslutat, återställ för ny match
        if (game.state === 'finished') {
            game.resetGame();
        }
        
        if (game.state !== 'waiting') {
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
        if (!result.success) return { success: false, error: result.error };

        this.playerRooms.set(socketId, roomId.toUpperCase());
        
        if (userData?.id) {
            this.userRooms.set(userData.id, roomId.toUpperCase());
        }
        
        return { success: true, game, roomName: room.name };
    }

    addAIToRoom(roomId, difficulty = 'smart') {
        console.log('🔍 DEBUG addAIToRoom:', roomId, 'rooms:', this.rooms.size);
        const room = this.rooms.get(roomId.toUpperCase());
        if (!room) return { success: false, error: 'Rummet finns inte' };
        
        const game = room.game;
        const result = game.addAI(difficulty);
        
        return result;
    }

    removeAIFromRoom(roomId, aiId) {
        const room = this.rooms.get(roomId.toUpperCase());
        if (!room) return { success: false, error: 'Rummet finns inte' };
        
        const game = room.game;
        const removed = game.removeAI(aiId);
        
        return { success: removed };
    }

    leaveRoom(socketId, forceRemove = false) {
        const roomId = this.playerRooms.get(socketId);
        if (!roomId) return null;
        
        const room = this.rooms.get(roomId);
        if (!room) return null;
        
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
        
        if (!result) return null;
        
        if (room.hostSocketId === socketId && game.players.length > 0) {
            const newHost = game.players.find(p => p.connected && !p.isAI);
            if (newHost) {
                room.hostSocketId = newHost.socketId;
            }
        }
        
        const connectedHumans = game.players.filter(p => p.connected && !p.isAI).length;
        if (connectedHumans === 0 || game.state === 'finished') {
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
        
        return { room, player: result?.player, roomId, disconnected: result?.disconnected };
    }

    reconnect(oldSocketId, newSocketId, userData = null) {
        for (const [roomId, room] of this.rooms) {
            const game = room.game;
            const reconnected = game.reconnectPlayer(oldSocketId, newSocketId, userData);
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

    getPublicRoomList() {
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
                    hasPassword: !!room.password,
                    gameType: room.game.gameType,
                    createdAt: room.createdAt
                });
            }
        }
        return list.sort((a, b) => b.createdAt - a.createdAt);
    }

    kickPlayer(roomId, targetSocketId, requesterSocketId) {
        const room = this.rooms.get(roomId.toUpperCase());
        if (!room) return { success: false, error: 'Rummet finns inte' };
        if (room.hostSocketId !== requesterSocketId) {
            return { success: false, error: 'Endast värden kan kicka spelare' };
        }
        
        const targetPlayer = room.game.players.find(p => p.socketId === targetSocketId);
        if (!targetPlayer) return { success: false, error: 'Spelare inte funnen' };
        if (targetPlayer.socketId === requesterSocketId) {
            return { success: false, error: 'Du kan inte kicka dig själv' };
        }
        
        room.game.removePlayer(targetSocketId);
        this.playerRooms.delete(targetSocketId);
        
        return { success: true, playerName: targetPlayer.name };
    }

    banPlayer(roomId, targetSocketId, requesterSocketId) {
        const result = this.kickPlayer(roomId, targetSocketId, requesterSocketId);
        if (!result.success) return result;
        
        const room = this.rooms.get(roomId.toUpperCase());
        room.bannedPlayers.add(targetSocketId);
        
        return { success: true, playerName: result.playerName, banned: true };
    }
}

module.exports = RoomManager;
