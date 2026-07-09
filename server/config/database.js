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
        this.connectPromise = this.connect();
    }

    async waitForConnection() {
        return this.connectPromise;
    }

    async connect() {
        // I testmiljön använd alltid SQLite för snabbhet och isolering
        if (process.env.NODE_ENV === 'test') {
            this.initSQLiteFallback();
            return;
        }

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
        if (process.env.NODE_ENV === 'production' && process.env.DB_FALLBACK !== 'true') {
            throw new Error(
                'Ingen PostgreSQL- eller MariaDB-anslutning kunde etableras i produktion. ' +
                    'Sätt DATABASE_URL (rekommenderat) eller DB_HOST/DB_USER/DB_PASSWORD/DB_NAME, ' +
                    'eller sätt DB_FALLBACK=true om du medvetet vill använda SQLite.'
            );
        }

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
                    is_online SMALLINT DEFAULT 0,
                    email_verified SMALLINT DEFAULT 0,
                    is_admin SMALLINT DEFAULT 0
                )
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS user_tokens (
                    id SERIAL PRIMARY KEY,
                    user_id INT NOT NULL,
                    token VARCHAR(255) UNIQUE NOT NULL,
                    type VARCHAR(30) NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    used SMALLINT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

            await this.run(`
                CREATE TABLE IF NOT EXISTS themes (
                    id SERIAL PRIMARY KEY,
                    folder_name VARCHAR(50) UNIQUE NOT NULL,
                    display_name VARCHAR(100) NOT NULL,
                    description TEXT,
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS theme_pairs (
                    id SERIAL PRIMARY KEY,
                    theme_id INT NOT NULL,
                    pair_id VARCHAR(20) NOT NULL,
                    name VARCHAR(100) NOT NULL,
                    description VARCHAR(255),
                    sort_order INT DEFAULT 0,
                    image_path VARCHAR(200),
                    image_path_b VARCHAR(200),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(theme_id, pair_id),
                    FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE
                )
            `);

            try {
                await this.run(`
                    CREATE TABLE IF NOT EXISTS persistent_rooms (
                        room_id VARCHAR(20) PRIMARY KEY,
                        owner_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        room_name VARCHAR(100) NOT NULL,
                        game_type VARCHAR(20) DEFAULT 'standard',
                        max_players INT DEFAULT 6,
                        allow_ai BOOLEAN DEFAULT true,
                        turn_timer BOOLEAN DEFAULT true,
                        spectator_mode BOOLEAN DEFAULT true,
                        deck_theme VARCHAR(50) DEFAULT 'standard',
                        password_hash VARCHAR(255),
                        is_private BOOLEAN DEFAULT false,
                        is_active BOOLEAN DEFAULT true,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                console.log('✅ persistent_rooms table ready');
            } catch (err) {
                console.error('❌ Failed to create persistent_rooms table:', err.message);
                throw err;
            }

            await this.run(`
                CREATE TABLE IF NOT EXISTS room_invites (
                    id SERIAL PRIMARY KEY,
                    room_id VARCHAR(20) NOT NULL,
                    room_name VARCHAR(100) NOT NULL,
                    host_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    friend_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    delivered SMALLINT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(room_id, friend_user_id)
                )
            `);

            // Index för prestanda
            await this.run(`CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo_rating DESC)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_users_online ON users(is_online)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at DESC)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_game_participants_user ON game_participants(user_id)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_game_events_game ON game_events(game_id)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_theme_pairs_theme ON theme_pairs(theme_id)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_persistent_rooms_owner ON persistent_rooms(owner_user_id)`);
            await this.run(
                `CREATE INDEX IF NOT EXISTS idx_room_invites_friend ON room_invites(friend_user_id, delivered)`
            );

            // Migration: lägg till image_path_b och description för theme_pairs
            await this.run(`ALTER TABLE theme_pairs ADD COLUMN IF NOT EXISTS image_path_b VARCHAR(200)`).catch(
                () => {}
            );
            await this.run(`ALTER TABLE theme_pairs ADD COLUMN IF NOT EXISTS description VARCHAR(255)`).catch(() => {});

            // Migration: lägg till email_verified för befintliga databaser
            await this.run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified SMALLINT DEFAULT 0`).catch(
                () => {}
            );
            await this.run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin SMALLINT DEFAULT 0`).catch(() => {});
            await this.run(
                `CREATE TABLE IF NOT EXISTS user_tokens (id SERIAL PRIMARY KEY, user_id INT NOT NULL, token VARCHAR(255) UNIQUE NOT NULL, type VARCHAR(30) NOT NULL, expires_at TIMESTAMP NOT NULL, used SMALLINT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
            );

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
                    is_online TINYINT DEFAULT 0,
                    email_verified TINYINT DEFAULT 0,
                    is_admin TINYINT DEFAULT 0
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS user_tokens (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    user_id INT NOT NULL,
                    token VARCHAR(255) UNIQUE NOT NULL,
                    type VARCHAR(30) NOT NULL,
                    expires_at DATETIME NOT NULL,
                    used TINYINT DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

            await this.run(`
                CREATE TABLE IF NOT EXISTS theme_files (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    theme_name VARCHAR(50) NOT NULL,
                    file_path VARCHAR(100) NOT NULL,
                    file_data LONGTEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(theme_name, file_path)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS themes (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    folder_name VARCHAR(50) UNIQUE NOT NULL,
                    display_name VARCHAR(100) NOT NULL,
                    description TEXT,
                    is_active TINYINT DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS theme_pairs (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    theme_id INT NOT NULL,
                    pair_id VARCHAR(20) NOT NULL,
                    name VARCHAR(100) NOT NULL,
                    description VARCHAR(255),
                    sort_order INT DEFAULT 0,
                    image_path VARCHAR(200),
                    image_path_b VARCHAR(200),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE(theme_id, pair_id),
                    FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS persistent_rooms (
                    room_id VARCHAR(20) PRIMARY KEY,
                    owner_user_id INT NOT NULL,
                    room_name VARCHAR(100) NOT NULL,
                    game_type VARCHAR(20) DEFAULT 'standard',
                    max_players INT DEFAULT 6,
                    allow_ai TINYINT DEFAULT 1,
                    turn_timer TINYINT DEFAULT 1,
                    spectator_mode TINYINT DEFAULT 1,
                    deck_theme VARCHAR(50) DEFAULT 'standard',
                    password_hash VARCHAR(255),
                    is_private TINYINT DEFAULT 0,
                    is_active TINYINT DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            await this.run(`
                CREATE TABLE IF NOT EXISTS room_invites (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    room_id VARCHAR(20) NOT NULL,
                    room_name VARCHAR(100) NOT NULL,
                    host_user_id INT NOT NULL,
                    friend_user_id INT NOT NULL,
                    delivered TINYINT DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(room_id, friend_user_id),
                    FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (friend_user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            await this.run(`CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo_rating DESC)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_users_online ON users(is_online)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at DESC)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_game_participants_user ON game_participants(user_id)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_game_events_game ON game_events(game_id)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_persistent_rooms_owner ON persistent_rooms(owner_user_id)`);
            await this.run(
                `CREATE INDEX IF NOT EXISTS idx_room_invites_friend ON room_invites(friend_user_id, delivered)`
            );

            // Migration: lägg till image_path_b och description för theme_pairs
            await this.run(`ALTER TABLE theme_pairs ADD COLUMN IF NOT EXISTS image_path_b VARCHAR(200)`).catch(
                () => {}
            );
            await this.run(`ALTER TABLE theme_pairs ADD COLUMN IF NOT EXISTS description VARCHAR(255)`).catch(() => {});

            // Migration: lägg till email_verified för befintliga databaser
            await this.run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified TINYINT DEFAULT 0`).catch(
                () => {}
            );
            await this.run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin TINYINT DEFAULT 0`).catch(() => {});
            await this.run(
                `CREATE TABLE IF NOT EXISTS user_tokens (id INT PRIMARY KEY AUTO_INCREMENT, user_id INT NOT NULL, token VARCHAR(255) UNIQUE NOT NULL, type VARCHAR(30) NOT NULL, expires_at DATETIME NOT NULL, used TINYINT DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
            );

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
                `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, display_name TEXT, avatar_url TEXT DEFAULT '/assets/images/default-avatar.png', elo_rating INTEGER DEFAULT 1200, games_played INTEGER DEFAULT 0, games_won INTEGER DEFAULT 0, games_lost INTEGER DEFAULT 0, total_pairs INTEGER DEFAULT 0, total_fishings INTEGER DEFAULT 0, total_asks INTEGER DEFAULT 0, successful_asks INTEGER DEFAULT 0, longest_streak INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_login DATETIME, is_online INTEGER DEFAULT 0, email_verified INTEGER DEFAULT 0, is_admin INTEGER DEFAULT 0)`
            );
            this.db.run(
                `CREATE TABLE IF NOT EXISTS user_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token TEXT UNIQUE NOT NULL, type TEXT NOT NULL, expires_at DATETIME NOT NULL, used INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`
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
                `CREATE TABLE IF NOT EXISTS theme_files (id INTEGER PRIMARY KEY AUTOINCREMENT, theme_name TEXT NOT NULL, file_path TEXT NOT NULL, file_data TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(theme_name, file_path))`
            );
            this.db.run(
                `CREATE TABLE IF NOT EXISTS themes (id INTEGER PRIMARY KEY AUTOINCREMENT, folder_name TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, description TEXT, is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`
            );
            this.db.run(
                `CREATE TABLE IF NOT EXISTS theme_pairs (id INTEGER PRIMARY KEY AUTOINCREMENT, theme_id INTEGER NOT NULL, pair_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, sort_order INTEGER DEFAULT 0, image_path TEXT, image_path_b TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(theme_id, pair_id), FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE)`
            );
            this.db.run(
                `CREATE TABLE IF NOT EXISTS persistent_rooms (room_id TEXT PRIMARY KEY, owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, room_name TEXT NOT NULL, game_type TEXT DEFAULT 'standard', max_players INTEGER DEFAULT 6, allow_ai INTEGER DEFAULT 1, turn_timer INTEGER DEFAULT 1, spectator_mode INTEGER DEFAULT 1, deck_theme TEXT DEFAULT 'standard', password_hash TEXT, is_private INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`
            );
            this.db.run(
                `CREATE TABLE IF NOT EXISTS room_invites (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, room_name TEXT NOT NULL, host_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, friend_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, delivered INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(room_id, friend_user_id))`
            );
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_theme_pairs_theme ON theme_pairs(theme_id)`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_persistent_rooms_owner ON persistent_rooms(owner_user_id)`);
            // Migration: lägg till image_path_b och description för theme_pairs
            this.db.run(`ALTER TABLE theme_pairs ADD COLUMN image_path_b TEXT`, () => {});
            this.db.run(`ALTER TABLE theme_pairs ADD COLUMN description TEXT`, () => {});

            // Migration: lägg till email_verified, is_admin och user_tokens för befintliga SQLite-databaser
            this.db.run(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`, () => {});
            this.db.run(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`, () => {});
            this.db.run(
                `CREATE TABLE IF NOT EXISTS user_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token TEXT UNIQUE NOT NULL, type TEXT NOT NULL, expires_at DATETIME NOT NULL, used INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
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
            // Hämta senaste INSERT-id via lastval() om tabellen använder en sekvens
            let lastId = 0;
            if (pgSql.trim().toLowerCase().startsWith('insert')) {
                try {
                    const idResult = await this.pool.query('SELECT lastval()');
                    lastId = parseInt(idResult.rows[0].lastval, 10) || 0;
                } catch {
                    // Tabellen har ingen sekvens (t.ex. explicit PK som VARCHAR)
                    lastId = 0;
                }
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

        let saved = 0;

        try {
            // Rensa gamla poster för detta tema
            if (this.isPostgres) {
                await this.run('DELETE FROM theme_files WHERE theme_name = $1', [themeName]);
            } else {
                await this.run('DELETE FROM theme_files WHERE theme_name = ?', [themeName]);
            }

            // Hämta par från databasen för att veta vilka bilder som ska sparas
            const Theme = require('../models/Theme');
            const theme = await Theme.findByFolder(themeName);
            const pairs = theme ? await Theme.getPairs(theme.id) : [];

            // Spara par-bilder (nya strukturen)
            for (const pair of pairs) {
                const filePath = path.join(themePath, `${pair.pair_id}.png`);
                if (fs.existsSync(filePath)) {
                    const base64 = fs.readFileSync(filePath).toString('base64');
                    const dbPath = `${themeName}/${pair.pair_id}.png`;
                    if (this.isPostgres) {
                        await this.run(
                            'INSERT INTO theme_files (theme_name, file_path, file_data) VALUES ($1, $2, $3)',
                            [themeName, dbPath, base64]
                        );
                    } else {
                        await this.run('INSERT INTO theme_files (theme_name, file_path, file_data) VALUES (?, ?, ?)', [
                            themeName,
                            dbPath,
                            base64
                        ]);
                    }
                    saved++;
                }
            }

            // Spara back.png om den finns
            const backPath = path.join(themePath, 'back.png');
            if (fs.existsSync(backPath)) {
                const base64 = fs.readFileSync(backPath).toString('base64');
                if (this.isPostgres) {
                    await this.run('INSERT INTO theme_files (theme_name, file_path, file_data) VALUES ($1, $2, $3)', [
                        themeName,
                        `${themeName}/back.png`,
                        base64
                    ]);
                } else {
                    await this.run('INSERT INTO theme_files (theme_name, file_path, file_data) VALUES (?, ?, ?)', [
                        themeName,
                        `${themeName}/back.png`,
                        base64
                    ]);
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
                    files = await this.query('SELECT file_path, file_data FROM theme_files WHERE theme_name = $1', [
                        themeName
                    ]);
                } else {
                    files = await this.query('SELECT file_path, file_data FROM theme_files WHERE theme_name = ?', [
                        themeName
                    ]);
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

    async close() {
        if (this.isSQLite && this.db) {
            await new Promise((resolve, reject) => {
                this.db.close(err => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        } else if (this.pool) {
            await this.pool.end();
        }
    }
}

module.exports = new Database();
