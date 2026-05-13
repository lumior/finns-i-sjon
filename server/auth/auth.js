const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET;

class Auth {
    static generateToken(user) {
        return jwt.sign(
            { 
                userId: user.id, 
                username: user.username,
                displayName: user.display_name 
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
    }

    static verifyToken(token) {
        try {
            return jwt.verify(token, JWT_SECRET);
        } catch (e) {
            return null;
        }
    }

    static middleware() {
        return async (req, res, next) => {
            const token = req.headers.authorization?.replace('Bearer ', '') || 
                         req.cookies?.token ||
                         req.query?.token;
            
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
                elo: user.elo_rating
            };
            next();
        };
    }

    static socketAuth(socket, next) {
        const token = socket.handshake.auth.token || 
                       socket.handshake.query.token;
        
        if (!token) {
            socket.user = null;
            return next();
        }

        const decoded = Auth.verifyToken(token);
        if (!decoded) {
            socket.user = null;
            return next();
        }

        User.findById(decoded.userId).then(user => {
            if (user) {
                socket.user = {
                    id: user.id,
                    username: user.username,
                    displayName: user.display_name,
                    avatarUrl: user.avatar_url,
                    elo: user.elo_rating
                };
            }
            next();
        }).catch(() => {
            socket.user = null;
            next();
        });
    }
}

module.exports = Auth;
