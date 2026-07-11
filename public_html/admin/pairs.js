/* ========================================
   FINNS I SJÖN — PAR-HANTERING (ADMIN)
   ======================================== */

const PAIR_COUNT = 26;
const PAIR_ID_PATTERN = /^[a-zåäö0-9-_]+$/;

function getAuthToken() {
    return localStorage.getItem('token');
}

function authHeaders(contentType = 'application/json') {
    const token = getAuthToken();
    const headers = { 'Content-Type': contentType };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

function requireAuth() {
    if (!getAuthToken()) {
        showToast('Du måste logga in som administratör för att spara ändringar.', 'error');
        return false;
    }
    return true;
}

const themeSelect = document.getElementById('theme-select');
const saveBtn = document.getElementById('save-btn');
const aiGenerateBtn = document.getElementById('ai-generate-btn');
const aiToolbar = document.getElementById('ai-toolbar');
const aiPrimaryColor = document.getElementById('ai-primary-color');
const aiSecondaryColor = document.getElementById('ai-secondary-color');
const aiStyle = document.getElementById('ai-style');
const aiCancelBtn = document.getElementById('ai-cancel-btn');
const aiProgressWrap = document.getElementById('ai-progress-wrap');
const aiProgressFill = document.getElementById('ai-progress-fill');
const aiProgressText = document.getElementById('ai-progress-text');
const createThemeToggleBtn = document.getElementById('create-theme-toggle-btn');
const createThemeSection = document.getElementById('create-theme-section');
const createThemeBtn = document.getElementById('create-theme-btn');
const cancelCreateBtn = document.getElementById('cancel-create-btn');
const newThemeFolderInput = document.getElementById('new-theme-folder');
const newThemeNameInput = document.getElementById('new-theme-name');
const loadingEl = document.getElementById('pairs-loading');
const emptyEl = document.getElementById('pairs-empty');
const gridEl = document.getElementById('pairs-grid');
const themeInfoEl = document.getElementById('theme-info');
const themeInfoNameEl = document.getElementById('theme-info-name');
const themeInfoFolderEl = document.getElementById('theme-info-folder');
const pairCountEl = document.getElementById('pair-count');

let currentTheme = null;
let currentFolder = null;
let pairsData = [];
let aiAbortController = null;
let aiGenerating = false;

/* ========================================
   INIT
   ======================================== */
document.addEventListener('DOMContentLoaded', () => {
    loadThemes();

    themeSelect.addEventListener('change', () => {
        const folder = themeSelect.value;
        if (!folder) {
            resetView();
            return;
        }
        loadTheme(folder);
    });

    saveBtn.addEventListener('click', saveChanges);
    aiGenerateBtn.addEventListener('click', generateWithAI);
    aiCancelBtn.addEventListener('click', cancelAIGeneration);

    createThemeToggleBtn.addEventListener('click', () => {
        createThemeSection.classList.toggle('active');
        if (createThemeSection.classList.contains('active')) {
            newThemeFolderInput.focus();
        }
    });

    cancelCreateBtn.addEventListener('click', () => {
        createThemeSection.classList.remove('active');
        newThemeFolderInput.value = '';
        newThemeNameInput.value = '';
    });

    createThemeBtn.addEventListener('click', createTheme);
});

function resetView() {
    currentTheme = null;
    currentFolder = null;
    pairsData = [];
    gridEl.innerHTML = '';
    emptyEl.style.display = 'block';
    themeInfoEl.style.display = 'none';
    saveBtn.disabled = true;
    aiGenerateBtn.disabled = true;
    aiToolbar.style.display = 'none';
    aiProgressWrap.classList.remove('active');
}

/* ========================================
   TEMAN
   ======================================== */
async function loadThemes() {
    try {
        const res = await fetch('/api/admin/themes');
        const data = await res.json();

        if (!data.success) {
            showToast(data.error || 'Kunde inte ladda teman', 'error');
            return;
        }

        const previousValue = themeSelect.value;
        themeSelect.innerHTML =
            '<option value="">-- Välj tema --</option>' +
            data.themes.map(t => `<option value="${t.folder}">${escapeHtml(t.name)}</option>`).join('');

        if (previousValue) {
            themeSelect.value = previousValue;
        }
    } catch (err) {
        console.error(err);
        showToast('Kunde inte ladda teman', 'error');
    }
}

async function loadTheme(folder) {
    currentFolder = folder;
    currentTheme = null;
    pairsData = [];
    gridEl.innerHTML = '';
    emptyEl.style.display = 'none';
    loadingEl.style.display = 'block';
    saveBtn.disabled = true;
    themeInfoEl.style.display = 'none';

    try {
        const res = await fetch(`/api/admin/themes/${encodeURIComponent(folder)}`);
        const data = await res.json();

        loadingEl.style.display = 'none';

        if (!data.success) {
            showToast(data.error || 'Kunde inte ladda temat', 'error');
            return;
        }

        currentTheme = data.theme;
        pairsData = (data.theme.pairs || []).map((p, index) => ({
            originalPairId: p.pairId,
            pairId: p.pairId,
            name: p.name || p.pairId,
            description: p.description || '',
            sortOrder: p.sortOrder ?? index,
            imagePath: p.imagePath || null,
            imagePathB: p.imagePathB || null,
            fileA: null,
            fileB: null,
            sameImage: !p.imagePathB
        }));

        // Fyll ut till 26 par om temat har färre
        while (pairsData.length < PAIR_COUNT) {
            const nextIndex = pairsData.length + 1;
            pairsData.push({
                originalPairId: `pair-${nextIndex}`,
                pairId: `pair-${nextIndex}`,
                name: `Par ${nextIndex}`,
                description: '',
                sortOrder: pairsData.length,
                imagePath: null,
                imagePathB: null,
                fileA: null,
                fileB: null,
                sameImage: true
            });
        }

        renderThemeInfo();
        renderPairs();
        saveBtn.disabled = false;
        aiGenerateBtn.disabled = false;
        aiToolbar.style.display = 'flex';
    } catch (err) {
        loadingEl.style.display = 'none';
        console.error(err);
        showToast('Kunde inte ladda temat', 'error');
    }
}

function renderThemeInfo() {
    if (!currentTheme) {
        themeInfoEl.style.display = 'none';
        return;
    }
    themeInfoNameEl.textContent = currentTheme.name;
    themeInfoFolderEl.textContent = currentTheme.folder;
    pairCountEl.textContent = `${pairsData.length} par · ${pairsData.length * 2} kort`;
    themeInfoEl.style.display = 'flex';
}

/* ========================================
   RENDERING
   ======================================== */
function renderPairs() {
    if (pairsData.length === 0) {
        gridEl.innerHTML = '<div class="pairs-empty">Inga par att visa.</div>';
        return;
    }

    gridEl.innerHTML = pairsData
        .map((pair, index) => {
            const previewA = getPreviewSrc(pair, 'A');
            const previewB = pair.sameImage ? previewA : getPreviewSrc(pair, 'B');
            const missingA = !previewA;

            return `
                <div class="pair-card ${missingA ? 'missing-a' : ''}" data-index="${index}">
                    <div class="pair-previews">
                        <div class="pair-preview">
                            <span class="pair-preview-label">A</span>
                            <img src="${previewA}" alt="Kort A" id="preview-a-${index}" data-fallback="🃏" style="${missingA ? 'display:none' : ''}">
                            ${missingA ? '<span class="placeholder">?</span>' : ''}
                        </div>
                        <div class="pair-preview" id="preview-b-wrapper-${index}" style="${pair.sameImage ? 'opacity:0.7' : ''}">
                            <span class="pair-preview-label">B</span>
                            <img src="${previewB}" alt="Kort B" id="preview-b-${index}" data-fallback="🃏">
                        </div>
                    </div>

                    <input type="text"
                        class="pair-id-input"
                        id="pair-id-${index}"
                        value="${escapeHtml(pair.pairId)}"
                        placeholder="pair-namn"
                        title="Unikt ID, t.ex. pair-apple"
                        maxlength="30">

                    <input type="text"
                        class="pair-name-input"
                        id="pair-name-${index}"
                        value="${escapeHtml(pair.name)}"
                        placeholder="Visningsnamn"
                        maxlength="100">

                    <textarea
                        class="pair-description-input"
                        id="pair-description-${index}"
                        placeholder="Emoji + beskrivning för AI, t.ex. 🍎 rött äpple"
                        maxlength="250">${escapeHtml(pair.description || '')}</textarea>

                    <label class="same-image-toggle">
                        <input type="checkbox" id="same-image-${index}" ${pair.sameImage ? 'checked' : ''}>
                        <span>Samma bild på båda korten</span>
                    </label>

                    <div class="pair-image-inputs">
                        <input type="file"
                            class="pair-image-input"
                            id="file-a-${index}"
                            accept="image/png,image/jpeg,image/webp"
                            data-index="${index}" data-side="A">
                        <input type="file"
                            class="pair-image-input"
                            id="file-b-${index}"
                            accept="image/png,image/jpeg,image/webp"
                            data-index="${index}" data-side="B"
                            ${pair.sameImage ? 'disabled' : ''}
                            style="${pair.sameImage ? 'display:none' : ''}">
                    </div>

                    ${missingA ? '<div class="danger-text">Bild A saknas</div>' : ''}
                </div>
            `;
        })
        .join('');

    // Sätt upp event listeners
    gridEl.querySelectorAll('.pair-image-input').forEach(input => {
        input.addEventListener('change', () => handleFileSelect(input));
    });

    gridEl.querySelectorAll('.same-image-toggle input').forEach(checkbox => {
        checkbox.addEventListener('change', () => handleSameImageToggle(checkbox));
    });

    gridEl.querySelectorAll('.pair-id-input').forEach(input => {
        input.addEventListener('input', () => validatePairId(input));
    });

    // CSP-säker fallback vid bildfel
    gridEl.querySelectorAll('.pair-preview img').forEach(img => {
        img.addEventListener(
            'error',
            function onPairPreviewError() {
                this.style.display = 'none';
                const placeholder = document.createElement('span');
                placeholder.className = 'placeholder';
                placeholder.textContent = this.dataset.fallback;
                this.parentElement.appendChild(placeholder);
                this.removeEventListener('error', onPairPreviewError);
            },
            { once: true }
        );
    });
}

function getPreviewSrc(pair, side) {
    if (side === 'B' && pair.sameImage) {
        return getPreviewSrc(pair, 'A');
    }

    const file = side === 'A' ? pair.fileA : pair.fileB;
    if (file) {
        return URL.createObjectURL(file);
    }

    const imagePath = side === 'A' ? pair.imagePath : pair.imagePathB;
    if (imagePath) {
        return `/assets/cards/${imagePath}?v=${Date.now()}`;
    }

    // Legacy-fallback för äldre teman
    if (side === 'A' && pair.pairId.startsWith('pair-')) {
        const rank = pair.pairId.replace(/^pair-/, '');
        return `/assets/cards/${currentFolder}/aubergine/${rank}.png?v=${Date.now()}`;
    }

    return '';
}

function handleFileSelect(input) {
    const index = parseInt(input.dataset.index, 10);
    const side = input.dataset.side;
    const pair = pairsData[index];
    if (!pair) {
        return;
    }

    const file = input.files && input.files[0] ? input.files[0] : null;
    if (side === 'A') {
        pair.fileA = file;
        if (pair.sameImage) {
            pair.fileB = null;
        }
    } else {
        pair.fileB = file;
    }

    updatePreview(index, side);
    if (side === 'A' && pair.sameImage) {
        updatePreview(index, 'B');
    }
}

function handleSameImageToggle(checkbox) {
    const index = parseInt(checkbox.id.replace('same-image-', ''), 10);
    const pair = pairsData[index];
    if (!pair) {
        return;
    }

    pair.sameImage = checkbox.checked;

    const fileBInput = document.getElementById(`file-b-${index}`);
    const previewBWrapper = document.getElementById(`preview-b-wrapper-${index}`);

    if (pair.sameImage) {
        pair.fileB = null;
        pair.imagePathB = null;
        fileBInput.value = '';
        fileBInput.disabled = true;
        fileBInput.style.display = 'none';
        previewBWrapper.style.opacity = '0.7';
    } else {
        fileBInput.disabled = false;
        fileBInput.style.display = 'block';
        previewBWrapper.style.opacity = '1';
    }

    updatePreview(index, 'B');
}

function updatePreview(index, side) {
    const pair = pairsData[index];
    const imgId = `preview-${side.toLowerCase()}-${index}`;
    const img = document.getElementById(imgId);
    if (!img) {
        return;
    }

    const src = getPreviewSrc(pair, side);
    if (src) {
        img.src = src;
        img.style.display = 'block';
    } else {
        img.style.display = 'none';
    }

    // Uppdatera placeholder
    const wrapper = img.parentElement;
    const existingPlaceholder = wrapper.querySelector('.placeholder');
    if (!src && !existingPlaceholder) {
        const placeholder = document.createElement('span');
        placeholder.className = 'placeholder';
        placeholder.textContent = '?';
        wrapper.appendChild(placeholder);
    } else if (src && existingPlaceholder) {
        existingPlaceholder.remove();
    }
}

function validatePairId(input) {
    const value = input.value.trim();
    if (!value || !PAIR_ID_PATTERN.test(value)) {
        input.classList.add('invalid');
        return false;
    }
    input.classList.remove('invalid');
    return true;
}

/* ========================================
   SKAPA NYTT TEMA
   ======================================== */
async function createTheme() {
    if (!requireAuth()) {
        return;
    }

    const folder = newThemeFolderInput.value.trim().toLowerCase();
    const displayName = newThemeNameInput.value.trim();

    if (!folder || !/^[a-z0-9-]+$/.test(folder)) {
        showToast('Mappnamn får endast innehålla små bokstäver, siffror och bindestreck.', 'error');
        return;
    }

    createThemeBtn.disabled = true;
    createThemeBtn.textContent = 'Skapar...';

    try {
        const defaultPairs = [];
        for (let i = 1; i <= PAIR_COUNT; i++) {
            defaultPairs.push({
                pairId: `pair-${i}`,
                name: `Par ${i}`,
                sortOrder: i - 1
            });
        }

        const res = await fetch('/api/admin/themes', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                themeName: folder,
                displayName: displayName || folder,
                pairs: defaultPairs
            })
        });

        const data = await res.json();
        if (!data.success) {
            throw new Error(data.error || 'Kunde inte skapa temat');
        }

        showToast(`Tema "${displayName || folder}" skapat med ${PAIR_COUNT} par`, 'success');
        createThemeSection.classList.remove('active');
        newThemeFolderInput.value = '';
        newThemeNameInput.value = '';

        await loadThemes();
        themeSelect.value = folder;
        await loadTheme(folder);
    } catch (err) {
        console.error(err);
        showToast(err.message || 'Ett fel inträffade', 'error');
    } finally {
        createThemeBtn.disabled = false;
        createThemeBtn.textContent = 'Skapa tema med 26 par';
    }
}

/* ========================================
   SPARA
   ======================================== */
async function saveChanges() {
    if (!currentFolder || !currentTheme) {
        return;
    }

    // Läs in aktuella värden från DOM
    const cards = Array.from(gridEl.querySelectorAll('.pair-card'));
    const seenIds = new Set();
    const pairsToSave = [];

    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const index = parseInt(card.dataset.index, 10);
        const pairIdInput = card.querySelector('.pair-id-input');
        const nameInput = card.querySelector('.pair-name-input');
        const descriptionInput = card.querySelector('.pair-description-input');
        const sameImageCheckbox = card.querySelector('.same-image-toggle input');

        const pairId = pairIdInput.value.trim().toLowerCase();
        const name = nameInput.value.trim();
        const description = descriptionInput ? descriptionInput.value.trim() : '';

        if (!pairId) {
            showToast(`Par ${index + 1} saknar ID`, 'error');
            pairIdInput.focus();
            return;
        }

        if (!PAIR_ID_PATTERN.test(pairId)) {
            showToast(`Ogiltigt par-ID: "${pairId}". Endast a-ö, 0-9, bindestreck och understreck.`, 'error');
            pairIdInput.focus();
            return;
        }

        if (seenIds.has(pairId)) {
            showToast(`Par-ID "${pairId}" används flera gånger. Varje par måste ha ett unikt ID.`, 'error');
            pairIdInput.focus();
            return;
        }
        seenIds.add(pairId);

        const pair = pairsData[index];
        const idChanged = pair.originalPairId && pair.originalPairId !== pairId;
        pair.pairId = pairId;
        pair.name = name || pairId;
        pair.description = description;
        pair.sameImage = sameImageCheckbox.checked;

        // Om par-ID ändrats är gamla bilder inte längre giltiga, men
        // användaren kan fortfarande ha laddat upp nya filer för det nya ID:t.
        if (idChanged) {
            pair.imagePath = null;
            pair.imagePathB = null;
        }

        if (pair.sameImage) {
            pair.imagePathB = null;
            pair.fileB = null;
        }

        pairsToSave.push({
            originalPairId: pair.originalPairId,
            pairId,
            name: pair.name,
            description: pair.description,
            sortOrder: i,
            imagePathB: pair.sameImage ? null : pair.imagePathB
        });
    }

    if (!requireAuth()) {
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Sparar...';

    try {
        // 1. Spara metadata (namn, ID:n, sortering)
        const nameRes = await fetch(`/api/admin/themes/${encodeURIComponent(currentFolder)}/pairs`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ pairs: pairsToSave })
        });

        const nameData = await nameRes.json();
        if (!nameData.success) {
            throw new Error(nameData.error || 'Kunde inte spara par-metadata');
        }

        // 2. Ladda upp nya bilder
        const uploadPairs = [];
        for (const pair of pairsData) {
            const uploads = {};
            if (pair.fileA) {
                uploads.dataUrl = await readFileAsDataURL(pair.fileA);
            }
            if (pair.fileB) {
                uploads.dataUrlB = await readFileAsDataURL(pair.fileB);
            }
            if (uploads.dataUrl || uploads.dataUrlB) {
                uploadPairs.push({
                    pairId: pair.pairId,
                    ...uploads
                });
            }
        }

        if (uploadPairs.length > 0) {
            const uploadRes = await fetch(`/api/admin/themes/${encodeURIComponent(currentFolder)}/upload`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ pairs: uploadPairs })
            });

            const uploadData = await uploadRes.json();
            if (!uploadData.success) {
                throw new Error(uploadData.error || 'Kunde inte ladda upp bilder');
            }
        }

        showToast(
            `Sparade ${pairsToSave.length} par${uploadPairs.length > 0 ? ` och ${uploadPairs.length} bild(er)` : ''}`,
            'success'
        );

        await loadTheme(currentFolder);
    } catch (err) {
        console.error(err);
        showToast(err.message || 'Ett fel inträffade vid sparning', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Spara ändringar';
    }
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Kunde inte läsa bildfil'));
        reader.readAsDataURL(file);
    });
}

/* ========================================
   AI-GENERERING
   ======================================== */
async function generateWithAI() {
    if (!currentTheme || pairsData.length === 0 || aiGenerating) {
        return;
    }

    const primaryColor = aiPrimaryColor.value;
    const secondaryColor = aiSecondaryColor.value;
    const style = aiStyle.value;

    aiGenerating = true;
    aiAbortController = new AbortController();
    const signal = aiAbortController.signal;

    aiGenerateBtn.disabled = true;
    aiGenerateBtn.textContent = '⏳ Genererar...';
    aiCancelBtn.style.display = 'inline-block';
    aiProgressWrap.classList.add('active');

    const pairsToGenerate = pairsData.filter(p => p.description && p.description.trim());
    const total = pairsToGenerate.length;

    if (total === 0) {
        showToast('Fyll i beskrivningar (emoji + text) för minst ett par först.', 'error');
        resetAIButtons();
        return;
    }

    updateAIProgress(0, total, 'Startar AI-generering...');
    showToast(`🤖 Genererar ${total} par. Tid: ~5–15 sekunder per bild.`);

    let completed = 0;
    let errors = 0;

    for (const pair of pairsToGenerate) {
        if (signal.aborted) {
            break;
        }

        const index = pairsData.indexOf(pair);
        updateAIProgress(completed, total, `${completed}/${total} — genererar ${pair.name}...`);

        try {
            const promptA = buildAIPrompt(pair.description, primaryColor, secondaryColor, style);
            const seedA = simpleHash(`${currentFolder}-${pair.pairId}-${pair.description}-a`);
            const dataUrlA = await fetchAIImageWithTimeout(promptA, seedA, signal, 45000);
            pair.fileA = dataUrlToFile(dataUrlA, `${pair.pairId}.png`);

            if (!pair.sameImage) {
                const promptB = buildAIPrompt(pair.description, secondaryColor, primaryColor, style);
                const seedB = simpleHash(`${currentFolder}-${pair.pairId}-${pair.description}-b`);
                const dataUrlB = await fetchAIImageWithTimeout(promptB, seedB, signal, 45000);
                pair.fileB = dataUrlToFile(dataUrlB, `${pair.pairId}-b.png`);
            } else {
                pair.fileB = null;
            }

            updatePreview(index, 'A');
            updatePreview(index, 'B');
            completed++;
        } catch (err) {
            if (signal.aborted) {
                break;
            }
            console.error('AI-genereringsfel:', err);
            errors++;
            completed++;
        }
    }

    resetAIButtons();

    if (signal.aborted) {
        showToast(`⛔ Generering avbruten. ${completed - errors}/${total} par färdiga.`);
    } else if (errors > 0) {
        showToast(`⚠️ Generering klar med ${errors} fel. Klicka på Spara för att spara de genererade bilderna.`);
    } else {
        showToast(`✅ AI-generering klar! ${completed} par genererade. Klicka på Spara för att spara.`);
    }
}

function resetAIButtons() {
    aiGenerating = false;
    aiAbortController = null;
    aiGenerateBtn.disabled = false;
    aiGenerateBtn.textContent = '🤖 Generera med AI';
    aiCancelBtn.style.display = 'none';
    updateAIProgress(pairsData.length, pairsData.length, 'Klar');
}

function cancelAIGeneration() {
    if (aiAbortController) {
        aiAbortController.abort();
    }
}

function buildAIPrompt(description, primaryColor, secondaryColor, style) {
    const colorName = hexToColorName(primaryColor);
    const secondaryName = hexToColorName(secondaryColor);
    const cleanDesc = description.replace(/[\n\r]/g, ' ').trim();
    return `${cleanDesc}, ${colorName} and ${secondaryName} background accents, ${style}, centered, no text, no border`;
}

async function fetchAIImageWithTimeout(prompt, seed, signal, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('AI-bildgenerering tog för lång tid'));
        }, timeoutMs);

        fetchAIImage(prompt, seed, signal)
            .then(dataUrl => {
                clearTimeout(timer);
                resolve(dataUrl);
            })
            .catch(err => {
                clearTimeout(timer);
                reject(err);
            });
    });
}

async function fetchAIImage(prompt, seed, signal) {
    const encoded = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=256&height=256&nologo=true&seed=${seed}`;

    const res = await fetch(url, { signal });
    if (!res.ok) {
        throw new Error(`Pollinations svarade med ${res.status}`);
    }

    const blob = await res.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Kunde inte läsa AI-bild'));
        reader.readAsDataURL(blob);
    });
}

function dataUrlToFile(dataUrl, filename) {
    const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
        return null;
    }
    const mime = match[1];
    const base64 = match[2];
    const bytes = atob(base64);
    const array = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        array[i] = bytes.charCodeAt(i);
    }
    return new File([array], filename, { type: mime });
}

function updateAIProgress(completed, total, text) {
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    aiProgressFill.style.width = `${pct}%`;
    aiProgressText.textContent = text || `${completed}/${total} klara`;
}

function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return Math.abs(hash);
}

function hexToColorName(hex) {
    const colors = {
        '#000000': 'black',
        '#ffffff': 'white',
        '#ff0000': 'red',
        '#00ff00': 'green',
        '#0000ff': 'blue',
        '#ffff00': 'yellow',
        '#ff00ff': 'magenta',
        '#00ffff': 'cyan',
        '#ffa500': 'orange',
        '#800080': 'purple',
        '#a52a2a': 'brown',
        '#808080': 'gray',
        '#ffc0cb': 'pink'
    };
    const normalized = hex.toLowerCase();
    return colors[normalized] || normalized;
}

/* ========================================
   HJÄLPFUNKTIONER
   ======================================== */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const existing = document.querySelector('.admin-toast');
    if (existing) {
        existing.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'admin-toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 16px;
        right: 16px;
        padding: 12px 20px;
        border-radius: 8px;
        font-weight: 600;
        z-index: 10000;
        animation: fadeIn 0.25s ease;
        background: ${type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--accent)'};
        color: #fff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
