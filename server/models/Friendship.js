const db = require('../config/database');

class Friendship {
    static async sendRequest(userId, friendId) {
        if (userId === friendId) {
            return { success: false, error: 'Du kan inte skicka vänförfrågan till dig själv' };
        }

        const existing = await db.get('SELECT * FROM friendships WHERE user_id = ? AND friend_id = ?', [
            userId,
            friendId
        ]);

        if (existing) {
            if (existing.status === 'pending') {
                return { success: false, error: 'Vänförfrågan redan skickad' };
            }
            if (existing.status === 'accepted') {
                return { success: false, error: 'Ni är redan vänner' };
            }
        }

        const reciprocal = await db.get('SELECT * FROM friendships WHERE user_id = ? AND friend_id = ?', [
            friendId,
            userId
        ]);

        if (reciprocal && reciprocal.status === 'accepted') {
            return { success: false, error: 'Ni är redan vänner' };
        }

        await db.run('INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, ?)', [
            userId,
            friendId,
            'pending'
        ]);

        return { success: true };
    }

    static async acceptRequest(requestId, userId) {
        const request = await db.get('SELECT * FROM friendships WHERE id = ?', [requestId]);

        if (!request) {
            return { success: false, error: 'Vänförfrågan hittades inte' };
        }

        if (request.friend_id !== userId) {
            return { success: false, error: 'Du kan inte acceptera denna förfrågan' };
        }

        if (request.status !== 'pending') {
            return { success: false, error: 'Förfrågan är inte längre aktiv' };
        }

        await db.run("UPDATE friendships SET status = 'accepted' WHERE id = ?", [requestId]);
        return { success: true };
    }

    static async rejectRequest(requestId, userId) {
        const request = await db.get('SELECT * FROM friendships WHERE id = ?', [requestId]);

        if (!request) {
            return { success: false, error: 'Vänförfrågan hittades inte' };
        }

        if (request.friend_id !== userId) {
            return { success: false, error: 'Du kan inte avböja denna förfrågan' };
        }

        await db.run('DELETE FROM friendships WHERE id = ?', [requestId]);
        return { success: true };
    }

    static async removeFriend(userId, friendId) {
        await db.run(
            'DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
            [userId, friendId, friendId, userId]
        );
        return { success: true };
    }

    static async getFriends(userId) {
        return db.query(
            `
            SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_online, f.created_at as friends_since
            FROM friendships f
            JOIN users u ON u.id = f.friend_id
            WHERE f.user_id = ? AND f.status = 'accepted'

            UNION

            SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_online, f.created_at as friends_since
            FROM friendships f
            JOIN users u ON u.id = f.user_id
            WHERE f.friend_id = ? AND f.status = 'accepted'
            ORDER BY username
            `,
            [userId, userId]
        );
    }

    static async getPendingReceived(userId) {
        return db.query(
            `
            SELECT f.id, u.id as user_id, u.username, u.display_name, u.avatar_url, f.created_at
            FROM friendships f
            JOIN users u ON u.id = f.user_id
            WHERE f.friend_id = ? AND f.status = 'pending'
            ORDER BY f.created_at DESC
            `,
            [userId]
        );
    }

    static async getPendingSent(userId) {
        return db.query(
            `
            SELECT f.id, u.id as user_id, u.username, u.display_name, u.avatar_url, f.created_at
            FROM friendships f
            JOIN users u ON u.id = f.friend_id
            WHERE f.user_id = ? AND f.status = 'pending'
            ORDER BY f.created_at DESC
            `,
            [userId]
        );
    }

    static async areFriends(userId, friendId) {
        const row = await db.get(
            `
            SELECT 1 as is_friend FROM friendships
            WHERE (
                (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
            ) AND status = 'accepted'
            LIMIT 1
            `,
            [userId, friendId, friendId, userId]
        );
        return !!row;
    }
}

module.exports = Friendship;
