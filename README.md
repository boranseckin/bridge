# Bridge - Simple Chat Service

Bridge is a basic CLI chat application using [Socket.io](https://socket.io/).

## Features
- Server, port and channel selection when started.
- Username selection when first connected to the server.
- Change usernames on the fly.
- Unlimited room initialization and connection.
- Whisper to other users in private.
- Emote to draw attention.
- Auto-reconnection when connection is interrupted.
- Colors... Lots of colors!

## Usage
Install the bridge package by running `npm install -g boranseckin/bridge`.

### Client
1. Run `npx bridge` to start the client.
2. When prompted `Server:`, enter the server URL in the form of `<domain>:<port>/<channel>`.
    - If you do not specify channel, it will be assumed `/`.
    - If you do not specify port, it will be assumed `3636`.
    - If you do not specify domain, it will be assumed `localhost`.
3. When prompted `Username:`, enter the desired username.

### Server
1. Run `npx bridge-server` to start the server.
    - If you want to change the default port (3636), use `npx bridge-server -p <port>`.
2. You will see the log of connections on your terminal.

### Commands
Everything starting with a forward slash (`/`) is assumed as a command.

- `/me <message>` is used to send emotes. If sent without a message, acts as a indicator.
- `/w <to> <message>` is used to whisper to a specific user. `<to>` has to be an online user in the server.
- `/username <username>` is used to change the username.
- `/room <room>` is used to change the room. If the room name is empty, user will be assigned back to the `#default` room.
- `/clear` is used to clear the chat for the user.
- `/users` is used to list all online users with their room names and IDs.
- `/id` is used to print user's ID.
- `/server` is used to print server's address.
- `/status` is used to print the connection status.
- `/exit` is used to exit the program.

## Dependencies
- [socket.io](https://www.npmjs.com/package/socket.io)
- [socket.io-client](https://www.npmjs.com/package/socket.io-client)
- [ansi-color](https://www.npmjs.com/package/ansi-color)

## Author
- **Boran Seckin**

## License
This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
