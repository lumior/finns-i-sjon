const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const db = require('../config/database');

/**
 * Middleware: kräv inloggning och admin-roll.
 * Admin-routen registreras efter global auth-middleware, så req.user finns satt.
 */
function requireAdmin(req, res, next) {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ success: false, error: 'Åtkomst nekad. Endast administratörer.' });
    }
    next();
}

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

        // Kolla om temat har en config.json (redigerbart)
        const hasConfig = fs.existsSync(path.join(themePath, 'config.json'));

        themes.push({
            id: entry.name,
            name: entry.name.charAt(0).toUpperCase() + entry.name.slice(1),
            folder: entry.name,
            cardCount: totalCards,
            complete: completeSuits === 4,
            completeSuits,
            suitStatus,
            preview: `/assets/cards/${entry.name}/potato/${previewRank}.png`,
            editable: hasConfig
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

        const hasConfig = fs.existsSync(path.join(themePath, 'config.json'));

        res.json({
            success: true,
            theme: {
                id: themeFolder,
                name: themeFolder.charAt(0).toUpperCase() + themeFolder.slice(1),
                folder: themeFolder,
                suits,
                editable: hasConfig
            }
        });
    } catch (err) {
        console.error('Admin theme detail error:', err);
        res.status(500).json({ success: false, error: 'Kunde inte läsa tema' });
    }
});

/**
 * GET /api/admin/themes/:theme/config
 * Hämta config.json för ett tema (för redigering)
 */
router.get('/themes/:theme/config', (req, res) => {
    try {
        const themeFolder = req.params.theme;
        const themePath = path.join(CARDS_DIR, themeFolder);
        const configPath = path.join(themePath, 'config.json');

        if (!fs.existsSync(themePath)) {
            return res.status(404).json({ success: false, error: 'Tema hittades inte' });
        }

        if (!fs.existsSync(configPath)) {
            return res.status(404).json({ success: false, error: 'Tema har ingen sparad konfiguration' });
        }

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        res.json({ success: true, config });
    } catch (err) {
        console.error('Admin config error:', err);
        res.status(500).json({ success: false, error: 'Kunde inte läsa konfiguration' });
    }
});

/**
 * POST /api/admin/themes
 * Skapa nytt tema med bilder + config.json
 */
router.post('/themes', requireAdmin, (req, res) => {
    try {
        const { themeName, cards, back, config } = req.body;

        if (!themeName || !/^[a-z0-9-]+$/.test(themeName)) {
            return res.status(400).json({ success: false, error: 'Ogiltigt namn' });
        }

        const themePath = path.join(CARDS_DIR, themeName);
        if (!fs.existsSync(themePath)) {
            fs.mkdirSync(themePath, { recursive: true });
        }

        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        let saved = 0;

        for (const suit of suits) {
            const folder = path.join(themePath, SUIT_FOLDERS[suits.indexOf(suit)]);
            if (!fs.existsSync(folder)) {
                fs.mkdirSync(folder);
            }
            for (const rank of RANKS) {
                const base64 = cards[suit]?.[rank];
                if (base64) {
                    fs.writeFileSync(path.join(folder, `${rank}.png`), Buffer.from(base64, 'base64'));
                    saved++;
                }
            }
        }

        if (back) {
            fs.writeFileSync(path.join(themePath, 'back.png'), Buffer.from(back, 'base64'));
        }

        // Spara config.json om den finns
        if (config && typeof config === 'object') {
            fs.writeFileSync(path.join(themePath, 'config.json'), JSON.stringify(config, null, 2));
        }

        // Synka till databasen för persistens (Railway ephemeral filesystem)
        db.saveThemeFiles(themeName).catch(err => {
            console.error('DB-synk fel:', err.message);
        });

        res.json({ success: true, saved, theme: themeName, path: `/assets/cards/${themeName}/` });
    } catch (err) {
        console.error('Admin create theme error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/admin/themes/:theme
 * Uppdatera befintligt tema (bilder + config)
 */
router.put('/themes/:theme', requireAdmin, (req, res) => {
    try {
        const themeFolder = req.params.theme;
        const { cards, back, config } = req.body;

        if (!themeFolder || !/^[a-z0-9-]+$/.test(themeFolder)) {
            return res.status(400).json({ success: false, error: 'Ogiltigt temanamn' });
        }

        const themePath = path.join(CARDS_DIR, themeFolder);
        if (!fs.existsSync(themePath)) {
            return res.status(404).json({ success: false, error: 'Tema hittades inte' });
        }

        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        let saved = 0;

        // Spara kort
        if (cards && typeof cards === 'object') {
            for (const suit of suits) {
                const folder = path.join(themePath, SUIT_FOLDERS[suits.indexOf(suit)]);
                if (!fs.existsSync(folder)) {
                    fs.mkdirSync(folder);
                }
                for (const rank of RANKS) {
                    const base64 = cards[suit]?.[rank];
                    if (base64) {
                        fs.writeFileSync(path.join(folder, `${rank}.png`), Buffer.from(base64, 'base64'));
                        saved++;
                    }
                }
            }
        }

        // Spara baksida
        if (back) {
            fs.writeFileSync(path.join(themePath, 'back.png'), Buffer.from(back, 'base64'));
        }

        // Spara config.json
        if (config && typeof config === 'object') {
            fs.writeFileSync(path.join(themePath, 'config.json'), JSON.stringify(config, null, 2));
        }

        // Synka till databasen för persistens
        db.saveThemeFiles(themeFolder).catch(err => {
            console.error('DB-synk fel:', err.message);
        });

        res.json({ success: true, saved, theme: themeFolder, path: `/assets/cards/${themeFolder}/` });
    } catch (err) {
        console.error('Admin update theme error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/admin/themes/:theme/upload
 * Spara kortleksbilder direkt till servern (dataURL-format, bakåtkompatibel)
 */
router.post('/themes/:theme/upload', requireAdmin, (req, res) => {
    try {
        const themeFolder = req.params.theme;
        const { cards, back } = req.body;

        if (!themeFolder || !/^[a-z0-9-]+$/.test(themeFolder)) {
            return res.status(400).json({
                success: false,
                error: 'Ogiltigt temanamn. Endast små bokstäver, siffror och bindestreck.'
            });
        }

        if (!cards || typeof cards !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Kortdata saknas'
            });
        }

        const themePath = path.join(CARDS_DIR, themeFolder);

        // Skapa tema-mapp om den inte finns
        if (!fs.existsSync(themePath)) {
            fs.mkdirSync(themePath, { recursive: true });
        }

        const suitMap = {
            hearts: 'aubergine',
            diamonds: 'radish',
            clubs: 'pepper',
            spades: 'potato'
        };

        let saved = 0;
        const errors = [];

        // Spara kort
        for (const [suit, ranks] of Object.entries(cards)) {
            const suitFolder = suitMap[suit];
            if (!suitFolder) {
                errors.push(`Okänd färg: ${suit}`);
                continue;
            }

            const suitPath = path.join(themePath, suitFolder);
            if (!fs.existsSync(suitPath)) {
                fs.mkdirSync(suitPath, { recursive: true });
            }

            for (const [rank, dataUrl] of Object.entries(ranks)) {
                if (!dataUrl || typeof dataUrl !== 'string') {
                    continue;
                }

                const base64Match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
                if (!base64Match) {
                    errors.push(`Ogiltigt format för ${suit} ${rank}`);
                    continue;
                }

                const buffer = Buffer.from(base64Match[2], 'base64');
                const filePath = path.join(suitPath, `${rank}.png`);
                fs.writeFileSync(filePath, buffer);
                saved++;
            }
        }

        // Spara baksida om den finns
        if (back) {
            const base64Match = back.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
            if (base64Match) {
                const buffer = Buffer.from(base64Match[2], 'base64');
                fs.writeFileSync(path.join(themePath, 'back.png'), buffer);
            }
        }

        res.json({
            success: true,
            saved,
            errors: errors.length > 0 ? errors : undefined,
            message: `${saved} kort sparade i /assets/cards/${themeFolder}/`
        });
    } catch (err) {
        console.error('Admin upload error:', err);
        res.status(500).json({ success: false, error: 'Kunde inte spara kort' });
    }
});

module.exports = router;
