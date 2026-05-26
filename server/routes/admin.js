const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const CARDS_DIR = path.join(__dirname, '../../public_html/assets/cards');
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_FOLDERS = ['aubergine', 'radish', 'pepper', 'potato'];

/**
 * Hjälpfunktion: skanna teman från filsystemet
 * Varje tema är en mapp under assets/cards/ som innehåller 4 undermappar
 */
function scanThemes() {
    if (!fs.existsSync(CARDS_DIR)) {
        return [];
    }

    const entries = fs.readdirSync(CARDS_DIR, { withFileTypes: true });
    const themes = [];

    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === 'README.md') {
            continue;
        }

        const themePath = path.join(CARDS_DIR, entry.name);
        let totalCards = 0;
        let completeSuits = 0;
        const suitStatus = {};

        for (const suitFolder of SUIT_FOLDERS) {
            const suitPath = path.join(themePath, suitFolder);
            if (!fs.existsSync(suitPath)) {
                suitStatus[suitFolder] = 0;
                continue;
            }

            const files = fs.readdirSync(suitPath);
            const found = RANKS.filter(
                rank => files.includes(`${rank}.png`) || files.includes(`${rank}.jpg`) || files.includes(`${rank}.webp`)
            ).length;

            suitStatus[suitFolder] = found;
            totalCards += found;
            if (found === 13) {
                completeSuits++;
            }
        }

        const previewRank =
            RANKS.find(r => {
                const spadesPath = path.join(themePath, 'potato');
                if (!fs.existsSync(spadesPath)) {
                    return false;
                }
                const files = fs.readdirSync(spadesPath);
                return files.includes(`${r}.png`) || files.includes(`${r}.jpg`);
            }) || 'A';

        themes.push({
            id: entry.name,
            name: entry.name.charAt(0).toUpperCase() + entry.name.slice(1),
            folder: entry.name,
            cardCount: totalCards,
            complete: completeSuits === 4,
            completeSuits,
            suitStatus,
            preview: `/assets/cards/${entry.name}/potato/${previewRank}.png`
        });
    }

    return themes;
}

/**
 * GET /api/admin/themes
 * Lista alla kortleksteman
 */
router.get('/themes', (req, res) => {
    try {
        const themes = scanThemes();
        res.json({ success: true, themes });
    } catch (err) {
        console.error('Admin themes error:', err);
        res.status(500).json({ success: false, error: 'Kunde inte läsa teman' });
    }
});

/**
 * GET /api/admin/themes/:theme
 * Detaljer för ett specifikt tema
 */
router.get('/themes/:theme', (req, res) => {
    try {
        const themeFolder = req.params.theme;
        const themePath = path.join(CARDS_DIR, themeFolder);

        if (!fs.existsSync(themePath)) {
            return res.status(404).json({ success: false, error: 'Tema hittades inte' });
        }

        const suits = {};
        for (const suitFolder of SUIT_FOLDERS) {
            const suitPath = path.join(themePath, suitFolder);
            if (!fs.existsSync(suitPath)) {
                suits[suitFolder] = { cards: [], exists: false };
                continue;
            }

            const files = fs.readdirSync(suitPath);
            const cards = RANKS.map(rank => {
                const ext = ['.png', '.jpg', '.webp'].find(e => files.includes(`${rank}${e}`));
                return {
                    rank,
                    exists: !!ext,
                    path: ext ? `/assets/cards/${themeFolder}/${suitFolder}/${rank}${ext}` : null
                };
            });

            suits[suitFolder] = { cards, exists: true };
        }

        res.json({
            success: true,
            theme: {
                id: themeFolder,
                name: themeFolder.charAt(0).toUpperCase() + themeFolder.slice(1),
                folder: themeFolder,
                suits
            }
        });
    } catch (err) {
        console.error('Admin theme detail error:', err);
        res.status(500).json({ success: false, error: 'Kunde inte läsa tema' });
    }
});

module.exports = router;
