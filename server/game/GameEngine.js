const CardDeck = require('./CardDeck');
const AIPlayer = require('./AIPlayer');
const { extractPairs } = require('./utils');
const {
    MIN_PLAYERS,
    MAX_PLAYERS,
    CARDS_PER_PLAYER_2P,
    CARDS_PER_PLAYER_MULTI,
    GAME_STATES
} = require('../utils/constants');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class GameEngine {
    constructor(roomId, gameType = 'standard') {
        this.roomId = roomId;
        this.gameType = gameType;
        this.players = [];
        this.aiPlayers = [];
        this.deck = new CardDeck();
        this.state = GAME_STATES.WAITING;
        this.currentPlayerIndex = 0;
        this.pile = [];
        this.chatHistory = [];
        this.gameLog = [];
        this.turnTimer = null;
        this.turnTimeout = 45000;
        this.maxTurnTime = 60000;

        this.startTime = null;
        this.endTime = null;
        this.totalTurns = 0;
        this.gameEvents = [];

        this.turnStartTime = null;
        this.turnTimerInterval = null;

        this.spectators = [];
        this.io = null;
        this.pendingAsk = null;

        this.settings = {
            allowAI: true,
            maxPlayers: 6,
            turnTimer: true,
            chatEnabled: true,
            spectatorMode: true,
            soundEnabled: true,
            animationsEnabled: true,
            deckTheme: 'standard'
        };

        this.onGameEvent = null;
        this.onStateChange = null;

        this.debugLogFile = path.join(__dirname, '..', '..', 'game-debug.log');
    }

    debugLog(label, data = {}) {
        // Skriv bara debug-logg till fil i utveckling (inte i produktion)
        if (process.env.NODE_ENV === 'production') {
            return;
        }

        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] [${this.roomId}] ${label}: ${JSON.stringify(data)}\n`;
        // Asynkron loggning för att inte blockera event-loopen
        fs.appendFile(this.debugLogFile, logLine, err => {
            if (err) {
                console.error('Debug log error:', err.message);
            }
        });
    }

    addPlayer(socketId, playerName, userData = null) {
        console.log(
            '🔍 GE addPlayer:',
            playerName,
            'players:',
            this.players.length,
            'ai:',
            this.aiPlayers.length,
            'max:',
            this.settings.maxPlayers
        );
        if (this.players.length + this.aiPlayers.length >= this.settings.maxPlayers) {
            return { success: false, error: 'Bordet är fullt' };
        }
        if (this.state !== GAME_STATES.WAITING) {
            return { success: false, error: 'Spelet har redan börjat' };
        }

        const existing = this.players.find(p => p.socketId === socketId);
        if (existing) {
            return { success: false, error: 'Du är redan med i bordet' };
        }

        const player = {
            id: `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            socketId,
            name: playerName,
            hand: [],
            pairs: [],
            connected: true,
            surrendered: false,
            userId: userData?.id || null,
            elo: userData?.elo || 1200,
            avatar: userData?.avatar || '/assets/images/default-avatar.png',
            askedThisTurn: false,
            turnTimeTotal: 0,
            successfulAsks: 0,
            failedAsks: 0,
            fishings: 0,
            luckyFishings: 0,
            rankHistory: [],
            ready: false,
            reconnectToken: crypto.randomBytes(16).toString('hex')
        };

        this.players.push(player);
        this.addLog('system', `${playerName} gick med i bordet`);

        return { success: true, player };
    }

    addAI(difficulty = 'smart', name = null) {
        console.log('🔍 DEBUG addAI:', {
            players: this.players.length,
            aiPlayers: this.aiPlayers.length,
            maxPlayers: this.settings.maxPlayers,
            allowAI: this.settings.allowAI,
            state: this.state,
            roomId: this.roomId
        });
        if (!this.settings.allowAI) {
            return { success: false, error: 'AI-spelare är inte tillåtna' };
        }
        // Tillåt alltid fler AI-spelare upp till totalt 6 (för debugging med multi-AI)
        const totalPlayers = this.players.length + this.aiPlayers.length;
        if (totalPlayers >= 6) {
            return { success: false, error: 'Max 6 spelare totalt' };
        }
        if (this.state !== GAME_STATES.WAITING) {
            return { success: false, error: 'Spelet har redan börjat' };
        }

        const aiNames = {
            naive: ['Nybörjar-Nisse', 'Tur-Bertil', 'Slump-Sara'],
            smart: ['Smart-Sune', 'Minnes-Maja', 'Strateg-Sten'],
            expert: ['Expert-Erik', 'Sannolikhet-Siv', 'Proffs-Pelle'],
            master: ['Mästare-Martin', 'Grandmaster-Greta', 'Legend-Lars']
        };

        const names = aiNames[difficulty] || aiNames.smart;
        const aiName = name || names[Math.floor(Math.random() * names.length)];

        const ai = new AIPlayer(difficulty, aiName);
        this.aiPlayers.push(ai);

        const aiPlayer = {
            id: ai.id,
            socketId: ai.socketId,
            name: ai.name,
            hand: ai.hand,
            pairs: ai.pairs,
            connected: true,
            surrendered: false,
            userId: null,
            elo: this.getAIElo(difficulty),
            avatar: `/assets/images/ai-${difficulty}.png`,
            isAI: true,
            aiDifficulty: difficulty,
            askedThisTurn: false,
            turnTimeTotal: 0,
            successfulAsks: 0,
            failedAsks: 0,
            fishings: 0,
            luckyFishings: 0,
            rankHistory: []
        };

        this.players.push(aiPlayer);
        this.addLog('system', `${aiName} (AI - ${difficulty}) gick med i bordet`);

        return { success: true, player: aiPlayer, ai };
    }

    getAIElo(difficulty) {
        const elos = { naive: 800, smart: 1100, expert: 1400, master: 1700 };
        return elos[difficulty] || 1200;
    }

    removePlayer(socketId) {
        const index = this.players.findIndex(p => p.socketId === socketId);
        if (index === -1) {
            return null;
        }

        const player = this.players[index];

        if (this.state === GAME_STATES.PLAYING) {
            player.connected = false;
            this.addLog('system', `${player.name} kopplade från`);

            const connectedPlayers = this.players.filter(p => p.connected && !p.isAI);
            const connectedAI = this.players.filter(p => p.connected && p.isAI);

            if (connectedPlayers.length === 0 && connectedAI.length === 0) {
                this.state = GAME_STATES.FINISHED;
                this.addLog('system', 'Alla spelare lämnade - spelet avslutas');
            } else if (connectedPlayers.length === 0 && connectedAI.length > 0) {
                this.state = GAME_STATES.FINISHED;
                this.calculateWinner();
            }

            return { player, disconnected: true };
        } else {
            // I waiting-läge: markera bara som frånkopplad (inte ta bort)
            // Detta gör att spelaren kan återansluta t.ex. vid sidomladdning
            player.connected = false;
            this.addLog('system', `${player.name} kopplade från`);
            return { player, disconnected: true };
        }
    }

    forceRemovePlayer(socketId) {
        const index = this.players.findIndex(p => p.socketId === socketId);
        if (index === -1) {
            return null;
        }

        const player = this.players[index];

        this.players.splice(index, 1);
        const aiIndex = this.aiPlayers.findIndex(ai => ai.socketId === socketId);
        if (aiIndex !== -1) {
            this.aiPlayers.splice(aiIndex, 1);
        }

        this.addLog('system', `${player.name} lämnade bordet`);
        return { player, removed: true };
    }

    surrender(socketId) {
        const player = this.players.find(p => p.socketId === socketId);
        if (!player) {
            return { success: false, error: 'Spelare hittades inte' };
        }
        if (this.state !== GAME_STATES.PLAYING) {
            return { success: false, error: 'Spelet har inte börjat' };
        }
        if (player.surrendered) {
            return { success: false, error: 'Du har redan gett upp' };
        }

        player.surrendered = true;
        player.connected = false;

        // Lägg spelarens kort tillbaka i leken och blanda om
        if (player.hand.length > 0) {
            this.deck.cards.push(...player.hand);
            this.deck.shuffle();
            player.hand = [];
        }

        this.addLog('system', `🏳️ ${player.name} gav upp!`);
        this.debugLog('surrender', { player: player.name, socketId });

        // Kolla om spelet ska avslutas
        const remainingActive = this.players.filter(p => !p.surrendered);
        if (remainingActive.length <= 1) {
            this.checkGameOver();
            return { success: true, gameOver: true, player };
        }

        // Om det var den givna-upp-spelarens tur, gå till nästa
        const currentPlayer = this.getCurrentPlayer();
        if (!currentPlayer || currentPlayer.socketId === socketId) {
            this.nextPlayer();
        }

        return { success: true, gameOver: false, player };
    }

    removeAI(aiId) {
        const index = this.players.findIndex(p => p.id === aiId && p.isAI);
        if (index === -1) {
            return false;
        }

        const aiPlayer = this.players[index];
        this.players.splice(index, 1);

        const aiIndex = this.aiPlayers.findIndex(ai => ai.id === aiId);
        if (aiIndex !== -1) {
            this.aiPlayers.splice(aiIndex, 1);
        }

        this.addLog('system', `${aiPlayer.name} lämnade bordet`);
        return true;
    }

    reconnectPlayer(oldSocketId, newSocketId, userData = null, reconnectToken = null) {
        // Först: försök matcha på oldSocketId (vanligt reconnect)
        let player = this.players.find(p => p.socketId === oldSocketId && !p.connected);

        // Om inte: försök matcha på reconnectToken (t.ex. ny flik/browser refresh)
        if (!player && reconnectToken) {
            player = this.players.find(p => p.reconnectToken === reconnectToken && !p.connected);
        }

        // Sista chansen: matcha på userId (inloggade användare)
        if (!player && userData?.id) {
            player = this.players.find(p => p.userId === userData.id && !p.connected);
        }

        if (!player) {
            return null;
        }

        player.socketId = newSocketId;
        player.connected = true;
        if (userData) {
            player.userId = userData.id;
            player.elo = userData.elo;
        }

        this.addLog('system', `${player.name} återanslöt`);
        return player;
    }

    toggleReady(socketId) {
        const player = this.players.find(p => p.socketId === socketId);
        if (!player) {
            return null;
        }
        player.ready = !player.ready;
        return { playerId: player.id, name: player.name, ready: player.ready };
    }

    getReadyStatus() {
        return this.players
            .filter(p => !p.isAI)
            .map(p => ({ id: p.id, name: p.name, ready: p.ready, connected: p.connected }));
    }

    canStart() {
        const connectedCount = this.players.filter(p => p.connected).length;
        const aiCount = this.players.filter(p => p.isAI).length;
        // Tillåt start med bara AI (för dev/AI vs AI-läge)
        return (connectedCount >= MIN_PLAYERS || aiCount >= 2) && this.state === GAME_STATES.WAITING;
    }

    startGame() {
        if (!this.canStart()) {
            this.debugLog('startGame FAILED', {
                reason: 'canStart returned false',
                players: this.players.length,
                state: this.state
            });
            return false;
        }

        this.state = GAME_STATES.DEALING;
        this.deck = new CardDeck();
        this.startTime = Date.now();
        this.totalTurns = 0;
        this.gameEvents = [];

        const humanCount = this.players.filter(p => !p.isAI).length;
        const cardsPerPlayer =
            humanCount === 1 && this.aiPlayers.length === 1 ? CARDS_PER_PLAYER_2P : CARDS_PER_PLAYER_MULTI;

        for (const player of this.players) {
            if (!player.connected) {
                continue;
            }

            player.hand = this.deck.draw(cardsPerPlayer);
            player.pairs = [];
            player.askedThisTurn = false;
            player.turnTimeTotal = 0;
            player.successfulAsks = 0;
            player.failedAsks = 0;
            player.fishings = 0;
            player.luckyFishings = 0;
            player.rankHistory = [];
            player.chatCount = 0;
            player.wasBehind = false;

            extractPairs(player, this.pile);
            this.updateWasBehind();

            if (player.isAI) {
                const ai = this.aiPlayers.find(a => a.id === player.id);
                if (ai) {
                    ai.hand = [...player.hand];
                    ai.pairs = [...player.pairs];
                    extractPairs(ai); // AI has its own pairs, no shared pile
                    player.hand = [...ai.hand];
                    player.pairs = [...ai.pairs];
                }
            }
        }

        this.state = GAME_STATES.PLAYING;
        this.currentPlayerIndex = 0;

        this.debugLog('startGame SUCCESS', {
            players: this.players.map(p => ({
                name: p.name,
                isAI: p.isAI,
                handSize: p.hand.length,
                pairs: p.pairs.length
            })),
            deckRemaining: this.deck.cards.length
        });
        this.addLog('system', '🎴 Spelet har börjat! Lycka till!');

        this.ensureCurrentPlayerHasCards();
        this.startTurnTimer();

        return true;
    }

    startTurnTimer() {
        if (!this.settings.turnTimer) {
            return;
        }

        this.turnStartTime = Date.now();

        if (this.turnTimerInterval) {
            clearInterval(this.turnTimerInterval);
        }

        this.turnTimerInterval = setInterval(() => {
            const elapsed = Date.now() - this.turnStartTime;
            const remaining = Math.max(0, this.turnTimeout - elapsed);

            if (remaining <= 0) {
                this.handleTurnTimeout();
            }
        }, 1000);
    }

    stopTurnTimer() {
        if (this.turnTimerInterval) {
            clearInterval(this.turnTimerInterval);
            this.turnTimerInterval = null;
        }
    }

    resetGame() {
        this.state = GAME_STATES.WAITING;
        this.deck = new CardDeck();
        this.currentPlayerIndex = 0;
        this.pile = [];
        this.gameLog = [];
        this.turnTimer = null;
        this.turnStartTime = null;
        this.totalTurns = 0;
        this.gameEvents = [];
        this.startTime = null;
        this.endTime = null;
        this.spectators = [];

        // Reset all players (both human and AI)
        for (const player of this.players) {
            player.hand = [];
            player.pairs = [];
            player.askedThisTurn = false;
            player.turnTimeTotal = 0;
            player.successfulAsks = 0;
            player.failedAsks = 0;
            player.fishings = 0;
            player.luckyFishings = 0;
            player.rankHistory = [];
            player.surrendered = false;
            // Behåll connected-status för mänskliga spelare så att de kan starta om direkt

            if (player.isAI) {
                const ai = this.aiPlayers.find(a => a.id === player.id);
                if (ai) {
                    ai.hand = [];
                    ai.pairs = [];
                    ai.askHistory = [];
                    // Återställ AI-minne korrekt med Maps
                    ai.memory = {
                        askedCards: new Map(),
                        givenCards: new Map(),
                        missingCards: new Map(),
                        fishedCards: [],
                        handSizes: new Map(),
                        patterns: new Map()
                    };
                }
            }
        }

        this.addLog('system', 'Bordet är redo för en ny match!');
    }

    setIo(io) {
        this.io = io;
    }

    broadcastGameState() {
        if (!this.io) {
            return;
        }
        this.players.forEach(player => {
            if (player.connected && !player.isAI) {
                this.io.to(player.socketId).emit('game_state_update', this.getPublicState(player.socketId));
            }
        });
        this.spectators.forEach(spectatorId => {
            this.io.to(spectatorId).emit('game_state_update', this.getPublicState(spectatorId));
        });

        // Spara snapshot asynkront (för crash-recovery)
        const snapshot = this.saveSnapshot();
        if (snapshot && this.onStateChange) {
            this.onStateChange(snapshot);
        }
    }

    handleTurnTimeout() {
        this.stopTurnTimer();

        // Om det finns en pending ask, auto-svar "Fisk!"
        if (this.pendingAsk) {
            this.addLog('system', `⏱️ ${this.pendingAsk.targetName} svarade inte i tid — auto-Fisk!`);
            const result = this.respondToAsk(this.pendingAsk.targetSocketId, false, null);

            if (result.gameOver) {
                if (this.onGameEnd) {
                    this.onGameEnd();
                }
                return;
            }

            this.players.forEach(player => {
                if (player.connected && !player.isAI) {
                    this.io.to(player.socketId).emit('turn_result', {
                        ...result,
                        gameState: this.getPublicState(player.socketId)
                    });
                }
            });
            this.spectators.forEach(spectatorId => {
                this.io.to(spectatorId).emit('turn_result', {
                    ...result,
                    gameState: this.getSpectatorState()
                });
            });

            // Om nästa spelare är AI, starta dess tur
            const nextPlayer = this.getCurrentPlayer();
            if (nextPlayer?.isAI) {
                setTimeout(() => this.makeAIMove(this.io), 1500);
            }
            return;
        }

        const currentPlayer = this.getCurrentPlayer();
        if (!currentPlayer) {
            return;
        }

        this.addLog('system', `⏱️ ${currentPlayer.name}s tur gick ut!`);

        if (!this.deck.isEmpty()) {
            const drawn = this.deck.draw(1);
            if (drawn) {
                currentPlayer.hand.push(drawn);
                this.addLog('action', `${currentPlayer.name} drog automatiskt ett kort`);

                // Kolla om det nya kortet bildar ett par
                extractPairs(currentPlayer, this.pile);
                this.updateWasBehind();
            }
        }

        this.nextPlayer();

        const gameOver = this.checkGameOver();
        if (gameOver) {
            if (this.onGameEnd) {
                this.onGameEnd();
            }
            return;
        }

        this.broadcastGameState();

        // Om nästa spelare är AI, starta dess tur
        const nextPlayer = this.getCurrentPlayer();
        if (nextPlayer?.isAI) {
            setTimeout(() => this.makeAIMove(this.io), 1500);
        }
    }

    getCurrentPlayer() {
        if (this.state !== GAME_STATES.PLAYING) {
            return null;
        }

        let attempts = 0;
        while (attempts < this.players.length) {
            const player = this.players[this.currentPlayerIndex];
            if (player && player.connected) {
                return player;
            }
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            attempts++;
        }
        return null;
    }

    askForCards(askerSocketId, targetId, rank) {
        const asker = this.players.find(p => p.socketId === askerSocketId);
        const target = this.players.find(p => p.id === targetId || p.socketId === targetId);

        if (!asker || !target) {
            return { success: false, error: 'Spelare inte funnen' };
        }
        if (this.getCurrentPlayer()?.socketId !== askerSocketId) {
            return { success: false, error: 'Inte din tur' };
        }
        if (asker.id === target.id) {
            return { success: false, error: 'Du kan inte fråga dig själv' };
        }
        if (!asker.hand.some(c => c.rank === rank)) {
            return { success: false, error: `Du måste ha ${rank}:an själv för att fråga` };
        }
        if (!target.connected) {
            return { success: false, error: `${target.name} är frånkopplad` };
        }

        this.stopTurnTimer();
        this.totalTurns++;

        const matchingCards = target.hand.filter(c => c.rank === rank);

        this.gameEvents.push({
            type: 'ask',
            turn: this.totalTurns,
            askerId: asker.id,
            targetId: target.id,
            rank,
            success: matchingCards.length > 0,
            askerHandSize: asker.hand.length,
            targetHandSize: target.hand.length
        });

        asker.rankHistory.push(rank);
        this.updateAIMemory('ask', asker.id, target.id, rank, matchingCards.length > 0);

        if (matchingCards.length > 0) {
            target.hand = target.hand.filter(c => c.rank !== rank);
            asker.hand.push(...matchingCards);
            asker.successfulAsks++;

            const newPairs = extractPairs(asker, this.pile);
            this.updateWasBehind();

            this.syncAIHand(asker);
            this.syncAIHand(target);

            this.addLog(
                'success',
                `🎯 ${asker.name} frågade ${target.name} om ${rank}:an och fick ${matchingCards.length} kort!`
            );

            this.checkAchievements(asker, 'successful_ask');
            if (matchingCards.length >= 3) {
                this.checkAchievements(asker, 'lucky_draw');
            }

            const gameOver = this.checkGameOver();

            // Om spelaren fick slut på kort efter par-bildning men leken inte är tom, dra ett kort
            if (!gameOver) {
                this.ensureCurrentPlayerHasCards();
            }

            this.debugLog('askForCards SUCCESS', {
                asker: asker.name,
                target: target.name,
                rank,
                gotCards: matchingCards.length,
                gameOver,
                askerHand: asker.hand.length,
                targetHand: target.hand.length,
                deckRemaining: this.deck.cards.length
            });

            if (!gameOver) {
                this.startTurnTimer();
            }

            return {
                success: true,
                gotCards: true,
                cards: matchingCards,
                newPairs,
                gameOver,
                nextPlayer: askerSocketId,
                askerName: asker.name,
                targetName: target.name,
                rank
            };
        } else {
            asker.failedAsks++;

            this.addLog('fish', `🌊 ${asker.name} frågade ${target.name} om ${rank}:an... "Finns i sjön!"`);

            const drawnCard = this.deck.draw(1);
            let newPairs = [];
            let fishedSuccess = false;
            let luckyMessage = '';

            if (drawnCard) {
                asker.hand.push(drawnCard);
                asker.fishings++;

                if (drawnCard.rank === rank) {
                    fishedSuccess = true;
                    asker.luckyFishings++;
                    luckyMessage = `🎣 ${asker.name} fiskade upp ${rank}:an! Tur!`;
                    this.addLog('luck', luckyMessage);
                    this.checkAchievements(asker, 'lucky_fish');
                } else {
                    this.addLog('draw', `${asker.name} drog ett kort från sjön`);
                }

                newPairs = extractPairs(asker, this.pile);
                this.updateWasBehind();
            } else {
                this.addLog('system', 'Sjön är tom!');
            }

            this.syncAIHand(asker);

            const gameOver = this.checkGameOver();
            const nextPlayerId = fishedSuccess ? askerSocketId : this.nextPlayer();
            const nextPlayerObj = this.players.find(p => p.socketId === nextPlayerId || p.id === nextPlayerId);

            this.debugLog('askForCards FISH', {
                asker: asker.name,
                target: target.name,
                rank,
                fishedSuccess,
                drawnCard: drawnCard?.rank || null,
                gameOver,
                nextPlayer: nextPlayerObj?.name || null,
                askerHand: asker.hand.length,
                deckRemaining: this.deck.cards.length
            });

            if (!gameOver) {
                this.ensureCurrentPlayerHasCards();
                this.startTurnTimer();
            }

            return {
                success: true,
                gotCards: false,
                drawnCard,
                newPairs,
                fishedSuccess,
                luckyMessage,
                gameOver,
                nextPlayer: nextPlayerId,
                nextPlayerName: nextPlayerObj?.name,
                askerName: asker.name,
                targetName: target.name,
                rank
            };
        }
    }

    requestAsk(askerSocketId, targetId, rank) {
        const asker = this.players.find(p => p.socketId === askerSocketId);
        const target = this.players.find(p => p.id === targetId || p.socketId === targetId);

        if (!asker || !target) {
            return { success: false, error: 'Spelare inte funnen' };
        }
        if (this.getCurrentPlayer()?.socketId !== askerSocketId) {
            return { success: false, error: 'Inte din tur' };
        }
        if (asker.id === target.id) {
            return { success: false, error: 'Du kan inte fråga dig själv' };
        }
        if (!asker.hand.some(c => c.rank === rank)) {
            return { success: false, error: `Du måste ha ${rank}:an själv för att fråga` };
        }
        if (!target.connected) {
            return { success: false, error: `${target.name} är frånkopplad` };
        }
        if (this.pendingAsk) {
            return { success: false, error: 'Det finns redan en aktiv förfrågan' };
        }

        this.stopTurnTimer();

        this.pendingAsk = {
            askerId: asker.id,
            askerSocketId: asker.socketId,
            targetId: target.id,
            targetSocketId: target.socketId,
            targetName: target.name,
            askerName: asker.name,
            rank,
            timestamp: Date.now()
        };

        this.debugLog('requestAsk', { asker: asker.name, target: target.name, rank });

        return {
            success: true,
            askerName: asker.name,
            targetName: target.name,
            rank
        };
    }

    respondToAsk(targetSocketId, hasCard, givenRank, isAutoResolve = false) {
        if (!this.pendingAsk) {
            return { success: false, error: 'Ingen aktiv förfrågan' };
        }

        const { askerId, targetId, rank } = this.pendingAsk;
        const target = this.players.find(p => p.id === targetId || p.socketId === targetId);
        const asker = this.players.find(p => p.id === askerId || p.socketId === askerId);

        if (!target || !asker) {
            this.pendingAsk = null;
            return { success: false, error: 'Spelare inte funnen' };
        }

        // Vid auto-resolve (t.ex. efter disconnect) hoppar vi över socketId-kontrollen
        // eftersom spelaren kan ha återanslutit med ett nytt socketId
        if (!isAutoResolve) {
            const responder = this.players.find(p => p.socketId === targetSocketId || p.id === targetSocketId);
            if (!responder || responder.id !== targetId) {
                return { success: false, error: 'Det är inte din förfrågan att svara på' };
            }
        }

        this.totalTurns++;

        const matchingCards = target.hand.filter(c => c.rank === rank);

        if (hasCard && matchingCards.length > 0) {
            // Target har kortet och svarade ärligt
            target.hand = target.hand.filter(c => c.rank !== rank);
            asker.hand.push(...matchingCards);
            asker.successfulAsks++;

            const newPairs = extractPairs(asker, this.pile);
            this.updateWasBehind();
            this.syncAIHand(asker);
            this.syncAIHand(target);

            this.addLog(
                'success',
                `🎯 ${asker.name} frågade ${target.name} om ${rank}:an och fick ${matchingCards.length} kort!`
            );

            this.checkAchievements(asker, 'successful_ask');
            if (matchingCards.length >= 3) {
                this.checkAchievements(asker, 'lucky_draw');
            }

            const gameOver = this.checkGameOver();

            if (!gameOver) {
                this.ensureCurrentPlayerHasCards();
            }

            this.debugLog('respondToAsk SUCCESS', {
                asker: asker.name,
                target: target.name,
                rank,
                gotCards: matchingCards.length,
                gameOver
            });

            if (!gameOver) {
                this.startTurnTimer();
            }

            this.pendingAsk = null;

            return {
                success: true,
                gotCards: true,
                cards: matchingCards,
                newPairs,
                gameOver,
                nextPlayer: asker.socketId || askerId,
                askerName: asker.name,
                targetName: target.name,
                rank
            };
        } else {
            // "Finns i sjön!" - target har inte kortet eller ljög (behandlas som fisk)
            if (hasCard && matchingCards.length === 0) {
                this.addLog('system', `🚫 ${target.name} försökte ljuga men har inte ${rank}:an! Fisk!`);
            }

            asker.failedAsks++;

            this.addLog('fish', `🌊 ${asker.name} frågade ${target.name} om ${rank}:an... "Finns i sjön!"`);

            const drawnCard = this.deck.draw(1);
            let newPairs = [];
            let fishedSuccess = false;
            let luckyMessage = '';

            if (drawnCard) {
                asker.hand.push(drawnCard);
                asker.fishings++;

                if (drawnCard.rank === rank) {
                    fishedSuccess = true;
                    asker.luckyFishings++;
                    luckyMessage = `🎣 ${asker.name} fiskade upp ${rank}:an! Tur!`;
                    this.addLog('luck', luckyMessage);
                    this.checkAchievements(asker, 'lucky_fish');
                } else {
                    this.addLog('draw', `${asker.name} drog ett kort från sjön`);
                }

                newPairs = extractPairs(asker, this.pile);
                this.updateWasBehind();
            } else {
                this.addLog('system', 'Sjön är tom!');
            }

            this.syncAIHand(asker);

            const gameOver = this.checkGameOver();
            const nextPlayerId = fishedSuccess ? asker.socketId || askerId : this.nextPlayer();
            const nextPlayerObj = this.players.find(p => p.socketId === nextPlayerId || p.id === nextPlayerId);

            this.debugLog('respondToAsk FISH', {
                asker: asker.name,
                target: target.name,
                rank,
                fishedSuccess,
                drawnCard: drawnCard?.rank || null,
                gameOver,
                nextPlayer: nextPlayerObj?.name || null
            });

            if (!gameOver) {
                this.ensureCurrentPlayerHasCards();
                this.startTurnTimer();
            }

            this.pendingAsk = null;

            return {
                success: true,
                gotCards: false,
                drawnCard,
                newPairs,
                fishedSuccess,
                luckyMessage,
                gameOver,
                nextPlayer: nextPlayerId,
                nextPlayerName: nextPlayerObj?.name,
                askerName: asker.name,
                targetName: target.name,
                rank
            };
        }
    }

    autoResolvePendingAsk() {
        if (!this.pendingAsk) {
            return null;
        }
        // Använd isAutoResolve=true så att socketId-kontrollen hoppas över
        // Detta behövs när target har återanslutit med ett nytt socketId
        const result = this.respondToAsk(this.pendingAsk.targetSocketId, false, null, true);
        return result;
    }

    async makeAIMove(io) {
        if (this.state === GAME_STATES.FINISHED) {
            this.debugLog('makeAIMove ABORT', { reason: 'game finished' });
            return;
        }

        const currentPlayer = this.getCurrentPlayer();
        if (!currentPlayer || !currentPlayer.isAI) {
            this.debugLog('makeAIMove ABORT', { reason: 'not AI turn', currentPlayer: currentPlayer?.name || null });
            return;
        }

        this.debugLog('makeAIMove START', { ai: currentPlayer.name, handSize: currentPlayer.hand.length });

        const ai = this.aiPlayers.find(a => a.id === currentPlayer.id);
        if (!ai) {
            return;
        }

        const delay = 1000 + Math.random() * 2000;
        await new Promise(resolve => setTimeout(resolve, delay));

        const gameState = this.getPublicState(currentPlayer.socketId);
        const allPlayers = this.players.filter(p => p.id !== currentPlayer.id);

        // Synkronisera AI:ns hand innan beslut
        this.syncAIHand(currentPlayer);

        const decision = ai.makeDecision(gameState, allPlayers);
        if (!decision) {
            this.debugLog('makeAIMove NO_DECISION', { ai: currentPlayer.name, handSize: currentPlayer.hand.length });
            this.nextPlayer();
            this.players.forEach(player => {
                if (player.connected && !player.isAI) {
                    io.to(player.socketId).emit('game_state_update', this.getPublicState(player.socketId));
                }
            });
            this.spectators.forEach(spectatorId => {
                io.to(spectatorId).emit('game_state_update', this.getPublicState(spectatorId));
            });
            const nextPlayer = this.getCurrentPlayer();
            if (nextPlayer?.isAI) {
                setTimeout(() => this.makeAIMove(io), 1500);
            }
            return;
        }

        this.debugLog('makeAIMove DECISION', {
            ai: currentPlayer.name,
            target: decision.targetId,
            rank: decision.rank
        });

        const result = this.askForCards(currentPlayer.socketId, decision.targetId, decision.rank);

        this.players.forEach(player => {
            if (player.connected && !player.isAI) {
                io.to(player.socketId).emit('turn_result', {
                    ...result,
                    gameState: this.getPublicState(player.socketId),
                    aiReasoning: decision.reasoning,
                    aiConfidence: decision.confidence
                });
            }
        });
        this.spectators.forEach(spectatorId => {
            io.to(spectatorId).emit('turn_result', {
                ...result,
                gameState: this.getPublicState(spectatorId),
                aiReasoning: decision.reasoning,
                aiConfidence: decision.confidence
            });
        });

        if (result.gameOver) {
            this.debugLog('makeAIMove GAME_OVER', { ai: currentPlayer.name });
            if (this.onGameEnd) {
                this.onGameEnd();
            }
            return;
        }

        if (!result.success) {
            // AI:n gjorde ett ogiltigt drag - gå vidare till nästa spelare
            this.debugLog('makeAIMove INVALID', { ai: currentPlayer.name, error: result.error });
            this.nextPlayer();
            this.players.forEach(player => {
                if (player.connected && !player.isAI) {
                    io.to(player.socketId).emit('game_state_update', this.getPublicState(player.socketId));
                }
            });
            this.spectators.forEach(spectatorId => {
                io.to(spectatorId).emit('game_state_update', this.getPublicState(spectatorId));
            });
            const nextPlayer = this.getCurrentPlayer();
            if (nextPlayer?.isAI) {
                setTimeout(() => this.makeAIMove(io), 1500);
            }
        } else if ((result.gotCards || result.fishedSuccess) && !result.gameOver) {
            this.debugLog('makeAIMove EXTRA_TURN', { ai: currentPlayer.name });
            setTimeout(() => this.makeAIMove(io), 1500);
        } else if (result.success && !result.gameOver) {
            // AI:n avslutade turen normalt - skicka uppdaterad gameState
            this.debugLog('makeAIMove END', { ai: currentPlayer.name, result: 'success' });
            this.players.forEach(player => {
                if (player.connected && !player.isAI) {
                    io.to(player.socketId).emit('game_state_update', this.getPublicState(player.socketId));
                }
            });
            this.spectators.forEach(spectatorId => {
                io.to(spectatorId).emit('game_state_update', this.getPublicState(spectatorId));
            });
            // Om nästa spelare också är AI, starta dess tur
            const nextPlayer = this.getCurrentPlayer();
            if (nextPlayer?.isAI) {
                this.debugLog('makeAIMove NEXT_AI', { next: nextPlayer.name });
                setTimeout(() => this.makeAIMove(io), 1500);
            }
        }
    }

    nextPlayer() {
        const startIndex = this.currentPlayerIndex;
        let iterations = 0;
        const maxIterations = this.players.length * 2;

        this.debugLog('nextPlayer START', {
            currentIndex: startIndex,
            players: this.players.map(p => ({ name: p.name, connected: p.connected, hand: p.hand.length })),
            deckEmpty: this.deck.isEmpty()
        });

        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            iterations++;

            // Säkerhetsventil: om vi gått igenom alla utan att hitta en giltig spelare
            if (iterations > maxIterations) {
                this.debugLog('nextPlayer SAFETY_EXIT', { iterations, message: 'Inga giltiga spelare' });
                console.warn('⚠️ nextPlayer: Inga giltiga spelare hittades');
                this.checkGameOver();
                return null;
            }
        } while (
            this.players[this.currentPlayerIndex] &&
            (!this.players[this.currentPlayerIndex].connected ||
                this.players[this.currentPlayerIndex].surrendered ||
                (this.players[this.currentPlayerIndex].hand.length === 0 && this.deck.isEmpty()))
        );

        this.ensureCurrentPlayerHasCards();
        this.startTurnTimer();

        const nextPlayer = this.players[this.currentPlayerIndex];
        this.debugLog('nextPlayer RESULT', {
            nextPlayer: nextPlayer?.name || null,
            nextIndex: this.currentPlayerIndex,
            iterations
        });
        return nextPlayer ? nextPlayer.socketId || nextPlayer.id : null;
    }

    syncAIHand(player) {
        if (!player || !player.isAI) {
            return;
        }
        const ai = this.aiPlayers.find(a => a.id === player.id);
        if (ai) {
            ai.hand = [...player.hand];
            ai.pairs = [...player.pairs];
        }
    }

    ensureCurrentPlayerHasCards() {
        const player = this.players[this.currentPlayerIndex];
        if (!player || !player.connected) {
            return;
        }

        if (player.hand.length === 0 && !this.deck.isEmpty()) {
            this.debugLog('ensureCurrentPlayerHasCards DRAW', {
                player: player.name,
                deckRemaining: this.deck.cards.length
            });
            const drawn = this.deck.draw(1);
            if (drawn) {
                player.hand.push(drawn);
                extractPairs(player, this.pile);
                this.updateWasBehind();
                this.addLog('system', `${player.name} fick ett nytt kort när handen var tom`);
            }
        }

        if (player.isAI) {
            const ai = this.aiPlayers.find(a => a.id === player.id);
            if (ai) {
                ai.hand = [...player.hand];
                ai.pairs = [...player.pairs];
            }
        }
    }

    checkGameOver() {
        const activePlayers = this.players.filter(p => p.connected && !p.surrendered);
        const allHandsEmpty = activePlayers.every(p => p.hand.length === 0);
        const deckEmpty = this.deck.isEmpty();
        const anyHandEmpty = activePlayers.some(p => p.hand.length === 0);

        this.debugLog('checkGameOver', {
            activePlayers: activePlayers.map(p => ({ name: p.name, hand: p.hand.length })),
            allHandsEmpty,
            deckEmpty,
            totalPlayers: this.players.length
        });

        // Spelet är slut när:
        // 1. Alla händer är tomma och leken är tom
        // 2. För få spelare (mindre än 2 aktiva)
        // 3. Leken är tom och minst en spelare har 0 kort (inga drag kan göras)
        // 4. Alla utom en har gett upp
        if ((allHandsEmpty && deckEmpty) || activePlayers.length < 2 || (deckEmpty && anyHandEmpty)) {
            this.debugLog('checkGameOver GAME_OVER', {
                reason:
                    allHandsEmpty && deckEmpty
                        ? 'all empty'
                        : activePlayers.length < 2
                          ? 'too few players'
                          : 'deck empty with empty hand'
            });
            this.state = GAME_STATES.FINISHED;
            this.endTime = Date.now();
            this.stopTurnTimer();
            this.calculateWinner();
            return true;
        }
        return false;
    }

    calculateWinner() {
        const activePlayers = this.players
            .filter(p => p.connected || p.pairs.length > 0)
            .sort((a, b) => b.pairs.length - a.pairs.length);

        // Assign ranks with tie handling (same pairs = same rank)
        let currentRank = 1;
        let previousPairs = -1;
        const rankedPlayers = activePlayers.map((p, i) => {
            if (p.pairs.length !== previousPairs) {
                currentRank = i + 1;
                previousPairs = p.pairs.length;
            }
            return { player: p, rank: currentRank };
        });

        // Detect tie for first place
        const firstPlaceCount = rankedPlayers.filter(rp => rp.rank === 1).length;
        this.winner = firstPlaceCount === 1 ? rankedPlayers[0].player : null;

        this.finalStandings = rankedPlayers.map(rp => ({
            rank: rp.rank,
            id: rp.player.id,
            name: rp.player.name,
            pairs: rp.player.pairs.length,
            totalCards: rp.player.hand.length,
            successfulAsks: rp.player.successfulAsks,
            failedAsks: rp.player.failedAsks,
            fishings: rp.player.fishings,
            luckyFishings: rp.player.luckyFishings,
            isAI: rp.player.isAI,
            aiDifficulty: rp.player.aiDifficulty,
            elo: rp.player.elo,
            userId: rp.player.userId
        }));

        this.duration = this.endTime && this.startTime ? Math.round((this.endTime - this.startTime) / 1000) : 0;

        if (this.winner) {
            this.addLog('system', `🏆 Spelet är slut! Vinnare: ${this.winner.name}`);
        } else if (firstPlaceCount > 1) {
            const tiedNames = rankedPlayers
                .filter(rp => rp.rank === 1)
                .map(rp => rp.player.name)
                .join(', ');
            this.addLog('system', `🏆 Spelet är slut! Oavgjort mellan: ${tiedNames}`);
        } else {
            this.addLog('system', `🏆 Spelet är slut! Ingen vinnare`);
        }

        return this.finalStandings;
    }

    checkAchievements(player, event, options = {}) {
        const achievements = [];

        if (event === 'successful_ask') {
            if (player.successfulAsks >= 5) {
                achievements.push('fisherman');
            }
            if (player.successfulAsks >= 10) {
                achievements.push('master_fisherman');
            }
        }

        if (event === 'lucky_fish') {
            if (player.luckyFishings >= 3) {
                achievements.push('lucky_star');
            }
        }

        if (event === 'chat') {
            if (player.chatCount >= 50) {
                achievements.push('chat_master');
            }
        }

        if (event === 'game_end') {
            if (player.pairs.length >= 5) {
                achievements.push('pair_master');
            }
            if (this.totalTurns <= 10) {
                achievements.push('speed_demon');
            }

            if (options.isWinner) {
                if (options.isFirstWin) {
                    achievements.push('first_win');
                }
                if (options.hasAI) {
                    achievements.push('ai_slayer');
                }
                if (player.wasBehind) {
                    achievements.push('comeback_kid');
                }
                if (options.opponentCount >= 3) {
                    achievements.push('solo_victory');
                }
            }
        }

        return achievements;
    }

    updateAIMemory(type, playerId, targetId, rank, success) {
        for (const ai of this.aiPlayers) {
            ai.updateMemory({ type, playerId, targetId, rank, success });
        }
    }

    updateWasBehind() {
        const maxPairs = Math.max(...this.players.map(p => p.pairs.length), 0);
        for (const player of this.players) {
            if (player.pairs.length < maxPairs) {
                player.wasBehind = true;
            }
        }
    }

    addChatMessage(socketId, message) {
        const player = this.players.find(p => p.socketId === socketId);
        if (!player) {
            return null;
        }

        const filtered = this.filterChat(message);

        const chatMsg = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            player: player.name,
            playerId: player.id,
            message: filtered.substring(0, 200),
            timestamp: new Date().toISOString(),
            isSystem: false
        };

        this.chatHistory.push(chatMsg);
        if (this.chatHistory.length > 100) {
            this.chatHistory.shift();
        }

        player.chatCount = (player.chatCount || 0) + 1;

        return chatMsg;
    }

    addSystemChat(message) {
        const chatMsg = {
            id: `sys-${Date.now()}`,
            player: 'System',
            playerId: 'system',
            message,
            timestamp: new Date().toISOString(),
            isSystem: true
        };

        this.chatHistory.push(chatMsg);
        return chatMsg;
    }

    filterChat(message) {
        const badWords = ['fan', 'jävla', 'helvete', 'skit'];
        let filtered = message;
        badWords.forEach(word => {
            const regex = new RegExp(word, 'gi');
            filtered = filtered.replace(regex, '*'.repeat(word.length));
        });
        return filtered;
    }

    addLog(type, message) {
        const entry = {
            id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            type,
            message,
            timestamp: new Date().toISOString()
        };

        this.gameLog.push(entry);
        if (this.gameLog.length > 50) {
            this.gameLog.shift();
        }

        return entry;
    }

    addSpectator(socketId) {
        if (!this.settings.spectatorMode) {
            return false;
        }
        if (this.spectators.includes(socketId)) {
            return false;
        }

        this.spectators.push(socketId);
        return true;
    }

    removeSpectator(socketId) {
        const index = this.spectators.indexOf(socketId);
        if (index !== -1) {
            this.spectators.splice(index, 1);
        }
    }

    getPublicState(socketId) {
        const player = this.players.find(p => p.socketId === socketId);
        const isSpectator = this.spectators.includes(socketId);

        return {
            roomId: this.roomId,
            state: this.state,
            gameType: this.gameType,
            settings: this.settings,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                socketId: p.socketId,
                cardCount: p.hand.length,
                pairCount: p.pairs.length,
                connected: p.connected,
                surrendered: p.surrendered || false,
                isCurrentPlayer: this.players[this.currentPlayerIndex]?.id === p.id,
                isYou: p.socketId === socketId,
                isAI: p.isAI || false,
                aiDifficulty: p.aiDifficulty,
                elo: p.elo,
                avatar: p.avatar,
                successfulAsks: p.successfulAsks,
                failedAsks: p.failedAsks,
                fishings: p.fishings,
                rankHistory: p.rankHistory,
                ready: p.ready || false
            })),
            yourHand: player ? player.hand : isSpectator ? [] : null,
            yourPairs: player ? player.pairs : [],
            currentPlayer: this.getCurrentPlayer()?.name || null,
            currentPlayerId: this.getCurrentPlayer()?.id || null,
            deckRemaining: this.deck.remaining(),
            pileCount: this.pile.length,
            gameLog: this.gameLog.slice(-30),
            chatHistory: this.chatHistory.slice(-50),
            winner: this.winner || null,
            finalStandings: this.finalStandings || null,
            isSpectator: isSpectator,
            turnTimeRemaining:
                this.settings.turnTimer && this.turnStartTime
                    ? Math.max(0, this.turnTimeout - (Date.now() - this.turnStartTime))
                    : null,
            totalTurns: this.totalTurns,
            duration: this.duration || 0
        };
    }

    getSpectatorState() {
        return {
            ...this.getPublicState('spectator'),
            allHands: this.players.map(p => ({
                playerId: p.id,
                playerName: p.name,
                hand: p.hand,
                pairs: p.pairs,
                isAI: p.isAI
            }))
        };
    }

    getChatHistory(limit = 50) {
        return this.chatHistory.slice(-limit);
    }

    getGameData() {
        return {
            roomId: this.roomId,
            gameType: this.gameType,
            startTime: this.startTime,
            endTime: this.endTime,
            duration: this.duration,
            totalTurns: this.totalTurns,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                userId: p.userId,
                isAI: p.isAI,
                pairs: p.pairs.length,
                successfulAsks: p.successfulAsks,
                failedAsks: p.failedAsks,
                elo: p.elo
            })),
            winner: this.winner
                ? {
                      id: this.winner.id,
                      name: this.winner.name,
                      pairs: this.winner.pairs.length
                  }
                : null,
            events: this.gameEvents
        };
    }

    /**
     * Spara snapshot av spelets tillstånd för crash-recovery
     * Throttlad: max 1 per 30 sekunder under pågående spel
     */
    saveSnapshot() {
        if (this.state !== GAME_STATES.PLAYING) {
            return null;
        }

        const now = Date.now();
        if (this._lastSnapshotTime && now - this._lastSnapshotTime < 30000) {
            return null; // Throttle: max 1 snapshot per 30s
        }
        this._lastSnapshotTime = now;

        const snapshot = {
            roomId: this.roomId,
            state: this.state,
            gameType: this.gameType,
            currentPlayerIndex: this.currentPlayerIndex,
            totalTurns: this.totalTurns,
            startTime: this.startTime,
            turnTimeout: this.turnTimeout,
            settings: this.settings,
            deck: {
                cards: this.deck.cards,
                remaining: this.deck.remaining()
            },
            pile: this.pile,
            players: this.players.map(p => ({
                id: p.id,
                socketId: p.socketId,
                name: p.name,
                hand: p.hand,
                pairs: p.pairs,
                connected: p.connected,
                surrendered: p.surrendered,
                isAI: p.isAI,
                aiDifficulty: p.aiDifficulty,
                userId: p.userId,
                elo: p.elo,
                successfulAsks: p.successfulAsks,
                failedAsks: p.failedAsks,
                fishings: p.fishings,
                luckyFishings: p.luckyFishings
            })),
            aiPlayers: this.aiPlayers.map(ai => ({
                id: ai.id,
                difficulty: ai.difficulty,
                memory: {
                    askedCards: Array.from(ai.memory.askedCards.entries()),
                    givenCards: Array.from(ai.memory.givenCards.entries()),
                    missingCards: Array.from(ai.memory.missingCards.entries()),
                    fishedCards: ai.memory.fishedCards,
                    handSizes: Array.from(ai.memory.handSizes.entries()),
                    patterns: Array.from(ai.memory.patterns.entries())
                }
            })),
            gameLog: this.gameLog,
            chatHistory: this.chatHistory,
            gameEvents: this.gameEvents,
            pendingAsk: this.pendingAsk,
            createdAt: new Date().toISOString()
        };

        return snapshot;
    }
}

module.exports = GameEngine;
