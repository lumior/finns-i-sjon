class GameClient {
    constructor() {
        this.gameState = null;
        this.selectedTarget = null;
        this.selectedRank = null;
        this.isHost = false;
        this.isSpectator = false;
        this.roomId = new URLSearchParams(window.location.search).get('room');
        this.playerName = new URLSearchParams(window.location.search).get('name') || localStorage.getItem('playerName');
        this.password = new URLSearchParams(window.location.search).get('password');
        this.token = new URLSearchParams(window.location.search).get('token') || localStorage.getItem('token');
        
        this.settings = {
            soundEnabled: localStorage.getItem('soundEnabled') !== 'false',
            musicEnabled: localStorage.getItem('musicEnabled') === 'true',
            animationsEnabled: localStorage.getItem('animationsEnabled') !== 'false',
            autoSort: localStorage.getItem('autoSort') !== 'false',
            cardStyle: localStorage.getItem('cardStyle') || 'classic',
            deckTheme: (() => {
                const stored = localStorage.getItem('deckTheme');
                // Migrera gamla separata tema-värden till det nya enhetliga temat
                if (['aubergine', 'radish', 'pepper', 'potato'].includes(stored)) {
                    localStorage.setItem('deckTheme', 'vegetable');
                    return 'vegetable';
                }
                return stored || 'standard';
            })()
        };
        
        this.voiceChat = null;
        this.voiceUI = null;
        this.pendingCardRequest = null;
        this.pendingAskTimer = null;
        this.cardRequestCountdown = null;
        
        this.init();
    }

    async init() {
        if (!this.roomId) {
            window.location.href = '/';
            return;
        }

        if (window.audioManager) {
            await audioManager.init();
        }
        
        if (window.animationManager) {
            animationManager.enabled = this.settings.animationsEnabled;
        }

        this.setupUI();
        this.connectSocket();
    }

    connectSocket() {
        gameSocket.connect();
        
        gameSocket.on('connected', () => {
            this.joinRoom();
        });
        
        gameSocket.on('room_joined', (data) => {
            this.handleRoomJoined(data);
        });
        
        gameSocket.on('room_created', (data) => {
            this.handleRoomJoined(data);
        });
        
        gameSocket.on('game_started', (data) => {
            this.handleGameStarted(data);
        });
        
        gameSocket.on('game_state_update', (state) => {
            const current = state.players?.find(p => p.isCurrentPlayer);
            console.log('📊 game_state_update:', { currentPlayer: current?.name, isYou: current?.isYou, state: state.state, turn: state.turnCount });
            this.updateGameState(state);
        });
        
        gameSocket.on('turn_result', (data) => {
            const current = data.gameState?.players?.find(p => p.isCurrentPlayer);
            console.log('🎯 turn_result:', { currentPlayer: current?.name, isYou: current?.isYou, gotCards: data.gotCards, fishedSuccess: data.fishedSuccess });
            this.handleTurnResult(data);
        });
        
        gameSocket.on('game_over', (data) => {
            this.handleGameOver(data);
        });
        
        gameSocket.on('ask_pending', (data) => {
            this.showAskPending(data.targetName, data.rank);
        });
        
        gameSocket.on('card_request', (data) => {
            this.showCardRequest(data.askerName, data.rank);
        });
        
        gameSocket.on('chat_message', (msg) => {
            this.addChatMessage(msg);
        });
        
        gameSocket.on('player_joined', (data) => {
            this.addLogEntry(`${data.playerName} gick med i bordet`, 'system');
            if (window.audioManager) audioManager.playChat();
        });
        
        gameSocket.on('player_left', (data) => {
            this.addLogEntry(`${data.playerName} lämnade spelet`, 'system');
        });
        
        gameSocket.on('player_reconnected', (data) => {
            this.addLogEntry(`${data.playerName} återanslöt`, 'system');
        });
        
        gameSocket.on('ai_added', (data) => {
            this.addLogEntry(`${data.player.name} gick med i bordet`, 'system');
        });
        
        gameSocket.on('ai_removed', (data) => {
            this.addLogEntry('AI-spelare lämnade bordet', 'system');
        });
        
        gameSocket.on('player_kicked', (data) => {
            this.addLogEntry(`${data.playerName} blev kickad`, 'system');
        });
        
        gameSocket.on('kicked', (data) => {
            this.showModal('Du blev kickad', data.reason, 'OK', () => this.leaveGame());
        });
        
        gameSocket.on('player_surrendered', (data) => {
            this.addLogEntry(`${data.playerName} gav upp`, 'system');
            if (this.gameState) {
                const player = this.gameState.players.find(p => p.id === data.playerId);
                if (player) player.surrendered = true;
            }
        });
        
        gameSocket.on('settings_updated', (settings) => {
            this.addLogEntry('Inställningar uppdaterade', 'system');
        });
        
        gameSocket.on('reconnected', (data) => {
            this.handleReconnection(data);
        });
        
        gameSocket.on('spectator_joined', (data) => {
            this.isSpectator = true;
            document.getElementById('spectator-notice').classList.remove('hidden');
            this.updateGameState(data.gameState);
        });
        
        gameSocket.on('server_error', (data) => {
            this.showError(data.message);
        });
        
        gameSocket.on('disconnected', () => {
            this.addLogEntry('⚠️ Anslutning förlorad - försker återansluta...', 'system');
        });
    }

    joinRoom() {
        const isHost = new URLSearchParams(window.location.search).get('host') === 'true';
        
        if (isHost) {
            this.isHost = true;
            document.getElementById('host-controls').classList.remove('hidden');
        }
        
        gameSocket.emit('join_room', {
            roomId: this.roomId,
            playerName: this.playerName,
            password: this.password
        });
    }

    setupUI() {
        // Chat-panelen startar alltid minimized (satt i HTML).
        // På desktop (>1024px): veckla ut den automatiskt så den syns.
        if (window.innerWidth > 1024) {
            document.getElementById('chat-panel').classList.remove('minimized');
        }
        
        // Sätt spelarens namn i videorutan
        const localVideoLabel = document.getElementById('local-video-label');
        if (localVideoLabel && this.playerName) {
            localVideoLabel.textContent = this.playerName;
        }
        
        const soundBtn = document.getElementById('sound-toggle');
        const musicBtn = document.getElementById('music-toggle');
        
        soundBtn.addEventListener('click', () => {
            const enabled = audioManager.toggleSound();
            soundBtn.textContent = enabled ? '🔊' : '🔇';
            soundBtn.classList.toggle('muted', !enabled);
        });
        
        musicBtn.addEventListener('click', () => {
            const enabled = audioManager.toggleMusic();
            musicBtn.textContent = enabled ? '🎵' : '🎶';
            musicBtn.classList.toggle('muted', !enabled);
        });
        
        // Röstchatt-knapp – manuell aktivering (nu med video!)
        const voiceBtn = document.getElementById('voice-chat-toggle');
        if (voiceBtn) {
            voiceBtn.addEventListener('click', async () => {
                if (this.voiceChat && this.voiceChat.isConnected) {
                    this.voiceChat.disconnect();
                    this.voiceChat = null;
                    if (this.voiceUI) {
                        this.voiceUI.hide();
                    }
                    voiceBtn.classList.remove('active');
                } else {
                    if (this.voiceChat) {
                        this.voiceChat.disconnect();
                    }
                    this.voiceChat = new VideoChatManager(gameSocket);
                    const success = await this.voiceChat.initialize();
                    if (success) {
                        this.voiceUI = new VideoChatUI(this.voiceChat);
                        this.voiceUI.createUI();
                        this.voiceUI.show();
                        this.voiceUI.setStatus('Ansluten');
                        voiceBtn.classList.add('active');
                    }
                }
            });
        }
        
        document.getElementById('deck-toggle').addEventListener('click', () => {
            const newTheme = this.settings.deckTheme === 'standard' ? 'vegetable' : 'standard';
            this.settings.deckTheme = newTheme;
            localStorage.setItem('deckTheme', newTheme);
            document.getElementById('setting-deck-theme').value = newTheme;
            document.getElementById('deck-toggle').textContent = newTheme === 'standard' ? '🥗' : '🎴';
            document.getElementById('deck-toggle').title = newTheme === 'standard' ? 'Växla till grönsakskort' : 'Växla till standardkort';
            this.renderHand();
            this.renderOpponents(this.gameState?.players || []);
        });
        
        document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
            el.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) modal.classList.add('hidden');
            });
        });
        
        document.getElementById('leave-btn').addEventListener('click', () => this.leaveGame());
        document.getElementById('surrender-btn').addEventListener('click', () => {
            this.showModal('Ge upp?', 'Är du säker på att du vill ge upp? Dina kort återgår till leken.', 'Ja, ge upp', () => {
                gameSocket.emit('surrender');
            });
        });
        document.getElementById('ask-btn').addEventListener('click', () => this.showAskDialog());
        document.getElementById('cancel-ask').addEventListener('click', () => this.hideAskDialog());
        document.getElementById('confirm-ask').addEventListener('click', () => this.confirmAsk());
        document.querySelector('.dialog-close').addEventListener('click', () => this.hideAskDialog());
        
        document.getElementById('send-chat').addEventListener('click', () => this.sendChat());
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChat();
        });
        
        document.querySelectorAll('.chat-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                document.querySelectorAll('.chat-messages').forEach(m => m.classList.remove('active'));
                document.getElementById(`${tab.dataset.tab}-messages`)?.classList.add('active');
            });
        });
        
        document.getElementById('toggle-chat').addEventListener('click', () => {
            document.getElementById('chat-panel').classList.toggle('minimized');
        });
        
        document.getElementById('play-again-btn').addEventListener('click', () => {
            window.location.reload();
        });
        
        document.getElementById('back-to-lobby').addEventListener('click', () => {
            this.leaveGame();
        });
        
        document.getElementById('host-menu-btn').addEventListener('click', () => {
            document.getElementById('host-menu').classList.toggle('hidden');
        });
        
        document.getElementById('add-ai-btn').addEventListener('click', () => {
            this.showAddAIModal();
        });
        
        document.getElementById('add-ai-dev-btn').addEventListener('click', () => {
            gameSocket.emit('add_ai', { difficulty: 'smart' });
        });
        
        document.getElementById('ai-vs-ai-dev-btn').addEventListener('click', () => {
            if (confirm('Starta AI vs AI? Du blir åskådare.')) {
                gameSocket.emit('dev_ai_vs_ai');
            }
        });
        
        document.getElementById('start-game-host').addEventListener('click', () => {
            gameSocket.emit('start_game');
            document.getElementById('host-menu').classList.add('hidden');
        });
        
        document.getElementById('start-game-btn').addEventListener('click', () => {
            gameSocket.emit('start_game');
        });
        
        document.getElementById('setting-sound').addEventListener('change', (e) => {
            this.settings.soundEnabled = e.target.checked;
            localStorage.setItem('soundEnabled', e.target.checked);
        });
        
        document.getElementById('setting-music').addEventListener('change', (e) => {
            this.settings.musicEnabled = e.target.checked;
            localStorage.setItem('musicEnabled', e.target.checked);
            audioManager.musicEnabled = e.target.checked;
            if (e.target.checked) audioManager.startBackgroundMusic();
            else audioManager.stopBackgroundMusic();
        });
        
        document.getElementById('setting-animations').addEventListener('change', (e) => {
            this.settings.animationsEnabled = e.target.checked;
            localStorage.setItem('animationsEnabled', e.target.checked);
            if (window.animationManager) animationManager.enabled = e.target.checked;
        });
        
        document.getElementById('setting-card-style').addEventListener('change', (e) => {
            this.settings.cardStyle = e.target.value;
            localStorage.setItem('cardStyle', e.target.value);
            this.renderHand();
        });
        
        document.getElementById('setting-deck-theme').addEventListener('change', (e) => {
            this.settings.deckTheme = e.target.value;
            localStorage.setItem('deckTheme', e.target.value);
            const deckToggle = document.getElementById('deck-toggle');
            if (deckToggle) {
                deckToggle.textContent = e.target.value === 'standard' ? '🥗' : '🎴';
                deckToggle.title = e.target.value === 'standard' ? 'Växla till grönsakskort' : 'Växla till standardkort';
            }
            this.renderHand();
            this.renderOpponents(this.gameState?.players || []);
        });
        
        document.getElementById('setting-auto-sort').addEventListener('change', (e) => {
            this.settings.autoSort = e.target.checked;
            localStorage.setItem('autoSort', e.target.checked);
        });
        
        document.getElementById('setting-sound').checked = this.settings.soundEnabled;
        document.getElementById('setting-music').checked = this.settings.musicEnabled;
        document.getElementById('setting-animations').checked = this.settings.animationsEnabled;
        document.getElementById('setting-auto-sort').checked = this.settings.autoSort;
        document.getElementById('setting-card-style').value = this.settings.cardStyle;
        document.getElementById('setting-deck-theme').value = this.settings.deckTheme;
        
        const deckToggle = document.getElementById('deck-toggle');
        if (deckToggle) {
            deckToggle.textContent = this.settings.deckTheme === 'standard' ? '🥗' : '🎴';
            deckToggle.title = this.settings.deckTheme === 'standard' ? 'Växla till grönsakskort' : 'Växla till standardkort';
        }
        
        // Push-to-talk tangent (mellanslag)
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.repeat && e.target.tagName !== 'INPUT') {
                e.preventDefault();
                if (this.voiceChat && this.voiceChat.pushToTalk) {
                    this.voiceChat.startTalking();
                    this.showPTTIndicator(true);
                }
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                if (this.voiceChat && this.voiceChat.pushToTalk) {
                    this.voiceChat.stopTalking();
                    this.showPTTIndicator(false);
                }
            }
        });
    }

    handleRoomJoined(data) {
        this.gameState = data.gameState;
        this.isHost = data.isHost;
        
        // Uppdatera videorutans namn med spelarens riktiga namn från game state
        const me = this.gameState?.players?.find(p => p.isYou);
        if (me) {
            const localVideoLabel = document.getElementById('local-video-label');
            if (localVideoLabel) localVideoLabel.textContent = me.name;
            document.getElementById('my-name').textContent = me.name;
        }
        
        if (this.isHost) {
            document.getElementById('host-controls').classList.remove('hidden');
        }
        
        this.renderGame();
        
        if (data.chatHistory) {
            data.chatHistory.forEach(msg => this.addChatMessage(msg));
        }
        
        this.addLogEntry('Du gick med i bordet', 'system');
    }

    handleGameStarted(data) {
        this.gameState = data.gameState;
        this.renderGame();
        
        if (window.audioManager) {
            audioManager.playCardDeal();
            // Spela inte bakgrundsmusik i multiplayer mot människor
            // eftersom den kan orsaka feedback via röstchatt
            const hasHumanOpponent = this.gameState?.players?.some(p => !p.isYou && !p.isAI);
            if (this.settings.musicEnabled && !hasHumanOpponent) {
                audioManager.startBackgroundMusic();
            }
        }
        
        this.addLogEntry('🎴 Spelet har börjat!', 'system');
        
        if (window.animationManager) {
            const cards = document.querySelectorAll('.hand .card');
            cards.forEach((card, i) => {
                animationManager.animateCardDeal(card, i * 0.1);
            });
        }
        
        // Initiera röstchatt endast om det finns mänskliga motståndare
        const hasHumanOpponent = this.gameState?.players?.some(p => !p.isYou && !p.isAI);
        if (hasHumanOpponent) {
            if (this.voiceChat) {
                this.voiceChat.disconnect();
                this.voiceChat = null;
            }
            this.voiceChat = new VideoChatManager(gameSocket);
            this.voiceChat.initialize().then(success => {
                if (success) {
                    this.voiceUI = new VideoChatUI(this.voiceChat);
                    this.voiceUI.createUI();
                    this.voiceUI.show();
                    this.voiceUI.setStatus('Ansluten');
                }
            });
        }
    }

    handleTurnResult(data) {
        const prevState = this.gameState;
        
        // Rensa eventuella pending-request UI
        this.hideCardRequest();
        this.hideAskPending();
        
        // Säkerhetskoll: se till att vi har en giltig gameState
        if (!data.gameState) {
            console.warn('⚠️ turn_result utan gameState:', data);
            return;
        }
        
        this.gameState = data.gameState;
        
        // Om draget misslyckades (t.ex. "Inte din tur"), uppdatera bara UI utan ljud/logg
        if (data.success === false) {
            this.renderGame();
            if (data.error) {
                this.addLogEntry(`⚠️ ${data.error}`, 'system');
            }
            return;
        }
        
        if (window.audioManager) {
            if (data.gotCards) {
                audioManager.playSuccess();
            } else if (data.fishedSuccess) {
                audioManager.playLuckyFish();
            } else {
                audioManager.playFish();
            }
        }
        
        if (window.animationManager) {
            if (data.gotCards) {
                animationManager.animateAskSuccess(document.getElementById('my-hand'));
                animationManager.spawnParticles(
                    window.innerWidth / 2,
                    window.innerHeight / 2,
                    'green',
                    15
                );
            } else if (data.fishedSuccess) {
                console.log('🎣 animateLuckyFish called with:', data.drawnCard);
                animationManager.animateLuckyFish(data.drawnCard);
            } else {
                animationManager.animateFishSplash(
                    window.innerWidth / 2,
                    window.innerHeight / 2
                );
            }
        }
        
        this.renderGame();
        
        // Visa tydligt när par bildas (både vid fråga och fiske)
        if (data.newPairs && data.newPairs.length > 0) {
            const pairCount = data.newPairs.length;
            this.addLogEntry(
                `🃏 ${data.askerName} bildade ${pairCount} nytt ${pairCount === 1 ? 'par' : 'par'}!`,
                'success'
            );
            
            if (window.animationManager) {
                animationManager.animatePairPopup(pairCount);
            }
        }
        
        if (data.gotCards) {
            this.addLogEntry(
                `🎯 ${data.askerName} frågade ${data.targetName} om ${data.rank}:an och fick kort!`,
                'success'
            );
        } else if (data.fishedSuccess) {
            this.addLogEntry(
                `🎣 ${data.askerName} fiskade upp rätt kort!`,
                'luck'
            );
        } else {
            this.addLogEntry(
                `🌊 ${data.askerName} frågade ${data.targetName} om ${data.rank}:an... "Finns i sjön!"`,
                'fish'
            );
        }
        
        if (data.aiReasoning) {
            this.addLogEntry(`🤖 ${data.aiReasoning}`, 'system');
        }
    }

    handleGameOver(data) {
        this.hideCardRequest();
        this.hideAskPending();
        
        this.gameState = data.gameState;
        
        if (window.audioManager) {
            audioManager.stopBackgroundMusic();
            
            const myId = this.gameState.players.find(p => p.isYou)?.id;
            const myRank = data.standings.find(s => s.id === myId)?.rank;
            audioManager.playGameOver(myRank === 1);
        }
        
        if (window.animationManager) {
            const myId = this.gameState.players.find(p => p.isYou)?.id;
            const myRank = data.standings.find(s => s.id === myId)?.rank;
            if (myRank === 1) {
                animationManager.spawnConfetti();
            }
        }
        
        this.renderGame();
        this.showGameOver(data);
    }

    handleReconnection(data) {
        this.hideCardRequest();
        this.hideAskPending();
        
        this.gameState = data.gameState;
        this.renderGame();
        
        if (data.chatHistory) {
            data.chatHistory.forEach(msg => this.addChatMessage(msg));
        }
        
        this.addLogEntry('Återansluten till spelet!', 'system');
    }

    updateGameState(state) {
        this.gameState = state;
        this.renderGame();
    }

    renderGame() {
        if (!this.gameState) return;
        
        const state = this.gameState;
        
        document.getElementById('room-name').textContent = `Bord: ${state.roomId}`;
        document.getElementById('game-type').textContent = state.gameType || 'Standard';
        
        this.updateTurnIndicator(state);
        document.getElementById('deck-count').textContent = state.deckRemaining;
        
        this.renderOpponents(state.players);
        this.renderHand(state.yourHand, state.yourPairs);
        this.updateGameLog(state.gameLog);
        this.updateActionButtons(state);
    }

    updateTurnIndicator(state) {
        const turnText = document.getElementById('turn-text');
        const turnIndicator = document.getElementById('turn-indicator');
        const timerText = document.getElementById('timer-text');
        const timerProgress = document.getElementById('timer-progress');
        const startBtn = document.getElementById('start-game-btn');
        
        const currentPlayer = state.players.find(p => p.isCurrentPlayer);
        const currentPlayerId = currentPlayer?.id;
        
        // Visa/dölj start-knapp för host när spelet väntar
        if (startBtn) {
            const canStart = this.isHost && state.state === 'waiting';
            startBtn.classList.toggle('hidden', !canStart);
        }
        
        if (state.state === 'waiting') {
            turnText.textContent = 'Väntar på fler spelare...';
            turnIndicator.classList.remove('active');
            timerText.textContent = '--';
            timerProgress.style.strokeDasharray = '0, 100';
            this.lastTurnSoundId = null;
        } else if (state.state === 'playing') {
            if (currentPlayer?.isYou) {
                turnText.textContent = 'Din tur! 🎣';
                turnIndicator.classList.add('active');
                
                if (window.animationManager) {
                    animationManager.animateTurnChange(true);
                }
                
                // Spela tur-ljud endast en gång per tur (inte vid varje state-update)
                if (window.audioManager && this.lastTurnSoundId !== currentPlayerId) {
                    this.lastTurnSoundId = currentPlayerId;
                    audioManager.playTurnStart();
                }
            } else {
                turnText.textContent = `${currentPlayer?.name || 'Någon'}s tur...`;
                turnIndicator.classList.remove('active');
                this.lastTurnSoundId = null;
                
                if (window.animationManager) {
                    animationManager.animateTurnChange(false);
                }
            }
            
            if (state.turnTimeRemaining !== null) {
                const remaining = Math.ceil(state.turnTimeRemaining / 1000);
                timerText.textContent = remaining;
                const percentage = (state.turnTimeRemaining / 45000) * 100;
                timerProgress.style.strokeDasharray = `${percentage}, 100`;
                
                if (remaining <= 10) {
                    timerProgress.style.stroke = '#ef4444';
                } else {
                    timerProgress.style.stroke = '#f59e0b';
                }
            } else {
                timerText.textContent = '--';
                timerProgress.style.strokeDasharray = '0, 100';
            }
        } else if (state.state === 'finished') {
            turnText.textContent = 'Spelet är slut!';
            turnIndicator.classList.remove('active');
        }
    }

    renderOpponents(players) {
        const container = document.getElementById('opponents-area');
        const opponents = players.filter(p => !p.isYou);
        
        console.log('🎮 renderOpponents:', opponents.map(p => ({name: p.name, socketId: p.socketId, id: p.id, isYou: p.isYou})));
        
        // ── Diff: identifiera befintliga vs nya vs borttagna ──
        const existingEls = new Map();
        container.querySelectorAll('.opponent[data-player-id]').forEach(el => {
            existingEls.set(el.dataset.playerId, el);
        });
        const newIds = new Set(opponents.map(p => p.id));
        
        // Ta bort opponents som inte längre finns
        existingEls.forEach((el, id) => {
            if (!newIds.has(id)) el.remove();
        });
        
        const deckBackClass = this.settings.deckTheme !== 'standard' ? `card-back-deck-${this.settings.deckTheme}` : '';
        
        // Bygg / uppdatera varje opponent
        opponents.forEach((p, index) => {
            let el = existingEls.get(p.id);
            const isNew = !el;
            
            if (isNew) {
                el = document.createElement('div');
                el.className = 'opponent';
                el.dataset.playerId = p.id;
                el.dataset.socketId = p.socketId || '';
                el.dataset.animated = '1';
                
                const cardBacks = Array(p.cardCount).fill(0).map((_, i) =>
                    `<div class="card-back ${deckBackClass}" style="left: ${i * -8}px; z-index: ${i}; transform: rotate(${i * 3 - 6}deg)"></div>`
                ).join('');
                
                el.innerHTML = `
                    <div class="opponent-video" data-opponent-video="${p.socketId || p.id}"></div>
                    <img src="${p.avatar || '/assets/images/default-avatar.png'}" class="opponent-avatar" alt="${p.name}">
                    <div class="opponent-name">
                        ${p.name}
                        ${p.isAI ? `<span class="ai-badge">AI ${p.aiDifficulty}</span>` : ''}
                        ${p.surrendered ? '<span class="surrender-badge">🏳️ Gav upp</span>' : ''}
                    </div>
                    <div class="opponent-cards">${p.surrendered ? '' : cardBacks}</div>
                    <div class="opponent-stats">
                        <span class="opponent-pairs">🏆 ${p.pairCount} par</span>
                        <span>${p.surrendered ? '🏳️ Gav upp' : `🎴 ${p.cardCount} kort`}</span>
                    </div>
                    ${p.isCurrentPlayer && !p.surrendered ? '<div class="turn-badge">⏱️</div>' : ''}
                `;
                el.style.animationDelay = `${index * 0.1}s`;
                container.appendChild(el);
                return;
            }
            
            // ── Befintligt element: uppdatera bara det som ändrats ──
            el.classList.toggle('current-turn', !!p.isCurrentPlayer && !p.surrendered);
            el.classList.toggle('disconnected', !p.connected);
            el.classList.toggle('ai-player', !!p.isAI);
            el.classList.toggle('surrendered', !!p.surrendered);
            el.dataset.socketId = p.socketId || '';
            
            // Avatar
            const avatarEl = el.querySelector('.opponent-avatar');
            if (avatarEl && avatarEl.src !== (p.avatar || '/assets/images/default-avatar.png')) {
                avatarEl.src = p.avatar || '/assets/images/default-avatar.png';
                avatarEl.alt = p.name;
            }
            
            // Namn
            const nameEl = el.querySelector('.opponent-name');
            if (nameEl) {
                const aiBadge = p.isAI ? `<span class="ai-badge">AI ${p.aiDifficulty}</span>` : '';
                const surrenderBadge = p.surrendered ? '<span class="surrender-badge">🏳️ Gav upp</span>' : '';
                const newNameHtml = `${p.name} ${aiBadge} ${surrenderBadge}`;
                if (nameEl.innerHTML.trim() !== newNameHtml.trim()) {
                    nameEl.innerHTML = newNameHtml;
                }
            }
            
            // Kort-baksidor (endast om antalet ändrats)
            const cardsEl = el.querySelector('.opponent-cards');
            if (cardsEl && cardsEl.children.length !== p.cardCount) {
                cardsEl.innerHTML = Array(p.cardCount).fill(0).map((_, i) =>
                    `<div class="card-back ${deckBackClass}" style="left: ${i * -8}px; z-index: ${i}; transform: rotate(${i * 3 - 6}deg)"></div>`
                ).join('');
            }
            
            // Stats
            const statsEl = el.querySelector('.opponent-stats');
            if (statsEl) {
                statsEl.innerHTML = `
                    <span class="opponent-pairs">🏆 ${p.pairCount} par</span>
                    <span>${p.surrendered ? '🏳️ Gav upp' : `🎴 ${p.cardCount} kort`}</span>
                `;
            }
            
            // Turn-badge (inte för surrendered spelare)
            const existingBadge = el.querySelector('.turn-badge');
            if (p.isCurrentPlayer && !p.surrendered && !existingBadge) {
                el.insertAdjacentHTML('beforeend', '<div class="turn-badge">⏱️</div>');
            } else if ((!p.isCurrentPlayer || p.surrendered) && existingBadge) {
                existingBadge.remove();
            }
        });
        
        // Försök flytta videor från fallback-grid till rätt opponent
        if (window.gameClient && gameClient.voiceChat) {
            const grid = document.getElementById('video-grid');
            if (grid) {
                grid.querySelectorAll('.video-peer-wrapper').forEach(wrapper => {
                    const peerId = wrapper.dataset.videoPeer;
                    if (!peerId) return;
                    const opponentContainer = gameClient.voiceChat.findOpponentVideoContainer(peerId);
                    if (opponentContainer && wrapper.parentElement !== opponentContainer) {
                        opponentContainer.appendChild(wrapper);
                    }
                });
                if (grid.children.length === 0) {
                    const vcc = document.getElementById('video-chat-container');
                    if (vcc) vcc.classList.remove('has-videos');
                }
            }
        }
        
        // Uppdatera video-namn
        if (this.voiceChat && this.voiceChat.refreshVideoNames) {
            this.voiceChat.refreshVideoNames();
        }
        
        if (window.animationManager && opponents.length > existingEls.size) {
            animationManager.staggerIn(container.querySelectorAll('.opponent:not([data-animated])'), 100);
            container.querySelectorAll('.opponent').forEach(el => el.dataset.animated = '1');
        }
    }

    renderHand(hand = [], pairs = []) {
        const container = document.getElementById('my-hand');
        const suits = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
        
        let sortedHand = [...hand];
        
        if (this.settings.autoSort) {
            const rankOrder = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
            sortedHand.sort((a, b) => {
                const av = rankOrder.indexOf(a.rank);
                const bv = rankOrder.indexOf(b.rank);
                return av - bv;
            });
        }
        
        const cardStyleClass = `card-style-${this.settings.cardStyle}`;
        const deckTheme = this.settings.deckTheme;
        const useImageDeck = deckTheme !== 'standard';
        
        const suitToVeggie = {
            hearts: 'pepper',      // paprika
            diamonds: 'radish',    // rädisa
            clubs: 'potato',       // potatis
            spades: 'aubergine'    // aubergine
        };
        
        container.innerHTML = sortedHand.map((card, index) => {
            const rotation = (index - sortedHand.length / 2) * 3;
            const translateY = Math.abs(index - sortedHand.length / 2) * -2;
            const transformStyle = `transform: rotate(${rotation}deg) translateY(${translateY}px)`;
            
            if (useImageDeck) {
                const veggie = suitToVeggie[card.suit];
                return `
                    <div class="card card-deck-image ${cardStyleClass}"
                         data-card-id="${card.id}"
                         style="${transformStyle}">
                        <img src="/assets/cards/${veggie}/${card.rank}.png"
                             alt="${card.rank}"
                             onerror="this.style.display='none'; this.parentElement.classList.remove('card-deck-image'); this.parentElement.classList.add('${card.suit === 'hearts' || card.suit === 'diamonds' ? 'red' : 'black'}'); this.parentElement.innerHTML='<span class=\\'rank-top\\'>${card.rank}</span><span class=\\'suit\\'>${suits[card.suit]}</span><span class=\\'rank-bottom\\'>${card.rank}</span>';">
                    </div>
                `;
            }
            
            const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
            return `
                <div class="card ${isRed ? 'red' : 'black'} ${cardStyleClass}"
                     data-card-id="${card.id}"
                     style="${transformStyle}">
                    <span class="rank-top">${card.rank}</span>
                    <span class="suit">${suits[card.suit]}</span>
                    <span class="rank-bottom">${card.rank}</span>
                </div>
            `;
        }).join('');
        
        document.getElementById('my-pairs').textContent = pairs.length;
        
        const me = this.gameState?.players.find(p => p.isYou);
        if (me) {
            const totalAsks = me.successfulAsks + me.failedAsks;
            const rate = totalAsks > 0 ? Math.round((me.successfulAsks / totalAsks) * 100) : 0;
            document.getElementById('my-success-rate').textContent = `${rate}%`;
        }
        
        if (window.animationManager) {
            const newCards = container.querySelectorAll('.card:not([data-animated])');
            newCards.forEach((card, i) => {
                card.setAttribute('data-animated', 'true');
                animationManager.animateCardReceive(card);
            });
        }
        
        // Om det finns en aktiv card request, highlighta matchande kort
        if (this.pendingCardRequest) {
            const requestedRank = this.pendingCardRequest.rank;
            const cards = container.querySelectorAll('.card');
            const matchingCards = [];
            
            cards.forEach(cardEl => {
                const cardId = cardEl.dataset.cardId;
                const cardData = hand.find(c => c.id === cardId);
                if (cardData && cardData.rank === requestedRank) {
                    cardEl.classList.add('card-request-highlight');
                    matchingCards.push(cardEl);
                    cardEl.addEventListener('click', () => {
                        this.respondToAskClick(true, requestedRank);
                    });
                }
            });
            
            // Uppdatera Fisk!-knappens synlighet baserat på om man har kortet
            const fiskBtn = document.getElementById('card-request-fisk');
            if (fiskBtn) {
                if (matchingCards.length === 0) {
                    fiskBtn.classList.remove('hidden');
                } else {
                    fiskBtn.classList.add('hidden');
                }
            }
        }
    }

    updateGameLog(logEntries) {
        const container = document.getElementById('game-log');
        
        if (!logEntries || logEntries.length === 0) return;
        
        container.innerHTML = logEntries.map(entry => {
            let className = 'log-entry';
            if (entry.type) className += ` ${entry.type}`;
            return `<div class="${className}">${entry.message}</div>`;
        }).join('');
        
        container.scrollTop = container.scrollHeight;
    }

    addLogEntry(message, type = 'system') {
        const container = document.getElementById('game-log');
        const div = document.createElement('div');
        div.className = `log-entry ${type}`;
        div.textContent = message;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
        
        const logContainer = document.getElementById('log-messages');
        if (logContainer) {
            const logDiv = document.createElement('div');
            logDiv.className = 'chat-message system-msg';
            logDiv.innerHTML = `<span class="msg-text">${this.escapeHtml(message)}</span>`;
            logContainer.appendChild(logDiv);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    }

    updateActionButtons(state) {
        const askBtn = document.getElementById('ask-btn');
        const waitingMsg = document.getElementById('waiting-message');
        const surrenderBtn = document.getElementById('surrender-btn');
        
        if (this.isSpectator) {
            askBtn.classList.add('hidden');
            waitingMsg.classList.add('hidden');
            surrenderBtn.classList.add('hidden');
            return;
        }
        
        const currentPlayer = state.players.find(p => p.isCurrentPlayer);
        const myHand = state.yourHand || [];
        const iSurrendered = state.players.find(p => p.isYou)?.surrendered;
        
        // Surrender-knapp: synlig under spelet om man inte redan gett upp
        if (state.state === 'playing' && !iSurrendered) {
            surrenderBtn.classList.remove('hidden');
        } else {
            surrenderBtn.classList.add('hidden');
        }
        
        // Dölj Fråga-knappen om det finns en pending ask (väntar på svar)
        const hasPendingAsk = this.pendingCardRequest !== null || document.getElementById('ask-pending-banner')?.classList.contains('hidden') === false;
        
        if (state.state === 'playing' && currentPlayer?.isYou && myHand.length > 0 && !iSurrendered && !hasPendingAsk) {
            askBtn.classList.remove('hidden');
            waitingMsg.classList.add('hidden');
            
            if (window.animationManager) {
                animationManager.pulse(askBtn, 2000);
            }
        } else {
            askBtn.classList.add('hidden');
            waitingMsg.classList.remove('hidden');
        }
    }

    showAskDialog() {
        if (!this.gameState || this.isSpectator) return;
        
        const dialog = document.getElementById('ask-dialog');
        const targetContainer = document.getElementById('target-players');
        const rankContainer = document.getElementById('rank-selector');
        
        const targets = this.gameState.players.filter(p => !p.isYou && p.connected && !p.surrendered);
        
        targetContainer.innerHTML = targets.map(p => `
            <button class="target-player-btn" data-player-id="${p.id}">
                <img src="${p.avatar || '/assets/images/default-avatar.png'}" class="tp-avatar" alt="${p.name}">
                <span class="tp-name">${p.name}</span>
                <span class="tp-cards">${p.cardCount} kort</span>
            </button>
        `).join('');
        
        const suits = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
        const suitToVeggie = {
            hearts: 'pepper',      // paprika
            diamonds: 'radish',    // rädisa
            clubs: 'potato',       // potatis
            spades: 'aubergine'    // aubergine
        };
        const myRanks = [...new Set(this.gameState.yourHand.map(c => c.rank))];
        const rankOrder = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
        const availableRanks = rankOrder.filter(r => myRanks.includes(r));
        
        // Hitta ett exempelkort för varje unik rank (för att visa rätt färg/symbol)
        const rankExamples = {};
        this.gameState.yourHand.forEach(c => {
            if (!rankExamples[c.rank]) rankExamples[c.rank] = c;
        });
        
        const useImageDeck = this.settings.deckTheme === 'vegetable';
        
        rankContainer.innerHTML = availableRanks.map(r => {
            const example = rankExamples[r];
            const isRed = example.suit === 'hearts' || example.suit === 'diamonds';
            
            if (useImageDeck) {
                const veggie = suitToVeggie[example.suit];
                return `
                    <button class="rank-btn rank-btn-image" data-rank="${r}"
                        style="background: transparent; border: none; box-shadow: none; padding: 0;">
                        <img src="/assets/cards/${veggie}/${r}.png" alt="${r}"
                             style="width: 50px; height: 70px; object-fit: cover; border-radius: var(--radius-md); display: block; box-shadow: 1px 1px 6px rgba(0,0,0,0.3);"
                             onerror="this.style.display='none'; this.parentElement.style.background='linear-gradient(135deg, #ffffff, #f1f5f9)'; this.parentElement.style.border='2px solid var(--border-color)'; this.parentElement.style.boxShadow='1px 1px 6px rgba(0,0,0,0.3)'; this.parentElement.classList.add('${isRed ? 'red' : 'black'}'); this.parentElement.innerHTML='<span class=\\'rc-rank-top\\'>${r}</span><span class=\\'rc-suit\\'>${suits[example.suit]}</span><span class=\\'rc-rank-bottom\\'>${r}</span>';">
                    </button>
                `;
            }
            
            return `
                <button class="rank-btn ${isRed ? 'red' : 'black'}" data-rank="${r}">
                    <span class="rc-rank-top">${r}</span>
                    <span class="rc-suit">${suits[example.suit]}</span>
                    <span class="rc-rank-bottom">${r}</span>
                </button>
            `;
        }).join('');
        
        targetContainer.querySelectorAll('.target-player-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                targetContainer.querySelectorAll('.target-player-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedTarget = btn.dataset.playerId;
                this.updateConfirmButton();
            });
        });
        
        rankContainer.querySelectorAll('.rank-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                rankContainer.querySelectorAll('.rank-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedRank = btn.dataset.rank;
                this.updateConfirmButton();
            });
        });
        
        this.selectedTarget = null;
        this.selectedRank = null;
        this.updateConfirmButton();
        
        dialog.classList.remove('hidden');
        
        if (window.animationManager) {
            animationManager.fadeIn(dialog);
        }
    }

    hideAskDialog() {
        const dialog = document.getElementById('ask-dialog');
        dialog.classList.add('hidden');
        this.selectedTarget = null;
        this.selectedRank = null;
    }

    updateConfirmButton() {
        const btn = document.getElementById('confirm-ask');
        const confidenceSpan = document.getElementById('ask-confidence');
        btn.disabled = !(this.selectedTarget && this.selectedRank);
        
        if (this.selectedTarget && this.selectedRank) {
            const target = this.gameState.players.find(p => p.id === this.selectedTarget);
            const targetAsked = target?.rankHistory?.filter(r => r === this.selectedRank).length || 0;
            const confidence = Math.min(30 + targetAsked * 20, 95);
            confidenceSpan.textContent = confidence > 50 ? `(~${confidence}% chans)` : '';
        } else {
            confidenceSpan.textContent = '';
        }
    }

    confirmAsk() {
        if (!this.selectedTarget || !this.selectedRank) return;
        
        gameSocket.emit('ask_cards', {
            targetId: this.selectedTarget,
            rank: this.selectedRank
        });
        
        this.hideAskDialog();
    }
    
    showAskPending(targetName, rank) {
        const banner = document.getElementById('ask-pending-banner');
        const text = banner.querySelector('.ask-pending-text');
        
        text.textContent = `Du frågade ${targetName} om ${rank}:an. Väntar på svar...`;
        banner.classList.remove('hidden');
    }
    
    hideAskPending() {
        const banner = document.getElementById('ask-pending-banner');
        if (banner) banner.classList.add('hidden');
        
        if (this.pendingAskTimer) {
            clearInterval(this.pendingAskTimer);
            this.pendingAskTimer = null;
        }
    }
    
    showCardRequest(askerName, rank) {
        this.pendingCardRequest = { askerName, rank };
        
        const overlay = document.getElementById('card-request-overlay');
        const title = document.getElementById('card-request-title');
        const subtitle = document.getElementById('card-request-subtitle');
        const fiskBtn = document.getElementById('card-request-fisk');
        
        title.textContent = `${askerName} frågar efter ${rank}:an!`;
        
        // Kolla om vi har kortet
        const hasCard = this.gameState?.yourHand?.some(c => c.rank === rank);
        if (hasCard) {
            subtitle.textContent = 'Klicka på det gröna kortet i din hand för att ge det!';
        } else {
            subtitle.textContent = 'Du har inte det kortet. Klicka på Fisk!'; 
        }
        
        overlay.classList.remove('hidden');
        
        // Re-rendera handen för att få fram highlight
        if (this.gameState) {
            this.renderHand(this.gameState.yourHand, this.gameState.yourPairs);
        }
        
        // Fisk!-knapp handler
        fiskBtn.onclick = () => {
            this.respondToAskClick(false, rank);
        };
        
        // Ingen synlig countdown — servern hanterar timeout automatiskt
    }
    
    hideCardRequest() {
        const overlay = document.getElementById('card-request-overlay');
        if (overlay) overlay.classList.add('hidden');
        
        this.pendingCardRequest = null;
        
        if (this.cardRequestCountdown) {
            clearInterval(this.cardRequestCountdown);
            this.cardRequestCountdown = null;
        }
        
        // Re-rendera handen för att ta bort highlight
        if (this.gameState) {
            this.renderHand(this.gameState.yourHand, this.gameState.yourPairs);
        }
    }
    
    respondToAskClick(hasCard, rank) {
        if (!this.pendingCardRequest) return;
        
        gameSocket.emit('respond_to_ask', {
            hasCard: hasCard,
            rank: rank
        });
        
        this.hideCardRequest();
    }

    sendChat() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        
        if (message) {
            gameSocket.emit('chat_message', { message });
            input.value = '';
        }
    }

    addChatMessage(msg) {
        const container = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = `chat-message ${msg.isSystem ? 'system-msg' : ''}`;
        
        const time = new Date(msg.timestamp).toLocaleTimeString('sv-SE', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        div.innerHTML = `
            <span class="sender">${this.escapeHtml(msg.player)}</span>
            <span class="time">${time}</span>
            <div class="msg-text">${this.escapeHtml(msg.message)}</div>
        `;
        
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
        
        if (window.audioManager && !msg.isSystem) {
            audioManager.playChat();
        }
    }

    showGameOver(data) {
        const modal = document.getElementById('game-over-modal');
        const standings = document.getElementById('final-standings');
        const eloChange = document.getElementById('elo-change');
        const achievementsDiv = document.getElementById('new-achievements');
        const achievementsList = document.getElementById('achievements-list');
        const title = document.getElementById('game-over-title');
        const subtitle = document.getElementById('game-over-subtitle');
        
        // Check result: win, loss, or tie
        const myPlayer = this.gameState?.players?.find(p => p.isYou);
        const myId = myPlayer?.id;
        const firstPlace = data.standings?.filter(s => s.rank === 1) || [];
        const isTie = firstPlace.length > 1;
        const iWon = !isTie && firstPlace[0] && (firstPlace[0].id === myId || firstPlace[0].socketId === myId);
        const iTied = isTie && firstPlace.some(p => p.id === myId || p.socketId === myId);
        
        if (iWon) {
            if (title) title.textContent = '🏆 Grattis, du vann!';
            if (subtitle) subtitle.textContent = 'Du är mästaren av Finns i sjön!';
            if (window.animationManager) animationManager.animateVictory();
        } else if (iTied) {
            if (title) title.textContent = '🤝 Oavgjort!';
            if (subtitle) subtitle.textContent = `Ni delar förstaplatsen med ${firstPlace[0].pairs} par`;
        } else {
            if (title) title.textContent = '🏆 Spelet är slut!';
            if (subtitle) subtitle.textContent = 'Här är resultatet';
        }
        
        if (window.audioManager) {
            audioManager.playGameOver(iWon);
        }
        
        standings.innerHTML = data.standings.map((p, i) => `
            <div class="standing-row ${p.rank === 1 ? 'winner' : ''}">
                <div class="standing-rank">${p.rank === 1 ? (isTie ? '🤝' : '👑') : p.rank}</div>
                <div class="standing-player">
                    <img src="${p.avatar || '/assets/images/default-avatar.png'}" class="standing-avatar" alt="${p.name}">
                    <span class="standing-name">${p.name}</span>
                    ${p.isAI ? `<span class="standing-ai">AI ${p.aiDifficulty}</span>` : ''}
                </div>
                <div class="standing-pairs">${p.pairs} par</div>
                <div class="standing-elo">
                    ${p.eloChange ? `
                        <span class="${p.eloChange > 0 ? 'elo-positive' : 'elo-negative'}">
                            ${p.eloChange > 0 ? '+' : ''}${p.eloChange}
                        </span>
                    ` : '--'}
                </div>
            </div>
        `).join('');
        
        if (data.eloChange) {
            eloChange.innerHTML = `
                <p>Din ELO: <strong>${data.eloChange.oldRating}</strong> 
                → <strong>${data.eloChange.newRating}</strong>
                <span class="${data.eloChange.change > 0 ? 'elo-positive' : 'elo-negative'}">
                    (${data.eloChange.change > 0 ? '+' : ''}${data.eloChange.change})
                </span></p>
            `;
        } else {
            eloChange.innerHTML = '<p>ELO-förändring: Endast registrerade användare får ELO-poäng</p>';
        }
        
        if (data.achievements && data.achievements.length > 0) {
            achievementsDiv.classList.remove('hidden');
            achievementsList.innerHTML = data.achievements.map(a => `
                <div class="achievement-badge">${this.getAchievementIcon(a)} ${this.getAchievementName(a)}</div>
            `).join('');
        } else {
            achievementsDiv.classList.add('hidden');
        }
        
        modal.classList.remove('hidden');
        
        if (window.animationManager) {
            animationManager.fadeIn(modal.querySelector('.modal-content'));
        }
    }

    getAchievementIcon(type) {
        const icons = {
            first_win: '🏆',
            fisherman: '🎣',
            master_fisherman: '🧜',
            lucky_star: '⭐',
            pair_master: '🃏',
            speed_demon: '⚡',
            comeback_kid: '🔄',
            solo_victory: '🥇',
            ai_slayer: '🤖',
            chat_master: '💬'
        };
        return icons[type] || '🎉';
    }

    getAchievementName(type) {
        const names = {
            first_win: 'Första segern',
            fisherman: 'Fiskare',
            master_fisherman: 'Mästerfiskare',
            lucky_star: 'Lucky Star',
            pair_master: 'Par-mästare',
            speed_demon: 'Speed Demon',
            comeback_kid: 'Comeback Kid',
            solo_victory: 'Solo-segrare',
            ai_slayer: 'AI-slayer',
            chat_master: 'Chatt-mästare'
        };
        return names[type] || type;
    }

    showPTTIndicator(show) {
        let overlay = document.getElementById('ptt-overlay');
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'ptt-overlay';
            overlay.className = 'ptt-overlay hidden';
            overlay.textContent = '🎙️ Du pratar...';
            document.body.appendChild(overlay);
        }
        
        overlay.classList.toggle('hidden', !show);
    }

    showSettings() {
        document.getElementById('settings-modal').classList.remove('hidden');
    }

    showAddAIModal() {
        const difficulties = ['naive', 'smart', 'expert', 'master'];
        const diff = difficulties[Math.floor(Math.random() * difficulties.length)];
        gameSocket.emit('add_ai', { difficulty: diff });
        document.getElementById('host-menu').classList.add('hidden');
    }

    leaveGame() {
        if (window.audioManager) {
            audioManager.stopBackgroundMusic();
        }
        gameSocket.emit('leave_room');
        localStorage.removeItem('currentRoom');
        localStorage.removeItem('isHost');
        window.location.href = '/';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showModal(title, message, buttonText = 'OK', onClose = null) {
        const modal = document.getElementById('alert-modal');
        document.getElementById('alert-modal-title').textContent = title;
        document.getElementById('alert-modal-message').textContent = message;
        const btn = document.getElementById('alert-modal-btn');
        btn.textContent = buttonText;

        const closeHandler = () => {
            modal.classList.add('hidden');
            btn.removeEventListener('click', closeHandler);
            if (onClose) onClose();
        };
        btn.addEventListener('click', closeHandler);
        // Also close on overlay click
        modal.querySelector('.modal-overlay').addEventListener('click', closeHandler, { once: true });

        modal.classList.remove('hidden');
    }

    showError(message) {
        this.showModal('Fel', message);
    }
}

let gameClient;
document.addEventListener('DOMContentLoaded', () => {
    gameClient = new GameClient();
    window.gameClient = gameClient; // Gör tillgänglig för video-chat.js m.fl.
});

// Global felhanterare för att fånga krascher
window.addEventListener('error', (e) => {
    console.error('🔴 Ohanterat fel:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('🔴 Ohanterat promise-fel:', e.reason);
});
