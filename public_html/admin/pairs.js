/* ========================================
   FINNS I SJÖN — PAR-HANTERING (ADMIN)
   ======================================== */

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
const loadingEl = document.getElementById('pairs-loading');
const emptyEl = document.getElementById('pairs-empty');
const gridEl = document.getElementById('pairs-grid');

let currentTheme = null;
let currentFolder = null;

/* ========================================
   INIT
   ======================================== */
document.addEventListener('DOMContentLoaded', () => {
    loadThemes();

    themeSelect.addEventListener('change', () => {
        const folder = themeSelect.value;
        if (!folder) {
            currentTheme = null;
            currentFolder = null;
            gridEl.innerHTML = '';
            emptyEl.style.display = 'block';
            saveBtn.disabled = true;
            return;
        }
        loadTheme(folder);
    });

    saveBtn.addEventListener('click', saveChanges);
});

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

        themeSelect.innerHTML = '<option value="">-- Välj tema --</option>' +
            data.themes.map(t => `<option value="${t.folder}">${t.name}</option>`).join('');
    } catch (err) {
        console.error(err);
        showToast('Kunde inte ladda teman', 'error');
    }
}

async function loadTheme(folder) {
    currentFolder = folder;
    currentTheme = null;
    gridEl.innerHTML = '';
    emptyEl.style.display = 'none';
    loadingEl.style.display = 'block';
    saveBtn.disabled = true;

    try {
        const res = await fetch(`/api/admin/themes/${encodeURIComponent(folder)}`);
        const data = await res.json();

        loadingEl.style.display = 'none';

        if (!data.success) {
            showToast(data.error || 'Kunde inte ladda temat', 'error');
            return;
        }

        currentTheme = data.theme;
        renderPairs(data.theme);
        saveBtn.disabled = false;
    } catch (err) {
        loadingEl.style.display = 'none';
        console.error(err);
        showToast('Kunde inte ladda temat', 'error');
    }
}

/* ========================================
   RENDERING
   ======================================== */
function renderPairs(theme) {
    const pairs = theme.pairs || [];

    if (pairs.length === 0) {
        gridEl.innerHTML = '<div class="pairs-empty">Inga par hittades för detta tema.</div>';
        return;
    }

    gridEl.innerHTML = pairs.map((pair, index) => {
        const imageSrc = pair.imagePath
            ? `/assets/cards/${pair.imagePath}?v=${Date.now()}`
            : `/assets/cards/${theme.folder}/${pair.pairId}.png?v=${Date.now()}`;

        return `
            <div class="pair-card" data-pair-id="${pair.pairId}" data-sort-order="${index}">
                <div class="pair-preview">
                    <img src="${imageSrc}" alt="${pair.name || pair.pairId}" id="preview-${pair.pairId}" data-fallback="🃏">
                </div>
                <div class="pair-id">${pair.pairId}</div>
                <input type="text" class="pair-name-input" data-pair-id="${pair.pairId}" value="${escapeHtml(pair.name || '')}" placeholder="Par-namn">
                <input type="file" class="pair-image-input" data-pair-id="${pair.pairId}" accept="image/png">
            </div>
        `;
    }).join('');

    // CSP-säker fallback vid bildfel
    gridEl.querySelectorAll('.pair-preview img').forEach(img => {
        img.addEventListener('error', function onPairPreviewError() {
            this.style.display = 'none';
            this.parentElement.innerHTML = `<span class="placeholder">${this.dataset.fallback}</span>`;
            this.removeEventListener('error', onPairPreviewError);
        }, { once: true });
    });

    gridEl.querySelectorAll('.pair-image-input').forEach(input => {
        input.addEventListener('change', () => previewSelectedImage(input));
    });
}

function previewSelectedImage(input) {
    const pairId = input.dataset.pairId;
    const img = document.getElementById(`preview-${pairId}`);
    if (!input.files || !input.files[0] || !img) {
        return;
    }

    const url = URL.createObjectURL(input.files[0]);
    img.src = url;
}

/* ========================================
   SPARA
   ======================================== */
async function saveChanges() {
    if (!currentFolder || !currentTheme) {
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Sparar...';

    try {
        const pairCards = Array.from(gridEl.querySelectorAll('.pair-card'));
        const pairs = pairCards.map((card, index) => ({
            pairId: card.dataset.pairId,
            name: card.querySelector('.pair-name-input').value.trim(),
            sortOrder: index
        }));

        if (!requireAuth()) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Spara ändringar';
            return;
        }

        // 1. Spara namn och sortering
        const nameRes = await fetch(`/api/admin/themes/${encodeURIComponent(currentFolder)}/pairs`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ pairs })
        });

        const nameData = await nameRes.json();
        if (!nameData.success) {
            throw new Error(nameData.error || 'Kunde inte spara par-namn');
        }

        // 2. Ladda upp nya bilder
        const uploadPairs = [];
        for (const card of pairCards) {
            const input = card.querySelector('.pair-image-input');
            if (input.files && input.files[0]) {
                const dataUrl = await readFileAsDataURL(input.files[0]);
                uploadPairs.push({
                    pairId: card.dataset.pairId,
                    dataUrl
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

        showToast(`Sparade ${pairs.length} par${uploadPairs.length > 0 ? ` och ${uploadPairs.length} bilder` : ''}`, 'success');

        // Återställ fil-inputs och ladda om förhandsgranskningar
        gridEl.querySelectorAll('.pair-image-input').forEach(input => {
            input.value = '';
        });
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
