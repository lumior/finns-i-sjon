const AppState = {
    user: null,
    token: localStorage.getItem('token'),
    socket: null,
    currentRoom: null,
    selectedDifficulty: null,
    selectedRoom: null
};

const elements = {
    authSection: document.getElementById('auth-section'),
    userSection: document.getElementById('user-section'),
    userAvatar: document.getElementById('user-avatar'),
    userName: document.getElementById('user-name'),
    userElo: document.getElementById('user-elo'),
    loginBtn: document.getElementById('login-btn'),
    registerBtn: document.getElementById('register-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    loginModal: document.getElementById('login-modal'),
    registerModal: document.getElementById('register-modal'),
    errorModal: document.getElementById('error-modal'),
    errorMessage: document.getElementById('error-message'),
    joinRoomModal: document.getElementById('join-room-modal'),
    gameSetup: document.getElementById('game-setup'),
    roomsList: document.getElementById('rooms-list'),
    quickPlayBtn: document.getElementById('quick-play-btn'),
    vsAiBtn: document.getElementById('vs-ai-btn')
};

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    setupEventListeners();
    await loadRooms();
    loadLeaderboard();
    updateOnlineStats();
    loadDeckThemes();
    connectLobbySocket();

    if (window.socket) {
        localStorage.setItem('socketId', window.socket.id);
    }
});

window.addEventListener('beforeunload', () => {
    disconnectLobbySocket();
});

async function checkAuth() {
    if (!AppState.token) {
        showAuthButtons();
        return;
    }
    
    try {
        const response = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${AppState.token}` }
        });
        
        if (response.ok) {
            const user = await response.json();
            AppState.user = user;
            showUserSection(user);
        } else {
            localStorage.removeItem('token');
            AppState.token = null;
            showAuthButtons();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        showAuthButtons();
    }
}

function showAuthButtons() {
    elements.authSection.classList.remove('hidden');
    elements.userSection.classList.add('hidden');
    document.getElementById('create-persistent-wrap')?.classList.add('hidden');
    document.getElementById('persistent-rooms-section')?.classList.add('hidden');
}

function showUserSection(user) {
    elements.authSection.classList.add('hidden');
    elements.userSection.classList.remove('hidden');
    elements.userAvatar.src = user.avatar_url || '/assets/images/default-avatar.png';
    elements.userName.textContent = user.display_name || user.username;
    elements.userElo.textContent = `${user.elo_rating} ELO`;

    document.getElementById('create-name').value = user.display_name || user.username;
    document.getElementById('ai-player-name').value = user.display_name || user.username;
    document.getElementById('create-persistent-wrap')?.classList.remove('hidden');
    loadPersistentRooms();
}

function setupEventListeners() {
    elements.loginBtn.addEventListener('click', () => showModal('login-modal'));
    elements.registerBtn.addEventListener('click', () => showModal('register-modal'));
    elements.logoutBtn.addEventListener('click', logout);
    
    document.getElementById('switch-to-register').addEventListener('click', (e) => {
        e.preventDefault();
        hideModal('login-modal');
        showModal('register-modal');
    });
    
    document.getElementById('switch-to-login').addEventListener('click', (e) => {
        e.preventDefault();
        hideModal('register-modal');
        showModal('login-modal');
    });
    
    document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
        el.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.classList.add('hidden');
        });
    });
    
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    document.getElementById('forgot-form').addEventListener('submit', handleForgotPassword);

    document.getElementById('switch-to-forgot').addEventListener('click', e => {
        e.preventDefault();
        hideModal('login-modal');
        showModal('forgot-modal');
    });

    document.getElementById('switch-from-forgot-to-login').addEventListener('click', e => {
        e.preventDefault();
        hideModal('forgot-modal');
        showModal('login-modal');
    });

    document.getElementById('verify-close-btn').addEventListener('click', () => {
        hideModal('verify-modal');
    });

    document.getElementById('resend-verify-btn').addEventListener('click', handleResendVerification);
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    elements.quickPlayBtn.addEventListener('click', () => {
        elements.gameSetup.classList.remove('hidden');
        elements.gameSetup.scrollIntoView({ behavior: 'smooth' });
        switchTab('join');
    });
    
    elements.vsAiBtn.addEventListener('click', () => {
        elements.gameSetup.classList.remove('hidden');
        elements.gameSetup.scrollIntoView({ behavior: 'smooth' });
        switchTab('ai');
    });
    
    document.getElementById('create-room-form').addEventListener('submit', (e) => {
        e.preventDefault();
        createRoom();
    });
    
    document.querySelectorAll('.diff-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.diff-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            AppState.selectedDifficulty = card.dataset.diff;
            document.getElementById('start-ai-game').disabled = false;
            
            // På mobil: scrolla ner till namn/starta-sektionen
            if (window.innerWidth <= 768) {
                const aiOptions = document.querySelector('.ai-options');
                if (aiOptions) {
                    aiOptions.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        });
    });
    
    document.getElementById('start-ai-game').addEventListener('click', startAIGame);
    document.getElementById('join-room-form').addEventListener('submit', (e) => {
        e.preventDefault();
        confirmJoinRoom();
    });
    document.getElementById('error-close-btn').addEventListener('click', closeError);
    document.getElementById('room-search').addEventListener('input', filterRooms);
    document.getElementById('room-filter').addEventListener('change', filterRooms);
}

function setButtonLoading(containerId, loading) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const submitBtn = container.tagName === 'FORM'
        ? container.querySelector('button[type="submit"]')
        : container.querySelector('button');
    if (!submitBtn) return;
    if (loading) {
        submitBtn.dataset.originalText = submitBtn.textContent;
        submitBtn.textContent = 'Skickar…';
        submitBtn.disabled = true;
    } else {
        submitBtn.textContent = submitBtn.dataset.originalText || submitBtn.textContent;
        submitBtn.disabled = false;
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    setButtonLoading('login-form', true);
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            AppState.token = data.token;
            AppState.user = data.user;
            showUserSection(data.user);
            hideModal('login-modal');

            if (data.user.emailVerified === false) {
                showModal('verify-modal');
            }
        } else {
            showError(data.error || 'Inloggning misslyckades');
        }
    } catch (error) {
        showError('Nätverksfel - försök igen');
    } finally {
        setButtonLoading('login-form', false);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const displayName = document.getElementById('reg-display').value;
    const password = document.getElementById('reg-password').value;

    setButtonLoading('register-form', true);
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, displayName, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            AppState.token = data.token;
            AppState.user = data.user;
            showUserSection(data.user);
            hideModal('register-modal');
            showModal('verify-modal');
        } else {
            showError(data.error || 'Registrering misslyckades');
        }
    } catch (error) {
        showError('Nätverksfel - försök igen');
    } finally {
        setButtonLoading('register-form', false);
    }
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value;
    const messageEl = document.getElementById('forgot-message');

    setButtonLoading('forgot-form', true);
    try {
        const response = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();
        messageEl.textContent = data.message || 'Länk skickad om e-postadressen finns.';
        messageEl.className = 'form-message success';
        document.getElementById('forgot-email').value = '';
    } catch (err) {
        messageEl.textContent = 'Något gick fel. Försök igen.';
        messageEl.className = 'form-message error';
    } finally {
        setButtonLoading('forgot-form', false);
    }
}

async function handleResendVerification() {
    const messageEl = document.getElementById('resend-message');
    if (!AppState.token) return;

    try {
        const response = await fetch('/api/auth/resend-verification', {
            method: 'POST',
            headers: { Authorization: `Bearer ${AppState.token}` }
        });

        const data = await response.json();
        if (response.ok) {
            messageEl.textContent = 'Ny verifieringslänk skickad!';
            messageEl.className = 'form-message success';
        } else {
            messageEl.textContent = data.error || 'Kunde inte skicka länk.';
            messageEl.className = 'form-message error';
        }
    } catch (err) {
        messageEl.textContent = 'Något gick fel. Försök igen.';
        messageEl.className = 'form-message error';
    }
}

async function logout() {
    await fetch('/api/auth/logout', {
        headers: { 'Authorization': `Bearer ${AppState.token}` }
    });

    localStorage.removeItem('token');
    AppState.token = null;
    AppState.user = null;
    showAuthButtons();
}

let lobbySocket = null;

async function loadRooms() {
    try {
        const response = await fetch('/api/rooms');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const rooms = await response.json();
        console.log('🔄 Polling: fick', rooms.length, 'bord');
        renderRooms(rooms);
    } catch (error) {
        console.warn('🔄 Polling-fel:', error.message);
    }
}

function connectLobbySocket() {
    if (lobbySocket) return;

    lobbySocket = io({ auth: { token: AppState.token } });

    lobbySocket.on('connect', () => {
        console.log('🟢 Lobby Socket.IO ansluten');
    });

    lobbySocket.on('lobby_update', rooms => {
        console.log('🔄 Lobby-uppdatering: fick', rooms.length, 'bord');
        renderRooms(rooms);
        updateOnlineStats();
    });

    lobbySocket.on('disconnect', reason => {
        console.log('🔴 Lobby Socket.IO frånkopplad:', reason);
    });
}

function disconnectLobbySocket() {
    if (lobbySocket) {
        lobbySocket.disconnect();
        lobbySocket = null;
    }
}

async function loadDeckThemes() {
    try {
        const response = await fetch('/api/themes');
        if (!response.ok) {
            return;
        }
        const data = await response.json();
        if (!data.success || !data.themes) {
            return;
        }

        const select = document.getElementById('create-deck-theme');
        if (!select) {
            return;
        }

        // Behåll standardalternativet
        const standardOption = select.querySelector('option[value="standard"]');
        select.innerHTML = '';
        if (standardOption) {
            select.appendChild(standardOption);
        } else {
            const opt = document.createElement('option');
            opt.value = 'standard';
            opt.textContent = 'Standard ♠♥♦♣';
            select.appendChild(opt);
        }

        // Lägg till dynamiska teman
        for (const theme of data.themes) {
            if (theme.folder === 'standard') {
                continue;
            }
            const option = document.createElement('option');
            option.value = theme.folder;
            const status = theme.complete ? '' : ' (ofullständig)';
            option.textContent = theme.name + status;
            select.appendChild(option);
        }

        // Återställ tidigare val från localStorage om det finns
        const saved = localStorage.getItem('deckTheme');
        if (saved && select.querySelector(`option[value="${saved}"]`)) {
            select.value = saved;
        }
    } catch (error) {
        console.warn('Kunde inte ladda teman:', error.message);
    }
}

function renderRooms(rooms) {
    // Bevara sökterm och filter så användarens vy inte återställs
    const searchValue = document.getElementById('room-search')?.value || '';
    const filterValue = document.getElementById('room-filter')?.value || 'all';
    
    if (rooms.length === 0) {
        elements.roomsList.innerHTML = `
            <div class="empty-state">
                <p>Inga öppna bord just nu...</p>
                <p class="hint">Skapa ett nytt bord eller spela mot AI!</p>
            </div>
        `;
        return;
    }
    
    elements.roomsList.innerHTML = rooms.map(room => `
        <div class="room-card" data-room-id="${room.roomId}" data-has-password="${room.hasPassword}">
            <div class="room-info">
                <div class="room-name">${room.name}</div>
                <div class="room-meta">
                    <span class="room-players">👤 ${room.playerCount}/${room.maxPlayers} spelare</span>
                    <span>Värd: ${room.hostName}</span>
                </div>
            </div>
            <div class="room-badges">
                ${room.aiCount > 0 ? `<span class="badge badge-ai">🤖 ${room.aiCount}</span>` : ''}
                ${room.hasPassword ? `<span class="badge badge-private">🔒</span>` : ''}
                ${room.gameType === 'tournament' ? `<span class="badge badge-tournament">🏆</span>` : ''}
                ${room.deckTheme !== 'standard' ? `<span class="badge badge-vegetable">🃏</span>` : ''}
            </div>
            <button class="join-room-btn">Gå med</button>
        </div>
    `).join('');
    
    document.querySelectorAll('.room-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('join-room-btn')) {
                e.stopPropagation();
                showJoinModal(card.dataset.roomId, card.dataset.hasPassword === 'true');
            }
        });
    });
    
    // Återställ filter/sökning om användaren hade aktivt filter
    if (searchValue || filterValue !== 'all') {
        const searchInput = document.getElementById('room-search');
        const filterSelect = document.getElementById('room-filter');
        if (searchInput) searchInput.value = searchValue;
        if (filterSelect) filterSelect.value = filterValue;
        filterRooms();
    }
}

function filterRooms() {
    const search = document.getElementById('room-search').value.toLowerCase();
    const filter = document.getElementById('room-filter').value;
    
    document.querySelectorAll('.room-card').forEach(card => {
        const name = card.querySelector('.room-name').textContent.toLowerCase();
        const hasPassword = card.dataset.hasPassword === 'true';
        
        let visible = name.includes(search);
        
        if (filter === 'private' && !hasPassword) visible = false;
        if (filter === 'open' && hasPassword) visible = false;
        
        card.style.display = visible ? 'flex' : 'none';
    });
}

function showJoinModal(roomId, hasPassword) {
    AppState.selectedRoom = roomId;
    document.getElementById('join-room-name').textContent = roomId;
    
    const passwordGroup = document.getElementById('join-password-group');
    if (hasPassword) {
        passwordGroup.classList.remove('hidden');
    } else {
        passwordGroup.classList.add('hidden');
    }
    
    const nameInput = document.getElementById('join-player-name');
    nameInput.value = AppState.user?.display_name || AppState.user?.username || localStorage.getItem('playerName') || '';
    
    showModal('join-room-modal');
}

async function confirmJoinRoom() {
    const roomId = AppState.selectedRoom;
    const playerName = document.getElementById('join-player-name').value.trim();
    const password = document.getElementById('join-room-password').value;
    
    if (!playerName) {
        showError('Ange ditt namn');
        return;
    }
    
    localStorage.setItem('playerName', playerName);
    
    const params = new URLSearchParams({ room: roomId, name: playerName });
    if (password) params.set('password', password);
    if (AppState.token) params.set('token', AppState.token);
    
    localStorage.removeItem('previousSocketId');
    window.location.href = `/game.html?${params.toString()}`;
}

async function createRoom() {
    setButtonLoading('create-room-form', true);
    const playerName = document.getElementById('create-name').value.trim();
    const roomName = document.getElementById('create-room-name').value.trim();
    const password = document.getElementById('create-password').value;
    const maxPlayers = parseInt(document.getElementById('create-max-players').value);
    const gameType = document.getElementById('create-game-type').value;
    const allowAI = document.getElementById('create-allow-ai').checked;
    const turnTimer = document.getElementById('create-turn-timer').checked;
    const spectatorMode = document.getElementById('create-spectator').checked;
    const deckThemeEl = document.getElementById('create-deck-theme');
    const deckTheme = deckThemeEl ? deckThemeEl.value : 'standard';
    const isPersistent = document.getElementById('create-persistent')?.checked && !!AppState.user;
    
    if (!playerName) {
        showError('Ange ditt namn');
        return;
    }
    
    localStorage.setItem('playerName', playerName);
    localStorage.setItem('isHost', 'true');
    
    const socket = io({ auth: { token: AppState.token } });
    
    socket.on('connect', () => {
        socket.emit('create_room', {
            playerName,
            roomName,
            password,
            gameType,
            isPersistent,
            settings: { maxPlayers, allowAI, turnTimer, spectatorMode, deckTheme }
        });
    });
    
    socket.on('room_created', (data) => {
        localStorage.setItem('currentRoom', data.roomId);
        localStorage.removeItem('previousSocketId');
        socket.disconnect();
        window.location.href = `/game.html?room=${data.roomId}&host=true`;
    });
    
    socket.on('error', (data) => {
        setButtonLoading('create-room-form', false);
        showError(data.message);
    });
}

async function loadPersistentRooms() {
    const section = document.getElementById('persistent-rooms-section');
    if (!AppState.token || !section) return;

    try {
        const response = await fetch('/api/persistent-rooms', {
            headers: { 'Authorization': `Bearer ${AppState.token}` }
        });
        if (!response.ok) return;
        const data = await response.json();
        renderPersistentRooms(data.rooms || []);
    } catch (error) {
        console.warn('Kunde inte ladda återkommande bord:', error.message);
    }
}

function renderPersistentRooms(rooms) {
    const section = document.getElementById('persistent-rooms-section');
    const list = document.getElementById('persistent-rooms-list');
    if (!section || !list) return;

    if (rooms.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    list.innerHTML = rooms.map(room => `
        <div class="room-card persistent-room-card" data-room-id="${room.roomId}" data-has-password="${room.isPrivate}">
            <div class="room-info">
                <div class="room-name">${room.roomName}</div>
                <div class="room-meta">
                    <span class="room-players">🆔 ${room.roomId}</span>
                    <span>${room.maxPlayers} spelare · ${room.deckTheme}</span>
                </div>
            </div>
            <div class="room-badges">
                ${room.isPrivate ? '<span class="badge badge-private">🔒</span>' : ''}
                ${room.allowAI ? '<span class="badge badge-ai">🤖</span>' : ''}
            </div>
            <button class="join-room-btn">Öppna</button>
            <button class="delete-persistent-room-btn" title="Ta bort">🗑️</button>
        </div>
    `).join('');

    list.querySelectorAll('.persistent-room-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('join-room-btn')) {
                e.stopPropagation();
                showJoinModal(card.dataset.roomId, card.dataset.hasPassword === 'true');
            } else if (e.target.classList.contains('delete-persistent-room-btn')) {
                e.stopPropagation();
                deletePersistentRoom(card.dataset.roomId);
            }
        });
    });
}

async function deletePersistentRoom(roomId) {
    if (!confirm('Är du säker på att du vill ta bort detta återkommande bord?')) return;

    try {
        const response = await fetch(`/api/persistent-rooms/${roomId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${AppState.token}` }
        });
        if (response.ok) {
            loadPersistentRooms();
        } else {
            const data = await response.json();
            showError(data.error || 'Kunde inte ta bort bordet');
        }
    } catch (error) {
        console.error('Delete persistent room failed:', error);
        showError('Kunde inte ta bort bordet');
    }
}

async function startAIGame() {
    setButtonLoading('ai-options', true);
    const playerName = document.getElementById('ai-player-name').value.trim();
    const difficulty = AppState.selectedDifficulty;
    
    if (!playerName) {
        setButtonLoading('ai-options', false);
        showError('Ange ditt namn');
        return;
    }
    if (!difficulty) {
        setButtonLoading('ai-options', false);
        showError('Välj en svårighetsgrad');
        return;
    }
    
    localStorage.setItem('playerName', playerName);
    localStorage.setItem('isHost', 'true');
    
    const socket = io({ auth: { token: AppState.token } });
    
    socket.on('connect', () => {
        socket.emit('create_room', {
            playerName,
            roomName: `vs AI (${difficulty})`,
            settings: { maxPlayers: 2, allowAI: true, turnTimer: true, deckTheme: localStorage.getItem('deckTheme') || 'standard' }
        });
    });
    
    socket.on('room_created', (data) => {
        socket.emit('add_ai', { difficulty });
        localStorage.setItem('currentRoom', data.roomId);
        
        setTimeout(() => {
            localStorage.removeItem('previousSocketId');
            socket.disconnect();
            window.location.href = `/game.html?room=${data.roomId}&host=true&ai=${difficulty}`;
        }, 500);
    });

    socket.on('error', (data) => {
        setButtonLoading('ai-options', false);
        showError(data.message);
    });
}

async function loadLeaderboard() {
    try {
        const response = await fetch('/api/users/leaderboard?limit=10');
        const leaderboard = await response.json();
        renderLeaderboard(leaderboard);
    } catch (error) {
        document.getElementById('leaderboard-preview-list').innerHTML = '<p class="empty-state">Kunde inte ladda topplista</p>';
    }
}

function renderLeaderboard(leaderboard) {
    const container = document.getElementById('leaderboard-preview-list');
    
    if (leaderboard.length === 0) {
        container.innerHTML = '<p class="empty-state">Inga spelare på topplistan än</p>';
        return;
    }
    
    container.innerHTML = leaderboard.map((user, index) => `
        <div class="leaderboard-row">
            <div class="rank-number ${index < 3 ? 'top-3' : ''}">${index + 1}</div>
            <div class="leaderboard-user">
                <img src="${user.avatar_url || '/assets/images/default-avatar.png'}" alt="" class="leaderboard-avatar">
                <span class="leaderboard-name">${user.display_name || user.username}</span>
            </div>
            <div class="leaderboard-elo">${user.elo_rating}</div>
            <div class="leaderboard-wins">${user.games_won} vinster</div>
        </div>
    `).join('');
}

async function updateOnlineStats() {
    try {
        const [onlineRes, roomsRes, totalRes] = await Promise.all([
            fetch('/api/users/online'),
            fetch('/api/rooms'),
            fetch('/api/stats/total-games')
        ]);
        
        const online = await onlineRes.json();
        const rooms = await roomsRes.json();
        const totalGames = await totalRes.json();
        
        document.getElementById('online-count').textContent = online.length;
        document.getElementById('active-games').textContent = rooms.filter(r => !r.hasPassword).length;
        document.getElementById('total-games').textContent = totalGames.count || 0;
    } catch (error) {
        // Silent fail
    }
}

let activeModal = null;
let activeModalFocusHandler = null;
let activeModalKeyHandler = null;
let lastFocusedElement = null;

function getFocusableElements(modal) {
    return Array.from(
        modal.querySelectorAll(
            'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'
        )
    ).filter(el => el.offsetParent !== null);
}

function trapFocus(modal) {
    return e => {
        if (e.key !== 'Tab') return;
        const focusable = getFocusableElements(modal);
        if (focusable.length === 0) {
            e.preventDefault();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };
}

function showModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    lastFocusedElement = document.activeElement;
    modal.classList.remove('hidden');
    activeModal = modal;

    const focusable = getFocusableElements(modal);
    const title = modal.querySelector('[id$="-modal-title"]');
    if (focusable.length > 0) {
        focusable[0].focus();
    } else if (title) {
        title.setAttribute('tabindex', '-1');
        title.focus();
    }

    activeModalFocusHandler = trapFocus(modal);
    activeModalKeyHandler = e => {
        if (e.key === 'Escape') {
            hideModal(id);
        }
    };

    modal.addEventListener('keydown', activeModalFocusHandler);
    document.addEventListener('keydown', activeModalKeyHandler);
}

function hideModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    modal.classList.add('hidden');

    if (activeModal === modal) {
        if (activeModalFocusHandler) {
            modal.removeEventListener('keydown', activeModalFocusHandler);
            activeModalFocusHandler = null;
        }
        if (activeModalKeyHandler) {
            document.removeEventListener('keydown', activeModalKeyHandler);
            activeModalKeyHandler = null;
        }
        activeModal = null;
        if (lastFocusedElement) {
            lastFocusedElement.focus();
            lastFocusedElement = null;
        }
    }
}

function showError(message) {
    elements.errorMessage.textContent = message;
    showModal('error-modal');
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tab}`);
    });
}

function closeError() {
    hideModal('error-modal');
}

// Event listener for error modal close button is set up in setupEventListeners

// ── Vännerlista ──

document.addEventListener('click', e => {
    const tabBtn = e.target.closest('.friend-tab-btn');
    if (!tabBtn) return;

    document.querySelectorAll('.friend-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.friend-tab-content').forEach(content => content.classList.remove('active'));

    tabBtn.classList.add('active');
    document.getElementById(tabBtn.dataset.tab).classList.add('active');
});

document.addEventListener('click', e => {
    const closeBtn = e.target.closest('#friends-modal .modal-close, #friends-modal .modal-overlay');
    if (closeBtn) {
        hideModal('friends-modal');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const friendsBtn = document.getElementById('friends-btn');
    if (friendsBtn) {
        friendsBtn.addEventListener('click', () => {
            showModal('friends-modal');
            loadFriends();
        });
    }

    const addFriendForm = document.getElementById('add-friend-form');
    if (addFriendForm) {
        addFriendForm.addEventListener('submit', handleAddFriend);
    }

    // Event delegation för vänner-listan
    const friendsContainer = document.getElementById('friends-list-container');
    const pendingContainer = document.getElementById('pending-received-container');

    if (friendsContainer) {
        friendsContainer.addEventListener('click', e => {
            const removeBtn = e.target.closest('.friend-remove-btn');
            if (removeBtn) {
                removeFriend(removeBtn.dataset.id);
            }
        });
    }

    if (pendingContainer) {
        pendingContainer.addEventListener('click', e => {
            const acceptBtn = e.target.closest('.friend-accept-btn');
            const rejectBtn = e.target.closest('.friend-reject-btn');
            if (acceptBtn) acceptFriendRequest(acceptBtn.dataset.id);
            if (rejectBtn) rejectFriendRequest(rejectBtn.dataset.id);
        });
    }
});

async function loadFriends() {
    if (!AppState.token) return;

    try {
        const response = await fetch('/api/friends', {
            headers: { Authorization: `Bearer ${AppState.token}` }
        });

        if (!response.ok) {
            throw new Error('Kunde inte hämta vänner');
        }

        const data = await response.json();
        renderFriends(data.friends);
        renderPending(data.pendingReceived, data.pendingSent);
        updatePendingBadge(data.pendingReceived.length);
    } catch (err) {
        console.error('Fel vid laddning av vänner:', err);
        document.getElementById('friends-list-container').innerHTML =
            '<p class="empty-state">Kunde inte ladda vänner</p>';
    }
}

function renderFriends(friends) {
    const container = document.getElementById('friends-list-container');

    if (!friends || friends.length === 0) {
        container.innerHTML = '<p class="empty-state">Du har inga vänner än. Lägg till en vän i fliken "Lägg till".</p>';
        return;
    }

    container.innerHTML = friends
        .map(
            friend => `
        <div class="friend-item">
            <div class="friend-info">
                <img src="${friend.avatar_url || '/assets/images/default-avatar.png'}" alt="" class="friend-avatar">
                <div class="friend-meta">
                    <span class="friend-name">${escapeHtml(friend.display_name || friend.username)}</span>
                    <span class="friend-status ${friend.is_online ? 'online' : ''}">
                        ${friend.is_online ? '🟢 Online' : '⚪ Offline'}
                    </span>
                </div>
            </div>
            <div class="friend-actions">
                <button class="btn btn-small btn-danger friend-remove-btn" data-id="${friend.id}">Ta bort</button>
            </div>
        </div>
    `
        )
        .join('');
}

function renderPending(received, sent) {
    const receivedContainer = document.getElementById('pending-received-container');
    const sentContainer = document.getElementById('pending-sent-container');

    if (!received || received.length === 0) {
        receivedContainer.innerHTML = '<p class="empty-state">Inga mottagna förfrågningar</p>';
    } else {
        receivedContainer.innerHTML = received
            .map(
                req => `
            <div class="pending-request">
                <div class="friend-info">
                    <img src="${req.avatar_url || '/assets/images/default-avatar.png'}" alt="" class="friend-avatar">
                    <div class="friend-meta">
                        <span class="friend-name">${escapeHtml(req.display_name || req.username)}</span>
                    </div>
                </div>
                <div class="pending-actions">
                    <button class="btn btn-primary friend-accept-btn" data-id="${req.id}">Acceptera</button>
                    <button class="btn btn-outline friend-reject-btn" data-id="${req.id}">Avböj</button>
                </div>
            </div>
        `
            )
            .join('');
    }

    if (!sent || sent.length === 0) {
        sentContainer.innerHTML = '<p class="empty-state">Inga skickade förfrågningar</p>';
    } else {
        sentContainer.innerHTML = sent
            .map(
                req => `
            <div class="pending-request">
                <div class="friend-info">
                    <img src="${req.avatar_url || '/assets/images/default-avatar.png'}" alt="" class="friend-avatar">
                    <div class="friend-meta">
                        <span class="friend-name">${escapeHtml(req.display_name || req.username)}</span>
                        <span class="friend-status">Väntar på svar...</span>
                    </div>
                </div>
            </div>
        `
            )
            .join('');
    }
}

function updatePendingBadge(count) {
    const badge = document.getElementById('pending-badge');
    if (!badge) return;

    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
}

async function handleAddFriend(e) {
    e.preventDefault();
    if (!AppState.token) return;

    const input = document.getElementById('friend-username');
    const messageEl = document.getElementById('add-friend-message');
    const username = input.value.trim();

    if (!username) return;

    try {
        const response = await fetch('/api/friends/request', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${AppState.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username })
        });

        const data = await response.json();

        if (response.ok) {
            messageEl.textContent = 'Vänförfrågan skickad!';
            messageEl.className = 'form-message success';
            input.value = '';
            loadFriends();
        } else {
            messageEl.textContent = data.error || 'Kunde inte skicka förfrågan';
            messageEl.className = 'form-message error';
        }
    } catch (err) {
        messageEl.textContent = 'Något gick fel. Försök igen.';
        messageEl.className = 'form-message error';
    }
}

async function acceptFriendRequest(requestId) {
    if (!AppState.token || !requestId) return;

    try {
        const response = await fetch(`/api/friends/accept/${requestId}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AppState.token}` }
        });

        if (response.ok) {
            loadFriends();
        } else {
            const data = await response.json();
            showError(data.error || 'Kunde inte acceptera förfrågan');
        }
    } catch (err) {
        showError('Något gick fel');
    }
}

async function rejectFriendRequest(requestId) {
    if (!AppState.token || !requestId) return;

    try {
        const response = await fetch(`/api/friends/reject/${requestId}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AppState.token}` }
        });

        if (response.ok) {
            loadFriends();
        } else {
            const data = await response.json();
            showError(data.error || 'Kunde inte avböja förfrågan');
        }
    } catch (err) {
        showError('Något gick fel');
    }
}

async function removeFriend(friendId) {
    if (!AppState.token || !friendId) return;
    if (!confirm('Är du säker på att du vill ta bort denna vän?')) return;

    try {
        const response = await fetch(`/api/friends/${friendId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${AppState.token}` }
        });

        if (response.ok) {
            loadFriends();
        } else {
            const data = await response.json();
            showError(data.error || 'Kunde inte ta bort vän');
        }
    } catch (err) {
        showError('Något gick fel');
    }
}

function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
