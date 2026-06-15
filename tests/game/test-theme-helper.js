const Theme = require('../../server/models/Theme');

let seeded = false;

async function ensureTestTheme() {
    if (seeded) {
        return;
    }
    seeded = true;

    await Theme.ensureDefaultTheme();

    // Seeda legacy-teman från filsystemet om de finns
    await Theme.seedFromFilesystem();
}

module.exports = { ensureTestTheme };
