/* ========================================
   FINNS I SJÖN — KORTLEKS-ADMIN JS
   Hanterar 52 kort (4 färger × 13 valörer)
   ======================================== */

/* global JSZip, saveAs */

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
const SUIT_FOLDERS = {
    hearts: 'aubergine',
    diamonds: 'radish',
    clubs: 'pepper',
    spades: 'potato'
};
const SUIT_ACCENTS = {
    hearts: '#ff6b6b',
    diamonds: '#4dabf7',
    clubs: '#51cf66',
    spades: '#be4bdb'
};

const TEMPLATES = {
    fruit: {
        name: 'Frukt',
        ranks: { A: '🍎', '2': '🍊', '3': '🍇', '4': '🍓', '5': '🍑', '6': '🍒', '7': '🍍', '8': '🥝', '9': '🍋', '10': '🍉', J: '🥭', Q: '🍐', K: '🍌' }
    },
    vegetable: {
        name: 'Grönsaker',
        ranks: { A: '🥕', '2': '🥦', '3': '🌽', '4': '🍆', '5': '🧅', '6': '🥬', '7': '🫑', '8': '🥒', '9': '🍄', '10': '🧄', J: '🌶️', Q: '🫛', K: '🥔' }
    },
    animal: {
        name: 'Djur',
        ranks: { A: '🦁', '2': '🦊', '3': '🐻', '4': '🐼', '5': '🐨', '6': '🐯', '7': '🐷', '8': '🐸', '9': '🐙', '10': '🦉', J: '🦅', Q: '🦋', K: '🐺' }
    },
    vehicle: {
        name: 'Fordon',
        ranks: { A: '🚗', '2': '🚕', '3': '🚌', '4': '🚓', '5': '🚑', '6': '🚒', '7': '🚜', '8': '🚲', '9': '🛵', '10': '🚁', J: '🚂', Q: '✈️', K: '🚀' }
    },
    sport: {
        name: 'Sport',
        ranks: { A: '⚽', '2': '🏀', '3': '🏈', '4': '⚾', '5': '🎾', '6': '🏐', '7': '🏉', '8': '🎱', '9': '🏓', '10': '🏸', J: '🥊', Q: '⛳', K: '🏆' }
    }
};
const RANDOM_EMOJI_POOL = [
    '🍎','🍊','🍇','🍓','🍑','🍒','🍍','🥝','🍋','🍉','🥭','🍐','🍌',
    '🥕','🥦','🌽','🍆','🧅','🥬','🫑','🥒','🍄','🧄','🌶️','🫛','🥔',
    '🦁','🦊','🐻','🐼','🐨','🐯','🐷','🐸','🐙','🦉','🦅','🦋','🐺',
    '🚗','🚕','🚌','🚓','🚑','🚒','🚜','🚲','🛵','🚁','🚂','✈️','🚀',
    '⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥊','⛳','🏆',
    '🌸','🌺','🌻','🌹','🌷','🌵','🌲','🌳','🍁','🍄','🌼','🌿','☘️',
    '⭐','🌙','☀️','☁️','⚡','❄️','🔥','💧','🌈','☂️','🌊','🌍','🪐'
];

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
    hearts: { bgColor: '#7c1d1d', gradient: 'radial', pattern: 'dots', bgImage: null },
    diamonds: { bgColor: '#1d3a7c', gradient: 'radial', pattern: 'dots', bgImage: null },
    clubs: { bgColor: '#1d5c1d', gradient: 'radial', pattern: 'dots', bgImage: null },
    spades: { bgColor: '#3d1d5c', gradient: 'radial', pattern: 'dots', bgImage: null }
};
let generatedImages = {};
let activeSuit = 'hearts';
let editMode = 'simple';

let livePreviewRank = 'A';
let livePreviewSuit = 'hearts';
let livePreviewTimeout = null;

let backSettings = {
    bgColor: '#1a2744',
    pattern: 'crosshatch',
    center: '🎣'
};
let symbolMode = false;

let playtestDeck = [];
let playtestHand = [];
let playtestReady = false;
let playtestGenerating = false;

/* ========================================
   FAS 11: UNDO/REDO + AUTO-SPARA
   ======================================== */
const HISTORY_LIMIT = 50;
let historyStack = [];
let historyIndex = -1;
let historyPaused = false;
let autoSaveInterval = null;
let historyDebounceTimer = null;

function getStateSnapshot() {
    return {
        cardData: JSON.parse(JSON.stringify(cardData)),
        rankData: JSON.parse(JSON.stringify(rankData)),
        suitSettings: JSON.parse(JSON.stringify(suitSettings)),
        backSettings: JSON.parse(JSON.stringify(backSettings)),
        symbolMode: symbolMode,
        themeName: document.getElementById('theme-name') ? document.getElementById('theme-name').value : ''
    };
}

function restoreState(snapshot) {
    historyPaused = true;

    cardData = JSON.parse(JSON.stringify(snapshot.cardData));
    rankData = JSON.parse(JSON.stringify(snapshot.rankData));
    suitSettings = JSON.parse(JSON.stringify(snapshot.suitSettings));
    backSettings = JSON.parse(JSON.stringify(snapshot.backSettings));
    symbolMode = snapshot.symbolMode;

    const themeInput = document.getElementById('theme-name');
    if (themeInput && snapshot.themeName !== undefined) {
        themeInput.value = snapshot.themeName;
    }

    // Synka alla UI
    RANKS.forEach(rank => {
        updateRankPreview(rank);
        const simpleEmoji = document.querySelector(`.rank-emoji-input[data-rank="${rank}"]`);
        const simpleFile = document.querySelector(`.rank-file-input[data-rank="${rank}"]`);
        if (simpleEmoji) {
            simpleEmoji.value = rankData[rank] && rankData[rank].type === 'emoji' ? rankData[rank].value : '';
        }
        if (simpleFile) {
            simpleFile.value = '';
        }
    });

    SUITS.forEach(suit => {
        RANKS.forEach(rank => {
            updateMiniPreview(suit, rank);
            const advEmoji = document.querySelector(`.card-emoji-input[data-suit="${suit}"][data-rank="${rank}"]`);
            const advFile = document.querySelector(`.card-file-input[data-suit="${suit}"][data-rank="${rank}"]`);
            if (advEmoji) {
                const d = cardData[suit][rank];
                advEmoji.value = d && d.type === 'emoji' ? d.value : '';
            }
            if (advFile) {
                advFile.value = '';
            }
        });
        updateProgress(suit);

        const bgInput = document.querySelector(`.suit-bg-color[data-suit="${suit}"]`);
        const gradInput = document.querySelector(`.suit-gradient[data-suit="${suit}"]`);
        const patInput = document.querySelector(`.suit-pattern[data-suit="${suit}"]`);
        if (bgInput) {
            bgInput.value = suitSettings[suit].bgColor;
        }
        if (gradInput) {
            gradInput.value = suitSettings[suit].gradient;
        }
        if (patInput) {
            patInput.value = suitSettings[suit].pattern;
        }
    });

    const backBg = document.getElementById('back-bg-color');
    const backPat = document.getElementById('back-pattern');
    const backCenter = document.getElementById('back-center');
    const symCheck = document.getElementById('symbol-mode-checkbox');
    if (backBg) {
        backBg.value = backSettings.bgColor;
    }
    if (backPat) {
        backPat.value = backSettings.pattern;
    }
    if (backCenter) {
        backCenter.value = backSettings.center || '';
    }
    if (symCheck) {
        symCheck.checked = symbolMode;
    }

    updateAllProgress();
    updateBatchStats();
    updateLivePreview();
    updateCardBackPreview();
    updateHistoryButtons();

    historyPaused = false;
}

function pushHistory() {
    if (historyPaused) {
        return;
    }

    // Debounce: vänta 500ms utan nya ändringar innan vi sparar
    if (historyDebounceTimer) {
        clearTimeout(historyDebounceTimer);
    }
    historyDebounceTimer = setTimeout(() => {
        _doPushHistory();
    }, 500);
}

function _doPushHistory() {
    if (historyPaused) {
        return;
    }

    // Ta bort all framtid om vi är mitt i historiken
    if (historyIndex < historyStack.length - 1) {
        historyStack = historyStack.slice(0, historyIndex + 1);
    }

    historyStack.push(getStateSnapshot());

    // Begränsa historikens storlek
    if (historyStack.length > HISTORY_LIMIT) {
        historyStack.shift();
    } else {
        historyIndex++;
    }

    updateHistoryButtons();
}

function undo() {
    if (historyIndex <= 0) {
        return;
    }
    historyIndex--;
    restoreState(historyStack[historyIndex]);
    showToast('↩️ Ångrade senaste ändring');
}

function redo() {
    if (historyIndex >= historyStack.length - 1) {
        return;
    }
    historyIndex++;
    restoreState(historyStack[historyIndex]);
    showToast('↪️ Gjorde om ändring');
}

function initHistoryKeyboard() {
    document.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if ((e.key === 'y') || (e.key === 'z' && e.shiftKey)) {
                e.preventDefault();
                redo();
            }
        }
    });
}

function initHistoryAutoCapture() {
    // Fånga alla input/change inom creator-tab för historik
    const creatorTab = document.getElementById('creator-tab');
    if (!creatorTab) {
        return;
    }

    let captureTimer = null;
    const triggerCapture = () => {
        if (captureTimer) {
            clearTimeout(captureTimer);
        }
        captureTimer = setTimeout(() => {
            pushHistory();
        }, 600);
    };

    creatorTab.addEventListener('input', e => {
        // Ignorera temanamn-inputen (den sparas separat)
        if (e.target.id === 'theme-name') {
            return;
        }
        triggerCapture();
    });

    creatorTab.addEventListener('change', e => {
        if (e.target.id === 'theme-name') {
            return;
        }
        triggerCapture();
    });

    // Fånga klick på bulk-, template- och batch-knappar
    creatorTab.addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) {
            return;
        }
        const id = btn.id;
        if (id === 'template-apply-btn' || id === 'fill-random-btn' ||
            id === 'clear-all-btn' || id === 'import-config-btn' ||
            id === 'export-config-btn') {
            setTimeout(() => pushHistory(), 100);
        }
    });
}

function updateHistoryButtons() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    if (undoBtn) {
        undoBtn.disabled = historyIndex <= 0;
    }
    if (redoBtn) {
        redoBtn.disabled = historyIndex >= historyStack.length - 1;
    }
}

/* ========================================
   AUTO-SPARA TILL LOCALSTORAGE
   ======================================== */
function autoSave() {
    const draft = {
        version: 2,
        timestamp: Date.now(),
        ...getStateSnapshot()
    };
    try {
        localStorage.setItem('finnsisjon_admin_draft', JSON.stringify(draft));
        updateAutoSaveStatus('Sparad');
    } catch {
        updateAutoSaveStatus('Kunde inte spara', true);
    }
}

function loadAutoSave() {
    try {
        const raw = localStorage.getItem('finnsisjon_admin_draft');
        if (!raw) {
            return null;
        }
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function clearAutoSave() {
    localStorage.removeItem('finnsisjon_admin_draft');
    updateAutoSaveStatus('');
}

function updateAutoSaveStatus(text, isError) {
    const el = document.getElementById('autosave-status');
    if (!el) {
        return;
    }
    el.textContent = text;
    el.classList.toggle('error', !!isError);
}

function promptRestoreDraft() {
    const draft = loadAutoSave();
    if (!draft || !draft.timestamp) {
        return;
    }

    const age = Date.now() - draft.timestamp;
    const hours = Math.floor(age / 3600000);
    const mins = Math.floor((age % 3600000) / 60000);
    const timeText = hours > 0 ? `${hours} tim ${mins} min` : `${mins} min`;

    const hasContent = Object.keys(draft.rankData || {}).length > 0 ||
        SUITS.some(s => Object.keys(draft.cardData[s] || {}).length > 0);

    if (!hasContent) {
        clearAutoSave();
        return;
    }

    if (confirm(`Det finns ett osparat utkast från för ${timeText} sedan. Vill du återställa det?`)) {
        restoreState(draft);
        showToast('📂 Utkast återställt från auto-sparad data');
        setTimeout(() => {
            historyStack = [getStateSnapshot()];
            historyIndex = 0;
            updateHistoryButtons();
        }, 300);
    } else {
        clearAutoSave();
        setTimeout(() => {
            historyStack = [getStateSnapshot()];
            historyIndex = 0;
            updateHistoryButtons();
        }, 100);
    }
}

function startAutoSave() {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
    }
    autoSaveInterval = setInterval(autoSave, 10000);
}

/* ========================================
   INIT
   ======================================== */
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadThemes();
    initModeToggle();
    initTemplates();
    initSymbolMode();
    initSimpleEditor();
    initSuitPanels();
    initSuitTabs();
    initLivePreview();
    initCardBack();
    initConfigIO();
    initPlaytest();
    initBulkUpload();
    initHistoryKeyboard();
    initHistoryAutoCapture();
    bindEvents();
    updateModeVisibility();
    updateLivePreview();
    updateCardBackPreview();
    updateBatchStats();

    // Fas 11: Spara initialt tillstånd i historiken
    pushHistory();

    // Fas 11: Kolla om det finns auto-sparat utkast
    promptRestoreDraft();

    // Fas 11: Starta auto-spara
    startAutoSave();
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
    if (mode === editMode) {return;}

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
function initTemplates() {
    const container = document.getElementById('template-selector');
    if (!container) {
        return;
    }
    container.innerHTML = `
        <label>Välj mall:</label>
        <select id="template-select">
            <option value="">-- Välj en färdig mall --</option>
            ${Object.entries(TEMPLATES).map(([key, t]) => `<option value="${key}">${t.name}</option>`).join('')}
        </select>
        <button id="template-apply-btn" class="template-btn">Applicera</button>
    `;

    document.getElementById('template-apply-btn').addEventListener('click', () => {
        const key = document.getElementById('template-select').value;
        if (!key) {
            showToast('Välj en mall först!', 'error');
            return;
        }
        applyTemplate(key);
    });
}

function applyTemplate(key) {
    const template = TEMPLATES[key];
    if (!template) {
        return;
    }

    // Töm befintlig data
    SUITS.forEach(suit => {
        cardData[suit] = {};
    });
    rankData = {};

    // Fyll med template-data
    RANKS.forEach(rank => {
        const emoji = template.ranks[rank];
        if (emoji) {
            rankData[rank] = { type: 'emoji', value: emoji };
            SUITS.forEach(suit => {
                cardData[suit][rank] = { type: 'emoji', value: emoji };
            });
        }
    });

    // Uppdatera UI
    RANKS.forEach(rank => {
        updateRankPreview(rank);
        const simpleEmojiInput = document.querySelector(`.rank-emoji-input[data-rank="${rank}"]`);
        if (simpleEmojiInput) {
            simpleEmojiInput.value = rankData[rank] ? rankData[rank].value : '';
        }
    });

    SUITS.forEach(suit => {
        RANKS.forEach(rank => {
            updateMiniPreview(suit, rank);
            const advEmojiInput = document.querySelector(`.card-emoji-input[data-suit="${suit}"][data-rank="${rank}"]`);
            if (advEmojiInput) {
                advEmojiInput.value = cardData[suit][rank] ? cardData[suit][rank].value : '';
            }
        });
        updateProgress(suit);
    });

    updateAllProgress();
    updateBatchStats();
    queueLivePreview();
    showToast(`Mallen "${template.name}" applicerad på alla 52 kort!`);
}

function initSymbolMode() {
    const checkbox = document.getElementById('symbol-mode-checkbox');
    if (!checkbox) {
        return;
    }
    checkbox.addEventListener('change', e => {
        symbolMode = e.target.checked;
        queueLivePreview();
        showToast(symbolMode ? '🎴 Symbol-läge aktiverat — inga valörer visas' : '🃏 Standardläge — valörer visas');
    });
}

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
            if (fileInput) {fileInput.value = '';}
            updateAllProgress();
            updateBatchStats();
            livePreviewRank = rank;
            livePreviewSuit = 'hearts';
            queueLivePreview();
        });
    });

    container.querySelectorAll('.rank-file-input').forEach(input => {
        input.addEventListener('change', e => {
            const rank = e.target.dataset.rank;
            const file = e.target.files[0];
            if (!file) {return;}

            const reader = new FileReader();
            reader.onload = ev => {
                rankData[rank] = { type: 'image', value: ev.target.result };
                updateRankPreview(rank);
                const emojiInput = container.querySelector(`.rank-emoji-input[data-rank="${rank}"]`);
                if (emojiInput) {emojiInput.value = '';}
                updateAllProgress();
                updateBatchStats();
                livePreviewRank = rank;
                livePreviewSuit = 'hearts';
                queueLivePreview();
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
                <div class="form-group" style="margin-bottom:0;">
                    <label>Mönster</label>
                    <select class="suit-pattern" data-suit="${suit}">
                        <option value="none" ${suitSettings[suit].pattern === 'none' ? 'selected' : ''}>Inget</option>
                        <option value="dots" ${suitSettings[suit].pattern === 'dots' ? 'selected' : ''}>Prickar</option>
                        <option value="grid" ${suitSettings[suit].pattern === 'grid' ? 'selected' : ''}>Rutnät</option>
                        <option value="diamonds" ${suitSettings[suit].pattern === 'diamonds' ? 'selected' : ''}>Diamanter</option>
                        <option value="waves" ${suitSettings[suit].pattern === 'waves' ? 'selected' : ''}>Vågor</option>
                        <option value="stars" ${suitSettings[suit].pattern === 'stars' ? 'selected' : ''}>Stjärnor</option>
                    </select>
                </div>
            </div>

            <div class="bg-image-row">
                <label>Bakgrundsbild:</label>
                <input type="file" class="suit-bg-image" data-suit="${suit}" accept="image/*">
                <button class="suit-clear-bg" data-suit="${suit}">❌</button>
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
            const suit = e.target.dataset.suit;
            suitSettings[suit].bgColor = e.target.value;
            livePreviewSuit = suit;
            queueLivePreview();
        });
    });
    document.querySelectorAll('.suit-gradient').forEach(input => {
        input.addEventListener('change', e => {
            const suit = e.target.dataset.suit;
            suitSettings[suit].gradient = e.target.value;
            livePreviewSuit = suit;
            queueLivePreview();
        });
    });
    document.querySelectorAll('.suit-pattern').forEach(input => {
        input.addEventListener('change', e => {
            const suit = e.target.dataset.suit;
            suitSettings[suit].pattern = e.target.value;
            livePreviewSuit = suit;
            queueLivePreview();
        });
    });

    // Bind background image upload
    document.querySelectorAll('.suit-bg-image').forEach(input => {
        input.addEventListener('change', e => {
            const suit = e.target.dataset.suit;
            const file = e.target.files[0];
            if (!file) {return;}
            const reader = new FileReader();
            reader.onload = ev => {
                suitSettings[suit].bgImage = ev.target.result;
                livePreviewSuit = suit;
                queueLivePreview();
                showToast(`Bakgrundsbild uppladdad för ${SUIT_NAMES[suit]}!`);
            };
            reader.readAsDataURL(file);
        });
    });

    // Bind clear background image
    document.querySelectorAll('.suit-clear-bg').forEach(btn => {
        btn.addEventListener('click', e => {
            const suit = e.target.dataset.suit;
            suitSettings[suit].bgImage = null;
            const fileInput = document.querySelector(`.suit-bg-image[data-suit="${suit}"]`);
            if (fileInput) {fileInput.value = '';}
            livePreviewSuit = suit;
            queueLivePreview();
            showToast(`Bakgrundsbild borttagen för ${SUIT_NAMES[suit]}`);
        });
    });

    // Bind bulk fill
    document.querySelectorAll('.bulk-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const suit = e.target.dataset.suit;
            const emoji = document.querySelector(`.bulk-emoji[data-suit="${suit}"]`).value.trim();
            if (!emoji) {return;}
            RANKS.forEach(rank => {
                cardData[suit][rank] = { type: 'emoji', value: emoji };
                updateMiniPreview(suit, rank);
            });
            updateProgress(suit);
            updateBatchStats();
            queueLivePreview();
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
            if (fileInput) {fileInput.value = '';}
            updateProgress(s);
            updateBatchStats();
            livePreviewRank = rank;
            livePreviewSuit = s;
            queueLivePreview();
        });
    });

    container.querySelectorAll('.card-file-input').forEach(input => {
        input.addEventListener('change', e => {
            const s = e.target.dataset.suit;
            const rank = e.target.dataset.rank;
            const file = e.target.files[0];
            if (!file) {return;}

            const reader = new FileReader();
            reader.onload = ev => {
                cardData[s][rank] = { type: 'image', value: ev.target.result };
                updateMiniPreview(s, rank);
                const emojiInput = container.querySelector(`.card-emoji-input[data-suit="${s}"][data-rank="${rank}"]`);
                if (emojiInput) {emojiInput.value = '';}
                updateProgress(s);
                updateBatchStats();
                livePreviewRank = rank;
                livePreviewSuit = s;
                queueLivePreview();
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
   CANVAS KORT-RENDERING — FAS 1
   ======================================== */

const CORNER_RADIUS = 24;

function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

async function renderCardBackground(ctx, settings) {
    const bgColor = settings.bgColor;
    const gradientType = settings.gradient;

    ctx.save();
    drawRoundedRect(ctx, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, CORNER_RADIUS);
    ctx.clip();

    // 1. Bakgrundsbild (om uppladdad)
    if (settings.bgImage) {
        await renderBgImage(ctx, settings.bgImage);
    }

    // 2. Grundgradient (ritas ovanpå bild med viss transparens om bild finns)
    if (gradientType === 'linear-down') {
        const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        grad.addColorStop(0, bgColor);
        grad.addColorStop(1, lightenColor(bgColor, 35));
        ctx.fillStyle = grad;
    } else if (gradientType === 'linear-up') {
        const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        grad.addColorStop(0, lightenColor(bgColor, 35));
        grad.addColorStop(1, bgColor);
        ctx.fillStyle = grad;
    } else if (gradientType === 'radial') {
        const grad = ctx.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 10, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH);
        grad.addColorStop(0, lightenColor(bgColor, 50));
        grad.addColorStop(0.6, bgColor);
        grad.addColorStop(1, darkenColor(bgColor, 15));
        ctx.fillStyle = grad;
    } else {
        ctx.fillStyle = bgColor;
    }

    // Om bakgrundsbild finns, lägg en gradient ovanpå med 75% opacitet för att behålla färgkänslan
    if (settings.bgImage) {
        ctx.globalAlpha = 0.75;
    }
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.globalAlpha = 1;

    // 3. Mönster
    renderPattern(ctx, settings);

    // 4. Subtil inre skugga för djup
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, 2, 2, CANVAS_WIDTH - 4, CANVAS_HEIGHT - 4, CORNER_RADIUS - 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.restore();
}

function renderBgImage(ctx, dataUrl) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            // Rita bilden så att den täcker hela kortet (object-fit: cover)
            const scale = Math.max(CANVAS_WIDTH / img.width, CANVAS_HEIGHT / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            const x = (CANVAS_WIDTH - w) / 2;
            const y = (CANVAS_HEIGHT - h) / 2;
            ctx.drawImage(img, x, y, w, h);
            resolve();
        };
        img.onerror = resolve;
        img.src = dataUrl;
    });
}

function renderPattern(ctx, settings) {
    const pattern = settings.pattern || 'none';
    if (pattern === 'none') {
        return;
    }

    ctx.save();
    const bgColor = settings.bgColor;
    const patternColor = lightenColor(bgColor, 60);

    if (pattern === 'dots') {
        ctx.fillStyle = patternColor;
        ctx.globalAlpha = 0.12;
        for (let y = 20; y < CANVAS_HEIGHT; y += 30) {
            for (let x = 20; x < CANVAS_WIDTH; x += 30) {
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    } else if (pattern === 'grid') {
        ctx.strokeStyle = patternColor;
        ctx.globalAlpha = 0.1;
        ctx.lineWidth = 1;
        for (let x = 20; x < CANVAS_WIDTH; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, CANVAS_HEIGHT);
            ctx.stroke();
        }
        for (let y = 20; y < CANVAS_HEIGHT; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(CANVAS_WIDTH, y);
            ctx.stroke();
        }
    } else if (pattern === 'diamonds') {
        ctx.fillStyle = patternColor;
        ctx.globalAlpha = 0.1;
        for (let y = 0; y < CANVAS_HEIGHT + 30; y += 35) {
            for (let x = 0; x < CANVAS_WIDTH + 30; x += 35) {
                const offset = (Math.floor(y / 35) % 2) * 17.5;
                ctx.beginPath();
                ctx.moveTo(x + offset, y - 10);
                ctx.lineTo(x + offset + 10, y);
                ctx.lineTo(x + offset, y + 10);
                ctx.lineTo(x + offset - 10, y);
                ctx.closePath();
                ctx.fill();
            }
        }
    } else if (pattern === 'waves') {
        ctx.strokeStyle = patternColor;
        ctx.globalAlpha = 0.12;
        ctx.lineWidth = 2;
        for (let y = 15; y < CANVAS_HEIGHT; y += 25) {
            ctx.beginPath();
            for (let x = 0; x < CANVAS_WIDTH; x += 10) {
                ctx.lineTo(x, y + Math.sin(x * 0.04) * 8);
            }
            ctx.stroke();
        }
    } else if (pattern === 'stars') {
        ctx.fillStyle = patternColor;
        ctx.globalAlpha = 0.15;
        const starPositions = [
            [40, 40], [120, 90], [200, 50], [280, 110], [360, 40],
            [80, 160], [160, 200], [240, 170], [320, 210], [380, 150],
            [50, 280], [130, 320], [210, 290], [290, 330], [370, 270],
            [90, 400], [180, 440], [260, 410], [340, 450], [380, 390],
            [60, 500], [150, 530], [230, 510], [310, 540]
        ];
        starPositions.forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.08;
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.15;
        });
    }
    ctx.restore();
}

function renderCardBorder(ctx) {
    ctx.save();

    // Yttre guld-liknande ram
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, 14, 14, CANVAS_WIDTH - 28, CANVAS_HEIGHT - 28, CORNER_RADIUS - 8);
    ctx.stroke();

    // Inre accent-linje
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, 22, 22, CANVAS_WIDTH - 44, CANVAS_HEIGHT - 44, CORNER_RADIUS - 14);
    ctx.stroke();

    // Hörn-ornament
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    const ornamentSize = 10;
    const positions = [
        [28, 28], [CANVAS_WIDTH - 28, 28],
        [28, CANVAS_HEIGHT - 28], [CANVAS_WIDTH - 28, CANVAS_HEIGHT - 28]
    ];
    positions.forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, ornamentSize / 2, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.restore();
}

function renderCornerRank(ctx, rank, suit) {
    const suitIcon = SUIT_ICONS[suit];
    const color = '#ffffff';

    // Övre vänster
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.font = 'bold 38px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(rank, 26, 48);
    ctx.font = '24px serif';
    ctx.fillText(suitIcon, 26, 74);
    ctx.restore();

    // Nedre höger (roterad)
    ctx.save();
    ctx.translate(CANVAS_WIDTH - 26, CANVAS_HEIGHT - 48);
    ctx.rotate(Math.PI);
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.font = 'bold 38px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(rank, 0, 0);
    ctx.font = '24px serif';
    ctx.fillText(suitIcon, 0, 26);
    ctx.restore();
}

function getPipPositions(rank) {
    const topY = 105;
    const midTopY = 185;
    const midY = 280;
    const midBotY = 375;
    const botY = 455;
    const leftX = 88;
    const rightX = CANVAS_WIDTH - 88;
    const cx = CANVAS_WIDTH / 2;

    const positions = {
        '2':  [{x: cx, y: topY}, {x: cx, y: botY, rotate: 180}],
        '3':  [{x: cx, y: topY}, {x: cx, y: midY}, {x: cx, y: botY, rotate: 180}],
        '4':  [{x: leftX, y: topY}, {x: rightX, y: topY}, {x: leftX, y: botY, rotate: 180}, {x: rightX, y: botY, rotate: 180}],
        '5':  [{x: leftX, y: topY}, {x: rightX, y: topY}, {x: cx, y: midY}, {x: leftX, y: botY, rotate: 180}, {x: rightX, y: botY, rotate: 180}],
        '6':  [{x: leftX, y: topY}, {x: rightX, y: topY}, {x: leftX, y: midY}, {x: rightX, y: midY}, {x: leftX, y: botY, rotate: 180}, {x: rightX, y: botY, rotate: 180}],
        '7':  [{x: leftX, y: topY}, {x: rightX, y: topY}, {x: cx, y: midTopY}, {x: leftX, y: midY}, {x: rightX, y: midY}, {x: leftX, y: botY, rotate: 180}, {x: rightX, y: botY, rotate: 180}],
        '8':  [{x: leftX, y: topY}, {x: rightX, y: topY}, {x: leftX, y: midTopY}, {x: rightX, y: midTopY}, {x: leftX, y: midBotY, rotate: 180}, {x: rightX, y: midBotY, rotate: 180}, {x: leftX, y: botY, rotate: 180}, {x: rightX, y: botY, rotate: 180}],
        '9':  [{x: leftX, y: topY}, {x: rightX, y: topY}, {x: cx, y: midTopY - 20}, {x: leftX, y: midTopY + 30}, {x: rightX, y: midTopY + 30}, {x: cx, y: midY}, {x: leftX, y: botY, rotate: 180}, {x: rightX, y: botY, rotate: 180}, {x: cx, y: midBotY, rotate: 180}],
        '10': [{x: leftX, y: topY}, {x: rightX, y: topY}, {x: leftX, y: midTopY - 10}, {x: rightX, y: midTopY - 10}, {x: leftX, y: midTopY + 50}, {x: rightX, y: midTopY + 50}, {x: leftX, y: midBotY, rotate: 180}, {x: rightX, y: midBotY, rotate: 180}, {x: leftX, y: botY, rotate: 180}, {x: rightX, y: botY, rotate: 180}]
    };
    return positions[rank] || [];
}

function renderPips(ctx, emoji, positions) {
    ctx.save();
    ctx.font = '52px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 8;

    positions.forEach(pos => {
        ctx.save();
        ctx.translate(pos.x, pos.y);
        if (pos.rotate) {
            ctx.rotate((pos.rotate * Math.PI) / 180);
        }
        ctx.fillText(emoji, 0, 0);
        ctx.restore();
    });
    ctx.restore();
}

function renderFaceCard(ctx, rank, suit, data) {
    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;
    const suitIcon = SUIT_ICONS[suit];
    const accent = SUIT_ACCENTS[suit];

    const titles = {
        A: { label: 'ESS', subtitle: suitIcon, crown: '👑', crown2: '👑', frame: 'elegant' },
        J: { label: 'KNEKT', subtitle: 'Riddare', crown: '⚔️', crown2: '🛡️', frame: 'angular' },
        Q: { label: 'DAM', subtitle: 'Drottning', crown: '👑', crown2: '💎', frame: 'round' },
        K: { label: 'KUNG', subtitle: 'Konung', crown: '👑', crown2: '⚜️', frame: 'royal' }
    };
    const info = titles[rank];

    // === FAS 2: Unik ram per face card ===
    renderFaceCardFrame(ctx, rank, info.frame, accent);

    // === Banner med accent-färg ===
    ctx.save();
    const bannerY = cy - 68;
    const bannerGrad = ctx.createLinearGradient(cx - 130, bannerY, cx + 130, bannerY);
    bannerGrad.addColorStop(0, 'rgba(0,0,0,0)');
    bannerGrad.addColorStop(0.15, hexToRgba(accent, 0.25));
    bannerGrad.addColorStop(0.5, hexToRgba(accent, 0.45));
    bannerGrad.addColorStop(0.85, hexToRgba(accent, 0.25));
    bannerGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bannerGrad;
    ctx.fillRect(cx - 150, bannerY - 22, 300, 44);

    // Övre och nedre linje på bannern
    ctx.strokeStyle = hexToRgba(accent, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 100, bannerY - 22);
    ctx.lineTo(cx + 100, bannerY - 22);
    ctx.moveTo(cx - 100, bannerY + 22);
    ctx.lineTo(cx + 100, bannerY + 22);
    ctx.stroke();
    ctx.restore();

    // === Kronor/ikoner ovanför och under ===
    if (info.crown) {
        ctx.save();
        ctx.font = '36px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = hexToRgba(accent, 0.6);
        ctx.shadowBlur = 12;
        ctx.fillText(info.crown, cx - 30, cy - 118);
        if (info.crown2) {
            ctx.fillText(info.crown2, cx + 30, cy - 118);
        }
        ctx.restore();
    }

    // === Titel ===
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.fillText(info.label, cx, cy - 68);
    ctx.restore();

    // === Subtitle ===
    ctx.save();
    ctx.fillStyle = hexToRgba('#ffffff', 0.85);
    ctx.font = '15px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(info.subtitle, cx, cy - 42);
    ctx.restore();

    // === Kronor under titeln ===
    ctx.save();
    ctx.font = '20px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.4;
    ctx.fillText(suitIcon, cx - 12, cy - 24);
    ctx.fillText(suitIcon, cx + 12, cy - 24);
    ctx.restore();

    // === Huvudinnehåll (emoji eller bild) ===
    if (data && data.value) {
        if (data.type === 'emoji') {
            ctx.save();
            ctx.font = '150px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.35)';
            ctx.shadowBlur = 20;
            ctx.fillText(data.value, cx, cy + 35);
            ctx.restore();
        } else if (data.type === 'image') {
            return renderCenterImage(ctx, data.value, 210);
        }
    }
    return Promise.resolve();
}

function renderFaceCardFrame(ctx, rank, frameType, accent) {
    const pad = 36;
    const w = CANVAS_WIDTH - pad * 2;
    const h = CANVAS_HEIGHT - pad * 2;
    const r = frameType === 'round' ? 60 : (frameType === 'royal' ? 8 : 20);

    ctx.save();

    if (frameType === 'elegant') {
        // A = dubbel rundad ram med guld-känsla
        ctx.strokeStyle = hexToRgba(accent, 0.5);
        ctx.lineWidth = 2;
        drawRoundedRect(ctx, pad, pad, w, h, r);
        ctx.stroke();
        ctx.strokeStyle = hexToRgba(accent, 0.25);
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, pad + 6, pad + 6, w - 12, h - 12, r - 4);
        ctx.stroke();
        // Hörn-prickar
        ctx.fillStyle = hexToRgba(accent, 0.6);
        const corners = [
            [pad + 10, pad + 10], [CANVAS_WIDTH - pad - 10, pad + 10],
            [pad + 10, CANVAS_HEIGHT - pad - 10], [CANVAS_WIDTH - pad - 10, CANVAS_HEIGHT - pad - 10]
        ];
        corners.forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        });
    } else if (frameType === 'angular') {
        // J = spetsig ram med pil-hörn
        ctx.strokeStyle = hexToRgba(accent, 0.45);
        ctx.lineWidth = 2.5;
        const inset = 12;
        ctx.beginPath();
        ctx.moveTo(pad + inset, pad);
        ctx.lineTo(CANVAS_WIDTH - pad - inset, pad);
        ctx.lineTo(CANVAS_WIDTH - pad, pad + inset);
        ctx.lineTo(CANVAS_WIDTH - pad, CANVAS_HEIGHT - pad - inset);
        ctx.lineTo(CANVAS_WIDTH - pad - inset, CANVAS_HEIGHT - pad);
        ctx.lineTo(pad + inset, CANVAS_HEIGHT - pad);
        ctx.lineTo(pad, CANVAS_HEIGHT - pad - inset);
        ctx.lineTo(pad, pad + inset);
        ctx.closePath();
        ctx.stroke();
        // Inre linje
        ctx.strokeStyle = hexToRgba(accent, 0.2);
        ctx.lineWidth = 1;
        ctx.stroke();
    } else if (frameType === 'round') {
        // Q = mjuk oval ram
        ctx.strokeStyle = hexToRgba(accent, 0.4);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, w / 2 - 10, h / 2 - 10, 0, 0, Math.PI * 2);
        ctx.stroke();
        // Prick-kedja runt ovalen
        ctx.fillStyle = hexToRgba(accent, 0.5);
        for (let a = 0; a < Math.PI * 2; a += 0.25) {
            const rx = w / 2 - 4;
            const ry = h / 2 - 4;
            const x = CANVAS_WIDTH / 2 + Math.cos(a) * rx;
            const y = CANVAS_HEIGHT / 2 + Math.sin(a) * ry;
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (frameType === 'royal') {
        // K = tjock kunglig ram med kron-hörn
        ctx.strokeStyle = hexToRgba(accent, 0.55);
        ctx.lineWidth = 3;
        drawRoundedRect(ctx, pad, pad, w, h, r);
        ctx.stroke();
        // Inre ram
        ctx.strokeStyle = hexToRgba(accent, 0.25);
        ctx.lineWidth = 1.5;
        drawRoundedRect(ctx, pad + 8, pad + 8, w - 16, h - 16, r);
        ctx.stroke();
        // Kron-symboler i hörnen
        ctx.font = '18px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = hexToRgba(accent, 0.7);
        ctx.fillText('♛', pad + 14, pad + 14);
        ctx.fillText('♛', CANVAS_WIDTH - pad - 14, pad + 14);
        ctx.fillText('♛', pad + 14, CANVAS_HEIGHT - pad - 14);
        ctx.fillText('♛', CANVAS_WIDTH - pad - 14, CANVAS_HEIGHT - pad - 14);
    }

    ctx.restore();
}

function hexToRgba(hex, alpha) {
    const num = parseInt(hex.replace('#', ''), 16);
    const R = (num >> 16) & 0xff;
    const G = (num >> 8) & 0xff;
    const B = num & 0xff;
    return `rgba(${R},${G},${B},${alpha})`;
}

function renderCenterEmoji(ctx, emoji, size) {
    ctx.save();
    ctx.font = `${size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 16;
    ctx.fillText(emoji, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    ctx.restore();
}

function renderCenterImage(ctx, dataUrl, size) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            ctx.save();
            const x = (CANVAS_WIDTH - size) / 2;
            const y = (CANVAS_HEIGHT - size) / 2;
            const r = 18;

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
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 3;
            ctx.shadowColor = 'rgba(0,0,0,0.3)';
            ctx.shadowBlur = 10;
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
        img.src = dataUrl;
    });
}

function darkenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, ((num >> 8) & 0x00ff) - amt);
    const B = Math.max(0, (num & 0x0000ff) - amt);
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

function renderGloss(ctx) {
    // Diagonal glans-linje över kortet
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    const grad = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    grad.addColorStop(0.65, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    drawRoundedRect(ctx, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, CORNER_RADIUS);
    ctx.fill();
    ctx.restore();
}

function renderTexture(ctx) {
    // Subtil linen-textur med små kors
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 0.5;
    for (let y = 8; y < CANVAS_HEIGHT; y += 8) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();
    }
    for (let x = 8; x < CANVAS_WIDTH; x += 8) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_HEIGHT);
        ctx.stroke();
    }
    ctx.restore();
}

function renderVignette(ctx) {
    // Mörkare kanter för att dra ögat mot mitten
    ctx.save();
    const grad = ctx.createRadialGradient(
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.35,
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.75
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0.03)');
    grad.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = grad;
    drawRoundedRect(ctx, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, CORNER_RADIUS);
    ctx.fill();
    ctx.restore();
}

function renderDropShadow(ctx) {
    // Skugga runt kortet
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = 'rgba(0,0,0,0.01)';
    drawRoundedRect(ctx, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, CORNER_RADIUS);
    ctx.fill();
    ctx.restore();
}

async function renderCardToCanvas(rank, suit) {
    const canvas = document.getElementById('card-canvas');
    const ctx = canvas.getContext('2d');
    const data = cardData[suit][rank] || rankData[rank];
    const settings = suitSettings[suit];

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 0. Skugga (målas först, under allt)
    renderDropShadow(ctx);

    // 1. Bakgrund med rundade hörn
    await renderCardBackground(ctx, settings);

    // 2. Ram och ornament
    renderCardBorder(ctx);

    if (symbolMode) {
        // Symbol-läge: bara center-innehåll, inga valörer alls
        if (data && data.value) {
            if (data.type === 'emoji') {
                renderCenterEmoji(ctx, data.value, 200);
            } else if (data.type === 'image') {
                await renderCenterImage(ctx, data.value, 260);
            }
        }
    } else {
        // Standardläge: full spelkortslayout
        // 3. Corner rank med färgsymbol
        renderCornerRank(ctx, rank, suit);

        // 4. Huvudinnehåll — pip-mönster, face card, eller emoji/bild
        if (data && data.value) {
            if (['J', 'Q', 'K', 'A'].includes(rank)) {
                await renderFaceCard(ctx, rank, suit, data);
            } else if (['2', '3', '4', '5', '6', '7', '8', '9', '10'].includes(rank)) {
                const positions = getPipPositions(rank);
                if (data.type === 'emoji') {
                    renderPips(ctx, data.value, positions);
                } else if (data.type === 'image') {
                    await renderCenterImage(ctx, data.value, 200);
                }
            } else {
                if (data.type === 'emoji') {
                    renderCenterEmoji(ctx, data.value, 160);
                } else if (data.type === 'image') {
                    await renderCenterImage(ctx, data.value, 220);
                }
            }
        }
    }

    // 5. Fas 4: Effekter ovanpå allt
    renderTexture(ctx);
    renderVignette(ctx);
    renderGloss(ctx);

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

/* ========================================
   FAS 5: LIVE PREVIEW
   ======================================== */
function initLivePreview() {
    // När man klickar på ett kort i simple editor, sätt det som preview
    document.getElementById('simple-editor').addEventListener('click', e => {
        const row = e.target.closest('.rank-row');
        if (row) {
            livePreviewRank = row.dataset.rank;
            livePreviewSuit = 'hearts';
            queueLivePreview();
        }
    });

    // När man klickar på ett kort i advanced editor, sätt det som preview
    document.getElementById('suit-panels').addEventListener('click', e => {
        const item = e.target.closest('.card-editor-item');
        if (item) {
            const panel = item.closest('.suit-panel');
            livePreviewRank = item.dataset.rank;
            livePreviewSuit = panel ? panel.id.replace('panel-', '') : activeSuit;
            queueLivePreview();
        }
    });

    // När man byter färg-tab, uppdatera preview till första ifyllda kortet
    document.getElementById('suit-tabs-wrapper').addEventListener('click', e => {
        const tab = e.target.closest('.suit-tab');
        if (tab) {
            const suit = tab.dataset.suit;
            livePreviewSuit = suit;
            const firstFilled = RANKS.find(r => cardData[suit][r] && cardData[suit][r].value);
            livePreviewRank = firstFilled || 'A';
            queueLivePreview();
        }
    });
}

function queueLivePreview() {
    if (livePreviewTimeout) {
        clearTimeout(livePreviewTimeout);
    }
    livePreviewTimeout = setTimeout(() => {
        updateLivePreview();
    }, 80);
}

async function updateLivePreview() {
    const canvas = document.getElementById('live-preview-canvas');
    const label = document.getElementById('live-preview-label');
    const wrap = document.getElementById('live-preview-wrap');

    if (!canvas || !label) {
        return;
    }

    // Rendera till det dolda card-canvas först, sedan kopiera
    await renderCardToCanvas(livePreviewRank, livePreviewSuit);

    const srcCanvas = document.getElementById('card-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(srcCanvas, 0, 0);

    if (symbolMode) {
        label.textContent = `${SUIT_ICONS[livePreviewSuit]} ${SUIT_NAMES[livePreviewSuit]}`;
    } else {
        label.textContent = `${livePreviewRank} ${SUIT_ICONS[livePreviewSuit]} ${SUIT_NAMES[livePreviewSuit]}`;
    }
    wrap.classList.add('active');
}

/* ========================================
   FAS 6: KORTBAKSIDA
   ======================================== */
function initCardBack() {
    const bgInput = document.getElementById('back-bg-color');
    const patternInput = document.getElementById('back-pattern');
    const centerInput = document.getElementById('back-center');

    if (bgInput) {
        bgInput.addEventListener('input', e => {
            backSettings.bgColor = e.target.value;
            queueCardBackPreview();
        });
    }
    if (patternInput) {
        patternInput.addEventListener('change', e => {
            backSettings.pattern = e.target.value;
            queueCardBackPreview();
        });
    }
    if (centerInput) {
        centerInput.addEventListener('input', e => {
            backSettings.center = e.target.value;
            queueCardBackPreview();
        });
    }
}

let cardBackTimeout = null;
function queueCardBackPreview() {
    if (cardBackTimeout) {
        clearTimeout(cardBackTimeout);
    }
    cardBackTimeout = setTimeout(() => {
        updateCardBackPreview();
    }, 80);
}

function updateCardBackPreview() {
    const canvas = document.getElementById('back-preview-canvas');
    if (!canvas) {
        return;
    }
    renderCardBackToCanvas(canvas);
}

function renderCardBackToCanvas(targetCanvas) {
    const canvas = targetCanvas || document.getElementById('card-canvas');
    const ctx = canvas.getContext('2d');
    const settings = backSettings;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 1. Bakgrund med rundade hörn
    ctx.save();
    drawRoundedRect(ctx, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, CORNER_RADIUS);
    ctx.clip();

    // Grundfärg
    ctx.fillStyle = settings.bgColor;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Mönster
    const patternColor = lightenColor(settings.bgColor, 50);
    ctx.save();
    if (settings.pattern === 'dots') {
        ctx.fillStyle = patternColor;
        ctx.globalAlpha = 0.15;
        for (let y = 24; y < CANVAS_HEIGHT; y += 32) {
            for (let x = 24; x < CANVAS_WIDTH; x += 32) {
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    } else if (settings.pattern === 'crosshatch') {
        ctx.strokeStyle = patternColor;
        ctx.globalAlpha = 0.12;
        ctx.lineWidth = 1;
        for (let i = -CANVAS_HEIGHT; i < CANVAS_WIDTH + CANVAS_HEIGHT; i += 20) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i + CANVAS_HEIGHT, CANVAS_HEIGHT);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(i + CANVAS_HEIGHT, 0);
            ctx.lineTo(i, CANVAS_HEIGHT);
            ctx.stroke();
        }
    } else if (settings.pattern === 'circles') {
        ctx.strokeStyle = patternColor;
        ctx.globalAlpha = 0.15;
        ctx.lineWidth = 1.5;
        for (let y = 0; y < CANVAS_HEIGHT + 40; y += 40) {
            for (let x = 0; x < CANVAS_WIDTH + 40; x += 40) {
                ctx.beginPath();
                ctx.arc(x, y, 14, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    } else if (settings.pattern === 'diagonal') {
        ctx.strokeStyle = patternColor;
        ctx.globalAlpha = 0.12;
        ctx.lineWidth = 1.5;
        for (let i = -CANVAS_HEIGHT; i < CANVAS_WIDTH; i += 24) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i + CANVAS_HEIGHT, CANVAS_HEIGHT);
            ctx.stroke();
        }
    }
    ctx.restore();

    // Ram
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, 16, 16, CANVAS_WIDTH - 32, CANVAS_HEIGHT - 32, CORNER_RADIUS - 10);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, 26, 26, CANVAS_WIDTH - 52, CANVAS_HEIGHT - 52, CORNER_RADIUS - 16);
    ctx.stroke();

    // Center-symbol
    if (settings.center) {
        ctx.save();
        ctx.font = '100px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 16;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(settings.center, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.restore();
    }

    // Corner-ornament
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    const ornamentPositions = [
        [32, 32], [CANVAS_WIDTH - 32, 32],
        [32, CANVAS_HEIGHT - 32], [CANVAS_WIDTH - 32, CANVAS_HEIGHT - 32]
    ];
    ornamentPositions.forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
    });

    // Effekter
    renderTexture(ctx);
    renderVignette(ctx);

    ctx.restore();
}

/* ========================================
   FAS 7: IMPORT/EXPORT JSON
   ======================================== */
function initConfigIO() {
    const exportBtn = document.getElementById('export-config-btn');
    const importBtn = document.getElementById('import-config-btn');
    const importInput = document.getElementById('import-config-input');

    if (exportBtn) {
        exportBtn.addEventListener('click', exportConfig);
    }
    if (importBtn && importInput) {
        importBtn.addEventListener('click', () => importInput.click());
        importInput.addEventListener('change', e => {
            const file = e.target.files[0];
            if (file) {
                importConfig(file);
            }
            importInput.value = '';
        });
    }
}

function exportConfig() {
    const config = {
        version: 1,
        themeName: document.getElementById('theme-name').value.trim(),
        cardData: JSON.parse(JSON.stringify(cardData)),
        rankData: JSON.parse(JSON.stringify(rankData)),
        suitSettings: JSON.parse(JSON.stringify(suitSettings)),
        backSettings: JSON.parse(JSON.stringify(backSettings)),
        symbolMode: symbolMode
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.themeName || 'kortlek'}-config.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('💾 Konfiguration sparad som JSON!');
}

async function importConfig(file) {
    try {
        const text = await file.text();
        const config = JSON.parse(text);

        if (!config.cardData || !config.suitSettings) {
            showToast('Ogiltig konfigurationsfil!', 'error');
            return;
        }

        // Återställ data
        if (config.cardData) {
            cardData = config.cardData;
        }
        if (config.rankData) {
            rankData = config.rankData;
        }
        if (config.suitSettings) {
            suitSettings = config.suitSettings;
        }
        if (config.backSettings) {
            backSettings = config.backSettings;
        }
        if (typeof config.symbolMode === 'boolean') {
            symbolMode = config.symbolMode;
            const checkbox = document.getElementById('symbol-mode-checkbox');
            if (checkbox) {
                checkbox.checked = symbolMode;
            }
        }
        if (config.themeName) {
            document.getElementById('theme-name').value = config.themeName;
        }

        // Uppdatera alla UI-element
        RANKS.forEach(rank => {
            updateRankPreview(rank);
            const simpleEmoji = document.querySelector(`.rank-emoji-input[data-rank="${rank}"]`);
            const simpleFile = document.querySelector(`.rank-file-input[data-rank="${rank}"]`);
            if (simpleEmoji) {
                simpleEmoji.value = rankData[rank] && rankData[rank].type === 'emoji' ? rankData[rank].value : '';
            }
            if (simpleFile) {
                simpleFile.value = '';
            }
        });

        SUITS.forEach(suit => {
            RANKS.forEach(rank => {
                updateMiniPreview(suit, rank);
                const advEmoji = document.querySelector(`.card-emoji-input[data-suit="${suit}"][data-rank="${rank}"]`);
                const advFile = document.querySelector(`.card-file-input[data-suit="${suit}"][data-rank="${rank}"]`);
                if (advEmoji) {
                    const d = cardData[suit][rank];
                    advEmoji.value = d && d.type === 'emoji' ? d.value : '';
                }
                if (advFile) {
                    advFile.value = '';
                }
            });
            updateProgress(suit);

            // Uppdatera suit settings inputs
            const bgInput = document.querySelector(`.suit-bg-color[data-suit="${suit}"]`);
            const gradInput = document.querySelector(`.suit-gradient[data-suit="${suit}"]`);
            const patInput = document.querySelector(`.suit-pattern[data-suit="${suit}"]`);
            if (bgInput) {
                bgInput.value = suitSettings[suit].bgColor;
            }
            if (gradInput) {
                gradInput.value = suitSettings[suit].gradient;
            }
            if (patInput) {
                patInput.value = suitSettings[suit].pattern;
            }
        });

        // Uppdatera back settings
        const backBg = document.getElementById('back-bg-color');
        const backPat = document.getElementById('back-pattern');
        const backCenter = document.getElementById('back-center');
        if (backBg) {
            backBg.value = backSettings.bgColor;
        }
        if (backPat) {
            backPat.value = backSettings.pattern;
        }
        if (backCenter) {
            backCenter.value = backSettings.center || '';
        }

        updateAllProgress();
        updateCardBackPreview();
        updateLivePreview();

        showToast('📂 Konfiguration laddad!');
        setTimeout(() => pushHistory(), 200);
    } catch (err) {
        showToast('Kunde inte läsa filen: ' + err.message, 'error');
        console.error(err);
    }
}

/* ========================================
   FAS 10: SPELTESTARE
   ======================================== */
function initPlaytest() {
    const drawBtn = document.getElementById('draw-card-btn');
    const shuffleBtn = document.getElementById('shuffle-deck-btn');
    const clearBtn = document.getElementById('clear-hand-btn');
    const deckPile = document.getElementById('deck-pile');

    if (drawBtn) {
        drawBtn.addEventListener('click', drawCard);
    }
    if (shuffleBtn) {
        shuffleBtn.addEventListener('click', () => {
            prepareDeck();
        });
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', clearHand);
    }
    if (deckPile) {
        deckPile.addEventListener('click', drawCard);
    }
}

/* ========================================
   FAS 12: MASS-UPPLADDNING (DRAG & DROP)
   ======================================== */
function initBulkUpload() {
    const zone = document.getElementById('bulk-drop-zone');
    const input = document.getElementById('bulk-drop-input');
    if (!zone || !input) {
        return;
    }

    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', e => {
        if (e.target.files.length > 0) {
            processBulkFiles(Array.from(e.target.files));
        }
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        zone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        zone.addEventListener(eventName, () => zone.classList.add('drag-over'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        zone.addEventListener(eventName, () => zone.classList.remove('drag-over'), false);
    });

    zone.addEventListener('drop', e => {
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length > 0) {
            processBulkFiles(files);
        }
    });
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

async function processBulkFiles(files) {
    if (files.length === 0) {
        return;
    }

    showToast(`Läser ${files.length} bilder...`);
    const images = await readFiles(files);

    const distribution = distributeImages(images);
    if (!distribution) {
        showToast('Kunde inte fördela bilderna. Prova 1, 4, 13 eller 52 bilder.', 'error');
        return;
    }

    showBulkPreview(distribution, files.length);
}

function readFiles(files) {
    return Promise.all(
        files.map(file => new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        }))
    );
}

function distributeImages(images) {
    const count = images.length;
    const distribution = {};

    if (count === 52) {
        // 1 bild per kort: Hjärter A→K, Ruter A→K, Klöver A→K, Spader A→K
        let idx = 0;
        SUITS.forEach(suit => {
            distribution[suit] = {};
            RANKS.forEach(rank => {
                distribution[suit][rank] = images[idx++];
            });
        });
        return { type: 'all', label: '1 bild per kort (52)', distribution };
    }

    if (count === 13) {
        // 1 bild per valör: alla färger får samma bild för samma valör
        SUITS.forEach(suit => {
            distribution[suit] = {};
            RANKS.forEach((rank, idx) => {
                distribution[suit][rank] = images[idx];
            });
        });
        return { type: 'rank', label: '1 bild per valör (13)', distribution };
    }

    if (count === 4) {
        // 1 bild per färg: alla valörer i samma färg får samma bild
        SUITS.forEach((suit, idx) => {
            distribution[suit] = {};
            RANKS.forEach(rank => {
                distribution[suit][rank] = images[idx];
            });
        });
        return { type: 'suit', label: '1 bild per färg (4)', distribution };
    }

    if (count === 1) {
        // 1 bild för alla kort
        SUITS.forEach(suit => {
            distribution[suit] = {};
            RANKS.forEach(rank => {
                distribution[suit][rank] = images[0];
            });
        });
        return { type: 'single', label: 'Samma bild för alla kort (1)', distribution };
    }

    // För andra antal: fördela så många som möjligt (rundar ner till närmaste stödda)
    if (count > 52) {
        return distributeImages(images.slice(0, 52));
    }
    if (count > 13) {
        return distributeImages(images.slice(0, 13));
    }
    if (count > 4) {
        return distributeImages(images.slice(0, 4));
    }

    return null;
}

function showBulkPreview(distro, fileCount) {
    const overlay = document.createElement('div');
    overlay.className = 'bulk-preview-overlay';
    overlay.id = 'bulk-preview-overlay';

    let itemsHtml = '';
    SUITS.forEach(suit => {
        RANKS.forEach(rank => {
            const img = distro.distribution[suit][rank];
            const label = symbolMode
                ? `${SUIT_ICONS[suit]}`
                : `${rank} ${SUIT_ICONS[suit]}`;
            itemsHtml += `
                <div class="bulk-preview-item">
                    <img src="${img}" alt="${rank} ${suit}">
                    <div class="bulk-preview-label">${label}</div>
                </div>
            `;
        });
    });

    overlay.innerHTML = `
        <div class="bulk-preview-modal">
            <h4>🖼️ Fördelning: ${distro.label}</h4>
            <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:var(--space-md);">
                ${fileCount} bild(er) uppladdade. Så här kommer de att fördelas:
            </p>
            <div class="bulk-preview-grid">${itemsHtml}</div>
            <div class="bulk-preview-actions">
                <button class="btn btn-secondary" id="bulk-cancel-btn">Avbryt</button>
                <button class="btn btn-primary" id="bulk-apply-btn">Applicera</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('bulk-cancel-btn').addEventListener('click', closeBulkPreview);
    document.getElementById('bulk-apply-btn').addEventListener('click', () => {
        applyBulkImages(distro.distribution);
        closeBulkPreview();
    });

    overlay.addEventListener('click', e => {
        if (e.target === overlay) {
            closeBulkPreview();
        }
    });
}

function closeBulkPreview() {
    const overlay = document.getElementById('bulk-preview-overlay');
    if (overlay) {
        overlay.remove();
    }
}

function applyBulkImages(distribution) {
    SUITS.forEach(suit => {
        RANKS.forEach(rank => {
            const img = distribution[suit][rank];
            if (img) {
                cardData[suit][rank] = { type: 'image', value: img };
                updateMiniPreview(suit, rank);
            }
        });
        updateProgress(suit);
    });

    // Synka simple mode
    RANKS.forEach(rank => {
        const values = SUITS.map(suit => cardData[suit][rank]).filter(Boolean);
        if (values.length === 4 && values.every(v => v.type === values[0].type && v.value === values[0].value)) {
            rankData[rank] = { ...values[0] };
        } else {
            const first = values.find(v => v && v.value);
            if (first) {
                rankData[rank] = { ...first };
            }
        }
        updateRankPreview(rank);
        const simpleEmoji = document.querySelector(`.rank-emoji-input[data-rank="${rank}"]`);
        const simpleFile = document.querySelector(`.rank-file-input[data-rank="${rank}"]`);
        if (simpleEmoji) {
            simpleEmoji.value = '';
        }
        if (simpleFile) {
            simpleFile.value = '';
        }
    });

    updateAllProgress();
    updateBatchStats();
    queueLivePreview();
    pushHistory();
    showToast('🖼️ Bilder applicerade på kortleken!');
}

async function prepareDeck() {
    if (playtestGenerating) {
        return;
    }
    playtestGenerating = true;

    const status = document.getElementById('playtest-status');
    if (status) {
        status.textContent = 'Genererar 52 kort...';
    }

    // Kontrollera att vi har data
    const hasAnyContent = SUITS.some(suit =>
        RANKS.some(rank => {
            const data = cardData[suit][rank] || rankData[rank];
            return data && data.value;
        })
    );

    if (!hasAnyContent) {
        if (status) {
            status.textContent = 'Fyll i några kort först!';
        }
        playtestGenerating = false;
        return;
    }

    // Synka simple mode
    if (editMode === 'simple') {
        syncSimpleToAdvanced();
    }

    // Generera alla 52 kort
    playtestDeck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            await renderCardToCanvas(rank, suit);
            const dataUrl = document.getElementById('card-canvas').toDataURL('image/png');
            playtestDeck.push({
                rank: rank,
                suit: suit,
                image: dataUrl
            });
        }
    }

    // Generera baksida
    const backCanvas = document.createElement('canvas');
    backCanvas.width = CANVAS_WIDTH;
    backCanvas.height = CANVAS_HEIGHT;
    renderCardBackToCanvas(backCanvas);
    const backDataUrl = backCanvas.toDataURL('image/png');

    playtestDeck.forEach(card => {
        card.backImage = backDataUrl;
    });

    // Uppdatera deck-pile visuellt med genererad baksida
    const deckCardBack = document.querySelector('#deck-pile .deck-card-back');
    if (deckCardBack) {
        deckCardBack.innerHTML = `<img src="${backDataUrl}" alt="Baksida" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`;
    }

    shuffleArray(playtestDeck);
    playtestHand = [];
    playtestReady = true;
    renderHand();
    updateDeckCount();

    if (status) {
        status.textContent = 'Kortleken är klar! Dra kort för att börja spela.';
    }
    playtestGenerating = false;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function drawCard() {
    if (!playtestReady) {
        prepareDeck();
        return;
    }

    if (playtestDeck.length === 0) {
        const status = document.getElementById('playtest-status');
        if (status) {
            status.textContent = 'Leken är tom! Blanda om för att spela igen.';
        }
        return;
    }

    const card = playtestDeck.pop();
    playtestHand.push({ ...card, flipped: false });
    renderHand();
    updateDeckCount();

    const status = document.getElementById('playtest-status');
    if (status) {
        const cardName = symbolMode
            ? `${SUIT_ICONS[card.suit]} ${SUIT_NAMES[card.suit]}`
            : `${card.rank} ${SUIT_ICONS[card.suit]}`;
        status.textContent = `Drog: ${cardName}. ${playtestDeck.length} kort kvar i leken.`;
    }
}

function flipCard(index) {
    if (index < 0 || index >= playtestHand.length) {
        return;
    }
    playtestHand[index].flipped = !playtestHand[index].flipped;
    renderHand();
}

function clearHand() {
    // Lägg tillbaka handen i leken
    playtestHand.forEach(card => {
        playtestDeck.push({
            rank: card.rank,
            suit: card.suit,
            image: card.image,
            backImage: card.backImage
        });
    });
    playtestHand = [];
    renderHand();
    updateDeckCount();

    const status = document.getElementById('playtest-status');
    if (status) {
        status.textContent = 'Handen kastad. Dra nya kort!';
    }
}

function renderHand() {
    const container = document.getElementById('hand-cards');
    if (!container) {
        return;
    }

    container.innerHTML = playtestHand.map((card, index) => {
        return `
            <div class="playtest-card ${card.flipped ? 'flipped' : ''}" data-index="${index}" title="Klicka för att vända">
                <div class="playtest-card-face">
                    <img src="${card.image}" alt="${card.rank} ${card.suit}" loading="lazy">
                </div>
                <div class="playtest-card-back">
                    <img src="${card.backImage}" alt="Baksida" loading="lazy">
                </div>
            </div>
        `;
    }).join('');

    // Lägg till click-handlers
    container.querySelectorAll('.playtest-card').forEach(el => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.index, 10);
            flipCard(idx);
        });
    });

    // Animering på senaste kortet
    const lastCard = container.lastElementChild;
    if (lastCard) {
        lastCard.classList.add('dealing');
        setTimeout(() => {
            lastCard.classList.remove('dealing');
        }, 400);
    }
}

function updateDeckCount() {
    const count = document.getElementById('deck-count');
    if (count) {
        count.textContent = playtestDeck.length;
    }
}

function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) {
        existing.remove();
    }

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
/* ========================================
   FAS 9: BATCH-ÅTGÄRDER OCH VALIDERING
   ======================================== */
function updateBatchStats() {
    const stats = document.getElementById('batch-stats');
    if (!stats) {
        return;
    }

    let filled = 0;
    SUITS.forEach(suit => {
        RANKS.forEach(rank => {
            const data = cardData[suit][rank] || rankData[rank];
            if (data && data.value) {
                filled++;
            }
        });
    });

    stats.textContent = `${filled}/52 kort ifyllda`;
    stats.classList.remove('complete', 'incomplete');
    if (filled === 52) {
        stats.classList.add('complete');
    } else if (filled === 0) {
        stats.classList.add('incomplete');
    }
}

function fillRandomEmpty() {
    const usedEmojis = new Set();
    let filled = 0;

    // Samla redan använda emojis
    RANKS.forEach(rank => {
        const data = rankData[rank];
        if (data && data.value) {
            usedEmojis.add(data.value);
        }
    });
    SUITS.forEach(suit => {
        RANKS.forEach(rank => {
            const data = cardData[suit][rank];
            if (data && data.value) {
                usedEmojis.add(data.value);
            }
        });
    });

    if (editMode === 'simple') {
        // Enkelt läge: fyll bara 13 valörer, alla 4 färger får samma
        RANKS.forEach(rank => {
            if (rankData[rank] && rankData[rank].value) {
                return;
            }
            let pool = RANDOM_EMOJI_POOL.filter(e => !usedEmojis.has(e));
            if (pool.length === 0) {
                pool = RANDOM_EMOJI_POOL;
            }
            const emoji = pool[Math.floor(Math.random() * pool.length)];

            rankData[rank] = { type: 'emoji', value: emoji };
            usedEmojis.add(emoji);
            filled++;
        });

        // Synka till cardData (alla färger får samma)
        RANKS.forEach(rank => {
            if (rankData[rank] && rankData[rank].value) {
                SUITS.forEach(suit => {
                    cardData[suit][rank] = { ...rankData[rank] };
                    updateMiniPreview(suit, rank);
                });
            }
            updateRankPreview(rank);
            const simpleEmoji = document.querySelector(`.rank-emoji-input[data-rank="${rank}"]`);
            if (simpleEmoji) {
                simpleEmoji.value = rankData[rank] && rankData[rank].type === 'emoji' ? rankData[rank].value : '';
            }
        });

        SUITS.forEach(suit => updateProgress(suit));
        updateAllProgress();
        updateBatchStats();
        queueLivePreview();

        if (filled > 0) {
            showToast(`🎲 ${filled} tomma valörer fyllda — alla 4 färger får samma emoji!`);
        } else {
            showToast('Alla valörer är redan ifyllda!');
        }
        return;
    }

    // Avancerat läge: fyll alla 52 kort individuellt
    SUITS.forEach(suit => {
        RANKS.forEach(rank => {
            const data = cardData[suit][rank];
            if (data && data.value) {
                return;
            }
            let pool = RANDOM_EMOJI_POOL.filter(e => !usedEmojis.has(e));
            if (pool.length === 0) {
                pool = RANDOM_EMOJI_POOL;
            }
            const emoji = pool[Math.floor(Math.random() * pool.length)];

            cardData[suit][rank] = { type: 'emoji', value: emoji };
            usedEmojis.add(emoji);
            updateMiniPreview(suit, rank);
            filled++;
        });
        updateProgress(suit);
    });

    updateAllProgress();
    updateBatchStats();
    queueLivePreview();

    if (filled > 0) {
        showToast(`🎲 ${filled} tomma kort fyllda med slumpade emojis!`);
    } else {
        showToast('Alla kort är redan ifyllda!');
    }
}

function clearAllCards() {
    if (!confirm('Är du säker på att du vill rensa ALLA kort? Detta går inte att ångra.')) {
        return;
    }

    SUITS.forEach(suit => {
        cardData[suit] = {};
    });
    rankData = {};

    // Rensa alla UI-inputs
    RANKS.forEach(rank => {
        updateRankPreview(rank);
        const simpleEmoji = document.querySelector(`.rank-emoji-input[data-rank="${rank}"]`);
        const simpleFile = document.querySelector(`.rank-file-input[data-rank="${rank}"]`);
        if (simpleEmoji) {
            simpleEmoji.value = '';
        }
        if (simpleFile) {
            simpleFile.value = '';
        }
    });

    SUITS.forEach(suit => {
        RANKS.forEach(rank => {
            updateMiniPreview(suit, rank);
            const advEmoji = document.querySelector(`.card-emoji-input[data-suit="${suit}"][data-rank="${rank}"]`);
            const advFile = document.querySelector(`.card-file-input[data-suit="${suit}"][data-rank="${rank}"]`);
            if (advEmoji) {
                advEmoji.value = '';
            }
            if (advFile) {
                advFile.value = '';
            }
        });
        updateProgress(suit);
    });

    updateAllProgress();
    updateBatchStats();
    queueLivePreview();
    showToast('🗑️ Alla kort rensade!');
}

function validateBeforeExport() {
    let filled = 0;
    SUITS.forEach(suit => {
        RANKS.forEach(rank => {
            const data = cardData[suit][rank] || rankData[rank];
            if (data && data.value) {
                filled++;
            }
        });
    });

    if (filled === 0) {
        showToast('Kortleken är tom! Fyll i minst några kort först.', 'error');
        return false;
    }

    if (filled < 52) {
        const proceed = confirm(`Endast ${filled}/52 kort är ifyllda. Vill du fortsätta ändå? Ofyllda kort kommer att renderas tomma.`);
        if (!proceed) {
            return false;
        }
    }

    return true;
}

function bindEvents() {
    document.getElementById('preview-btn').addEventListener('click', generatePreviews);
    document.getElementById('generate-btn').addEventListener('click', generateAndDownload);

    const fillRandomBtn = document.getElementById('fill-random-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');
    if (fillRandomBtn) {
        fillRandomBtn.addEventListener('click', fillRandomEmpty);
    }
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', clearAllCards);
    }

    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    if (undoBtn) {
        undoBtn.addEventListener('click', undo);
    }
    if (redoBtn) {
        redoBtn.addEventListener('click', redo);
    }

    const themeInput = document.getElementById('theme-name');
    if (themeInput) {
        themeInput.addEventListener('input', () => {
            setTimeout(() => pushHistory(), 800);
        });
    }
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

    // Fas 9: Validera före export
    if (!validateBeforeExport()) {return;}

    // Säkerställ att enkelt läge-data finns i cardData innan generering
    if (editMode === 'simple') {
        syncSimpleToAdvanced();
    }

    showToast('Genererar kortlek... Det kan ta några sekunder.');

    const zip = new JSZip();
    const root = zip.folder(themeName);

    // 52 kort
    for (const suit of SUITS) {
        const folder = root.folder(SUIT_FOLDERS[suit]);
        for (const rank of RANKS) {
            await renderCardToCanvas(rank, suit);
            const dataUrl = document.getElementById('card-canvas').toDataURL('image/png');
            const base64 = dataUrl.split(',')[1];
            folder.file(`${rank}.png`, base64, { base64: true });
        }
    }

    // Kortbaksida
    const backCanvas = document.createElement('canvas');
    backCanvas.width = CANVAS_WIDTH;
    backCanvas.height = CANVAS_HEIGHT;
    renderCardBackToCanvas(backCanvas);
    const backDataUrl = backCanvas.toDataURL('image/png');
    const backBase64 = backDataUrl.split(',')[1];
    root.file('back.png', backBase64, { base64: true });

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${themeName}-kortlek.zip`);

    showToast('✅ ZIP nedladdad! Extrahera till public_html/assets/cards/');
}
