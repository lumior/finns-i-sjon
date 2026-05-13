class GameSocket {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.listeners = new Map();
        this.token = localStorage.getItem('token');
        this.forwardedEvents = new Set();
    }

    connect() {
        const options = {
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: this.reconnectDelay,
            reconnectionDelayMax: 5000,
            auth: {}
        };
        
        if (this.token) {
            options.auth.token = this.token;
        }
        
        // Rensa gamla forwarders vid ny anslutning
        this.forwardedEvents.clear();
        
        this.socket = io(options);
        this.setupBaseListeners();
        this.reattachForwardedListeners();
        return this.socket;
    }

    setupBaseListeners() {
        this.socket.on('connect', () => {
            console.log('✅ Ansluten till servern');
            this.connected = true;
            this.reconnectAttempts = 0;
            
            localStorage.setItem('socketId', this.socket.id);
            
            const oldSocketId = localStorage.getItem('previousSocketId');
            const reconnectToken = localStorage.getItem('reconnectToken');
            const currentRoom = localStorage.getItem('currentRoom');
            
            if (oldSocketId && currentRoom && oldSocketId !== this.socket.id) {
                console.log('🔄 Försöker återansluta...');
                this.socket.emit('reconnect_attempt', { oldSocketId, reconnectToken });
            }
            
            localStorage.setItem('previousSocketId', this.socket.id);
            
            this.trigger('connected', { socketId: this.socket.id });
        });

        this.socket.on('disconnect', (reason) => {
            console.log('❌ Frånkopplad:', reason);
            this.connected = false;
            this.trigger('disconnected', { reason });
        });

        this.socket.on('connect_error', (error) => {
            console.error('🔴 Anslutningsfel:', error.message);
            this.reconnectAttempts++;
            this.trigger('error', { message: error.message, attempt: this.reconnectAttempts });
        });

        this.socket.on('error', (data) => {
            console.error('🔴 Serverfel:', data.message);
            this.trigger('server_error', data);
        });
    }

    reattachForwardedListeners() {
        // När vi reconnectar, återanslut alla tidigare forwarders
        for (const event of this.forwardedEvents) {
            this.socket.on(event, (data) => {
                this.trigger(event, data);
            });
        }
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        
        // Om vi har en socket, registrera forwarder
        if (this.socket) {
            this.forwardedEvents.add(event);
            this.socket.on(event, (data) => {
                this.trigger(event, data);
            });
        }
        
        return this;
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
        
        return this;
    }

    trigger(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Fel i event handler för ${event}:`, error);
                }
            });
        }
    }

    emit(event, data) {
        if (this.socket && this.connected) {
            this.socket.emit(event, data);
        } else {
            console.warn('⚠️ Socket inte ansluten - kan inte skicka:', event);
        }
    }

    get id() {
        return this.socket?.id;
    }

    isConnected() {
        return this.connected;
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
        }
        this.forwardedEvents.clear();
    }

    reconnect() {
        this.disconnect();
        return this.connect();
    }
}

const gameSocket = new GameSocket();
window.gameSocket = gameSocket;
