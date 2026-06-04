/**
 * Socket.IO rate-limiting utility
 *
 * Lättvikts in-memory rate limiter för individuella Socket.IO-events.
 * Används genom att wrappa varje event-handler:
 *
 *   const rateLimit = createSocketRateLimiter(socket);
 *   socket.on('chat_message', rateLimit('chat_message', 30, 60000, handler));
 */

const DEFAULT_WINDOW_MS = 60 * 1000;

/**
 * Skapar en rate-limit-funktion bunden till en specifik socket.
 *
 * @param {object} socket - Socket.IO socket-objektet (måste ha .emit())
 * @param {object} [options]
 * @param {number} [options.defaultMax=60] - Standard max antal events per fönster
 * @param {number} [options.defaultWindowMs=60000] - Standard tidsfönster i ms
 * @returns {Function} rateLimit-wrapper
 */
function createSocketRateLimiter(socket, options = {}) {
    const defaultMax = options.defaultMax || 60;
    const defaultWindowMs = options.defaultWindowMs || DEFAULT_WINDOW_MS;
    const limits = new Map();

    /**
     * @param {string} eventName - Event-namn för loggning och separata buckets
     * @param {number} [max] - Max antal tillåtna anrop inom fönstret
     * @param {number} [windowMs] - Tidsfönster i millisekunder
     * @param {Function} handler - Event-handler som ska köras om inom gränsen
     * @returns {Function}
     */
    return function rateLimit(eventName, max, windowMs, handler) {
        if (typeof max === 'function') {
            handler = max;
            max = defaultMax;
            windowMs = defaultWindowMs;
        } else if (typeof windowMs === 'function') {
            handler = windowMs;
            windowMs = defaultWindowMs;
        }

        max = max || defaultMax;
        windowMs = windowMs || defaultWindowMs;

        return function rateLimitedHandler(data) {
            const now = Date.now();
            const limit = limits.get(eventName);

            if (!limit || now >= limit.resetTime) {
                limits.set(eventName, { count: 1, resetTime: now + windowMs });
                return handler(data);
            }

            if (limit.count >= max) {
                console.log(`⛔ Rate limit överskriden för socket ${socket.id} på event "${eventName}"`);
                socket.emit('error', { message: 'För många förfrågningar. Vänta en stund.' });
                return;
            }

            limit.count += 1;
            return handler(data);
        };
    };
}

module.exports = { createSocketRateLimiter };
