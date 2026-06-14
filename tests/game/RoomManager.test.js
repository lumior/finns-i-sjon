const RoomManager = require('../../server/game/RoomManager');

describe('RoomManager', () => {
    let rm;

    beforeEach(() => {
        rm = new RoomManager();
    });

    test('should create a room', async () => {
        const result = await rm.createRoom('Alice', 'socket1');
        expect(result.success).toBe(true);
        expect(result.roomId).toBeDefined();
        expect(result.roomId.length).toBe(8);
        expect(rm.rooms.size).toBe(1);
        expect(rm.playerRooms.get('socket1')).toBe(result.roomId);
    });

    test('should create a room with options', async () => {
        const result = await rm.createRoom('Alice', 'socket1', {
            roomName: 'Testbord',
            password: 'secret',
            maxPlayers: 4
        });
        expect(result.success).toBe(true);
        const room = rm.rooms.get(result.roomId);
        expect(room.name).toBe('Testbord');
        expect(room.passwordHash).toBeDefined();
        expect(room.passwordHash).not.toBe('secret');
        expect(room.isPrivate).toBe(true);
        expect(room.game.settings.maxPlayers).toBe(4);
    });

    test('should join a room', async () => {
        const created = await rm.createRoom('Alice', 'socket1');
        const result = await rm.joinRoom(created.roomId, 'Bob', 'socket2');
        expect(result.success).toBe(true);
        expect(result.game.players.length).toBe(2);
        expect(rm.playerRooms.get('socket2')).toBe(created.roomId);
    });

    test('should reject join with wrong password', async () => {
        const created = await rm.createRoom('Alice', 'socket1', { password: 'secret' });
        const result = await rm.joinRoom(created.roomId, 'Bob', 'socket2', 'wrong');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Fel lösenord');
    });

    test('should accept join with correct password', async () => {
        const created = await rm.createRoom('Alice', 'socket1', { password: 'secret' });
        const result = await rm.joinRoom(created.roomId, 'Bob', 'socket2', 'secret');
        expect(result.success).toBe(true);
    });

    test('should reject join to non-existent room', async () => {
        const result = await rm.joinRoom('NONEXIST', 'Bob', 'socket2');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Rummet finns inte');
    });

    test('should reject banned player', async () => {
        const created = await rm.createRoom('Alice', 'socket1');
        const room = rm.rooms.get(created.roomId);
        room.bannedPlayers.add('socket2');
        const result = await rm.joinRoom(created.roomId, 'Bob', 'socket2');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Du är bannad från detta rum');
    });

    test('should allow spectator when game is playing', async () => {
        const created = await rm.createRoom('Alice', 'socket1');
        await rm.joinRoom(created.roomId, 'Bob', 'socket2');
        const room = rm.rooms.get(created.roomId);
        room.game.startGame();
        const result = await rm.joinRoom(created.roomId, 'Charlie', 'socket3');
        expect(result.success).toBe(true);
        expect(result.isSpectator).toBe(true);
    });

    test('should leave a room with forceRemove', async () => {
        await rm.createRoom('Alice', 'socket1');
        const roomId = rm.getPublicRoomList()[0].roomId;
        await rm.joinRoom(roomId, 'Bob', 'socket2');
        const result = rm.leaveRoom('socket2', true);
        expect(result).not.toBeNull();
        expect(result.player).toBeDefined();
        expect(rm.playerRooms.has('socket2')).toBe(false);
    });

    test('should mark player as disconnected on non-force leave', async () => {
        await rm.createRoom('Alice', 'socket1');
        const roomId = rm.getPublicRoomList()[0].roomId;
        await rm.joinRoom(roomId, 'Bob', 'socket2');
        const result = rm.leaveRoom('socket2', false);
        expect(result).not.toBeNull();
        expect(result.disconnected).toBe(true);
        expect(rm.playerRooms.has('socket2')).toBe(true);
    });

    test('should kick a player', async () => {
        const created = await rm.createRoom('Alice', 'socket1');
        await rm.joinRoom(created.roomId, 'Bob', 'socket2');
        const result = rm.kickPlayer(created.roomId, 'socket2', 'socket1');
        expect(result.success).toBe(true);
        expect(result.playerName).toBe('Bob');
    });

    test('should prevent non-host from kicking', async () => {
        const created = await rm.createRoom('Alice', 'socket1');
        await rm.joinRoom(created.roomId, 'Bob', 'socket2');
        const result = rm.kickPlayer(created.roomId, 'socket1', 'socket2');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Endast värden kan kicka spelare');
    });

    test('should prevent self-kick', async () => {
        const created = await rm.createRoom('Alice', 'socket1');
        await rm.joinRoom(created.roomId, 'Bob', 'socket2');
        const result = rm.kickPlayer(created.roomId, 'socket1', 'socket1');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Du kan inte kicka dig själv');
    });

    test('should ban a player by socketId', async () => {
        const created = await rm.createRoom('Alice', 'socket1');
        await rm.joinRoom(created.roomId, 'Bob', 'socket2');
        const result = rm.banPlayer(created.roomId, 'socket2', 'socket1');
        expect(result.success).toBe(true);
        expect(result.banned).toBe(true);

        const rejoin = await rm.joinRoom(created.roomId, 'Bob', 'socket2');
        expect(rejoin.success).toBe(false);
        expect(rejoin.error).toBe('Du är bannad från detta rum');
    });

    test('should ban a logged-in player by userId across reconnects', async () => {
        const created = await rm.createRoom('Alice', 'socket1');
        await rm.joinRoom(created.roomId, 'Bob', 'socket2', null, { id: 42, elo: 1200, avatar: null });
        const result = rm.banPlayer(created.roomId, 'socket2', 'socket1');
        expect(result.success).toBe(true);

        const rejoin = await rm.joinRoom(created.roomId, 'Bob', 'socket2-new', null, {
            id: 42,
            elo: 1200,
            avatar: null
        });
        expect(rejoin.success).toBe(false);
        expect(rejoin.error).toBe('Du är bannad från detta rum');
    });

    test('should prevent non-host from banning', async () => {
        const created = await rm.createRoom('Alice', 'socket1');
        await rm.joinRoom(created.roomId, 'Bob', 'socket2');
        const result = rm.banPlayer(created.roomId, 'socket1', 'socket2');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Endast värden kan kicka spelare');
    });

    test('should get room by socket', async () => {
        await rm.createRoom('Alice', 'socket1');
        const room = rm.getRoomBySocket('socket1');
        expect(room).not.toBeNull();
        expect(room.game.players[0].name).toBe('Alice');
    });

    test('should reconnect a disconnected player', async () => {
        await rm.createRoom('Alice', 'socket1');
        const roomId = rm.getPublicRoomList()[0].roomId;
        await rm.joinRoom(roomId, 'Bob', 'socket2');
        rm.leaveRoom('socket2', false);
        const result = rm.reconnect('socket2', 'socket2-new');
        expect(result).not.toBeNull();
        expect(result.roomId).toBe(roomId);
        expect(result.player.connected).toBe(true);
        expect(result.player.socketId).toBe('socket2-new');
    });

    test('should list public rooms', async () => {
        await rm.createRoom('Alice', 'socket1');
        await rm.createRoom('Bob', 'socket2', { password: 'secret' });
        const list = rm.getPublicRoomList();
        expect(list.length).toBe(1);
        expect(list[0].hostName).toBe('Alice');
    });
});
