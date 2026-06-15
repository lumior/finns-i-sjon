const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const db = require('../config/database');
const Theme = require('../models/Theme');

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

/**
 * Hjälpfunktion: skanna teman från databasen
 * Varje tema är en rad i themes-tabellen med tillhörande par i theme_pairs.
 */
async function scanThemes() {
    const themes = await Theme.list();
    const result = [];

    for (const theme of themes) {
        const pairs = await Theme.getPairs(theme.id);

        result.push({
            id: theme.folder_name,
            name: theme.display_name,
            folder: theme.folder_name,
            pairCount: pairs.length,
            complete: pairs.length >= 25,
            preview: pairs.length > 0 ? pairs[pairs.length - 1].imagePath : null,
            editable: true
        });
    }

    return result;
}

/**
 * GET /api/admin/themes
 * Lista alla kortleksteman
 */
router.get('/themes', async (req, res) => {
    try {
        const themes = await scanThemes();
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
router.get('/themes/:theme', async (req, res) => {
    try {
        const theme = await Theme.findByFolder(req.params.theme);

        if (!theme) {
            return res.status(404).json({ success: false, error: 'Tema hittades inte' });
        }

        const pairs = await Theme.getPairs(theme.id);

        res.json({
            success: true,
            theme: {
                id: theme.folder_name,
                name: theme.display_name,
                folder: theme.folder_name,
                pairs: pairs.map(p => ({
                    pairId: p.pairId,
                    name: p.name,
                    sortOrder: p.sortOrder,
                    imagePath: p.imagePath
                })),
                editable: true
            }
        });
    } catch (err) {
        console.error('Admin theme detail error:', err);
        res.status(500).json({ success: false, error: 'Kunde inte läsa tema' });
    }
});

/**
 * GET /api/admin/themes/:theme/config
 * Hämta temats par som en konfiguration (för redigering)
 */
router.get('/themes/:theme/config', async (req, res) => {
    try {
        const theme = await Theme.findByFolder(req.params.theme);

        if (!theme) {
            return res.status(404).json({ success: false, error: 'Tema hittades inte' });
        }

        const pairs = await Theme.getPairs(theme.id);
        res.json({ success: true, config: { pairs } });
    } catch (err) {
        console.error('Admin config error:', err);
        res.status(500).json({ success: false, error: 'Kunde inte läsa konfiguration' });
    }
});

/**
 * POST /api/admin/themes
 * Skapa nytt tema med par-bilder + baksida
 */
router.post('/themes', requireAdmin, async (req, res) => {
    try {
        const { themeName, displayName, pairs, back } = req.body;

        if (!themeName || !/^[a-z0-9-]+$/.test(themeName)) {
            return res.status(400).json({ success: false, error: 'Ogiltigt namn' });
        }

        const themePath = path.join(CARDS_DIR, themeName);
        if (!fs.existsSync(themePath)) {
            fs.mkdirSync(themePath, { recursive: true });
        }

        let saved = 0;
        const pairRecords = [];

        if (Array.isArray(pairs)) {
            for (const pair of pairs) {
                const { pairId, name, sortOrder, imageBase64 } = pair;
                if (!pairId || !imageBase64) {
                    continue;
                }

                const imagePath = `${themeName}/${pairId}.png`;
                fs.writeFileSync(path.join(themePath, `${pairId}.png`), Buffer.from(imageBase64, 'base64'));
                saved++;

                pairRecords.push({
                    pairId,
                    name: name || pairId,
                    sortOrder: sortOrder ?? 0,
                    imagePath
                });
            }
        }

        if (back) {
            fs.writeFileSync(path.join(themePath, 'back.png'), Buffer.from(back, 'base64'));
        }

        const theme = await Theme.create({
            folderName: themeName,
            displayName: displayName || themeName,
            description: ''
        });

        if (pairRecords.length > 0) {
            await Theme.setPairs(theme.id, pairRecords);
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
 * Uppdatera befintligt tema (par-bilder + baksida + metadata)
 */
router.put('/themes/:theme', requireAdmin, async (req, res) => {
    try {
        const themeFolder = req.params.theme;
        const { displayName, pairs, back } = req.body;

        if (!themeFolder || !/^[a-z0-9-]+$/.test(themeFolder)) {
            return res.status(400).json({ success: false, error: 'Ogiltigt temanamn' });
        }

        const theme = await Theme.findByFolder(themeFolder);
        if (!theme) {
            return res.status(404).json({ success: false, error: 'Tema hittades inte' });
        }

        const themePath = path.join(CARDS_DIR, themeFolder);
        if (!fs.existsSync(themePath)) {
            fs.mkdirSync(themePath, { recursive: true });
        }

        let saved = 0;
        const pairRecords = [];

        // Spara par-bilder
        if (Array.isArray(pairs)) {
            for (const pair of pairs) {
                const { pairId, name, sortOrder, imageBase64 } = pair;
                if (!pairId) {
                    continue;
                }

                let imagePath = pair.imagePath;

                if (imageBase64) {
                    imagePath = `${themeFolder}/${pairId}.png`;
                    fs.writeFileSync(path.join(themePath, `${pairId}.png`), Buffer.from(imageBase64, 'base64'));
                    saved++;
                }

                pairRecords.push({
                    pairId,
                    name: name || pairId,
                    sortOrder: sortOrder ?? 0,
                    imagePath: imagePath || `${themeFolder}/${pairId}.png`
                });
            }
        }

        // Spara baksida
        if (back) {
            fs.writeFileSync(path.join(themePath, 'back.png'), Buffer.from(back, 'base64'));
        }

        // Uppdatera metadata och par i databasen
        await Theme.update(theme.id, { displayName });
        if (pairRecords.length > 0) {
            await Theme.setPairs(theme.id, pairRecords);
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
 * PUT /api/admin/themes/:theme/pairs
 * Uppdatera bara par-namn och sortering utan att skriva om bilder.
 */
router.put('/themes/:theme/pairs', requireAdmin, async (req, res) => {
    try {
        const theme = await Theme.findByFolder(req.params.theme);
        if (!theme) {
            return res.status(404).json({ success: false, error: 'Tema hittades inte' });
        }

        await Theme.setPairs(theme.id, req.body.pairs || []);
        res.json({ success: true });
    } catch (err) {
        console.error('Admin update pairs error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/admin/themes/:theme/upload
 * Spara kortleksbilder direkt till servern (dataURL-format, bakåtkompatibel fallback)
 */
router.post('/themes/:theme/upload', requireAdmin, (req, res) => {
    try {
        const themeFolder = req.params.theme;
        const { pairs, back } = req.body;

        if (!themeFolder || !/^[a-z0-9-]+$/.test(themeFolder)) {
            return res.status(400).json({
                success: false,
                error: 'Ogiltigt temanamn. Endast små bokstäver, siffror och bindestreck.'
            });
        }

        const themePath = path.join(CARDS_DIR, themeFolder);

        // Skapa tema-mapp om den inte finns
        if (!fs.existsSync(themePath)) {
            fs.mkdirSync(themePath, { recursive: true });
        }

        let saved = 0;
        const errors = [];

        // Hantera par-bilder direkt
        if (Array.isArray(pairs)) {
            for (const pair of pairs) {
                const { pairId, dataUrl } = pair;
                if (!pairId || !dataUrl || typeof dataUrl !== 'string') {
                    continue;
                }

                const base64Match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
                if (!base64Match) {
                    errors.push(`Ogiltigt format för ${pairId}`);
                    continue;
                }

                const buffer = Buffer.from(base64Match[2], 'base64');
                fs.writeFileSync(path.join(themePath, `${pairId}.png`), buffer);
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
            message: `${saved} bilder sparade i /assets/cards/${themeFolder}/`
        });
    } catch (err) {
        console.error('Admin upload error:', err);
        res.status(500).json({ success: false, error: 'Kunde inte spara bilder' });
    }
});

module.exports = router;
