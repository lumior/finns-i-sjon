/* ========================================
   FINNS I SJÖN — KORTLEKS-ADMIN JS
   Hanterar 52 kort (4 färger × 13 valörer)
   ======================================== */

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const SUIT_NAMES = {
    hearts: 'Hjärter',
    diamonds: 'Ruter',
    clubs: 'Klöver',
    spades: 'Spader'
};
const SUIT_ICONS = {
    hearts: '♥️',
    diamonds: '♦️',
    clubs: '♣️',
    spades: '♠️'
};
const SUIT_COLORS = {
    hearts: '#dc2626',
    diamonds: '#dc2626',
    clubs: '#1e293b',
    spades: '#1e293b'
};
const SUIT_FOLDERS = {
    hearts: 'aubergine',
    diamonds: 'radish',
    clubs: 'pepper',
    spades: 'potato'
};
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 560;

let cardData = {
    hearts: {},
    diamonds: {},
    clubs: {},
    spades: {}
};
let rankData = {};
let suitSettings = {
    hearts: { bgColor: '#7c1d1d', gradient: 'radial' },
    diamonds: { bgColor: '#1d3a7c', gradient: 'radial' },
    clubs: { bgColor: '#1d5c1d', gradient: 'radial' },
    spades: { bgColor: '#3d1d5c', gradient: 'radial' }
};
let generatedImages = {};
let activeSuit = 'hearts';
let editMode = 'simple';

/* ========================================
   INIT
   ======================================== */
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadThemes();
    initModeToggle();
    initSimpleEditor();
    initSuitPanels();
    initSuitTabs();
    bindEvents();
    updateModeVisibility();
});

/* ========================================
   TABS
   ======================================== */
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
        });
    });
}

/* ========================================
   LADDA TEMAN
   ======================================== */
async function loadThemes() {
    const grid = document.getElementById('themes-grid');
    const loading = document.getElementById('themes-loading');

    try {
        const res = await fetch('/api/admin/themes');
        const data = await res.json();

        loading.style.display = 'none';

        if (!data.success || data.themes.length === 0) {
            grid.innerHTML = '<p class="loading">Inga teman hittades ännu. Skapa den första kortleken!</p>';
            return;
        }

        grid.innerHTML = data.themes.map(theme => `
            <div class="theme-card">
                <div class="theme-preview">
                    ${theme.preview ? `<img src="${theme.preview}" alt="${theme.name}" onerror="this.style.display='none';this.parentElement.innerHTML='<span class=\\'placeholder\\'>🃏</span>'">` : '<span class="placeholder">🃏</span>'}
                </div>
                <div class="theme-name">${theme.name}</div>
                <div class="theme-meta">
                    <span>${theme.cardCount} kort</span>
                    <span class="badge ${theme.complete ? 'badge-complete' : 'badge-incomplete'}">
                        ${theme.complete ? '✅ Komplett' : `⚠️ ${theme.ranks.length}/13`}
                    </span>
                </div>
            </div>
        `).join('');
    } catch (err) {
        loading.textContent = 'Kunde inte ladda teman. Försök igen senare.';
        console.error(err);
    }
}

/* ========================================
   MODE TOGGLE
   ======================================== */
function initModeToggle() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            switchMode(mode);
        });
    });
}

function switchMode(mode) {
    if (mode === editMode) return;

    if (mode === 'advanced') {
        // Sprid enkla valör-data till alla färger
        syncSimpleToAdvanced();
    } else {
        // Försök hitta gemensamma valörer från avancerat läge
        syncAdvancedToSimple();
    }

    editMode = mode;

    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.mode-btn[data-mode="${mode}"]`).classList.add('active');

    const desc = document.getElementById('mode-description');
    if (mode === 'simple') {
        desc.textContent = 'Sätt en emoji eller bild per valör — alla fyra färger får samma.';
    } else {
        desc.textContent = 'Välj innehåll för varje kort individuellt (52 unika). Du kan fortfarande fylla en hel färg med bulk-knappen.';
    }

    updateModeVisibility();
    updateAllProgress();
}

function updateModeVisibility() {
    const simpleEditor = document.getElementById('simple-editor');
    const suitTabs = document.getElementById('suit-tabs-wrapper');
    const suitPanels = document.getElementById('suit-panels');

    if (editMode === 'simple') {
        simpleEditor.classList.remove('hidden');
        suitTabs.style.display = 'none';
        suitPanels.style.display = 'none';
    } else {
        simpleEditor.classList.add('hidden');
        suitTabs.style.display = 'grid';
        suitPanels.style.display = 'block';
    }
}

function syncSimpleToAdvanced() {
    RANKS.forEach(rank => {
        if (rankData[rank] && rankData[rank].value) {
            SUITS.forEach(suit => {
                cardData[suit][rank] = { ...rankData[rank] };
            });
        }
    });
    SUITS.forEach(suit => {
        RANKS.forEach(rank => updateMiniPreview(suit, rank));
        updateProgress(suit);
    });
}

function syncAdvancedToSimple() {
    RANKS.forEach(rank => {
        const values = SUITS.map(suit => cardData[suit][rank]).filter(Boolean);
        if (values.length === 4 && values.every(v => v.type === values[0].type && v.value === values[0].value)) {
            rankData[rank] = { ...values[0] };
        } else {
            // Ta första icke-tomma värdet, eller rensa
            const first = values.find(v => v && v.value);
            if (first) {
                rankData[rank] = { ...first };
            }
        }
        updateRankPreview(rank);
    });
    updateAllProgress();
}

/* ========================================
   SIMPLE EDITOR (per rank)
   ======================================== */
function initSimpleEditor() {
    const container = document.getElementById('simple-editor');
    container.innerHTML = RANKS.map(rank => `
        <div class="rank-row" data-rank="${rank}">
            <div class="rank-row-label">${rank}</div>
            <div class="rank-row-suits">♥️ ♦️ ♣️ ♠️</div>
            <input type="text" class="rank-emoji-input" data-rank="${rank}" placeholder="😊" maxlength="2">
            <input type="file" class="rank-file-input" data-rank="${rank}" accept="image/*">
            <div class="rank-preview-mini" id="rank-preview-${rank}">
                <span>?</span>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.rank-emoji-input').forEach(input => {
        input.addEventListener('input', e => {
            const rank = e.target.dataset.rank;
            rankData[rank] = { type: 'emoji', value: e.target.value };
            updateRankPreview(rank);
            const fileInput = container.querySelector(`.rank-file-input[data-rank="${rank}"]`);
            if (fileInput) fileInput.value = '';
            updateAllProgress();
        });
    });

    container.querySelectorAll('.rank-file-input').forEach(input => {
        input.addEventListener('change', e => {
            const rank = e.target.dataset.rank;
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = ev => {
                rankData[rank] = { type: 'image', value: ev.target.result };
                updateRankPreview(rank);
                const emojiInput = container.querySelector(`.rank-emoji-input[data-rank="${rank}"]`);
                if (emojiInput) emojiInput.value = '';
                updateAllProgress();
            };
            reader.readAsDataURL(file);
        });
    });
}

function updateRankPreview(rank) {
    const el = document.getElementById(`rank-preview-${rank}`);
    const data = rankData[rank];
    if (!data || !data.value) {
        el.innerHTML = '<span>?</span>';
        return;
    }
    if (data.type === 'emoji') {
        el.innerHTML = data.value;
    } else {
        el.innerHTML = `<img src="${data.value}" alt="${rank}">`;
    }
}

function updateAllProgress() {
    if (editMode === 'simple') {
        const filled = RANKS.filter(rank => rankData[rank] && rankData[rank].value).length;
        document.getElementById('mode-description').textContent =
            `Sätt en emoji eller bild per valör — ${filled}/13 ifyllda. Alla fyra färger får samma.`;
    }
}

/* ========================================
   SUIT PANELS
   ======================================== */
function initSuitTabs() {
    document.querySelectorAll('.suit-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const suit = btn.dataset.suit;
            switchSuit(suit);
        });
    });
}

function switchSuit(suit) {
    activeSuit = suit;
    document.querySelectorAll('.suit-tab').forEach(b => b.classList.remove('active'));
    document.querySelector(`.suit-tab[data-suit="${suit}"]`).classList.add('active');

    document.querySelectorAll('.suit-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`panel-${suit}`).classList.add('active');
}

function initSuitPanels() {
    const container = document.getElementById('suit-panels');
    container.innerHTML = SUITS.map(suit => `
        <div class="suit-panel ${suit === 'hearts' ? 'active' : ''}" id="panel-${suit}">
            <div class="suit-panel-header">
                <h3>${SUIT_ICONS[suit]} ${SUIT_NAMES[suit]}</h3>
                <span class="progress" id="progress-${suit}">0/13 ifyllda</span>
            </div>

            <div class="form-row" style="margin-bottom:12px;">
                <div class="form-group" style="margin-bottom:0;">
                    <label>Bakgrundsfärg</label>
                    <input type="color" class="suit-bg-color" data-suit="${suit}" value="${suitSettings[suit].bgColor}">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label>Gradient</label>
                    <select class="suit-gradient" data-suit="${suit}">
                        <option value="none" ${suitSettings[suit].gradient === 'none' ? 'selected' : ''}>Solid</option>
                        <option value="linear-down" ${suitSettings[suit].gradient === 'linear-down' ? 'selected' : ''}>Ljusare nedåt</option>
                        <option value="linear-up" ${suitSettings[suit].gradient === 'linear-up' ? 'selected' : ''}>Ljusare uppåt</option>
                        <option value="radial" ${suitSettings[suit].gradient === 'radial' ? 'selected' : ''}>Radial (mitten)</option>
                    </select>
                </div>
            </div>

            <div class="bulk-fill">
                <label>Fyll alla med emoji:</label>
                <input type="text" class="bulk-emoji" data-suit="${suit}" placeholder="t.ex. 🚗" maxlength="2">
                <button class="bulk-btn" data-suit="${suit}">Fyll alla</button>
            </div>

            <div class="cards-editor" id="editor-${suit}"></div>
        </div>
    `).join('');

    // Initiera editors för varje suit
    SUITS.forEach(suit => initCardsEditor(suit));

    // Bind suit settings
    document.querySelectorAll('.suit-bg-color').forEach(input => {
        input.addEventListener('input', e => {
            suitSettings[e.target.dataset.suit].bgColor = e.target.value;
        });
    });
    document.querySelectorAll('.suit-gradient').forEach(input => {
        input.addEventListener('change', e => {
            suitSettings[e.target.dataset.suit].gradient = e.target.value;
        });
    });

    // Bind bulk fill
    document.querySelectorAll('.bulk-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const suit = e.target.dataset.suit;
            const emoji = document.querySelector(`.bulk-emoji[data-suit="${suit}"]`).value.trim();
            if (!emoji) return;
            RANKS.forEach(rank => {
                cardData[suit][rank] = { type: 'emoji', value: emoji };
                updateMiniPreview(suit, rank);
            });
            updateProgress(suit);
            showToast(`${SUIT_NAMES[suit]} fylld med ${emoji}!`);
        });
    });
}

function initCardsEditor(suit) {
    const container = document.getElementById(`editor-${suit}`);
    container.innerHTML = RANKS.map(rank => `
        <div class="card-editor-item" data-rank="${rank}">
            <div class="card-rank-label">${rank}</div>
            <input type="text" class="card-emoji-input" data-suit="${suit}" data-rank="${rank}" placeholder="😊" maxlength="2">
            <input type="file" class="card-file-input" data-suit="${suit}" data-rank="${rank}" accept="image/*">
            <div class="card-preview-mini" id="preview-${suit}-${rank}">
                <span>?</span>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.card-emoji-input').forEach(input => {
        input.addEventListener('input', e => {
            const s = e.target.dataset.suit;
            const rank = e.target.dataset.rank;
            cardData[s][rank] = { type: 'emoji', value: e.target.value };
            updateMiniPreview(s, rank);
            const fileInput = container.querySelector(`.card-file-input[data-suit="${s}"][data-rank="${rank}"]`);
            if (fileInput) fileInput.value = '';
            updateProgress(s);
        });
    });

    container.querySelectorAll('.card-file-input').forEach(input => {
        input.addEventListener('change', e => {
            const s = e.target.dataset.suit;
            const rank = e.target.dataset.rank;
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = ev => {
                cardData[s][rank] = { type: 'image', value: ev.target.result };
                updateMiniPreview(s, rank);
                const emojiInput = container.querySelector(`.card-emoji-input[data-suit="${s}"][data-rank="${rank}"]`);
                if (emojiInput) emojiInput.value = '';
                updateProgress(s);
            };
            reader.readAsDataURL(file);
        });
    });
}

function updateMiniPreview(suit, rank) {
    const el = document.getElementById(`preview-${suit}-${rank}`);
    const data = cardData[suit][rank];
    if (!data) {
        el.innerHTML = '<span>?</span>';
        return;
    }
    if (data.type === 'emoji') {
        el.innerHTML = data.value || '<span>?</span>';
    } else {
        el.innerHTML = `<img src="${data.value}" alt="${rank}">`;
    }
}

function updateProgress(suit) {
    const filled = RANKS.filter(rank => cardData[suit][rank] && cardData[suit][rank].value).length;
    document.getElementById(`progress-${suit}`).textContent = `${filled}/13 ifyllda`;
}

/* ========================================
   CANVAS KORT-RENDERING
   ======================================== */
function renderCardToCanvas(rank, suit) {
    const canvas = document.getElementById('card-canvas');
    const ctx = canvas.getContext('2d');
    // Avancerat läge har prio; fallback till enkelt läge per valör
    const data = cardData[suit][rank] || rankData[rank];
    const settings = suitSettings[suit];
    const bgColor = settings.bgColor;
    const gradientType = settings.gradient;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Bakgrund
    ctx.save();
    if (gradientType === 'linear-down') {
        const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        grad.addColorStop(0, bgColor);
        grad.addColorStop(1, lightenColor(bgColor, 30));
        ctx.fillStyle = grad;
    } else if (gradientType === 'linear-up') {
        const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        grad.addColorStop(0, lightenColor(bgColor, 30));
        grad.addColorStop(1, bgColor);
        ctx.fillStyle = grad;
    } else if (gradientType === 'radial') {
        const grad = ctx.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 20, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH);
        grad.addColorStop(0, lightenColor(bgColor, 40));
        grad.addColorStop(1, bgColor);
        ctx.fillStyle = grad;
    } else {
        ctx.fillStyle = bgColor;
    }
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();

    // Textur-prickar
    ctx.save();
    ctx.globalAlpha = 0.03;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 80; i++) {
        const x = Math.random() * CANVAS_WIDTH;
        const y = Math.random() * CANVAS_HEIGHT;
        const r = Math.random() * 3 + 1;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // Ram
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, CANVAS_WIDTH - 24, CANVAS_HEIGHT - 24);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, CANVAS_WIDTH - 36, CANVAS_HEIGHT - 36);
    ctx.restore();

    // Rank — övre vänster
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 8;
    ctx.font = 'bold 42px -apple-system, sans-serif';
    ctx.fillText(rank, 28, 58);
    ctx.restore();

    // Rank — nedre höger (roterad)
    ctx.save();
    ctx.translate(CANVAS_WIDTH - 28, CANVAS_HEIGHT - 58);
    ctx.rotate(Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 8;
    ctx.font = 'bold 42px -apple-system, sans-serif';
    ctx.fillText(rank, 0, 0);
    ctx.restore();

    // Huvudinnehåll
    if (data) {
        if (data.type === 'emoji' && data.value) {
            ctx.save();
            ctx.font = '180px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.3)';
            ctx.shadowBlur = 20;
            ctx.fillText(data.value, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
            ctx.restore();
            return Promise.resolve();
        } else if (data.type === 'image' && data.value) {
            return new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    ctx.save();
                    const size = 260;
                    const x = (CANVAS_WIDTH - size) / 2;
                    const y = (CANVAS_HEIGHT - size) / 2;
                    const r = 16;

                    ctx.beginPath();
                    ctx.moveTo(x + r, y);
                    ctx.lineTo(x + size - r, y);
                    ctx.quadraticCurveTo(x + size, y, x + size, y + r);
                    ctx.lineTo(x + size, y + size - r);
                    ctx.quadraticCurveTo(x + size, y + size, x + size - r, y + size);
                    ctx.lineTo(x + r, y + size);
                    ctx.quadraticCurveTo(x, y + size, x, y + size - r);
                    ctx.lineTo(x, y + r);
                    ctx.quadraticCurveTo(x, y, x + r, y);
                    ctx.closePath();
                    ctx.clip();

                    ctx.drawImage(img, x, y, size, size);
                    ctx.restore();

                    // Ram runt bilden
                    ctx.save();
                    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(x + r, y);
                    ctx.lineTo(x + size - r, y);
                    ctx.quadraticCurveTo(x + size, y, x + size, y + r);
                    ctx.lineTo(x + size, y + size - r);
                    ctx.quadraticCurveTo(x + size, y + size, x + size - r, y + size);
                    ctx.lineTo(x + r, y + size);
                    ctx.quadraticCurveTo(x, y + size, x, y + size - r);
                    ctx.lineTo(x, y + r);
                    ctx.quadraticCurveTo(x, y, x + r, y);
                    ctx.closePath();
                    ctx.stroke();
                    ctx.restore();

                    resolve();
                };
                img.onerror = resolve;
                img.src = data.value;
            });
        }
    }

    return Promise.resolve();
}

/* ========================================
   HJÄLPFUNKTIONER
   ======================================== */
function lightenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
    const B = Math.min(255, (num & 0x0000ff) + amt);
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/* ========================================
   EVENTS
   ======================================== */
function bindEvents() {
    document.getElementById('preview-btn').addEventListener('click', generatePreviews);
    document.getElementById('generate-btn').addEventListener('click', generateAndDownload);
}

async function generatePreviews() {
    const themeName = document.getElementById('theme-name').value.trim().toLowerCase();
    if (!themeName) {
        showToast('Ange ett namn på kortleken först!', 'error');
        return;
    }

    if (editMode === 'simple') {
        syncSimpleToAdvanced();
    }

    const previewArea = document.getElementById('preview-area');
    const previewSuits = document.getElementById('preview-suits');
    previewSuits.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:2rem;">Genererar 52 kort...</p>';
    previewArea.classList.remove('hidden');

    generatedImages = {};
    let html = '';

    for (const suit of SUITS) {
        generatedImages[suit] = {};
        for (const rank of RANKS) {
            await renderCardToCanvas(rank, suit);
            generatedImages[suit][rank] = document.getElementById('card-canvas').toDataURL('image/png');
        }

        html += `
            <div class="preview-suit">
                <h4>${SUIT_ICONS[suit]} ${SUIT_NAMES[suit]}</h4>
                <div class="preview-grid">
                    ${RANKS.map(rank => `
                        <div class="preview-card">
                            <img src="${generatedImages[suit][rank]}" alt="${rank} ${suit}">
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    previewSuits.innerHTML = html;
    previewArea.scrollIntoView({ behavior: 'smooth' });
    showToast('✅ Förhandsgranskning av alla 52 kort klar!');
}

async function generateAndDownload() {
    const themeName = document.getElementById('theme-name').value.trim().toLowerCase();
    if (!themeName) {
        showToast('Ange ett namn på kortleken först!', 'error');
        return;
    }

    if (!/^[a-z0-9-]+$/.test(themeName)) {
        showToast('Namnet får bara innehålla små bokstäver, siffror och bindestreck!', 'error');
        return;
    }

    const hasAnyContent = SUITS.some(suit =>
        RANKS.some(rank => {
            const data = cardData[suit][rank] || rankData[rank];
            return data && data.value;
        })
    );
    if (!hasAnyContent) {
        showToast('Välj minst en emoji eller bild för något kort!', 'error');
        return;
    }

    // Säkerställ att enkelt läge-data finns i cardData innan generering
    if (editMode === 'simple') {
        syncSimpleToAdvanced();
    }

    showToast('Genererar 52 kort... Det kan ta några sekunder.');

    const zip = new JSZip();
    const root = zip.folder(themeName);

    for (const suit of SUITS) {
        const folder = root.folder(SUIT_FOLDERS[suit]);
        for (const rank of RANKS) {
            await renderCardToCanvas(rank, suit);
            const dataUrl = document.getElementById('card-canvas').toDataURL('image/png');
            const base64 = dataUrl.split(',')[1];
            folder.file(`${rank}.png`, base64, { base64: true });
        }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${themeName}-kortlek.zip`);

    showToast('✅ ZIP nedladdad! Extrahera till public_html/assets/cards/');
}
