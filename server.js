#!/usr/bin/env node

/**
 * SCS - Server
 * *
 * In this document,
 * 'io.sockets' is used as the defualt channel ('/'),
 * 'socket' is used as the current connection between the server and the user.
 * *
 * mainSocket is a reference to 'io.sockets'.
 * currentSocket is a reference to 'socket'.
 */

const socketio = require('socket.io');

const port = 3636; // The port for the socket to listen
const io = socketio.listen(port);

console.log(`SCS Server initialized at port ${port}`);

// Users array to keep track of online users and bind their usernames to their IDs.
let users = [];

// Rooms array to avoid name confusions.
const rooms = [{ name: 'default', createdBy: 'system' }];

function handleSend(mainSocket, currentSocket, data) {
    /**
     * Send a message to each room that the user had joined.
     */
    Object.values(currentSocket.rooms).forEach((room) => {
        // Avoid the room with their own IDs to prevent repetition.
        if (room !== currentSocket.id) {
            mainSocket.to(room).emit('message', data);
        }
    });
}

function handleHandshake(mainSocket, currentSocket, data) {
    /**
     * Once the user is connected, they are required to do a handshake with the server.
     * The handshake make sures that the username that the user chose is not in use.
     * Moreover, it tracks the online users by their IDs, usernames and rooms.
     * If there is no problem user gets a confirmation response.
     */

    // Query for the desired username.
    const query = users.find((user) => user.username === data.username);

    // Check whether this is an initial connection or a reconnection.
    if (data.first) {
        if (!query) {
            // Push user info to the users array.
            users.push({
                id: currentSocket.id,
                username: data.username,
                rooms: currentSocket.rooms,
            });

            // Send a confirmation to the user.
            mainSocket.to(currentSocket.id).emit('handshake', { type: 'confirm' });

            // Send a notice to the server that a new user has joined.
            handleSend(mainSocket, currentSocket, { type: 'notice', message: `[${data.username}] has joined [#default]!` });
        } else {
            // Send a rejection with the reason to the user.
            mainSocket.to(currentSocket.id).emit('handshake', { type: 'denied', reason: 'Username already exists' });
        }
    } else {
        // Push user info to the users array.
        users.push({
            id: currentSocket.id,
            username: data.username,
            rooms: currentSocket.rooms,
        });

        // Send a confirmation to the user.
        mainSocket.to(currentSocket.id).emit('handshake', { type: 'confirm' });
    }
}

function handleWhisper(mainSocket, currentSocket, data) {
    /**
     * '/w' command is used to whisper to users. These messages can only be seen
     * by the user who send the message and the person who recieves it.
     */

    const { to, from, message } = data;
    // Confirm that the target user exists.
    const query = users.find((user) => user.username === to);

    if (query) {
        // Send message to the target.
        mainSocket.to(query.id).emit('message', {
            type: 'tell', to, from, message,
        });
    } else {
        // Send warning to the user.
        const msg = `No user found with the username [${to}]!`;
        mainSocket.to(currentSocket.id).emit('message', { type: 'notice', message: msg });
    }
}

function handleChangeRoom(mainSocket, currentSocket, room) {
    /**
     * '/room' command is used to change the chat room in a server.
     * Once called, user leaves all the rooms, joins their ID's room and the target room.
     * After the room change, a notice is broadcasted to the target room.
     * The user's rooms in the array are updated according to the change.
     */

    // Leave all the rooms to avoid conflicts.
    currentSocket.leaveAll();
    // User should be in their ID's room to recive whispers.
    currentSocket.join(currentSocket.id);
    // Join to the desired room.
    currentSocket.join(room, () => {
        // Find the user from the users array.
        const userIndex = users.findIndex((user) => user.id === currentSocket.id);

        // Broadcast a notice to the room.
        const msg = `[${users[userIndex].username}] has joined [#${room}]!`;
        mainSocket.to(room).emit('message', { type: 'notice', message: msg });

        // Update the users array.
        users[userIndex].rooms = currentSocket.rooms;
    });
}

function handleNewRoom(mainSocket, currentSocket, data) {
    /**
     * When tried to change the room, if there is no room with that name already,
     * a new room is created. This is an additional step to keep track of the rooms.
     */

    // Push a new room to the rooms array.
    rooms.push({ name: data.room, createdBy: currentSocket.id });
    // Send a notice to the user that the new room is created.
    const msg = `New room is created by the name [#${data.room}]!`;
    mainSocket.to(currentSocket.id).emit('message', { type: 'notice', message: msg });

    // Call handleChangeRoom to change the room.
    handleChangeRoom(mainSocket, currentSocket, data.room);
}

function handleChangeUsername(mainSocket, currentSocket, data) {
    /**
     * '/username' command is used to change the user's username during the ongoing connection.
     */

    // Find the user from the users array
    const userIndex = users.findIndex((user) => user.id === currentSocket.id);

    // Broadcast a notice to the rooms of the user that the username is changed.
    const msg = `[${users[userIndex].username}] change their name to [${data.username}]!`;
    handleSend(mainSocket, currentSocket, { type: 'notice', message: msg });

    // Update the users array.
    users[userIndex].username = data.username;

    // Send a confirmation to the user.
    mainSocket.to(currentSocket.id).emit('username', { type: 'confirm', username: data.username });
}

function handleListUsers(mainSocket, currentSocket) {
    /**
     * '/users' command is used to list all online users with their usernames, IDs and rooms.
     * Send the list of users to the user who asked to see the list of online users.
     */

    // For each user who are in the users array (online)...
    users.forEach((user) => {
        Object.values(user.rooms).forEach((room) => {
            // Ignore each users' own ID rooms.
            if (room !== user.id) {
                // Send the information line by line.
                const msg = `(${user.id}) => <${user.username}> @ [#${room}]`;
                mainSocket.to(currentSocket.id).emit('message', { type: 'notice', message: msg });
            }
        });
    });
}

/**
 * When there is an open connection initialize all the listeners.
 */
io.sockets.on('connection', (socket) => {
    // Automatically assign each user to the default room.
    socket.join('default');

    // Except a handshake from the user.
    socket.once('handshake', (data) => {
        handleHandshake(io.sockets, socket, data);
    });

    // When user sends a message, handle the transmission.
    socket.on('send', (data) => {
        handleSend(io.sockets, socket, data);
    });

    // When user whispers another user, handle the whisper.
    socket.on('whisper', (data) => {
        handleWhisper(io.sockets, socket, data);
    });

    // When user requests a room change, handle the change.
    socket.on('room', (data) => {
        // If the command was sent without an argument ('/room'), assume default room.
        const targetRoom = data.room ? data.room : 'default';

        if (rooms.find((room) => room.name === targetRoom)) {
            // If the room already exists, handle change.
            handleChangeRoom(io.sockets, socket, targetRoom);
        } else {
            // If the room does not exists, create a new room.
            handleNewRoom(io.sockets, socket, { room: targetRoom });
        }
    });

    // When user requests a username change, handle the change.
    socket.on('username', (data) => {
        const query = users.find((user) => data.username === user.username);

        if (!query) {
            handleChangeUsername(io.sockets, socket, data);
            return;
        }

        io.sockets.to(socket.id).emit('username', { type: 'denied' });
        const msg = `[${data.username}] is currently used by another user!`;
        io.sockets.to(socket.id).emit('message', { type: 'notice', message: msg });
    });

    // When user requests to list online users, handle the list.
    socket.on('list_users', () => {
        handleListUsers(io.sockets, socket);
    });

    // If user disconnects, remove them from the array.
    socket.on('disconnect', () => {
        users = users.filter((user) => user.id !== socket.id);
    });
});
