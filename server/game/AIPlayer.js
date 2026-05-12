const { RANKS } = require('../utils/constants');
const { findPairs, extractPairs } = require('./utils');

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
        
        this.turnCount = 0;
        this.consecutiveAsks = 0;
    }

    makeDecision(gameState, allPlayers) {
        this.turnCount++;
        
        const opponents = allPlayers.filter(p => p.id !== this.id && p.connected);
        if (opponents.length === 0) return null;
        
        const myRanks = [...new Set(this.hand.map(c => c.rank))];
        if (myRanks.length === 0) return null;

        switch (this.difficulty) {
            case 'naive': return this.naiveStrategy(opponents, myRanks);
            case 'smart': return this.smartStrategy(opponents, myRanks, gameState);
            case 'expert': return this.expertStrategy(opponents, myRanks, gameState);
            case 'master': return this.masterStrategy(opponents, myRanks, gameState);
            default: return this.smartStrategy(opponents, myRanks, gameState);
        }
    }

    naiveStrategy(opponents, myRanks) {
        const target = opponents[Math.floor(Math.random() * opponents.length)];
        const rank = myRanks[Math.floor(Math.random() * myRanks.length)];
        
        return {
            targetId: target.id,
            targetSocketId: target.socketId || target.id,
            rank,
            confidence: 0.25,
            reasoning: 'Slumpmässigt val'
        };
    }

    smartStrategy(opponents, myRanks, gameState) {
        let bestChoice = null;
        let bestScore = -1;

        for (const rank of myRanks) {
            for (const opponent of opponents) {
                let score = 0;
                const oppId = opponent.id;
                
                const asked = this.memory.askedCards.get(oppId);
                if (asked && asked[rank]) {
                    score += asked[rank].count * 15;
                    if (asked[rank].count >= 2) score += 25;
                }
                
                const missing = this.memory.missingCards.get(oppId);
                if (missing && missing.has(rank)) score -= 50;
                
                const given = this.memory.givenCards.get(oppId);
                if (given && given.has(rank)) score -= 30;
                
                score += opponent.cardCount * 2;
                
                const myCount = this.hand.filter(c => c.rank === rank).length;
                if (myCount === 3) score += 40;
                
                if (score > bestScore) {
                    bestScore = score;
                    bestChoice = {
                        targetId: opponent.id,
                        targetSocketId: opponent.socketId || opponent.id,
                        rank,
                        confidence: Math.min(score / 100, 0.95),
                        reasoning: `Smart: ${rank} från ${opponent.name} (score: ${score})`
                    };
                }
            }
        }
        
        return bestChoice || this.naiveStrategy(opponents, myRanks);
    }

    expertStrategy(opponents, myRanks, gameState) {
        const deckRemaining = gameState.deckRemaining;
        const totalCardsInPlay = opponents.reduce((sum, o) => sum + o.cardCount, 0) + this.hand.length;
        
        let bestChoice = null;
        let bestProbability = -1;

        for (const rank of myRanks) {
            const totalOfRank = 4;
            const myCount = this.hand.filter(c => c.rank === rank).length;
            const myPairs = this.pairs.filter(p => p[0].rank === rank).length * 2;
            const observed = this.countObservedCards(rank);
            const remainingOfRank = totalOfRank - myCount - myPairs - observed;
            
            if (remainingOfRank <= 0) continue;

            for (const opponent of opponents) {
                let probability = this.calculateProbability(
                    opponent, rank, remainingOfRank, totalCardsInPlay, deckRemaining
                );
                
                probability = this.adjustProbabilityWithMemory(opponent.id, rank, probability);
                
                const expectedValue = probability * (1 + (opponent.cardCount > 3 ? 1 : 0));
                
                if (expectedValue > bestProbability) {
                    bestProbability = expectedValue;
                    bestChoice = {
                        targetId: opponent.id,
                        targetSocketId: opponent.socketId || opponent.id,
                        rank,
                        confidence: probability,
                        reasoning: `Expert: ${(probability * 100).toFixed(1)}% chans att ${opponent.name} har ${rank}`
                    };
                }
            }
        }
        
        return bestChoice || this.smartStrategy(opponents, myRanks, gameState);
    }

    masterStrategy(opponents, myRanks, gameState) {
        let choice = this.expertStrategy(opponents, myRanks, gameState);
        if (!choice) return null;
        
        if (this.turnCount > 5 && Math.random() < 0.15 && this.consecutiveAsks > 2) {
            const baitRank = myRanks.find(r => this.hand.filter(c => c.rank === r).length === 1);
            if (baitRank) {
                const baitTarget = opponents.reduce((best, o) => 
                    (!best || o.cardCount > best.cardCount) ? o : best, null);
                if (baitTarget) {
                    choice = {
                        targetId: baitTarget.id,
                        targetSocketId: baitTarget.socketId || baitTarget.id,
                        rank: baitRank,
                        confidence: 0.3,
                        reasoning: 'Master: Bait - lura motståndare',
                        isBait: true
                    };
                }
            }
        }
        
        const exactKnowledge = this.getExactKnowledge();
        if (exactKnowledge.length > 0) {
            const exact = exactKnowledge.find(k => myRanks.includes(k.rank));
            if (exact) {
                const target = opponents.find(o => o.id === exact.playerId);
                if (target) {
                    choice = {
                        targetId: target.id,
                        targetSocketId: target.socketId || target.id,
                        rank: exact.rank,
                        confidence: 0.98,
                        reasoning: `Master: Exakt kunskap - ${target.name} har ${exact.rank}`
                    };
                }
            }
        }
        
        if (gameState.deckRemaining < 10) {
            const richestOpponent = opponents.reduce((best, o) => 
                (!best || o.cardCount > best.cardCount) ? o : best, null);
            if (richestOpponent && richestOpponent.cardCount > 3) {
                const bestRank = myRanks.find(r => {
                    const missing = this.memory.missingCards.get(richestOpponent.id);
                    return !missing || !missing.has(r);
                }) || myRanks[0];
                
                choice = {
                    targetId: richestOpponent.id,
                    targetSocketId: richestOpponent.socketId || richestOpponent.id,
                    rank: bestRank,
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

    calculateProbability(opponent, rank, remainingOfRank, totalCardsInPlay, deckRemaining) {
        const opponentCards = opponent.cardCount;
        const unknownCards = totalCardsInPlay - this.hand.length + deckRemaining;
        
        if (unknownCards <= 0) return 0;
        
        let probability = (remainingOfRank / unknownCards) * Math.min(opponentCards, 3);
        probability = Math.min(probability, 0.95);
        probability = Math.max(probability, 0.05);
        
        return probability;
    }

    adjustProbabilityWithMemory(playerId, rank, baseProbability) {
        let adjusted = baseProbability;
        
        const asked = this.memory.askedCards.get(playerId);
        if (asked && asked[rank]) adjusted += 0.2 * asked[rank].count;
        
        const missing = this.memory.missingCards.get(playerId);
        if (missing && missing.has(rank)) adjusted *= 0.1;
        
        const given = this.memory.givenCards.get(playerId);
        if (given && given.has(rank)) adjusted = 0;
        
        return Math.min(Math.max(adjusted, 0), 0.98);
    }

    countObservedCards(rank) {
        let count = 0;
        count += this.memory.fishedCards.filter(c => c === rank).length;
        for (const given of this.memory.givenCards.values()) {
            if (given.has(rank)) count++;
        }
        return count;
    }

    getExactKnowledge() {
        const knowledge = [];
        for (const [playerId, asked] of this.memory.askedCards) {
            for (const [rank, data] of Object.entries(asked)) {
                if (data.count >= 2 && data.lastAsked > Date.now() - 60000) {
                    knowledge.push({ playerId, rank, certainty: 0.9 });
                }
            }
        }
        return knowledge;
    }

    updateMemory(event) {
        const { type, playerId, targetId, rank, success, cards } = event;
        
        if (type === 'ask') {
            if (!this.memory.askedCards.has(playerId)) {
                this.memory.askedCards.set(playerId, {});
            }
            const asked = this.memory.askedCards.get(playerId);
            if (!asked[rank]) asked[rank] = { count: 0, lastAsked: Date.now() };
            asked[rank].count++;
            asked[rank].lastAsked = Date.now();
            
            if (success) {
                this.consecutiveAsks++;
                if (!this.memory.givenCards.has(targetId)) {
                    this.memory.givenCards.set(targetId, new Set());
                }
                this.memory.givenCards.get(targetId).add(rank);
            } else {
                this.consecutiveAsks = 0;
                if (!this.memory.missingCards.has(targetId)) {
                    this.memory.missingCards.set(targetId, new Set());
                }
                this.memory.missingCards.get(targetId).add(rank);
                
                if (cards && cards.length > 0) {
                    this.memory.fishedCards.push(...cards.map(c => c.rank));
                }
            }
        }
        
        if (!this.memory.handSizes.has(playerId)) {
            this.memory.handSizes.set(playerId, []);
        }
        this.memory.handSizes.get(playerId).push(event.handSize || 0);
    }

    addCards(cards) {
        this.hand.push(...cards);
    }

    removeCards(rank) {
        const removed = this.hand.filter(c => c.rank === rank);
        this.hand = this.hand.filter(c => c.rank !== rank);
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
        const byRank = {};
        
        this.hand.forEach(card => {
            if (!byRank[card.rank]) byRank[card.rank] = [];
            byRank[card.rank].push(card);
        });

        for (const rank in byRank) {
            const cards = byRank[rank];
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
        const byRank = {};
        
        this.hand.forEach(card => {
            if (!byRank[card.rank]) byRank[card.rank] = [];
            byRank[card.rank].push(card);
        });

        for (const rank in byRank) {
            const cards = byRank[rank];
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
