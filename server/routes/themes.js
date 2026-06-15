const express = require('express');
const router = express.Router();
const Theme = require('../models/Theme');

/**
 * GET /api/themes
 * Publik lista över aktiva teman med deras par.
 */
router.get('/', async (req, res) => {
    try {
        const themes = await Theme.list();
        const result = [];
        for (const theme of themes) {
            if (!theme || !theme.id) {
                console.warn('⚠️ /api/themes: tema utan id, hoppar över:', theme);
                continue;
            }
            const pairs = await Theme.getPairs(theme.id);
            result.push({
                id: theme.folder_name,
                name: theme.display_name,
                folder: theme.folder_name,
                pairCount: pairs.length,
                complete: pairs.length >= 25,
                pairs: pairs.map(p => ({
                    pairId: p.pairId,
                    name: p.name,
                    sortOrder: p.sortOrder,
                    imagePath: p.imagePath
                }))
            });
        }
        res.json({ success: true, themes: result });
    } catch (err) {
        console.error('❌ /api/themes error:', err.message);
        console.error(err.stack);
        res.status(500).json({ success: false, error: 'Kunde inte läsa teman' });
    }
});

/**
 * GET /api/themes/:folder
 * Publik detalj för ett tema.
 */
router.get('/:folder', async (req, res) => {
    try {
        const theme = await Theme.findByFolder(req.params.folder);
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
                description: theme.description,
                pairCount: pairs.length,
                pairs: pairs.map(p => ({
                    pairId: p.pairId,
                    name: p.name,
                    sortOrder: p.sortOrder,
                    imagePath: p.imagePath
                }))
            }
        });
    } catch (err) {
        console.error('❌ /api/themes/:folder error:', err.message);
        console.error(err.stack);
        res.status(500).json({ success: false, error: 'Kunde inte läsa tema' });
    }
});

module.exports = router;
