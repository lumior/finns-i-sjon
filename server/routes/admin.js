const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const CARDS_DIR = path.join(__dirname, '../../public_html/assets/cards');
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/**
 * Hjälpfunktion: skanna teman från filsystemet
 */
function scanThemes() {
    if (!fs.existsSync(CARDS_DIR)) {
        return [];
    }

    const entries = fs.readdirSync(CARDS_DIR, { withFileTypes: true });
    const themes = [];

    for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'README.md') {
            const themePath = path.join(CARDS_DIR, entry.name);
            const files = fs.readdirSync(themePath);
            const cardFiles = files.filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp'));
            const foundRanks = RANKS.filter(
                rank =>
                    cardFiles.includes(`${rank}.png`) ||
                    cardFiles.includes(`${rank}.jpg`) ||
                    cardFiles.includes(`${rank}.webp`)
            );

            themes.push({
                id: entry.name,
                name: entry.name.charAt(0).toUpperCase() + entry.name.slice(1),
                folder: entry.name,
                cardCount: cardFiles.length,
                complete: foundRanks.length === 13,
                ranks: foundRanks,
                preview: `/assets/cards/${entry.name}/${foundRanks[0] || 'A'}.png`
            });
        }
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

        const files = fs.readdirSync(themePath);
        const cards = RANKS.map(rank => {
            const ext = ['.png', '.jpg', '.webp'].find(e => files.includes(`${rank}${e}`));
            return {
                rank,
                exists: !!ext,
                path: ext ? `/assets/cards/${themeFolder}/${rank}${ext}` : null
            };
        });

        res.json({
            success: true,
            theme: {
                id: themeFolder,
                name: themeFolder.charAt(0).toUpperCase() + themeFolder.slice(1),
                folder: themeFolder,
                cards
            }
        });
    } catch (err) {
        console.error('Admin theme detail error:', err);
        res.status(500).json({ success: false, error: 'Kunde inte läsa tema' });
    }
});

module.exports = router;
