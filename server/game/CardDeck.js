const { SUITS, RANKS } = require('../utils/constants');

class CardDeck {
    constructor() {
        this.cards = [];
        this.discarded = [];
        this.init();
    }

    init() {
        this.cards = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                this.cards.push({
                    id: `${suit}-${rank}`,
                    suit,
                    rank,
                    value: this.getCardValue(rank)
                });
            }
        }
        this.shuffle();
    }

    getCardValue(rank) {
        const values = { J: 11, Q: 12, K: 13, A: 14 };
        return values[rank] || parseInt(rank);
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    draw(count = 1) {
        const drawn = [];
        for (let i = 0; i < count && this.cards.length > 0; i++) {
            drawn.push(this.cards.pop());
        }
        return count === 1 ? drawn[0] : drawn;
    }

    isEmpty() {
        return this.cards.length === 0;
    }

    remaining() {
        return this.cards.length;
    }
}

module.exports = CardDeck;
