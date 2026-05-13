const db = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
    static async create(username, email, password, displayName = null) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.run(
            'INSERT INTO users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, displayName || username]
        );
        return result.id;
    }

    static async findByUsername(username) {
        return db.get('SELECT * FROM users WHERE username = ?', [username]);
    }

    static async findByEmail(email) {
        return db.get('SELECT * FROM users WHERE email = ?', [email]);
    }

    static async findById(id) {
        return db.get('SELECT * FROM users WHERE id = ?', [id]);
    }

    static async validatePassword(user, password) {
        return bcrypt.compare(password, user.password_hash);
    }

    static async updateStats(userId, stats) {
        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(stats)) {
            fields.push(`${key} = ${key} + ?`);
            values.push(value);
        }

        if (fields.length > 0) {
            await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, [...values, userId]);
        }
    }

    static async updateElo(userId, newElo) {
        await db.run('UPDATE users SET elo_rating = ? WHERE id = ?', [newElo, userId]);
    }

    static async setOnlineStatus(userId, isOnline) {
        await db.run('UPDATE users SET is_online = ?, last_login = CURRENT_TIMESTAMP WHERE id = ?', [
            isOnline ? 1 : 0,
            userId
        ]);
    }

    static async getPublicProfile(userId) {
        const user = await db.get(
            'SELECT id, username, display_name, avatar_url, elo_rating, games_played, games_won, games_lost, total_pairs, created_at FROM users WHERE id = ?',
            [userId]
        );
        if (user) {
            user.winRate = user.games_played > 0 ? ((user.games_won / user.games_played) * 100).toFixed(1) : 0;
        }
        return user;
    }

    static async getLeaderboard(limit = 50) {
        return db.query(
            `SELECT id, username, display_name, avatar_url, elo_rating, games_played, games_won, games_lost, total_pairs 
             FROM users 
             WHERE games_played > 0
             ORDER BY elo_rating DESC 
             LIMIT ?`,
            [limit]
        );
    }

    static async getAchievements(userId) {
        return db.query('SELECT achievement_type, unlocked_at FROM achievements WHERE user_id = ?', [userId]);
    }

    static async addAchievement(userId, achievementType) {
        try {
            await db.run('INSERT INTO achievements (user_id, achievement_type) VALUES (?, ?)', [
                userId,
                achievementType
            ]);
            return true;
        } catch (e) {
            return false;
        }
    }

    static async getOnlineUsers() {
        return db.query(
            'SELECT id, username, display_name, elo_rating, is_online FROM users WHERE is_online = 1 ORDER BY elo_rating DESC'
        );
    }

    static async searchUsers(query, limit = 20) {
        return db.query(
            `SELECT id, username, display_name, avatar_url, elo_rating 
             FROM users 
             WHERE username LIKE ? OR display_name LIKE ?
             LIMIT ?`,
            [`%${query}%`, `%${query}%`, limit]
        );
    }
}

module.exports = User;
