class GameClient {
    constructor() {
        this.gameState = null;
        this.selectedTarget = null;
        this.selectedPairId = null;
        this.isHost = false;
        this.isSpectator = false;
        this.roomId = new URLSearchParams(window.location.search).get('room');
        this.playerName = new URLSearchParams(window.location.search).get('name') || localStorage.getItem('playerName');
        this.password = new URLSearchParams(window.location.search).get('password');
        this.token = new URLSearchParams(window.location.search).get('token') || localStorage.getItem('token');
        this.lastDrawnCardId = null;
        
        this.settings = {
            soundEnabled: localStorage.getItem('soundEnabled') !== 'false',
            musicEnabled: localStorage.getItem('musicEnabled') === 'true',
            animationsEnabled: localStorage.getItem('animationsEnabled') !== 'false',
            autoSort: localStorage.getItem('autoSort') !== 'false',
            cardStyle: localStorage.getItem('cardStyle') || 'classic',
            tutorialEnabled: localStorage.getItem('tutorialEnabled') !== 'false',
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
        this.selectedAskCardId = null;
        this.selectedAskPairId = null;
        this.selectedAskTargetId = null;
        this.cardRequestCountdown = null;
        this.wasMobileFabHidden = true;
        this.lastInteractionTime = Date.now();
        this.tutorialTimer = null;
        this.currentHint = null;
        this.availableThemes = [{ id: 'standard', name: 'Standard' }];

        this.init();
    }

    async init() {
        if (!this.roomId) {
            window.location.href = '/';
            return;
        }

        await this.loadThemes();

        if (window.audioManager) {
            await audioManager.init();
        }

        if (window.animationManager) {
            animationManager.enabled = this.settings.animationsEnabled;
        }

        this.setupUI();
        this.connectSocket();
    }

    async loadThemes() {
        try {
            const res = await fetch('/api/themes');
            const data = await res.json();
            if (data.themes && data.themes.length > 0) {
                // Standard-temat ska alltid finnas med i listan
                const hasStandard = data.themes.some(t => t.id === 'standard');
                this.availableThemes = hasStandard
                    ? data.themes
                    : [{ id: 'standard', name: 'Standard' }, ...data.themes];
                this.populateThemeSelect();
            }
        } catch (err) {
            console.warn('Kunde inte ladda teman:', err);
        }
    }

    populateThemeSelect() {
        const select = document.getElementById('setting-deck-theme');
        if (!select) return;

        const currentValue = select.value || this.settings.deckTheme;
        select.innerHTML = this.availableThemes.map(t =>
            `<option value="${t.id}">${t.id === 'standard' ? '🎴' : '🃏'} ${t.name}</option>`
        ).join('');
        select.value = currentValue;
    }

    updateDeckToggle(themeId) {
        const deckToggle = document.getElementById('deck-toggle');
        if (!deckToggle) return;

        const theme = this.availableThemes.find(t => t.id === themeId);
        const nextIndex = (this.availableThemes.findIndex(t => t.id === themeId) + 1) % this.availableThemes.length;
        const nextTheme = this.availableThemes[nextIndex];

        const canChange = !this.gameState || this.gameState.state === 'waiting';
        deckToggle.disabled = !canChange;
        deckToggle.classList.toggle('disabled', !canChange);
        deckToggle.textContent = themeId === 'standard' ? '🥗' : '🎴';
        deckToggle.title = canChange
            ? `Aktivt: ${theme ? theme.name : themeId}. Klicka för ${nextTheme ? nextTheme.name : 'nästa'}`
            : `Aktivt: ${theme ? theme.name : themeId}. Temat kan bara ändras i vänteläget.`;

        const currentThemeEl = document.getElementById('current-theme');
        if (currentThemeEl) {
            currentThemeEl.textContent = theme ? theme.name : themeId;
            currentThemeEl.classList.remove('hidden');
        }
    }

    showDeckThemeFeedback(themeName) {
        if (window.audioManager) {
            audioManager.playClick();
        }

        const deckToggle = document.getElementById('deck-toggle');
        if (deckToggle) {
            deckToggle.classList.add('theme-changed');
            setTimeout(() => deckToggle.classList.remove('theme-changed'), 300);
        }

        this.showToast(`Kortlek: ${themeName}`, 'info');
    }

    async startVoiceChat() {
        if (this.voiceChat && this.voiceChat.isConnected) return;

        if (this.voiceChat) {
            this.voiceChat.disconnect();
        }

        const voiceBtn = document.getElementById('voice-chat-toggle');
        this.voiceChat = new VideoChatManager(gameSocket);
        const success = await this.voiceChat.initialize();

        if (success) {
            this.voiceUI = new VideoChatUI(this.voiceChat);
            this.voiceUI.createUI();
            this.voiceUI.show();
            this.voiceUI.setStatus('Ansluten');
            if (voiceBtn) voiceBtn.classList.add('active');
        }
    }

    showToast(message, type = 'info', duration = 2000) {
        const existing = document.querySelector('.game-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `game-toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            padding: 10px 20px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.95rem;
            z-index: 10000;
            animation: fadeIn 0.2s ease, fadeOut 0.2s ease ${duration - 200}ms forwards;
            background: ${type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--accent)'};
            color: #fff;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            pointer-events: none;
        `;

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    }

    connectSocket() {
        gameSocket.connect();
        
        gameSocket.on('connected', (data) => {
            if (data?.isReconnect) {
                // Vid reconnect: skicka inte join_room direkt.
                // Vänta på 'reconnected' från servern. Om den inte kommer
                // inom 10 sekunder, skicka join_room som fallback.
                this.reconnectTimeout = setTimeout(() => {
                    this.reconnectTimeout = null;
                    this.joinRoom();
                }, 10000);
            } else {
                this.joinRoom();
            }
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
        
        gameSocket.on('ready_status_update', (data) => {
            this.handleReadyStatusUpdate(data.readyStatus);
        });
        
        gameSocket.on('game_state_update', (data) => {
            const state = data?.gameState || data;
            if (!state || !state.players) {
                console.warn('⚠️ game_state_update utan giltig gameState:', data);
                return;
            }
            const current = state.players?.find(p => p.isCurrentPlayer);
            const you = state.players?.find(p => p.isYou);
            console.log('📊 [GAME_STATE]', {
                currentPlayer: current?.name,
                isYourTurn: current?.isYou,
                state: state.state,
                turn: state.turnCount,
                yourHand: state.yourHand?.length,
                yourPairs: state.yourPairs?.length,
                deck: state.deckRemaining,
                players: state.players?.map(p => `${p.name}(conn=${p.connected},host=${p.isHost})`).join(', ')
            });
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
            this.showAskPending(data.targetName, data.pairId, data.pairName);
        });
        
        gameSocket.on('card_request', (data) => {
            this.showCardRequest(data.askerName, data.pairId, data.pairName);
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
            if (settings.deckTheme) {
                const themeName = this.availableThemes.find(t => t.id === settings.deckTheme)?.name || settings.deckTheme;
                this.settings.deckTheme = settings.deckTheme;
                localStorage.setItem('deckTheme', settings.deckTheme);
                const settingSelect = document.getElementById('setting-deck-theme');
                if (settingSelect) settingSelect.value = settings.deckTheme;
                this.updateDeckToggle(settings.deckTheme);
                this.renderHand(this.gameState?.yourHand, this.gameState?.yourPairs);
                this.renderOpponents(this.gameState?.players || []);
                this.showDeckThemeFeedback(themeName);
            }
        });
        
        gameSocket.on('reconnected', (data) => {
            console.log('✅ [GAME_RECONNECTED]', { roomId: data.roomId, hasGameState: !!data.gameState, players: data.gameState?.players?.length });
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }
            // Försök aktivera AudioContext direkt vid reconnect
            if (window.audioManager) {
                audioManager.resume();
            }
            this.setOfflineBanner('connected');
            this.handleReconnection(data);
        });
        
        gameSocket.on('reconnect_failed', () => {
            console.log('❌ [GAME_RECONNECT_FAILED] Kunde inte återansluta till servern.');
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }
            // reconnect_attempt misslyckades, försök gå med som ny spelare
            this.joinRoom();
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
            this.setOfflineBanner('reconnecting');
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
        
        // Röstchatt-knapp – manuell aktivering/avaktivering
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
                    await this.startVoiceChat();
                }
            });
        }
        
        const deckToggle = document.getElementById('deck-toggle');
        if (deckToggle) {
            deckToggle.addEventListener('click', () => {
                const isAIMode = new URLSearchParams(window.location.search).get('ai');
                const currentIndex = this.availableThemes.findIndex(t => t.id === this.settings.deckTheme);
                const nextIndex = (currentIndex + 1) % this.availableThemes.length;
                const newTheme = this.availableThemes[nextIndex]?.id;

                console.log('🎴 deck-toggle clicked:', {
                    isAIMode: !!isAIMode,
                    isHost: this.isHost,
                    availableThemes: this.availableThemes.map(t => t.id),
                    currentTheme: this.settings.deckTheme,
                    newTheme,
                    gameState: this.gameState?.state
                });

                if (!newTheme) {
                    console.warn('🎴 Inga teman tillgängliga');
                    return;
                }

                // Kortleken kan bara bytas i vänteläget; under pågående spel
                // är korten redan utdelade med det aktuella temat.
                if (this.gameState && this.gameState.state !== 'waiting') {
                    console.log('🎴 Kortlek kan inte ändras under pågående spel');
                    this.showToast('Kortleken kan bara bytas innan spelet startar', 'info');
                    return;
                }

                // Värden skickar till server så att alla spelare (och servern)
                // får samma tema. UI uppdateras först när settings_updated
                // bekräftas, vilket undviker att indikatorn och korten visas
                // med olika teman vid snabb start.
                if (this.isHost) {
                    gameSocket.emit('update_settings', { deckTheme: newTheme });
                    return;
                }

                // Fallback för icke-värdar (knappen är normalt dold för dessa)
                const themeName = this.availableThemes.find(t => t.id === newTheme)?.name || newTheme;
                this.settings.deckTheme = newTheme;
                localStorage.setItem('deckTheme', newTheme);
                document.getElementById('setting-deck-theme').value = newTheme;
                this.updateDeckToggle(newTheme);
                this.renderHand(this.gameState?.yourHand, this.gameState?.yourPairs);
                this.renderOpponents(this.gameState?.players || []);
                this.showDeckThemeFeedback(themeName);
            });
        }
        
        document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
            el.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) modal.classList.add('hidden');
            });
        });
        
        document.getElementById('settings-btn').addEventListener('click', () => this.showSettings());
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
            // Host kan starta om spelet direkt; andra väntar på hosten
            if (this.isHost) {
                gameSocket.emit('start_game');
                document.getElementById('game-over-modal').classList.add('hidden');
                this.addLogEntry('🔄 Startar nytt spel...', 'system');
            } else {
                document.getElementById('game-over-modal').classList.add('hidden');
                this.showModal('Väntar på värden', 'Värden startar nästa spel. Håll utkik!', 'OK');
            }
        });
        
        document.getElementById('back-to-lobby').addEventListener('click', () => {
            this.leaveGame();
        });
        
        document.getElementById('host-menu-btn').addEventListener('click', () => {
            document.getElementById('host-menu').classList.toggle('hidden');
        });

        document.getElementById('kick-player-btn').addEventListener('click', () => {
            document.getElementById('host-menu').classList.add('hidden');
            this.showKickModal();
        });

        const kickModal = document.getElementById('kick-modal');
        document.querySelector('#kick-modal .modal-close')?.addEventListener('click', () => {
            this.closeModal(kickModal);
        });
        document.querySelector('#kick-modal .modal-overlay')?.addEventListener('click', () => {
            this.closeModal(kickModal);
        });
        
        // Event delegation för kort-klick: antingen välja kort att fråga efter
        // eller svara på en pending card request
        const handContainer = document.getElementById('my-hand');
        if (handContainer) {
            handContainer.addEventListener('click', (e) => {
                const cardEl = e.target.closest('.card');
                if (!cardEl) return;

                if (this.pendingCardRequest) {
                    // Svara på en förfrågan med det klickade kortets pairId
                    const pairId = cardEl.dataset.pairId;
                    if (pairId !== this.pendingCardRequest.pairId) {
                        this.showToast('Fel kort — klicka på det kortet som efterfrågas', 'error');
                        return;
                    }
                    this.respondToAskClick(true, pairId);
                    return;
                }

                this.handleHandCardClick(cardEl);
            });
        }

        // Event delegation för motståndarval
        const opponentsContainer = document.getElementById('opponents-area');
        if (opponentsContainer) {
            opponentsContainer.addEventListener('click', (e) => {
                const opponentEl = e.target.closest('.opponent');
                if (!opponentEl) return;
                this.handleOpponentClick(opponentEl);
            });
        }

        // Card request-knappar (registreras en gång, använder pendingCardRequest-state)
        const giveBtn = document.getElementById('card-request-give');
        if (giveBtn) {
            giveBtn.addEventListener('click', () => {
                if (this.pendingCardRequest) {
                    this.respondToAskClick(true, this.pendingCardRequest.pairId);
                }
            });
        }
        const fiskBtnEl = document.getElementById('card-request-fisk');
        if (fiskBtnEl) {
            fiskBtnEl.addEventListener('click', () => {
                if (this.pendingCardRequest) {
                    this.respondToAskClick(false, this.pendingCardRequest.pairId);
                }
            });
        }
        
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
        
        const mobileStartBtn = document.getElementById('mobile-start-btn');
        if (mobileStartBtn) {
            mobileStartBtn.addEventListener('click', () => {
                gameSocket.emit('start_game');
            });
        }
        
        document.getElementById('ready-btn').addEventListener('click', () => {
            gameSocket.emit('toggle_ready');
        });
        
        const mobileReadyBtn = document.getElementById('mobile-ready-btn');
        if (mobileReadyBtn) {
            mobileReadyBtn.addEventListener('click', () => {
                gameSocket.emit('toggle_ready');
            });
        }
        
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
            this.renderHand(this.gameState?.yourHand, this.gameState?.yourPairs);
        });
        
        document.getElementById('setting-deck-theme').addEventListener('change', (e) => {
            const isAIMode = new URLSearchParams(window.location.search).get('ai');
            
            // I multiplayer-rum: värden skickar till server så alla får samma tema
            if (!isAIMode && this.isHost) {
                gameSocket.emit('update_settings', { deckTheme: e.target.value });
                return;
            }
            
            // I AI-läge eller om man inte är värd: ändra lokalt
            this.settings.deckTheme = e.target.value;
            localStorage.setItem('deckTheme', e.target.value);
            this.updateDeckToggle(e.target.value);
            this.renderHand(this.gameState?.yourHand, this.gameState?.yourPairs);
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
        
        this.updateDeckToggle(this.settings.deckTheme);
        
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
        
        // ── Mobil UI: bottom sheet, FAB, expandable log, action-bar ──
        this.setupMobileUI();
        
        // ── Tutorial/hjälp-hand och "Din tur"-badge ──
        this.setupTutorial();
    }
    
    setupMobileUI() {
        // Expandable game-log
        const expandLogBtn = document.getElementById('expand-log-btn');
        if (expandLogBtn) {
            expandLogBtn.addEventListener('click', () => {
                const log = document.getElementById('game-log');
                log.classList.toggle('expanded');
                expandLogBtn.textContent = log.classList.contains('expanded') ? '✕' : '📜';
            });
        }
        
        // Chat-knapp i header (surfplatta + mobil)
        const mobileChatBtn = document.getElementById('mobile-chat-btn');
        if (mobileChatBtn) {
            mobileChatBtn.addEventListener('click', () => {
                const chatPanel = document.getElementById('chat-panel');
                const isMobile = window.innerWidth <= 768;
                if (isMobile) {
                    this.openMobileSheet('chat');
                } else {
                    // Surfplatta: slide-in overlay
                    chatPanel.classList.toggle('open');
                    const backdrop = document.querySelector('.chat-overlay-backdrop');
                    if (backdrop) backdrop.classList.toggle('open', chatPanel.classList.contains('open'));
                }
            });
        }
        
        // Chat overlay backdrop (stänger chat på surfplatta)
        const chatBackdrop = document.querySelector('.chat-overlay-backdrop');
        if (chatBackdrop) {
            chatBackdrop.addEventListener('click', () => {
                document.getElementById('chat-panel').classList.remove('open');
                chatBackdrop.classList.remove('open');
            });
        }
        
        // Bottom sheet tabs
        document.querySelectorAll('.sheet-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.sheet-messages').forEach(m => m.classList.remove('active'));
                document.getElementById(`mobile-${tab.dataset.tab}-messages`)?.classList.add('active');
            });
        });
        
        // Bottom sheet backdrop och handle (stäng)
        const mobileSheet = document.getElementById('mobile-sheet');
        if (mobileSheet) {
            const backdrop = mobileSheet.querySelector('.mobile-sheet-backdrop');
            const handle = mobileSheet.querySelector('.mobile-sheet-handle');
            if (backdrop) backdrop.addEventListener('click', () => this.closeMobileSheet());
            if (handle) handle.addEventListener('click', () => this.closeMobileSheet());
            
            // Swipe-to-dismiss
            let sheetTouchStartY = 0;
            const sheetContainer = mobileSheet.querySelector('.mobile-sheet-container');
            if (sheetContainer) {
                sheetContainer.addEventListener('touchstart', (e) => {
                    sheetTouchStartY = e.touches[0].clientY;
                }, { passive: true });
                sheetContainer.addEventListener('touchend', (e) => {
                    const diff = e.changedTouches[0].clientY - sheetTouchStartY;
                    if (diff > 80) this.closeMobileSheet();
                }, { passive: true });
            }
        }
        
        // Mobil chatt-input
        const mobileSendBtn = document.getElementById('mobile-send-chat');
        const mobileChatInput = document.getElementById('mobile-chat-input');
        if (mobileSendBtn) {
            mobileSendBtn.addEventListener('click', () => this.sendMobileChat());
        }
        if (mobileChatInput) {
            mobileChatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendMobileChat();
            });
        }
        
        // FAB (Floating Action Button)
        const mobileFab = document.getElementById('mobile-fab');
        if (mobileFab) {
            mobileFab.addEventListener('click', () => this.showAskDialog());
        }
        
        // Mobil action-bar knappar
        const mobileChatToggle = document.getElementById('mobile-chat-toggle');
        if (mobileChatToggle) {
            mobileChatToggle.addEventListener('click', () => this.openMobileSheet('chat'));
        }
        
        const mobileSoundToggle = document.getElementById('mobile-sound-toggle');
        if (mobileSoundToggle) {
            mobileSoundToggle.addEventListener('click', () => {
                const enabled = audioManager.toggleSound();
                mobileSoundToggle.textContent = enabled ? '🔊' : '🔇';
                // Synka med desktop-knapp
                const desktopSoundBtn = document.getElementById('sound-toggle');
                if (desktopSoundBtn) {
                    desktopSoundBtn.textContent = enabled ? '🔊' : '🔇';
                    desktopSoundBtn.classList.toggle('muted', !enabled);
                }
            });
            mobileSoundToggle.textContent = this.settings.soundEnabled ? '🔊' : '🔇';
        }
        
        const mobileSettingsToggle = document.getElementById('mobile-settings-toggle');
        if (mobileSettingsToggle) {
            mobileSettingsToggle.addEventListener('click', () => this.showSettings());
        }
        
        const mobileRules = document.getElementById('mobile-rules');
        if (mobileRules) {
            mobileRules.addEventListener('click', () => this.showRules());
        }
        
        const rulesClose = document.querySelector('.rules-modal-close');
        const rulesBackdrop = document.querySelector('.rules-modal-backdrop');
        if (rulesClose) rulesClose.addEventListener('click', () => this.hideRules());
        if (rulesBackdrop) rulesBackdrop.addEventListener('click', () => this.hideRules());
    }
    
    openMobileSheet(tab = 'chat') {
        const sheet = document.getElementById('mobile-sheet');
        if (!sheet) return;
        
        // Sätt aktiv flik
        document.querySelectorAll('.sheet-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        document.querySelectorAll('.sheet-messages').forEach(m => {
            m.classList.toggle('active', m.id === `mobile-${tab}-messages`);
        });
        
        sheet.classList.add('open');
        
        // Fokusera input om chatt-fliken
        if (tab === 'chat') {
            setTimeout(() => document.getElementById('mobile-chat-input')?.focus(), 350);
        }
    }
    
    closeMobileSheet() {
        const sheet = document.getElementById('mobile-sheet');
        if (sheet) sheet.classList.remove('open');
    }
    
    sendMobileChat() {
        const input = document.getElementById('mobile-chat-input');
        const message = input?.value.trim();
        
        if (message) {
            gameSocket.emit('chat_message', { message });
            input.value = '';
        }
    }

    setupTutorial() {
        const toggleBtn = document.getElementById('mobile-tutorial-toggle');
        if (toggleBtn) {
            toggleBtn.classList.toggle('tutorial-off', !this.settings.tutorialEnabled);
            toggleBtn.title = this.settings.tutorialEnabled ? 'Hjälp på' : 'Hjälp av';
            toggleBtn.addEventListener('click', () => this.toggleTutorial());
        }
        
        const closeBtn = document.getElementById('tutorial-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hideTutorialHint();
                this.settings.tutorialEnabled = false;
                localStorage.setItem('tutorialEnabled', 'false');
                this.updateTutorialToggle();
            });
        }
        
        // Nollställ timer vid användarinteraktion
        const resetEvents = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];
        resetEvents.forEach(event => {
            document.addEventListener(event, () => this.resetTutorialTimer(), { passive: true });
        });
        
        // Dölj hint när spelaren agerar i spelet
        document.getElementById('my-hand')?.addEventListener('click', () => this.hideTutorialHint());
        document.getElementById('opponents-area')?.addEventListener('click', () => this.hideTutorialHint());
        document.getElementById('ask-btn')?.addEventListener('click', () => this.hideTutorialHint());
        document.getElementById('mobile-fab')?.addEventListener('click', () => this.hideTutorialHint());
    }
    
    toggleTutorial() {
        this.settings.tutorialEnabled = !this.settings.tutorialEnabled;
        localStorage.setItem('tutorialEnabled', this.settings.tutorialEnabled);
        this.updateTutorialToggle();
        if (this.settings.tutorialEnabled) {
            this.resetTutorialTimer();
        } else {
            this.hideTutorialHint();
        }
    }
    
    updateTutorialToggle() {
        const toggleBtn = document.getElementById('mobile-tutorial-toggle');
        if (toggleBtn) {
            toggleBtn.classList.toggle('tutorial-off', !this.settings.tutorialEnabled);
            toggleBtn.title = this.settings.tutorialEnabled ? 'Hjälp på' : 'Hjälp av';
        }
    }
    
    resetTutorialTimer() {
        this.lastInteractionTime = Date.now();
        if (this.tutorialTimer) {
            clearTimeout(this.tutorialTimer);
            this.tutorialTimer = null;
        }
        if (this.settings.tutorialEnabled) {
            this.tutorialTimer = setTimeout(() => this.updateTutorialState(), 4000);
        }
    }
    
    updateTutorialState() {
        if (!this.settings.tutorialEnabled || !this.gameState) {
            this.hideTutorialHint();
            return;
        }
        
        // Dölj om användaren nyligen interagerat
        if (Date.now() - this.lastInteractionTime < 4000) {
            return;
        }
        
        const state = this.gameState;
        const me = state.players?.find(p => p.isYou);
        if (!me || me.surrendered || this.isSpectator) {
            this.hideTutorialHint();
            return;
        }
        
        // Vänteläge
        if (state.state === 'waiting') {
            if (this.isHost) {
                const mobileStartBtn = document.getElementById('mobile-start-btn');
                const desktopStartBtn = document.getElementById('start-game-btn');
                const startBtn = mobileStartBtn && !mobileStartBtn.classList.contains('hidden')
                    ? mobileStartBtn
                    : desktopStartBtn && !desktopStartBtn.classList.contains('hidden')
                        ? desktopStartBtn
                        : null;
                if (startBtn) {
                    this.showTutorialHint(startBtn, 'Klicka här för att starta spelet!', 'up');
                    return;
                }
            }
            if (!me.ready) {
                const mobileReadyBtn = document.getElementById('mobile-ready-btn');
                const desktopReadyBtn = document.getElementById('ready-btn');
                const readyBtn = mobileReadyBtn && !mobileReadyBtn.classList.contains('hidden')
                    ? mobileReadyBtn
                    : desktopReadyBtn && !desktopReadyBtn.classList.contains('hidden')
                        ? desktopReadyBtn
                        : null;
                if (readyBtn) {
                    this.showTutorialHint(readyBtn, 'Klicka här för att visa att du är redo!', 'up');
                    return;
                }
            }
            this.hideTutorialHint();
            return;
        }
        
        // Pågående spel
        if (state.state !== 'playing' && state.state !== 'active') {
            this.hideTutorialHint();
            return;
        }
        
        // Om någon frågar efter ett kort
        if (this.pendingCardRequest) {
            const matchingCard = document.querySelector(`#my-hand .card[data-pair-id="${this.pendingCardRequest.pairId}"]`);
            if (matchingCard) {
                this.showTutorialHint(matchingCard, 'Du blev tillfrågad! Klicka på detta kort om du har det.', 'down');
                return;
            }
            const fiskBtn = document.getElementById('card-request-fisk');
            if (fiskBtn && !fiskBtn.classList.contains('hidden')) {
                this.showTutorialHint(fiskBtn, 'Du har inte kortet. Klicka på Fisk!', 'up');
                return;
            }
            this.hideTutorialHint();
            return;
        }
        
        // Är det min tur?
        if (!me.isCurrentPlayer) {
            this.hideTutorialHint();
            return;
        }
        
        // Frågedialog öppen
        const askDialog = document.getElementById('ask-dialog');
        if (askDialog && !askDialog.classList.contains('hidden')) {
            if (!this.selectedAskTargetId) {
                const firstTarget = document.querySelector('.target-player-btn');
                if (firstTarget) {
                    this.showTutorialHint(firstTarget, 'Välj en motståndare att fråga!', 'up');
                    return;
                }
            }
            if (!this.selectedAskPairId) {
                const firstRank = document.querySelector('.rank-btn');
                if (firstRank) {
                    this.showTutorialHint(firstRank, 'Välj vilket kort du vill fråga efter!', 'up');
                    return;
                }
            }
            const confirmBtn = document.getElementById('confirm-ask');
            if (confirmBtn && !confirmBtn.disabled) {
                this.showTutorialHint(confirmBtn, 'Klicka för att fråga!', 'up');
                return;
            }
            this.hideTutorialHint();
            return;
        }
        
        // Inget kort valt än – peka på handen
        const firstCard = document.querySelector('#my-hand .card');
        if (firstCard) {
            this.showTutorialHint(firstCard, 'Det är din tur! Välj ett kort i din hand.', 'down');
            return;
        }
        
        this.hideTutorialHint();
    }
    
    showTutorialHint(target, message, direction = 'up') {
        const hand = document.getElementById('tutorial-hand');
        const hint = document.getElementById('tutorial-hint');
        const hintText = document.getElementById('tutorial-hint-text');
        if (!hand || !hint || !hintText || !target) return;
        
        const rect = target.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        
        const handSize = 44;
        let top, left, rotation;
        
        switch (direction) {
            case 'up':
                top = rect.bottom + 10;
                left = rect.left + rect.width / 2 - handSize / 2;
                rotation = '-135deg';
                break;
            case 'down':
                top = rect.top - handSize - 10;
                left = rect.left + rect.width / 2 - handSize / 2;
                rotation = '45deg';
                break;
            case 'left':
                top = rect.top + rect.height / 2 - handSize / 2;
                left = rect.right + 10;
                rotation = '-45deg';
                break;
            case 'right':
                top = rect.top + rect.height / 2 - handSize / 2;
                left = rect.left - handSize - 10;
                rotation = '135deg';
                break;
            default:
                top = rect.bottom + 10;
                left = rect.left + rect.width / 2 - handSize / 2;
                rotation = '-135deg';
        }
        
        // Håll inom viewport
        const maxLeft = window.innerWidth - handSize - 8;
        const maxTop = window.innerHeight - handSize - 8;
        left = Math.max(8, Math.min(maxLeft, left));
        top = Math.max(8, Math.min(maxTop, top));
        
        hand.style.top = `${top}px`;
        hand.style.left = `${left}px`;
        hand.style.setProperty('--hand-rotation', rotation);
        hand.classList.remove('hidden');
        
        hintText.textContent = message;
        const hintWidth = Math.min(260, window.innerWidth - 32);
        let hintLeft = left + handSize / 2 - hintWidth / 2;
        hintLeft = Math.max(8, Math.min(window.innerWidth - hintWidth - 8, hintLeft));
        hint.style.top = `${top + handSize + 6}px`;
        hint.style.left = `${hintLeft}px`;
        hint.style.maxWidth = `${hintWidth}px`;
        hint.classList.remove('hidden');
    }
    
    hideTutorialHint() {
        const hand = document.getElementById('tutorial-hand');
        const hint = document.getElementById('tutorial-hint');
        if (hand) hand.classList.add('hidden');
        if (hint) hint.classList.add('hidden');
        if (this.tutorialTimer) {
            clearTimeout(this.tutorialTimer);
            this.tutorialTimer = null;
        }
    }
    
    updateMyTurnBadge(state) {
        const badge = document.getElementById('my-turn-badge');
        if (!badge) return;
        
        const me = state.players?.find(p => p.isYou);
        const isMyTurn = me && me.isCurrentPlayer && (state.state === 'playing' || state.state === 'active');
        badge.classList.toggle('hidden', !isMyTurn);
    }

    handleRoomJoined(data) {
        console.log('🎮 handleRoomJoined:', { isHost: data.isHost, hasGameState: !!data.gameState, settings: data.settings });
        this.gameState = data.gameState;
        this.isHost = data.isHost;
        
        // Använd serverns kortlekstem om det finns (värden bestämmer för alla)
        const serverTheme = data.settings?.deckTheme || data.gameState?.settings?.deckTheme;
        if (serverTheme) {
            this.settings.deckTheme = serverTheme;
            localStorage.setItem('deckTheme', serverTheme);
            const settingSelect = document.getElementById('setting-deck-theme');
            if (settingSelect) settingSelect.value = serverTheme;
            this.updateDeckToggle(serverTheme);
            // Dölj temaväljaren för icke-värdar i multiplayer-rum
            const isAIMode = new URLSearchParams(window.location.search).get('ai');
            if (!isAIMode && !this.isHost) {
                const deckThemeGroup = document.getElementById('setting-deck-theme')?.closest('.form-group');
                if (deckThemeGroup) deckThemeGroup.style.display = 'none';
                const deckToggle = document.getElementById('deck-toggle');
                if (deckToggle) deckToggle.style.display = 'none';
            }
        }
        
        // Uppdatera videorutans namn med spelarens riktiga namn från game state
        const me = this.gameState?.players?.find(p => p.isYou);
        if (me) {
            const localVideoLabel = document.getElementById('local-video-label');
            if (localVideoLabel) localVideoLabel.textContent = me.name;
            document.getElementById('my-name').textContent = me.name;
            
            const myAvatar = document.getElementById('my-avatar');
            if (myAvatar) myAvatar.src = me.avatar || '/assets/images/default-avatar.png';
            
            // Spara reconnectToken för framtida återanslutning
            if (data.reconnectToken || me.reconnectToken) {
                localStorage.setItem('reconnectToken', data.reconnectToken || me.reconnectToken);
            }
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
        
        // Göm game-over-modal om den är öppen (t.ex. vid omstart)
        const gameOverModal = document.getElementById('game-over-modal');
        if (gameOverModal) gameOverModal.classList.add('hidden');
        
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
        
        // Starta röst/videochatt automatiskt vid spelstart mot människor
        const hasHumanOpponent = this.gameState?.players?.some(p => !p.isYou && !p.isAI);
        if (hasHumanOpponent) {
            this.startVoiceChat();
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
        
        // Highlighta det kort som just dragits från bordet (fiskning)
        if (data.drawnCard) {
            this.highlightDrawnCard(data.drawnCard.id);
        }
        
        // Visa tydligt när par bildas (både vid fråga och fiske)
        if (data.newPairs && data.newPairs.length > 0) {
            const pairCount = data.newPairs.length;
            this.addLogEntry(
                `🃏 ${data.askerName} bildade ${pairCount} nytt ${pairCount === 1 ? 'par' : 'par'}!`,
                'success'
            );
            
            if (window.animationManager) {
                animationManager.animatePairCards(data.newPairs);
            }
        }
        
        const pairName = data.pairName || data.pairId;
        if (data.gotCards) {
            this.addLogEntry(
                `🎯 ${data.askerName} frågade ${data.targetName} om ${pairName} och fick kort!`,
                'success'
            );
        } else if (data.fishedSuccess) {
            this.addLogEntry(
                `🐟 ${data.askerName} fiskade upp rätt kort!`,
                'luck'
            );
        } else {
            this.addLogEntry(
                `🌊 ${data.askerName} frågade ${data.targetName} om ${pairName}... "Finns i sjön!"`,
                'fish'
            );
        }
        
        if (data.aiReasoning) {
            this.addLogEntry(`🤖 ${data.aiReasoning}`, 'system');
        }
    }

    highlightDrawnCard(cardId) {
        const container = document.getElementById('my-hand');
        if (!container) return;

        const cardEl = container.querySelector(`[data-card-id="${cardId}"]`);
        if (!cardEl) return;

        cardEl.classList.add('card-new-drawn');

        // Ta bort highlight efter animation
        setTimeout(() => {
            cardEl.classList.remove('card-new-drawn');
        }, 2500);
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
    
    handleReadyStatusUpdate(readyStatus) {
        const readyBtn = document.getElementById('ready-btn');
        const mobileReadyBtn = document.getElementById('mobile-ready-btn');
        const readyStatusEl = document.getElementById('ready-status');
        
        // Uppdatera knappens utseende baserat på egen status
        const me = readyStatus.find(p => p.id === this.gameState?.players?.find(pl => pl.isYou)?.id);
        if (me) {
            if (readyBtn) {
                readyBtn.classList.toggle('ready-active', me.ready);
                readyBtn.textContent = me.ready ? '✅ Redo!' : '👍 Redo';
            }
            if (mobileReadyBtn) {
                mobileReadyBtn.classList.toggle('ready-active', me.ready);
                mobileReadyBtn.textContent = me.ready ? '✅ Redo!' : '👍 Redo';
            }
        }
        
        // Uppdatera status-text för host
        if (readyStatusEl) {
            const readyCount = readyStatus.filter(p => p.ready).length;
            const totalCount = readyStatus.length;
            readyStatusEl.textContent = `Redo: ${readyCount}/${totalCount}`;
        }
        
        // Uppdatera motspelar-visning med ready-indikator
        if (this.gameState) {
            this.gameState.players.forEach(p => {
                const status = readyStatus.find(rs => rs.id === p.id);
                if (status) p.ready = status.ready;
            });
            this.renderOpponents(this.gameState.players);
        }
    }

    updateGameState(state) {
        this.gameState = state;
        this.renderGame();
    }

    renderGame() {
        if (!this.gameState) return;
        
        const state = this.gameState;
        
        // Synkronisera klientens tema med serverns faktiska tema så att
        // indikatorn alltid matchar de utdelade korten.
        const serverDeckTheme = state.settings?.deckTheme;
        if (serverDeckTheme && this.settings.deckTheme !== serverDeckTheme) {
            this.settings.deckTheme = serverDeckTheme;
            localStorage.setItem('deckTheme', serverDeckTheme);
            const settingSelect = document.getElementById('setting-deck-theme');
            if (settingSelect) settingSelect.value = serverDeckTheme;
        }
        
        document.getElementById('room-name').textContent = `Bord: ${state.roomId}`;
        document.getElementById('game-type').textContent = state.gameType || 'Standard';
        
        this.updateTurnIndicator(state);
        this.updateDeckToggle(this.settings.deckTheme);
        document.getElementById('deck-count').textContent = state.deckRemaining;
        
        this.renderOpponents(state.players);
        this.renderHand(state.yourHand, state.yourPairs);
        this.updateGameLog(state.gameLog);
        this.updateActionButtons(state);
        this.updateTurnFrame(state);
        this.updateMyTurnBadge(state);
        this.updateTutorialState();

        const me = state.players.find(p => p.isYou);
        if (me) {
            const myAvatar = document.getElementById('my-avatar');
            if (myAvatar) myAvatar.src = me.avatar || '/assets/images/default-avatar.png';
        }
    }

    updateTurnIndicator(state) {
        const turnText = document.getElementById('turn-text');
        const turnIndicator = document.getElementById('turn-indicator');
        const timerText = document.getElementById('timer-text');
        const timerProgress = document.getElementById('timer-progress');
        const startBtn = document.getElementById('start-game-btn');
        
        const currentPlayer = state.players.find(p => p.isCurrentPlayer);
        const currentPlayerId = currentPlayer?.id;
        
        const readyBtn = document.getElementById('ready-btn');
        const readyStatus = document.getElementById('ready-status');
        
        // Visa/dölj start-knapp för host när spelet väntar
        if (startBtn) {
            const canStart = this.isHost && state.state === 'waiting';
            console.log('🎮 updateTurnIndicator:', { isHost: this.isHost, state: state.state, canStart });
            startBtn.classList.toggle('hidden', !canStart);
        }
        
        // Mobil start-knapp (centrerad, utanför header)
        const mobileStartContainer = document.getElementById('mobile-start-container');
        if (mobileStartContainer) {
            const canStart = this.isHost && state.state === 'waiting';
            mobileStartContainer.classList.toggle('hidden', !canStart);
        }
        
        // Visa redo-knapp för icke-host, ready-status för host
        const mobileReadyContainer = document.getElementById('mobile-ready-container');
        if (state.state === 'waiting') {
            if (readyBtn) {
                const showReady = !this.isHost;
                readyBtn.classList.toggle('hidden', !showReady);
            }
            if (mobileReadyContainer) {
                const showReady = !this.isHost;
                mobileReadyContainer.classList.toggle('hidden', !showReady);
            }
            if (readyStatus) {
                const showStatus = this.isHost;
                readyStatus.classList.toggle('hidden', !showStatus);
            }
        } else {
            if (readyBtn) readyBtn.classList.add('hidden');
            if (mobileReadyContainer) mobileReadyContainer.classList.add('hidden');
            if (readyStatus) readyStatus.classList.add('hidden');
        }
        
        // Mobil FAB: pulsera när det är spelarens tur
        const mobileFab = document.getElementById('mobile-fab');
        
        if (state.state === 'waiting') {
            turnText.textContent = 'Väntar på fler spelare...';
            turnIndicator.classList.remove('active');
            timerText.textContent = '--';
            timerProgress.style.strokeDasharray = '0, 100';
            this.lastTurnSoundId = null;
            if (mobileFab) mobileFab.classList.remove('pulse');
        } else if (state.state === 'playing') {
            if (currentPlayer?.isYou) {
                turnText.textContent = 'Din tur! 🐟';
                turnIndicator.classList.add('active');
                
                if (window.animationManager) {
                    animationManager.animateTurnChange(true);
                }
                
                // Spela tur-ljud endast en gång per tur (inte vid varje state-update)
                if (window.audioManager && this.lastTurnSoundId !== currentPlayerId) {
                    this.lastTurnSoundId = currentPlayerId;
                    audioManager.playTurnStart();
                }
                
                if (mobileFab) mobileFab.classList.add('pulse');
            } else {
                turnText.textContent = `${currentPlayer?.name || 'Någon'}s tur...`;
                turnIndicator.classList.remove('active');
                this.lastTurnSoundId = null;
                
                if (window.animationManager) {
                    animationManager.animateTurnChange(false);
                }
                
                if (mobileFab) mobileFab.classList.remove('pulse');
            }
            
            if (state.turnTimeRemaining !== null) {
                const remaining = Math.ceil(state.turnTimeRemaining / 1000);
                timerText.textContent = remaining;
                const percentage = (state.turnTimeRemaining / 180000) * 100;
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
            if (mobileFab) mobileFab.classList.remove('pulse');
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
                
                el.classList.toggle('ready', !!p.ready);
                el.innerHTML = `
                    <div class="opponent-video" data-opponent-video="${p.socketId || p.id}"></div>
                    <img src="${p.avatar || '/assets/images/default-avatar.png'}" class="opponent-avatar" alt="${p.name}">
                    <div class="opponent-name">
                        ${p.name}
                        ${p.isAI ? `<span class="ai-badge">AI ${p.aiDifficulty}</span>` : ''}
                        ${p.surrendered ? '<span class="surrender-badge">🏳️ Gav upp</span>' : ''}
                        ${p.ready ? '<span class="ready-badge">✅</span>' : ''}
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
            el.classList.toggle('ready', !!p.ready);
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
                const readyBadge = p.ready ? '<span class="ready-badge">✅</span>' : '';
                const newNameHtml = `${p.name} ${aiBadge} ${surrenderBadge} ${readyBadge}`;
                if (nameEl.innerHTML.trim() !== newNameHtml.trim()) {
                    nameEl.innerHTML = newNameHtml;
                }
            }
            
            // Kort-baksidor (om antalet ändrats eller temat ändrats)
            const cardsEl = el.querySelector('.opponent-cards');
            const currentBackTheme = cardsEl?.dataset.deckTheme || '';
            if (cardsEl && (cardsEl.children.length !== p.cardCount || currentBackTheme !== deckBackClass)) {
                cardsEl.dataset.deckTheme = deckBackClass;
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
        hand = hand || [];
        pairs = pairs || [];
        const missingImage = hand.filter(c => !c.image).length;
        console.log('🃏 renderHand called:', {
            handLength: hand.length,
            deckTheme: this.settings.deckTheme,
            useImageDeck: this.settings.deckTheme !== 'standard',
            pairsLength: pairs.length,
            missingImage
        });
        const container = document.getElementById('my-hand');

        let sortedHand = [...hand];

        if (this.settings.autoSort) {
            sortedHand.sort((a, b) => {
                const byPairId = String(a.pairId).localeCompare(String(b.pairId));
                if (byPairId !== 0) return byPairId;
                return String(a.name || '').localeCompare(String(b.name || ''));
            });
        }

        const cardStyleClass = `card-style-${this.settings.cardStyle}`;
        const deckTheme = this.settings.deckTheme;
        const useImageDeck = deckTheme !== 'standard';

        // Anpassa handens kompakthet efter antal kort på små skärmar
        container.classList.toggle('hand-compact', sortedHand.length >= 8);
        container.classList.toggle('hand-tight', sortedHand.length >= 12);

        // Diffa mot befintliga kort för att slippa förstöra och återskapa DOM:en
        const existingCards = new Map();
        container.querySelectorAll('.card[data-card-id]').forEach(el => {
            existingCards.set(el.dataset.cardId, el);
        });

        const newCardIds = new Set(sortedHand.map(c => c.id));
        const fragment = document.createDocumentFragment();

        sortedHand.forEach((card, index) => {
            const rotation = (index - sortedHand.length / 2) * 3;
            const translateY = Math.abs(index - sortedHand.length / 2) * -2;
            const transformStyle = `rotate(${rotation}deg) translateY(${translateY}px)`;

            let cardEl = existingCards.get(card.id);
            const themeChanged = cardEl && cardEl.dataset.deckTheme !== deckTheme;
            const isNew = !cardEl || themeChanged;

            if (themeChanged) {
                cardEl.remove();
                cardEl = null;
            }

            if (isNew) {
                cardEl = document.createElement('div');
                cardEl.className = `card ${cardStyleClass}`;
                cardEl.dataset.cardId = card.id;
                cardEl.dataset.deckTheme = deckTheme;
                cardEl.dataset.pairId = card.pairId;

                if (useImageDeck && card.image) {
                    cardEl.classList.add('card-deck-image');
                    const img = document.createElement('img');
                    img.src = card.image;
                    img.alt = card.name || card.pairId;
                    img.dataset.fbName = card.name || card.pairId;
                    img.addEventListener(
                        'error',
                        function onCardImgError() {
                            this.style.display = 'none';
                            const parent = this.parentElement;
                            parent.classList.remove('card-deck-image');
                            parent.classList.add('pair-fallback');
                            parent.dataset.imageFailed = 'true';
                            parent.innerHTML = `<span class="pair-name">${this.dataset.fbName}</span>`;
                        },
                        { once: true }
                    );
                    cardEl.appendChild(img);
                    const nameEl = document.createElement('span');
                    nameEl.className = 'pair-name';
                    nameEl.textContent = card.name || card.pairId;
                    cardEl.appendChild(nameEl);
                } else if (deckTheme === 'standard' && card.suit && card.suitSymbol) {
                    cardEl.classList.add(card.suitColor || 'black');
                    cardEl.innerHTML = `
                        <span class="rank-top">${card.name || ''}</span>
                        <span class="suit">${card.suitSymbol}</span>
                        <span class="rank-bottom">${card.name || ''}</span>
                    `;
                } else {
                    cardEl.classList.add('pair-fallback');
                    cardEl.innerHTML = `<span class="pair-name">${card.name || card.pairId}</span>`;
                }
            }

            // Uppdatera alltid transform och stil så ordningen blir rätt
            cardEl.style.transform = transformStyle;
            const imageFailed = cardEl.dataset.imageFailed === 'true';
            const hasCardImage = useImageDeck && card.image && !imageFailed;
            const isSelectedAsk = cardEl.dataset.cardId === this.selectedAskCardId;
            const isStandardCard = deckTheme === 'standard' && card.suit && card.suitSymbol;
            const suitColorClass = isStandardCard ? ` ${card.suitColor || 'black'}` : '';
            const cardTypeClass = hasCardImage ? ' card-deck-image' : isStandardCard ? '' : ' pair-fallback';
            cardEl.className = `card ${cardStyleClass}${cardTypeClass}${suitColorClass}${isSelectedAsk ? ' selected-ask-card' : ''}`;
            cardEl.dataset.deckTheme = deckTheme;
            cardEl.dataset.pairId = card.pairId;

            fragment.appendChild(cardEl);
        });

        // Ta bort kort som inte längre finns i handen
        existingCards.forEach((el, cardId) => {
            if (!newCardIds.has(cardId)) {
                el.remove();
            }
        });

        container.appendChild(fragment);

        requestAnimationFrame(() => {
            container.classList.toggle('scrollable', container.scrollWidth > container.clientWidth);
        });

        document.getElementById('my-pairs').textContent = pairs.length;
        const mobilePairsCount = document.getElementById('mobile-pairs-count');
        if (mobilePairsCount) mobilePairsCount.textContent = pairs.length;

        const me = this.gameState?.players.find(p => p.isYou);
        if (me) {
            const totalAsks = me.successfulAsks + me.failedAsks;
            const rate = totalAsks > 0 ? Math.round((me.successfulAsks / totalAsks) * 100) : 0;
            document.getElementById('my-success-rate').textContent = `${rate}%`;
        }

        if (window.animationManager) {
            const newCards = container.querySelectorAll('.card:not([data-animated])');
            newCards.forEach(card => {
                card.setAttribute('data-animated', 'true');
                animationManager.animateCardReceive(card);
            });
        }

        // Om det finns en aktiv card request, highlighta matchande kort
        if (this.pendingCardRequest) {
            const requestedPairId = this.pendingCardRequest.pairId;
            const cards = container.querySelectorAll('.card');
            const matchingCards = [];

            cards.forEach(cardEl => {
                const cardId = cardEl.dataset.cardId;
                const cardData = hand.find(c => c.id === cardId);
                if (cardData && cardData.pairId === requestedPairId) {
                    cardEl.classList.add('card-request-highlight');
                    matchingCards.push(cardEl);
                } else {
                    cardEl.classList.remove('card-request-highlight');
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
        
        // Synka till mobil bottom sheet logg-flik
        const mobileLogContainer = document.getElementById('mobile-log-messages');
        if (mobileLogContainer) {
            const mobileLogDiv = document.createElement('div');
            mobileLogDiv.className = `log-entry ${type}`;
            mobileLogDiv.textContent = message;
            mobileLogContainer.appendChild(mobileLogDiv);
            mobileLogContainer.scrollTop = mobileLogContainer.scrollHeight;
        }
    }

    updateActionButtons(state) {
        const askBtn = document.getElementById('ask-btn');
        const waitingMsg = document.getElementById('waiting-message');
        const surrenderBtn = document.getElementById('surrender-btn');
        const mobileFab = document.getElementById('mobile-fab');
        
        if (this.isSpectator) {
            askBtn.classList.add('hidden');
            waitingMsg.classList.add('hidden');
            surrenderBtn.classList.add('hidden');
            if (mobileFab) mobileFab.classList.add('hidden');
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
        
        // Uppdatera mobil parnings-badge och action-bar center
        const mobilePairs = document.getElementById('mobile-pairs');
        const mobilePairsDisplay = document.getElementById('mobile-pairs-display');
        const myPairs = state.yourPairs?.length || 0;
        
        if (mobilePairs) {
            if (state.state === 'playing') {
                mobilePairs.classList.remove('hidden');
            } else {
                mobilePairs.classList.add('hidden');
            }
        }
        
        if (mobilePairsDisplay) {
            mobilePairsDisplay.innerHTML = `🏆 <strong>${myPairs}</strong> par`;
        }
        
        // Fråga-knappen och FAB används inte längre; frågor sker via direktval
        askBtn.classList.add('hidden');
        if (mobileFab) mobileFab.classList.add('hidden');

        const hasPendingAsk = this.pendingCardRequest !== null || document.getElementById('ask-pending-banner')?.classList.contains('hidden') === false;
        const canAsk = state.state === 'playing' && currentPlayer?.isYou && myHand.length > 0 && !iSurrendered && !hasPendingAsk;

        if (canAsk) {
            waitingMsg.classList.add('hidden');
        } else {
            waitingMsg.classList.remove('hidden');
        }
    }

    showAskDialog() {
        if (!this.gameState || this.isSpectator) return;

        const dialog = document.getElementById('ask-dialog');
        const targetContainer = document.getElementById('target-players');
        const pairContainer = document.getElementById('rank-selector');

        const targets = this.gameState.players.filter(p => !p.isYou && p.connected && !p.surrendered);

        targetContainer.innerHTML = targets.map(p => `
            <button class="target-player-btn" data-player-id="${p.id}">
                <img src="${p.avatar || '/assets/images/default-avatar.png'}" class="tp-avatar" alt="${p.name}">
                <span class="tp-name">${p.name}</span>
                <span class="tp-cards">${p.cardCount} kort</span>
            </button>
        `).join('');

        // Samla unika par från handen
        const pairMap = new Map();
        this.gameState.yourHand.forEach(c => {
            if (!pairMap.has(c.pairId)) {
                pairMap.set(c.pairId, c);
            }
        });
        const pairs = Array.from(pairMap.values()).sort((a, b) =>
            String(a.pairId).localeCompare(String(b.pairId))
        );

        const deckTheme = this.settings.deckTheme;
        const useImageDeck = deckTheme !== 'standard';

        pairContainer.innerHTML = pairs.map(pair => {
            const pairName = pair.name || pair.pairId;

            if (useImageDeck && pair.image) {
                return `
                    <button class="rank-btn pair-btn pair-btn-image" data-pair-id="${pair.pairId}" data-pair-name="${pairName}"
                        style="background: transparent; border: none; box-shadow: none; padding: 0;">
                        <img src="${pair.image}" alt="${pairName}"
                             style="width: 50px; height: 70px; object-fit: cover; border-radius: var(--radius-md); display: block; box-shadow: 1px 1px 6px rgba(0,0,0,0.3);"
                             data-fb-name="${pairName}">
                        <span class="pair-btn-label">${pairName}</span>
                    </button>
                `;
            }

            return `
                <button class="rank-btn pair-btn" data-pair-id="${pair.pairId}" data-pair-name="${pairName}">
                    <span class="pair-btn-label">${pairName}</span>
                </button>
            `;
        }).join('');

        // Fallback för bildfel i par-väljaren
        pairContainer.querySelectorAll('.pair-btn-image img').forEach(img => {
            img.addEventListener('error', function onPairImgError() {
                this.style.display = 'none';
                const parent = this.parentElement;
                parent.style.background = 'linear-gradient(135deg, #ffffff, #f1f5f9)';
                parent.style.border = '2px solid var(--border-color)';
                parent.style.boxShadow = '1px 1px 6px rgba(0,0,0,0.3)';
                parent.innerHTML = `<span class="pair-btn-label">${this.dataset.fbName}</span>`;
                this.removeEventListener('error', onPairImgError);
            }, { once: true });
        });

        targetContainer.querySelectorAll('.target-player-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                targetContainer.querySelectorAll('.target-player-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedTarget = btn.dataset.playerId;
                this.updateConfirmButton();
            });
        });

        pairContainer.querySelectorAll('.pair-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                pairContainer.querySelectorAll('.pair-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedPairId = btn.dataset.pairId;
                this.updateConfirmButton();
            });
        });

        this.selectedTarget = null;
        this.selectedPairId = null;
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
        this.selectedPairId = null;
    }

    updateConfirmButton() {
        const btn = document.getElementById('confirm-ask');
        const confidenceSpan = document.getElementById('ask-confidence');
        btn.disabled = !(this.selectedTarget && this.selectedPairId);

        if (this.selectedTarget && this.selectedPairId) {
            const target = this.gameState.players.find(p => p.id === this.selectedTarget);
            const targetAsked = target?.pairHistory?.filter(p => p === this.selectedPairId).length || 0;
            const confidence = Math.min(30 + targetAsked * 20, 95);
            confidenceSpan.textContent = confidence > 50 ? `(~${confidence}% chans)` : '';
        } else {
            confidenceSpan.textContent = '';
        }
    }

    confirmAsk() {
        if (!this.selectedTarget || !this.selectedPairId) return;

        gameSocket.emit('ask_cards', {
            targetId: this.selectedTarget,
            pairId: this.selectedPairId
        });

        this.hideAskDialog();
    }

    showAskPending(targetName, pairId, pairName) {
        const banner = document.getElementById('ask-pending-banner');
        const text = banner.querySelector('.ask-pending-text');
        const name = pairName || pairId;

        text.textContent = `Du frågade ${targetName} om ${name}. Väntar på svar...`;
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

    showCardRequest(askerName, pairId, pairName) {
        this.pendingCardRequest = { askerName, pairId, pairName };

        const overlay = document.getElementById('card-request-overlay');
        const title = document.getElementById('card-request-title');
        const subtitle = document.getElementById('card-request-subtitle');
        const fiskBtn = document.getElementById('card-request-fisk');
        const name = pairName || pairId;

        title.textContent = `${askerName} frågar efter ${name}!`;

        // Kolla om vi har kortet
        const hasCard = this.gameState?.yourHand?.some(c => c.pairId === pairId);
        const giveBtn = document.getElementById('card-request-give');

        if (hasCard) {
            subtitle.textContent = 'Du har det kortet! Klicka för att ge det.';
            if (giveBtn) giveBtn.classList.remove('hidden');
            fiskBtn.classList.add('hidden');
        } else {
            subtitle.textContent = 'Du har inte det kortet.';
            if (giveBtn) giveBtn.classList.add('hidden');
            fiskBtn.classList.remove('hidden');
        }

        overlay.classList.remove('hidden');

        // Re-rendera handen för att få fram highlight
        if (this.gameState) {
            this.renderHand(this.gameState.yourHand, this.gameState.yourPairs);
        }

        // Knapphanterare registreras en gång i setupUI via event delegation

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

    respondToAskClick(hasCard, pairId) {
        if (!this.pendingCardRequest) return;

        gameSocket.emit('respond_to_ask', {
            hasCard: hasCard,
            pairId: pairId
        });

        this.hideCardRequest();
    }

    handleHandCardClick(cardEl) {
        if (this.isSpectator) return;
        if (!this.gameState || this.gameState.state !== 'playing') return;

        const currentPlayer = this.gameState.players.find(p => p.isCurrentPlayer);
        if (!currentPlayer?.isYou) {
            this.showToast('Det är inte din tur', 'info');
            return;
        }

        const cardId = cardEl.dataset.cardId;
        const pairId = cardEl.dataset.pairId;

        // Avmarkera om samma kort klickas igen
        if (this.selectedAskCardId === cardId) {
            this.clearAskSelection();
            return;
        }

        this.selectedAskCardId = cardId;
        this.selectedAskPairId = pairId;
        this.updateAskSelectionUI();

        // Om en motståndare redan är vald, skicka frågan direkt
        if (this.selectedAskTargetId) {
            this.sendAskRequest();
        }
    }

    handleOpponentClick(opponentEl) {
        if (this.isSpectator) return;
        if (!this.gameState || this.gameState.state !== 'playing') return;

        const currentPlayer = this.gameState.players.find(p => p.isCurrentPlayer);
        if (!currentPlayer?.isYou) {
            this.showToast('Det är inte din tur', 'info');
            return;
        }

        const playerId = opponentEl.dataset.playerId;
        const player = this.gameState.players.find(p => p.id === playerId);

        if (!player || player.isYou || player.surrendered || !player.connected) return;

        // Avmarkera om samma motståndare klickas igen
        if (this.selectedAskTargetId === playerId) {
            this.selectedAskTargetId = null;
            this.updateAskSelectionUI();
            return;
        }

        this.selectedAskTargetId = playerId;
        this.updateAskSelectionUI();

        // Om ett kort redan är valt, skicka frågan direkt
        if (this.selectedAskCardId && this.selectedAskPairId) {
            this.sendAskRequest();
        }
    }

    sendAskRequest() {
        if (!this.selectedAskTargetId || !this.selectedAskPairId) return;

        gameSocket.emit('ask_cards', {
            targetId: this.selectedAskTargetId,
            pairId: this.selectedAskPairId
        });

        this.clearAskSelection();
    }

    clearAskSelection() {
        this.selectedAskCardId = null;
        this.selectedAskPairId = null;
        this.selectedAskTargetId = null;
        this.updateAskSelectionUI();
    }

    updateAskSelectionUI() {
        const handContainer = document.getElementById('my-hand');
        if (handContainer) {
            handContainer.querySelectorAll('.card').forEach(el => {
                el.classList.toggle('selected-ask-card', el.dataset.cardId === this.selectedAskCardId);
            });
        }

        const opponentsContainer = document.getElementById('opponents-area');
        if (opponentsContainer) {
            opponentsContainer.querySelectorAll('.opponent').forEach(el => {
                el.classList.toggle('selected-ask-target', el.dataset.playerId === this.selectedAskTargetId);
            });
        }
    }

    updateTurnFrame(state) {
        const isYourTurn = state.state === 'playing' && state.players.find(p => p.isCurrentPlayer)?.isYou;
        document.body.classList.toggle('my-turn-active', !!isYourTurn);

        // Rensa pågående ask-val om det inte längre är spelarens tur
        if (!isYourTurn && (this.selectedAskCardId || this.selectedAskTargetId)) {
            this.clearAskSelection();
        }
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
        
        // Synka till mobil bottom sheet chatt-flik
        const mobileChatContainer = document.getElementById('mobile-chat-messages');
        if (mobileChatContainer) {
            const mobileDiv = document.createElement('div');
            mobileDiv.className = `log-entry chat ${msg.isSystem ? 'system' : ''}`;
            mobileDiv.innerHTML = msg.isSystem
                ? `<span class="msg-text">${this.escapeHtml(msg.message)}</span>`
                : `<span class="chat-sender">${this.escapeHtml(msg.player)}</span>${this.escapeHtml(msg.message)}`;
            mobileChatContainer.appendChild(mobileDiv);
            mobileChatContainer.scrollTop = mobileChatContainer.scrollHeight;
        }
        
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
            if (subtitle) subtitle.textContent = 'Du är mästaren av FISK!';
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

    showRules() {
        document.getElementById('rules-modal').classList.remove('hidden');
    }

    hideRules() {
        document.getElementById('rules-modal').classList.add('hidden');
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

    setOfflineBanner(state) {
        const banner = document.getElementById('offline-banner');
        if (!banner) return;

        banner.classList.remove('offline-reconnecting', 'offline-connected');

        if (state === 'connected') {
            banner.classList.add('offline-connected');
            banner.querySelector('.offline-text').textContent = 'Anslutning återupprättad';
            banner.classList.remove('hidden');
            setTimeout(() => banner.classList.add('hidden'), 2000);
        } else if (state === 'reconnecting') {
            banner.classList.add('offline-reconnecting');
            banner.querySelector('.offline-text').textContent = 'Anslutning förlorad – återansluter…';
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
    }

    showKickModal() {
        const modal = document.getElementById('kick-modal');
        const list = document.getElementById('kick-player-list');
        list.innerHTML = '';

        const humanOpponents = this.gameState?.players?.filter(p => !p.isYou && !p.isAI) || [];
        if (humanOpponents.length === 0) {
            list.innerHTML = '<p class="text-muted">Inga mänskliga spelare att kicka.</p>';
        } else {
            humanOpponents.forEach(player => {
                const item = document.createElement('div');
                item.className = 'kick-player-item';
                item.innerHTML = `<span class="player-name">${this.escapeHtml(player.name)}</span>`;

                const kickBtn = document.createElement('button');
                kickBtn.className = 'btn-kick';
                kickBtn.textContent = 'Kicka';
                kickBtn.addEventListener('click', () => {
                    gameSocket.emit('kick_player', { targetSocketId: player.socketId || player.id });
                    this.closeModal(modal);
                });

                item.appendChild(kickBtn);
                list.appendChild(item);
            });
        }

        this.openModal(modal);
    }

    getFocusableElements(modal) {
        return Array.from(
            modal.querySelectorAll(
                'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'
            )
        ).filter(el => el.offsetParent !== null);
    }

    trapFocus(modal) {
        return e => {
            if (e.key !== 'Tab') return;
            const focusable = this.getFocusableElements(modal);
            if (focusable.length === 0) {
                e.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
    }

    openModal(modal) {
        if (!modal) return;
        this.lastFocusedElement = document.activeElement;
        modal.classList.remove('hidden');

        const focusable = this.getFocusableElements(modal);
        const title = modal.querySelector('[id$="-modal-title"]');
        if (focusable.length > 0) {
            focusable[0].focus();
        } else if (title) {
            title.setAttribute('tabindex', '-1');
            title.focus();
        }

        modal.focusHandler = this.trapFocus(modal);
        modal.keyHandler = e => {
            if (e.key === 'Escape') {
                modal.classList.add('hidden');
                this.closeModal(modal);
            }
        };

        modal.addEventListener('keydown', modal.focusHandler);
        document.addEventListener('keydown', modal.keyHandler);
    }

    closeModal(modal) {
        if (!modal) return;
        modal.classList.add('hidden');
        if (modal.focusHandler) {
            modal.removeEventListener('keydown', modal.focusHandler);
            modal.focusHandler = null;
        }
        if (modal.keyHandler) {
            document.removeEventListener('keydown', modal.keyHandler);
            modal.keyHandler = null;
        }
        if (this.lastFocusedElement) {
            this.lastFocusedElement.focus();
            this.lastFocusedElement = null;
        }
    }

    showModal(title, message, buttonText = 'OK', onClose = null) {
        const modal = document.getElementById('alert-modal');
        document.getElementById('alert-modal-title').textContent = title;
        document.getElementById('alert-modal-message').textContent = message;
        const btn = document.getElementById('alert-modal-btn');
        btn.textContent = buttonText;

        const closeHandler = () => {
            this.closeModal(modal);
            if (onClose) onClose();
        };
        btn.addEventListener('click', closeHandler, { once: true });
        modal.querySelector('.modal-overlay').addEventListener('click', closeHandler, { once: true });

        this.openModal(modal);
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
