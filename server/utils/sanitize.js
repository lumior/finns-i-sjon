/**
 * XSS-sanering för användarinput
 * Konverterar HTML-specialtecken till entities
 */

const entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;'
};

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"'\/]/g, (s) => entityMap[s]);
}

module.exports = { escapeHtml };
