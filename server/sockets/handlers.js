const { GAME_STATES } = require('../utils/constants');

function createSocketHandlers(io, roomManager, Game, User, db, escapeHtml, handleGameEnd) {
    return function onConnection(socket) {
        console.log(`🔌 Anslutning: ${socket.id} ${socket.user ? `(${socket.user.username})` : '(gäst)'}`);

        if (socket.user) {
            User.setOnlineStatus(socket.user.id, true);
        }

        socket.on('reconnect_attempt', data => {
            const { oldSocketId, reconnectToken } = data;
            const result = roomManager.reconnect(oldSocketId, socket.id, socket.user, reconnectToken);

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

                io.to(result.roomId).emit('game_state_update', result.game.getPublicState(socket.id));
            }
        });

        socket.on('create_room', async data => {
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

            result.game.onStateChange = snapshot => {
                db.saveGameSnapshot(result.roomId, snapshot).catch(() => {});
            };

            const me = result.game.players.find(p => p.socketId === socket.id);
            socket.emit('room_created', {
                roomId: result.roomId,
                gameState: result.game.getPublicState(socket.id),
                isHost: true,
                settings: result.game.settings,
                reconnectToken: me?.reconnectToken
            });

            io.emit('lobby_update', roomManager.getPublicRoomList());
        });

        socket.on('join_room', async data => {
            console.log('🔍 SERVER join_room:', data?.roomId, data?.playerName, 'socket:', socket.id);
            const { roomId, playerName, password } = data;

            if (!playerName || playerName.trim().length < 2) {
                socket.emit('error', { message: 'Ange ett giltigt namn' });
                return;
            }

            const userData = socket.user
                ? {
                      id: socket.user.id,
                      elo: socket.user.elo,
                      avatar: socket.user.avatarUrl
                  }
                : null;

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
            const me = result.game.players.find(p => p.socketId === socket.id);
            socket.emit('room_joined', {
                roomId,
                gameState: result.game.getPublicState(socket.id),
                chatHistory: result.game.getChatHistory(),
                isHost: room ? room.hostSocketId === socket.id : false,
                settings: result.game.settings,
                reconnectToken: me?.reconnectToken
            });

            socket.to(roomId).emit('player_joined', {
                playerName: playerName.trim(),
                playerCount: result.game.players.filter(p => !p.isAI).length,
                aiCount: result.game.aiPlayers.length
            });

            io.to(roomId).emit('game_state_update', result.game.getPublicState(socket.id));
            io.emit('lobby_update', roomManager.getPublicRoomList());
        });

        socket.on('add_ai', data => {
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

            if (game.aiPlayers.length < 2) {
                const result = roomManager.addAIToRoom(game.roomId, 'smart');
                if (!result.success) {
                    socket.emit('error', { message: result.error });
                    return;
                }
            }

            const humanPlayer = game.players.find(p => !p.isAI);
            if (humanPlayer) {
                game.forceRemovePlayer(humanPlayer.socketId);
                roomManager.playerRooms.delete(humanPlayer.socketId);
                game.addSpectator(socket.id);
            }

            const firstAI = game.players.find(p => p.isAI);
            if (firstAI) {
                room.hostSocketId = firstAI.socketId;
            }

            game.setIo(io);
            game.startGame();

            io.to(game.roomId).emit('game_started', {
                gameState: game.getPublicState(socket.id),
                firstPlayer: game.getCurrentPlayer()?.name
            });

            io.to(game.roomId).emit('game_state_update', game.getPublicState(socket.id));

            const currentPlayer = game.getCurrentPlayer();
            if (currentPlayer?.isAI) {
                setTimeout(() => game.makeAIMove(io), 1500);
            }
        });

        socket.on('remove_ai', data => {
            const { aiId } = data;
            const room = roomManager.getRoomBySocket(socket.id);

            if (!room || room.hostSocketId !== socket.id) {
                socket.emit('error', { message: 'Endast värden kan ta bort AI' });
                return;
            }

            const result = roomManager.removeAIFromRoom(room.game.roomId, aiId);
            if (result.success) {
                io.to(room.game.roomId).emit('ai_removed', { aiId });
                io.to(room.game.roomId).emit('game_state_update', room.game.getPublicState(socket.id));
            }
        });

        socket.on('start_game', () => {
            const room = roomManager.getRoomBySocket(socket.id);
            if (!room) {
                return;
            }

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
            game.players.forEach(p => {
                p.ready = false;
            });
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

        socket.on('toggle_ready', () => {
            const room = roomManager.getRoomBySocket(socket.id);
            if (!room) {
                return;
            }

            const game = room.game;
            if (game.state !== GAME_STATES.WAITING) {
                return;
            }

            const result = game.toggleReady(socket.id);
            if (result) {
                io.to(room.game.roomId).emit('ready_status_update', {
                    readyStatus: game.getReadyStatus()
                });
            }
        });

        socket.on('ask_cards', data => {
            const { targetId, rank } = data;
            const room = roomManager.getRoomBySocket(socket.id);
            if (!room) {
                return;
            }

            const game = room.game;
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

            const result = game.requestAsk(socket.id, targetId, rank);

            if (!result.success) {
                socket.emit('turn_result', {
                    ...result,
                    gameState: game.getPublicState(socket.id)
                });
                return;
            }

            socket.emit('ask_pending', {
                targetName: result.targetName,
                rank: result.rank
            });

            io.to(target.socketId).emit('card_request', {
                askerName: result.askerName,
                rank: result.rank
            });
        });

        socket.on('respond_to_ask', data => {
            const { hasCard, rank } = data;
            const room = roomManager.getRoomBySocket(socket.id);
            if (!room) {
                return;
            }

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

        socket.on('chat_message', async data => {
            let { message } = data;
            const room = roomManager.getRoomBySocket(socket.id);
            if (!room) {
                return;
            }

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

        socket.on('kick_player', data => {
            const { targetSocketId } = data;
            const room = roomManager.getRoomBySocket(socket.id);

            if (!room) {
                return;
            }

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
            if (!room) {
                return;
            }

            const result = room.game.surrender(socket.id);
            if (result.success) {
                io.to(room.game.roomId).emit('player_surrendered', {
                    playerId: result.player.id,
                    playerName: result.player.name,
                    gameState: room.game.getPublicState(socket.id)
                });

                if (result.gameOver) {
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
                    room.game.players.forEach(player => {
                        io.to(player.socketId).emit('game_state_update', room.game.getPublicState(player.socketId));
                    });
                    room.game.spectators.forEach(spectatorId => {
                        io.to(spectatorId).emit('game_state_update', room.game.getSpectatorState());
                    });

                    const nextPlayer = room.game.getCurrentPlayer();
                    if (nextPlayer?.isAI) {
                        setTimeout(() => room.game.makeAIMove(io), 1500);
                    }
                }
            } else {
                socket.emit('error', { message: result.error });
            }
        });

        socket.on('update_settings', data => {
            const room = roomManager.getRoomBySocket(socket.id);
            if (!room || room.hostSocketId !== socket.id) {
                socket.emit('error', { message: 'Endast värden kan ändra inställningar' });
                return;
            }

            const game = room.game;
            if (data.allowAI !== undefined) {
                game.settings.allowAI = data.allowAI;
            }
            if (data.turnTimer !== undefined) {
                game.settings.turnTimer = data.turnTimer;
            }
            if (data.spectatorMode !== undefined) {
                game.settings.spectatorMode = data.spectatorMode;
            }
            if (data.maxPlayers !== undefined) {
                game.settings.maxPlayers = Math.min(6, Math.max(2, data.maxPlayers));
            }

            io.to(room.game.roomId).emit('settings_updated', game.settings);
        });

        socket.on('disconnect', async () => {
            console.log(`🔌 Frånkoppling: ${socket.id}`);

            if (socket.user) {
                await User.setOnlineStatus(socket.user.id, false);
            }

            const result = roomManager.leaveRoom(socket.id);

            if (result && result.room) {
                const { roomId, player } = result;
                const game = result.room.game;

                if (game.pendingAsk) {
                    const pending = game.pendingAsk;
                    const asker = game.players.find(p => p.id === pending.askerId);
                    const target = game.players.find(p => p.id === pending.targetId);
                    if (!asker?.connected || !target?.connected) {
                        console.log(
                            `🎣 Auto-löser pending ask efter disconnect (asker connected: ${asker?.connected}, target connected: ${target?.connected})`
                        );
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
                    io.to(roomId).emit('game_state_update', game.getPublicState(socket.id));
                }

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
    };
}

module.exports = createSocketHandlers;
