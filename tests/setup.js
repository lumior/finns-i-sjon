// Test-setup: använd alltid SQLite i tester
process.env.DATABASE_URL = '';
process.env.DB_HOST = '';
process.env.DB_USER = '';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = '';
process.env.DB_FALLBACK = 'true';
process.env.DB_PATH = './database/test-game.db';

// Rensa eventuell cache av databasmodulen så att den ansluter på nytt med test-env
for (const key of Object.keys(require.cache)) {
    if (key.includes('server/config/database.js')) {
        delete require.cache[key];
    }
}
