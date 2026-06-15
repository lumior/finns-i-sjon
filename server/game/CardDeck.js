const Theme = require('../models/Theme');
const fs = require('fs');
const path = require('path');

const CARDS_DIR = path.join(__dirname, '../../public_html/assets/cards');

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
            const pairId = pair.pair_id;
            const name = pair.name;
            let imagePath = pair.image_path;

            if (!imagePath) {
                // Fallback: försök hitta bilden i filsystemet
                const newPath = path.join(CARDS_DIR, folderName, `${pairId}.png`);
                if (fs.existsSync(newPath)) {
                    imagePath = `${folderName}/${pairId}.png`;
                } else {
                    const rank = String(pairId).replace(/^pair-/, '');
                    const legacyFolders = ['aubergine', 'radish', 'pepper', 'potato'];
                    for (const sub of legacyFolders) {
                        const legacyPath = path.join(CARDS_DIR, folderName, sub, `${rank}.png`);
                        if (fs.existsSync(legacyPath)) {
                            imagePath = `${folderName}/${sub}/${rank}.png`;
                            break;
                        }
                    }
                }
            }

            const finalImagePath = imagePath || `${folderName}/${pairId}.png`;

            this.cards.push({
                id: `${pairId}-a`,
                pairId,
                name,
                image: `/assets/cards/${finalImagePath}`
            });
            this.cards.push({
                id: `${pairId}-b`,
                pairId,
                name,
                image: `/assets/cards/${finalImagePath}`
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
