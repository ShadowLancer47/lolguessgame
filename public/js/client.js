const socket = io();
let myId = "";
let currentLobbyId = "";
let isHost = false;

// --- DOM References ---
const dom = {
    username: document.getElementById('username'),
    lobbyId: document.getElementById('lobbyId'),
    displayLobbyId: document.getElementById('displayLobbyId'),
    lobbyList: document.getElementById('lobbyList'),
    hostControls: document.getElementById('hostControls'),
    totalRounds: document.getElementById('totalRounds'),
    btnStartGame: document.getElementById('btnStartGame'),
    msgWaiting: document.getElementById('msgWaiting'),

    scoreList: document.getElementById('scoreList'),
    gameArea: document.getElementById('gameArea'),
    roundIndicator: document.getElementById('roundIndicator'),

    resultTitle: document.getElementById('resultTitle'),
    finalScores: document.getElementById('finalScores'),
    btnNextRound: document.getElementById('btnNextRound'),
    btnNewGame: document.getElementById('btnNewGame'),

    notification: document.getElementById('notification')
};

const screens = {
    login: document.getElementById('loginScreen'),
    lobby: document.getElementById('lobbyScreen'),
    game: document.getElementById('gameScreen'),
    result: document.getElementById('resultScreen')
};

// --- Socket Events ---
socket.on('connect', () => {
    myId = socket.id;
});

socket.on('updateLobby', (data) => {
    currentLobbyId = data.lobbyId;
    isHost = (myId === data.hostId);

    showScreen('lobby');
    dom.displayLobbyId.textContent = currentLobbyId;

    renderLobby(data.players);
    updateHostControls();
});

let allChampionNames = [];
socket.on('initData', (data) => {
    allChampionNames = data.championNames;
});

// 2. LOBBY EVENTS
socket.on('forceLobby', () => {
    showScreen('lobby');
    showNotification("Oyun sonlandırıldı, lobiye dönüldü.");
});

socket.on('updateGame', (data) => {
    showScreen('game');
    dom.roundIndicator.textContent = `${data.currentRound} / ${data.totalRounds}`;

    updateScoreboard(data.players, data.turnPlayerId);
    renderGameArea(data);
});

socket.on('roundOver', (data) => {
    showScreen('result');
    isHost = (myId === data.hostId); // Ensure host status is current

    renderFinalScores(data.players);

    if (data.isMatchOver) {
        dom.resultTitle.textContent = "MAÇ BİTTİ!";
        dom.btnNextRound.classList.add('hidden');
        dom.btnNewGame.classList.remove('hidden'); // Everyone can go back
    } else {
        dom.resultTitle.textContent = `${data.currentRound}. Tur Bitti!`;
        dom.btnNewGame.classList.add('hidden');

        if (isHost) {
            dom.btnNextRound.classList.remove('hidden'); // Only host can next
        } else {
            dom.btnNextRound.classList.add('hidden');
            dom.resultTitle.innerHTML += "<br><span style='font-size:1rem; color:#888'>Host'un başlatması bekleniyor...</span>";
        }
    }
});

socket.on('notification', (msg) => showNotification(msg));


// --- Actions ---

function joinGame() {
    const name = dom.username.value.trim();
    const lobby = dom.lobbyId.value.trim();

    if (name && lobby) {
        socket.emit('joinGame', { name, lobbyId: lobby });
    } else {
        showNotification("İsim ve Oda Adı gerekli!");
    }
}

function startGame() {
    const rounds = dom.totalRounds.value;
    socket.emit('startGame', { lobbyId: currentLobbyId, totalRounds: rounds });
}

function startNextRound() {
    socket.emit('startNextRound', { lobbyId: currentLobbyId });
}

function sendPass() {
    socket.emit('passTurn');
}

function sendGuess() {
    const input = document.getElementById('guessInput');
    if (input && input.value) {
        socket.emit('makeGuess', input.value.trim());
    }
}


// --- Rendering ---

function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

function updateHostControls() {
    if (isHost) {
        dom.hostControls.classList.remove('hidden');
        dom.btnStartGame.classList.remove('hidden');
        dom.msgWaiting.classList.add('hidden');
    } else {
        dom.hostControls.classList.add('hidden');
        dom.btnStartGame.classList.add('hidden');
        dom.msgWaiting.classList.remove('hidden');
    }
}

function renderLobby(players) {
    dom.lobbyList.innerHTML = players.map(p => `
        <div class="player-row" style="justify-content: center; text-align: center;">
            <span style="font-size: 1.2rem; display: block; width: 100%;">
               ${p.isHost ? '👑' : ''} ${p.name}
            </span>
        </div>
    `).join('');
}

function renderGameArea(data) {
    const currentPlayer = data.players.find(p => p.id === data.turnPlayerId);
    if (!currentPlayer) return;

    if (myId === data.turnPlayerId) {
        dom.gameArea.innerHTML = `
        <div class="big-text">SIRA SENDE!</div>
        <p class="instruction-text">Tahmin Yap:</p>
        
        <div class="autocomplete-container">
            <input type="text" id="guessInput" class="autocomplete-input" placeholder="Şampiyon Adı..." autocomplete="off">
        </div>

        <div style="margin-top: 20px;">
            <button class="hex-btn primary" onclick="sendGuess()">TAHMİN ET</button>
            <button class="hex-btn danger" onclick="sendPass()">PAS GEÇ</button>
        </div>
        <p style="margin-top:15px; color:#c8aa6e;">Kalan Hakkın: ${currentPlayer.guessesLeft}</p>
    `;

        // Setup Autocomplete
        setTimeout(() => {
            setupAutocomplete(document.getElementById("guessInput"), allChampionNames);
            document.getElementById("guessInput").focus();
        }, 100);
    } else {
        const champ = currentPlayer.targetDetails || { name: currentPlayer.targetChampion }; // Fallback
        const imgUrl = champ.loadingImg || `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${currentPlayer.targetChampion}_0.jpg`;

        // Style constants moved back
        // Hints HTML - Responsive Class-based Layout
        let hintsHtml = `
            <div class="hint-box">
                <div class="hint-label">Unvan</div>
                <div class="hint-val">${champ.title || '???'}</div>
            </div>
            
            <div class="hint-box">
                <div class="hint-label">Roller</div>
                <div class="hint-val-white">${(champ.roles && champ.roles.length > 0) ? champ.roles.join(', ') : 'Bilinmiyor'}</div>
            </div>

            <div class="hint-box">
                <div class="hint-label">Kaynak</div>
                <div class="hint-val-white">${champ.partype || '???'}</div>
            </div>

            <div class="hint-grid">
                <div class="hint-box">
                    <div class="hint-label">Bölge</div>
                    <div class="hint-val-white">${champ.region || 'Runeterra'}</div>
                </div>
                 <div class="hint-box">
                    <div class="hint-label">Yıl</div>
                    <div class="hint-val-white">${champ.releaseYear || '???'}</div>
                </div>
            </div>
            
            <div class="hint-box">
                <div class="hint-label">Cinsiyet</div>
                <div class="hint-val-white">${champ.gender || 'Diğer'}</div>
            </div>
        `;

        dom.gameArea.innerHTML = `
        <div class="big-text">Sıra ${currentPlayer.name} adlı oyuncuda</div>
        <div class="game-container">
            <div class="champ-column">
                <div class="champ-img-container">
                    <img src="${imgUrl}" class="champ-img">
                </div>
                <h2 class="champ-name">${champ.name}</h2>
            </div>
            <div class="hints-column">
                <div class="hints-title">İPUÇLARI (Sadece Sana)</div>
                 ${hintsHtml}
            </div>
        </div>
        <p class="instruction-text">Sorulara Cevap Ver...</p>
        `;
    }
}

function updateScoreboard(players, currentId) {
    dom.scoreList.innerHTML = players.map(p => {
        let classes = "player-row";
        if (p.id === currentId) classes += " active-turn";
        if (p.isFinished) classes += " finished";

        return `
        <div class="${classes}" style="display:flex; align-items:center;">
            <span style="flex-grow:1; text-align:left; padding-left:10px; font-weight:bold;">${p.name}</span>
            <div style="text-align:right; min-width:80px; font-size:0.85rem;">
               <div style="color:#bfbfbf;">Bu Tur: ${p.score}</div>
               <div style="color:var(--hex-gold);">Top: ${p.totalScore}</div>
            </div>
        </div>
        `;
    }).join('');
}

function renderFinalScores(players) {
    players.sort((a, b) => b.totalScore - a.totalScore); // Sort by TOTAL
    dom.finalScores.innerHTML = players.map((p, index) => `
        <div class="player-row" style="background: rgba(0,0,0,0.2); margin: 10px 0;">
            <span style="font-size: 1.5rem; color: ${index === 0 ? 'var(--hex-blue)' : 'inherit'}">
                #${index + 1} ${p.name}
            </span>
            <span style="font-size: 1.5rem; color: var(--hex-gold);">${p.totalScore} P</span>
        </div>
    `).join('');
}


// --- AUTOCOMPLETE LOGIC ---
function setupAutocomplete(inp, arr) {
    let currentFocus;

    inp.addEventListener("input", function (e) {
        let a, b, i, val = this.value;
        closeAllLists();
        if (!val) { return false; }
        currentFocus = -1;

        a = document.createElement("DIV");
        a.setAttribute("id", this.id + "autocomplete-list");
        a.setAttribute("class", "autocomplete-items");
        this.parentNode.appendChild(a);

        // Filter logic: Check if name includes the search term (case insensitive)
        let count = 0;
        for (i = 0; i < arr.length; i++) {
            if (arr[i].toLowerCase().includes(val.toLowerCase()) && count < 10) { // Limit to 10 results
                b = document.createElement("DIV");
                // Bold the matching part? Simple version first: just show name
                b.innerHTML = arr[i];
                b.innerHTML += "<input type='hidden' value='" + arr[i] + "'>";
                b.addEventListener("click", function (e) {
                    inp.value = this.getElementsByTagName("input")[0].value;
                    closeAllLists();
                });
                a.appendChild(b);
                count++;
            }
        }
    });

    inp.addEventListener("keydown", function (e) {
        let x = document.getElementById(this.id + "autocomplete-list");
        if (x) x = x.getElementsByTagName("div");
        if (e.keyCode == 40) { // Down
            currentFocus++;
            addActive(x);
        } else if (e.keyCode == 38) { // Up
            currentFocus--;
            addActive(x);
        } else if (e.keyCode == 13) { // Enter
            e.preventDefault();
            if (currentFocus > -1) {
                if (x) x[currentFocus].click();
            } else if (x && x.length === 1) {
                // If only 1 option and enter is pressed, select it
                x[0].click();
            } else {
                // If no selection, just submit what's typed (handled by existing enter listener if any?)
                // Actually the button calls sendGuess(). We can trigger that if needed.
                sendGuess();
            }
        }
    });

    function addActive(x) {
        if (!x) return false;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        x[currentFocus].classList.add("autocomplete-active");
    }

    function removeActive(x) {
        for (var i = 0; i < x.length; i++) {
            x[i].classList.remove("autocomplete-active");
        }
    }

    function closeAllLists(elmnt) {
        var x = document.getElementsByClassName("autocomplete-items");
        for (var i = 0; i < x.length; i++) {
            if (elmnt != x[i] && elmnt != inp) {
                x[i].parentNode.removeChild(x[i]);
            }
        }
    }

    document.addEventListener("click", function (e) {
        closeAllLists(e.target);
    });
}

function showNotification(msg) {
    dom.notification.innerText = msg;
    dom.notification.style.display = 'block';
    setTimeout(() => { dom.notification.style.display = 'none'; }, 3000);
}

// Bind Global
window.joinGame = joinGame;
window.startGame = startGame;
window.startNextRound = startNextRound;
window.sendPass = sendPass;
window.sendGuess = sendGuess;
