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
const LEGACY_SUIT_FOLDERS = ['aubergine', 'radish', 'pepper', 'potato'];

/**
 * Hjälpfunktion: hitta rätt bildsökväg för ett par, med stöd för både
 * flat struktur (pair-A.png) och legacy struktur (aubergine/A.png).
 */
function resolvePairImagePath(themeFolder, pairId, currentImagePath) {
    if (currentImagePath && fs.existsSync(path.join(CARDS_DIR, currentImagePath))) {
        return currentImagePath;
    }

    const themePath = path.join(CARDS_DIR, themeFolder);

    // Ny struktur: pair-*.png direkt i temamappen
    const flatPath = path.join(themePath, `${pairId}.png`);
    if (fs.existsSync(flatPath)) {
        return `${themeFolder}/${pairId}.png`;
    }

    // Legacy-struktur: {suit}/{rank}.png
    const rank = String(pairId).replace(/^pair-/, '');
    for (const sub of LEGACY_SUIT_FOLDERS) {
        const legacyPath = path.join(themePath, sub, `${rank}.png`);
        if (fs.existsSync(legacyPath)) {
            return `${themeFolder}/${sub}/${rank}.png`;
        }
    }

    return currentImagePath || null;
}

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
            // BAKÅTKOMPATIBILITET: admin-panelen förväntar cardCount och ranks
            cardCount: pairs.length * 2,
            ranks: pairs.map(p => p.pair_id),
            complete: pairs.length >= 13,
            preview: pairs.length > 0 ? `/assets/cards/${pairs[pairs.length - 1].image_path}` : null,
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
                    pairId: p.pair_id,
                    name: p.name,
                    description: p.description,
                    sortOrder: p.sort_order,
                    imagePath: p.image_path,
                    imagePathB: p.image_path_b
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
        res.json({
            success: true,
            config: {
                pairs: pairs.map(p => ({
                    pairId: p.pair_id,
                    name: p.name,
                    description: p.description,
                    sortOrder: p.sort_order,
                    imagePath: p.image_path,
                    imagePathB: p.image_path_b
                }))
            }
        });
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
                const { pairId, name, description, sortOrder, imageBase64, imageBase64B } = pair;
                if (!pairId) {
                    continue;
                }

                const imagePath = imageBase64 ? `${themeName}/${pairId}.png` : null;
                if (imageBase64) {
                    fs.writeFileSync(path.join(themePath, `${pairId}.png`), Buffer.from(imageBase64, 'base64'));
                    saved++;
                }

                const imagePathB = imageBase64B ? `${themeName}/${pairId}-b.png` : null;
                if (imageBase64B) {
                    fs.writeFileSync(path.join(themePath, `${pairId}-b.png`), Buffer.from(imageBase64B, 'base64'));
                    saved++;
                }

                pairRecords.push({
                    pairId,
                    name: name || pairId,
                    description: description || '',
                    sortOrder: sortOrder ?? 0,
                    imagePath,
                    imagePathB
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

        const existingPairs = await Theme.getPairs(theme.id);
        const existingImagePathByPairId = new Map(existingPairs.map(p => [p.pair_id, p.image_path]));
        const existingImagePathBByPairId = new Map(existingPairs.map(p => [p.pair_id, p.image_path_b]));

        let saved = 0;
        const pairRecords = [];

        // Spara par-bilder
        if (Array.isArray(pairs)) {
            for (const pair of pairs) {
                const { pairId, name, description, sortOrder, imageBase64, imageBase64B } = pair;
                if (!pairId) {
                    continue;
                }

                let imagePath = pair.imagePath;
                let imagePathB = pair.imagePathB;

                if (imageBase64) {
                    imagePath = `${themeFolder}/${pairId}.png`;
                    fs.writeFileSync(path.join(themePath, `${pairId}.png`), Buffer.from(imageBase64, 'base64'));
                    saved++;
                }

                if (imageBase64B) {
                    imagePathB = `${themeFolder}/${pairId}-b.png`;
                    fs.writeFileSync(path.join(themePath, `${pairId}-b.png`), Buffer.from(imageBase64B, 'base64'));
                    saved++;
                }

                // Om ingen sökväg angivits, bevara befintlig DB-sökväg eller
                // lös upp rätt sökväg utifrån filsystemet (legacy vs flat struktur).
                const existingPath = existingImagePathByPairId.get(pairId);
                imagePath = resolvePairImagePath(themeFolder, pairId, imagePath || existingPath);

                const existingPathB = existingImagePathBByPairId.get(pairId);
                imagePathB = imagePathB || existingPathB || null;

                pairRecords.push({
                    pairId,
                    name: name || pairId,
                    description: description || '',
                    sortOrder: sortOrder ?? 0,
                    imagePath: imagePath || null,
                    imagePathB: imagePathB || null
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

        // Bevara befintliga image_path-värden eftersom klienten inte skickar dem,
        // men reparera dem om de pekar på en fil som inte finns.
        const existingPairs = await Theme.getPairs(theme.id);
        const imagePathByPairId = new Map(existingPairs.map(p => [p.pair_id, p.image_path]));
        const imagePathBByPairId = new Map(existingPairs.map(p => [p.pair_id, p.image_path_b]));

        const mergedPairs = (req.body.pairs || []).map(pair => {
            const pairId = pair.pairId;
            const existingPath = imagePathByPairId.get(pairId);
            const existingPathB = imagePathBByPairId.get(pairId);
            return {
                pairId,
                name: pair.name,
                description: pair.description || '',
                sortOrder: pair.sortOrder ?? 0,
                imagePath: resolvePairImagePath(req.params.theme, pairId, existingPath),
                imagePathB: pair.imagePathB !== undefined ? pair.imagePathB : existingPathB || null
            };
        });

        await Theme.setPairs(theme.id, mergedPairs);
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
router.post('/themes/:theme/upload', requireAdmin, async (req, res) => {
    try {
        const themeFolder = req.params.theme;
        const { pairs, back } = req.body;

        if (!themeFolder || !/^[a-z0-9-]+$/.test(themeFolder)) {
            return res.status(400).json({
                success: false,
                error: 'Ogiltigt temanamn. Endast små bokstäver, siffror och bindestreck.'
            });
        }

        const theme = await Theme.findByFolder(themeFolder);
        if (!theme) {
            return res.status(404).json({ success: false, error: 'Tema hittades inte' });
        }

        const themePath = path.join(CARDS_DIR, themeFolder);

        // Skapa tema-mapp om den inte finns
        if (!fs.existsSync(themePath)) {
            fs.mkdirSync(themePath, { recursive: true });
        }

        let saved = 0;
        const errors = [];
        const uploadedPairIds = [];

        // Hantera par-bilder direkt
        if (Array.isArray(pairs)) {
            for (const pair of pairs) {
                const { pairId, dataUrl, dataUrlB } = pair;
                if (!pairId) {
                    continue;
                }

                const updates = {};

                if (dataUrl && typeof dataUrl === 'string') {
                    const base64Match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
                    if (!base64Match) {
                        errors.push(`Ogiltigt format för ${pairId} (A)`);
                    } else {
                        const buffer = Buffer.from(base64Match[2], 'base64');
                        fs.writeFileSync(path.join(themePath, `${pairId}.png`), buffer);
                        updates.imagePath = `${themeFolder}/${pairId}.png`;
                        saved++;
                    }
                }

                if (dataUrlB && typeof dataUrlB === 'string') {
                    const base64MatchB = dataUrlB.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
                    if (!base64MatchB) {
                        errors.push(`Ogiltigt format för ${pairId} (B)`);
                    } else {
                        const bufferB = Buffer.from(base64MatchB[2], 'base64');
                        fs.writeFileSync(path.join(themePath, `${pairId}-b.png`), bufferB);
                        updates.imagePathB = `${themeFolder}/${pairId}-b.png`;
                        saved++;
                    }
                }

                if (Object.keys(updates).length > 0) {
                    uploadedPairIds.push(pairId);
                    await Theme.updatePair(theme.id, pairId, updates);
                }
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

        // Synka till databasen för persistens
        db.saveThemeFiles(themeFolder).catch(err => {
            console.error('DB-synk fel:', err.message);
        });

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
