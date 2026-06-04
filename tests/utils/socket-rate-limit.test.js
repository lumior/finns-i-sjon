const { createSocketRateLimiter } = require('../../server/utils/socket-rate-limit');

function createMockSocket() {
    return {
        id: 'test-socket',
        emittedErrors: [],
        emit(event, data) {
            if (event === 'error') {
                this.emittedErrors.push(data);
            }
        }
    };
}

describe('createSocketRateLimiter', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('should allow requests within limit', () => {
        const socket = createMockSocket();
        const rateLimit = createSocketRateLimiter(socket);
        const handler = jest.fn();

        const wrapped = rateLimit('test_event', 3, 60000, handler);

        wrapped('a');
        wrapped('b');
        wrapped('c');

        expect(handler).toHaveBeenCalledTimes(3);
        expect(handler).toHaveBeenNthCalledWith(1, 'a');
        expect(handler).toHaveBeenNthCalledWith(2, 'b');
        expect(handler).toHaveBeenNthCalledWith(3, 'c');
        expect(socket.emittedErrors).toHaveLength(0);
    });

    test('should block requests exceeding limit and emit error', () => {
        const socket = createMockSocket();
        const rateLimit = createSocketRateLimiter(socket);
        const handler = jest.fn();

        const wrapped = rateLimit('test_event', 2, 60000, handler);

        wrapped('a');
        wrapped('b');
        wrapped('c');

        expect(handler).toHaveBeenCalledTimes(2);
        expect(socket.emittedErrors).toHaveLength(1);
        expect(socket.emittedErrors[0].message).toBe('För många förfrågningar. Vänta en stund.');
    });

    test('should reset counter after window expires', () => {
        const socket = createMockSocket();
        const rateLimit = createSocketRateLimiter(socket);
        const handler = jest.fn();

        const wrapped = rateLimit('test_event', 2, 60000, handler);

        wrapped('a');
        wrapped('b');
        wrapped('c');
        expect(handler).toHaveBeenCalledTimes(2);

        jest.advanceTimersByTime(60001);

        wrapped('d');
        expect(handler).toHaveBeenCalledTimes(3);
        expect(socket.emittedErrors).toHaveLength(1);
    });

    test('should track different events independently', () => {
        const socket = createMockSocket();
        const rateLimit = createSocketRateLimiter(socket);
        const handlerA = jest.fn();
        const handlerB = jest.fn();

        const wrappedA = rateLimit('event_a', 1, 60000, handlerA);
        const wrappedB = rateLimit('event_b', 1, 60000, handlerB);

        wrappedA('first');
        wrappedA('second');
        wrappedB('first');

        expect(handlerA).toHaveBeenCalledTimes(1);
        expect(handlerB).toHaveBeenCalledTimes(1);
        expect(socket.emittedErrors).toHaveLength(1);
    });

    test('should use default options when custom values omitted', () => {
        const socket = createMockSocket();
        const rateLimit = createSocketRateLimiter(socket);
        const handler = jest.fn();

        const wrapped = rateLimit('test_event', handler);

        // Anropa 61 gånger: default är 60 per minut
        for (let i = 0; i < 61; i++) {
            wrapped(i);
        }

        expect(handler).toHaveBeenCalledTimes(60);
        expect(socket.emittedErrors).toHaveLength(1);
    });

    test('should support custom defaults via options', () => {
        const socket = createMockSocket();
        const rateLimit = createSocketRateLimiter(socket, { defaultMax: 5, defaultWindowMs: 10000 });
        const handler = jest.fn();

        const wrapped = rateLimit('test_event', handler);

        for (let i = 0; i < 6; i++) {
            wrapped(i);
        }

        expect(handler).toHaveBeenCalledTimes(5);
        expect(socket.emittedErrors).toHaveLength(1);
    });

    test('should allow two-argument shorthand (eventName, handler)', () => {
        const socket = createMockSocket();
        const rateLimit = createSocketRateLimiter(socket);
        const handler = jest.fn();

        const wrapped = rateLimit('test_event', handler);

        wrapped('data');
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith('data');
    });

    test('should allow three-argument shorthand (eventName, max, handler)', () => {
        const socket = createMockSocket();
        const rateLimit = createSocketRateLimiter(socket);
        const handler = jest.fn();

        const wrapped = rateLimit('test_event', 3, handler);

        wrapped('a');
        wrapped('b');
        wrapped('c');
        wrapped('d');

        expect(handler).toHaveBeenCalledTimes(3);
        expect(socket.emittedErrors).toHaveLength(1);
    });

    test('should pass through async handler return values', async () => {
        const socket = createMockSocket();
        const rateLimit = createSocketRateLimiter(socket);
        const handler = jest.fn().mockResolvedValue('result');

        const wrapped = rateLimit('test_event', 3, 60000, handler);

        const promise = wrapped('data');
        await expect(promise).resolves.toBe('result');
    });
});
