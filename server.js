#!/usr/bin/env node

const socketio = require('socket.io');

const port = 3636;
const io = socketio.listen(port);

console.log(`SCS Server initialized at port ${port}`);

let users = [];
const rooms = [{ name: 'default', createdBy: 'system' }];

function handleSend(mainSocket, currentSocket, data) {
    Object.values(currentSocket.rooms).forEach((room) => {
        if (room !== currentSocket.id) {
            mainSocket.to(room).emit('message', data);
        }
    });
}

function handleHandshake(mainSocket, currentSocket, data) {
    const query = users.find((user) => user.username === data.username);

    if (data.first) {
        if (!query) {
            users.push({
                id: currentSocket.id,
                username: data.username,
                rooms: currentSocket.rooms,
            });

            mainSocket.to(currentSocket.id).emit('handshake', { type: 'confirm' });

            handleSend(mainSocket, currentSocket, { type: 'notice', message: `[${data.username}] has joined [#default]!` });
        } else {
            mainSocket.to(currentSocket.id).emit('handshake', { type: 'denied', reason: 'Username already exists' });
        }
    } else {
        users.push({
            id: currentSocket.id,
            username: data.username,
            rooms: currentSocket.rooms,
        });

        mainSocket.to(currentSocket.id).emit('handshake', { type: 'confirm' });
    }
}

function handleWhisper(mainSocket, currentSocket, data) {
    const { to, from, message } = data;
    const query = users.find((user) => user.username === to);

    if (query) {
        mainSocket.to(query.id).emit('message', {
            type: 'tell', to, from, message,
        });
    } else {
        const msg = `No user found with the username [${to}]!`;
        mainSocket.to(currentSocket.id).emit('message', { type: 'notice', message: msg });
    }
}

function handleChangeRoom(mainSocket, currentSocket, room) {
    currentSocket.leaveAll();
    currentSocket.join(currentSocket.id);
    currentSocket.join(room, () => {
        const userIndex = users.findIndex((user) => user.id === currentSocket.id);
        const msg = `[${users[userIndex].username}] has joined [#${room}]!`;
        mainSocket.to(room).emit('message', { type: 'notice', message: msg });

        users[userIndex].rooms = currentSocket.rooms;
    });
}

function handleNewRoom(mainSocket, currentSocket, data) {
    rooms.push({ name: data.room, createdBy: currentSocket.id });
    const msg = `New room is created by the name [#${data.room}]!`;
    mainSocket.to(currentSocket.id).emit('message', { type: 'notice', message: msg });

    handleChangeRoom(mainSocket, currentSocket, data.room);
}

function handleChangeUsername(mainSocket, currentSocket, data) {
    const userIndex = users.findIndex((user) => user.id === currentSocket.id);
    const msg = `[${users[userIndex].username}] change their name to [${data.username}]!`;

    users[userIndex].username = data.username;
    handleSend(mainSocket, currentSocket, { type: 'notice', message: msg });
}

function handleListUsers(mainSocket, currentSocket) {
    users.forEach((user) => {
        Object.values(user.rooms).forEach((room) => {
            if (room !== user.id) {
                const msg = `(${user.id}) => <${user.username}> @ [#${room}]`;
                mainSocket.to(currentSocket.id).emit('message', { type: 'notice', message: msg });
            }
        });
    });
}

io.sockets.on('connection', (socket) => {
    socket.join('default');

    socket.once('handshake', (data) => {
        handleHandshake(io.sockets, socket, data);
    });

    socket.on('send', (data) => {
        handleSend(io.sockets, socket, data);
    });

    socket.on('whisper', (data) => {
        handleWhisper(io.sockets, socket, data);
    });

    socket.on('room', (data) => {
        const targetRoom = data.room ? data.room : 'default';

        if (rooms.find((room) => room.name === targetRoom)) {
            handleChangeRoom(io.sockets, socket, targetRoom);
        } else {
            handleNewRoom(io.sockets, socket, { room: targetRoom });
        }
    });

    socket.on('username', (data) => {
        handleChangeUsername(io.sockets, socket, data);
    });

    socket.on('list_users', () => {
        handleListUsers(io.sockets, socket);
    });

    socket.on('disconnect', () => {
        users = users.filter((user) => user.id !== socket.id);
    });
});
