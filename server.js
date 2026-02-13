// Spaghetti of Gehakt - HTTP Polling Server
// Supports up to 12 players per lobby

const http = require('http');
const PORT = process.env.PORT || 3000;

// Store all lobbies in memory
const lobbies = new Map();

// Generate random 5-digit PIN
function generatePIN() {
    return Math.floor(10000 + Math.random() * 90000).toString();
}

// Generate random player ID
function generatePlayerID() {
    return Math.floor(100000 + Math.random() * 900000);
}

// Clean up old lobbies (older than 1 hour)
setInterval(() => {
    const now = Date.now();
    for (const [pin, lobby] of lobbies.entries()) {
        if (now - lobby.created_at > 3600000) {
            lobbies.delete(pin);
            console.log(`Cleaned up old lobby: ${pin}`);
        }
    }
}, 300000); // Every 5 minutes

// Create HTTP server
const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Parse URL
    const url = new URL(req.url, `http://localhost:10000`);
    const path = url.pathname;
    
    // Handle different endpoints
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                
                if (path === '/create_lobby') {
                    handleCreateLobby(res, data);
                } else if (path === '/join_lobby') {
                    handleJoinLobby(res, data);
                } else if (path === '/start_game') {
                    handleStartGame(res, data);
                } else if (path === '/leave_lobby') {
                    handleLeaveLobby(res, data);
                } else {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Not found' }));
                }
            } catch (err) {
                console.error('Error parsing request:', err);
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Bad request' }));
            }
        });
    } else if (req.method === 'GET' && path === '/get_lobby') {
        const pin = url.searchParams.get('pin');
        handleGetLobby(res, pin);
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

// Create new lobby
function handleCreateLobby(res, data) {
    const pin = generatePIN();
    const playerID = generatePlayerID();
    
    const player = {
        id: playerID,
        name: data.name,
        is_host: true,
        last_ping: Date.now()
    };
    
    const lobby = {
        pin: pin,
        players: [player],
        max_players: 12,
        state: 'lobby',
        created_at: Date.now(),
        countdown_started: false
    };
    
    lobbies.set(pin, lobby);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        type: 'lobby_created',
        success: true,
        pin: pin,
        player: {
            id: playerID,
            name: data.name,
            is_host: true
        },
        players: lobby.players.map(p => ({
            id: p.id,
            name: p.name,
            is_host: p.is_host
        }))
    }));
    
    console.log(`Lobby created: ${pin} by ${data.name}`);
}

// Join existing lobby
function handleJoinLobby(res, data) {
    const lobby = lobbies.get(data.pin);
    
    if (!lobby) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            type: 'join_failed',
            success: false,
            reason: 'Lobby not found'
        }));
        return;
    }
    
    if (lobby.players.length >= lobby.max_players) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            type: 'join_failed',
            success: false,
            reason: 'Lobby full'
        }));
        return;
    }
    
    const playerID = generatePlayerID();
    const player = {
        id: playerID,
        name: data.name,
        is_host: false,
        last_ping: Date.now()
    };
    
    lobby.players.push(player);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        type: 'join_success',
        success: true,
        pin: data.pin,
        player: {
            id: playerID,
            name: data.name,
            is_host: false
        },
        players: lobby.players.map(p => ({
            id: p.id,
            name: p.name,
            is_host: p.is_host
        }))
    }));
    
    console.log(`${data.name} joined lobby ${data.pin}`);
}

// Get lobby state (polling endpoint)
function handleGetLobby(res, pin) {
    const lobby = lobbies.get(pin);
    
    if (!lobby) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            type: 'lobby_not_found',
            success: false
        }));
        return;
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        type: 'lobby_state',
        success: true,
        pin: pin,
        state: lobby.state,
        countdown_started: lobby.countdown_started,
        players: lobby.players.map(p => ({
            id: p.id,
            name: p.name,
            is_host: p.is_host
        }))
    }));
}

// Start game
function handleStartGame(res, data) {
    const lobby = lobbies.get(data.pin);
    
    if (!lobby) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false }));
        return;
    }
    
    lobby.state = 'started';
    lobby.countdown_started = true;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        type: 'game_started',
        success: true
    }));
    
    console.log(`Game starting in lobby ${data.pin}`);
}

// Leave lobby
function handleLeaveLobby(res, data) {
    const lobby = lobbies.get(data.pin);
    
    if (!lobby) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false }));
        return;
    }
    
    const playerIndex = lobby.players.findIndex(p => p.id === data.player_id);
    if (playerIndex === -1) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false }));
        return;
    }
    
    const wasHost = lobby.players[playerIndex].is_host;
    lobby.players.splice(playerIndex, 1);
    
    // If lobby empty, delete it
    if (lobby.players.length === 0) {
        lobbies.delete(data.pin);
        console.log(`Lobby ${data.pin} deleted (empty)`);
    } else if (wasHost) {
        // Assign new host
        lobby.players[0].is_host = true;
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Test with: http://localhost:${PORT}`);
});

