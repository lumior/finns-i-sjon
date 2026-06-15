module.exports = async () => {
    process.env.DATABASE_URL = '';
    process.env.DB_HOST = '';
    process.env.DB_USER = '';
    process.env.DB_PASSWORD = '';
    process.env.DB_NAME = '';
    process.env.DB_FALLBACK = 'true';
    process.env.DB_PATH = './database/test-game.db';
};
