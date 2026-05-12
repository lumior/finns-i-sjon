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
        this.connect();
    }

    async connect() {
        try {
            this.pool = mysql.createPool(DB_CONFIG);
            // Testa anslutningen
            const connection = await this.pool.getConnection();
            console.log('✅ Connected to MariaDB database');
            connection.release();
            await this.initTables();
        } catch (err) {
            console.error('Database connection failed:', err.message);
            // Fallback till SQLite om MariaDB inte är tillgänglig
            if (process.env.DB_FALLBACK !== 'false') {
                console.log('⚠️  Falling back to SQLite...');
                this.initSQLiteFallback();
            }
        }
    }

    async initTables() {
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

            // Index för prestanda
            await this.run(`CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo_rating DESC)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_users_online ON users(is_online)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at DESC)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_game_participants_user ON game_participants(user_id)`);
            await this.run(`CREATE INDEX IF NOT EXISTS idx_game_events_game ON game_events(game_id)`);

            console.log('✅ Database tables initialized');
        } catch (err) {
            console.error('Failed to initialize tables:', err.message);
        }
    }

    // SQLite fallback (behålls för utveckling och bakåtkompatibilitet)
    initSQLiteFallback() {
        const sqlite3 = require('sqlite3').verbose();
        const path = require('path');
        const fs = require('fs');
        const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../database/game.db');
        
        // Skapa database-mappen om den inte finns (viktigt på Railway m.fl.)
        const dbDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        this.db = new sqlite3.Database(DB_PATH);
        this.isSQLite = true;
        
        // Emulera pool-metoder med sqlite3
        this.query = (sql, params = []) => {
            return new Promise((resolve, reject) => {
                this.db.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        };
        
        this.get = (sql, params = []) => {
            return new Promise((resolve, reject) => {
                this.db.get(sql, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        };
        
        this.run = (sql, params = []) => {
            return new Promise((resolve, reject) => {
                this.db.run(sql, params, function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, changes: this.changes });
                });
            });
        };
        
        // Initiera SQLite-tabeller — serialize() säkerställer ordning
        this.db.serialize(() => {
            this.db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, display_name TEXT, avatar_url TEXT DEFAULT '/assets/images/default-avatar.png', elo_rating INTEGER DEFAULT 1200, games_played INTEGER DEFAULT 0, games_won INTEGER DEFAULT 0, games_lost INTEGER DEFAULT 0, total_pairs INTEGER DEFAULT 0, total_fishings INTEGER DEFAULT 0, total_asks INTEGER DEFAULT 0, successful_asks INTEGER DEFAULT 0, longest_streak INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_login DATETIME, is_online INTEGER DEFAULT 0)`);
            this.db.run(`CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, game_type TEXT DEFAULT 'standard', player_count INTEGER, winner_id INTEGER, winner_name TEXT, duration_seconds INTEGER, total_turns INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            this.db.run(`CREATE TABLE IF NOT EXISTS game_participants (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER, user_id INTEGER, final_pairs INTEGER, final_rank INTEGER, elo_change INTEGER)`);
            this.db.run(`CREATE TABLE IF NOT EXISTS game_events (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER, event_type TEXT, player_id INTEGER, target_id INTEGER, rank TEXT, success INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            this.db.run(`CREATE TABLE IF NOT EXISTS friendships (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, friend_id INTEGER, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, friend_id))`);
            this.db.run(`CREATE TABLE IF NOT EXISTS achievements (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, achievement_type TEXT, unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, achievement_type))`, () => {
                console.log('✅ SQLite fallback tables initialized');
            });
        });
    }

    async query(sql, params = []) {
        if (this.isSQLite) {
            return new Promise((resolve, reject) => {
                this.db.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        }
        const [rows] = await this.pool.execute(sql, params);
        return rows;
    }

    async get(sql, params = []) {
        if (this.isSQLite) {
            return new Promise((resolve, reject) => {
                this.db.get(sql, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        }
        const [rows] = await this.pool.execute(sql, params);
        return rows[0];
    }

    async run(sql, params = []) {
        if (this.isSQLite) {
            return new Promise((resolve, reject) => {
                this.db.run(sql, params, function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, changes: this.changes });
                });
            });
        }
        const [result] = await this.pool.execute(sql, params);
        return { 
            id: result.insertId, 
            changes: result.affectedRows 
        };
    }
}

module.exports = new Database();
