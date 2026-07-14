const db = require('../config/database');
const fs = require('fs');
const path = require('path');

const CARDS_DIR = path.join(__dirname, '../../public_html/assets/cards');
const DEFAULT_PAIR_COUNT = 26;

class Theme {
    static async findByFolder(folderName) {
        return db.get('SELECT * FROM themes WHERE folder_name = ?', [folderName]);
    }

    static async findById(id) {
        return db.get('SELECT * FROM themes WHERE id = ?', [id]);
    }

    static async list() {
        return db.query('SELECT * FROM themes WHERE is_active = true ORDER BY display_name');
    }

    static async create({ folderName, displayName, description = '' }) {
        const result = await db.run('INSERT INTO themes (folder_name, display_name, description) VALUES (?, ?, ?)', [
            folderName,
            displayName,
            description
        ]);
        return Theme.findById(result.id);
    }

    static async update(id, { displayName, description, isActive }) {
        const fields = [];
        const values = [];
        if (displayName !== undefined) {
            fields.push('display_name = ?');
            values.push(displayName);
        }
        if (description !== undefined) {
            fields.push('description = ?');
            values.push(description);
        }
        if (isActive !== undefined) {
            fields.push('is_active = ?');
            values.push(isActive ? 1 : 0);
        }
        if (fields.length === 0) {
            return Theme.findById(id);
        }
        values.push(id);
        await db.run(`UPDATE themes SET ${fields.join(', ')} WHERE id = ?`, values);
        return Theme.findById(id);
    }

    static async delete(id) {
        await db.run('DELETE FROM themes WHERE id = ?', [id]);
    }

    static async getPairs(themeId) {
        // Använd snake_case-kolumnnamn direkt; PostgreSQL viker annars
        // icke-citerade camelCase-alias till gemener (pairId -> pairid).
        return db.query(
            'SELECT pair_id, name, description, sort_order, image_path, image_path_b, show_name FROM theme_pairs WHERE theme_id = ? ORDER BY sort_order, pair_id',
            [themeId]
        );
    }

    static async getPairsByFolder(folderName) {
        const theme = await Theme.findByFolder(folderName);
        if (!theme) {
            return [];
        }
        return Theme.getPairs(theme.id);
    }

    /**
     * Fyll i image_path för par som saknar det, eller reparera felaktiga
     * sökvägar som inte pekar på en existerande fil. Används för att åtgärda
     * äldre databasposter där image_path sattes till fel sökväg
     * (t.ex. /vegetable/pair-A.png istället för /vegetable/aubergine/A.png).
     */
    static async repairMissingImagePaths(themeId, folderName, pairs) {
        const legacyFolders = ['aubergine', 'radish', 'pepper', 'potato'];
        const hasLegacy = legacyFolders.some(f => fs.existsSync(path.join(CARDS_DIR, folderName, f)));

        for (const pair of pairs) {
            const pairId = pair.pair_id;

            // Primär bild (kort A)
            let imagePath = pair.image_path;
            const currentAExists = imagePath && fs.existsSync(path.join(CARDS_DIR, imagePath));
            if (!currentAExists) {
                // Ny struktur: pair-*.png direkt i temamappen
                const newPath = path.join(CARDS_DIR, folderName, `${pairId}.png`);
                if (fs.existsSync(newPath)) {
                    imagePath = `${folderName}/${pairId}.png`;
                }

                // Legacy-struktur: aubergine/{rank}.png
                if (!imagePath && hasLegacy) {
                    const rank = pairId.replace(/^pair-/, '');
                    const legacyPath = path.join(CARDS_DIR, folderName, 'aubergine', `${rank}.png`);
                    if (fs.existsSync(legacyPath)) {
                        imagePath = `${folderName}/aubergine/${rank}.png`;
                    }
                }
            }

            // Sekundär bild (kort B) — valfri
            let imagePathB = pair.image_path_b;
            const currentBExists = imagePathB && fs.existsSync(path.join(CARDS_DIR, imagePathB));
            if (!currentBExists) {
                const newPathB = path.join(CARDS_DIR, folderName, `${pairId}-b.png`);
                if (fs.existsSync(newPathB)) {
                    imagePathB = `${folderName}/${pairId}-b.png`;
                }
            }

            const updates = {};
            if (imagePath && imagePath !== pair.image_path) {
                updates.imagePath = imagePath;
            }
            if (imagePathB && imagePathB !== pair.image_path_b) {
                updates.imagePathB = imagePathB;
            }
            if (Object.keys(updates).length > 0) {
                await Theme.updatePair(themeId, pairId, updates);
            }
        }
    }

    static async addPair(
        themeId,
        { pairId, name, description = '', sortOrder = 0, imagePath = null, imagePathB = null, showName = 1 }
    ) {
        const result = await db.run(
            'INSERT INTO theme_pairs (theme_id, pair_id, name, description, sort_order, image_path, image_path_b, show_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [themeId, pairId, name, description, sortOrder, imagePath, imagePathB, showName ? 1 : 0]
        );
        return db.get('SELECT * FROM theme_pairs WHERE id = ?', [result.id]);
    }

    static async updatePair(themeId, pairId, { name, description, sortOrder, imagePath, imagePathB, showName }) {
        const fields = [];
        const values = [];
        if (name !== undefined) {
            fields.push('name = ?');
            values.push(name);
        }
        if (description !== undefined) {
            fields.push('description = ?');
            values.push(description);
        }
        if (sortOrder !== undefined) {
            fields.push('sort_order = ?');
            values.push(sortOrder);
        }
        if (imagePath !== undefined) {
            fields.push('image_path = ?');
            values.push(imagePath);
        }
        if (imagePathB !== undefined) {
            fields.push('image_path_b = ?');
            values.push(imagePathB);
        }
        if (showName !== undefined) {
            fields.push('show_name = ?');
            values.push(showName ? 1 : 0);
        }
        if (fields.length === 0) {
            return db.get('SELECT * FROM theme_pairs WHERE theme_id = ? AND pair_id = ?', [themeId, pairId]);
        }
        values.push(themeId, pairId);
        await db.run(`UPDATE theme_pairs SET ${fields.join(', ')} WHERE theme_id = ? AND pair_id = ?`, values);
        return db.get('SELECT * FROM theme_pairs WHERE theme_id = ? AND pair_id = ?', [themeId, pairId]);
    }

    static async deletePair(themeId, pairId) {
        await db.run('DELETE FROM theme_pairs WHERE theme_id = ? AND pair_id = ?', [themeId, pairId]);
    }

    static async setPairs(themeId, pairs) {
        await db.run('DELETE FROM theme_pairs WHERE theme_id = ?', [themeId]);
        for (const pair of pairs) {
            await Theme.addPair(themeId, pair);
        }
    }

    /**
     * Seedar themes- och theme_pairs-tabellerna utifrån befintliga filsystemstemat.
     * Används vid migration från gammal suit/rank-struktur.
     */
    static async seedFromFilesystem() {
        if (!fs.existsSync(CARDS_DIR)) {
            return;
        }

        const entries = fs.readdirSync(CARDS_DIR, { withFileTypes: true });
        const themeFolders = entries.filter(e => e.isDirectory()).map(e => e.name);

        for (const folderName of themeFolders) {
            let theme = await Theme.findByFolder(folderName);
            if (!theme) {
                theme = await Theme.create({
                    folderName,
                    displayName: folderName.charAt(0).toUpperCase() + folderName.slice(1)
                });
            }

            const existingPairs = await Theme.getPairs(theme.id);
            if (existingPairs.length > 0) {
                // Reparera eventuella par som saknar image_path (t.ex. gamla PostgreSQL-rader)
                await Theme.repairMissingImagePaths(theme.id, folderName, existingPairs);
                continue;
            }

            // Försök hitta par från nya strukturen (pair-*.png direkt i temamappen)
            const pairFiles = fs
                .readdirSync(path.join(CARDS_DIR, folderName))
                .filter(f => f.startsWith('pair-') && f.endsWith('.png') && !f.endsWith('-b.png'))
                .sort();

            if (pairFiles.length > 0) {
                // Läs config.json för par-namn om den finns
                const configPairs = {};
                const configPath = path.join(CARDS_DIR, folderName, 'config.json');
                if (fs.existsSync(configPath)) {
                    try {
                        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                        if (config.pairs) {
                            config.pairs.forEach(p => {
                                configPairs[p.pairId] = p.name;
                            });
                        }
                    } catch (err) {
                        console.warn(`Kunde inte läsa config.json för ${folderName}:`, err.message);
                    }
                }

                let sortOrder = 0;
                for (const file of pairFiles) {
                    const pairId = file.replace('.png', '');
                    const imagePathB = fs.existsSync(path.join(CARDS_DIR, folderName, `${pairId}-b.png`))
                        ? `${folderName}/${pairId}-b.png`
                        : null;
                    await Theme.addPair(theme.id, {
                        pairId,
                        name: configPairs[pairId] || pairId,
                        description: '',
                        sortOrder: sortOrder++,
                        imagePath: `${folderName}/${file}`,
                        imagePathB,
                        showName: 1
                    });
                }
                continue;
            }

            // Fallback: migrera från gammal suit/rank-struktur
            const legacyFolders = ['aubergine', 'radish', 'pepper', 'potato'];
            const legacyRanks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
            const hasLegacy = legacyFolders.some(f => fs.existsSync(path.join(CARDS_DIR, folderName, f)));
            if (!hasLegacy) {
                continue;
            }

            let sortOrder = 0;
            for (const rank of legacyRanks) {
                const pairId = `pair-${rank}`;
                await Theme.addPair(theme.id, {
                    pairId,
                    name: rank,
                    sortOrder: sortOrder++,
                    imagePath: `${folderName}/aubergine/${rank}.png`,
                    showName: 1
                });
            }
        }
    }

    /**
     * Hämtar eller skapar ett standardtema med 26 par om inga teman finns.
     */
    static async ensureDefaultTheme() {
        const themes = await Theme.list();
        if (themes.length > 0) {
            return;
        }

        const folderName = 'standard';
        let theme = await Theme.findByFolder(folderName);
        if (!theme) {
            theme = await Theme.create({
                folderName,
                displayName: 'Standard'
            });
        }

        const pairs = [];
        for (let i = 1; i <= DEFAULT_PAIR_COUNT; i++) {
            pairs.push({
                pairId: `pair-${i}`,
                name: `Par ${i}`,
                description: '',
                sortOrder: i - 1,
                imagePath: null,
                imagePathB: null,
                showName: 1
            });
        }
        await Theme.setPairs(theme.id, pairs);
    }
}

module.exports = Theme;
