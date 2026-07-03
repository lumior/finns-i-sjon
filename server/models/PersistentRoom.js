const db = require('../config/database');

class PersistentRoom {
    static async create(roomData) {
        const {
            roomId,
            ownerUserId,
            roomName,
            gameType = 'standard',
            maxPlayers = 6,
            allowAI = true,
            turnTimer = true,
            spectatorMode = true,
            deckTheme = 'standard',
            passwordHash = null,
            isPrivate = false
        } = roomData;

        try {
            await db.run(
                `INSERT INTO persistent_rooms
                 (room_id, owner_user_id, room_name, game_type, max_players, allow_ai, turn_timer, spectator_mode, deck_theme, password_hash, is_private)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    roomId,
                    ownerUserId,
                    roomName,
                    gameType,
                    maxPlayers,
                    allowAI ? 1 : 0,
                    turnTimer ? 1 : 0,
                    spectatorMode ? 1 : 0,
                    deckTheme,
                    passwordHash,
                    isPrivate ? 1 : 0
                ]
            );
        } catch (err) {
            console.error('❌ PersistentRoom.create failed:', err.message, { roomId, ownerUserId });
            throw err;
        }

        return this.getById(roomId);
    }

    static async getById(roomId) {
        const row = await db.get('SELECT * FROM persistent_rooms WHERE room_id = ?', [roomId]);
        if (!row) {
            return null;
        }
        return this._normalize(row);
    }

    static async getByOwner(userId) {
        const rows = await db.query('SELECT * FROM persistent_rooms WHERE owner_user_id = ? ORDER BY updated_at DESC', [
            userId
        ]);
        return rows.map(r => this._normalize(r));
    }

    static async update(roomId, updates) {
        const allowed = [
            'room_name',
            'game_type',
            'max_players',
            'allow_ai',
            'turn_timer',
            'spectator_mode',
            'deck_theme',
            'password_hash',
            'is_private',
            'is_active'
        ];
        const fields = [];
        const values = [];

        for (const key of allowed) {
            if (key in updates) {
                fields.push(`${key} = ?`);
                values.push(updates[key]);
            }
        }

        if (fields.length === 0) {
            return this.getById(roomId);
        }

        values.push(roomId);
        await db.run(`UPDATE persistent_rooms SET ${fields.join(', ')} WHERE room_id = ?`, values);
        return this.getById(roomId);
    }

    static async delete(roomId, userId) {
        const room = await this.getById(roomId);
        if (!room) {
            return { success: false, error: 'Rummet hittades inte' };
        }
        if (room.ownerUserId !== userId) {
            return { success: false, error: 'Du äger inte detta rum' };
        }

        await db.run('DELETE FROM persistent_rooms WHERE room_id = ?', [roomId]);
        return { success: true };
    }

    static async setActive(roomId, isActive) {
        await db.run('UPDATE persistent_rooms SET is_active = ? WHERE room_id = ?', [isActive ? 1 : 0, roomId]);
        return this.getById(roomId);
    }

    static _normalize(row) {
        return {
            roomId: row.room_id,
            ownerUserId: row.owner_user_id,
            roomName: row.room_name,
            gameType: row.game_type,
            maxPlayers: row.max_players,
            allowAI: Boolean(row.allow_ai),
            turnTimer: Boolean(row.turn_timer),
            spectatorMode: Boolean(row.spectator_mode),
            deckTheme: row.deck_theme,
            passwordHash: row.password_hash,
            isPrivate: Boolean(row.is_private),
            isActive: Boolean(row.is_active),
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

module.exports = PersistentRoom;
