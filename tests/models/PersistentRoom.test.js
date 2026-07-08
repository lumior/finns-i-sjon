jest.mock('../../server/config/database', () => ({
    get: jest.fn(),
    run: jest.fn(),
    query: jest.fn()
}));

const db = require('../../server/config/database');
const PersistentRoom = require('../../server/models/PersistentRoom');

describe('PersistentRoom', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('create', () => {
        test('should create a persistent room with defaults', async () => {
            db.run.mockResolvedValue({ id: 1 });
            db.get.mockResolvedValue({
                room_id: 'ABCD1234',
                owner_user_id: 1,
                room_name: 'Mitt bord',
                game_type: 'standard',
                max_players: 4,
                allow_ai: 1,
                turn_timer: 1,
                spectator_mode: 1,
                deck_theme: 'standard',
                password_hash: null,
                is_private: 0,
                is_active: 1,
                created_at: '2026-01-01',
                updated_at: '2026-01-01'
            });

            const result = await PersistentRoom.create({
                roomId: 'ABCD1234',
                ownerUserId: 1,
                roomName: 'Mitt bord'
            });

            expect(result.success).toBeUndefined();
            expect(result.roomId).toBe('ABCD1234');
            expect(result.ownerUserId).toBe(1);
            expect(result.allowAI).toBe(true);
            expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO persistent_rooms'), [
                'ABCD1234',
                1,
                'Mitt bord',
                'standard',
                6,
                1,
                1,
                1,
                'standard',
                null,
                0
            ]);
        });
    });

    describe('getById', () => {
        test('should return null when room does not exist', async () => {
            db.get.mockResolvedValue(null);
            const result = await PersistentRoom.getById('NONE');
            expect(result).toBeNull();
        });

        test('should normalize boolean fields', async () => {
            db.get.mockResolvedValue({
                room_id: 'ABCD1234',
                owner_user_id: 1,
                room_name: 'Mitt bord',
                game_type: 'standard',
                max_players: 4,
                allow_ai: 0,
                turn_timer: 0,
                spectator_mode: 0,
                deck_theme: 'frukt',
                password_hash: 'hash',
                is_private: 1,
                is_active: 0,
                created_at: '2026-01-01',
                updated_at: '2026-01-01'
            });

            const result = await PersistentRoom.getById('ABCD1234');

            expect(result.allowAI).toBe(false);
            expect(result.turnTimer).toBe(false);
            expect(result.spectatorMode).toBe(false);
            expect(result.isPrivate).toBe(true);
            expect(result.isActive).toBe(false);
            expect(result.deckTheme).toBe('frukt');
        });
    });

    describe('getByOwner', () => {
        test('should return rooms ordered by updated_at', async () => {
            db.query.mockResolvedValue([
                {
                    room_id: 'ROOM2',
                    owner_user_id: 1,
                    room_name: 'Bord 2',
                    allow_ai: 1,
                    turn_timer: 1,
                    spectator_mode: 1,
                    deck_theme: 'standard',
                    is_private: 0,
                    is_active: 1,
                    created_at: '2026-01-02',
                    updated_at: '2026-01-02'
                },
                {
                    room_id: 'ROOM1',
                    owner_user_id: 1,
                    room_name: 'Bord 1',
                    allow_ai: 1,
                    turn_timer: 1,
                    spectator_mode: 1,
                    deck_theme: 'standard',
                    is_private: 0,
                    is_active: 1,
                    created_at: '2026-01-01',
                    updated_at: '2026-01-01'
                }
            ]);

            const result = await PersistentRoom.getByOwner(1);

            expect(result.length).toBe(2);
            expect(result[0].roomId).toBe('ROOM2');
            expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY updated_at DESC'), [1]);
        });
    });

    describe('getActivePublic', () => {
        test('should return active public rooms with owner names', async () => {
            db.query.mockResolvedValue([
                {
                    room_id: 'PUBLIC1',
                    owner_user_id: 1,
                    owner_display_name: 'Alice',
                    owner_username: 'alice',
                    room_name: 'Publik bord',
                    game_type: 'standard',
                    max_players: 4,
                    allow_ai: 1,
                    turn_timer: 1,
                    spectator_mode: 1,
                    deck_theme: 'standard',
                    password_hash: null,
                    is_private: 0,
                    is_active: 1,
                    created_at: '2026-01-01',
                    updated_at: '2026-01-01'
                }
            ]);

            const result = await PersistentRoom.getActivePublic();

            expect(result.length).toBe(1);
            expect(result[0].roomId).toBe('PUBLIC1');
            expect(result[0].ownerDisplayName).toBe('Alice');
            expect(result[0].ownerUsername).toBe('alice');
            expect(result[0].isPrivate).toBe(false);
            expect(result[0].isActive).toBe(true);
            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('WHERE pr.is_active = ? AND pr.is_private = ?'),
                [true, false]
            );
        });
    });

    describe('delete', () => {
        test('should allow owner to delete', async () => {
            db.get.mockResolvedValue({ room_id: 'ABCD1234', owner_user_id: 1 });
            db.run.mockResolvedValue({});

            const result = await PersistentRoom.delete('ABCD1234', 1);

            expect(result.success).toBe(true);
            expect(db.run).toHaveBeenCalledWith('DELETE FROM persistent_rooms WHERE room_id = ?', ['ABCD1234']);
        });

        test('should reject deletion by non-owner', async () => {
            db.get.mockResolvedValue({ room_id: 'ABCD1234', owner_user_id: 1 });

            const result = await PersistentRoom.delete('ABCD1234', 2);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Du äger inte detta rum');
            expect(db.run).not.toHaveBeenCalled();
        });
    });
});
