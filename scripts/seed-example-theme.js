const db = require('../server/config/database');
const Theme = require('../server/models/Theme');

async function seed() {
    await db.waitForConnection();

    const theme = await Theme.findByFolder('exempeltema');
    if (theme) {
        console.log('Exempeltema finns redan i databasen');
        await db.close();
        return;
    }

    const created = await Theme.create({
        folderName: 'exempeltema',
        displayName: 'Exempeltema'
    });

    const config = require('../public_html/assets/cards/exempeltema/config.json');
    await Theme.setPairs(
        created.id,
        config.pairs.map(p => ({
            pairId: p.pairId,
            name: p.name,
            sortOrder: p.sortOrder,
            imagePath: p.imagePath
        }))
    );

    await db.saveThemeFiles('exempeltema');
    console.log('Exempeltema seedat med 26 par');
    await db.close();
}

seed().catch(err => {
    console.error('Fel vid seeding:', err);
    process.exit(1);
});
