/* ========================================
   FINNS I SJÖN — KORTLEKS-ADMIN JS
   ======================================== */

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_SYMBOLS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 560;

let cardData = {};
let generatedImages = {};

/* ========================================
   INIT
   ======================================== */
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadThemes();
    initCardsEditor();
    bindEvents();
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
            grid.innerHTML = '<p class="loading">Inga teman hittades ännu. Skapa det första!</p>';
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
   KORT-EDITOR
   ======================================== */
function initCardsEditor() {
    const container = document.getElementById('cards-editor');
    container.innerHTML = RANKS.map(rank => `
        <div class="card-editor-item" data-rank="${rank}">
            <div class="card-rank-label">${rank}</div>
            <input type="text" class="card-emoji-input" data-rank="${rank}" placeholder="😊" maxlength="2">
            <input type="file" class="card-file-input" data-rank="${rank}" accept="image/*">
            <div class="card-preview-mini" id="preview-${rank}">
                <span>?</span>
            </div>
        </div>
    `).join('');

    // Bind emoji inputs
    container.querySelectorAll('.card-emoji-input').forEach(input => {
        input.addEventListener('input', e => {
            const rank = e.target.dataset.rank;
            cardData[rank] = { type: 'emoji', value: e.target.value };
            updateMiniPreview(rank);
            // Rensa file-input om emoji skrivs
            const fileInput = container.querySelector(`.card-file-input[data-rank="${rank}"]`);
            if (fileInput) fileInput.value = '';
        });
    });

    // Bind file inputs
    container.querySelectorAll('.card-file-input').forEach(input => {
        input.addEventListener('change', e => {
            const rank = e.target.dataset.rank;
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = ev => {
                cardData[rank] = { type: 'image', value: ev.target.result };
                updateMiniPreview(rank);
                // Rensa emoji-input om bild väljs
                const emojiInput = container.querySelector(`.card-emoji-input[data-rank="${rank}"]`);
                if (emojiInput) emojiInput.value = '';
            };
            reader.readAsDataURL(file);
        });
    });
}

function updateMiniPreview(rank) {
    const el = document.getElementById(`preview-${rank}`);
    const data = cardData[rank];
    if (!data) {
        el.innerHTML = '<span>?</span>';
        return;
    }

    if (data.type === 'emoji') {
        el.innerHTML = data.value || '<span>?</span>';
        el.style.fontSize = '2.5rem';
    } else {
        el.innerHTML = `<img src="${data.value}" alt="${rank}">`;
    }
}

/* ========================================
   CANVAS KORT-RENDERING
   ======================================== */
function renderCardToCanvas(rank, bgColor, gradientType, style) {
    const canvas = document.getElementById('card-canvas');
    const ctx = canvas.getContext('2d');
    const data = cardData[rank];

    // Rensa
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

    // Mönster-prickar för textur
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
        } else if (data.type === 'image' && data.value) {
            // Bilder renderas asynkront — vi returnerar en promise
            return new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    ctx.save();
                    const size = 260;
                    const x = (CANVAS_WIDTH - size) / 2;
                    const y = (CANVAS_HEIGHT - size) / 2;
                    const r = 16;

                    // Rundad rektangel för bild
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
        showToast('Ange ett temanamn först!', 'error');
        return;
    }

    const bgColor = document.getElementById('bg-color').value;
    const gradientType = document.getElementById('bg-gradient').value;

    const previewArea = document.getElementById('preview-area');
    const previewGrid = document.getElementById('preview-grid');
    previewGrid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-secondary);">Genererar förhandsgranskning...</p>';
    previewArea.classList.remove('hidden');

    generatedImages = {};

    for (const rank of RANKS) {
        await renderCardToCanvas(rank, bgColor, gradientType);
        const dataUrl = document.getElementById('card-canvas').toDataURL('image/png');
        generatedImages[rank] = dataUrl;
    }

    previewGrid.innerHTML = RANKS.map(rank => `
        <div class="preview-card">
            <img src="${generatedImages[rank]}" alt="${rank}">
        </div>
    `).join('');

    previewArea.scrollIntoView({ behavior: 'smooth' });
    showToast('Förhandsgranskning klar!');
}

async function generateAndDownload() {
    const themeName = document.getElementById('theme-name').value.trim().toLowerCase();
    if (!themeName) {
        showToast('Ange ett temanamn först!', 'error');
        return;
    }

    if (!/^[a-z0-9-]+$/.test(themeName)) {
        showToast('Temanamnet får bara innehålla små bokstäver, siffror och bindestreck!', 'error');
        return;
    }

    const hasAnyContent = RANKS.some(rank => cardData[rank] && cardData[rank].value);
    if (!hasAnyContent) {
        showToast('Välj minst en emoji eller bild för korten!', 'error');
        return;
    }

    const bgColor = document.getElementById('bg-color').value;
    const gradientType = document.getElementById('bg-gradient').value;

    showToast('Genererar kort...');

    const zip = new JSZip();
    const folder = zip.folder(themeName);

    for (const rank of RANKS) {
        await renderCardToCanvas(rank, bgColor, gradientType);
        const dataUrl = document.getElementById('card-canvas').toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];
        folder.file(`${rank}.png`, base64, { base64: true });
    }

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${themeName}-kortlek.zip`);

    showToast('✅ ZIP-fil nedladdad! Extrahera till public_html/assets/cards/');
}
