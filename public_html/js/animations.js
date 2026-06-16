class AnimationManager {
    constructor() {
        this.enabled = localStorage.getItem('animationsEnabled') !== 'false';
        this.particleContainer = null;
        this.setupParticleContainer();
    }

    setupParticleContainer() {
        this.particleContainer = document.createElement('div');
        this.particleContainer.className = 'particle-container';
        this.particleContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 9999;
            overflow: hidden;
        `;
        document.body.appendChild(this.particleContainer);
    }

    animateCardDeal(cardElement, delay = 0) {
        if (!this.enabled) return;
        
        cardElement.style.animation = 'none';
        cardElement.offsetHeight;
        cardElement.style.animation = `cardDeal 0.5s ease ${delay}s forwards`;
    }

    animateCardFlip(cardElement) {
        if (!this.enabled) return;
        
        cardElement.style.animation = 'none';
        cardElement.offsetHeight;
        cardElement.style.animation = 'cardFlip 0.6s ease forwards';
    }

    animateCardFly(cardElement, fromRect, toRect, onComplete) {
        if (!this.enabled) {
            if (onComplete) onComplete();
            return;
        }
        
        const clone = cardElement.cloneNode(true);
        clone.style.position = 'fixed';
        clone.style.left = fromRect.left + 'px';
        clone.style.top = fromRect.top + 'px';
        clone.style.width = fromRect.width + 'px';
        clone.style.height = fromRect.height + 'px';
        clone.style.zIndex = '9999';
        clone.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
        
        document.body.appendChild(clone);
        
        requestAnimationFrame(() => {
            clone.style.left = toRect.left + 'px';
            clone.style.top = toRect.top + 'px';
            clone.style.transform = 'rotate(360deg) scale(0.8)';
            clone.style.opacity = '0';
        });
        
        setTimeout(() => {
            clone.remove();
            if (onComplete) onComplete();
        }, 600);
    }

    animateCardReceive(cardElement) {
        if (!this.enabled) return;
        
        cardElement.style.animation = 'none';
        cardElement.offsetHeight;
        cardElement.style.animation = 'cardReceive 0.5s ease forwards';
    }

    animateCardShake(cardElement) {
        if (!this.enabled) return;
        
        cardElement.style.animation = 'none';
        cardElement.offsetHeight;
        cardElement.style.animation = 'cardShake 0.5s ease';
    }

    spawnParticles(x, y, type = 'gold', count = 10) {
        if (!this.enabled) return;
        
        const colors = {
            gold: ['#fbbf24', '#f59e0b', '#fcd34d'],
            blue: ['#60a5fa', '#3b82f6', '#93c5fd'],
            green: ['#34d399', '#10b981', '#6ee7b7'],
            red: ['#f87171', '#ef4444', '#fca5a5']
        };
        
        const particleColors = colors[type] || colors.gold;
        
        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            const size = Math.random() * 8 + 4;
            const color = particleColors[Math.floor(Math.random() * particleColors.length)];
            
            particle.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                background: ${color};
                border-radius: 50%;
                left: ${x}px;
                top: ${y}px;
                pointer-events: none;
                box-shadow: 0 0 ${size * 2}px ${color};
            `;
            
            this.particleContainer.appendChild(particle);
            
            const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
            const velocity = Math.random() * 100 + 50;
            const vx = Math.cos(angle) * velocity;
            const vy = Math.sin(angle) * velocity - 50;
            
            const duration = Math.random() * 800 + 400;
            
            particle.animate([
                { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                { transform: `translate(${vx}px, ${vy}px) scale(0)`, opacity: 0 }
            ], {
                duration,
                easing: 'cubic-bezier(0, .9, .57, 1)'
            }).onfinish = () => particle.remove();
        }
    }

    spawnConfetti() {
        if (!this.enabled) return;
        
        const colors = ['#fbbf24', '#60a5fa', '#34d399', '#f87171', '#a78bfa', '#f472b6'];
        
        for (let i = 0; i < 50; i++) {
            const confetti = document.createElement('div');
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = Math.random() * 10 + 5;
            
            confetti.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size * 0.6}px;
                background: ${color};
                left: ${Math.random() * 100}vw;
                top: -20px;
                pointer-events: none;
                border-radius: 2px;
            `;
            
            this.particleContainer.appendChild(confetti);
            
            const duration = Math.random() * 2000 + 1500;
            const rotation = Math.random() * 720;
            
            confetti.animate([
                { transform: `translateY(0) rotate(0deg)`, opacity: 1 },
                { transform: `translateY(${window.innerHeight + 50}px) rotate(${rotation}deg)`, opacity: 0 }
            ], {
                duration,
                easing: 'linear'
            }).onfinish = () => confetti.remove();
        }
    }

    animateVictory() {
        if (!this.enabled) return;
        
        // Flash the screen
        const flash = document.querySelector('.victory-flash');
        if (flash) {
            flash.animate([
                { opacity: 0.8 },
                { opacity: 0 }
            ], {
                duration: 800,
                easing: 'ease-out'
            });
        }
        
        // Show victory overlay
        const overlay = document.getElementById('victory-overlay');
        if (overlay) {
            overlay.classList.remove('hidden');
            const content = overlay.querySelector('.victory-content');
            if (content) {
                content.style.animation = 'none';
                content.offsetHeight;
                content.style.animation = 'victoryPopIn 1s ease forwards';
            }
            
            // Hide after 4 seconds
            setTimeout(() => {
                overlay.classList.add('hidden');
            }, 4000);
        }
        
        // Massive confetti burst
        const colors = ['#fbbf24', '#f59e0b', '#fcd34d', '#f472b6', '#a78bfa', '#34d399', '#60a5fa', '#f87171'];
        
        // Burst from center
        for (let i = 0; i < 120; i++) {
            const confetti = document.createElement('div');
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = Math.random() * 12 + 4;
            const isCircle = Math.random() > 0.5;
            
            confetti.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${isCircle ? size : size * 0.6}px;
                background: ${color};
                left: 50vw;
                top: 50vh;
                pointer-events: none;
                border-radius: ${isCircle ? '50%' : '2px'};
                box-shadow: 0 0 ${size}px ${color}80;
            `;
            
            this.particleContainer.appendChild(confetti);
            
            const angle = (Math.PI * 2 * i) / 120 + (Math.random() - 0.5) * 0.5;
            const velocity = Math.random() * 400 + 200;
            const vx = Math.cos(angle) * velocity;
            const vy = Math.sin(angle) * velocity - 200;
            const duration = Math.random() * 1500 + 1000;
            const rotation = Math.random() * 1080;
            
            confetti.animate([
                { transform: `translate(0, 0) rotate(0deg) scale(1)`, opacity: 1 },
                { transform: `translate(${vx * 0.5}px, ${vy * 0.5}px) rotate(${rotation * 0.5}deg) scale(1)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${vx}px, ${vy + 400}px) rotate(${rotation}deg) scale(0)`, opacity: 0 }
            ], {
                duration,
                easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
            }).onfinish = () => confetti.remove();
        }
        
        // Floating victory emojis
        const emojis = ['🏆', '🎉', '✨', '🃏', '🎊', '⭐', '🥇', '🎆'];
        emojis.forEach((emoji, index) => {
            setTimeout(() => {
                const el = document.createElement('div');
                el.textContent = emoji;
                el.style.cssText = `
                    position: absolute;
                    left: ${20 + Math.random() * 60}vw;
                    top: 100vh;
                    font-size: ${2 + Math.random() * 2}rem;
                    pointer-events: none;
                    z-index: 9999;
                    filter: drop-shadow(0 0 10px rgba(251, 191, 36, 0.5));
                `;
                
                this.particleContainer.appendChild(el);
                
                el.animate([
                    { transform: 'translateY(0) rotate(0deg) scale(0)', opacity: 0 },
                    { transform: 'translateY(-30vh) rotate(180deg) scale(1.2)', opacity: 1, offset: 0.3 },
                    { transform: `translateY(-${100 + Math.random() * 50}vh) rotate(360deg) scale(1)`, opacity: 0 }
                ], {
                    duration: 3000 + Math.random() * 2000,
                    easing: 'ease-out'
                }).onfinish = () => el.remove();
            }, index * 200);
        });
        
        // Gold sparkles around trophy
        for (let i = 0; i < 30; i++) {
            setTimeout(() => {
                const sparkle = document.createElement('div');
                const size = Math.random() * 6 + 2;
                sparkle.style.cssText = `
                    position: absolute;
                    width: ${size}px;
                    height: ${size}px;
                    background: radial-gradient(circle, #fbbf24, #f59e0b);
                    border-radius: 50%;
                    left: 50vw;
                    top: 40vh;
                    pointer-events: none;
                    box-shadow: 0 0 ${size * 3}px #fbbf24;
                `;
                
                this.particleContainer.appendChild(sparkle);
                
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * 150 + 50;
                const duration = Math.random() * 800 + 600;
                
                sparkle.animate([
                    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                    { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0)`, opacity: 0 }
                ], {
                    duration,
                    easing: 'ease-out'
                }).onfinish = () => sparkle.remove();
            }, i * 50);
        }
    }

    fadeIn(element, duration = 300) {
        if (!this.enabled) {
            element.style.opacity = '1';
            return;
        }
        
        element.style.opacity = '0';
        element.style.transition = `opacity ${duration}ms ease`;
        requestAnimationFrame(() => {
            element.style.opacity = '1';
        });
    }

    fadeOut(element, duration = 300, onComplete) {
        if (!this.enabled) {
            element.style.opacity = '0';
            if (onComplete) onComplete();
            return;
        }
        
        element.style.transition = `opacity ${duration}ms ease`;
        element.style.opacity = '0';
        setTimeout(() => {
            if (onComplete) onComplete();
        }, duration);
    }

    slideIn(element, direction = 'up', duration = 400) {
        if (!this.enabled) return;
        
        const transforms = {
            up: 'translateY(30px)',
            down: 'translateY(-30px)',
            left: 'translateX(30px)',
            right: 'translateX(-30px)'
        };
        
        element.style.transform = transforms[direction] || transforms.up;
        element.style.opacity = '0';
        element.style.transition = `all ${duration}ms ease`;
        
        requestAnimationFrame(() => {
            element.style.transform = 'translate(0)';
            element.style.opacity = '1';
        });
    }

    pulse(element, duration = 2000) {
        if (!this.enabled) return;
        
        element.style.animation = `pulse ${duration}ms ease-in-out infinite`;
    }

    stopPulse(element) {
        element.style.animation = 'none';
    }

    glow(element, color = '#6366f1') {
        if (!this.enabled) return;
        
        element.style.boxShadow = `0 0 20px ${color}40, 0 0 40px ${color}20`;
        element.style.transition = 'box-shadow 0.3s ease';
    }

    stopGlow(element) {
        element.style.boxShadow = 'none';
    }

    animateFishSplash(x, y) {
        if (!this.enabled) return;
        
        const splash = document.createElement('div');
        splash.innerHTML = '🌊';
        splash.style.cssText = `
            position: absolute;
            left: ${x}px;
            top: ${y}px;
            font-size: 3rem;
            pointer-events: none;
            z-index: 9999;
        `;
        
        this.particleContainer.appendChild(splash);
        
        splash.animate([
            { transform: 'scale(0) translateY(20px)', opacity: 0 },
            { transform: 'scale(1.2) translateY(-10px)', opacity: 1, offset: 0.3 },
            { transform: 'scale(1) translateY(0)', opacity: 1, offset: 0.6 },
            { transform: 'scale(0.8) translateY(-20px)', opacity: 0 }
        ], {
            duration: 800,
            easing: 'ease-out'
        }).onfinish = () => splash.remove();
    }

    animatePairMatch(cards) {
        if (!this.enabled) return;
        
        cards.forEach((card, i) => {
            setTimeout(() => {
                card.style.animation = 'none';
                card.offsetHeight;
                card.style.animation = 'pairMatch 0.5s ease';
            }, i * 100);
        });
        
        const rect = cards[0].getBoundingClientRect();
        this.spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, 'gold', 15);
    }

    animateTurnChange(isYourTurn) {
        if (!this.enabled) return;
        
        const indicator = document.getElementById('turn-indicator');
        if (isYourTurn) {
            indicator.classList.add('active');
            this.glow(indicator, '#f59e0b');
            this.spawnParticles(
                window.innerWidth / 2,
                80,
                'gold',
                8
            );
        } else {
            indicator.classList.remove('active');
            this.stopGlow(indicator);
        }
    }

    animateAskSuccess(targetElement) {
        if (!this.enabled) return;
        
        this.animateCardShake(targetElement);
        const rect = targetElement.getBoundingClientRect();
        this.spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, 'green', 12);
    }

    animateAskFail() {
        if (!this.enabled) return;
        
        const hand = document.getElementById('my-hand');
        hand.style.animation = 'cardShake 0.5s ease';
        setTimeout(() => {
            hand.style.animation = '';
        }, 500);
    }

    animatePairPopup(count = 1) {
        if (!this.enabled) return;

        const el = document.createElement('div');
        el.className = 'pair-popup';
        el.innerHTML = `
            <div class="pair-popup-emoji">🃏</div>
            <div class="pair-popup-text">${count > 1 ? count + ' PAR!' : 'PAR!'}</div>
        `;
        document.body.appendChild(el);

        this.spawnParticles(window.innerWidth / 2, window.innerHeight / 2, 'gold', 35);

        setTimeout(() => {
            el.style.animation = 'pairPopupFadeOut 0.4s ease forwards';
            setTimeout(() => el.remove(), 400);
        }, 1800);
    }

    animatePairCards(newPairs) {
        if (!this.enabled || !newPairs || newPairs.length === 0) return;

        const deckTheme = localStorage.getItem('deckTheme') || 'standard';
        const useImageDeck = deckTheme !== 'standard';
        const totalCards = newPairs.reduce((sum, p) => sum + p.length, 0);
        const scaleDown = totalCards > 4 ? 0.8 : 1;

        const container = document.createElement('div');
        container.className = 'pair-cards-popup';

        const firstCard = newPairs[0][0];
        const rankText = firstCard.name || firstCard.pairId || 'PAR';

        let cardsHtml = '';
        newPairs.forEach((pair, pairIdx) => {
            pair.forEach((card, cardIdx) => {
                const displayName = card.name || card.pairId || '';
                const marginLeft = cardIdx === 0 && pairIdx > 0 ? '12px' : (cardIdx === 1 ? '-18px' : '0');
                const zIndex = cardIdx === 1 ? '2' : '1';

                let cardInner;
                if (useImageDeck && card.image) {
                    cardInner = `<img class="pc-card-img" src="${card.image}" alt="${displayName}" data-fallback="${displayName}">`;
                } else {
                    cardInner = `<span class="pc-rank-top">${displayName}</span><span class="pc-suit">🃏</span><span class="pc-rank-bottom">${displayName}</span>`;
                }

                cardsHtml += `
                    <div class="pair-card-mini ${useImageDeck && card.image ? '' : 'black'}" style="margin-left:${marginLeft};z-index:${zIndex};transform:scale(${scaleDown});">
                        ${cardInner}
                    </div>
                `;
            });
        });

        container.innerHTML = `
            <div class="pair-cards-label">${newPairs.length > 1 ? newPairs.length + ' PAR!' : 'PAR!'}</div>
            <div class="pair-cards-row">${cardsHtml}</div>
            <div class="pair-cards-rank">${rankText}</div>
        `;

        document.body.appendChild(container);

        // Fallback vid bildfel (CSP-säkert, ingen inline handler)
        container.querySelectorAll('.pc-card-img').forEach(img => {
            img.addEventListener('error', function onPairImgError() {
                this.style.display = 'none';
                const parent = this.parentElement;
                parent.classList.add('black');
                parent.innerHTML = `<span class="pc-rank-top">${this.dataset.fallback}</span><span class="pc-suit">🃏</span><span class="pc-rank-bottom">${this.dataset.fallback}</span>`;
                this.removeEventListener('error', onPairImgError);
            }, { once: true });
        });

        this.spawnParticles(window.innerWidth / 2, window.innerHeight / 2, 'gold', 30);

        setTimeout(() => {
            container.style.animation = 'pairCardsFadeOut 0.5s ease forwards';
            setTimeout(() => container.remove(), 500);
        }, 2200);
    }

    animateLuckyFish(drawnCard) {
        console.log('🎣 animateLuckyFish running, card:', drawnCard, 'enabled:', this.enabled);
        if (!this.enabled || !drawnCard) {
            console.log('🎣 animateLuckyFish early return — enabled:', this.enabled, 'card:', drawnCard);
            return;
        }

        const container = document.createElement('div');
        container.className = 'lucky-fish-popup';

        const deckTheme = localStorage.getItem('deckTheme') || 'standard';
        const useImageDeck = deckTheme !== 'standard';
        const displayName = drawnCard.name || drawnCard.pairId || '';

        let cardHtml;
        let setupFallback = null;
        if (useImageDeck && drawnCard.image) {
            cardHtml = `<img class="lf-card-img" src="${drawnCard.image}" alt="${displayName}" data-fb-name="${displayName}">`;
            setupFallback = (img) => {
                img.addEventListener('error', function onLuckyFishError() {
                    this.style.display = 'none';
                    const parent = this.parentElement;
                    parent.classList.add('black');
                    parent.innerHTML = `<span class='lf-rank-top'>${this.dataset.fbName}</span><span class='lf-suit'>🃏</span><span class='lf-rank-bottom'>${this.dataset.fbName}</span>`;
                    this.removeEventListener('error', onLuckyFishError);
                }, { once: true });
            };
        } else {
            cardHtml = `<span class="lf-rank-top">${displayName}</span><span class="lf-suit">🃏</span><span class="lf-rank-bottom">${displayName}</span>`;
        }

        container.innerHTML = `
            <div class="lucky-fish-label">🐟 TURFISK!</div>
            <div class="lucky-fish-card ${useImageDeck && drawnCard.image ? '' : 'black'}">
                ${cardHtml}
            </div>
            <div class="lucky-fish-sub">${displayName} — bildade ett par!</div>
        `;
        
        document.body.appendChild(container);
        
        if (setupFallback) {
            const img = container.querySelector('.lf-card-img');
            if (img) setupFallback(img);
        }
        
        // Flasha skärmen guld
        const flash = document.createElement('div');
        flash.style.cssText = 'position:fixed;inset:0;background:rgba(245,158,11,0.2);pointer-events:none;z-index:9998;opacity:0;';
        document.body.appendChild(flash);
        flash.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
        setTimeout(() => flash.remove(), 700);
        
        // Partiklar
        this.spawnParticles(window.innerWidth / 2, window.innerHeight / 2, 'gold', 30);
        this.spawnParticles(window.innerWidth / 2, window.innerHeight / 2 - 60, 'gold', 20);
        
        // Ta bort efter 2.5 sekunder
        setTimeout(() => {
            container.style.animation = 'luckyFishFadeOut 0.5s ease forwards';
            setTimeout(() => container.remove(), 500);
        }, 2500);
    }

    staggerIn(elements, delay = 100) {
        if (!this.enabled) return;
        
        elements.forEach((el, i) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                el.style.transition = 'all 0.4s ease';
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            }, i * delay);
        });
    }

    toggle() {
        this.enabled = !this.enabled;
        localStorage.setItem('animationsEnabled', this.enabled);
        return this.enabled;
    }

    isEnabled() {
        return this.enabled;
    }
}

const animationManager = new AnimationManager();
window.animationManager = animationManager;
