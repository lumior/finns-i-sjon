const GameEngine = require('../../server/game/GameEngine');
const { ensureTestTheme } = require('./test-theme-helper');

describe('GameEngine', () => {
    let game;

    beforeEach(async () => {
        await ensureTestTheme();
        game = new GameEngine('TEST', { maxPlayers: 4 });
    });

    test('should add a player', () => {
        game.addPlayer('socket1', 'Alice');
        expect(game.players.length).toBe(1);
        expect(game.players[0].name).toBe('Alice');
    });

    test('should not add duplicate socketId', () => {
        game.addPlayer('socket1', 'Alice');
        const result = game.addPlayer('socket1', 'Bob');
        expect(result.success).toBe(false);
    });

    test('should start game with enough players', async () => {
        game.addPlayer('socket1', 'Alice');
        game.addPlayer('socket2', 'Bob');
        const result = await game.startGame();
        expect(result).toBe(true);
        expect(game.state).toBe('playing');
    });

    test('should deal 5 cards each in multi-player game', async () => {
        game.addPlayer('socket1', 'Alice');
        game.addPlayer('socket2', 'Bob');
        await game.startGame();
        // 5 cards dealt, but pairs may be extracted immediately
        expect(game.players[0].hand.length + game.players[0].pairs.length * 2).toBeGreaterThanOrEqual(3);
        expect(game.players[1].hand.length + game.players[1].pairs.length * 2).toBeGreaterThanOrEqual(3);
    });

    test('should deal 7 cards each in 1 human + 1 AI game', async () => {
        game.addPlayer('socket1', 'Alice');
        game.addAI('smart');
        await game.startGame();
        expect(game.players[0].hand.length + game.players[0].pairs.length * 2).toBeGreaterThanOrEqual(5);
        expect(game.players[1].hand.length + game.players[1].pairs.length * 2).toBeGreaterThanOrEqual(5);
    });

    test('should identify pairs at game start', async () => {
        game.addPlayer('socket1', 'Alice');
        game.addPlayer('socket2', 'Bob');
        await game.startGame();
        // After dealing and extracting pairs, cards should be distributed among
        // hands, deck, pile, and pairs
        expect(game.deck.remaining() + game.pile.length).toBeGreaterThan(0);
        expect(game.players[0].hand.length + game.players[0].pairs.length * 2).toBeGreaterThanOrEqual(3);
        expect(game.players[1].hand.length + game.players[1].pairs.length * 2).toBeGreaterThanOrEqual(3);
    });

    test('should toggle ready status', () => {
        game.addPlayer('socket1', 'Alice');
        const result = game.toggleReady('socket1');
        expect(result.ready).toBe(true);
        const result2 = game.toggleReady('socket1');
        expect(result2.ready).toBe(false);
    });

    test('should mark player as disconnected on remove during game', async () => {
        game.addPlayer('socket1', 'Alice');
        game.addPlayer('socket2', 'Bob');
        await game.startGame();
        const result = game.removePlayer('socket1');
        expect(result.disconnected).toBe(true);
        expect(game.players[0].connected).toBe(false);
        expect(game.players.length).toBe(2); // not removed, just disconnected
    });

    test('should force remove a player', async () => {
        game.addPlayer('socket1', 'Alice');
        game.addPlayer('socket2', 'Bob');
        await game.startGame();
        const result = game.forceRemovePlayer('socket1');
        expect(result.removed).toBe(true);
        expect(game.players.length).toBe(1);
    });

    test('should reconnect a disconnected player', async () => {
        game.addPlayer('socket1', 'Alice');
        game.addPlayer('socket2', 'Bob');
        await game.startGame();
        game.players[0].connected = false;
        const result = game.reconnectPlayer('socket1', 'socket1-new');
        expect(result).not.toBeNull();
        expect(game.players[0].connected).toBe(true);
        expect(game.players[0].socketId).toBe('socket1-new');
    });

    test('should reconnect by token', async () => {
        game.addPlayer('socket1', 'Alice');
        const token = game.players[0].reconnectToken;
        game.players[0].connected = false;
        const result = game.reconnectPlayer('wrong-socket', 'socket-new', null, token);
        expect(result).not.toBeNull();
        expect(game.players[0].connected).toBe(true);
    });

    test('calculateWinner should rank players by pairs', async () => {
        game.addPlayer('socket1', 'Alice');
        game.addPlayer('socket2', 'Bob');
        await game.startGame();
        // Simulate game end by emptying deck
        game.deck.cards = [];
        game.pile = [];
        game.players.forEach(p => {
            p.hand = [];
        });
        const standings = game.calculateWinner();
        expect(standings.length).toBe(2);
        expect(standings[0]).toHaveProperty('rank');
        expect(standings[0]).toHaveProperty('pairs');
    });

    test('should validate askForCards', async () => {
        game.addPlayer('socket1', 'Alice');
        game.addPlayer('socket2', 'Bob');
        await game.startGame();

        // Inte din tur
        game.currentPlayerIndex = 1;
        const result = game.askForCards('socket1', game.players[1].id, 'pair-1');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Inte din tur');

        // Kan inte fråga sig själv
        game.currentPlayerIndex = 0;
        const result2 = game.askForCards('socket1', game.players[0].id, 'pair-1');
        expect(result2.success).toBe(false);
        expect(result2.error).toBe('Du kan inte fråga dig själv');

        // Måste ha kortet själv
        game.players[0].hand = [];
        const result3 = game.askForCards('socket1', game.players[1].id, 'pair-1');
        expect(result3.success).toBe(false);
        expect(result3.error).toContain('Du måste ha');
    });

    test('should handle successful askForCards', async () => {
        game.addPlayer('socket1', 'Alice');
        game.addPlayer('socket2', 'Bob');
        await game.startGame();

        game.players[0].hand = [{ pairId: 'pair-5', name: 'Par 5', id: 'pair-5-a' }];
        game.players[1].hand = [
            { pairId: 'pair-5', name: 'Par 5', id: 'pair-5-b' },
            { pairId: 'pair-5', name: 'Par 5', id: 'pair-5-c' }
        ];
        game.currentPlayerIndex = 0;

        const result = game.askForCards('socket1', game.players[1].id, 'pair-5');
        expect(result.success).toBe(true);
        expect(result.gotCards).toBe(true);
        expect(result.cards.length).toBe(2);
        expect(game.players[0].successfulAsks).toBe(1);
    });

    test('should handle fish in askForCards', async () => {
        game.addPlayer('socket1', 'Alice');
        game.addPlayer('socket2', 'Bob');
        await game.startGame();

        game.players[0].hand = [{ pairId: 'pair-5', name: 'Par 5', id: 'pair-5-a' }];
        game.players[1].hand = [{ pairId: 'pair-K', name: 'Par K', id: 'pair-K-a' }];
        game.currentPlayerIndex = 0;

        const result = game.askForCards('socket1', game.players[1].id, 'pair-5');
        expect(result.success).toBe(true);
        expect(result.gotCards).toBe(false);
        expect(result.drawnCard).toBeDefined();
        expect(game.players[0].failedAsks).toBe(1);
    });

    test('should handle surrender', async () => {
        game.addPlayer('socket1', 'Alice');
        game.addPlayer('socket2', 'Bob');
        await game.startGame();

        const result = game.surrender('socket1');
        expect(result.success).toBe(true);
        expect(result.player.surrendered).toBe(true);
        expect(game.players[0].connected).toBe(false);
    });
});
