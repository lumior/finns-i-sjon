const db = require('../config/database');

class Game {
    static async create(roomId, gameType, playerCount, winnerId, winnerName, duration, totalTurns) {
        const result = await db.run(
            'INSERT INTO games (room_id, game_type, player_count, winner_id, winner_name, duration_seconds, total_turns) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [roomId, gameType, playerCount, winnerId, winnerName, duration, totalTurns]
        );
        return result.id;
    }

    static async addParticipant(gameId, userId, finalPairs, finalRank, eloChange) {
        await db.run(
            'INSERT INTO game_participants (game_id, user_id, final_pairs, final_rank, elo_change) VALUES (?, ?, ?, ?, ?)',
            [gameId, userId, finalPairs, finalRank, eloChange]
        );
    }

    static async logEvent(gameId, eventType, playerId, targetId, rank, success) {
        await db.run(
            'INSERT INTO game_events (game_id, event_type, player_id, target_id, rank, success) VALUES (?, ?, ?, ?, ?, ?)',
            [gameId, eventType, playerId, targetId, rank, success ? 1 : 0]
        );
    }

    static async getUserHistory(userId, limit = 20) {
        return db.query(
            `SELECT g.*, gp.final_pairs, gp.final_rank, gp.elo_change
             FROM games g
             JOIN game_participants gp ON g.id = gp.game_id
             WHERE gp.user_id = ?
             ORDER BY g.created_at DESC
             LIMIT ?`,
            [userId, limit]
        );
    }

    static async getGameDetails(gameId) {
        const game = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
        if (!game) {
            return null;
        }

        const participants = await db.query(
            `SELECT gp.*, u.username, u.display_name, u.avatar_url
             FROM game_participants gp
             JOIN users u ON gp.user_id = u.id
             WHERE gp.game_id = ?
             ORDER BY gp.final_rank`,
            [gameId]
        );

        const events = await db.query('SELECT * FROM game_events WHERE game_id = ? ORDER BY timestamp', [gameId]);

        return { ...game, participants, events };
    }

    static async getTotalCount() {
        const result = await db.get('SELECT COUNT(*) as count FROM games');
        return result ? result.count : 0;
    }
}

module.exports = Game;
