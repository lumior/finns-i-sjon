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
        this.lastDrawnCardId = null;
        
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
        this.wasMobileFabHidden = true;
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
                this.availableThemes = data.themes;
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

        deckToggle.textContent = themeId === 'standard' ? '🥗' : '🎴';
        deckToggle.title = `Aktivt: ${theme ? theme.name : themeId}. Klicka för ${nextTheme ? nextTheme.name : 'nästa'}`;
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
        
        gameSocket.on('game_state_update', (state) => {
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
            if (settings.deckTheme) {
                this.settings.deckTheme = settings.deckTheme;
                localStorage.setItem('deckTheme', settings.deckTheme);
                const settingSelect = document.getElementById('setting-deck-theme');
                if (settingSelect) settingSelect.value = settings.deckTheme;
                this.updateDeckToggle(settings.deckTheme);
                this.renderHand(this.gameState?.yourHand, this.gameState?.yourPairs);
                this.renderOpponents(this.gameState?.players || []);
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
            const isAIMode = new URLSearchParams(window.location.search).get('ai');
            const currentIndex = this.availableThemes.findIndex(t => t.id === this.settings.deckTheme);
            const nextIndex = (currentIndex + 1) % this.availableThemes.length;
            const newTheme = this.availableThemes[nextIndex].id;
            
            // I multiplayer-rum: värden skickar till server så alla får samma tema
            if (!isAIMode && this.isHost) {
                gameSocket.emit('update_settings', { deckTheme: newTheme });
                return;
            }
            
            // I AI-läge eller om man inte är värd: ändra lokalt
            this.settings.deckTheme = newTheme;
            localStorage.setItem('deckTheme', newTheme);
            document.getElementById('setting-deck-theme').value = newTheme;
            this.updateDeckToggle(newTheme);
            this.renderHand(this.gameState?.yourHand, this.gameState?.yourPairs);
            this.renderOpponents(this.gameState?.players || []);
        });
        
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
        
        // Event delegation för kort-klick vid pending card request
        const handContainer = document.getElementById('player-hand');
        if (handContainer) {
            handContainer.addEventListener('click', (e) => {
                const cardEl = e.target.closest('.card');
                if (!cardEl || !this.pendingCardRequest) return;
                if (cardEl.classList.contains('card-request-highlight')) {
                    this.respondToAskClick(true, this.pendingCardRequest.rank);
                }
            });
        }
        
        // Card request-knappar (registreras en gång, använder pendingCardRequest-state)
        const giveBtn = document.getElementById('card-request-give');
        if (giveBtn) {
            giveBtn.addEventListener('click', () => {
                if (this.pendingCardRequest) {
                    this.respondToAskClick(true, this.pendingCardRequest.rank);
                }
            });
        }
        const fiskBtnEl = document.getElementById('card-request-fisk');
        if (fiskBtnEl) {
            fiskBtnEl.addEventListener('click', () => {
                if (this.pendingCardRequest) {
                    this.respondToAskClick(false, this.pendingCardRequest.rank);
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
        
        if (data.gotCards) {
            this.addLogEntry(
                `🎯 ${data.askerName} frågade ${data.targetName} om ${data.rank}:an och fick kort!`,
                'success'
            );
        } else if (data.fishedSuccess) {
            this.addLogEntry(
                `🐟 ${data.askerName} fiskade upp rätt kort!`,
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
        
        document.getElementById('room-name').textContent = `Bord: ${state.roomId}`;
        document.getElementById('game-type').textContent = state.gameType || 'Standard';
        
        this.updateTurnIndicator(state);
        document.getElementById('deck-count').textContent = state.deckRemaining;
        
        this.renderOpponents(state.players);
        this.renderHand(state.yourHand, state.yourPairs);
        this.updateGameLog(state.gameLog);
        this.updateActionButtons(state);
        
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
        hand = hand || [];
        pairs = pairs || [];
        console.log('🃏 renderHand called:', { handLength: hand.length, deckTheme: this.settings.deckTheme, useImageDeck: this.settings.deckTheme !== 'standard', pairsLength: pairs.length });
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
                const isRedCard = card.suit === 'hearts' || card.suit === 'diamonds';
                return `
                    <div class="card card-deck-image ${cardStyleClass}"
                         data-card-id="${card.id}"
                         style="${transformStyle}">
                        <img src="/assets/cards/${deckTheme}/${veggie}/${card.rank}.png"
                             alt="${card.rank}"
                             data-fb-rank="${card.rank}"
                             data-fb-suit="${suits[card.suit]}"
                             data-fb-red="${isRedCard}">
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
        
        // Sätt upp fallback-lyssnare för kortbilder (utan inline onerror)
        container.querySelectorAll('.card-deck-image img').forEach(img => {
            img.addEventListener('error', function onCardImgError() {
                this.style.display = 'none';
                const parent = this.parentElement;
                parent.classList.remove('card-deck-image');
                const isRed = this.dataset.fbRed === 'true';
                parent.classList.add(isRed ? 'red' : 'black');
                parent.innerHTML = `<span class='rank-top'>${this.dataset.fbRank}</span><span class='suit'>${this.dataset.fbSuit}</span><span class='rank-bottom'>${this.dataset.fbRank}</span>`;
                this.removeEventListener('error', onCardImgError);
            }, { once: true });
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
        
        // Dölj Fråga-knappen och FAB om det finns en pending ask (väntar på svar)
        const hasPendingAsk = this.pendingCardRequest !== null || document.getElementById('ask-pending-banner')?.classList.contains('hidden') === false;
        const canAsk = state.state === 'playing' && currentPlayer?.isYou && myHand.length > 0 && !iSurrendered && !hasPendingAsk;
        
        if (canAsk) {
            askBtn.classList.remove('hidden');
            waitingMsg.classList.add('hidden');
            if (mobileFab) {
                const wasHidden = mobileFab.classList.contains('hidden');
                mobileFab.classList.remove('hidden');
                if (wasHidden && this.wasMobileFabHidden && window.audioManager) {
                    audioManager.playAlert();
                }
                this.wasMobileFabHidden = false;
            }

            if (window.animationManager) {
                animationManager.pulse(askBtn, 2000);
            }
        } else {
            askBtn.classList.add('hidden');
            waitingMsg.classList.remove('hidden');
            if (mobileFab) {
                mobileFab.classList.add('hidden');
                this.wasMobileFabHidden = true;
            }
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
        
        const deckTheme = this.settings.deckTheme;
        const useImageDeck = deckTheme !== 'standard';

        rankContainer.innerHTML = availableRanks.map(r => {
            const example = rankExamples[r];
            const isRed = example.suit === 'hearts' || example.suit === 'diamonds';
            
            if (useImageDeck) {
                const veggie = suitToVeggie[example.suit];
                return `
                    <button class="rank-btn rank-btn-image" data-rank="${r}"
                        style="background: transparent; border: none; box-shadow: none; padding: 0;">
                        <img src="/assets/cards/${deckTheme}/${veggie}/${r}.png" alt="${r}"
                             style="width: 50px; height: 70px; object-fit: cover; border-radius: var(--radius-md); display: block; box-shadow: 1px 1px 6px rgba(0,0,0,0.3);"
                             data-fb-rank="${r}"
                             data-fb-suit="${suits[example.suit]}"
                             data-fb-red="${isRed}">
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
        
        // Sätt upp fallback-lyssnare för rank-knapparnas bilder
        rankContainer.querySelectorAll('.rank-btn-image img').forEach(img => {
            img.addEventListener('error', function onRankImgError() {
                this.style.display = 'none';
                const parent = this.parentElement;
                parent.style.background = 'linear-gradient(135deg, #ffffff, #f1f5f9)';
                parent.style.border = '2px solid var(--border-color)';
                parent.style.boxShadow = '1px 1px 6px rgba(0,0,0,0.3)';
                const isRed = this.dataset.fbRed === 'true';
                parent.classList.add(isRed ? 'red' : 'black');
                parent.innerHTML = `<span class='rc-rank-top'>${this.dataset.fbRank}</span><span class='rc-suit'>${this.dataset.fbSuit}</span><span class='rc-rank-bottom'>${this.dataset.fbRank}</span>`;
                this.removeEventListener('error', onRankImgError);
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
