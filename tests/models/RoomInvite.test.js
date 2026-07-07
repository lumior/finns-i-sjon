jest.mock('../../server/config/database', () => ({
    get: jest.fn(),
    run: jest.fn(),
    query: jest.fn()
}));

const db = require('../../server/config/database');
const RoomInvite = require('../../server/models/RoomInvite');

describe('RoomInvite', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should create a new invite', async () => {
        db.get.mockResolvedValue(null);
        db.run.mockResolvedValue({ id: 1 });
        db.query.mockResolvedValue([]);

        await RoomInvite.create({
            roomId: 'ROOM1',
            roomName: 'Mitt rum',
            hostUserId: 1,
            friendUserId: 2
        });

        const insertCall = db.run.mock.calls.find(call => call[0].includes('INSERT INTO room_invites'));
        expect(insertCall[1]).toEqual(['ROOM1', 'Mitt rum', 1, 2]);
    });

    test('should return existing invite instead of duplicating', async () => {
        db.get.mockResolvedValue({ id: 5, room_id: 'ROOM1', friend_user_id: 2 });

        const result = await RoomInvite.create({
            roomId: 'ROOM1',
            roomName: 'Mitt rum',
            hostUserId: 1,
            friendUserId: 2
        });

        expect(result.id).toBe(5);
        const insertCall = db.run.mock.calls.find(call => call[0].includes('INSERT INTO room_invites'));
        expect(insertCall).toBeFalsy();
    });

    test('should get pending invites for a user', async () => {
        db.query.mockResolvedValue([
            { id: 1, room_id: 'ROOM1', room_name: 'Mitt rum', host_username: 'Alice', host_display_name: 'Alice' }
        ]);

        const result = await RoomInvite.getPendingForUser(2);

        expect(result).toHaveLength(1);
        expect(result[0].room_id).toBe('ROOM1');
    });

    test('should mark invite as delivered', async () => {
        db.run.mockResolvedValue({ changes: 1 });

        await RoomInvite.markDelivered(1);

        expect(db.run).toHaveBeenCalledWith('UPDATE room_invites SET delivered = 1 WHERE id = ?', [1]);
    });
});
