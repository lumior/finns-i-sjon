const { GAME_STATES } = require('../utils/constants');
const { createSocketRateLimiter } = require('../utils/socket-rate-limit');

function createSocketHandlers(io, roomManager, Game, User, db, escapeHtml, handleGameEnd) {
    function broadcastToRoom(game, event, basePayload, includeGameState = false) {
        game.players.forEach(player => {
            if (player.connected) {
                const payload = includeGameState
                    ? { ...basePayload, gameState: game.getPublicState(player.socketId) }
                    : { ...basePayload };
                io.to(player.socketId).emit(event, payload);
            }
        });
        game.spectators.forEach(spectatorId => {
            const payload = includeGameState
                ? { ...basePayload, gameState: game.getSpectatorState() }
                : { ...basePayload };
            io.to(spectatorId).emit(event, payload);
        });
    }

    return function onConnection(socket) {
        console.log(`🔌 Anslutning: ${socket.id} ${socket.user ? `(${socket.user.username})` : '(gäst)'}`);

        if (socket.user) {
            User.setOnlineStatus(socket.user.id, true);
        }

        const rateLimit = createSocketRateLimiter(socket);

        socket.on(
            'reconnect_attempt',
            rateLimit('reconnect_attempt', 10, 60000, data => {
                const { oldSocketId, reconnectToken } = data;
                console.log(
                    `🔄 [RECONNECT_ATTEMPT] Ny socket: ${socket.id} | Gammal: ${oldSocketId} | Token: ${reconnectToken ? 'ja' : 'nej'}`
                );
                const result = roomManager.reconnect(oldSocketId, socket.id, socket.user, reconnectToken);

                if (result) {
                    const playersInfo = result.game.players.map(p => `${p.name}(conn=${p.connected})`).join(', ');
                    console.log(
                        `✅ [RECONNECT_OK] ${result.player.name} återanslöt till ${result.roomId}. Spelare: [${playersInfo}]`
                    );
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

                    broadcastToRoom(result.game, 'game_state_update', {}, true);
                } else {
                    console.log(
                        `❌ [RECONNECT_FAIL] ${socket.id} kunde inte återansluta (oldSocketId=${oldSocketId}). Spelare finns inte kvar i något rum.`
                    );
                    socket.emit('reconnect_failed');
                }
            })
        );

        socket.on(
            'create_room',
            rateLimit('create_room', 5, 60000, async data => {
                console.log('🔍 SERVER create_room:', data?.playerName, 'socket:', socket.id);
                const { playerName, roomName, password, gameType, settings } = data;

                if (!playerName || playerName.trim().length < 2) {
                    socket.emit('error', { message: 'Ange ett giltigt namn (minst 2 tecken)' });
                    return;
                }

                const result = await roomManager.createRoom(playerName.trim(), socket.id, {
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
            })
        );

        socket.on(
            'join_room',
            rateLimit('join_room', 10, 60000, async data => {
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

                const result = await roomManager.joinRoom(
                    roomId,
                    playerName.trim(),
                    socket.id,
                    password?.trim(),
                    userData
                );

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

                broadcastToRoom(result.game, 'game_state_update', {}, true);
                io.emit('lobby_update', roomManager.getPublicRoomList());
            })
        );

        socket.on(
            'add_ai',
            rateLimit('add_ai', 10, 60000, data => {
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

                broadcastToRoom(room.game, 'ai_added', { player: result.player }, true);

                io.emit('lobby_update', roomManager.getPublicRoomList());
            })
        );

        socket.on(
            'dev_ai_vs_ai',
            rateLimit('dev_ai_vs_ai', 5, 60000, () => {
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

                broadcastToRoom(game, 'game_started', { firstPlayer: game.getCurrentPlayer()?.name }, true);

                const currentPlayer = game.getCurrentPlayer();
                if (currentPlayer?.isAI) {
                    setTimeout(() => game.makeAIMove(io), 1500);
                }
            })
        );

        socket.on(
            'remove_ai',
            rateLimit('remove_ai', 10, 60000, data => {
                const { aiId } = data;
                const room = roomManager.getRoomBySocket(socket.id);

                if (!room || room.hostSocketId !== socket.id) {
                    socket.emit('error', { message: 'Endast värden kan ta bort AI' });
                    return;
                }

                const result = roomManager.removeAIFromRoom(room.game.roomId, aiId);
                if (result.success) {
                    io.to(room.game.roomId).emit('ai_removed', { aiId });
                    broadcastToRoom(room.game, 'game_state_update', {}, true);
                }
            })
        );

        socket.on(
            'start_game',
            rateLimit('start_game', 5, 60000, () => {
                const room = roomManager.getRoomBySocket(socket.id);
                if (!room) {
                    return;
                }

                if (room.hostSocketId !== socket.id) {
                    socket.emit('error', { message: 'Endast värden kan starta spelet' });
                    return;
                }

                const game = room.game;

                // Om spelet är slut, återställ det först så att det kan startas om
                if (game.state === GAME_STATES.FINISHED) {
                    game.resetGame();
                }

                if (!game.canStart()) {
                    socket.emit('error', { message: 'Minst 2 spelare krävs för att starta' });
                    return;
                }

                game.setIo(io);
                game.players.forEach(p => {
                    p.ready = false;
                });
                game.startGame();
                game.onGameEnd = () => handleGameEnd(game, room);

                broadcastToRoom(game, 'game_started', {}, true);

                const currentPlayer = game.getCurrentPlayer();
                if (currentPlayer && currentPlayer.isAI) {
                    setTimeout(() => game.makeAIMove(io), 2000);
                }
            })
        );

        socket.on(
            'toggle_ready',
            rateLimit('toggle_ready', 30, 60000, () => {
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
            })
        );

        socket.on(
            'ask_cards',
            rateLimit('ask_cards', 60, 60000, data => {
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

                    broadcastToRoom(game, 'turn_result', result, true);

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
            })
        );

        socket.on(
            'respond_to_ask',
            rateLimit('respond_to_ask', 60, 60000, data => {
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

                broadcastToRoom(game, 'turn_result', result, true);

                const nextPlayer = game.getCurrentPlayer();
                if (nextPlayer && nextPlayer.isAI) {
                    setTimeout(() => game.makeAIMove(io), 1500);
                }
            })
        );

        socket.on(
            'chat_message',
            rateLimit('chat_message', 30, 60000, async data => {
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

                    try {
                        const player = game.players.find(p => p.socketId === socket.id);
                        if (player && player.userId) {
                            const chatAchievements = game.checkAchievements(player, 'chat');
                            for (const achievement of chatAchievements) {
                                await User.addAchievement(player.userId, achievement);
                                io.to(socket.id).emit('achievement_unlocked', { achievement });
                            }
                        }
                    } catch (achievementError) {
                        console.error('Fel vid chat-achievement:', achievementError);
                    }
                }
            })
        );

        socket.on(
            'kick_player',
            rateLimit('kick_player', 10, 60000, data => {
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
            })
        );

        socket.on(
            'ban_player',
            rateLimit('ban_player', 10, 60000, data => {
                const { targetSocketId } = data;
                const room = roomManager.getRoomBySocket(socket.id);

                if (!room) {
                    return;
                }

                const result = roomManager.banPlayer(room.game.roomId, targetSocketId, socket.id);
                if (result.success) {
                    io.to(room.game.roomId).emit('player_banned', {
                        playerName: result.playerName,
                        byHost: true
                    });

                    io.to(targetSocketId).emit('banned', {
                        reason: 'Du blev bannad av värden'
                    });
                } else {
                    socket.emit('error', { message: result.error });
                }
            })
        );

        socket.on(
            'surrender',
            rateLimit('surrender', 5, 60000, () => {
                const room = roomManager.getRoomBySocket(socket.id);
                if (!room) {
                    return;
                }

                const result = room.game.surrender(socket.id);
                if (result.success) {
                    broadcastToRoom(
                        room.game,
                        'player_surrendered',
                        {
                            playerId: result.player.id,
                            playerName: result.player.name
                        },
                        true
                    );

                    if (result.gameOver) {
                        handleGameEnd(room.game, room);
                    } else {
                        broadcastToRoom(room.game, 'game_state_update', {}, true);

                        const nextPlayer = room.game.getCurrentPlayer();
                        if (nextPlayer?.isAI) {
                            setTimeout(() => room.game.makeAIMove(io), 1500);
                        }
                    }
                } else {
                    socket.emit('error', { message: result.error });
                }
            })
        );

        socket.on(
            'update_settings',
            rateLimit('update_settings', 10, 60000, data => {
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
                if (data.deckTheme !== undefined) {
                    game.settings.deckTheme = data.deckTheme;
                }

                io.to(room.game.roomId).emit('settings_updated', game.settings);
            })
        );

        socket.on('disconnect', async reason => {
            console.log(`🔌 Frånkoppling: ${socket.id}, orsak: ${reason}`);

            if (socket.user) {
                await User.setOnlineStatus(socket.user.id, false);
            }

            const result = roomManager.leaveRoom(socket.id);
            if (result?.room) {
                const game = result.room.game;
                const playersInfo = game.players
                    .map(p => `${p.name}(connected=${p.connected},socket=${p.socketId?.substr(-4)})`)
                    .join(', ');
                console.log(
                    `📊 [DISCONNECT] Rum ${result.roomId} | Spelare: ${result.player?.name || 'okänd'} | State: ${game.state} | Spelare i rum: [${playersInfo}]`
                );
            }

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
                                broadcastToRoom(game, 'turn_result', pendingResult, true);
                                const nextPlayer = game.getCurrentPlayer();
                                if (nextPlayer?.isAI) {
                                    setTimeout(() => game.makeAIMove(io), 1500);
                                }
                            }
                        }
                    }
                }

                if (player && game.state === GAME_STATES.PLAYING) {
                    socket.to(roomId).emit('player_left', {
                        playerName: player.name,
                        playerId: player.id,
                        reason: 'disconnected'
                    });
                    // Skicka individuell gameState till varje kvarvarande spelare,
                    // INTE den disconnectade spelarens vy till alla
                    broadcastToRoom(game, 'game_state_update', {}, true);
                }

                console.log(`⏱️ [TIMEOUT-START] ${result.player?.name || socket.id}: force-remove schemalagt om 60s`);
                setTimeout(() => {
                    const forceResult = roomManager.leaveRoom(socket.id, true);
                    if (forceResult && forceResult.player) {
                        const game = forceResult.room?.game;
                        const remainingHumans = game?.players.filter(p => p.connected && !p.isAI).length || 0;
                        const remainingActive = game?.players.filter(p => !p.surrendered && !p.isAI).length || 0;
                        console.log(
                            `🗑️ [TIMEOUT-EXEC] ${forceResult.player.name} togs bort. Återstående mänskliga: ${remainingHumans}, aktiva: ${remainingActive}. Rum state: ${game?.state || 'n/a'}`
                        );

                        // Om spelet pågår och för få mänskliga spelare återstår, avsluta
                        if (game && game.state === GAME_STATES.PLAYING) {
                            const remainingHumans = game.players.filter(p => !p.isAI).length;
                            if (remainingHumans < 2) {
                                console.log(
                                    `🏁 [GAME_END] ${remainingHumans} mänsklig(a) kvar efter force-remove. Avslutar spel.`
                                );
                                game.state = GAME_STATES.FINISHED;
                                game.calculateWinner();
                                handleGameEnd(game, forceResult.room);
                            }
                        }

                        io.emit('lobby_update', roomManager.getPublicRoomList());
                    } else {
                        console.log(`🗑️ [TIMEOUT-EXEC] ${socket.id}: Spelaren redan borttagen eller hittades ej`);
                    }
                }, 60000);
            }
        });

        socket.on(
            'leave_room',
            rateLimit('leave_room', 10, 60000, () => {
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
            })
        );
    };
}

module.exports = createSocketHandlers;
