class AudioManager {
    constructor() {
        this.enabled = localStorage.getItem('soundEnabled') !== 'false';
        this.musicEnabled = localStorage.getItem('musicEnabled') === 'true';
        this.initialized = false;
        this.context = null;
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.currentMusic = null;
        this.fishBuffer = null;
        this.fishSoundLoading = false;
        this.fishSoundUrl = '/assets/sounds/bubbles_02.wav';
    }

    async init() {
        if (this.initialized) return;
        
        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.context.createGain();
            this.masterGain.connect(this.context.destination);
            this.masterGain.gain.value = 0.5;
            
            this.sfxGain = this.context.createGain();
            this.sfxGain.connect(this.masterGain);
            this.sfxGain.gain.value = 0.7;
            
            this.musicGain = this.context.createGain();
            this.musicGain.connect(this.masterGain);
            this.musicGain.gain.value = 0.15;
            
            this.initialized = true;
            this.loadFishSound();
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }

    async loadFishSound() {
        if (this.fishBuffer || this.fishSoundLoading || !this.context) {
            return;
        }

        this.fishSoundLoading = true;

        try {
            const response = await fetch(this.fishSoundUrl);
            if (!response.ok) {
                throw new Error(`Kunde inte ladda fiskljud: ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            this.fishBuffer = await this.context.decodeAudioData(arrayBuffer);
        } catch (e) {
            console.warn('Kunde inte ladda bubbelljud:', e);
        } finally {
            this.fishSoundLoading = false;
        }
    }

    resume() {
        if (this.context && this.context.state === 'suspended') {
            this.context.resume().catch(() => {});
        }
    }

    playCardDeal() {
        if (!this.enabled || !this.initialized) return;
        this.resume();
        
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        
        osc.connect(gain);
        gain.connect(this.sfxGain);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, this.context.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.3, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.15);
        
        osc.start(this.context.currentTime);
        osc.stop(this.context.currentTime + 0.15);
    }

    playCardFlip() {
        if (!this.enabled || !this.initialized) return;
        this.resume();
        
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        
        osc.connect(gain);
        gain.connect(this.sfxGain);
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, this.context.currentTime);
        osc.frequency.linearRampToValueAtTime(900, this.context.currentTime + 0.08);
        
        gain.gain.setValueAtTime(0.2, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.1);
        
        osc.start(this.context.currentTime);
        osc.stop(this.context.currentTime + 0.1);
    }

    playSuccess() {
        if (!this.enabled || !this.initialized) return;
        this.resume();
        
        const notes = [523.25, 659.25, 783.99, 1046.50];
        const now = this.context.currentTime;
        
        notes.forEach((freq, i) => {
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();
            
            osc.connect(gain);
            gain.connect(this.sfxGain);
            
            osc.type = 'sine';
            osc.frequency.value = freq;
            
            gain.gain.setValueAtTime(0, now + i * 0.1);
            gain.gain.linearRampToValueAtTime(0.2, now + i * 0.1 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.3);
            
            osc.start(now + i * 0.1);
            osc.stop(now + i * 0.1 + 0.3);
        });
    }

    playFail() {
        if (!this.enabled || !this.initialized) return;
        this.resume();
        
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        
        osc.connect(gain);
        gain.connect(this.sfxGain);
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, this.context.currentTime + 0.3);
        
        gain.gain.setValueAtTime(0.2, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.3);
        
        osc.start(this.context.currentTime);
        osc.stop(this.context.currentTime + 0.3);
    }

    async playFish() {
        if (!this.enabled || !this.initialized) return;
        this.resume();

        await this.loadFishSound();

        if (this.fishBuffer) {
            const source = this.context.createBufferSource();
            const gain = this.context.createGain();

            source.buffer = this.fishBuffer;
            gain.gain.value = 0.6;

            source.connect(gain);
            gain.connect(this.sfxGain);
            source.start(0);
            return;
        }
        
        const bufferSize = this.context.sampleRate * 0.5;
        const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
        }
        
        const noise = this.context.createBufferSource();
        const filter = this.context.createBiquadFilter();
        const gain = this.context.createGain();
        
        noise.buffer = buffer;
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, this.context.currentTime);
        filter.frequency.exponentialRampToValueAtTime(200, this.context.currentTime + 0.3);
        
        gain.gain.setValueAtTime(0.3, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.5);
        
        noise.start(this.context.currentTime);
    }

    playLuckyFish() {
        if (!this.enabled || !this.initialized) return;
        this.resume();
        
        const notes = [880, 1100, 1320];
        const now = this.context.currentTime;
        
        notes.forEach((freq, i) => {
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();
            
            osc.connect(gain);
            gain.connect(this.sfxGain);
            
            osc.type = 'sine';
            osc.frequency.value = freq;
            
            gain.gain.setValueAtTime(0, now + i * 0.15);
            gain.gain.linearRampToValueAtTime(0.25, now + i * 0.15 + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.5);
            
            osc.start(now + i * 0.15);
            osc.stop(now + i * 0.15 + 0.5);
        });
    }

    playTurnStart() {
        if (!this.enabled || !this.initialized) return;
        this.resume();
        
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        
        osc.connect(gain);
        gain.connect(this.sfxGain);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, this.context.currentTime);
        osc.frequency.linearRampToValueAtTime(660, this.context.currentTime + 0.15);
        
        gain.gain.setValueAtTime(0.15, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.2);
        
        osc.start(this.context.currentTime);
        osc.stop(this.context.currentTime + 0.2);
    }

    playAlert() {
        if (!this.enabled || !this.initialized) return;
        this.resume();

        const now = this.context.currentTime;

        // Unik notis-ton: snabb frekvens-sweep uppåt som en pling
        const osc1 = this.context.createOscillator();
        const gain1 = this.context.createGain();
        osc1.connect(gain1);
        gain1.connect(this.sfxGain);

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(700, now);
        osc1.frequency.exponentialRampToValueAtTime(1400, now + 0.07);

        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.22, now + 0.03);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.28);

        osc1.start(now);
        osc1.stop(now + 0.28);

        // Kvint-överton som faller ner för klockliknande efterklang
        const osc2 = this.context.createOscillator();
        const gain2 = this.context.createGain();
        osc2.connect(gain2);
        gain2.connect(this.sfxGain);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(2100, now + 0.06);
        osc2.frequency.exponentialRampToValueAtTime(1050, now + 0.18);

        gain2.gain.setValueAtTime(0, now + 0.06);
        gain2.gain.linearRampToValueAtTime(0.12, now + 0.09);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

        osc2.start(now + 0.06);
        osc2.stop(now + 0.22);
    }

    playGameOver(won) {
        if (!this.enabled || !this.initialized) return;
        this.resume();
        
        if (won) {
            const notes = [523.25, 659.25, 783.99, 1046.50, 783.99, 1046.50];
            const now = this.context.currentTime;
            
            notes.forEach((freq, i) => {
                const osc = this.context.createOscillator();
                const gain = this.context.createGain();
                
                osc.connect(gain);
                gain.connect(this.sfxGain);
                
                osc.type = i < 4 ? 'sine' : 'square';
                osc.frequency.value = freq;
                
                gain.gain.setValueAtTime(0, now + i * 0.15);
                gain.gain.linearRampToValueAtTime(0.25, now + i * 0.15 + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.4);
                
                osc.start(now + i * 0.15);
                osc.stop(now + i * 0.15 + 0.4);
            });
        } else {
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();
            
            osc.connect(gain);
            gain.connect(this.sfxGain);
            
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, this.context.currentTime);
            osc.frequency.exponentialRampToValueAtTime(200, this.context.currentTime + 0.5);
            osc.frequency.exponentialRampToValueAtTime(150, this.context.currentTime + 1);
            
            gain.gain.setValueAtTime(0.15, this.context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 1);
            
            osc.start(this.context.currentTime);
            osc.stop(this.context.currentTime + 1);
        }
    }

    playChat() {
        if (!this.enabled || !this.initialized) return;
        this.resume();
        
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        
        osc.connect(gain);
        gain.connect(this.sfxGain);
        
        osc.type = 'sine';
        osc.frequency.value = 1200;
        
        gain.gain.setValueAtTime(0.1, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.05);
        
        osc.start(this.context.currentTime);
        osc.stop(this.context.currentTime + 0.05);
    }

    playClick() {
        if (!this.enabled || !this.initialized) return;
        this.resume();

        const osc = this.context.createOscillator();
        const gain = this.context.createGain();

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, this.context.currentTime + 0.08);

        gain.gain.setValueAtTime(0.15, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.08);

        osc.start(this.context.currentTime);
        osc.stop(this.context.currentTime + 0.08);
    }

    startBackgroundMusic() {
        if (!this.musicEnabled || !this.initialized) return;
        
        // Stoppa befintlig musik först för att undvika dubbla lager
        this.stopBackgroundMusic();
        
        const now = this.context.currentTime;
        const frequencies = [196, 246.94, 293.66];
        
        frequencies.forEach((freq, i) => {
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();
            const filter = this.context.createBiquadFilter();
            
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.musicGain);
            
            osc.type = 'sine';
            osc.frequency.value = freq;
            
            filter.type = 'lowpass';
            filter.frequency.value = 350;
            filter.Q.value = 1;
            
            gain.gain.value = 0.02;
            
            osc.start(now);
            
            if (!this.currentMusic) this.currentMusic = [];
            this.currentMusic.push({ osc, gain });
        });
    }

    stopBackgroundMusic() {
        if (this.currentMusic) {
            const now = this.context.currentTime;
            this.currentMusic.forEach(({ osc, gain }) => {
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                osc.stop(now + 0.5);
            });
            this.currentMusic = null;
        }
    }

    toggleSound() {
        this.enabled = !this.enabled;
        localStorage.setItem('soundEnabled', this.enabled);
        return this.enabled;
    }

    toggleMusic() {
        this.musicEnabled = !this.musicEnabled;
        localStorage.setItem('musicEnabled', this.musicEnabled);
        
        if (this.musicEnabled) {
            this.startBackgroundMusic();
        } else {
            this.stopBackgroundMusic();
        }
        
        return this.musicEnabled;
    }

    setMasterVolume(volume) {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
        }
    }
}

const audioManager = new AudioManager();

// Försök initiera direkt vid sidladdning
audioManager.init().catch(() => {});

// Resuma vid alla möjliga interaktioner (inte bara klick)
['click', 'touchstart', 'keydown', 'mousedown'].forEach(event => {
    document.addEventListener(event, () => {
        if (!audioManager.initialized) {
            audioManager.init();
        } else {
            audioManager.resume();
        }
    }, { once: true });
});

window.audioManager = audioManager;
