"use strict";

const colors = ["red", "blue", "yellow", "green"];
const colorNames = { red: "Red", green: "Green", yellow: "Yellow", blue: "Blue" };
const botNames = ["Mira", "Dev", "Asha"];
const botTurnDelayMs = 3000;
const starts = { blue: 0, yellow: 13, green: 26, red: 39 };
const startCells = {
  "13-6": "blue",
  "6-1": "yellow",
  "1-8": "green",
  "8-13": "red",
};
const safeIndexes = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const surpriseIndexes = new Set([4, 10, 17, 23, 30, 36, 43, 49]);
const track = [
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0], [6, 0],
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6],
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
  loginRulesButton: document.querySelector("#loginRulesButton"),
  gameRulesButton: document.querySelector("#gameRulesButton"),
  panelRulesButton: document.querySelector("#panelRulesButton"),
  rulesOverlay: document.querySelector("#rulesOverlay"),
  rulesCloseButton: document.querySelector("#rulesCloseButton"),
  board: document.querySelector("#board"),
  statusText: document.querySelector("#statusText"),
  turnLabel: document.querySelector("#turnLabel"),
  diceButton: document.querySelector("#diceButton"),
  diceFace: document.querySelector("#diceFace"),
  playersList: document.querySelector("#playersList"),
  moveLog: document.querySelector("#moveLog"),
  newGameButton: document.querySelector("#newGameButton"),
  specialOverlay: document.querySelector("#specialOverlay"),
  specialCard: document.querySelector("#specialCard"),
  specialSource: document.querySelector("#specialSource"),
  specialName: document.querySelector("#specialName"),
  specialEffect: document.querySelector("#specialEffect"),
  specialOkButton: document.querySelector("#specialOkButton"),
  diceOverlay: document.querySelector("#diceOverlay"),
  diceRollMessage: document.querySelector("#diceRollMessage"),
  diceCloseButton: document.querySelector("#diceCloseButton"),
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
  specialNotice: "",
  resolvingSpecial: false,
  humanPlayerId: null,
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
els.loginRulesButton.addEventListener("click", openRules);
els.gameRulesButton.addEventListener("click", openRules);
els.panelRulesButton.addEventListener("click", openRules);
els.rulesCloseButton.addEventListener("click", closeRules);

function openRules() {
  els.rulesOverlay.hidden = false;
  els.rulesCloseButton.focus();
}

function closeRules() {
  els.rulesOverlay.hidden = true;
}

function startGame(playerName, playerCount) {
  const cleanName = playerName.trim().slice(0, 18) || "Player";
  window.localStorage.setItem("lunoPlayerName", cleanName);
  state.players = colors.slice(0, playerCount).map((color, index) => ({
    id: color,
    name: index === 0 ? cleanName : colorNames[color],
    color,
    isHuman: true,
    tokens: Array.from({ length: 4 }, (_, tokenIndex) => ({
      id: `${color}-${tokenIndex}`,
      progress: -1,
      complete: false,
    })),
  }));
  state.current = 0;
  state.humanPlayerId = state.players[0].id;
  state.dice = null;
  state.rolled = false;
  state.selectable = [];
  state.winner = null;
  state.log = [`${cleanName} joined as ${colorNames[state.players[0].color]}. All selected colors are manual.`];
  state.specialNotice = "";
  state.resolvingSpecial = false;
  els.loginView.hidden = true;
  els.gameView.hidden = false;
  render();
}

async function rollDice() {
  const player = currentPlayer();
  if (!player || state.winner || state.rolled || !player.isHuman) return;

  state.specialNotice = "";
  state.dice = randomDice();
  state.rolled = true;
  state.selectable = movableTokens(player, state.dice);
  addLog(`${player.name} rolled ${state.dice}.`);
  render();
  await revealDiceRoll(player, state.dice);

  if (!state.selectable.length) {
    addLog(`${player.name} has no legal move.`);
    render();
    setTimeout(() => handleNoMoveAfterRoll(player), 650);
    return;
  }

  render();
}

async function moveToken(tokenId) {
  const player = currentPlayer();
  if (!player || state.resolvingSpecial || !state.selectable.includes(tokenId)) return;

  const token = player.tokens.find((candidate) => candidate.id === tokenId);
  await completeTokenMove(player, token, state.dice);
}

async function completeTokenMove(player, token, steps) {
  const previousProgress = token.progress;
  applyMove(player, token, steps);
  render();
  const special = await resolveSurprise(player, token, previousProgress);
  let captured = false;

  if (!special?.reversed) {
    captured = captureAt(player, token);
  }

  afterMove(player, { ...special, captured });
}

function applyMove(player, token, steps, label = "moved") {
  if (token.progress === -1) {
    token.progress = 0;
    addLog(`${player.name} entered a token.`);
  } else {
    token.progress = clampProgress(token.progress + steps);
    if (token.progress === 57) {
      token.complete = true;
      addLog(`${player.name} reached the center.`);
    } else {
      token.complete = false;
      addLog(`${player.name} ${label} ${Math.abs(steps)} spaces.`);
    }
  }
}

function afterMove(player, special = {}) {
  const finished = player.tokens.every((token) => token.complete);
  if (finished) {
    state.winner = player.id;
    state.statusText.textContent = `${player.name} wins the game.`;
    addLog(`${player.name} wins.`);
  } else if (special.turn === "previous") {
    advanceTurn(-1);
    addLog("Turn moves back to the previous player.");
  } else if (special.skipNext) {
    const skipped = state.players[(state.current + 1) % state.players.length];
    advanceTurn(2);
    addLog(`${skipped.name}'s turn was skipped.`);
  } else if (special.captured) {
    state.rolled = false;
    state.dice = null;
    state.selectable = [];
    addLog(`${player.name} captured a pawn and gets another throw.`);
  } else if (state.dice === 6) {
    state.rolled = false;
    state.dice = null;
    state.selectable = [];
    addLog(`${player.name} rolled 6 and gets another throw.`);
  } else {
    advanceTurn();
  }
  render();
  maybeRunBot();
}

function handleNoMoveAfterRoll(player) {
  if (state.winner) return;

  if (state.dice === 6) {
    state.rolled = false;
    state.dice = null;
    state.selectable = [];
    addLog(`${player.name} rolled 6 and gets another throw.`);
    render();
    maybeRunBot();
    return;
  }

  endTurn();
}

function endTurn() {
  advanceTurn();
  render();
  maybeRunBot();
}

function advanceTurn(step = 1) {
  state.current = (state.current + step + state.players.length) % state.players.length;
  state.dice = null;
  state.rolled = false;
  state.selectable = [];
}

async function resolveSurprise(player, token, previousProgress) {
  const position = tokenPosition(player, token);
  if (!position || position.kind !== "track" || !surpriseIndexes.has(position.index)) {
    return {};
  }

  const card = drawSpecialCard();
  state.specialNotice = `Surprise: ${player.name} drew ${card.source} ${card.name}.`;
  addLog(state.specialNotice);
  render();
  await revealSpecialCard(player, card, specialEffectText(card));

  if (card.source === "UNO") {
    return applyUnoCard(player, token, previousProgress, card.name);
  }

  return applySnakeLadderCard(player, token, card);
}

function specialEffectText(card) {
  if (card.source === "UNO") {
    if (card.name === "Reverse") return "Undo this dice move and send turn back.";
    if (card.name === "Skip") return "Skip the next player's turn.";
    return `Move forward ${card.name.slice(1)} spaces.`;
  }

  if (card.name === "Ladder") return `Move forward ${card.steps} boxes. X and S boxes count.`;
  return `Move backward ${card.steps} boxes. X and S boxes count.`;
}

async function revealSpecialCard(player, card, effectText) {
  const colorName = colorNames[player.color];

  state.resolvingSpecial = true;
  els.specialSource.textContent = "Surprise Box";
  els.specialName.textContent = `${colorName} hit on Surprise`;
  els.specialEffect.textContent = `${colorName} hit on Surprise.`;
  els.specialCard.dataset.source = "surprise";
  els.specialCard.classList.add("sparkling");
  els.specialOverlay.hidden = false;
  render();
  await waitForSpecialOk(1);

  els.specialCard.classList.remove("sparkling");
  els.specialSource.textContent = "Card Type";
  els.specialName.textContent = `${colorName} has ${card.source}`;
  els.specialEffect.textContent = "Press OK to reveal the card.";
  els.specialCard.dataset.source = card.source === "UNO" ? "uno" : "snake";
  await waitForSpecialOk(2);

  els.specialSource.textContent = card.source;
  els.specialName.textContent = card.steps ? `${card.name} ${card.steps}` : card.name;
  els.specialEffect.textContent = effectText;
  els.specialCard.dataset.source = card.source === "UNO" ? "uno" : "snake";
  await waitForSpecialOk(3);
  els.specialOverlay.hidden = true;
  state.resolvingSpecial = false;
  els.specialOkButton.textContent = "OK";
}

function waitForSpecialOk(step) {
  els.specialOkButton.textContent = `OK ${step}/3`;
  els.specialOkButton.disabled = false;
  els.specialOkButton.focus();
  return new Promise((resolve) => {
    els.specialOkButton.addEventListener("click", () => {
      els.specialOkButton.disabled = true;
      resolve();
    }, { once: true });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function drawSpecialCard() {
  const source = Math.random() < 0.5 ? "UNO" : "Snake&Ladder";
  const names = source === "UNO" ? ["Reverse", "+4", "Skip", "+2"] : ["Ladder", "Snake"];
  const name = names[Math.floor(Math.random() * names.length)];
  return {
    source,
    name,
    steps: source === "UNO" ? null : randomDice(),
  };
}

function applyUnoCard(player, token, previousProgress, name) {
  if (name === "Reverse") {
    token.progress = previousProgress;
    token.complete = previousProgress === 57;
    addLog(`UNO Reverse: ${player.name}'s dice move is undone.`);
    return { reversed: true, turn: "previous" };
  }

  if (name === "Skip") {
    addLog("UNO Skip: the next player loses their turn.");
    return { skipNext: true };
  }

  const steps = name === "+4" ? 4 : 2;
  moveTokenByCard(player, token, steps, `UNO ${name}`);
  return {};
}

function applySnakeLadderCard(player, token, card) {
  const steps = card.steps;
  if (card.name === "Ladder") {
    moveTokenByCard(player, token, steps, `climbed a ladder`);
    return {};
  }

  moveTokenByCard(player, token, -steps, `slid down a snake`);
  return {};
}

function moveTokenByCard(player, token, steps, label) {
  if (token.complete || token.progress < 0) return;

  const nextProgress = cardMoveTarget(token.progress, steps);
  const moved = Math.abs(nextProgress - token.progress);
  token.progress = nextProgress;
  token.complete = token.progress === 57;

  if (token.complete) {
    addLog(`${label}: ${player.name} reached the center.`);
  } else if (steps >= 0) {
    addLog(`${label}: ${player.name} moved forward ${moved}.`);
  } else {
    addLog(`${label}: ${player.name} moved back ${moved}.`);
  }
}

function cardMoveTarget(currentProgress, steps) {
  return clampCardProgress(currentProgress + steps);
}

function clampProgress(progress) {
  return Math.min(57, Math.max(-1, progress));
}

function clampCardProgress(progress) {
  return Math.min(57, Math.max(0, progress));
}

function maybeRunBot() {
  clearTimeout(state.botTimer);
}

function revealDiceRoll(player, dice) {
  els.diceRollMessage.textContent = `${colorNames[player.color]} threw ${dice}`;
  els.diceOverlay.hidden = false;
  els.diceCloseButton.disabled = false;
  els.diceCloseButton.focus();
  return new Promise((resolve) => {
    els.diceCloseButton.addEventListener("click", () => {
      els.diceCloseButton.disabled = true;
      els.diceOverlay.hidden = true;
      resolve();
    }, { once: true });
  });
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
  if (!position || position.kind !== "track" || safeIndexes.has(position.index)) return false;

  let captured = false;
  for (const opponent of state.players) {
    if (opponent.id === player.id) continue;
    for (const enemy of opponent.tokens) {
      const enemyPosition = tokenPosition(opponent, enemy);
      if (enemyPosition?.kind === "track" && enemyPosition.index === position.index) {
        enemy.progress = -1;
        enemy.complete = false;
        captured = true;
        addLog(`${player.name} captured ${opponent.name}.`);
      }
    }
  }
  return captured;
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
      const tokens = tokenGroups.get(key(row, col)) || [];
      if (isHomeBlock(row, col) || (isCenterBlock(row, col) && !tokens.length)) continue;
      const cell = document.createElement("div");
      cell.className = `${cellClass(row, col)}${isCenterBlock(row, col) ? " center-token-cell" : ""}`;
      cell.style.gridRow = String(row + 1);
      cell.style.gridColumn = String(col + 1);
      cell.dataset.key = key(row, col);
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
  const active = currentPlayer()?.color === color ? " active-home" : "";
  home.className = `home-area home-${color}${active}`;
  home.style.gridRow = `${gridRow} / span 6`;
  home.style.gridColumn = `${gridCol} / span 6`;

  const slots = document.createElement("div");
  slots.className = "home-slots";
  for (const coord of yards[color]) {
    const slot = document.createElement("div");
    slot.className = "home-slot";
    const tokens = tokenGroups.get(key(...coord)) || [];
    if (tokens.length) {
      slot.append(renderTokenStack(tokens));
    } else {
      slot.classList.add("empty-home-slot");
    }
    slots.append(slot);
  }
  home.append(slots);
  return home;
}

function renderTokenStack(tokens) {
  const wrap = document.createElement("div");
  wrap.className = tokens.length > 1 ? "stack" : "";
  wrap.dataset.count = String(tokens.length);

  for (const item of tokens) {
    const button = document.createElement("button");
    button.className = "token";
    button.type = "button";
    button.dataset.color = item.player.color;
    const tokenNumber = Number(item.token.id.split("-")[1]) + 1;
    button.ariaLabel = `${item.player.name} token ${tokenNumber}`;
    button.innerHTML = `<img class="pawn-img" src="./assets/pawn-${item.player.color}.png" alt="" />`;
    if (!state.resolvingSpecial && state.selectable.includes(item.token.id) && isHumanPlayer(item.player)) {
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
  els.diceButton.disabled = state.resolvingSpecial || !isHumanPlayer(player) || state.rolled || Boolean(state.winner);

  if (state.winner) {
    const winner = state.players.find((candidate) => candidate.id === state.winner);
    els.statusText.textContent = `${winner.name} wins. Start a new game to play again.`;
  } else if (state.resolvingSpecial) {
    els.statusText.textContent = "Revealing surprise card...";
  } else if (state.specialNotice) {
    els.statusText.textContent = state.specialNotice;
  } else if (state.selectable.length) {
    els.statusText.textContent = "Choose one highlighted token to move.";
  } else if (state.rolled) {
    els.statusText.textContent = "No legal move. Passing turn.";
  } else {
    els.statusText.textContent = "Your turn. Roll the dice.";
  }

  els.playersList.innerHTML = "";
  for (const participant of state.players) {
    const counts = pawnCounts(participant);
    const row = document.createElement("div");
    row.className = `player-row ${participant.id === player.id ? "active" : ""}`;
    row.innerHTML = `
      <span class="player-dot" style="background: var(--${participant.color})"></span>
      <div>
        <strong>${participant.name}</strong><br>
        <small>${colorNames[participant.color]}</small><br>
        <small>Home ${counts.home} · Play ${counts.play} · Done ${counts.done}</small>
      </div>
      <strong>${counts.done}/4</strong>
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

function pawnCounts(player) {
  return player.tokens.reduce((counts, token) => {
    if (token.complete) counts.done += 1;
    else if (token.progress < 0) counts.home += 1;
    else counts.play += 1;
    return counts;
  }, { home: 0, play: 0, done: 0 });
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

function isHumanPlayer(player) {
  return Boolean(player?.isHuman);
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
