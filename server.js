const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const championsData = require('./data/champions.json');
// We map it to just ID/Name for simple shuffling if needed, but we pass full objects now
const championsPool = championsData;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- GAME STATE MANAGEMENT ---
// Format:
// lobbies[lobbyId] = {
//    id: "lobbyId",
//    hostId: "socketId",
//    players: [ { id, name, score, totalScore, targetChampion, guessesLeft, isFinished } ],
//    settings: { totalRounds: 1 },
//    state: { 
//       active: false, 
//       currentRound: 0, 
//       turnIndex: 0, 
//       finishedCount: 0 
//    }
// }
const lobbies = {};

const POINTS_DISTRIBUTION = [5, 4, 3, 2, 1];

io.on('connection', (socket) => {
    console.log('Connected:', socket.id);

    // 1. JOIN LOBBY
    // Send Full Champion List for Autocomplete
    socket.emit('initData', {
        championNames: championsPool.map(c => c.name)
    });

    socket.on('joinGame', ({ name, lobbyId }) => {
        // Basic validation
        if (!name || !lobbyId) return;

        lobbyId = lobbyId.toLowerCase(); // Case insensitive lobby IDs
        socket.join(lobbyId);

        // Create lobby if not exists
        if (!lobbies[lobbyId]) {
            lobbies[lobbyId] = {
                id: lobbyId,
                hostId: socket.id,
                players: [],
                settings: { totalRounds: 3 }, // Default
                state: {
                    active: false,
                    currentRound: 0,
                    turnIndex: 0,
                    finishedCount: 0
                }
            };
        }

        const lobby = lobbies[lobbyId];

        // Check if game is already active
        if (lobby.state.active) {
            socket.emit('notification', 'Bu oyun şu an oynanıyor, katılamazsın.');
            return;
        }

        // Add Player
        const newPlayer = {
            id: socket.id,
            name: name,
            score: 0,       // Round score
            totalScore: 0,  // Game total score
            targetChampion: "",
            guessesLeft: 3,
            isFinished: false
        };
        lobby.players.push(newPlayer);

        // Notify client about lobby state
        io.to(lobbyId).emit('updateLobby', {
            lobbyId: lobbyId,
            players: lobby.players.map(p => ({
                id: p.id,
                name: p.name,
                isHost: p.id === lobby.hostId
            })),
            hostId: lobby.hostId
        });
    });

    // 2. START GAME (Host only)
    socket.on('startGame', ({ lobbyId, totalRounds }) => {
        const lobby = lobbies[lobbyId];
        if (!lobby || lobby.hostId !== socket.id) return;

        if (lobby.players.length < 2) {
            socket.emit('notification', 'Oyunu başlatmak için en az 2 kişi gerekli!');
            return;
        }

        // Initialize Game Settings
        lobby.settings.totalRounds = parseInt(totalRounds) || 3;
        lobby.state.active = true;
        lobby.state.currentRound = 0;

        // Reset Total Scores 
        lobby.players.forEach(p => p.totalScore = 0);

        startRound(lobbyId);
    });

    // START NEXT ROUND (Host only or auto)
    socket.on('startNextRound', ({ lobbyId }) => {
        const lobby = lobbies[lobbyId];
        if (!lobby || lobby.hostId !== socket.id) return;
        startRound(lobbyId);
    });

    // --- HELPER: START ROUND LOGIC ---
    function startRound(lobbyId) {
        const lobby = lobbies[lobbyId];
        lobby.state.currentRound++;
        lobby.state.finishedCount = 0;
        lobby.state.turnIndex = 0;

        // Shuffle Champions
        const shuffledChamps = [...championsPool].sort(() => 0.5 - Math.random());

        // Reset Player Round State
        lobby.players.forEach((player, index) => {
            // Assign full champion object logic
            const target = shuffledChamps[index % shuffledChamps.length];
            // We store the ID or Name as the 'answer'. Let's store Name for now, but keep object ref if needed.
            // Actually, let's store the whole small object for hints.
            player.targetChampion = target.name;
            player.targetDetails = target; // New: Store details for hints

            player.guessesLeft = 3;
            player.isFinished = false;
            player.score = 0;
        });

        broadcastGameState(lobbyId);
    }

    // 3. GAME ACTIONS
    socket.on('passTurn', () => {
        const lobbyId = getLobbyIdOfSocket(socket);
        if (lobbyId) nextTurn(lobbyId);
    });

    socket.on('makeGuess', (guess) => {
        const lobbyId = getLobbyIdOfSocket(socket);
        if (!lobbyId) return;

        const lobby = lobbies[lobbyId];
        const player = lobby.players.find(p => p.id === socket.id);

        // Turn Validation
        if (!player || lobby.players[lobby.state.turnIndex].id !== socket.id || player.isFinished) return;

        // Guess Logic
        if (guess.toLowerCase() === player.targetChampion.toLowerCase()) {
            // Correct
            const points = POINTS_DISTRIBUTION[lobby.state.finishedCount] || 1;
            player.score = points; // Round score
            player.totalScore += points;
            player.isFinished = true;
            lobby.state.finishedCount++;

            io.to(lobbyId).emit('notification', `${player.name} DOĞRU BİLDİ! (+${points} Puan)`);
        } else {
            // Wrong
            player.guessesLeft--;
            if (player.guessesLeft <= 0) {
                player.isFinished = true; // Eliminated
                lobby.state.finishedCount++; // Treat as 'finished' for turn logic key
                io.to(lobbyId).emit('notification', `${player.name} elendi! Cevap: ${player.targetChampion}`);
            } else {
                io.to(lobbyId).emit('notification', `${player.name} yanlış bildi. Kalan hak: ${player.guessesLeft}`);
            }
        }

        nextTurn(lobbyId);
    });

    // --- TURN LOGIC ---
    function nextTurn(lobbyId) {
        const lobby = lobbies[lobbyId];

        // CHECK ROUND OVER
        const activePlayers = lobby.players.filter(p => !p.isFinished);

        // If everyone has finished (or eliminated)
        if (activePlayers.length === 0) {
            handleRoundEnd(lobbyId);
            return;
        }

        // Find next active player
        let loopCount = 0;
        do {
            lobby.state.turnIndex = (lobby.state.turnIndex + 1) % lobby.players.length;
            loopCount++;
        } while (lobby.players[lobby.state.turnIndex].isFinished && loopCount < lobby.players.length);

        broadcastGameState(lobbyId);
    }

    function handleRoundEnd(lobbyId) {
        const lobby = lobbies[lobbyId];
        const isMatchOver = lobby.state.currentRound >= lobby.settings.totalRounds;

        io.to(lobbyId).emit('roundOver', {
            players: lobby.players,
            currentRound: lobby.state.currentRound,
            totalRounds: lobby.settings.totalRounds,
            isMatchOver: isMatchOver,
            hostId: lobby.hostId
        });

        if (isMatchOver) {
            lobby.state.active = false;
        }
    }

    function broadcastGameState(lobbyId) {
        const lobby = lobbies[lobbyId];
        const turnPlayer = lobby.players[lobby.state.turnIndex];

        io.to(lobbyId).emit('updateGame', {
            turnPlayerId: turnPlayer.id,
            players: lobby.players,
            currentRound: lobby.state.currentRound,
            totalRounds: lobby.settings.totalRounds
        });
    }

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
        // Find which lobby the socket is in
        // A simpler way might be to store lobbyId on socket, but iterating is safer for consistency here
        for (const [id, lobby] of Object.entries(lobbies)) {
            const index = lobby.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                // Remove player
                const wasHost = (lobby.hostId === socket.id);
                lobby.players.splice(index, 1);

                if (lobby.players.length === 0) {
                    delete lobbies[id]; // Delete empty lobby
                } else {
                    if (wasHost) {
                        lobby.hostId = lobby.players[0].id; // Assign new host
                    }
                    // Update remaining players (in lobby or game)
                    if (lobby.state.active) {
                        // If game active, might need to handle turn crash? 
                        // For simplicity, we just end game if active player leaves or update list
                        lobby.state.active = false;
                        io.to(id).emit('notification', 'Bir oyuncu ayrıldı, oyun bitti.');
                        io.to(id).emit('updateLobby', {
                            lobbyId: id,
                            players: lobby.players.map(p => ({ id: p.id, name: p.name, isHost: p.id === lobby.hostId })),
                            hostId: lobby.hostId
                        }); // Go back to lobby
                        // Ideally we would pause/handle nicely, but resetting to lobby is safe fallback
                        io.to(id).emit('forceLobby');
                    } else {
                        io.to(id).emit('updateLobby', {
                            lobbyId: id,
                            players: lobby.players.map(p => ({
                                id: p.id,
                                name: p.name,
                                isHost: p.id === lobby.hostId
                            })),
                            hostId: lobby.hostId
                        });
                    }
                }
                break;
            }
        }
    });

    function getLobbyIdOfSocket(sock) {
        // Helper to find lobby of a socket
        for (const [id, lobby] of Object.entries(lobbies)) {
            if (lobby.players.find(p => p.id === sock.id)) return id;
        }
        return null;
    }
});

server.listen(3001, () => {
    console.log('Sunucu 3001 portunda hazır.');
});