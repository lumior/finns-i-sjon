const db = require('../server/config/database');
const { getPlayerAvatar } = require('../server/game/utils');

async function updateAvatars() {
    await db.connect();

    const users = await db.query(
        "SELECT id, username, avatar_url FROM users WHERE avatar_url = '/assets/images/default-avatar.png' OR avatar_url IS NULL"
    );

    console.log(`Hittade ${users.length} användare med default-avatar...`);

    for (const user of users) {
        const newAvatar = getPlayerAvatar(user.username);
        await db.run(
            'UPDATE users SET avatar_url = ? WHERE id = ?',
            [newAvatar, user.id]
        );
        console.log(`  ${user.username} → ${newAvatar}`);
    }

    console.log('Klart!');
    process.exit(0);
}

updateAvatars().catch(err => {
    console.error('Fel:', err);
    process.exit(1);
});
