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
        this.forwardedHandlers = new Map();
    }

    connect() {
        const options = {
            transports: ['polling', 'websocket'],  // Polling primärt = stabilare på mobil/Safari
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: 500,                // Snabbare återanslutning
            reconnectionDelayMax: 3000,
            timeout: 20000,
            auth: {}
        };
        
        if (this.token) {
            options.auth.token = this.token;
        }
        
        this.socket = io(options);
        this.setupBaseListeners();
        this.reattachForwardedListeners();
        return this.socket;
    }

    setupBaseListeners() {
        this.socket.on('connect', () => {
            const transport = this.socket.io.engine?.transport?.name || 'unknown';
            console.log(`✅ [CLIENT_CONNECT] socket=${this.socket.id}, transport=${transport}`);
            this.connected = true;
            this.reconnectAttempts = 0;
            
            localStorage.setItem('socketId', this.socket.id);
            
            const oldSocketId = localStorage.getItem('previousSocketId');
            const reconnectToken = localStorage.getItem('reconnectToken');
            const currentRoom = localStorage.getItem('currentRoom');
            
            const isReconnect = oldSocketId && currentRoom && oldSocketId !== this.socket.id;
            
            if (isReconnect) {
                console.log(`🔄 [CLIENT_RECONNECT] old=${oldSocketId} → new=${this.socket.id}, room=${currentRoom}`);
                this.socket.emit('reconnect_attempt', { oldSocketId, reconnectToken });
            }
            
            localStorage.setItem('previousSocketId', this.socket.id);
            
            this.trigger('connected', { socketId: this.socket.id, isReconnect });
        });

        this.socket.on('disconnect', (reason) => {
            const wasConnected = this.connected;
            console.log(`❌ [CLIENT_DISCONNECT] reason=${reason}, wasConnected=${wasConnected}, socket=${this.socket.id}`);
            this.connected = false;
            this.trigger('disconnected', { reason });
        });

        this.socket.io.on('reconnect_attempt', (attempt) => {
            console.log(`🔄 [CLIENT_RECONNECT_ATTEMPT] försök ${attempt}, socket=${this.socket.id}`);
        });

        this.socket.io.on('reconnect', (attempt) => {
            console.log(`✅ [CLIENT_RECONNECT_SUCCESS] efter ${attempt} försök`);
        });

        this.socket.io.on('reconnect_error', (error) => {
            console.error(`🔴 [CLIENT_RECONNECT_ERROR] ${error.message}`);
        });

        this.socket.on('connect_error', (error) => {
            console.error(`🔴 [CLIENT_CONNECT_ERROR] ${error.message}, attempts=${this.reconnectAttempts}`);
            this.reconnectAttempts++;
            this.trigger('error', { message: error.message, attempt: this.reconnectAttempts });
        });

        this.socket.on('error', (data) => {
            console.error('🔴 Serverfel:', data.message);
            this.trigger('server_error', data);
        });
    }

    reattachForwardedListeners() {
        // Ta bort gamla forwarders från tidigare socket
        for (const [event, handler] of this.forwardedHandlers) {
            if (this.socket) {
                this.socket.off(event, handler);
            }
        }
        this.forwardedHandlers.clear();

        // Återanslut alla tidigare forwarders på nya socketen
        for (const event of this.forwardedEvents) {
            const handler = (data) => {
                this.trigger(event, data);
            };
            this.forwardedHandlers.set(event, handler);
            this.socket.on(event, handler);
        }
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        
        // Om vi har en socket och eventet inte redan forwardas, registrera forwarder
        if (this.socket && !this.forwardedEvents.has(event)) {
            this.forwardedEvents.add(event);
            const handler = (data) => {
                this.trigger(event, data);
            };
            this.forwardedHandlers.set(event, handler);
            this.socket.on(event, handler);
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
        this.forwardedHandlers.clear();
    }

    reconnect() {
        this.disconnect();
        return this.connect();
    }
}

const gameSocket = new GameSocket();
window.gameSocket = gameSocket;
