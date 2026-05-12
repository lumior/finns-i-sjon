/**
 * Video + Voice Chat UI
 * Utökad med video-kontroller och preview
 */

class VideoChatUI extends VoiceChatUI {
    constructor(videoChatManager) {
        super(videoChatManager);
        this.videoChat = videoChatManager;
    }

    /**
     * Överskugd: Skapa UI med video-kontroller
     */
    createUI() {
        // Kalla förälderns createUI först
        super.createUI();
        
        // Lägg till video-knapp i kontroller
        const controls = this.container.querySelector('.voice-controls');
        
        const videoBtn = document.createElement('button');
        videoBtn.id = 'voice-video-btn';
        videoBtn.className = 'voice-btn video-toggle';
        videoBtn.innerHTML = '📹 <span>Video</span>';
        
        // Sätt in efter mute-knappen
        const muteBtn = document.getElementById('voice-mute-btn');
        if (muteBtn) {
            muteBtn.after(videoBtn);
        } else {
            controls.prepend(videoBtn);
        }
        
        // Event listener för video-knapp
        videoBtn.addEventListener('click', () => {
            const enabled = this.videoChat.toggleVideo();
            
            if (enabled) {
                videoBtn.innerHTML = '📹 <span>On</span>';
                videoBtn.classList.add('active');
            } else {
                videoBtn.innerHTML = '📹 <span>Off</span>';
                videoBtn.classList.remove('active');
            }
        });
        
        // Uppdatera video-peers när de ansluter
        this.videoChat.socket.on('voice_peer_joined', (data) => {
            this.addVideoPeer(data.peerId, data.userName);
        });
        
        this.videoChat.socket.on('voice_peer_left', (data) => {
            this.removeVideoPeer(data.peerId);
        });
    }

    /**
     * Lägg till video-peer i UI
     */
    addVideoPeer(peerId, userName) {
        // Spara namnet så att attachVideoElement kan använda det som fallback
        if (userName && this.videoChat) {
            this.videoChat.peerNames.set(peerId, userName);
        }
        
        // Hjälpfunktion för att uppdatera namn och placering
        const tryUpdate = (attempt) => {
            const wrapper = document.querySelector(`[data-video-peer="${peerId}"]`);
            if (wrapper) {
                const nameEl = wrapper.querySelector('.video-peer-name');
                // Prioritera alltid namnet från game state (det är spelarens valda namn)
                let displayName = userName || 'Spelare';
                if (window.gameClient && gameClient.gameState) {
                    const player = gameClient.gameState.players.find(p => p.socketId === peerId);
                    if (player) displayName = player.name;
                }
                if (nameEl) nameEl.textContent = displayName;
                
                // Försök flytta videon från fallback-grid till rätt opponent
                if (window.gameClient && gameClient.voiceChat) {
                    const opponentContainer = gameClient.voiceChat.findOpponentVideoContainer(peerId);
                    if (opponentContainer && wrapper.parentElement !== opponentContainer) {
                        opponentContainer.appendChild(wrapper);
                    }
                }
            } else if (attempt < 3) {
                // Försök igen om wrappern inte finns än (attachVideoElement kan vara sen)
                setTimeout(() => tryUpdate(attempt + 1), 1500);
            }
        };
        
        setTimeout(() => tryUpdate(1), 500);
    }

    /**
     * Ta bort video-peer från UI
     */
    removeVideoPeer(peerId) {
        const wrapper = document.querySelector(`[data-video-peer="${peerId}"]`);
        if (wrapper) {
            wrapper.remove();
        }
    }

    /**
     * Överskugd: Uppdatera talking state – hantera också video
     * Videon vid spelaren är alltid synlig, men markerad vid talking
     */
    updatePeerTalkingState(peerId, isTalking) {
        super.updatePeerTalkingState(peerId, isTalking);
        
        // Uppdatera video-wrapper – alltid synlig vid spelare på bordet
        const videoWrapper = document.querySelector(`[data-video-peer="${peerId}"]`);
        if (videoWrapper) {
            videoWrapper.classList.toggle('talking', isTalking);
            // Videon är alltid synlig vid spelarens position på bordet
            videoWrapper.classList.add('active');
        }
    }
}

// Ersätt global VoiceChatUI
window.VoiceChatUI = VideoChatUI;
