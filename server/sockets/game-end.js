function createHandleGameEnd(io, roomManager, Game, User, ELO) {
    return async function handleGameEnd(game, room) {
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
                        games_lost: isWinner ? 0 : isTie ? 0 : 1,
                        total_pairs: player.pairs
                    });

                    const gamePlayer = game.players.find(p => p.id === player.id);
                    const achievements = game.checkAchievements(gamePlayer, 'game_end', {
                        isWinner,
                        isFirstWin: isWinner && player.gamesPlayed === 0,
                        hasAI: standings.some(s => s.isAI),
                        opponentCount: standings.length - 1
                    });

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
    };
}

module.exports = createHandleGameEnd;
