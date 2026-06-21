"use strict";

const colors = ["red", "green", "yellow", "blue"];
const colorNames = { red: "Red", green: "Green", yellow: "Yellow", blue: "Blue" };
const botNames = ["Mira", "Dev", "Asha"];
const starts = { blue: 0, yellow: 13, green: 26, red: 39 };
const startCells = {
  "13-6": "blue",
  "6-0": "yellow",
  "0-8": "green",
  "8-14": "red",
};
const safeIndexes = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const surpriseIndexes = new Set([4, 10, 17, 23, 30, 36, 43, 49]);
const track = [
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0],
  [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7],
];
const lanes = {
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
  red: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  yellow: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
};
const yards = {
  blue: [[10, 0], [10, 1], [11, 0], [11, 1]],
  red: [[10, 10], [10, 11], [11, 10], [11, 11]],
  green: [[0, 10], [0, 11], [1, 10], [1, 11]],
  yellow: [[0, 0], [0, 1], [1, 0], [1, 1]],
};

const els = {
  loginView: document.querySelector("#loginView"),
  gameView: document.querySelector("#gameView"),
  loginForm: document.querySelector("#loginForm"),
  playerName: document.querySelector("#playerName"),
  board: document.querySelector("#board"),
  statusText: document.querySelector("#statusText"),
  turnLabel: document.querySelector("#turnLabel"),
  diceButton: document.querySelector("#diceButton"),
  diceFace: document.querySelector("#diceFace"),
  playersList: document.querySelector("#playersList"),
  moveLog: document.querySelector("#moveLog"),
  newGameButton: document.querySelector("#newGameButton"),
};

const state = {
  players: [],
  current: 0,
  dice: null,
  rolled: false,
  selectable: [],
  winner: null,
  log: [],
  botTimer: null,
};

els.loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(els.loginForm);
  startGame(String(formData.get("playerName") || "Player"), Number(formData.get("playerCount") || 2));
});

els.newGameButton.addEventListener("click", () => {
  clearTimeout(state.botTimer);
  state.game = null;
  els.gameView.hidden = true;
  els.loginView.hidden = false;
});

els.diceButton.addEventListener("click", rollDice);

function startGame(playerName, playerCount) {
  const cleanName = playerName.trim().slice(0, 18) || "Player";
  window.localStorage.setItem("lunoPlayerName", cleanName);
  state.players = colors.slice(0, playerCount).map((color, index) => ({
    id: color,
    name: index === 0 ? cleanName : botNames[index - 1],
    color,
    isHuman: index === 0,
    tokens: Array.from({ length: 4 }, (_, tokenIndex) => ({
      id: `${color}-${tokenIndex}`,
      progress: -1,
      complete: false,
    })),
  }));
  state.current = 0;
  state.dice = null;
  state.rolled = false;
  state.selectable = [];
  state.winner = null;
  state.log = [`${cleanName} joined as Red.`];
  els.loginView.hidden = true;
  els.gameView.hidden = false;
  render();
}

function rollDice() {
  const player = currentPlayer();
  if (!player || state.winner || state.rolled || !player.isHuman) return;

  state.dice = randomDice();
  state.rolled = true;
  state.selectable = movableTokens(player, state.dice);
  addLog(`${player.name} rolled ${state.dice}.`);

  if (!state.selectable.length) {
    addLog(`${player.name} has no legal move.`);
    render();
    setTimeout(endTurn, 650);
    return;
  }

  render();
}

function moveToken(tokenId) {
  const player = currentPlayer();
  if (!player || !state.selectable.includes(tokenId)) return;

  const token = player.tokens.find((candidate) => candidate.id === tokenId);
  applyMove(player, token, state.dice);
  afterMove(player);
}

function applyMove(player, token, steps) {
  if (token.progress === -1) {
    token.progress = 0;
    addLog(`${player.name} entered a token.`);
  } else {
    token.progress += steps;
    if (token.progress === 57) {
      token.complete = true;
      addLog(`${player.name} reached the center.`);
    } else {
      addLog(`${player.name} moved ${steps} spaces.`);
    }
  }

  captureAt(player, token);
}

function afterMove(player) {
  const finished = player.tokens.every((token) => token.complete);
  if (finished) {
    state.winner = player.id;
    state.statusText.textContent = `${player.name} wins the game.`;
    addLog(`${player.name} wins.`);
  } else if (state.dice === 6) {
    state.rolled = false;
    state.dice = null;
    state.selectable = [];
    addLog(`${player.name} gets another turn.`);
  } else {
    advanceTurn();
  }
  render();
  maybeRunBot();
}

function endTurn() {
  advanceTurn();
  render();
  maybeRunBot();
}

function advanceTurn() {
  state.current = (state.current + 1) % state.players.length;
  state.dice = null;
  state.rolled = false;
  state.selectable = [];
}

function maybeRunBot() {
  clearTimeout(state.botTimer);
  const player = currentPlayer();
  if (!player || player.isHuman || state.winner) return;

  state.botTimer = setTimeout(() => {
    state.dice = randomDice();
    state.rolled = true;
    const movable = movableTokens(player, state.dice);
    addLog(`${player.name} rolled ${state.dice}.`);

    if (!movable.length) {
      addLog(`${player.name} has no legal move.`);
      render();
      state.botTimer = setTimeout(endTurn, 650);
      return;
    }

    const token = chooseBotToken(player, movable);
    applyMove(player, token, state.dice);
    afterMove(player);
  }, 850);
}

function chooseBotToken(player, movable) {
  const candidates = movable.map((id) => player.tokens.find((token) => token.id === id));
  return candidates.find((token) => token.progress >= 51) || candidates.find((token) => token.progress === -1) || candidates[0];
}

function movableTokens(player, dice) {
  return player.tokens
    .filter((token) => {
      if (token.complete) return false;
      if (token.progress === -1) return dice === 6;
      return token.progress + dice <= 57;
    })
    .map((token) => token.id);
}

function captureAt(player, token) {
  const position = tokenPosition(player, token);
  if (!position || position.kind !== "track" || safeIndexes.has(position.index)) return;

  for (const opponent of state.players) {
    if (opponent.id === player.id) continue;
    for (const enemy of opponent.tokens) {
      const enemyPosition = tokenPosition(opponent, enemy);
      if (enemyPosition?.kind === "track" && enemyPosition.index === position.index) {
        enemy.progress = -1;
        enemy.complete = false;
        addLog(`${player.name} captured ${opponent.name}.`);
      }
    }
  }
}

function tokenPosition(player, token) {
  if (token.complete) return { kind: "center", coord: [7, 7] };
  if (token.progress < 0) return { kind: "yard", coord: yards[player.color][Number(token.id.split("-")[1])] };
  if (token.progress <= 51) {
    const index = (starts[player.color] + token.progress) % 52;
    return { kind: "track", index, coord: track[index] };
  }
  return { kind: "lane", coord: lanes[player.color][token.progress - 52] };
}

function render() {
  renderBoard();
  renderPanel();
  maybeRunBot();
}

function renderBoard() {
  els.board.innerHTML = "";
  const tokenGroups = groupTokensByCell();

  for (const [color, placement] of Object.entries({
    yellow: [1, 1],
    green: [1, 10],
    blue: [10, 1],
    red: [10, 10],
  })) {
    els.board.append(renderHomeArea(color, placement, tokenGroups));
  }
  els.board.append(renderCenter());

  for (let row = 0; row < 15; row += 1) {
    for (let col = 0; col < 15; col += 1) {
      if (isHomeBlock(row, col) || isCenterBlock(row, col)) continue;
      const cell = document.createElement("div");
      cell.className = cellClass(row, col);
      cell.style.gridRow = String(row + 1);
      cell.style.gridColumn = String(col + 1);
      cell.dataset.key = key(row, col);
      const tokens = tokenGroups.get(key(row, col)) || [];
      if (tokens.length) cell.append(renderTokenStack(tokens));
      els.board.append(cell);
    }
  }
}

function renderCenter() {
  const center = document.createElement("div");
  center.className = "center-cell";
  center.style.gridRow = "7 / span 3";
  center.style.gridColumn = "7 / span 3";
  center.innerHTML = `
    <span class="center-triangle center-top"></span>
    <span class="center-triangle center-right"></span>
    <span class="center-triangle center-bottom"></span>
    <span class="center-triangle center-left"></span>
  `;
  return center;
}

function renderHomeArea(color, [gridRow, gridCol], tokenGroups) {
  const home = document.createElement("div");
  home.className = `home-area home-${color}`;
  home.style.gridRow = `${gridRow} / span 6`;
  home.style.gridColumn = `${gridCol} / span 6`;

  const slots = document.createElement("div");
  slots.className = "home-slots";
  for (const coord of yards[color]) {
    const slot = document.createElement("div");
    slot.className = "home-slot";
    const tokens = tokenGroups.get(key(...coord)) || [];
    if (tokens.length) slot.append(renderTokenStack(tokens));
    slots.append(slot);
  }
  home.append(slots);
  return home;
}

function renderTokenStack(tokens) {
  const wrap = document.createElement("div");
  wrap.className = tokens.length > 1 ? "stack" : "";

  for (const item of tokens) {
    const button = document.createElement("button");
    button.className = "token";
    button.type = "button";
    button.dataset.color = item.player.color;
    button.ariaLabel = `${item.player.name} token`;
    button.innerHTML = `<img class="pawn-img" src="./assets/pawn-${item.player.color}.png" alt="" />`;
    if (state.selectable.includes(item.token.id) && item.player.isHuman) {
      button.classList.add("selectable");
      button.addEventListener("click", () => moveToken(item.token.id));
    } else {
      button.disabled = true;
    }
    wrap.append(button);
  }

  return wrap;
}

function renderPanel() {
  const player = currentPlayer();
  els.turnLabel.textContent = player ? `${player.name} (${colorNames[player.color]})` : "-";
  els.diceFace.textContent = state.dice || "?";
  els.diceButton.disabled = !player?.isHuman || state.rolled || Boolean(state.winner);

  if (state.winner) {
    const winner = state.players.find((candidate) => candidate.id === state.winner);
    els.statusText.textContent = `${winner.name} wins. Start a new game to play again.`;
  } else if (!player.isHuman) {
    els.statusText.textContent = `${player.name} is thinking.`;
  } else if (state.selectable.length) {
    els.statusText.textContent = "Choose one highlighted token to move.";
  } else if (state.rolled) {
    els.statusText.textContent = "No legal move. Passing turn.";
  } else {
    els.statusText.textContent = "Roll the dice.";
  }

  els.playersList.innerHTML = "";
  for (const participant of state.players) {
    const row = document.createElement("div");
    row.className = `player-row ${participant.id === player.id ? "active" : ""}`;
    row.innerHTML = `
      <span class="player-dot" style="background: var(--${participant.color})"></span>
      <div><strong>${participant.name}</strong><br><small>${colorNames[participant.color]}</small></div>
      <strong>${participant.tokens.filter((token) => token.complete).length}/4</strong>
    `;
    els.playersList.append(row);
  }

  els.moveLog.innerHTML = "";
  for (const entry of state.log.slice(-10).reverse()) {
    const item = document.createElement("li");
    item.textContent = entry;
    els.moveLog.append(item);
  }
}

function groupTokensByCell() {
  const groups = new Map();
  for (const player of state.players) {
    for (const token of player.tokens) {
      const position = tokenPosition(player, token);
      if (!position) continue;
      const cellKey = key(...position.coord);
      if (!groups.has(cellKey)) groups.set(cellKey, []);
      groups.get(cellKey).push({ player, token });
    }
  }
  return groups;
}

function cellClass(row, col) {
  const classes = ["cell"];
  const colorClass = pathColor(row, col);

  if (isPathCell(row, col)) classes.push(colorClass);
  else classes.push("blank");

  const trackIndex = track.findIndex(([trackRow, trackCol]) => trackRow === row && trackCol === col);
  if (safeIndexes.has(trackIndex)) classes.push("safe");
  if (surpriseIndexes.has(trackIndex) && !safeIndexes.has(trackIndex) && !colorClass) {
    classes.push("surprise");
  }
  return classes.join(" ");
}

function isHomeBlock(row, col) {
  return (row <= 5 && col <= 5)
    || (row <= 5 && col >= 9)
    || (row >= 9 && col <= 5)
    || (row >= 9 && col >= 9);
}

function isCenterBlock(row, col) {
  return row >= 6 && row <= 8 && col >= 6 && col <= 8;
}

function isPathCell(row, col) {
  return track.some(([trackRow, trackCol]) => trackRow === row && trackCol === col)
    || Object.values(lanes).flat().some(([laneRow, laneCol]) => laneRow === row && laneCol === col);
}

function pathColor(row, col) {
  for (const [color, coords] of Object.entries(lanes)) {
    if (coords.some(([laneRow, laneCol]) => laneRow === row && laneCol === col)) return `path-${color}`;
  }
  const startColor = startCells[key(row, col)];
  if (startColor) return `path-${startColor}`;
  return "";
}

function currentPlayer() {
  return state.players[state.current];
}

function randomDice() {
  return Math.floor(Math.random() * 6) + 1;
}

function addLog(message) {
  state.log.push(message);
}

function key(row, col) {
  return `${row}-${col}`;
}

els.playerName.value = window.localStorage.getItem("lunoPlayerName") || "Player";
