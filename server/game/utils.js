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

/**
 * Deterministically pick a unique avatar for a player based on their name.
 * Same name always gives the same avatar, different names give different avatars.
 * @param {string} name — player name / username
 * @param {string} [currentAvatar] — existing avatar URL (if not default, keep it)
 * @returns {string} avatar URL
 */
function getPlayerAvatar(name, currentAvatar = null) {
    // If player already has a custom non-default avatar, keep it
    if (currentAvatar && !currentAvatar.includes('default-avatar')) {
        return currentAvatar;
    }

    const AVATARS = [
        '/assets/images/avatars/player-1.png',
        '/assets/images/avatars/player-2.png',
        '/assets/images/avatars/player-3.png',
        '/assets/images/avatars/player-4.png',
        '/assets/images/avatars/player-5.png',
        '/assets/images/avatars/player-6.png',
        '/assets/images/avatars/player-7.png',
        '/assets/images/avatars/player-8.png'
    ];

    // Simple hash of the name
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = ((hash << 5) - hash) + name.charCodeAt(i);
        hash |= 0; // Convert to 32-bit int
    }
    const index = Math.abs(hash) % AVATARS.length;
    return AVATARS[index];
}

module.exports = { findPairs, extractPairs, getPlayerAvatar };
