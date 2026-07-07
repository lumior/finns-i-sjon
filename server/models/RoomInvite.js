const db = require('../config/database');

const INVITE_EXPIRY_HOURS = 24;

class RoomInvite {
    static async create({ roomId, roomName, hostUserId, friendUserId }) {
        const hostId = parseInt(hostUserId, 10);
        const friendId = parseInt(friendUserId, 10);

        await this.cleanupExpired();

        const existing = await this.getByRoomAndFriend(roomId, friendId);
        if (existing) {
            return existing;
        }

        const result = await db.run(
            `INSERT INTO room_invites (room_id, room_name, host_user_id, friend_user_id, delivered)
             VALUES (?, ?, ?, ?, 0)`,
            [roomId, roomName || roomId, hostId, friendId]
        );

        return this.getById(result.id);
    }

    static async getById(inviteId) {
        return db.get(`SELECT * FROM room_invites WHERE id = ?`, [parseInt(inviteId, 10)]);
    }

    static async getByRoomAndFriend(roomId, friendUserId) {
        return db.get(`SELECT * FROM room_invites WHERE room_id = ? AND friend_user_id = ?`, [
            roomId,
            parseInt(friendUserId, 10)
        ]);
    }

    static async getPendingForUser(userId) {
        await this.cleanupExpired();

        return db.query(
            `
            SELECT ri.id, ri.room_id, ri.room_name, ri.created_at,
                   u.id as host_id, u.username as host_username, u.display_name as host_display_name, u.avatar_url as host_avatar_url
            FROM room_invites ri
            JOIN users u ON u.id = ri.host_user_id
            WHERE ri.friend_user_id = ? AND ri.delivered = 0
            ORDER BY ri.created_at DESC
            `,
            [parseInt(userId, 10)]
        );
    }

    static async markDelivered(inviteId) {
        return db.run(`UPDATE room_invites SET delivered = 1 WHERE id = ?`, [parseInt(inviteId, 10)]);
    }

    static async cleanupExpired() {
        const sql = db.isPostgres
            ? `DELETE FROM room_invites WHERE created_at < NOW() - INTERVAL '${INVITE_EXPIRY_HOURS} hours'`
            : `DELETE FROM room_invites WHERE created_at < DATETIME('now', '-${INVITE_EXPIRY_HOURS} hours')`;
        return db.run(sql);
    }
}

module.exports = RoomInvite;
