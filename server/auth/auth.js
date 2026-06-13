const jwt = require('jsonwebtoken');
const User = require('../models/User');

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET måste vara satt i produktion');
}

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';

class Auth {
    static generateToken(user) {
        return jwt.sign(
            {
                userId: user.id,
                username: user.username,
                displayName: user.display_name,
                isAdmin: user.is_admin === 1 || user.is_admin === true
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
    }

    static verifyToken(token) {
        try {
            return jwt.verify(token, JWT_SECRET);
        } catch {
            return null;
        }
    }

    static middleware() {
        return async (req, res, next) => {
            const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token || req.query?.token;

            if (!token) {
                req.user = null;
                return next();
            }

            const decoded = this.verifyToken(token);
            if (!decoded) {
                req.user = null;
                return next();
            }

            const user = await User.findById(decoded.userId);
            if (!user) {
                req.user = null;
                return next();
            }

            req.user = {
                id: user.id,
                username: user.username,
                displayName: user.display_name,
                avatarUrl: user.avatar_url,
                elo: user.elo_rating,
                isAdmin: user.is_admin === 1 || user.is_admin === true
            };
            next();
        };
    }

    static socketAuth(socket, next) {
        const token = socket.handshake.auth.token || socket.handshake.query.token;

        if (!token) {
            socket.user = null;
            return next();
        }

        const decoded = Auth.verifyToken(token);
        if (!decoded) {
            socket.user = null;
            return next();
        }

        User.findById(decoded.userId)
            .then(user => {
                if (user) {
                    socket.user = {
                        id: user.id,
                        username: user.username,
                        displayName: user.display_name,
                        avatarUrl: user.avatar_url,
                        elo: user.elo_rating,
                        isAdmin: user.is_admin === 1 || user.is_admin === true
                    };
                }
                next();
            })
            .catch(() => {
                socket.user = null;
                next();
            });
    }
}

module.exports = Auth;
