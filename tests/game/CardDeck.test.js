const CardDeck = require('../../server/game/CardDeck');

describe('CardDeck', () => {
    let deck;

    beforeEach(() => {
        deck = new CardDeck();
    });

    test('should initialize with 52 cards', () => {
        expect(deck.cards.length).toBe(52);
    });

    test('shuffle should change card order', () => {
        const originalOrder = [...deck.cards];
        deck.shuffle();
        expect(deck.cards).not.toEqual(originalOrder);
    });

    test('draw should remove one card', () => {
        const card = deck.draw();
        expect(card).toBeDefined();
        expect(deck.cards.length).toBe(51);
    });

    test('draw should return undefined when empty', () => {
        while (!deck.isEmpty()) {
            deck.draw();
        }
        expect(deck.draw()).toBeUndefined();
        expect(deck.isEmpty()).toBe(true);
    });

    test('draw multiple should return array', () => {
        const cards = deck.draw(5);
        expect(Array.isArray(cards)).toBe(true);
        expect(cards.length).toBe(5);
        expect(deck.cards.length).toBe(47);
    });

    test('remaining should track cards left', () => {
        expect(deck.remaining()).toBe(52);
        deck.draw(10);
        expect(deck.remaining()).toBe(42);
    });
});
