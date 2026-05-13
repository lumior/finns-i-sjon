const ELO = require('../../server/utils/elo');

describe('ELO', () => {
    test('should calculate rating change for winner vs loser', () => {
        const ratings = [
            { userId: 1, rating: 1500 },
            { userId: 2, rating: 1500 }
        ];
        const positions = [
            { userId: 1, position: 1 },
            { userId: 2, position: 2 }
        ];

        const result = ELO.calculateNewRatings(ratings, positions);

        expect(result).toHaveLength(2);
        const winner = result.find(r => r.userId === 1);
        const loser = result.find(r => r.userId === 2);

        expect(winner.newRating).toBeGreaterThan(winner.oldRating);
        expect(loser.newRating).toBeLessThan(loser.oldRating);
        expect(winner.change).toBeGreaterThan(0);
        expect(loser.change).toBeLessThan(0);
    });

    test('should give more points for upset win', () => {
        const ratings = [
            { userId: 1, rating: 1200 },
            { userId: 2, rating: 1800 }
        ];
        const positions = [
            { userId: 1, position: 1 },
            { userId: 2, position: 2 }
        ];

        const result = ELO.calculateNewRatings(ratings, positions);

        const winner = result.find(r => r.userId === 1);
        const loser = result.find(r => r.userId === 2);

        expect(winner.change).toBeGreaterThan(15);
        expect(loser.change).toBeLessThan(-15);
    });

    test('should handle 3+ players', () => {
        const ratings = [
            { userId: 1, rating: 1500 },
            { userId: 2, rating: 1500 },
            { userId: 3, rating: 1500 }
        ];
        const positions = [
            { userId: 1, position: 1 },
            { userId: 2, position: 2 },
            { userId: 3, position: 3 }
        ];

        const result = ELO.calculateNewRatings(ratings, positions);

        expect(result).toHaveLength(3);
        expect(result[0].newRating).toBeGreaterThan(1500);
        expect(result[2].newRating).toBeLessThan(1500);
    });

    test('should keep sum of ratings approximately constant', () => {
        const ratings = [
            { userId: 1, rating: 1500 },
            { userId: 2, rating: 1500 }
        ];
        const positions = [
            { userId: 1, position: 1 },
            { userId: 2, position: 2 }
        ];

        const result = ELO.calculateNewRatings(ratings, positions);

        const sumBefore = ratings.reduce((s, r) => s + r.rating, 0);
        const sumAfter = result.reduce((s, r) => s + r.newRating, 0);
        expect(sumAfter).toBe(sumBefore);
    });
});
