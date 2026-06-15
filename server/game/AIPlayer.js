class AIPlayer {
    constructor(difficulty = 'smart', name = 'AI-Spelare') {
        this.difficulty = difficulty;
        this.name = name;
        this.id = `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.socketId = this.id;
        this.hand = [];
        this.pairs = [];
        this.connected = true;

        this.memory = {
            askedCards: new Map(),
            givenCards: new Map(),
            missingCards: new Map(),
            fishedCards: [],
            handSizes: new Map(),
            patterns: new Map()
        };

        // Begränsa AI-minnet: mänskliga spelare kommer inte ihåg allt
        this.memoryCapacity =
            difficulty === 'master' ? 25 : difficulty === 'expert' ? 18 : difficulty === 'smart' ? 12 : 6;

        this.turnCount = 0;
        this.consecutiveAsks = 0;
    }

    makeDecision(gameState, allPlayers) {
        this.turnCount++;

        const opponents = allPlayers.filter(p => p.id !== this.id && p.connected);
        if (opponents.length === 0) {
            return null;
        }

        const myPairIds = [...new Set(this.hand.map(c => c.pairId))];
        if (myPairIds.length === 0) {
            return null;
        }

        switch (this.difficulty) {
            case 'naive':
                return this.naiveStrategy(opponents, myPairIds);
            case 'smart':
                return this.smartStrategy(opponents, myPairIds, gameState);
            case 'expert':
                return this.expertStrategy(opponents, myPairIds, gameState);
            case 'master':
                return this.masterStrategy(opponents, myPairIds, gameState);
            default:
                return this.smartStrategy(opponents, myPairIds, gameState);
        }
    }

    naiveStrategy(opponents, myPairIds) {
        const target = opponents[Math.floor(Math.random() * opponents.length)];
        const pairId = myPairIds[Math.floor(Math.random() * myPairIds.length)];

        return {
            targetId: target.id,
            targetSocketId: target.socketId || target.id,
            pairId,
            confidence: 0.25,
            reasoning: 'Slumpmässigt val'
        };
    }

    smartStrategy(opponents, myPairIds, _gameState) {
        let bestChoice = null;
        let bestScore = -1;

        for (const pairId of myPairIds) {
            for (const opponent of opponents) {
                let score = 0;
                const oppId = opponent.id;

                const asked = this.memory.askedCards.get(oppId);
                if (asked && asked[pairId]) {
                    score += asked[pairId].count * 15;
                    if (asked[pairId].count >= 2) {
                        score += 25;
                    }
                }

                const missing = this.memory.missingCards.get(oppId);
                if (missing && missing.has(pairId)) {
                    score -= 50;
                }

                const given = this.memory.givenCards.get(oppId);
                if (given && given.has(pairId)) {
                    score -= 30;
                }

                score += opponent.cardCount * 2;

                const myCount = this.hand.filter(c => c.pairId === pairId).length;
                if (myCount === 1) {
                    score += 40;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestChoice = {
                        targetId: opponent.id,
                        targetSocketId: opponent.socketId || opponent.id,
                        pairId,
                        confidence: Math.min(score / 100, 0.95),
                        reasoning: `Smart: ${pairId} från ${opponent.name} (score: ${score})`
                    };
                }
            }
        }

        return bestChoice || this.naiveStrategy(opponents, myPairIds);
    }

    expertStrategy(opponents, myPairIds, gameState) {
        const deckRemaining = gameState.deckRemaining;
        const totalCardsInPlay = opponents.reduce((sum, o) => sum + o.cardCount, 0) + this.hand.length;

        let bestChoice = null;
        let bestProbability = -1;

        for (const pairId of myPairIds) {
            const cardsPerPair = 2;
            const myCount = this.hand.filter(c => c.pairId === pairId).length;
            const myPairs = this.pairs.filter(p => p[0].pairId === pairId).length * 2;
            const observed = this.countObservedCards(pairId);
            const remainingOfPair = cardsPerPair - myCount - myPairs - observed;

            if (remainingOfPair <= 0) {
                continue;
            }

            for (const opponent of opponents) {
                let probability = this.calculateProbability(
                    opponent,
                    pairId,
                    remainingOfPair,
                    totalCardsInPlay,
                    deckRemaining
                );

                probability = this.adjustProbabilityWithMemory(opponent.id, pairId, probability);

                const expectedValue = probability * (1 + (opponent.cardCount > 3 ? 1 : 0));

                if (expectedValue > bestProbability) {
                    bestProbability = expectedValue;
                    bestChoice = {
                        targetId: opponent.id,
                        targetSocketId: opponent.socketId || opponent.id,
                        pairId,
                        confidence: probability,
                        reasoning: `Expert: ${(probability * 100).toFixed(1)}% chans att ${opponent.name} har ${pairId}`
                    };
                }
            }
        }

        return bestChoice || this.smartStrategy(opponents, myPairIds, gameState);
    }

    masterStrategy(opponents, myPairIds, gameState) {
        let choice = this.expertStrategy(opponents, myPairIds, gameState);
        if (!choice) {
            return null;
        }

        if (this.turnCount > 5 && Math.random() < 0.15 && this.consecutiveAsks > 2) {
            const baitPairId = myPairIds.find(r => this.hand.filter(c => c.pairId === r).length === 1);
            if (baitPairId) {
                const baitTarget = opponents.reduce(
                    (best, o) => (!best || o.cardCount > best.cardCount ? o : best),
                    null
                );
                if (baitTarget) {
                    choice = {
                        targetId: baitTarget.id,
                        targetSocketId: baitTarget.socketId || baitTarget.id,
                        pairId: baitPairId,
                        confidence: 0.3,
                        reasoning: 'Master: Bait - lura motståndare',
                        isBait: true
                    };
                }
            }
        }

        const exactKnowledge = this.getExactKnowledge();
        if (exactKnowledge.length > 0) {
            const exact = exactKnowledge.find(k => myPairIds.includes(k.pairId));
            if (exact) {
                const target = opponents.find(o => o.id === exact.playerId);
                if (target) {
                    choice = {
                        targetId: target.id,
                        targetSocketId: target.socketId || target.id,
                        pairId: exact.pairId,
                        confidence: 0.98,
                        reasoning: `Master: Exakt kunskap - ${target.name} har ${exact.pairId}`
                    };
                }
            }
        }

        if (gameState.deckRemaining < 10) {
            const richestOpponent = opponents.reduce(
                (best, o) => (!best || o.cardCount > best.cardCount ? o : best),
                null
            );
            if (richestOpponent && richestOpponent.cardCount > 3) {
                const bestPairId =
                    myPairIds.find(r => {
                        const missing = this.memory.missingCards.get(richestOpponent.id);
                        return !missing || !missing.has(r);
                    }) || myPairIds[0];

                choice = {
                    targetId: richestOpponent.id,
                    targetSocketId: richestOpponent.socketId || richestOpponent.id,
                    pairId: bestPairId,
                    confidence: 0.7,
                    reasoning: `Master: Endgame - attackera ${richestOpponent.name}`
                };
            }
        }

        if (this.consecutiveAsks >= 3) {
            choice.confidence *= 1.1;
        }

        return choice;
    }

    calculateProbability(opponent, pairId, remainingOfPair, totalCardsInPlay, deckRemaining) {
        const opponentCards = opponent.cardCount;
        const unknownCards = totalCardsInPlay - this.hand.length + deckRemaining;

        if (unknownCards <= 0) {
            return 0;
        }

        let probability = (remainingOfPair / unknownCards) * Math.min(opponentCards, 3);
        probability = Math.min(probability, 0.95);
        probability = Math.max(probability, 0.05);

        return probability;
    }

    adjustProbabilityWithMemory(playerId, pairId, baseProbability) {
        let adjusted = baseProbability;

        const asked = this.memory.askedCards.get(playerId);
        if (asked && asked[pairId]) {
            adjusted += 0.2 * asked[pairId].count;
        }

        const missing = this.memory.missingCards.get(playerId);
        if (missing && missing.has(pairId)) {
            adjusted *= 0.1;
        }

        const given = this.memory.givenCards.get(playerId);
        if (given && given.has(pairId)) {
            adjusted = 0;
        }

        return Math.min(Math.max(adjusted, 0), 0.98);
    }

    countObservedCards(pairId) {
        let count = 0;
        count += this.memory.fishedCards.filter(c => c === pairId).length;
        for (const given of this.memory.givenCards.values()) {
            if (given.has(pairId)) {
                count++;
            }
        }
        return count;
    }

    getExactKnowledge() {
        const knowledge = [];
        for (const [playerId, asked] of this.memory.askedCards) {
            for (const [pairId, data] of Object.entries(asked)) {
                if (data.count >= 2 && data.lastAsked > Date.now() - 60000) {
                    knowledge.push({ playerId, pairId, certainty: 0.9 });
                }
            }
        }
        return knowledge;
    }

    updateMemory(event) {
        const { type, playerId, targetId, pairId, success, cards } = event;

        if (type === 'ask') {
            if (!this.memory.askedCards.has(playerId)) {
                this.memory.askedCards.set(playerId, {});
            }
            const asked = this.memory.askedCards.get(playerId);
            if (!asked[pairId]) {
                asked[pairId] = { count: 0, lastAsked: Date.now() };
            }
            asked[pairId].count++;
            asked[pairId].lastAsked = Date.now();

            if (success) {
                this.consecutiveAsks++;
                if (!this.memory.givenCards.has(targetId)) {
                    this.memory.givenCards.set(targetId, new Set());
                }
                this.memory.givenCards.get(targetId).add(pairId);
            } else {
                this.consecutiveAsks = 0;
                if (!this.memory.missingCards.has(targetId)) {
                    this.memory.missingCards.set(targetId, new Set());
                }
                this.memory.missingCards.get(targetId).add(pairId);

                if (cards && cards.length > 0) {
                    this.memory.fishedCards.push(...cards.map(c => c.pairId));
                }
            }
        }

        if (!this.memory.handSizes.has(playerId)) {
            this.memory.handSizes.set(playerId, []);
        }
        this.memory.handSizes.get(playerId).push(event.handSize || 0);

        // Glöm gamla minnen — mänskliga spelare kommer inte ihåg allt
        this._pruneMemory();
    }

    _pruneMemory() {
        // Räkna totala antalet "minnesposter"
        let total = this.memory.fishedCards.length;
        for (const asked of this.memory.askedCards.values()) {
            total += Object.keys(asked).length;
        }
        for (const given of this.memory.givenCards.values()) {
            total += given.size;
        }
        for (const missing of this.memory.missingCards.values()) {
            total += missing.size;
        }

        if (total <= this.memoryCapacity) {
            return;
        }

        // Glöm äldsta fiskade par
        const excess = total - this.memoryCapacity;
        if (this.memory.fishedCards.length > 0) {
            const toForget = Math.min(excess, this.memory.fishedCards.length);
            this.memory.fishedCards.splice(0, toForget);
        }

        // Om fortfarande för mycket, glöm äldsta asked-entries
        if (total > this.memoryCapacity) {
            for (const [, asked] of this.memory.askedCards) {
                const entries = Object.entries(asked);
                if (entries.length > 3) {
                    // Sortera efter lastAsked och glöm de äldsta
                    entries.sort((a, b) => a[1].lastAsked - b[1].lastAsked);
                    const toRemove = Math.ceil(entries.length / 4); // glöm 25%
                    for (let i = 0; i < toRemove; i++) {
                        delete asked[entries[i][0]];
                    }
                }
            }
        }
    }

    addCards(cards) {
        this.hand.push(...cards);
    }

    removeCards(pairId) {
        const removed = this.hand.filter(c => c.pairId === pairId);
        this.hand = this.hand.filter(c => c.pairId !== pairId);
        return removed;
    }

    addPairs(pairs) {
        this.pairs.push(...pairs);
    }

    getCardCount() {
        return this.hand.length;
    }

    checkInitialPairs() {
        const pairs = [];
        const byPairId = {};

        this.hand.forEach(card => {
            if (!byPairId[card.pairId]) {
                byPairId[card.pairId] = [];
            }
            byPairId[card.pairId].push(card);
        });

        for (const pairId in byPairId) {
            const cards = byPairId[pairId];
            while (cards.length >= 2) {
                pairs.push([cards.pop(), cards.pop()]);
            }
        }

        pairs.forEach(pair => {
            this.pairs.push(pair);
            this.hand = this.hand.filter(c => !pair.includes(c));
        });

        return pairs;
    }

    findPairs() {
        const pairs = [];
        const byPairId = {};

        this.hand.forEach(card => {
            if (!byPairId[card.pairId]) {
                byPairId[card.pairId] = [];
            }
            byPairId[card.pairId].push(card);
        });

        for (const pairId in byPairId) {
            const cards = byPairId[pairId];
            while (cards.length >= 2) {
                pairs.push([cards.pop(), cards.pop()]);
            }
        }

        return pairs;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            cardCount: this.hand.length,
            pairCount: this.pairs.length,
            connected: this.connected,
            isAI: true,
            difficulty: this.difficulty
        };
    }
}

module.exports = AIPlayer;
