#!/usr/bin/env node

const readline = require('readline');
const socketio = require('socket.io-client');
const color = require('ansi-color').set;

let id;
let username;
let server;
let port;
let channel;

let socket;
const opts = {
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
    reconnectionAttempts: Infinity,
    forceNew: true,
};

let sigintCount = 0;

const rl = readline.createInterface(process.stdin, process.stdout);

function consoleOut(msg) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    console.log(msg);
    rl.prompt();
}

function updateSocket(newSocket) {
    socket = newSocket;
    id = newSocket.id;
    chat();
}

function parseAddress(address, callback) {
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
    callback();
}

rl.question('Server: ', (address) => {
    parseAddress(address, () => {
        socket = socketio.connect(`http://${server}:${port}/${channel}`, opts);
    });

    socket.once('connect', () => {
        id = socket.id;
        consoleOut(color(`[!] Connected to ${socket.io.uri}`, 'yellow'));

        rl.question('Username: ', (input) => {
            if (input) {
                username = input;
                socket.emit('handshake', { first: true, username });
            } else {
                consoleOut(color('Username cannot be empty!', 'red'));
                process.exit();
            }
        });
    });

    socket.once('handshake', (data) => {
        if (data.type !== 'confirm') {
            consoleOut(color('Handshake with the server was unsuccessful!', 'red'));
            if (data.reason) {
                consoleOut(color(`Reason: ${data.reason}`, 'red'));
            }
            return process.exit();
        }

        chat();
        return rl.prompt();
    });

    socket.once('connect_error', () => {
        consoleOut(color('Cannot connect to that server!', 'red'));
        return process.exit();
    });

    socket.once('error', () => {
        consoleOut(color('Cannot connect to that server!', 'red'));
        return process.exit();
    });
});

rl.on('line', (input) => {
    const line = input.trim();
    if (line[0] === '/' && line.length > 1) {
        const cmd = line.split(' ')[0].slice(1);
        const arg = line.slice(line.split(' ')[0].length + 1, line.length);
        chatCommands(cmd, arg);
    } else {
        socket.emit('send', { type: 'chat', message: line, username });
        rl.prompt();
    }
});

rl.on('SIGINT', () => {
    sigintCount += 1;

    if (sigintCount > 1) {
        process.exit();
    }

    rl.question('Are you sure you want to exit? (y/n): ', (answer) => {
        if (answer.match(/^y(es)?$/i)) process.exit();

        sigintCount = 0;
        return rl.prompt();
    });
});

function chatCommands(cmd, arg = '') {
    let message = '';
    let to = '';

    switch (cmd) {
    case 'username':
        if (arg) {
            username = arg;
            socket.emit('username', { username: arg });
        }
        rl.prompt();
        break;

    case 'w':
        to = arg.split(' ')[0];
        message = arg.substr(to.length, arg.length);
        socket.emit('whisper', { from: username, to, message });
        rl.prompt();
        break;

    case 'me':
        message = arg ? `[${username}] ${arg}` : `[${username}]`;
        socket.emit('send', { type: 'emote', message });
        rl.prompt();
        break;

    case 'ch':
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
        socket.emit('room', { room: arg });
        rl.prompt();
        break;

    case 'clear':
        process.stdout.write('\u001B[2J\u001B[0;0f');
        rl.prompt();
        break;

    case 'id':
        consoleOut(color('ID: ', 'yellow') + id);
        break;

    case 'server':
        consoleOut(color('URL: ', 'yellow') + socket.io.uri);
        break;

    case 'status':
        consoleOut(color('State: ', 'yellow') + socket.io.readyState);
        break;

    case 'users':
        socket.emit('list_users');
        rl.prompt();
        break;

    case 'exit':
        process.exit();
        break;

    default:
        consoleOut(color('[!] Unknown command!', 'red'));
        break;
    }
}

function chat() {
    socket.removeAllListeners();

    socket.on('message', (data) => {
        if (data.type === 'chat' && data.username !== username) {
            const prefix = color(`<${data.username}> `, 'green');
            consoleOut(prefix + data.message);
        } else if (data.type === 'notice') {
            consoleOut(color(data.message, 'cyan'));
        } else if (data.type === 'tell' && data.to === username) {
            const prefix = color(`[${data.from} -> ${data.to}]`, 'magenta');
            consoleOut(prefix + data.message);
        } else if (data.type === 'emote') {
            consoleOut(color(data.message, 'underline'));
        }
    });

    socket.once('disconnect', (reason) => {
        if (reason === 'io client disconnect') return;

        consoleOut(color('Connection lost!', 'red'));
        socket.removeListener('message');

        socket = socketio.connect(`http://${server}:${port}/${channel}`, opts);
        socket.connect();
    });

    socket.once('reconnect', () => {
        socket.emit('handshake', { first: false, username });

        socket.once('handshake', (data) => {
            if (data.type !== 'confirm') {
                consoleOut(color('Handshake with the server was unsuccessful!', 'red'));
                rl.close();
                return process.exit();
            }

            updateSocket(socket);
            consoleOut(color('Reconnected to the server!', 'green'));
            return rl.prompt();
        });

        rl.resume();
    });
}
