const Auth = require('../auth/auth');
const createSocketHandlers = require('./handlers');
const createHandleGameEnd = require('./game-end');

function registerSocketHandlers(io, roomManager, dependencies) {
    const { Game, User, db, ELO, escapeHtml } = dependencies;

    const handleGameEnd = createHandleGameEnd(io, roomManager, Game, User, ELO);
    const onConnection = createSocketHandlers(io, roomManager, Game, User, db, escapeHtml, handleGameEnd);

    io.use(Auth.socketAuth);
    io.on('connection', onConnection);
}

module.exports = registerSocketHandlers;
