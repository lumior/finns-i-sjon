jest.mock('../../server/config/database', () => ({
    get: jest.fn(),
    run: jest.fn(),
    query: jest.fn()
}));

const db = require('../../server/config/database');
const User = require('../../server/models/User');

describe('User', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('setEmailVerified', () => {
        test('should update email_verified to 1', async () => {
            db.run.mockResolvedValue({});
            await User.setEmailVerified(1, true);
            expect(db.run).toHaveBeenCalledWith('UPDATE users SET email_verified = ? WHERE id = ?', [1, 1]);
        });

        test('should update email_verified to 0', async () => {
            db.run.mockResolvedValue({});
            await User.setEmailVerified(2, false);
            expect(db.run).toHaveBeenCalledWith('UPDATE users SET email_verified = ? WHERE id = ?', [0, 2]);
        });
    });

    describe('updatePassword', () => {
        test('should hash and update password', async () => {
            db.run.mockResolvedValue({});
            await User.updatePassword(1, 'newpassword123');
            expect(db.run).toHaveBeenCalledWith('UPDATE users SET password_hash = ? WHERE id = ?', [
                expect.any(String),
                1
            ]);
        });
    });

    describe('createToken', () => {
        test('should insert token with default 24h expiry', async () => {
            db.run.mockResolvedValue({ id: 5 });
            await User.createToken(1, 'abc123', 'email_verify');
            expect(db.run).toHaveBeenCalledWith(
                'INSERT INTO user_tokens (user_id, token, type, expires_at) VALUES (?, ?, ?, ?)',
                expect.arrayContaining([1, 'abc123', 'email_verify', expect.any(String)])
            );
        });

        test('should insert token with custom expiry', async () => {
            db.run.mockResolvedValue({ id: 5 });
            await User.createToken(1, 'reset456', 'password_reset', 1);
            expect(db.run).toHaveBeenCalledWith(
                'INSERT INTO user_tokens (user_id, token, type, expires_at) VALUES (?, ?, ?, ?)',
                expect.arrayContaining([1, 'reset456', 'password_reset', expect.any(String)])
            );
        });
    });

    describe('findToken', () => {
        test('should return active token', async () => {
            db.get.mockResolvedValue({ id: 1, user_id: 2, token: 'abc', type: 'email_verify' });
            const result = await User.findToken('abc', 'email_verify');
            expect(result).not.toBeNull();
            expect(db.get).toHaveBeenCalledWith(
                expect.stringContaining('token = ? AND type = ? AND used = 0 AND expires_at > CURRENT_TIMESTAMP'),
                ['abc', 'email_verify']
            );
        });

        test('should return null for expired token', async () => {
            db.get.mockResolvedValue(null);
            const result = await User.findToken('expired', 'email_verify');
            expect(result).toBeNull();
        });
    });

    describe('markTokenUsed', () => {
        test('should update used to 1', async () => {
            db.run.mockResolvedValue({});
            await User.markTokenUsed('abc');
            expect(db.run).toHaveBeenCalledWith('UPDATE user_tokens SET used = 1 WHERE token = ?', ['abc']);
        });
    });

    describe('deleteUserTokens', () => {
        test('should delete tokens by user and type', async () => {
            db.run.mockResolvedValue({});
            await User.deleteUserTokens(1, 'email_verify');
            expect(db.run).toHaveBeenCalledWith('DELETE FROM user_tokens WHERE user_id = ? AND type = ?', [
                1,
                'email_verify'
            ]);
        });
    });
});
