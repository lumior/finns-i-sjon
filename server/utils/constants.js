const GAME_CONSTANTS = {
    MIN_PLAYERS: 2,
    MAX_PLAYERS: 6,
    CARDS_PER_PLAYER_2P: 7,
    CARDS_PER_PLAYER_MULTI: 5,
    SUITS: ['hearts', 'diamonds', 'clubs', 'spades'],
    RANKS: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
    SUIT_SYMBOLS: {
        hearts: '♥',
        diamonds: '♦',
        clubs: '♣',
        spades: '♠'
    },
    SUIT_COLORS: {
        hearts: 'red',
        diamonds: 'red',
        clubs: 'black',
        spades: 'black'
    },
    GAME_STATES: {
        WAITING: 'waiting',
        DEALING: 'dealing',
        PLAYING: 'playing',
        FINISHED: 'finished'
    },
    GAME_TYPES: {
        STANDARD: 'standard',
        TOURNAMENT: 'tournament',
        PRIVATE: 'private',
        AI_CHALLENGE: 'ai_challenge'
    },
    AI_DIFFICULTIES: {
        NAIVE: 'naive',
        SMART: 'smart',
        EXPERT: 'expert',
        MASTER: 'master'
    },
    ACHIEVEMENTS: {
        FIRST_WIN: 'first_win',
        FISHERMAN: 'fisherman',
        MASTER_FISHERMAN: 'master_fisherman',
        LUCKY_STAR: 'lucky_star',
        PAIR_MASTER: 'pair_master',
        SPEED_DEMON: 'speed_demon',
        COMEBACK_KID: 'comeback_kid',
        SOLO_VICTORY: 'solo_victory',
        AI_SLAYER: 'ai_slayer',
        CHAT_MASTER: 'chat_master'
    },
    ELO_K_FACTOR: 32,
    TURN_TIMEOUT: 45000,
    MAX_TURN_TIME: 60000,
    CHAT_MAX_LENGTH: 200,
    GAME_LOG_MAX: 50,
    CHAT_HISTORY_MAX: 100
};

module.exports = GAME_CONSTANTS;
