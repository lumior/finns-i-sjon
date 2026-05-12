/**
 * WebRTC Signaling för röstchatt
 * Utökar befintlig Socket.IO med WebRTC-signaling
 */

class WebRTCSignaling {
    constructor(io, roomManager) {
        this.io = io;
        this.roomManager = roomManager;
        this.activeCalls = new Map(); // roomId -> Set<socketId>
        this.peerConnections = new Map(); // socketId -> { peerId, pc }
        
        this.setupSocketHandlers();
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            
            // === WEBRTC SIGNALING ===
            
            socket.on('voice_join', () => {
                console.log(`🎙️ SERVER: voice_join från ${socket.id}`);
                const room = this.roomManager.getRoomBySocket(socket.id);
                if (!room) {
                    console.log(`🎙️ SERVER: Inget rum hittat för ${socket.id}`);
                    return;
                }
                
                const roomId = room.game.roomId;
                console.log(`🎙️ SERVER: Rum hittat: ${roomId}`);
                
                if (!this.activeCalls.has(roomId)) {
                    this.activeCalls.set(roomId, new Set());
                }
                
                const roomCalls = this.activeCalls.get(roomId);
                roomCalls.add(socket.id);
                
                // Meddela andra att ny deltagare anslutit
                const otherPeers = Array.from(roomCalls).filter(id => id !== socket.id);
                console.log(`🎙️ SERVER: Skickar voice_peer_joined till ${otherPeers.length} andra peers i rum ${roomId}`);
                socket.to(roomId).emit('voice_peer_joined', {
                    peerId: socket.id,
                    userName: socket.user?.displayName || 'Gäst'
                });
                
                // Skicka befintliga deltagare till ny ansluten
                socket.emit('voice_peers_list', { peers: otherPeers });
                console.log(`🎙️ SERVER: Skickade voice_peers_list till ${socket.id} med peers:`, otherPeers);
            });

            socket.on('voice_leave', () => {
                this.handlePeerDisconnect(socket);
            });

            // WebRTC Offer/Answer/ICE-signaling
            socket.on('webrtc_offer', async (data) => {
                const { targetPeerId, offer } = data;
                console.log(`🎙️ SERVER: webrtc_offer från ${socket.id} till ${targetPeerId}`);
                this.io.to(targetPeerId).emit('webrtc_offer', {
                    peerId: socket.id,
                    offer
                });
            });

            socket.on('webrtc_answer', (data) => {
                const { targetPeerId, answer } = data;
                console.log(`🎙️ SERVER: webrtc_answer från ${socket.id} till ${targetPeerId}`);
                this.io.to(targetPeerId).emit('webrtc_answer', {
                    peerId: socket.id,
                    answer
                });
            });

            socket.on('webrtc_ice_candidate', (data) => {
                const { targetPeerId, candidate } = data;
                this.io.to(targetPeerId).emit('webrtc_ice_candidate', {
                    peerId: socket.id,
                    candidate
                });
            });

            socket.on('disconnect', () => {
                this.handlePeerDisconnect(socket);
            });
        });
    }

    handlePeerDisconnect(socket) {
        const room = this.roomManager.getRoomBySocket(socket.id);
        if (!room) return;
        
        const roomId = room.game.roomId;
        const roomCalls = this.activeCalls.get(roomId);
        
        if (roomCalls) {
            roomCalls.delete(socket.id);
            
            // Meddela andra att deltagare lämnat
            socket.to(roomId).emit('voice_peer_left', {
                peerId: socket.id
            });
            
            if (roomCalls.size === 0) {
                this.activeCalls.delete(roomId);
            }
        }
        
        // Stäng peer connections
        const pc = this.peerConnections.get(socket.id);
        if (pc) {
            pc.close();
            this.peerConnections.delete(socket.id);
        }
        
        console.log(`🎙️ ${socket.id} lämnade röstchatt`);
    }

    // Hämta ICE-servrar (STUN/TURN)
    getIceServers() {
        return {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
    }
}

module.exports = WebRTCSignaling;
