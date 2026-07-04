jest.mock('../../server/config/database', () => ({
    get: jest.fn(),
    run: jest.fn(),
    query: jest.fn()
}));

const db = require('../../server/config/database');
const Friendship = require('../../server/models/Friendship');

describe('Friendship', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('sendRequest', () => {
        test('should reject self-friend-request', async () => {
            const result = await Friendship.sendRequest(1, 1);
            expect(result.success).toBe(false);
            expect(result.error).toBe('Du kan inte skicka vänförfrågan till dig själv');
            expect(db.run).not.toHaveBeenCalled();
        });

        test('should send request when no existing friendship', async () => {
            db.get.mockResolvedValue(null);
            db.run.mockResolvedValue({ id: 7 });

            const result = await Friendship.sendRequest(1, 2);

            expect(result.success).toBe(true);
            expect(db.run).toHaveBeenCalledWith(
                'INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, ?)',
                [1, 2, 'pending']
            );
        });

        test('should reject duplicate pending request', async () => {
            db.get.mockResolvedValueOnce({ status: 'pending' });

            const result = await Friendship.sendRequest(1, 2);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Vänförfrågan redan skickad');
        });

        test('should reject if already friends', async () => {
            db.get.mockResolvedValueOnce(null).mockResolvedValueOnce({ status: 'accepted' });

            const result = await Friendship.sendRequest(1, 2);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Ni är redan vänner');
        });
    });

    describe('acceptRequest', () => {
        test('should accept a valid pending request', async () => {
            db.get.mockResolvedValue({ id: 5, user_id: 1, friend_id: 2, status: 'pending' });
            db.run.mockResolvedValue({});

            const result = await Friendship.acceptRequest(5, 2);

            expect(result.success).toBe(true);
            expect(db.run).toHaveBeenCalledWith("UPDATE friendships SET status = 'accepted' WHERE id = ?", [5]);
        });

        test('should reject if request not found', async () => {
            db.get.mockResolvedValue(null);

            const result = await Friendship.acceptRequest(5, 2);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Vänförfrågan hittades inte');
        });

        test('should reject if user is not the recipient', async () => {
            db.get.mockResolvedValue({ id: 5, user_id: 1, friend_id: 2, status: 'pending' });

            const result = await Friendship.acceptRequest(5, 99);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Du kan inte acceptera denna förfrågan');
        });

        test('should reject if request is not pending', async () => {
            db.get.mockResolvedValue({ id: 5, user_id: 1, friend_id: 2, status: 'accepted' });

            const result = await Friendship.acceptRequest(5, 2);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Förfrågan är inte längre aktiv');
        });
    });

    describe('rejectRequest', () => {
        test('should reject and delete a valid pending request', async () => {
            db.get.mockResolvedValue({ id: 5, user_id: 1, friend_id: 2, status: 'pending' });
            db.run.mockResolvedValue({});

            const result = await Friendship.rejectRequest(5, 2);

            expect(result.success).toBe(true);
            expect(db.run).toHaveBeenCalledWith('DELETE FROM friendships WHERE id = ?', [5]);
        });

        test('should reject if user is not the recipient', async () => {
            db.get.mockResolvedValue({ id: 5, user_id: 1, friend_id: 2, status: 'pending' });

            const result = await Friendship.rejectRequest(5, 99);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Du kan inte avböja denna förfrågan');
        });
    });

    describe('removeFriend', () => {
        test('should delete friendship in both directions', async () => {
            db.run.mockResolvedValue({});

            const result = await Friendship.removeFriend(1, 2);

            expect(result.success).toBe(true);
            expect(db.run).toHaveBeenCalledWith(
                'DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
                [1, 2, 2, 1]
            );
        });
    });

    describe('areFriends', () => {
        test('should return true if accepted friendship exists', async () => {
            db.get.mockResolvedValue({ is_friend: 1 });

            const result = await Friendship.areFriends(1, 2);

            expect(result).toBe(true);
        });

        test('should return false if no friendship exists', async () => {
            db.get.mockResolvedValue(null);

            const result = await Friendship.areFriends(1, 2);

            expect(result).toBe(false);
        });
    });

    describe('getFriends', () => {
        test('should query accepted friends in both directions', async () => {
            db.query.mockResolvedValue([{ id: 2, username: 'Bob', display_name: 'Bob', is_online: 1 }]);

            const result = await Friendship.getFriends(1);

            expect(result).toHaveLength(1);
            expect(result[0].username).toBe('Bob');
            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining("WHERE f.user_id = ? AND f.status = 'accepted'"),
                [1, 1]
            );
        });
    });

    describe('getPendingReceived', () => {
        test('should query pending requests received by user', async () => {
            db.query.mockResolvedValue([{ id: 5, user_id: 2, username: 'Bob', display_name: 'Bob' }]);

            const result = await Friendship.getPendingReceived(1);

            expect(result).toHaveLength(1);
            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining("WHERE f.friend_id = ? AND f.status = 'pending'"),
                [1]
            );
        });
    });

    describe('getOnlineFriends', () => {
        test('should query accepted online friends in both directions', async () => {
            db.query.mockResolvedValue([
                { id: 2, username: 'Bob', display_name: 'Bob', is_online: 1 },
                { id: 3, username: 'Carol', display_name: 'Carol', is_online: 1 }
            ]);

            const result = await Friendship.getOnlineFriends(1);

            expect(result).toHaveLength(2);
            expect(result[0].username).toBe('Bob');
            expect(db.query).toHaveBeenCalledWith(expect.stringContaining('AND u.is_online = 1'), [1, 1]);
        });
    });
});
