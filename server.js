import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import WebSocket, { WebSocketServer } from 'ws';
import fetch from "node-fetch";




// Serve static files from "public" folder
const publicFolder = path.join(process.cwd(), 'public');


const server = http.createServer((req, res) => {
    let filePath = path.join(publicFolder, req.url === '/' ? 'index.html' : req.url);


    const ext = path.extname(filePath);
    const contentType = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
    }[ext] || 'text/plain';


    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});


// Create WebSocket server
const wss = new WebSocketServer({ server });


// Store active lobbies and games
const lobbies = new Map();
const games = new Map();


// Enhanced caching system
const artistCache = new Map();
const trackCache = new Map();
const albumCache = new Map();
const tokenCache = { token: null, expiry: 0 };
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const TOKEN_BUFFER = 5 * 60 * 1000; // Refresh 5 minutes before expiry


const playlistId = "0JiVp7Z0pYKI8diUV6HJyQ";
const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;


// Debug logging utility
function debugLog(context, message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[DEBUG ${timestamp}] ${context}: ${message}`, data ? JSON.stringify(data, null, 2) : '');
}


async function getSpotifyToken() {
    debugLog('TOKEN', 'Checking token cache');
   
    // Return cached token if still valid
    if (tokenCache.token && Date.now() < tokenCache.expiry - TOKEN_BUFFER) {
        debugLog('TOKEN', 'Using cached token');
        return tokenCache.token;
    }


    debugLog('TOKEN', 'Fetching new token from Spotify');
    const authString = `${clientId}:${clientSecret}`;
    const authBase64 = Buffer.from(authString).toString("base64");


    const startTime = Date.now();
    const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            "Authorization": `Basic ${authBase64}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ grant_type: "client_credentials" })
    });


    const fetchTime = Date.now() - startTime;
    debugLog('TOKEN', `Token request completed in ${fetchTime}ms`);


    if (!res.ok) {
        debugLog('TOKEN', `Failed to get token: ${res.status} ${res.statusText}`);
        throw new Error(`Failed to get token: ${res.status} ${res.statusText}`);
    }


    const data = await res.json();
   
    // Cache token with expiry
    tokenCache.token = data.access_token;
    tokenCache.expiry = Date.now() + (data.expires_in * 1000);
   
    debugLog('TOKEN', `New token cached, expires in ${data.expires_in} seconds`);
    return data.access_token;
}


// Enhanced concurrent API fetching with retries
async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const startTime = Date.now();
            const response = await fetch(url, options);
            const fetchTime = Date.now() - startTime;
           
            if (response.ok) {
                debugLog('API', `Request successful in ${fetchTime}ms (attempt ${attempt})`);
                return response;
            }
           
            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('retry-after')) || 1;
                debugLog('API', `Rate limited, waiting ${retryAfter} seconds before retry ${attempt}`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                continue;
            }
           
            debugLog('API', `Request failed with status ${response.status} (attempt ${attempt})`);
            if (attempt === maxRetries) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            debugLog('API', `Request error on attempt ${attempt}: ${error.message}`);
            if (attempt === maxRetries) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}


// Batch API requests for better performance
async function batchFetchArtistData(artistIds) {
    debugLog('BATCH', `Fetching data for ${artistIds.length} artists`);
    const token = await getSpotifyToken();
    const headers = { Authorization: `Bearer ${token}` };
   
    // Split into chunks of 50 (Spotify API limit)
    const chunks = [];
    for (let i = 0; i < artistIds.length; i += 50) {
        chunks.push(artistIds.slice(i, i + 50));
    }
   
    const allArtistsData = [];
   
    for (const chunk of chunks) {
        const url = `https://api.spotify.com/v1/artists?ids=${chunk.join(',')}`;
        const response = await fetchWithRetry(url, { headers });
        const data = await response.json();
        allArtistsData.push(...data.artists);
    }
   
    debugLog('BATCH', `Fetched ${allArtistsData.length} artists in batch`);
    return allArtistsData;
}


async function getEnhancedArtistData(artistId) {
    const cacheKey = `artist_${artistId}`;
    const cached = artistCache.get(cacheKey);


    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        debugLog('CACHE', `Using cached data for artist ${artistId}`);
        return cached.data;
    }


    debugLog('ARTIST', `Fetching enhanced data for artist ${artistId}`);
    const startTime = Date.now();
   
    const token = await getSpotifyToken();
    const headers = { Authorization: `Bearer ${token}` };


    try {
        // Parallel API calls for better performance
        const [artistRes, topTracksRes, albumsRes] = await Promise.all([
            fetchWithRetry(`https://api.spotify.com/v1/artists/${artistId}`, { headers }),
            fetchWithRetry(`https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=US`, { headers }),
            fetchWithRetry(`https://api.spotify.com/v1/artists/${artistId}/albums?limit=50&include_groups=album,single`, { headers })
        ]);


        const [artistInfo, topTracksData, albumsData] = await Promise.all([
            artistRes.json(),
            topTracksRes.json(),
            albumsRes.json()
        ]);


        debugLog('ARTIST', `Basic data fetched for ${artistInfo.name} in ${Date.now() - startTime}ms`);


        // Process top tracks with featured artists
        const enhancedTopTracks = topTracksData.tracks.slice(0, 5).map(track => ({
            id: track.id,
            name: track.name,
            preview_url: track.preview_url,
            popularity: track.popularity,
            artists: track.artists.map(artist => ({
                id: artist.id,
                name: artist.name,
                clickable: true
            })),
            mainArtist: track.artists[0],
            featuredArtists: track.artists.slice(1)
        }));


        // Get unique albums (remove duplicates by name)
        const uniqueAlbumsMap = new Map();
        albumsData.items.forEach(album => {
            if (!uniqueAlbumsMap.has(album.name)) {
                uniqueAlbumsMap.set(album.name, album);
            }
        });
        const uniqueAlbums = Array.from(uniqueAlbumsMap.values()).slice(0, 10); // Limit to 10 albums


        // Fetch album tracks in parallel with rate limiting
        const albumTrackPromises = uniqueAlbums.map(async (album) => {
            const albumCacheKey = `album_${album.id}`;
            const cachedAlbum = albumCache.get(albumCacheKey);
           
            if (cachedAlbum && Date.now() - cachedAlbum.timestamp < CACHE_DURATION) {
                debugLog('CACHE', `Using cached album data for ${album.name}`);
                return { album, tracks: cachedAlbum.tracks };
            }


            try {
                const tracksRes = await fetchWithRetry(`https://api.spotify.com/v1/albums/${album.id}/tracks?limit=50`, { headers });
                const tracksData = await tracksRes.json();
               
                const enhancedTracks = tracksData.items.map(track => ({
                    id: track.id,
                    name: track.name,
                    track_number: track.track_number,
                    preview_url: track.preview_url,
                    artists: track.artists.map(artist => ({
                        id: artist.id,
                        name: artist.name,
                        clickable: true
                    })),
                    mainArtist: track.artists[0],
                    featuredArtists: track.artists.slice(1)
                }));


                // Cache album tracks
                albumCache.set(albumCacheKey, {
                    tracks: enhancedTracks,
                    timestamp: Date.now()
                });


                debugLog('ALBUM', `Fetched ${enhancedTracks.length} tracks for album: ${album.name}`);
                return { album, tracks: enhancedTracks };
            } catch (error) {
                debugLog('ERROR', `Failed to fetch tracks for album ${album.name}: ${error.message}`);
                return { album, tracks: [] };
            }
        });


        // Execute album fetches with controlled concurrency
        const albumsWithTracks = await Promise.all(albumTrackPromises);


        // Structure the enhanced data
        const enhancedData = {
            id: artistInfo.id,
            name: artistInfo.name,
            genres: artistInfo.genres,
            popularity: artistInfo.popularity,
            followers: artistInfo.followers.total,
            images: artistInfo.images,
            topTracks: enhancedTopTracks,
            albums: albumsWithTracks.map(({ album, tracks }) => ({
                id: album.id,
                name: album.name,
                release_date: album.release_date,
                total_tracks: album.total_tracks,
                album_type: album.album_type,
                images: album.images,
                tracks: tracks,
                expandable: true
            }))
        };


        const totalTime = Date.now() - startTime;
        debugLog('ARTIST', `Enhanced data complete for ${artistInfo.name} in ${totalTime}ms`);


        // Cache the enhanced data
        artistCache.set(cacheKey, {
            data: enhancedData,
            timestamp: Date.now()
        });


        return enhancedData;


    } catch (error) {
        debugLog('ERROR', `Failed to fetch enhanced data for artist ${artistId}: ${error.message}`);
        throw error;
    }
}


// Generate unique lobby codes
function generateLobbyCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    debugLog('LOBBY', `Generated lobby code: ${code}`);
    return code;
}


// Generate unique player IDs
function generatePlayerId() {
    const id = 'player_' + Math.random().toString(36).substr(2, 9);
    debugLog('PLAYER', `Generated player ID: ${id}`);
    return id;
}


// WebSocket connection handling
wss.on('connection', (ws, req) => {
    debugLog('CONNECTION', 'New WebSocket connection established');


    let playerId = null;
    let lobbyCode = null;


    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            debugLog('MESSAGE', `Received: ${data.type}`, data);


            switch (data.type) {
                case 'create_lobby':
                    handleCreateLobby(ws, data);
                    break;
                case 'join_lobby':
                    handleJoinLobby(ws, data);
                    break;
                case 'leave_lobby':
                    handleLeaveLobby(ws, data);
                    break;
                case 'start_game':
                    handleStartGame(ws, data);
                    break;
                case 'player_move':
                    handlePlayerMove(ws, data);
                    break;
                case 'player_ready':
                    handlePlayerReady(ws, data);
                    break;
                case 'update_settings':
                    handleUpdateSettings(ws, data);
                    break;
                case 'get_artist_data':
                    handleGetArtistData(ws, data);
                    break;
                default:
                    debugLog('SERVER ERROR', `Unknown message type: ${data.type}`);
                    ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
            }
        } catch (error) {
            debugLog('ERROR', `Error parsing message: ${error.message}`);
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
    });


    ws.on('close', () => {
        debugLog('CONNECTION', `WebSocket connection closed for player ${playerId}`);
        if (playerId && lobbyCode) {
            handlePlayerDisconnect(playerId, lobbyCode);
        }
    });


    function handleCreateLobby(ws, data) {
        const { playerName } = data;


        if (!playerName) {
            debugLog('ERROR', 'Create lobby failed: Player name required');
            ws.send(JSON.stringify({ type: 'error', message: 'Player name required' }));
            return;
        }


        const code = generateLobbyCode();
        const hostId = generatePlayerId();


        const lobby = {
            code,
            hostId,
            players: [{
                id: hostId,
                name: playerName,
                isHost: true,
                isReady: true,
                ws: ws
            }],
            settings: {
                difficulty: 'medium',
                timeLimit: '10'
            },
            gameStarted: false
        };


        lobbies.set(code, lobby);
        playerId = hostId;
        lobbyCode = code;


        ws.send(JSON.stringify({
            type: 'lobby_created',
            lobbyCode: code,
            playerId: hostId,
            isHost: true
        }));


        debugLog('LOBBY', `Lobby ${code} created by ${playerName} (${hostId})`);
    }


    function handleJoinLobby(ws, data) {
        const { playerName, lobbyCode: code } = data;


        if (!playerName || !code) {
            debugLog('ERROR', 'Join lobby failed: Player name and lobby code required');
            ws.send(JSON.stringify({ type: 'error', message: 'Player name and lobby code required' }));
            return;
        }


        const lobby = lobbies.get(code);
        if (!lobby) {
            debugLog('ERROR', `Join lobby failed: Lobby ${code} not found`);
            ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found' }));
            return;
        }


        if (lobby.players.length >= 8) {
            debugLog('ERROR', `Join lobby failed: Lobby ${code} is full`);
            ws.send(JSON.stringify({ type: 'error', message: 'Lobby is full' }));
            return;
        }


        const newPlayerId = generatePlayerId();
        const newPlayer = {
            id: newPlayerId,
            name: playerName,
            isHost: false,
            isReady: false,
            ws: ws
        };


        lobby.players.push(newPlayer);
        playerId = newPlayerId;
        lobbyCode = code;


        // Notify all players
        broadcastToLobby(code, {
            type: 'player_joined',
            player: {
                id: newPlayer.id,
                name: newPlayer.name,
                isHost: newPlayer.isHost,
                isReady: newPlayer.isReady
            }
        });


        // Send state to new player
        ws.send(JSON.stringify({
            type: 'lobby_joined',
            lobbyCode: code,
            playerId: newPlayerId,
            isHost: false,
            players: lobby.players.map(p => ({
                id: p.id,
                name: p.name,
                isHost: p.isHost,
                isReady: p.isReady
            })),
            settings: lobby.settings
        }));


        debugLog('LOBBY', `${playerName} (${newPlayerId}) joined lobby ${code}`);
    }


    async function handleStartGame(ws, data) {
        if (!lobbyCode) {
            debugLog('ERROR', 'Start game failed: No lobby code');
            return;
        }


        const lobby = lobbies.get(lobbyCode);
        if (!lobby || !lobby.players.find(p => p.id === playerId && p.isHost)) {
            debugLog('ERROR', 'Start game failed: Only host can start the game');
            ws.send(JSON.stringify({ type: 'error', message: 'Only host can start the game' }));
            return;
        }


        debugLog('GAME', `Starting game in lobby ${lobbyCode}`);


        try {
            // Get artist IDs from playlist
            const startTime = Date.now();
            const artistIds = await getUniqueArtistIds(playlistId);
            const playlistTime = Date.now() - startTime;
           
            debugLog('GAME', `Found ${artistIds.length} unique artists in ${playlistTime}ms`);


            if (artistIds.length < 2) {
                debugLog('ERROR', 'Start game failed: Not enough artists');
                ws.send(JSON.stringify({ type: 'error', message: 'Not enough artists to start' }));
                return;
            }


            // Select random start and target artists
            const shuffled = artistIds.sort(() => 0.5 - Math.random());
            const currentArtistId = shuffled[0];
            const targetArtistId = shuffled[1];


            debugLog('GAME', `Selected artists - Current: ${currentArtistId}, Target: ${targetArtistId}`);


            // Fetch enhanced data for both artists in parallel
            const dataStartTime = Date.now();
            const [currentArtistData, targetArtistData] = await Promise.all([
                getEnhancedArtistData(currentArtistId),
                getEnhancedArtistData(targetArtistId)
            ]);
            const dataTime = Date.now() - dataStartTime;


            debugLog('GAME', `Fetched artist data in ${dataTime}ms`);


            const game = {
                lobbyCode,
                currentArtistId,
                targetArtistId,
                availableArtists: {
                    [currentArtistId]: currentArtistData,
                    [targetArtistId]: targetArtistData
                },
                playerPaths: {},
                gameStarted: true,
                startTime: Date.now()
            };


            // Initialize player paths
            lobby.players.forEach(player => {
                game.playerPaths[player.id] = [currentArtistId];
            });


            games.set(lobbyCode, game);
            lobby.gameStarted = true;


            console.log(currentArtistData);
            console.log(targetArtistData);
            // Send enhanced game data to all clients
            broadcastToLobby(lobbyCode, {
                type: 'game_started',
                currentArtist: currentArtistData,
                targetArtist: targetArtistData,
                allArtistIds: artistIds,
                gameSettings: lobby.settings
            });


            const totalTime = Date.now() - startTime;
            debugLog('GAME', `Game started successfully in lobby ${lobbyCode} (total time: ${totalTime}ms)`);


        } catch (error) {
            debugLog('ERROR', `Failed to start game in lobby ${lobbyCode}: ${error.message}`);
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to start game' }));
        }
    }


    async function handlePlayerMove(ws, data) {
        if (!lobbyCode) {
            debugLog('ERROR', 'Player move failed: No lobby code');
            return;
        }


        const game = games.get(lobbyCode);
        if (!game || !game.gameStarted) {
            debugLog('ERROR', 'Player move failed: Game not started');
            return;
        }


        const { artistId } = data;
        debugLog('GAME', `Player ${playerId} attempting move to artist ${artistId}`);


        try {
            // Get or fetch artist data
            let artistData = game.availableArtists[artistId];
            if (!artistData) {
                debugLog('GAME', `Fetching new artist data for ${artistId}`);
                artistData = await getEnhancedArtistData(artistId);
                game.availableArtists[artistId] = artistData;
            }


            // Update player path
            const currentPath = game.playerPaths[playerId] || [game.currentArtistId];
            if (currentPath[currentPath.length - 1] !== artistId) {
                currentPath.push(artistId);
                debugLog('GAME', `Player ${playerId} path updated: ${currentPath.join(' -> ')}`);
            }


            const hasWon = artistId === game.targetArtistId;


            // Broadcast move to all players
            broadcastToLobby(lobbyCode, {
                type: 'player_moved',
                playerId,
                artistId,
                artistData: artistData,
                path: currentPath,
                steps: currentPath.length - 1,
                hasWon
            });


            if (hasWon) {
                debugLog('GAME', `Player ${playerId} won in ${currentPath.length - 1} steps!`);
                broadcastToLobby(lobbyCode, {
                    type: 'player_won',
                    playerId,
                    steps: currentPath.length - 1,
                    path: currentPath
                });
            }


        } catch (error) {
            debugLog('ERROR', `Player move failed: ${error.message}`);
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to process move' }));
        }
    }


    async function handleGetArtistData(ws, data) {
        const { artistId } = data;
        console.log('Artist ID:', artistId);
       
        if (!artistId) {
            debugLog('ERROR', 'Get artist data failed: Artist ID required');
            ws.send(JSON.stringify({ type: 'error', message: 'Artist ID required' }));
            return;
        }


        debugLog('API', `Client requested artist data for ${artistId}`);


        try {
            const artistData = await getEnhancedArtistData(artistId);
           
            ws.send(JSON.stringify({
                type: 'artist_data',
                artistId,
                data: artistData
            }));


            debugLog('API', `Sent artist data for ${artistData.name} to client`);


        } catch (error) {
            debugLog('ERROR', `Failed to get artist data for ${artistId}: ${error.message}`);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to fetch artist data',
                artistId
            }));
        }
    }


    function handlePlayerReady(ws, data) {
        const lobby = lobbies.get(lobbyCode);
        if (!lobby) return;


        const player = lobby.players.find(p => p.id === playerId);
        if (!player) return;


        player.isReady = data.ready;


        debugLog('LOBBY', `Player ${playerId} ready status: ${data.ready}`);


        broadcastToLobby(lobbyCode, {
            type: 'player_ready_changed',
            playerId,
            isReady: data.ready
        });
    }


    function handleUpdateSettings(ws, data) {
        const lobby = lobbies.get(lobbyCode);
        if (!lobby || !lobby.players.find(p => p.id === playerId && p.isHost)) {
            debugLog('ERROR', 'Update settings failed: Only host can update settings');
            ws.send(JSON.stringify({ type: 'error', message: 'Only host can update settings' }));
            return;
        }


        lobby.settings = { ...lobby.settings, ...data.settings };


        debugLog('LOBBY', `Settings updated in lobby ${lobbyCode}`, lobby.settings);


        broadcastToLobby(lobbyCode, {
            type: 'settings_updated',
            settings: lobby.settings
        });
    }


    function removePlayerFromLobby(playerId, lobbyCode) {
        const lobby = lobbies.get(lobbyCode);
        if (!lobby) return;


        const index = lobby.players.findIndex(p => p.id === playerId);
        if (index === -1) return;


        const [player] = lobby.players.splice(index, 1);
        debugLog('LOBBY', `Player ${playerId} (${player.name}) removed from lobby ${lobbyCode}`);


        if (lobby.players.length === 0) {
            debugLog('LOBBY', `Lobby ${lobbyCode} deleted - no players remaining`);
            lobbies.delete(lobbyCode);
            games.delete(lobbyCode);
        } else if (player.isHost) {
            // Transfer host to first remaining player
            lobby.players[0].isHost = true;
            lobby.hostId = lobby.players[0].id;


            debugLog('LOBBY', `Host transferred to ${lobby.players[0].id} in lobby ${lobbyCode}`);


            if (lobby.players[0].ws?.readyState === WebSocket.OPEN) {
                lobby.players[0].ws.send(JSON.stringify({
                    type: 'host_transferred',
                    isHost: true
                }));
            }
        }


        broadcastToLobby(lobbyCode, {
            type: 'player_left',
            playerId
        });
    }


    function handleLeaveLobby(ws, data) {
        if (!lobbyCode || !playerId) return;
        debugLog('LOBBY', `Player ${playerId} leaving lobby ${lobbyCode}`);
        removePlayerFromLobby(playerId, lobbyCode);
    }


    function handlePlayerDisconnect(playerId, lobbyCode) {
        if (!lobbyCode || !playerId) return;
        debugLog('CONNECTION', `Player ${playerId} disconnected from lobby ${lobbyCode}`);
        removePlayerFromLobby(playerId, lobbyCode);
    }


    function broadcastToLobby(lobbyCode, message) {
        const lobby = lobbies.get(lobbyCode);
        if (!lobby) return;


        const activeConnections = lobby.players.filter(player =>
            player.ws?.readyState === WebSocket.OPEN
        );


        debugLog('BROADCAST', `Sending ${message.type} to ${activeConnections.length} players in lobby ${lobbyCode}`);


        lobby.players.forEach(player => {
            if (player.ws?.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify(message));
            }
        });
    }


    async function getUniqueArtistIds(playlistId) {
        debugLog('PLAYLIST', `Fetching artists from playlist ${playlistId}`);
       
        let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
        const uniqueArtists = new Set();
        const token = await getSpotifyToken();
        let requestCount = 0;


        const startTime = Date.now();


        while (url) {
            requestCount++;
            debugLog('PLAYLIST', `Making request ${requestCount} to fetch playlist tracks`);
           
            const res = await fetchWithRetry(url, {
                headers: { Authorization: `Bearer ${token}` }
            });


            const data = await res.json();


            for (const item of data.items) {
                if (item.track && item.track.artists) {
                    item.track.artists.forEach(artist => uniqueArtists.add(artist.id));
                }
            }


            url = data.next; // paginate if more tracks
            debugLog('PLAYLIST', `Processed batch, found ${uniqueArtists.size} unique artists so far`);
        }


        const totalTime = Date.now() - startTime;
        debugLog('PLAYLIST', `Completed playlist fetch in ${totalTime}ms with ${requestCount} requests. Found ${uniqueArtists.size} unique artists`);


        return Array.from(uniqueArtists);
    }
});


// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    debugLog('SERVER', `WebSocket server running on port ${PORT}`);
    console.log(`🚀 Spotify Artist Game Server started on port ${PORT}`);
});

