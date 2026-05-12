class ELOSystem {
    constructor(kFactor = 32) {
        this.kFactor = kFactor;
    }

    calculateExpectedScore(ratingA, ratingB) {
        return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    }

    calculateNewRatings(ratings, positions) {
        const newRatings = [];
        const n = ratings.length;
        
        for (let i = 0; i < n; i++) {
            let ratingChange = 0;
            const playerA = ratings[i];
            
            for (let j = 0; j < n; j++) {
                if (i === j) continue;
                const playerB = ratings[j];
                
                const expectedA = this.calculateExpectedScore(playerA.rating, playerB.rating);
                
                let actualScore;
                if (positions[i].position < positions[j].position) {
                    actualScore = 1;
                } else if (positions[i].position > positions[j].position) {
                    actualScore = 0;
                } else {
                    actualScore = 0.5;
                }
                
                ratingChange += this.kFactor * (actualScore - expectedA);
            }
            
            ratingChange = ratingChange / (n - 1);
            
            if (Math.abs(ratingChange) < 1) {
                ratingChange = ratingChange >= 0 ? 1 : -1;
            }
            
            newRatings.push({
                userId: playerA.userId,
                oldRating: playerA.rating,
                newRating: Math.round(playerA.rating + ratingChange),
                change: Math.round(ratingChange)
            });
        }
        
        return newRatings;
    }

    calculate1v1(winnerRating, loserRating, draw = false) {
        const expectedWinner = this.calculateExpectedScore(winnerRating, loserRating);
        const expectedLoser = this.calculateExpectedScore(loserRating, winnerRating);
        
        const actualWinner = draw ? 0.5 : 1;
        const actualLoser = draw ? 0.5 : 0;
        
        const winnerChange = Math.round(this.kFactor * (actualWinner - expectedWinner));
        const loserChange = Math.round(this.kFactor * (actualLoser - expectedLoser));
        
        return {
            winnerNew: winnerRating + winnerChange,
            loserNew: loserRating + loserChange,
            winnerChange,
            loserChange
        };
    }
}

module.exports = new ELOSystem();
