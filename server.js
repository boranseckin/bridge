#!/usr/bin/env node

/**
 * Bridge - Server
 * *
 * In this document,
 * 'io.sockets' is used as the defualt channel ('/'),
 * 'socket' is used as the current connection between the server and the user.
 * *
 * mainSocket is a reference to 'io.sockets'.
 * currentSocket is a reference to 'socket'.
 */

const socketio = require('socket.io');
const meow = require('meow');

const cli = meow(`
    Bridge - Server

    Usage
    $ bridge-server <options>

    Options
    --port,    -p  Select the port to run the server.
    --channel, -c  Open a new channel in the server.
    --version      Show the current version of the package.
    --help         Show this help message.

    Examples
    $ bridge-server -p 1111
        Port: 1111 / Channel: [/]
    
    $ bridge-server -c test
        Port: 3636 / Channel: [/, /test]
    
    $ bridge-server -p 1111 -c foo -c bar
        Port: 1111 / Channel: [/, /foo, /bar]
`, {
    flags: {
        port: {
            type: 'number',
            alias: 'p',
            default: 3636,
        },
        channel: {
            type: 'string',
            alias: 'c',
        },
    },
    autoVersion: true,
    autoHelp: true,
    description: false,
});

// The port for the socket to listen.
const { port } = cli.flags;
const io = socketio.listen(port);

// The channel for the socket to open.
let { channel } = cli.flags;
channel = Array.isArray(channel) ? channel : [channel];

console.log(`Bridge - Server initialized! Port: ${port} - ${channel.length === 1 ? 'Channel: [/]' : `Channels: [/ /${channel.join(' /')}]`}`);

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

            console.log(`User [${data.username}] connected from [${currentSocket.request.connection.remoteAddress}] with ID [${currentSocket.id}]`);

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

        console.log(`User [${data.username}] reconnected from [${currentSocket.request.connection.remoteAddress}] with ID [${currentSocket.id}]`);

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

function openSocket(mainSocket) {
    /**
     * When there is an open connection initialize all the listeners.
     */
    mainSocket.on('connection', (socket) => {
        // Automatically assign each user to the default room.
        socket.join('default');

        // Except a handshake from the user.
        socket.once('handshake', (data) => {
            handleHandshake(mainSocket, socket, data);
        });

        // When user sends a message, handle the transmission.
        socket.on('send', (data) => {
            handleSend(mainSocket, socket, data);
        });

        // When user whispers another user, handle the whisper.
        socket.on('whisper', (data) => {
            handleWhisper(mainSocket, socket, data);
        });

        // When user requests a room change, handle the change.
        socket.on('room', (data) => {
            // If the command was sent without an argument ('/room'), assume default room.
            const targetRoom = data.room ? data.room : 'default';

            if (rooms.find((room) => room.name === targetRoom)) {
                // If the room already exists, handle change.
                handleChangeRoom(mainSocket, socket, targetRoom);
            } else {
                // If the room does not exists, create a new room.
                handleNewRoom(mainSocket, socket, { room: targetRoom });
            }
        });

        // When user requests a username change, handle the change.
        socket.on('username', (data) => {
            const query = users.find((user) => data.username === user.username);

            if (!query) {
                handleChangeUsername(mainSocket, socket, data);
                return;
            }

            mainSocket.to(socket.id).emit('username', { type: 'denied' });
            const msg = `[${data.username}] is currently used by another user!`;
            mainSocket.to(socket.id).emit('message', { type: 'notice', message: msg });
        });

        // When user requests to list online users, handle the list.
        socket.on('list_users', () => {
            handleListUsers(mainSocket, socket);
        });

        // If user disconnects, remove them from the array.
        socket.on('disconnect', () => {
            users = users.filter((user) => {
                if (user.id !== socket.id) {
                    return user;
                }
                console.log(`User [${user.username}] disconnected from [${socket.request.connection.remoteAddress}] with ID [${socket.id}]`);
                return null;
            });
        });
    });
}

// Start server at the default channel.
openSocket(io.of('/'));

// Start server at each channel argument.
if (channel) {
    channel.forEach((ch) => {
        openSocket(io.of(`/${ch}`));
    });
}
