/**
 * Shared game utilities — pure pair-finding logic used by both
 * GameEngine and AIPlayer to avoid duplication.
 */

/**
 * Find all pairs (matching ranks) in a hand without mutating anything.
 * @param {Array} hand — array of card objects with `.rank` and `.id`
 * @returns {Array} array of pairs, each pair is [cardA, cardB]
 */
function findPairs(hand) {
    const pairs = [];
    const byRank = {};

    hand.forEach(card => {
        if (!byRank[card.rank]) {
            byRank[card.rank] = [];
        }
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

/**
 * Extract pairs from a player's hand, add them to player.pairs,
 * optionally push them to a shared pile, and remove them from the hand.
 * Mutates `player.hand` and `player.pairs`; optionally mutates `pile`.
 * Works for both GameEngine player objects and AIPlayer instances.
 *
 * @param {Object} player — object with `.hand[]` and `.pairs[]`
 * @param {Array|null} pile — optional shared pile array to push cards into
 * @returns {Array} newly extracted pairs
 */
function extractPairs(player, pile = null) {
    const newPairs = findPairs(player.hand);
    newPairs.forEach(pair => {
        player.pairs.push(pair);
        if (pile) {
            pile.push(...pair);
        }
        player.hand = player.hand.filter(c => !pair.some(p => p.id === c.id));
    });
    return newPairs;
}

module.exports = { findPairs, extractPairs };
