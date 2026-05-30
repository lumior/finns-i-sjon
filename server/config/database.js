const mysql = require('mysql2/promise');

// Anslutningskonfiguration — läses från miljövariabler
const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'finns_i_sjon',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
};

class Database {
    constructor() {
        this.pool = null;
        this.db = null;
        this.isSQLite = false;
        this.isPostgres = false;
        this.connect();
    }

    async connect() {
        // 1. Försök PostgreSQL (Railway standard)
        if (process.env.DATABASE_URL) {
            try {
                const { Pool } = require('pg');
                this.pool = new Pool({
                    connectionString: process.env.DATABASE_URL,
                    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
                });
                const client = await this.pool.connect();
                console.log('✅ Connected to PostgreSQL database');
                client.release();
                this.isPostgres = true;
                await this.initPostgresTables();
                return;
            } catch (err) {
                console.error('PostgreSQL connection failed:', err.message);
            }
        }

        // 2. Försök MariaDB
        try {
            this.pool = mysql.createPool(DB_CONFIG);
            const connection = await this.pool.getConnection();
            console.log('✅ Connected to MariaDB database');
            connection.release();
            await this.initMariaDBTables();
            return;
        } catch (err) {
            console.error('MariaDB connection failed:', err.message);
        }

        // 3. Fallback till SQLite
        if (process.env.DB_FALLBACK !== 'false') {
            console.log('⚠️  Falling back to SQLite...');
            this.initSQLiteFallback();
        }
    }

    async initPostgresTables() {
        try {
            await this.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    email VARCHAR(100) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    display_name VARCHAR(50),
                    avatar_url VARCHAR(255) DEFAULT '/assets/images/default-avatar.png',
                    elo_rating INT DEFAULT 1200,
                    games_played INT DEFAULT 0,
                    games_won INT DEFAULT 0,
                    games_lost INT DEFAULT 0,
                    total_pairs INT DEFAULT 0,
                    total_fishings INT DEFAULT 0,
                    total_asks INT DEFAULT 0,
                    successful_asks INT DEFAULT 0,
                    longest_streak INT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_login TIMESTAMP,
                    is_online SMALLINT DEFAULT 0
                )
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS games (
                    id SERIAL PRIMARY KEY,
                    room_id VARCHAR(20) NOT NULL,
                    game_type VARCHAR(20) DEFAULT 'standard',
                    player_count INT,
                    winner_id INT,
                    winner_name VARCHAR(50),
                    duration_seconds INT,
                    total_turns INT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS game_participants (
                    id SERIAL PRIMARY KEY,
                    game_id INT,
                    user_id INT,
                    final_pairs INT,
                    final_rank INT,
                    elo_change INT
                )
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS game_events (
                    id SERIAL PRIMARY KEY,
                    game_id INT,
                    event_type VARCHAR(30),
                    player_id INT,
                    target_id INT,
                    rank VARCHAR(5),
                    success SMALLINT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS friendships (
                    id SERIAL PRIMARY KEY,
                    user_id INT,
                    friend_id INT,
                    status VARCHAR(20) DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, friend_id)
                )
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS achievements (
                    id SERIAL PRIMARY KEY,
                    user_id INT,
                    achievement_type VARCHAR(30),
                    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, achievement_type)
                )
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS game_snapshots (
                    id SERIAL PRIMARY KEY,
                    room_id VARCHAR(20) NOT NULL,
                    snapshot JSONB NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS theme_files (
                    id SERIAL PRIMARY KEY,
                    theme_name VARCHAR(50) NOT NULL,
                    file_path VARCHAR(100) NOT NULL,
                    file_data TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(theme_name, file_path)
                )
            `);

            // Index för prestanda
            await this.run(`CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo_rating DESC)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_users_online ON users(is_online)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at DESC)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_game_participants_user ON game_participants(user_id)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_game_events_game ON game_events(game_id)`);

            console.log('✅ PostgreSQL tables initialized');
        } catch (err) {
            console.error('Failed to initialize PostgreSQL tables:', err.message);
        }
    }

    async initMariaDBTables() {
        try {
            await this.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    email VARCHAR(100) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    display_name VARCHAR(50),
                    avatar_url VARCHAR(255) DEFAULT '/assets/images/default-avatar.png',
                    elo_rating INT DEFAULT 1200,
                    games_played INT DEFAULT 0,
                    games_won INT DEFAULT 0,
                    games_lost INT DEFAULT 0,
                    total_pairs INT DEFAULT 0,
                    total_fishings INT DEFAULT 0,
                    total_asks INT DEFAULT 0,
                    successful_asks INT DEFAULT 0,
                    longest_streak INT DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_login DATETIME,
                    is_online TINYINT DEFAULT 0
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS games (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    room_id VARCHAR(20) NOT NULL,
                    game_type VARCHAR(20) DEFAULT 'standard',
                    player_count INT,
                    winner_id INT,
                    winner_name VARCHAR(50),
                    duration_seconds INT,
                    total_turns INT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS game_participants (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    game_id INT,
                    user_id INT,
                    final_pairs INT,
                    final_rank INT,
                    elo_change INT,
                    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS game_events (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    game_id INT,
                    event_type VARCHAR(30),
                    player_id INT,
                    target_id INT,
                    rank VARCHAR(5),
                    success TINYINT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS friendships (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    user_id INT,
                    friend_id INT,
                    status VARCHAR(20) DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, friend_id),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS achievements (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    user_id INT,
                    achievement_type VARCHAR(30),
                    unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, achievement_type),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS game_snapshots (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    room_id VARCHAR(20) NOT NULL,
                    snapshot JSON NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            await this.run(`CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo_rating DESC)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_users_online ON users(is_online)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at DESC)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_game_participants_user ON game_participants(user_id)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_game_events_game ON game_events(game_id)`);

            console.log('✅ MariaDB tables initialized');
        } catch (err) {
            console.error('Failed to initialize MariaDB tables:', err.message);
        }
    }

    // SQLite fallback (behålls för utveckling och bakåtkompatibilitet)
    initSQLiteFallback() {
        const sqlite3 = require('sqlite3').verbose();
        const path = require('path');
        const fs = require('fs');
        const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../database/game.db');

        const dbDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        this.db = new sqlite3.Database(DB_PATH);
        this.isSQLite = true;

        this.query = (sql, params = []) => {
            return new Promise((resolve, reject) => {
                this.db.all(sql, params, (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            });
        };

        this.get = (sql, params = []) => {
            return new Promise((resolve, reject) => {
                this.db.get(sql, params, (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                });
            });
        };

        this.run = (sql, params = []) => {
            return new Promise((resolve, reject) => {
                this.db.run(sql, params, function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ id: this.lastID, changes: this.changes });
                    }
                });
            });
        };

        this.db.serialize(() => {
            this.db.run(
                `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, display_name TEXT, avatar_url TEXT DEFAULT '/assets/images/default-avatar.png', elo_rating INTEGER DEFAULT 1200, games_played INTEGER DEFAULT 0, games_won INTEGER DEFAULT 0, games_lost INTEGER DEFAULT 0, total_pairs INTEGER DEFAULT 0, total_fishings INTEGER DEFAULT 0, total_asks INTEGER DEFAULT 0, successful_asks INTEGER DEFAULT 0, longest_streak INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_login DATETIME, is_online INTEGER DEFAULT 0)`
            );
            this.db.run(
                `CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, game_type TEXT DEFAULT 'standard', player_count INTEGER, winner_id INTEGER, winner_name TEXT, duration_seconds INTEGER, total_turns INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`
            );
            this.db.run(
                `CREATE TABLE IF NOT EXISTS game_participants (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER, user_id INTEGER, final_pairs INTEGER, final_rank INTEGER, elo_change INTEGER)`
            );
            this.db.run(
                `CREATE TABLE IF NOT EXISTS game_events (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER, event_type TEXT, player_id INTEGER, target_id INTEGER, rank TEXT, success INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`
            );
            this.db.run(
                `CREATE TABLE IF NOT EXISTS friendships (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, friend_id INTEGER, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, friend_id))`
            );
            this.db.run(
                `CREATE TABLE IF NOT EXISTS achievements (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, achievement_type TEXT, unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, achievement_type))`
            );
            this.db.run(
                `CREATE TABLE IF NOT EXISTS game_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, snapshot TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`
            );
            this.db.run(
                `CREATE TABLE IF NOT EXISTS theme_files (id INTEGER PRIMARY KEY AUTOINCREMENT, theme_name TEXT NOT NULL, file_path TEXT NOT NULL, file_data TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(theme_name, file_path))`,
                () => {
                    console.log('✅ SQLite fallback tables initialized');
                }
            );
        });
    }

    async query(sql, params = []) {
        if (this.isSQLite) {
            return new Promise((resolve, reject) => {
                this.db.all(sql, params, (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            });
        }
        if (this.isPostgres) {
            const result = await this.pool.query(this._pgSql(sql), params);
            return result.rows;
        }
        const [rows] = await this.pool.execute(sql, params);
        return rows;
    }

    // Konvertera ?-placeholders till $1,$2... för PostgreSQL
    _pgSql(sql) {
        let i = 0;
        return sql.replace(/\?/g, () => `$${++i}`);
    }

    async get(sql, params = []) {
        if (this.isSQLite) {
            return new Promise((resolve, reject) => {
                this.db.get(sql, params, (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                });
            });
        }
        if (this.isPostgres) {
            const result = await this.pool.query(this._pgSql(sql), params);
            return result.rows[0] || null;
        }
        const [rows] = await this.pool.execute(sql, params);
        return rows[0];
    }

    async run(sql, params = []) {
        if (this.isSQLite) {
            return new Promise((resolve, reject) => {
                this.db.run(sql, params, function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ id: this.lastID, changes: this.changes });
                    }
                });
            });
        }
        if (this.isPostgres) {
            const pgSql = this._pgSql(sql);
            const result = await this.pool.query(pgSql, params);
            // Hämta senaste INSERT-id via lastval()
            let lastId = 0;
            if (pgSql.trim().toLowerCase().startsWith('insert')) {
                const idResult = await this.pool.query('SELECT lastval()');
                lastId = parseInt(idResult.rows[0].lastval, 10) || 0;
            }
            return {
                id: lastId,
                changes: result.rowCount
            };
        }
        const [result] = await this.pool.execute(sql, params);
        return {
            id: result.insertId,
            changes: result.affectedRows
        };
    }

    async saveGameSnapshot(roomId, snapshot) {
        try {
            if (this.isPostgres) {
                await this.run('INSERT INTO game_snapshots (room_id, snapshot) VALUES ($1, $2)', [
                    roomId,
                    JSON.stringify(snapshot)
                ]);
            } else {
                await this.run('INSERT INTO game_snapshots (room_id, snapshot) VALUES (?, ?)', [
                    roomId,
                    JSON.stringify(snapshot)
                ]);
            }
        } catch (err) {
            console.error('Failed to save game snapshot:', err.message);
        }
    }

    /* ========================================
       TEMA-FILSYNK: DB ↔ Filystem
       ======================================== */

    async saveThemeFiles(themeName) {
        const fs = require('fs');
        const path = require('path');
        const CARDS_DIR = path.join(__dirname, '../../public_html/assets/cards');
        const themePath = path.join(CARDS_DIR, themeName);

        if (!fs.existsSync(themePath)) {
            console.warn(`Tema ${themeName} finns inte på filsystemet, hoppar över DB-sparning`);
            return;
        }

        const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        const SUIT_FOLDERS = ['aubergine', 'radish', 'pepper', 'potato'];
        let saved = 0;

        try {
            // Rensa gamla poster för detta tema
            if (this.isPostgres) {
                await this.run('DELETE FROM theme_files WHERE theme_name = $1', [themeName]);
            } else {
                await this.run('DELETE FROM theme_files WHERE theme_name = ?', [themeName]);
            }

            // Spara alla kortfiler
            for (const folder of SUIT_FOLDERS) {
                const suitPath = path.join(themePath, folder);
                if (!fs.existsSync(suitPath)) {
                    continue;
                }
                for (const rank of RANKS) {
                    const filePath = path.join(suitPath, `${rank}.png`);
                    if (fs.existsSync(filePath)) {
                        const base64 = fs.readFileSync(filePath).toString('base64');
                        const dbPath = `${themeName}/${folder}/${rank}.png`;
                        if (this.isPostgres) {
                            await this.run(
                                'INSERT INTO theme_files (theme_name, file_path, file_data) VALUES ($1, $2, $3)',
                                [themeName, dbPath, base64]
                            );
                        } else {
                            await this.run(
                                'INSERT INTO theme_files (theme_name, file_path, file_data) VALUES (?, ?, ?)',
                                [themeName, dbPath, base64]
                            );
                        }
                        saved++;
                    }
                }
            }

            // Spara back.png om den finns
            const backPath = path.join(themePath, 'back.png');
            if (fs.existsSync(backPath)) {
                const base64 = fs.readFileSync(backPath).toString('base64');
                if (this.isPostgres) {
                    await this.run(
                        'INSERT INTO theme_files (theme_name, file_path, file_data) VALUES ($1, $2, $3)',
                        [themeName, `${themeName}/back.png`, base64]
                    );
                } else {
                    await this.run(
                        'INSERT INTO theme_files (theme_name, file_path, file_data) VALUES (?, ?, ?)',
                        [themeName, `${themeName}/back.png`, base64]
                    );
                }
                saved++;
            }

            console.log(`💾 Sparade ${saved} filer för tema ${themeName} till databasen`);
        } catch (err) {
            console.error(`Fel vid sparning av tema ${themeName} till DB:`, err.message);
        }
    }

    async restoreThemeFiles() {
        const fs = require('fs');
        const path = require('path');
        const CARDS_DIR = path.join(__dirname, '../../public_html/assets/cards');

        try {
            let rows;
            if (this.isPostgres) {
                rows = await this.query('SELECT DISTINCT theme_name FROM theme_files');
            } else {
                rows = await this.query('SELECT DISTINCT theme_name FROM theme_files');
            }

            if (rows.length === 0) {
                return;
            }

            let restored = 0;
            for (const row of rows) {
                const themeName = row.theme_name;

                // Hämta alla filer för detta tema
                let files;
                if (this.isPostgres) {
                    files = await this.query(
                        'SELECT file_path, file_data FROM theme_files WHERE theme_name = $1',
                        [themeName]
                    );
                } else {
                    files = await this.query(
                        'SELECT file_path, file_data FROM theme_files WHERE theme_name = ?',
                        [themeName]
                    );
                }

                for (const file of files) {
                    const relativePath = file.file_path.replace(`${themeName}/`, '');
                    const fullPath = path.join(CARDS_DIR, themeName, relativePath);

                    // Skapa mapp om den inte finns
                    const dir = path.dirname(fullPath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }

                    // Skriv bara om filen saknas
                    if (!fs.existsSync(fullPath)) {
                        fs.writeFileSync(fullPath, Buffer.from(file.file_data, 'base64'));
                        restored++;
                    }
                }
            }

            if (restored > 0) {
                console.log(`📂 Återställde ${restored} temafiler från databasen till filsystemet`);
            }
        } catch (err) {
            console.error('Fel vid återställning av temafiler:', err.message);
        }
    }
}

module.exports = new Database();
