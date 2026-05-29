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
    startRoomsPolling();
    
    if (window.socket) {
        localStorage.setItem('socketId', window.socket.id);
    }
});

window.addEventListener('beforeunload', () => {
    stopRoomsPolling();
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
}

function showUserSection(user) {
    elements.authSection.classList.add('hidden');
    elements.userSection.classList.remove('hidden');
    elements.userAvatar.src = user.avatar_url || '/assets/images/default-avatar.png';
    elements.userName.textContent = user.display_name || user.username;
    elements.userElo.textContent = `${user.elo_rating} ELO`;
    
    document.getElementById('create-name').value = user.display_name || user.username;
    document.getElementById('ai-player-name').value = user.display_name || user.username;
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

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
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
        } else {
            showError(data.error || 'Inloggning misslyckades');
        }
    } catch (error) {
        showError('Nätverksfel - försök igen');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const displayName = document.getElementById('reg-display').value;
    const password = document.getElementById('reg-password').value;
    
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
        } else {
            showError(data.error || 'Registrering misslyckades');
        }
    } catch (error) {
        showError('Nätverksfel - försök igen');
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

let roomsRefreshInterval = null;

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

function startRoomsPolling() {
    if (roomsRefreshInterval) return;
    console.log('🔄 Startar bords-polling');
    // Polling var 10:e sekund för realtidsuppdatering av bordslistan
    roomsRefreshInterval = setInterval(() => {
        console.log('🔄 Polling: hämtar bordslista...');
        loadRooms();
        updateOnlineStats();
    }, 10000);
}

function stopRoomsPolling() {
    if (roomsRefreshInterval) {
        clearInterval(roomsRefreshInterval);
        roomsRefreshInterval = null;
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
        showError(data.message);
    });
}

async function startAIGame() {
    const playerName = document.getElementById('ai-player-name').value.trim();
    const difficulty = AppState.selectedDifficulty;
    
    if (!playerName) {
        showError('Ange ditt namn');
        return;
    }
    if (!difficulty) {
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

function showModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function hideModal(id) {
    document.getElementById(id).classList.add('hidden');
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
