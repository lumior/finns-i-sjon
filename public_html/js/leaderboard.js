async function loadLeaderboard() {
    try {
        const response = await fetch('/api/users/leaderboard?limit=100');
        const leaderboard = await response.json();
        renderLeaderboard(leaderboard);
    } catch (error) {
        document.getElementById('full-leaderboard').innerHTML = '<p class="empty-state">Kunde inte ladda topplista</p>';
    }
}

function renderLeaderboard(leaderboard) {
    const container = document.getElementById('full-leaderboard');

    if (leaderboard.length === 0) {
        container.innerHTML = '<p class="empty-state">Inga spelare på topplistan än</p>';
        return;
    }

    container.innerHTML = leaderboard.map((user, index) => `
        <div class="leaderboard-row" style="grid-template-columns: 60px 1fr 100px 100px 100px;">
            <div class="rank-number ${index < 3 ? 'top-3' : ''}" style="font-size: 1.5rem;">
                ${index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
            </div>
            <div class="leaderboard-user">
                <img src="${user.avatar_url || '/assets/images/default-avatar.png'}" alt="" class="leaderboard-avatar" style="width: 40px; height: 40px;">
                <div>
                    <div class="leaderboard-name" style="font-size: 1.1rem;">${user.display_name || user.username}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">${user.games_played} spel</div>
                </div>
            </div>
            <div class="leaderboard-elo" style="font-size: 1.2rem;">${user.elo_rating}</div>
            <div style="color: var(--secondary); font-weight: 600;">${user.games_won} vinster</div>
            <div style="color: var(--text-muted);">${user.winRate || 0}% WR</div>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', loadLeaderboard);
