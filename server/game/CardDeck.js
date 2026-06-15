const Theme = require('../models/Theme');

class CardDeck {
    constructor() {
        this.cards = [];
        this.discarded = [];
    }

    async init(themeIdOrFolder) {
        this.cards = [];
        let theme = null;
        if (/^\d+$/.test(String(themeIdOrFolder))) {
            theme = await Theme.findById(themeIdOrFolder);
        }
        if (!theme) {
            theme = await Theme.findByFolder(themeIdOrFolder);
        }
        const folderName = theme ? theme.folder_name : themeIdOrFolder;
        const pairs = theme ? await Theme.getPairs(theme.id) : await Theme.getPairsByFolder(themeIdOrFolder);

        if (pairs.length === 0) {
            console.warn(`Inga par hittades för tema ${themeIdOrFolder}, skapar tom kortlek`);
            return;
        }

        for (const pair of pairs) {
            const pairId = pair.pairId;
            const name = pair.name;
            const imagePath = pair.imagePath || `${folderName}/${pairId}.png`;

            this.cards.push({
                id: `${pairId}-a`,
                pairId,
                name,
                image: `/assets/cards/${imagePath}`
            });
            this.cards.push({
                id: `${pairId}-b`,
                pairId,
                name,
                image: `/assets/cards/${imagePath}`
            });
        }

        this.shuffle();
    }

    static async create(themeId) {
        const deck = new CardDeck();
        await deck.init(themeId);
        return deck;
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
