# Spotify Wiki Game - Multiplayer Edition

A real-time multiplayer web game where players navigate from artist to artist through their song collaborations, similar to Wikipedia racing but for music lovers!

## Features

- **Real-time Multiplayer**: Up to 8 players can join a lobby and play together
- **WebSocket Communication**: Instant synchronization of game state across all players
- **Lobby System**: Create or join games with 6-character codes
- **Ready System**: Players must mark themselves ready before the game can start
- **Live Updates**: See other players join/leave in real-time
- **Host Controls**: Game settings and start controls for lobby hosts
- **Connection Status**: Visual indicator showing server connection status

## Setup Instructions

### Prerequisites

- Node.js (version 14 or higher)
- A modern web browser with WebSocket support

### Installation

1. **Install server dependencies:**
   ```bash
   npm install
   ```

2. **Start the WebSocket server:**
   ```bash
   npm start
   ```
   The server will run on port 3000 by default.

3. **Open the game:**
   - Open `index.html` in your web browser
   - Or serve it through a local web server (recommended)

### Running with a Local Web Server (Recommended)

For the best experience, serve the HTML file through a local web server:

```bash
# Using Python 3
python -m http.server 8000

# Using Node.js http-server (install with: npm install -g http-server)
http-server -p 8000

# Using PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

## How to Play

### Creating a Game

1. Enter your name in the "Create Game" section
2. Click "Create Lobby" to generate a 6-character lobby code
3. Share the lobby code with your friends
4. Wait for players to join and mark themselves ready
5. Adjust game settings (difficulty, time limit) if desired
6. Click "Start Game" when all players are ready

### Joining a Game

1. Enter your name and the 6-character lobby code
2. Click "Join Lobby"
3. Mark yourself as ready when you're prepared to play
4. Wait for the host to start the game

### Playing the Game

1. You'll start at a random artist and need to reach a target artist
2. Click on collaborating artists in songs to navigate
3. Find the shortest path from start to target artist
4. The first player to reach the target artist wins!

## Technical Details

### Architecture

- **Frontend**: Pure HTML/CSS/JavaScript with WebSocket client
- **Backend**: Node.js WebSocket server
- **Communication**: Real-time bidirectional communication via WebSockets

### WebSocket Events

**Client to Server:**
- `create_lobby`: Create a new game lobby
- `join_lobby`: Join an existing lobby
- `leave_lobby`: Leave the current lobby
- `player_ready`: Toggle ready status
- `update_settings`: Update game settings (host only)
- `start_game`: Start the game (host only)
- `player_move`: Navigate to a new artist

**Server to Client:**
- `lobby_created`: Confirmation of lobby creation
- `lobby_joined`: Confirmation of joining lobby
- `player_joined`: Another player joined the lobby
- `player_left`: A player left the lobby
- `player_ready_changed`: A player's ready status changed
- `settings_updated`: Game settings were updated
- `host_transferred`: Host privileges transferred
- `game_started`: Game has started
- `player_moved`: A player made a move
- `player_won`: A player reached the target artist

### File Structure

```
├── index.html          # Main game client
├── server.js           # WebSocket server
├── package.json        # Server dependencies
└── README.md          # This file
```

## Development

### Running in Development Mode

```bash
# Install nodemon for auto-restart
npm install -g nodemon

# Run server with auto-restart
npm run dev
```

### Customization

- **Port**: Change the port in `server.js` (line 2)
- **Max Players**: Modify the player limit in `server.js`
- **Game Settings**: Add new settings in both client and server code
- **Artists**: Extend the `mockArtists` object with more artist data

## Troubleshooting

### Connection Issues

- Ensure the WebSocket server is running on port 3000
- Check that your firewall allows connections to port 3000
- Verify the server URL in the client code matches your setup

### Browser Compatibility

- Requires modern browsers with WebSocket support
- Tested on Chrome, Firefox, Safari, and Edge

### Common Issues

1. **"Not connected to server"**: Start the WebSocket server first
2. **"Lobby not found"**: Check the lobby code is correct and lobby exists
3. **"Lobby is full"**: Maximum 8 players per lobby
4. **Connection drops**: The client will attempt to reconnect automatically

## License

MIT License - feel free to modify and distribute!
