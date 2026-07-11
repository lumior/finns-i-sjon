/**
 * Video + Voice Chat Manager
 * Utökar röstchatt med video som visas vid PTT
 * 
 * Strategi: Video skickas alltid (för tillförlitlig WebRTC), 
 * men visas/döljs visuellt baserat på PTT.
 */

class VideoChatManager extends VoiceChatManager {
    constructor(socketClient) {
        super(socketClient);
        
        this.localVideoStream = null;
        this.videoEnabled = false;
        this.videoElements = new Map(); // peerId -> <video>
        this.videoContainer = null;
        this.peerNames = new Map(); // peerId -> displayName (fallback om game state ej finns)
    }

    /**
     * Initiera både röst och video
     */
    async initialize() {
        // VÄNTA på kamera FÖRST (innan voice_join skickas!)
        try {
            this.localVideoStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 320 },
                    height: { ideal: 240 },
                    frameRate: { ideal: 10 }
                },
                audio: false
            });
            this.videoEnabled = true;
            console.log('📹 Kamera redo');
        } catch (error) {
            console.warn('⚠️ Kunde inte få tillgång till kamera:', error);
            // Fortsätt utan video
        }
        
        // Initiera röst (från förälder) – skickar voice_join först nu!
        const voiceSuccess = await super.initialize();
        if (!voiceSuccess) return false;
        
        this.createVideoContainer();
        return true;
    }

    /**
     * Lägg till video track i en peer connection
     */
    addVideoToPeerConnection(pc, peerId) {
        if (!this.localVideoStream) return;
        
        const hasVideo = pc.getSenders().some(s => s.track && s.track.kind === 'video');
        if (hasVideo) return;
        
        this.localVideoStream.getVideoTracks().forEach(track => {
            pc.addTrack(track, this.localVideoStream);
            console.log(`📹 Lade till video track i PC för ${peerId}`);
        });
    }

    /**
     * Skapa container för video-overlays
     * Video placeras nu vid varje spelares position på bordet
     */
    createVideoContainer() {
        // Skapa en dold container för fallback (behålls för kompatibilitet)
        this.videoContainer = document.createElement('div');
        this.videoContainer.id = 'video-chat-container';
        this.videoContainer.className = 'video-chat-container';
        this.videoContainer.innerHTML = `
            <div class="video-grid" id="video-grid"></div>
            <div class="video-self" id="video-self">
                <video id="local-video-preview-fallback" autoplay muted playsinline></video>
                <div class="video-label">Du</div>
            </div>
        `;
        document.body.appendChild(this.videoContainer);
        
        // Placera egen video i den egna spelarboxen
        const selfVideo = document.getElementById('self-video');
        if (selfVideo && this.localVideoStream) {
            selfVideo.srcObject = this.localVideoStream;
            const selfVideoContainer = selfVideo.closest('.self-player-video');
            if (selfVideoContainer) {
                selfVideoContainer.classList.add('active');
            }
        }
        const selfAvatarWrap = document.querySelector('.self-avatar-wrap');
        if (selfAvatarWrap) {
            selfAvatarWrap.classList.add('has-video');
        }
        
        // Sätt upp en MutationObserver som flyttar videor till opponent så snart de dyker upp
        this._setupOpponentObserver();
        
        // Sätt upp resize-lyssnare för att flytta videor mellan mobil/desktop
        this._boundHandleResize = this._handleResize.bind(this);
        window.addEventListener('resize', this._boundHandleResize);
    }
    
    /**
     * Hantera resize – flytta videor mellan mobil-grid och opponent containers
     */
    _handleResize() {
        // Säkerställ att varje video ligger i rätt opponent-box
        const wrappers = document.querySelectorAll('.video-peer-wrapper');
        
        wrappers.forEach(wrapper => {
            const peerId = wrapper.dataset.videoPeer;
            if (!peerId) return;
            
            const targetContainer = this.findOpponentVideoContainer(peerId);
            if (targetContainer && wrapper.parentElement !== targetContainer) {
                targetContainer.appendChild(wrapper);
            }
        });
    }
    
    /**
     * Uppdatera namn på alla video-wrappers baserat på aktuell game state
     */
    refreshVideoNames() {
        const peers = Array.from(this.videoElements.keys());
        const players = window.gameClient?.gameState?.players || [];
        console.log('🔄 refreshVideoNames:', { peers, players: players.map(p => ({name: p.name, socketId: p.socketId, id: p.id})) });
        
        this.videoElements.forEach((video, peerId) => {
            const wrapper = video.closest('.video-peer-wrapper');
            if (!wrapper) return;
            const nameEl = wrapper.querySelector('.video-peer-name');
            if (!nameEl) return;
            
            let displayName = this.peerNames.get(peerId) || nameEl.textContent;
            
            if (window.gameClient && gameClient.gameState) {
                // Försök matcha på socketId
                let player = gameClient.gameState.players.find(p => p.socketId === peerId);
                
                // Fallback: matcha på id (ifall peerId av någon anledning är player.id)
                if (!player) player = gameClient.gameState.players.find(p => p.id === peerId);
                
                // Fallback: matcha på lagrat namn
                if (!player && this.peerNames.has(peerId)) {
                    const peerName = this.peerNames.get(peerId);
                    player = gameClient.gameState.players.find(p => p.name === peerName);
                }
                
                if (player) {
                    displayName = player.name;
                    this.peerNames.set(peerId, player.name);
                    console.log(`🔄 Uppdaterade namn för ${peerId} → ${player.name}`);
                } else {
                    console.log(`🔄 Hittade INGEN spelare för peerId=${peerId}`);
                }
            }
            
            nameEl.textContent = displayName;
        });
    }

    /**
     * MutationObserver som automatiskt flyttar videor från fallback-grid till opponent
     */
    _setupOpponentObserver() {
        const opponentsArea = document.getElementById('opponents-area');
        if (!opponentsArea || this._opponentObserver) return;
        
        this._opponentObserver = new MutationObserver(() => {
            this._relocateVideosToOpponents();
        });
        
        this._opponentObserver.observe(opponentsArea, { childList: true, subtree: false });
    }
    
    /**
     * Flytta alla videor från fallback-grid till rätt opponent
     */
    _relocateVideosToOpponents() {
        const grid = document.getElementById('video-grid');
        if (!grid) return;
        
        const wrappers = Array.from(grid.querySelectorAll('.video-peer-wrapper'));
        let moved = 0;
        
        wrappers.forEach(wrapper => {
            const peerId = wrapper.dataset.videoPeer;
            if (!peerId) return;
            const opponentContainer = this.findOpponentVideoContainer(peerId);
            if (opponentContainer) {
                opponentContainer.appendChild(wrapper);
                opponentContainer.classList.add('active');
                moved++;
            }
        });
        
        if (moved > 0) {
            console.log(`📹 Flyttade ${moved} videor från fallback-grid till opponent`);
            if (grid.children.length === 0) {
                this.videoContainer.classList.remove('has-videos');
            }
        }
    }

    /**
     * Överskugd: Skapa peer connection med både röst och video
     */
    async createPeerConnection(peerId, isInitiator) {
        console.log(`📹 createPeerConnection: ${peerId}, initiator=${isInitiator}, localVideo=${!!this.localVideoStream}`);
        
        if (this.peerConnections.has(peerId)) {
            console.log(`📹 PC för ${peerId} finns redan`);
            return this.peerConnections.get(peerId);
        }

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'turn:relay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
                { urls: 'turn:relay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
                { urls: 'turn:relay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
            ]
        });

        this.peerConnections.set(peerId, pc);

        // Lägg till röst-spår
        this.localStream.getTracks().forEach(track => {
            pc.addTrack(track, this.localStream);
        });

        // Lägg till video-spår (alltid aktivt)
        this.addVideoToPeerConnection(pc, peerId);

        // Hantera remote stream
        pc.ontrack = (event) => {
            console.log(`📹 ontrack från ${peerId}: kind=${event.track.kind}, muted=${event.track.muted}, readyState=${event.track.readyState}`);
            
            const [remoteStream] = event.streams;
            this.remoteStreams.set(peerId, remoteStream);
            
            if (event.track.kind === 'video') {
                this.attachVideoElement(peerId, remoteStream);
                
                event.track.onunmute = () => {
                    console.log(`📹 Video unmuted för ${peerId}`);
                    const video = this.videoElements.get(peerId);
                    if (video && video.paused) {
                        video.play().catch(() => {});
                    }
                };
            }
            
            if (event.track.kind === 'audio') {
                this.attachAudioElement(peerId, remoteStream);
            }
        };

        // ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`📹 ICE candidate för ${peerId}:`, event.candidate.candidate.substring(0, 50));
                this.socket.emit('webrtc_ice_candidate', {
                    targetPeerId: peerId,
                    candidate: event.candidate
                });
            } else {
                console.log(`📹 ICE gathering complete för ${peerId}`);
            }
        };
        
        pc.oniceconnectionstatechange = () => {
            console.log(`📹 ICE state ${peerId}:`, pc.iceConnectionState);
            if (pc.iceConnectionState === 'disconnected') {
                setTimeout(() => {
                    const currentPc = this.peerConnections.get(peerId);
                    if (currentPc && currentPc.iceConnectionState === 'disconnected') {
                        console.warn(`📹 ICE fortfarande disconnected för ${peerId} — försöker ICE-restart`);
                        this.handleConnectionFailure(peerId, true);
                    }
                }, 5000);
            } else if (pc.iceConnectionState === 'failed') {
                console.warn(`📹 ICE FAILED för ${peerId} — återskapar...`);
                this.handleConnectionFailure(peerId);
            }
        };
        
        pc.onconnectionstatechange = () => {
            console.log(`📹 Connection state ${peerId}:`, pc.connectionState);
            if (pc.connectionState === 'connected') {
                const remoteStream = this.remoteStreams.get(peerId);
                if (remoteStream) {
                    this.startTalkingDetection(peerId, remoteStream);
                }
            } else if (pc.connectionState === 'failed') {
                console.warn(`📹 Connection FAILED för ${peerId} — återskapar...`);
                this.handleConnectionFailure(peerId);
            }
        };
        
        // Logga stats efter 5 sekunder
        setTimeout(async () => {
            try {
                const stats = await pc.getStats();
                let candidatePairs = 0;
                let inboundRtp = 0;
                stats.forEach(report => {
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') candidatePairs++;
                    if (report.type === 'inbound-rtp' && report.kind === 'video') inboundRtp = report.bytesReceived;
                });
                console.log(`📹 Stats ${peerId}: candidates=${candidatePairs}, videoBytes=${inboundRtp}`);
            } catch(e) {}
        }, 5000);

        // Om initiator: skicka offer
        if (isInitiator) {
            console.log(`📹 Skickar offer till ${peerId}`);
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            await pc.setLocalDescription(offer);
            
            this.socket.emit('webrtc_offer', {
                targetPeerId: peerId,
                offer: pc.localDescription
            });
        }
        
        return pc;
    }

    /**
     * Hitta rätt opponent-element baserat på peerId (socket.id) eller namn
     */
    findOpponentVideoContainer(peerId, userName = null) {
        console.log(`🔍 findOpponentVideoContainer: söker efter peerId=${peerId}, userName=${userName}`);
        
        // Försök hitta via data-opponent-video direkt
        let container = document.querySelector(`[data-opponent-video="${peerId}"]`);
        if (container) {
            console.log(`🔍 Hittade opponent-video via data-opponent-video`);
            return container;
        }
        
        // Försök hitta opponent med matchande socket-id
        const opponent = document.querySelector(`.opponent[data-socket-id="${peerId}"]`);
        if (opponent) {
            container = opponent.querySelector('.opponent-video');
            if (container) {
                console.log(`🔍 Hittade opponent-video via .opponent[data-socket-id]`);
                return container;
            }
        }
        
        // Försök hitta via gameClient gameState mapping (socketId eller namn)
        if (window.gameClient && gameClient.gameState) {
            const knownName = userName || this.peerNames.get(peerId);
            const player = gameClient.gameState.players.find(p => 
                p.socketId === peerId || (knownName && p.name === knownName)
            );
            if (player) {
                const bySocketId = document.querySelector(`[data-opponent-video="${player.socketId}"]`);
                if (bySocketId) {
                    console.log(`🔍 Hittade opponent-video via player.socketId mapping (${player.name})`);
                    return bySocketId;
                }
                const byId = document.querySelector(`[data-opponent-video="${player.id}"]`);
                if (byId) {
                    console.log(`🔍 Hittade opponent-video via player.id mapping (${player.name})`);
                    return byId;
                }
            }
        }
        
        // Sista fallback: sök efter namn direkt i DOM
        const knownName = userName || this.peerNames.get(peerId);
        if (knownName) {
            const opponentByName = document.querySelector(`.opponent[data-player-name="${knownName}"]`);
            if (opponentByName) {
                container = opponentByName.querySelector('.opponent-video');
                if (container) {
                    console.log(`🔍 Hittade opponent-video via data-player-name (${knownName})`);
                    return container;
                }
            }
            // Fallback utan attribut: sök på text-innehåll
            const opponents = document.querySelectorAll('.opponent');
            for (const opp of opponents) {
                const nameEl = opp.querySelector('.opponent-name');
                if (nameEl && nameEl.textContent.trim().startsWith(knownName)) {
                    container = opp.querySelector('.opponent-video');
                    if (container) {
                        console.log(`🔍 Hittade opponent-video via textContent (${knownName})`);
                        return container;
                    }
                }
            }
        }
        
        console.log(`🔍 Hittade INGEN opponent-video för peerId=${peerId}`);
        return null;
    }

    /**
     * Skapa video-element för remote peer
     * Videon placeras vid spelarens position på bordet
     */
    attachVideoElement(peerId, stream) {
        const videoTracks = stream.getVideoTracks();
        console.log(`📹 attachVideoElement: peerId=${peerId}, videoTracks=${videoTracks.length}`);
        if (videoTracks.length === 0) return;

        let video = this.videoElements.get(peerId);
        let wrapper = document.querySelector(`[data-video-peer="${peerId}"]`);
        
        if (!video) {
            wrapper = document.createElement('div');
            wrapper.className = 'video-peer-wrapper';
            wrapper.dataset.videoPeer = peerId;
            
            // Hämta spelarens namn från game state, eller från lagrat peerName
            let peerName = this.peerNames.get(peerId) || 'Spelare';
            if (window.gameClient && gameClient.gameState) {
                let player = gameClient.gameState.players.find(p => p.socketId === peerId);
                if (!player) player = gameClient.gameState.players.find(p => p.id === peerId);
                if (!player && this.peerNames.has(peerId)) {
                    player = gameClient.gameState.players.find(p => p.name === this.peerNames.get(peerId));
                }
                if (player) {
                    peerName = player.name;
                    this.peerNames.set(peerId, player.name);
                }
            }
            console.log(`📹 Skapar video för ${peerId}, namn=${peerName}`);
            
            wrapper.innerHTML = `
                <video autoplay playsinline muted></video>
                <div class="video-talking-indicator"></div>
                <div class="video-peer-name">${peerName}</div>
            `;
            
            video = wrapper.querySelector('video');
            this.videoElements.set(peerId, video);
            
            // Försök placera videon i motståndarens spelarbox
            const opponentContainer = this.findOpponentVideoContainer(peerId);
            if (opponentContainer) {
                console.log(`📹 Placerar video för ${peerId} i opponent-container`);
                opponentContainer.appendChild(wrapper);
                opponentContainer.classList.add('active');
            } else {
                // Fallback: lägg i fallback-grid så vi kan se den för debugging
                console.log(`📹 Placerar video för ${peerId} i fallback-grid (spelare ej hittad)`);
                const grid = document.getElementById('video-grid');
                if (grid) {
                    grid.appendChild(wrapper);
                    this.videoContainer.classList.add('has-videos');
                }
            }
        }
        
        // Säkerställ att opponent-video containern är synlig även om wrappern redan fanns
        const currentContainer = wrapper.parentElement;
        if (currentContainer && currentContainer.classList.contains('opponent-video')) {
            currentContainer.classList.add('active');
        }
        
        video.srcObject = stream;
        video.muted = true; // Krävs för autoplay
        
        video.play().then(() => {
            console.log(`📹 Video spelar för ${peerId}`);
        }).catch(e => {
            console.warn(`📹 Autoplay blockerad för ${peerId}:`, e.message);
            const tryPlay = () => {
                video.play().catch(() => {});
                document.removeEventListener('click', tryPlay);
                document.removeEventListener('keydown', tryPlay);
            };
            document.addEventListener('click', tryPlay, { once: true });
            document.addEventListener('keydown', tryPlay, { once: true });
        });
        
        setTimeout(() => {
            console.log(`📹 Debug ${peerId}: readyState=${video.readyState}, paused=${video.paused}, w=${video.videoWidth}, h=${video.videoHeight}, tracks=${stream.getVideoTracks().length}`);
        }, 5000);
        
        // Visa wrapper – alltid synlig vid spelarens position
        wrapper.classList.add('active');
        
        // Om videon ligger i fallback-grid, försök flytta den nu när opponent kanske finns
        const opponentContainer = this.findOpponentVideoContainer(peerId);
        if (opponentContainer && wrapper.parentElement !== opponentContainer) {
            console.log(`📹 Flyttar video för ${peerId} från fallback till opponent`);
            opponentContainer.appendChild(wrapper);
            opponentContainer.classList.add('active');
        }
    }

    /**
     * Visa/dölj video-element
     */
    setVideoVisible(peerId, visible) {
        const wrapper = document.querySelector(`[data-video-peer="${peerId}"]`);
        if (wrapper) {
            wrapper.classList.toggle('active', visible);
        }
    }

    /**
     * Överskugd: Starta prata – visa video
     */
    startTalking() {
        super.startTalking();
        this.updateVideoUI(true);
    }

    /**
     * Överskugd: Sluta prata – dölj video
     */
    stopTalking() {
        super.stopTalking();
        this.updateVideoUI(false);
    }

    /**
     * Uppdatera video-UI (egen preview)
     */
    updateVideoUI(isTalking) {
        const self = document.getElementById('video-self');
        if (self) {
            self.classList.toggle('talking', isTalking);
        }
        const selfVideo = document.getElementById('self-video');
        if (selfVideo) {
            selfVideo.classList.toggle('talking', isTalking);
        }
    }

    /**
     * Överskugd: Talking detection – markera video-wrapper
     */
    startTalkingDetection(peerId, stream) {
        super.startTalkingDetection(peerId, stream);
        
        if (!this._videoTalkingCallbackSet) {
            this._videoTalkingCallbackSet = true;
            const originalCallback = this.onTalkingStateChange;
            
            this.onTalkingStateChange = (pId, isTalking) => {
                if (originalCallback) originalCallback(pId, isTalking);
                
                const wrapper = document.querySelector(`[data-video-peer="${pId}"]`);
                if (wrapper) {
                    wrapper.classList.toggle('talking', isTalking);
                }
            };
        }
    }

    /**
     * Toggle video på/av (manuell override)
     */
    toggleVideo() {
        this.videoEnabled = !this.videoEnabled;
        
        if (this.localVideoStream) {
            this.localVideoStream.getVideoTracks().forEach(track => {
                track.enabled = this.videoEnabled;
            });
        }
        
        return this.videoEnabled;
    }

    /**
     * Överskugd: Koppla från
     */
    disconnect() {
        if (this._boundHandleResize) {
            window.removeEventListener('resize', this._boundHandleResize);
            this._boundHandleResize = null;
        }
        
        if (this.localVideoStream) {
            this.localVideoStream.getTracks().forEach(track => track.stop());
            this.localVideoStream = null;
        }
        
        this.videoElements.forEach(video => {
            const wrapper = video.closest('.video-peer-wrapper');
            if (wrapper) wrapper.remove();
        });
        this.videoElements.clear();
        
        if (this.videoContainer) {
            this.videoContainer.remove();
            this.videoContainer = null;
        }
        
        // Dölj egen video i spelarboxen
        const selfVideo = document.getElementById('self-video');
        if (selfVideo) {
            const selfVideoContainer = selfVideo.closest('.self-player-video');
            if (selfVideoContainer) {
                selfVideoContainer.classList.remove('active');
            }
            selfVideo.srcObject = null;
        }
        const selfAvatarWrap = document.querySelector('.self-avatar-wrap');
        if (selfAvatarWrap) {
            selfAvatarWrap.classList.remove('has-video');
        }
        
        super.disconnect();
    }
}

// Ersätt global VoiceChatManager
window.VoiceChatManager = VideoChatManager;
