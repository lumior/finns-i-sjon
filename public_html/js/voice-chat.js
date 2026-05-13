/**
 * Finns i sjön PRO – Voice Chat (WebRTC)
 * 
 * Funktioner:
 * - P2P röstkommunikation med alla spelare i rummet
 * - Push-to-talk eller alltid-på-läge
 * - Ljudindikator (visar vem som pratar)
 * - Volymkontroll per spelare
 * - Mute/unmute
 */

class VoiceChatManager {
    constructor(socketClient) {
        this.socket = socketClient;
        this.localStream = null;
        this.peerConnections = new Map(); // peerId -> RTCPeerConnection
        this.remoteStreams = new Map(); // peerId -> MediaStream
        this.audioElements = new Map(); // peerId -> <audio>
        
        this.isConnected = false;
        this.isMuted = false;
        this.pushToTalk = false; // false = alltid på, true = håll in för att prata
        this.isTalking = false;
        
        this.analyzers = new Map(); // För ljudindikator
        this.talkingStates = new Map(); // peerId -> boolean
        
        this.settings = {
            inputVolume: 1.0,
            outputVolume: 1.0,
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true
        };
        
        this.onTalkingStateChange = null; // Callback
    }

    /**
     * Initiera röstchatt – begär mikrofontillgång
     */
    async initialize() {
        console.log('🎙️ VoiceChatManager.initialize() startar...');
        if (this.isConnected) {
            console.log('🎙️ Redan ansluten, skippar');
            return true;
        }
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: this.settings.echoCancellation,
                    noiseSuppression: this.settings.noiseSuppression,
                    autoGainControl: this.settings.autoGainControl,
                    sampleRate: 48000,
                    channelCount: 1
                },
                video: false
            });
            
            // Sätt lokal volym
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !this.isMuted;
            });
            
            this.setupSocketListeners();
            
            // Anslut till röstchatt-kanal
            console.log('🎙️ Skickar voice_join...');
            this.socket.emit('voice_join');
            
            this.isConnected = true;
            console.log('🎙️ Röstchatt initierad framgångsrikt');
            
            return true;
            
        } catch (error) {
            console.error('❌ Kunde inte få tillgång till mikrofon:', error);
            
            if (error.name === 'NotAllowedError') {
                alert('Mikrofontillgång nekad. Röstchatt kräver mikrofon.');
            } else if (error.name === 'NotFoundError') {
                alert('Ingen mikrofon hittades.');
            }
            
            return false;
        }
    }

    /**
     * Bestäm om vi ska vara initiator baserat på socket-ID (lägre ID = initiator)
     * Detta löser "glare"-problemet deterministiskt.
     */
    shouldBeInitiator(peerId) {
        const myId = this.socket.id || '';
        return myId < peerId;
    }

    /**
     * Socket-listeners för WebRTC-signaling
     */
    setupSocketListeners() {
        console.log('🎙️ Sätter upp socket-listeners för WebRTC...');
        
        // Spara callbacks så vi kan ta bort dem vid disconnect
        this._socketCallbacks = {};
        
        // Ny peer anslöt
        this._socketCallbacks.voice_peer_joined = async (data) => {
            console.log(`🎙️ voice_peer_joined: ${data.peerId}`);
            const shouldInitiate = this.shouldBeInitiator(data.peerId);
            await this.createPeerConnection(data.peerId, shouldInitiate);
        };
        this.socket.on('voice_peer_joined', this._socketCallbacks.voice_peer_joined);

        // Befintliga peers vid anslutning
        this._socketCallbacks.voice_peers_list = async (data) => {
            console.log(`🎙️ voice_peers_list:`, data.peers);
            for (const peerId of data.peers) {
                const shouldInitiate = this.shouldBeInitiator(peerId);
                await this.createPeerConnection(peerId, shouldInitiate);
            }
        };
        this.socket.on('voice_peers_list', this._socketCallbacks.voice_peers_list);

        // Peer lämnade
        this._socketCallbacks.voice_peer_left = (data) => {
            console.log(`🎙️ voice_peer_left: ${data.peerId}`);
            this.removePeerConnection(data.peerId);
        };
        this.socket.on('voice_peer_left', this._socketCallbacks.voice_peer_left);

        // WebRTC Offer
        this._socketCallbacks.webrtc_offer = async (data) => {
            console.log(`🎙️ webrtc_offer från: ${data.peerId}`, data.offer?.type);
            const { peerId, offer } = data;
            
            let pc = this.peerConnections.get(peerId);
            if (!pc) {
                pc = await this.createPeerConnection(peerId, false);
            }
            
            try {
                // Hantera "glare" - om vi redan har skickat offer, gör rollback
                if (pc.signalingState === 'have-local-offer') {
                    console.log(`🎙️ Glare detected! Rollback och tar emot offer från ${peerId}`);
                    await pc.setLocalDescription({type: 'rollback'});
                }
                
                await pc.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await pc.createAnswer();
                
                console.log(`🎙️ Answer skapad för ${peerId}:`, answer.type, 'sdp length:', answer.sdp?.length);
                
                await pc.setLocalDescription(answer);
                
                console.log(`🎙️ Local description satt för ${peerId}:`, pc.signalingState, 'iceGathering:', pc.iceGatheringState);
                
                this.socket.emit('webrtc_answer', {
                    targetPeerId: peerId,
                    answer: pc.localDescription
                });
            } catch (err) {
                console.error(`❌ Fel vid hantering av offer från ${peerId}:`, err.message);
            }
        };
        this.socket.on('webrtc_offer', this._socketCallbacks.webrtc_offer);

        // WebRTC Answer
        this._socketCallbacks.webrtc_answer = async (data) => {
            console.log(`🎙️ webrtc_answer från: ${data.peerId}`, data.answer?.type);
            const { peerId, answer } = data;
            const pc = this.peerConnections.get(peerId);
            
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
            }
        };
        this.socket.on('webrtc_answer', this._socketCallbacks.webrtc_answer);

        // ICE Candidate
        this._socketCallbacks.webrtc_ice_candidate = async (data) => {
            const { peerId, candidate } = data;
            const pc = this.peerConnections.get(peerId);
            
            if (pc) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    console.log(`🎙️ ICE candidate tillagd för ${peerId}`);
                } catch (err) {
                    console.warn(`⚠️ Kunde inte lägga till ICE candidate för ${peerId}:`, err.message);
                }
            }
        };
        this.socket.on('webrtc_ice_candidate', this._socketCallbacks.webrtc_ice_candidate);
    }

    /**
     * Skapa RTCPeerConnection till en peer
     */
    async createPeerConnection(peerId, isInitiator) {
        if (this.peerConnections.has(peerId)) {
            console.log(`🎙️ PeerConnection för ${peerId} finns redan`);
            return this.peerConnections.get(peerId);
        }
        
        console.log(`🎙️ Skapar PeerConnection till ${peerId}, isInitiator=${isInitiator}`);

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'turn:relay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
                { urls: 'turn:relay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
            ]
        });

        this.peerConnections.set(peerId, pc);

        // Lägg till lokal stream
        this.localStream.getTracks().forEach(track => {
            pc.addTrack(track, this.localStream);
        });

        // Hantera remote stream
        pc.ontrack = (event) => {
            console.log(`🎙️ ontrack från ${peerId}:`, event.streams.length, 'streams');
            const [remoteStream] = event.streams;
            this.remoteStreams.set(peerId, remoteStream);
            this.attachAudioElement(peerId, remoteStream);
        };

        // ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('webrtc_ice_candidate', {
                    targetPeerId: peerId,
                    candidate: event.candidate
                });
            }
        };

        // Anslutningsstatus
        pc.onconnectionstatechange = () => {
            console.log(`🎙️ Connection state (${peerId}):`, pc.connectionState);
            
            if (pc.connectionState === 'connected') {
                const remoteStream = this.remoteStreams.get(peerId);
                if (remoteStream) {
                    this.startTalkingDetection(peerId, remoteStream);
                }
            } else if (pc.connectionState === 'failed') {
                console.warn(`🎙️ Connection FAILED för ${peerId} — återskapar...`);
                this.handleConnectionFailure(peerId);
            }
        };
        
        pc.oniceconnectionstatechange = () => {
            console.log(`🎙️ ICE state ${peerId}:`, pc.iceConnectionState);
            if (pc.iceConnectionState === 'disconnected') {
                // Vänta 5 sekunder — om fortfarande disconnected, försök ICE-restart
                setTimeout(() => {
                    const currentPc = this.peerConnections.get(peerId);
                    if (currentPc && currentPc.iceConnectionState === 'disconnected') {
                        console.warn(`🎙️ ICE fortfarande disconnected för ${peerId} — försöker ICE-restart`);
                        this.handleConnectionFailure(peerId, true);
                    }
                }, 5000);
            } else if (pc.iceConnectionState === 'failed') {
                console.warn(`🎙️ ICE FAILED för ${peerId} — återskapar...`);
                this.handleConnectionFailure(peerId);
            }
        };

        // Om initiator: skicka offer
        if (isInitiator) {
            console.log(`🎙️ Skickar offer till ${peerId}`);
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: false
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
     * Skapa <audio>-element för remote stream
     */
    attachAudioElement(peerId, stream) {
        console.log(`🎙️ attachAudioElement för ${peerId}`);
        let audio = this.audioElements.get(peerId);
        
        if (!audio) {
            audio = document.createElement('audio');
            audio.autoplay = true;
            audio.volume = this.settings.outputVolume;
            document.body.appendChild(audio);
            this.audioElements.set(peerId, audio);
        }
        
        audio.srcObject = stream;
        
        // Ljudindikator
        this.startTalkingDetection(peerId, stream);
    }

    /**
     * Detektera om peer pratar (för UI-indikator)
     */
    startTalkingDetection(peerId, stream) {
        // Säkerhetskoll: se till att streamen har audio tracks
        if (!stream.getAudioTracks || stream.getAudioTracks().length === 0) {
            console.log(`🎙️ Ingen audio i stream från ${peerId}, skippar talking detection`);
            return;
        }
        
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyzer = audioContext.createAnalyser();
        
        analyzer.fftSize = 256;
        source.connect(analyzer);
        
        this.analyzers.set(peerId, analyzer);
        
        const bufferLength = analyzer.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const checkTalking = () => {
            if (!this.analyzers.has(peerId)) return;
            
            analyzer.getByteFrequencyData(dataArray);
            
            // Beräkna genomsnittlig volym
            const average = dataArray.reduce((a, b) => a + b) / bufferLength;
            const isTalking = average > 20; // Tröskelvärde
            
            if (isTalking !== this.talkingStates.get(peerId)) {
                this.talkingStates.set(peerId, isTalking);
                
                if (this.onTalkingStateChange) {
                    this.onTalkingStateChange(peerId, isTalking);
                }
            }
            
            requestAnimationFrame(checkTalking);
        };
        
        checkTalking();
    }

    /**
     * Hantera anslutningsfel — ICE-restart eller återskapa PC
     */
    async handleConnectionFailure(peerId, tryIceRestart = false) {
        const pc = this.peerConnections.get(peerId);
        if (!pc) return;
        
        if (tryIceRestart && pc.connectionState !== 'closed') {
            try {
                const offer = await pc.createOffer({ iceRestart: true });
                await pc.setLocalDescription(offer);
                
                this.socket.emit('webrtc_offer', {
                    targetPeerId: peerId,
                    offer: pc.localDescription
                });
                console.log(`🎙️ ICE-restart skickad till ${peerId}`);
                return;
            } catch (err) {
                console.warn(`🎙️ ICE-restart misslyckades för ${peerId}:`, err.message);
            }
        }
        
        // Om ICE-restart misslyckades eller inte försöktes — återskapa hela PC:n
        console.log(`🎙️ Återskapar PeerConnection för ${peerId}`);
        this.removePeerConnection(peerId);
        
        // Skapa ny PC — vi är initiator eftersom vi upptäckte felet
        await this.createPeerConnection(peerId, true);
    }

    /**
     * Ta bort peer connection
     */
    removePeerConnection(peerId) {
        const pc = this.peerConnections.get(peerId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(peerId);
        }
        
        this.remoteStreams.delete(peerId);
        this.talkingStates.delete(peerId);
        this.analyzers.delete(peerId);
        
        const audio = this.audioElements.get(peerId);
        if (audio) {
            audio.remove();
            this.audioElements.delete(peerId);
        }
    }

    // === KONTROLLER ===

    /**
     * Mute/unmute mikrofon
     */
    toggleMute() {
        this.isMuted = !this.isMuted;
        
        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = !this.isMuted;
        });
        
        return this.isMuted;
    }

    /**
     * Sätt push-to-talk läge
     */
    setPushToTalk(enabled) {
        this.pushToTalk = enabled;
        
        if (enabled) {
            // Default muted tills användaren trycker
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = false;
            });
        }
    }

    /**
     * Starta prata (push-to-talk nedtryckt)
     */
    startTalking() {
        if (!this.pushToTalk || this.isMuted) return;
        
        this.isTalking = true;
        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = true;
        });
    }

    /**
     * Sluta prata (push-to-talk släppt)
     */
    stopTalking() {
        if (!this.pushToTalk) return;
        
        this.isTalking = false;
        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = false;
        });
    }

    /**
     * Ändra in-volym (egen mikrofon)
     */
    setInputVolume(volume) {
        this.settings.inputVolume = Math.max(0, Math.min(1, volume));
        this.localStream.getAudioTracks().forEach(track => {
            // WebRTC har ingen direkt input gain, använd GainNode om nödvändigt
        });
    }

    /**
     * Ändra ut-volym (andra spelare)
     */
    setOutputVolume(volume) {
        this.settings.outputVolume = Math.max(0, Math.min(1, volume));
        
        this.audioElements.forEach(audio => {
            audio.volume = this.settings.outputVolume;
        });
    }

    /**
     * Koppla från röstchatt
     */
    disconnect() {
        // Ta bort socket listeners
        if (this._socketCallbacks) {
            for (const [event, callback] of Object.entries(this._socketCallbacks)) {
                this.socket.off(event, callback);
            }
            this._socketCallbacks = null;
        }
        
        // Stäng alla peer connections
        this.peerConnections.forEach((pc, peerId) => {
            pc.close();
        });
        this.peerConnections.clear();
        
        // Stäng lokal stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        // Ta bort audio elements
        this.audioElements.forEach(audio => audio.remove());
        this.audioElements.clear();
        
        // Stäng analyzers
        this.analyzers.clear();
        this.talkingStates.clear();
        
        this.socket.emit('voice_leave');
        this.isConnected = false;
        
        console.log('🎙️ Röstchatt avslutad');
    }

    /**
     * Hämta lista med aktiva talkers (för UI)
     */
    getActiveTalkers() {
        const talkers = [];
        this.talkingStates.forEach((isTalking, peerId) => {
            if (isTalking) talkers.push(peerId);
        });
        return talkers;
    }

    /**
     * Kontrollera om vi har tillgång till mikrofon
     */
    async checkPermission() {
        try {
            const result = await navigator.permissions.query({ name: 'microphone' });
            return result.state;
        } catch {
            return 'unknown';
        }
    }
}

// Global instans
let voiceChat;
window.VoiceChatManager = VoiceChatManager;
