const AIPlayer = require('../../server/game/AIPlayer');

describe('AIPlayer', () => {
    let ai;

    beforeEach(() => {
        ai = new AIPlayer('smart', 'TestAI');
    });

    test('should initialize with empty hand', () => {
        expect(ai.hand.length).toBe(0);
    });

    test('should have correct difficulty and name', () => {
        expect(ai.difficulty).toBe('smart');
        expect(ai.name).toBe('TestAI');
        expect(ai.id).toMatch(/^ai-/);
    });

    test('should remember asked cards', () => {
        ai.updateMemory({
            type: 'ask',
            playerId: 'p1',
            targetId: 'p2',
            pairId: 'pair-7',
            success: true
        });
        expect(ai.memory.askedCards.has('p1')).toBe(true);
        const asked = ai.memory.askedCards.get('p1');
        expect(asked['pair-7']).toBeDefined();
        expect(asked['pair-7'].count).toBe(1);
    });

    test('should make a decision with cards', () => {
        ai.hand = [
            { pairId: 'pair-7', name: 'Par 7' },
            { pairId: 'pair-7', name: 'Par 7' },
            { pairId: 'pair-K', name: 'Par K' }
        ];
        const choice = ai.makeDecision({ deckRemaining: 40 }, [
            { id: 'p1', name: 'Alice', socketId: 's1', connected: true, cardCount: 5 },
            { id: 'p2', name: 'Bob', socketId: 's2', connected: true, cardCount: 5 }
        ]);
        expect(choice).toBeDefined();
        expect(choice).toHaveProperty('targetId');
        expect(choice).toHaveProperty('pairId');
        expect(['pair-7', 'pair-K']).toContain(choice.pairId);
    });

    test('should return null with empty hand', () => {
        const choice = ai.makeDecision({ deckRemaining: 40 }, [
            { id: 'p1', name: 'Alice', socketId: 's1', connected: true, cardCount: 5 }
        ]);
        expect(choice).toBeNull();
    });

    test('should prune memory when over capacity', () => {
        ai.memoryCapacity = 5;
        for (let i = 0; i < 10; i++) {
            ai.updateMemory({
                type: 'ask',
                playerId: 'p1',
                targetId: 'p2',
                pairId: `pair-${i}`,
                success: false,
                cards: [{ pairId: `pair-${i}` }]
            });
        }
        // Memory should have been pruned to stay near capacity
        let total = ai.memory.fishedCards.length;
        for (const asked of ai.memory.askedCards.values()) {
            total += Object.keys(asked).length;
        }
        expect(total).toBeLessThanOrEqual(ai.memoryCapacity + 5); // allow some slack
    });

    test('should track consecutive asks on success', () => {
        expect(ai.consecutiveAsks).toBe(0);
        ai.updateMemory({
            type: 'ask',
            playerId: 'p1',
            targetId: 'p2',
            pairId: 'pair-7',
            success: true
        });
        expect(ai.consecutiveAsks).toBe(1);
    });

    test('should reset consecutive asks on failure', () => {
        ai.consecutiveAsks = 3;
        ai.updateMemory({
            type: 'ask',
            playerId: 'p1',
            targetId: 'p2',
            pairId: 'pair-7',
            success: false
        });
        expect(ai.consecutiveAsks).toBe(0);
    });

    test('should work for all difficulties', () => {
        const difficulties = ['easy', 'smart', 'expert', 'master'];
        difficulties.forEach(diff => {
            const testAi = new AIPlayer(diff, `AI-${diff}`);
            testAi.hand = [
                { pairId: 'pair-A', name: 'Par A' },
                { pairId: 'pair-2', name: 'Par 2' }
            ];
            const choice = testAi.makeDecision({ deckRemaining: 40 }, [
                { id: 'p1', name: 'Alice', socketId: 's1', connected: true, cardCount: 3 }
            ]);
            expect(choice).toBeDefined();
            expect(choice).toHaveProperty('targetId');
            expect(choice).toHaveProperty('pairId');
        });
    });
});
