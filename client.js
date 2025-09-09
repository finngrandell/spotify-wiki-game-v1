// WebSocket connection
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;


// Game state management
let currentScreen = 'landing';
let gameState = {
    lobbyCode: null,
    isHost: false,
    playerName: '',
    playerId: null,
    players: [],
    gameStarted: false,
    currentArtistId: null,
    targetArtistId: null,
    playerPath: [],
    connected: false,
    artistData: {}, // Store fetched artist data
    allArtistIds: [] // All available artist IDs from playlist
};


// WebSocket connection management
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // const wsUrl = `${protocol}//${window.location.hostname}:3000`;
    const wsUrl = 'wss://b74fc0bcb064.ngrok-free.app';
   
    try {
        ws = new WebSocket(wsUrl);
       
        ws.onopen = () => {
            console.log('WebSocket connected');
            gameState.connected = true;
            reconnectAttempts = 0;
            updateConnectionStatus();
        };
       
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        };
       
        ws.onclose = () => {
            console.log('WebSocket disconnected');
            gameState.connected = false;
            updateConnectionStatus();
           
            if (reconnectAttempts < maxReconnectAttempts) {
                setTimeout(() => {
                    reconnectAttempts++;
                    console.log(`Attempting to reconnect... (${reconnectAttempts}/${maxReconnectAttempts})`);
                    connectWebSocket();
                }, 2000 * reconnectAttempts);
            }
        };
       
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    } catch (error) {
        console.error('Failed to connect to WebSocket:', error);
        gameState.connected = false;
        updateConnectionStatus();
    }
}


function handleWebSocketMessage(data) {
    console.log('Received message:', data.type, data);
   
    switch (data.type) {
        case 'lobby_created':
            handleLobbyCreated(data);
            break;
        case 'lobby_joined':
            handleLobbyJoined(data);
            break;
        case 'player_joined':
            handlePlayerJoined(data);
            break;
        case 'player_left':
            handlePlayerLeft(data);
            break;
        case 'player_ready_changed':
            handlePlayerReadyChanged(data);
            break;
        case 'settings_updated':
            handleSettingsUpdated(data);
            break;
        case 'host_transferred':
            handleHostTransferred(data);
            break;
        case 'game_started':
            handleGameStarted(data);
            break;
        case 'player_moved':
            handlePlayerMoved(data);
            break;
        case 'player_won':
            handlePlayerWon(data);
            break;
        case 'artist_data':
            handleArtistData(data);
            break;
        case 'error':
            showError(currentScreen + 'Screen', data.message);
            break;
    }
}


function sendWebSocketMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        console.log('Sent message:', message.type, message);
    } else {
        showError(currentScreen + 'Screen', 'Not connected to server');
        console.error('WebSocket not connected, cannot send:', message);
    }
}


function updateConnectionStatus() {
    const statusElements = document.querySelectorAll('#connectionStatus');
    statusElements.forEach(element => {
        element.textContent = gameState.connected ? '🟢 Connected' : '🔴 Disconnected';
        element.className = 'connection-status ' + (gameState.connected ? 'connected' : 'disconnected');
    });
}


// Screen management
function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenName + 'Screen').classList.add('active');
    currentScreen = screenName;
}


// WebSocket message handlers
function handleLobbyCreated(data) {
    gameState.lobbyCode = data.lobbyCode;
    gameState.playerId = data.playerId;
    gameState.isHost = data.isHost;
   
    gameState.players = [{
        id: data.playerId,
        name: gameState.playerName,
        isHost: true,
        isReady: true
    }];
   
    document.getElementById('displayLobbyCode').textContent = gameState.lobbyCode;
    updatePlayersDisplay();
    updateStartButton();
    showScreen('lobby');
    showSuccess('lobbyScreen', `Lobby ${gameState.lobbyCode} created successfully!`);
}


function handleLobbyJoined(data) {
    gameState.lobbyCode = data.lobbyCode;
    gameState.playerId = data.playerId;
    gameState.isHost = data.isHost;
    gameState.players = data.players;
    gameState.settings = data.settings;
   
    document.getElementById('displayLobbyCode').textContent = gameState.lobbyCode;
    updatePlayersDisplay();
    updateStartButton();
    updateSettingsDisplay();
   
    if (!gameState.isHost) {
        document.getElementById('gameSettings').style.display = 'none';
    }
   
    showScreen('lobby');
    showSuccess('lobbyScreen', `Successfully joined lobby ${gameState.lobbyCode}!`);
}


function handlePlayerJoined(data) {
    gameState.players.push(data.player);
    updatePlayersDisplay();
    updateStartButton();
    showSuccess('lobbyScreen', `${data.player.name} joined the lobby!`);
}


function handlePlayerLeft(data) {
    gameState.players = gameState.players.filter(p => p.id !== data.playerId);
    updatePlayersDisplay();
    updateStartButton();
}


function handlePlayerReadyChanged(data) {
    const player = gameState.players.find(p => p.id === data.playerId);
    if (player) {
        player.isReady = data.isReady;
        updatePlayersDisplay();
        updateStartButton();
    }
}


function handleSettingsUpdated(data) {
    gameState.settings = data.settings;
    updateSettingsDisplay();
}


function handleHostTransferred(data) {
    gameState.isHost = data.isHost;
    if (data.isHost) {
        document.getElementById('gameSettings').style.display = 'block';
        showSuccess('lobbyScreen', 'You are now the host!');
    }
}


function handleGameStarted(data) {
    console.log('Game started with data:', data);
   
    gameState.gameStarted = true;
    gameState.currentArtistId = data.currentArtist.id;
    gameState.targetArtistId = data.targetArtist.id;
    gameState.playerPath = [data.currentArtist.id];
    gameState.allArtistIds = data.allArtistIds || [];
   
    // Store artist data
    gameState.artistData[data.currentArtist.id] = data.currentArtist;
    gameState.artistData[data.targetArtist.id] = data.targetArtist;
   
    updateGameStatus();
    displayArtistPage(data.currentArtist);
    showScreen('game');
    showSuccess('gameScreen', 'Game started! Find your way to the target artist.');
}


function handlePlayerMoved(data) {
    console.log('Player moved:', data);
   
    // If this is our move, update our state
    if (data.playerId === gameState.playerId) {
        gameState.currentArtistId = data.artistId;
        gameState.playerPath = data.path;
       
        // Store the artist data if provided
        if (data.artistData) {
            gameState.artistData[data.artistId] = data.artistData;
            displayArtistPage(data.artistData);
        }
       
        updateGameStatus();
       
        // Check if we won
        if (data.hasWon) {
            showWinMessage();
        }
    }
   
    // Update other players' progress (could show in UI later)
    console.log(`Player ${data.playerId} moved to ${data.artistId}, steps: ${data.steps}`);
}


function handlePlayerWon(data) {
    const winnerName = gameState.players.find(p => p.id === data.playerId)?.name || 'Someone';
    showSuccess('gameScreen', `🎉 ${winnerName} won in ${data.steps} steps!`);
}


function handleArtistData(data) {
    console.log('Received artist data:', data);
   
    if (data.data) {
        gameState.artistData[data.artistId] = data.data;
       
        // If this is the current artist, display it
        if (data.artistId === gameState.currentArtistId) {
            displayArtistPage(data.data);
        }
    }
}


// Enhanced artist page display
function displayArtistPage(artistData) {
    console.log('Displaying artist page for:', artistData);
   
    const artistPage = document.getElementById('artistPage');
   
    if (!artistData) {
        artistPage.innerHTML = `
            <div class="error-container">
                <div class="error-message">Failed to load artist data</div>
            </div>
        `;
        return;
    }


    // Helper function to format numbers
    const formatNumber = (num) => {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num?.toLocaleString() || '0';
    };


    // Get the best quality image
    const getArtistImage = (images) => {
        if (!images || images.length === 0) {
            return 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop&crop=face';
        }
        // Return the first image (usually highest quality)
        return images[0].url;
    };


    artistPage.innerHTML = `
        <div class="artist-container">
            <!-- Artist Header -->
            <div class="artist-header">
                <div class="artist-image-container">
                    <img src="${getArtistImage(artistData.images)}" alt="${artistData.name}" class="artist-image" />
                </div>
                <div class="artist-info">
                    <h1 class="artist-name">${artistData.name}</h1>
                    ${artistData.followers ? `<div class="artist-stats">
                        <div class="stat-item">
                            <span class="stat-value">${formatNumber(artistData.followers)}</span>
                            <span class="stat-label">Followers</span>
                        </div>
                        ${artistData.popularity ? `<div class="stat-item">
                            <span class="stat-value">${artistData.popularity}</span>
                            <span class="stat-label">Popularity</span>
                        </div>` : ''}
                    </div>` : ''}
                    ${artistData.genres && artistData.genres.length > 0 ? `
                        <div class="artist-genres">
                            ${artistData.genres.slice(0, 3).map(genre =>
                                `<span class="genre-tag">${genre}</span>`
                            ).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>


            <!-- Top Tracks Section -->
            <div class="section">
                <h2 class="section-title">Popular Tracks</h2>
                <div class="tracks-list">
                    ${artistData.topTracks.map((track, index) => `
                        <div class="track-item">
                            <div class="track-number">${index + 1}</div>
                            <div class="track-content">
                                <div class="track-name">${track.name}</div>
                                <div class="track-artists">
                                    ${track.artists.map((artist, artistIndex) => {
                                        const isCurrentArtist = artist.id === gameState.currentArtistId;
                                        const isClickable = artist.clickable && !isCurrentArtist;
                                        return `
                                            ${artistIndex > 0 ? ', ' : ''}
                                            ${isClickable ?
                                                `<span class="artist-link" onclick="navigateToArtist('${artist.id}')" title="Navigate to ${artist.name}">${artist.name}</span>` :
                                                `<span class="${isCurrentArtist ? 'current-artist' : ''}">${artist.name}</span>`
                                            }
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                            ${track.popularity ? `<div class="track-popularity">${track.popularity}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>


            <!-- Albums Section -->
            <div class="section">
                <h2 class="section-title">Albums</h2>
                <div class="albums-list">
                    ${artistData.albums.map(album => `
                        <div class="album-item">
                            <div class="album-header" onclick="toggleAlbum('${album.id}')">
                                <div class="album-image-container">
                                    ${album.images && album.images.length > 0 ?
                                        `<img src="${album.images[0].url}" alt="${album.name}" class="album-image" />` :
                                        `<div class="album-placeholder">🎵</div>`
                                    }
                                </div>
                                <div class="album-info">
                                    <div class="album-name">${album.name}</div>
                                    <div class="album-meta">
                                        ${album.release_date ? new Date(album.release_date).getFullYear() : ''} •
                                        ${album.total_tracks} tracks •
                                        ${album.album_type || 'Album'}
                                    </div>
                                </div>
                                <div class="album-toggle">
                                    <span class="toggle-icon">▼</span>
                                </div>
                            </div>
                            <div class="album-tracks" id="album-${album.id}" style="display: none;">
                                ${album.tracks.map((track, index) => `
                                    <div class="album-track-item">
                                        <div class="track-number">${track.track_number || index + 1}</div>
                                        <div class="track-content">
                                            <div class="track-name">${track.name}</div>
                                            <div class="track-artists">
                                                ${track.artists.map((artist, artistIndex) => {
                                                    const isCurrentArtist = artist.id === gameState.currentArtistId;
                                                    const isClickable = artist.clickable && !isCurrentArtist;
                                                    return `
                                                        ${artistIndex > 0 ? ', ' : ''}
                                                        ${isClickable ?
                                                            `<span class="artist-link" onclick="navigateToArtist('${artist.id}')" title="Navigate to ${artist.name}">${artist.name}</span>` :
                                                            `<span class="${isCurrentArtist ? 'current-artist' : ''}">${artist.name}</span>`
                                                        }
                                                    `;
                                                }).join('')}
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}


// Game navigation functions
function navigateToArtist(artistId) {
    console.log('Navigating to artist:', artistId);
   
    if (!gameState.gameStarted) {
        showError('gameScreen', 'Game not started yet!');
        return;
    }
   
    if (artistId === gameState.currentArtistId) {
        showError('gameScreen', 'You are already viewing this artist!');
        return;
    }
   
    // Show loading state
    const artistPage = document.getElementById('artistPage');
    artistPage.innerHTML = `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <div class="loading-text">Loading ${artistId}...</div>
        </div>
    `;
   
    // Check if we already have this artist's data
    if (gameState.artistData[artistId]) {
        console.log('Using cached artist data');
        handlePlayerMove({
            playerId: gameState.playerId,
            artistId: artistId,
            artistData: gameState.artistData[artistId],
            path: [...gameState.playerPath, artistId],
            steps: gameState.playerPath.length,
            hasWon: artistId === gameState.targetArtistId
        });
    } else {
        console.log('Fetching new artist data');
        // Request artist data from server
        sendWebSocketMessage({
            type: 'get_artist_data',
            artistId: artistId
        });
    }
   
    // Send move to server
    sendWebSocketMessage({
        type: 'player_move',
        artistId: artistId
    });
}


function toggleAlbum(albumId) {
    const albumTracks = document.getElementById(`album-${albumId}`);
    const albumHeader = albumTracks.previousElementSibling;
    const toggleIcon = albumHeader.querySelector('.toggle-icon');
   
    if (albumHeader.classList.contains('expanded')) {
        albumHeader.classList.remove('expanded');
        albumTracks.style.display = 'none';
        toggleIcon.textContent = '▼';
    } else {
        albumHeader.classList.add('expanded');
        albumTracks.style.display = 'block';
        toggleIcon.textContent = '▲';
    }
}


function goBack() {
    if (gameState.playerPath.length > 1) {
        const previousArtistId = gameState.playerPath[gameState.playerPath.length - 2];
        console.log('Going back to:', previousArtistId);
       
        // Update path
        gameState.playerPath.pop();
        gameState.currentArtistId = previousArtistId;
       
        // Display previous artist
        if (gameState.artistData[previousArtistId]) {
            displayArtistPage(gameState.artistData[previousArtistId]);
        } else {
            // Request data for previous artist
            sendWebSocketMessage({
                type: 'get_artist_data',
                artistId: previousArtistId
            });
        }
       
        updateGameStatus();
    } else {
        showError('gameScreen', 'Cannot go back further!');
    }
}


// Lobby management functions
function createLobby() {
    const hostName = document.getElementById('hostName').value.trim();
    const createBtn = document.querySelector('button[onclick="createLobby()"]');
   
    if (!hostName) {
        showError('landingScreen', 'Please enter your name');
        return;
    }
   
    if (!gameState.connected) {
        showError('landingScreen', 'Not connected to server. Please refresh the page.');
        return;
    }
   
    const hideLoading = showLoading(createBtn, 'Creating Lobby...');
   
    gameState.playerName = hostName;
    sendWebSocketMessage({
        type: 'create_lobby',
        playerName: hostName
    });
   
    setTimeout(() => {
        hideLoading();
    }, 3000);
}


function joinLobby() {
    const playerName = document.getElementById('playerName').value.trim();
    const lobbyCode = document.getElementById('lobbyCode').value.trim().toUpperCase();
    const joinBtn = document.querySelector('button[onclick="joinLobby()"]');
   
    if (!playerName) {
        showError('landingScreen', 'Please enter your name');
        return;
    }
   
    if (!lobbyCode || lobbyCode.length !== 6) {
        showError('landingScreen', 'Please enter a valid 6-character lobby code');
        return;
    }
   
    if (!gameState.connected) {
        showError('landingScreen', 'Not connected to server. Please refresh the page.');
        return;
    }
   
    const hideLoading = showLoading(joinBtn, 'Joining Lobby...');
   
    gameState.playerName = playerName;
    sendWebSocketMessage({
        type: 'join_lobby',
        playerName: playerName,
        lobbyCode: lobbyCode
    });
   
    setTimeout(() => {
        hideLoading();
    }, 3000);
}


function leaveLobby() {
    if (gameState.lobbyCode) {
        sendWebSocketMessage({
            type: 'leave_lobby',
            playerId: gameState.playerId
        });
    }
   
    // Reset game state
    gameState = {
        lobbyCode: null,
        isHost: false,
        playerName: '',
        playerId: null,
        players: [],
        gameStarted: false,
        currentArtistId: null,
        targetArtistId: null,
        playerPath: [],
        connected: gameState.connected,
        artistData: {},
        allArtistIds: []
    };
   
    // Clear input fields
    document.getElementById('hostName').value = '';
    document.getElementById('playerName').value = '';
    document.getElementById('lobbyCode').value = '';
   
    showScreen('landing');
}


function updatePlayersDisplay() {
    const playersList = document.getElementById('playersList');
    const playerCount = document.getElementById('playerCount');
    const readyBtn = document.getElementById('readyBtn');
   
    playerCount.textContent = gameState.players.length;
   
    playersList.innerHTML = gameState.players.map(player => `
        <div class="player-card">
            <div class="player-avatar">${player.name.charAt(0).toUpperCase()}</div>
            <div class="player-info">
                <div class="player-name">
                    ${player.name}
                    ${player.isHost ? '<span class="host-badge">HOST</span>' : ''}
                </div>
                <div class="player-status">${player.isReady ? 'Ready' : 'Not Ready'}</div>
            </div>
        </div>
    `).join('');
   
    if (readyBtn) {
        const currentPlayer = gameState.players.find(p => p.id === gameState.playerId);
        if (currentPlayer) {
            readyBtn.textContent = currentPlayer.isReady ? 'Mark Not Ready' : 'Mark Ready';
            readyBtn.className = currentPlayer.isReady ? 'btn btn-secondary' : 'btn';
        }
    }
}


function updateStartButton() {
    const startBtn = document.getElementById('startGameBtn');
    const readyPlayers = gameState.players.filter(p => p.isReady).length;
    const totalPlayers = gameState.players.length;
   
    if (gameState.isHost && readyPlayers === totalPlayers && totalPlayers >= 1) {
        startBtn.disabled = false;
        startBtn.textContent = `Start Game (${totalPlayers} players)`;
    } else {
        startBtn.disabled = true;
        if (totalPlayers < 1) {
            startBtn.textContent = 'Need at least 1 player';
        } else {
            startBtn.textContent = `Waiting for players (${readyPlayers}/${totalPlayers} ready)`;
        }
    }
}


function startGame() {
    if (!gameState.isHost) return;
   
    const startBtn = document.getElementById('startGameBtn');
    const hideLoading = showLoading(startBtn, 'Starting Game...');
   
    sendWebSocketMessage({
        type: 'start_game'
    });
   
    setTimeout(() => {
        hideLoading();
    }, 10000); // Give more time for game start
}


function updateSettingsDisplay() {
    if (!gameState.settings) return;
   
    const difficultySelect = document.getElementById('difficulty');
    const timeLimitSelect = document.getElementById('timeLimit');
   
    if (difficultySelect) {
        difficultySelect.value = gameState.settings.difficulty || 'medium';
    }
    if (timeLimitSelect) {
        timeLimitSelect.value = gameState.settings.timeLimit || '10';
    }
}


function updateGameSettings() {
    if (!gameState.isHost) return;
   
    const difficulty = document.getElementById('difficulty').value;
    const timeLimit = document.getElementById('timeLimit').value;
   
    sendWebSocketMessage({
        type: 'update_settings',
        settings: {
            difficulty: difficulty,
            timeLimit: timeLimit
        }
    });
}


function togglePlayerReady() {
    const currentPlayer = gameState.players.find(p => p.id === gameState.playerId);
    if (!currentPlayer) return;
   
    sendWebSocketMessage({
        type: 'player_ready',
        ready: !currentPlayer.isReady
    });
}


function returnToLobby() {
    gameState.gameStarted = false;
    gameState.playerPath = [];
    gameState.currentArtistId = null;
    gameState.targetArtistId = null;
    gameState.artistData = {};
    showScreen('lobby');
}


// Game status update
function updateGameStatus() {
    const currentArtist = gameState.artistData[gameState.currentArtistId];
    const targetArtist = gameState.artistData[gameState.targetArtistId];
   
    if (currentArtist) {
        document.getElementById('currentArtist').textContent = currentArtist.name;
    }
    if (targetArtist) {
        document.getElementById('targetArtist').textContent = targetArtist.name;
    }
   
    document.getElementById('stepCount').textContent = gameState.playerPath.length - 1;
   
    // Update path display
    const pathChain = document.getElementById('pathChain');
    if (pathChain) {
        pathChain.innerHTML = '';
       
        gameState.playerPath.forEach((artistId, index) => {
            const artist = gameState.artistData[artistId];
            const artistSpan = document.createElement('span');
            artistSpan.className = 'path-artist';
            artistSpan.textContent = artist ? artist.name : artistId;
            pathChain.appendChild(artistSpan);
           
            if (index < gameState.playerPath.length - 1) {
                const arrow = document.createElement('span');
                arrow.className = 'path-arrow';
                arrow.textContent = '→';
                pathChain.appendChild(arrow);
            }
        });
    }
}


function showWinMessage() {
    const targetArtist = gameState.artistData[gameState.targetArtistId];
    const targetName = targetArtist ? targetArtist.name : 'the target artist';
    showSuccess('gameScreen', `🎉 Congratulations! You reached ${targetName} in ${gameState.playerPath.length - 1} steps!`);
}


// Utility functions
function showError(screenId, message) {
    showEnhancedError(screenId, message);
}


function showSuccess(screenId, message) {
    showEnhancedSuccess(screenId, message);
}


function clearMessages(screenId) {
    const screen = document.getElementById(screenId);
    const messages = screen.querySelectorAll('.error-message, .success-message');
    messages.forEach(msg => msg.remove());
}


// Loading states
function showLoading(element, text = 'Loading...') {
    const originalText = element.textContent;
    element.innerHTML = `<span class="loading-spinner"></span>${text}`;
    element.disabled = true;
   
    return function hideLoading() {
        element.textContent = originalText;
        element.disabled = false;
    };
}


// Enhanced messages
function showEnhancedSuccess(screenId, message, duration = 5000) {
    clearMessages(screenId);
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
            <span style="font-size: 1.2rem;">✅</span>
            <span>${message}</span>
        </div>
    `;
    document.getElementById(screenId).appendChild(successDiv);
   
    setTimeout(() => {
        successDiv.style.animation = 'messageSlideIn 0.4s ease-out reverse';
        setTimeout(() => successDiv.remove(), 400);
    }, duration);
}


function showEnhancedError(screenId, message, duration = 5000) {
    clearMessages(screenId);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
            <span style="font-size: 1.2rem;">❌</span>
            <span>${message}</span>
        </div>
    `;
    document.getElementById(screenId).appendChild(errorDiv);
   
    setTimeout(() => {
        errorDiv.style.animation = 'messageSlideIn 0.4s ease-out reverse';
        setTimeout(() => errorDiv.remove(), 400);
    }, duration);
}


// Particle system
function createParticle() {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = Math.random() * 100 + 'vw';
    particle.style.animationDelay = Math.random() * 6 + 's';
    particle.style.animationDuration = (Math.random() * 3 + 4) + 's';
    document.body.appendChild(particle);
   
    setTimeout(() => {
        particle.remove();
    }, 10000);
}


function startParticleSystem() {
    setInterval(createParticle, 2000);
}


// Enhanced button effects
function addButtonEffects() {
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(button => {
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-3px) scale(1)';
        });
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-3px) scale(1.02)';
        });
       
        button.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
       
        button.addEventListener('mousedown', function() {
            this.style.transform = 'translateY(-1px) scale(1.01)';
        });
       
        button.addEventListener('mouseup', function() {
            this.style.transform = 'translateY(-3px) scale(1.02)';
        });
    });
}


// Enhanced input effects
function addInputEffects() {
    const inputs = document.querySelectorAll('.game-input');
    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            this.parentElement.style.transform = 'scale(1.02)';
        });
       
        input.addEventListener('blur', function() {
            this.parentElement.style.transform = 'scale(1)';
        });
       
        input.addEventListener('input', function() {
            if (this.value.length > 0) {
                this.style.borderColor = 'var(--secondary-green)';
                this.style.boxShadow = '0 0 15px rgba(30, 215, 96, 0.2)';
            } else {
                this.style.borderColor = 'var(--glass-border)';
                this.style.boxShadow = 'none';
            }
        });
    });
}


// Loading states
function showLoading(element, text = 'Loading...') {
    const originalText = element.textContent;
    element.innerHTML = `<span class="loading-spinner"></span>${text}`;
    element.disabled = true;
   
    return function hideLoading() {
        element.textContent = originalText;
        element.disabled = false;
    };
}


// Enhanced success/error messages
function showEnhancedSuccess(screenId, message, duration = 5000) {
    clearMessages(screenId);
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
            <span style="font-size: 1.2rem;">✅</span>
            <span>${message}</span>
        </div>
    `;
    document.getElementById(screenId).appendChild(successDiv);
   
    setTimeout(() => {
        successDiv.style.animation = 'messageSlideIn 0.4s ease-out reverse';
        setTimeout(() => successDiv.remove(), 400);
    }, duration);
}


function showEnhancedError(screenId, message, duration = 5000) {
    clearMessages(screenId);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
            <span style="font-size: 1.2rem;">❌</span>
            <span>${message}</span>
        </div>
    `;
    document.getElementById(screenId).appendChild(errorDiv);
   
    setTimeout(() => {
        errorDiv.style.animation = 'messageSlideIn 0.4s ease-out reverse';
        setTimeout(() => errorDiv.remove(), 400);
    }, duration);
}


// Initialize the app
function init() {
    // Connect to WebSocket server
    connectWebSocket();
   
    // Start particle system
    startParticleSystem();
   
    // Add enhanced interactions
    addButtonEffects();
    addInputEffects();
   
    // Add keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && currentScreen === 'landing') {
            const activeInput = document.activeElement;
            if (activeInput && activeInput.classList.contains('game-input')) {
                if (activeInput.id === 'hostName') {
                    createLobby();
                } else if (activeInput.id === 'lobbyCode') {
                    joinLobby();
                }
            }
        }
    });
}


// Auto-convert lobby code input to uppercase
document.addEventListener('DOMContentLoaded', function() {
    const lobbyCodeInput = document.getElementById('lobbyCode');
    if (lobbyCodeInput) {
        lobbyCodeInput.addEventListener('input', function(e) {
            e.target.value = e.target.value.toUpperCase();
        });
    }
   
    // Initialize the app
    init();
});

