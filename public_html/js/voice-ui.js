/**
 * Voice Chat UI – Visuell kontrollpanel för röstkommunikation
 */

class VoiceChatUI {
    constructor(voiceChatManager) {
        this.voiceChat = voiceChatManager;
        this.container = null;
        this.isVisible = false;
    }

    /**
     * Skapa och injectera UI
     */
    createUI() {
        // Huvudcontainer
        this.container = document.createElement('div');
        this.container.id = 'voice-chat-panel';
        this.container.className = 'voice-chat-panel';
        this.container.innerHTML = `
            <div class="voice-header">
                <span class="voice-title">🎙️ Röstchatt</span>
                <button class="voice-toggle" id="voice-toggle-btn">▲</button>
            </div>
            
            <div class="voice-body">
                <div class="voice-controls">
                    <button id="voice-mute-btn" class="voice-btn voice-mute">
                        🎤 <span>On</span>
                    </button>
                    <button id="voice-ptt-btn" class="voice-btn voice-ptt">
                        🗣️ <span>PTT Av</span>
                    </button>
                    <div class="voice-volume">
                        <label>Volym</label>
                        <input type="range" id="voice-volume-slider" min="0" max="100" value="100">
                    </div>
                </div>
                
                <div class="voice-peers" id="voice-peers-list">
                    <!-- Dynamiskt fylld med peers -->
                </div>
                
                <div class="voice-status" id="voice-status">
                    Inte ansluten
                </div>
            </div>
        `;
        
        document.body.appendChild(this.container);
        
        this.setupEventListeners();
        this.updatePeersList();
    }

    setupEventListeners() {
        // Toggle panel
        document.getElementById('voice-toggle-btn').addEventListener('click', () => {
            this.container.classList.toggle('collapsed');
        });

        // Mute-knapp
        document.getElementById('voice-mute-btn').addEventListener('click', () => {
            const isMuted = this.voiceChat.toggleMute();
            const btn = document.getElementById('voice-mute-btn');
            
            if (isMuted) {
                btn.innerHTML = '🚫 <span>Off</span>';
                btn.classList.add('muted');
            } else {
                btn.innerHTML = '🎤 <span>On</span>';
                btn.classList.remove('muted');
            }
        });

        // Push-to-talk
        const pttBtn = document.getElementById('voice-ptt-btn');
        
        pttBtn.addEventListener('mousedown', () => {
            this.voiceChat.setPushToTalk(true);
            this.voiceChat.startTalking();
            pttBtn.classList.add('active');
        });
        
        pttBtn.addEventListener('mouseup', () => {
            this.voiceChat.stopTalking();
            pttBtn.classList.remove('active');
        });
        
        // Touch support
        pttBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.voiceChat.setPushToTalk(true);
            this.voiceChat.startTalking();
            pttBtn.classList.add('active');
        });
        
        pttBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.voiceChat.stopTalking();
            pttBtn.classList.remove('active');
        });

        // Volym
        document.getElementById('voice-volume-slider').addEventListener('input', (e) => {
            this.voiceChat.setOutputVolume(e.target.value / 100);
        });

        // Lyssna på talking state changes
        this.voiceChat.onTalkingStateChange = (peerId, isTalking) => {
            this.updatePeerTalkingState(peerId, isTalking);
        };
    }

    /**
     * Uppdatera lista med peers
     */
    updatePeersList() {
        const container = document.getElementById('voice-peers-list');
        const peers = this.voiceChat.peerConnections.keys();
        
        container.innerHTML = Array.from(peers).map(peerId => `
            <div class="voice-peer" data-peer-id="${peerId}">
                <div class="peer-avatar">👤</div>
                <div class="peer-info">
                    <span class="peer-name">Spelare</span>
                    <div class="peer-waveform">
                        <div class="waveform-bar"></div>
                        <div class="waveform-bar"></div>
                        <div class="waveform-bar"></div>
                        <div class="waveform-bar"></div>
                    </div>
                </div>
                <div class="peer-status">🔇</div>
            </div>
        `).join('');
    }

    /**
     * Uppdatera visuell indikator när någon pratar
     */
    updatePeerTalkingState(peerId, isTalking) {
        const peerEl = document.querySelector(`[data-peer-id="${peerId}"]`);
        if (!peerEl) return;
        
        peerEl.classList.toggle('talking', isTalking);
        
        const status = peerEl.querySelector('.peer-status');
        status.textContent = isTalking ? '🔊' : '🔇';
        
        // Animate waveform bars
        const bars = peerEl.querySelectorAll('.waveform-bar');
        bars.forEach((bar, i) => {
            bar.style.animation = isTalking 
                ? `waveform ${0.3 + i * 0.1}s ease-in-out infinite alternate`
                : 'none';
            bar.style.height = isTalking ? `${20 + Math.random() * 30}%` : '20%';
        });
    }

    /**
     * Visa/dölj panel
     */
    show() {
        this.container.classList.remove('hidden');
        this.isVisible = true;
    }

    hide() {
        this.container.classList.add('hidden');
        this.isVisible = false;
    }

    /**
     * Uppdatera status-text
     */
    setStatus(text) {
        document.getElementById('voice-status').textContent = text;
    }
}
