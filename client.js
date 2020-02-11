#!/usr/bin/env node

/**
 * Bridge - Client
 * *
 * This code is used to connect to a Socket.io server created by Bridge-Server.
 */

const readline = require('readline');
const socketio = require('socket.io-client');
const color = require('ansi-color').set;

// All these variables are used to keep a local reference.
let id;
let username;
let server;
let port;
let channel;

let socket; // Main socket connection

// Connection options.
const opts = {
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
    reconnectionAttempts: Infinity,
    forceNew: true,
};

// Counter to handle instant exit when pressed 'ctrl-c' twice.
let sigintCount = 0;

// Create readline interface.
const rl = readline.createInterface(process.stdin, process.stdout);

function consoleOut(msg) {
    /**
     * Handle console.log while the readline interface is on.
     */

    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    console.log(msg);
    rl.prompt();
}

function updateSocket(newSocket) {
    /**
     * When the socket changes (reconnection, channel change), update the reference object.
     */

    // Change the socket object.
    socket = newSocket;
    // Change the local ID.
    id = newSocket.id;
    // Initialize chat again to refresh the listeners.
    chat();
}

function parseAddress(address, callback) {
    /**
     * Parse the address input when the client is first initialized.
     * Get address (URL), port and channel from the input.
     * If any information is missing, assume default values.
     * *
     * Default Address: (localhost:3636/)
     * *
     * The port is specified after a colon (:).
     * The channel is specified after a forward slash (/).
     * *
     * Example: (localhost:3636/test)
     *  - Address: "localhost"
     *  - Port: "3636"
     *  - Channel: "test"
     */

    if (address) {
        if (address.includes(':')) {
            server = address.slice(0, address.indexOf(':'));

            if (address.includes('/')) {
                port = address.slice(address.indexOf(':') + 1, address.lastIndexOf('/'));
                channel = address.slice(address.lastIndexOf('/') + 1) || '';
            } else {
                port = address.slice(address.indexOf(':') + 1, address.length);
                channel = '';
            }
        } else {
            server = address;
            port = '3636';
            channel = '';
        }
    } else {
        server = 'localhost';
        port = '3636';
        channel = '';
    }

    // Call callback.
    callback();
}

// Ask user to input the server address.
rl.question('Server: ', (address) => {
    let timeout;

    // Parse the address.
    parseAddress(address, () => {
        // Connect to the specified address.
        socket = socketio.connect(`http://${server}:${port}/${channel}`, opts);
    });

    // When connected;
    socket.once('connect', () => {
        // Update the local user ID value.
        id = socket.id;
        consoleOut(color(`[!] Connecting to ${socket.io.uri}`, 'yellow'));

        // Ask user to input a username.
        rl.question('Username: ', (input) => {
            // The input cannot be empty.
            if (input) {
                // Update the local username value.
                username = input;
                // Send a handshake request, indicating that this is the initial connection.
                socket.emit('handshake', { first: true, username });
                // Timeout if server does not respond to the handshake for more than 5 minutes.
                timeout = setTimeout(() => {
                    consoleOut(color('Handshake timed out!', 'red'));
                    process.exit();
                }, 5000);
            } else {
                consoleOut(color('Username cannot be empty!', 'red'));
                process.exit(); // Terminate the program.
            }
        });
    });

    // When handshake response arrives;
    socket.once('handshake', (data) => {
        if (data.type !== 'confirm') {
            // If the server does not send a confirmation terminate the program.
            consoleOut(color('Handshake with the server was unsuccessful!', 'red'));
            if (data.reason) {
                consoleOut(color(`Reason: ${data.reason}`, 'red'));
            }
            return process.exit();
        }

        // Clear the timeout.
        clearTimeout(timeout);
        // Initialize the chat.
        chat();
        return rl.prompt();
    });

    // If an error occurs during connection;
    socket.once('connect_error', () => {
        consoleOut(color('Cannot connect to that server!', 'red'));
        return process.exit();
    });

    // If an error occurs in general;
    socket.once('error', () => {
        consoleOut(color('Cannot connect to that server!', 'red'));
        return process.exit();
    });
});

// Handle chat input from the user.
rl.on('line', (input) => {
    // Trim any space before or after the input.
    const line = input.trim();

    // If the input start with a forward slash assume command.
    if (line[0] === '/' && line.length > 1) {
        // Take the first string group without the forward slash as the command.
        const cmd = line.split(' ')[0].slice(1);
        // Take the rest as the argument.
        const arg = line.slice(line.split(' ')[0].length + 1, line.length);
        // Call chatCommand.
        chatCommands(cmd, arg);
    } else {
    // Otherwise send it as a chat message.
        socket.emit('send', { type: 'chat', message: line, username });
        rl.prompt();
    }
});

// Handle 'ctrl-c' input during the program.
rl.on('SIGINT', () => {
    // When called increase the counter.
    sigintCount += 1;

    if (sigintCount > 1) {
        // If SIGINT is called more than once exit immediately.
        process.exit();
    }

    // Ask if the user wants to exit.
    rl.question('Are you sure you want to exit? (y/n): ', (answer) => {
        // If the answer is yes (or another iteration of it), exit.
        if (answer.match(/^y(es)?$/i)) process.exit();

        // Otherwise reset the counter and continue.
        sigintCount = 0;
        return rl.prompt();
    });
});

function chatCommands(cmd, arg = '') {
    /**
     * Parse and handle '/' commands.
     */

    let message = '';
    let to = '';

    switch (cmd) {
    case 'username':
        // Change username
        if (arg) {
            // Send change request for the username.
            socket.emit('username', { username: arg });

            // Except a confirmation from the server.
            socket.once('username', (data) => {
                if (data.type === 'confirm') {
                    username = data.username;
                }
            });
        }
        rl.prompt();
        break;

    case 'w':
        // Whisper another user.
        to = arg.split(' ')[0]; // Get the destination.
        message = arg.substr(to.length, arg.length); // Get the message.
        // Send the message.
        socket.emit('whisper', { from: username, to, message });
        rl.prompt();
        break;

    case 'me':
        // Emote to the whole room.
        // If there is no message just show the username.
        message = arg ? `[${username}] ${arg}` : `[${username}]`;
        // Send the message.
        socket.emit('send', { type: 'emote', message });
        rl.prompt();
        break;

    case 'ch':
        // Used to change the channel. Currently DISABLED.
        /*
        console_out(color(`Leaving the channel [/${channel}]`, 'yellow'));
        socket.disconnect();

        channel = arg ? arg : '';
        socket = socketio.connect(`http://${server}:${port}/${channel}`, opts);

        socket.once('connect', () => {
            console_out(color(`Entered the channel [/${channel}]`, 'yellow'));
            updateSocket(socket);
            let msg = `[${username}] has joined [#default]!`;
            socket.emit('send', { type: 'notice', message: msg });
        });
        */
        break;

    case 'room':
        // Change the room.
        socket.emit('room', { room: arg });
        rl.prompt();
        break;

    case 'clear':
        // Clear the chat.
        process.stdout.write('\u001B[2J\u001B[0;0f');
        rl.prompt();
        break;

    case 'id':
        // Print the user's ID.
        consoleOut(color('ID: ', 'yellow') + id);
        break;

    case 'server':
        // Print the server's URL.
        consoleOut(color('URL: ', 'yellow') + socket.io.uri);
        break;

    case 'status':
        // Show the connection status.
        consoleOut(color('State: ', 'yellow') + socket.io.readyState);
        break;

    case 'users':
        // List all online users in the server.
        socket.emit('list_users');
        rl.prompt();
        break;

    case 'exit':
        // Exit the program.
        process.exit();
        break;

    default:
        // Unknown Command.
        consoleOut(color('[!] Unknown command!', 'red'));
        break;
    }
}

function chat() {
    /**
     * Handle incomming messages and connections.
     */

    // To reset all listeners, first remove the old ones.
    socket.removeAllListeners();

    // Handle incoming message and print with format.
    socket.on('message', (data) => {
        if (data.type === 'chat' && data.username !== username) {
            // Default chat.
            const prefix = color(`<${data.username}> `, 'green');
            consoleOut(prefix + data.message);
        } else if (data.type === 'notice') {
            // Notice message.
            consoleOut(color(data.message, 'cyan'));
        } else if (data.type === 'tell' && data.to === username) {
            // Whisper message.
            const prefix = color(`[${data.from} -> ${data.to}]`, 'magenta');
            consoleOut(prefix + data.message);
        } else if (data.type === 'emote') {
            // Emote message.
            consoleOut(color(data.message, 'underline'));
        }
    });

    // If user disconnects from the server
    socket.once('disconnect', (reason) => {
        // If it was intentional, do nothing.
        if (reason === 'io client disconnect') return;

        // Indicate the lost connection.
        consoleOut(color('Connection lost!', 'red'));
        // Stop the chat listener.
        socket.removeListener('message');

        // Try to reconnect.
        socket = socketio.connect(`http://${server}:${port}/${channel}`, opts);
        socket.connect();
    });

    // If user reconnects to the server
    socket.once('reconnect', () => {
        // Send a handshake for reconnection.
        socket.emit('handshake', { first: false, username });

        socket.once('handshake', (data) => {
            if (data.type !== 'confirm') {
                // If handshake is not complete, exit.
                consoleOut(color('Handshake with the server was unsuccessful!', 'red'));
                rl.close();
                return process.exit();
            }

            // If handshake is complete, update sockets.
            updateSocket(socket);
            consoleOut(color('Reconnected to the server!', 'green'));
            return rl.prompt();
        });

        rl.resume();
    });
}
