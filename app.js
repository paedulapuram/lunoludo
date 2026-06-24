"use strict";

const colors = ["blue", "yellow", "green", "red"];
const colorNames = { red: "Red", green: "Green", yellow: "Yellow", blue: "Blue" };
const botNames = ["Mira", "Dev", "Asha"];
const botTurnDelayMs = 3000;
const revealStepDelayMs = 2000;
const maxSurpriseChain = 6;
const lastTrackProgress = 51;
const firstLaneProgress = 52;
const completedProgress = 57;
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
const centerTargets = {
  blue: [8, 7],
  yellow: [7, 6],
  green: [6, 7],
  red: [7, 8],
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
  username: document.querySelector("#username"),
  password: document.querySelector("#password"),
  playWithBots: document.querySelector("#playWithBots"),
  playerCount: document.querySelector("#playerCount"),
  loginError: document.querySelector("#loginError"),
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
const socket = typeof io === "function" ? io() : null;
let onlineColor = null;
let onlineLoginOptions = {};
let rollPending = false;
let movePending = false;

if (socket) {
  socket.on("connect", () => {
    if (onlineColor) reconnectOnlineColor();
    render();
  });

  socket.on("disconnect", () => {
    rollPending = false;
    movePending = false;
    if (onlineColor) {
      addLog("Connection lost. Reconnecting to the shared room...");
      render();
    }
  });

  socket.on("room:state", (nextState) => {
    rollPending = false;
    movePending = false;
    syncState(nextState);
    if (!els.loginView.hidden) return;
    render();
  });

  socket.on("room:special", async (card) => {
    const player = state.players.find((candidate) => candidate.color === card.color) || { color: card.color };
    await revealSpecialCard(player, card, card.effectText);
  });
}

els.loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(els.loginForm);
  const username = String(formData.get("username") || "");
  const password = String(formData.get("password") || "");
  const playWithBots = formData.get("playWithBots") === "on";
  const playerCount = Number(formData.get("playerCount") || 4);
  const login = authenticateColorLogin(username, password);

  if (!login.ok) {
    els.loginError.hidden = false;
    els.password.value = "";
    els.password.focus();
    return;
  }

  els.loginError.hidden = true;
  if (socket) {
    loginOnlineColor(login.color, { username, password, playWithBots, playerCount, showGame: true });
    return;
  }
  startGame(colorNames[login.color], playerCount, login.color, playWithBots);
});

function loginOnlineColor(color, {
  username = color,
  password = color,
  playWithBots = onlineLoginOptions.playWithBots || false,
  playerCount = onlineLoginOptions.playerCount || 4,
  showGame = false,
} = {}) {
  onlineLoginOptions = { playWithBots, playerCount };
  socket.emit("auth:login", { username, password, playWithBots, playerCount }, (response) => {
      if (!response?.ok) {
        els.loginError.textContent = response?.error || "Login failed.";
        els.loginError.hidden = false;
        els.password.value = "";
        els.password.focus();
        return;
      }
      onlineColor = response.color;
      state.humanPlayerId = response.color;
      window.localStorage.setItem("lunoLoginColor", response.color);
      syncState(response.state);
      if (showGame) {
        els.loginView.hidden = true;
        els.gameView.hidden = false;
      }
      render();
    });
}

function reconnectOnlineColor() {
  loginOnlineColor(onlineColor, onlineLoginOptions);
}

els.newGameButton.addEventListener("click", () => {
  if (socket && onlineColor) {
    socket.emit("game:reset");
    return;
  }
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

function authenticateColorLogin(username, password) {
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedPassword = password.trim().toLowerCase();
  const ok = colors.includes(normalizedUsername) && normalizedUsername === normalizedPassword;
  return { ok, color: ok ? normalizedUsername : null };
}

function orderedPlayerColors(playerCount, assignedColor) {
  const count = Math.max(2, Math.min(colors.length, Number(playerCount) || colors.length));
  const startIndex = colors.includes(assignedColor) ? colors.indexOf(assignedColor) : 0;
  const ordered = [...colors.slice(startIndex), ...colors.slice(0, startIndex)];
  return ordered.slice(0, count);
}

function startGame(playerName, playerCount, assignedColor = null, playWithBots = false) {
  const cleanName = playerName.trim().slice(0, 18) || "Player";
  const playerColors = orderedPlayerColors(playerCount, assignedColor);
  window.localStorage.setItem("lunoPlayerName", cleanName);
  window.localStorage.setItem("lunoLoginColor", assignedColor || playerColors[0]);
  state.players = playerColors.map((color, index) => ({
    id: color,
    name: index === 0 ? cleanName : colorNames[color],
    color,
    isHuman: !playWithBots || index === 0,
    entryMisses: 0,
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
  state.log = [`${cleanName} logged in as ${colorNames[state.players[0].color]}. All colors are manual.`];
  state.specialNotice = "";
  state.resolvingSpecial = false;
  els.loginView.hidden = true;
  els.gameView.hidden = false;
  render();
}

async function rollDice() {
  const player = currentPlayer();
  if (!player || rollPending || state.winner || state.rolled || !player.isHuman) return;

  if (socket && onlineColor) {
    if (!socket.connected) {
      addLog("Still reconnecting. Try Roll again in a moment.");
      render();
      return;
    }
    rollPending = true;
    render();
    socket.emit("game:roll", {}, (response) => {
      rollPending = false;
      if (!response?.ok) {
        addLog(response?.error || "Roll was rejected.");
      }
      render();
    });
    return;
  }

  state.specialNotice = "";
  state.dice = entryAssistedDice(player);
  state.rolled = true;
  state.selectable = movableTokens(player, state.dice);
  updateEntryMisses(player, state.dice);
  addLog(`${player.name} rolled ${state.dice}.`);
  render();

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
  if (!player || movePending || state.resolvingSpecial || !state.selectable.includes(tokenId)) return;

  if (socket && onlineColor) {
    if (!socket.connected) {
      addLog("Still reconnecting. Try moving again in a moment.");
      render();
      return;
    }
    movePending = true;
    render();
    socket.emit("game:move", { tokenId }, (response) => {
      movePending = false;
      if (!response?.ok) {
        addLog(response?.error || "Move was rejected.");
      }
      render();
    });
    return;
  }

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
    if (token.progress === completedProgress) {
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

async function resolveSurprise(player, token, previousProgress, depth = 0) {
  const position = tokenPosition(player, token);
  if (!position || position.kind !== "track" || !surpriseIndexes.has(position.index) || depth >= maxSurpriseChain) {
    return {};
  }

  const surpriseProgress = token.progress;
  const card = drawSpecialCard();
  state.specialNotice = `Surprise: ${player.name} drew ${card.source} ${card.name}.`;
  addLog(state.specialNotice);
  render();
  await revealSpecialCard(player, card, specialEffectText(card));

  const result = card.source === "UNO"
    ? applyUnoCard(player, token, previousProgress, card.name)
    : applySnakeLadderCard(player, token, card);
  render();

  const nextPosition = tokenPosition(player, token);
  const landedOnNewSurprise = (
    nextPosition?.kind === "track" &&
    surpriseIndexes.has(nextPosition.index) &&
    token.progress !== surpriseProgress &&
    !token.complete
  );

  if (!result.reversed && !result.skipNext && landedOnNewSurprise) {
    const chained = await resolveSurprise(player, token, surpriseProgress, depth + 1);
    return { ...result, ...chained };
  }

  if (depth + 1 >= maxSurpriseChain && landedOnNewSurprise) {
    addLog("Surprise chain limit reached.");
  }

  return result;
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
  els.specialSource.textContent = "Card Type";
  els.specialName.textContent = `${colorName} has ${card.source}`;
  els.specialEffect.textContent = "Revealing the card.";
  els.specialCard.dataset.source = card.source === "UNO" ? "uno" : "snake";
  els.specialCard.classList.add("sparkling");
  els.specialOverlay.hidden = false;
  els.specialOkButton.hidden = true;
  els.specialOkButton.disabled = true;
  render();
  await wait(revealStepDelayMs);

  els.specialCard.classList.remove("sparkling");
  els.specialSource.textContent = card.source;
  els.specialName.textContent = card.steps ? `${card.name} ${card.steps}` : card.name;
  els.specialEffect.textContent = effectText;
  els.specialCard.dataset.source = card.source === "UNO" ? "uno" : "snake";
  await wait(revealStepDelayMs);
  els.specialOverlay.hidden = true;
  state.resolvingSpecial = false;
  els.specialOkButton.hidden = false;
  els.specialOkButton.textContent = "OK";
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
    token.complete = previousProgress === completedProgress;
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
  token.complete = token.progress === completedProgress;

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
  return Math.min(completedProgress, Math.max(-1, progress));
}

function clampCardProgress(progress) {
  return Math.min(completedProgress, Math.max(0, progress));
}

function maybeRunBot() {
  clearTimeout(state.botTimer);
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
      return token.progress + dice <= completedProgress;
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
  if (token.complete) return { kind: "center", coord: centerTargets[player.color] };
  if (token.progress < 0) return { kind: "yard", coord: yards[player.color][Number(token.id.split("-")[1])] };
  if (token.progress <= lastTrackProgress) {
    const index = (starts[player.color] + token.progress) % 52;
    return { kind: "track", index, coord: track[index] };
  }
  return { kind: "lane", coord: lanes[player.color][token.progress - firstLaneProgress] };
}

function render() {
  renderBoard();
  renderPanel();
}

function renderBoard() {
  els.board.innerHTML = "";
  const tokenGroups = groupTokensByCell();

  for (const [color, placement] of Object.entries(homePlacements())) {
    els.board.append(renderHomeArea(color, placement, tokenGroups));
  }
  els.board.append(renderCenter());

  for (let row = 0; row < 15; row += 1) {
    for (let col = 0; col < 15; col += 1) {
      const display = displayCoord([row, col]);
      const tokens = tokenGroups.get(key(...display)) || [];
      if (isHomeBlock(row, col) || (isCenterBlock(row, col) && !tokens.length)) continue;
      const cell = document.createElement("div");
      cell.className = `${cellClass(row, col)}${isCenterBlock(row, col) ? " center-token-cell" : ""}`;
      cell.style.gridRow = String(display[0] + 1);
      cell.style.gridColumn = String(display[1] + 1);
      cell.dataset.key = key(...display);
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
  const triangles = centerTriangleColors();
  center.innerHTML = `
    <span class="center-triangle center-top" style="--triangle-color: var(--${triangles.top})"></span>
    <span class="center-triangle center-right" style="--triangle-color: var(--${triangles.right})"></span>
    <span class="center-triangle center-bottom" style="--triangle-color: var(--${triangles.bottom})"></span>
    <span class="center-triangle center-left" style="--triangle-color: var(--${triangles.left})"></span>
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
    const tokens = tokenGroups.get(key(...displayCoord(coord))) || [];
    if (tokens.length) {
      slot.append(renderTokenStack(tokens));
    } else {
      slot.classList.add("empty-home-slot");
    }
    slots.append(slot);
  }
  home.append(slots);
  if (color === loginColor()) {
    const badge = document.createElement("span");
    badge.className = "you-badge";
    badge.textContent = "You";
    home.append(badge);
  }
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
    if (!movePending && !state.resolvingSpecial && state.selectable.includes(item.token.id) && isHumanPlayer(item.player)) {
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
  const onlineDisconnected = Boolean(socket && onlineColor && !socket.connected);
  els.diceButton.disabled =
    onlineDisconnected || rollPending || state.resolvingSpecial || !isHumanPlayer(player) || state.rolled || Boolean(state.winner);

  if (state.winner) {
    const winner = state.players.find((candidate) => candidate.id === state.winner);
    els.statusText.textContent = `${winner.name} wins. Start a new game to play again.`;
  } else if (onlineDisconnected) {
    els.statusText.textContent = "Reconnecting to the shared room...";
  } else if (rollPending) {
    els.statusText.textContent = "Rolling dice...";
  } else if (movePending) {
    els.statusText.textContent = "Moving pawn...";
  } else if (state.resolvingSpecial) {
    els.statusText.textContent = "Revealing surprise card...";
  } else if (state.specialNotice) {
    els.statusText.textContent = state.specialNotice;
  } else if (state.selectable.length) {
    els.statusText.textContent = isHumanPlayer(player)
      ? "Choose one highlighted token to move."
      : `Waiting for ${player.name} to move.`;
  } else if (state.rolled) {
    els.statusText.textContent = isHumanPlayer(player)
      ? "No legal move. Passing turn."
      : `Waiting for ${player.name}.`;
  } else if (socket && onlineColor && !isHumanPlayer(player)) {
    els.statusText.textContent = `Waiting for ${player.name} to roll.`;
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
        <small>${colorNames[participant.color]}${socket && participant.connected ? " · Online" : ""}</small><br>
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
      const cellKey = key(...displayCoord(position.coord));
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

function homePlacements() {
  const baseHomes = {
    yellow: [1, 1],
    green: [1, 10],
    blue: [10, 1],
    red: [10, 10],
  };
  return Object.fromEntries(
    Object.entries(baseHomes).map(([color, placement]) => [color, displayHomePlacement(placement)]),
  );
}

function displayColorOrder() {
  const focusColor = loginColor() || colors[0];
  const startIndex = colors.includes(focusColor) ? colors.indexOf(focusColor) : 0;
  return [...colors.slice(startIndex), ...colors.slice(0, startIndex)];
}

function centerTriangleColors() {
  const base = [
    { side: "top", coord: [6, 7], color: "green" },
    { side: "right", coord: [7, 8], color: "red" },
    { side: "bottom", coord: [8, 7], color: "blue" },
    { side: "left", coord: [7, 6], color: "yellow" },
  ];
  const sideByCoord = {
    "6-7": "top",
    "7-8": "right",
    "8-7": "bottom",
    "7-6": "left",
  };

  return base.reduce((triangles, item) => {
    triangles[sideByCoord[key(...displayCoord(item.coord))]] = item.color;
    return triangles;
  }, {});
}

function loginColor() {
  return onlineColor || state.humanPlayerId || null;
}

function displayHomePlacement([gridRow, gridCol]) {
  const top = gridRow - 1;
  const left = gridCol - 1;
  const corners = [
    displayCoord([top, left]),
    displayCoord([top + 5, left]),
    displayCoord([top, left + 5]),
    displayCoord([top + 5, left + 5]),
  ];
  return [
    Math.min(...corners.map(([row]) => row)) + 1,
    Math.min(...corners.map(([, col]) => col)) + 1,
  ];
}

function displayCoord([row, col]) {
  let next = [row, col];
  for (let index = 0; index < displayRotationSteps(); index += 1) {
    next = [14 - next[1], next[0]];
  }
  return next;
}

function displayRotationSteps() {
  const focusColor = loginColor() || colors[0];
  return colors.includes(focusColor) ? colors.indexOf(focusColor) : 0;
}

function isHumanPlayer(player) {
  if (!player?.isHuman) return false;
  if (socket && onlineColor) return player.color === onlineColor;
  return true;
}

function syncState(nextState) {
  if (!nextState) return;
  state.players = nextState.players || [];
  state.current = nextState.current || 0;
  state.dice = nextState.dice;
  state.rolled = Boolean(nextState.rolled);
  state.selectable = nextState.selectable || [];
  state.winner = nextState.winner;
  state.log = nextState.log || [];
  state.specialNotice = nextState.specialNotice || "";
  state.resolvingSpecial = Boolean(nextState.resolvingSpecial);
  state.humanPlayerId = onlineColor || state.humanPlayerId;
}

function randomDice() {
  return Math.floor(Math.random() * 6) + 1;
}

function entryAssistedDice(player) {
  if (needsEntryAssist(player) && player.entryMisses >= 2) return 6;
  return randomDice();
}

function updateEntryMisses(player, dice) {
  if (!needsEntryAssist(player) || dice === 6) {
    player.entryMisses = 0;
    return;
  }
  player.entryMisses = (player.entryMisses || 0) + 1;
}

function needsEntryAssist(player) {
  return player.tokens.every((token) => !token.complete && token.progress < 0);
}

function addLog(message) {
  state.log.push(message);
}

function key(row, col) {
  return `${row}-${col}`;
}

async function runChainedSurpriseBrowserDemo() {
  startGame("Demo", 2);
  const player = state.players.find((candidate) => candidate.color === "blue") || state.players[0];
  state.players = [player];
  state.current = 0;
  state.dice = 6;
  state.rolled = true;
  const token = player.tokens[0];
  player.tokens.forEach((candidate, index) => {
    candidate.progress = index === 0 ? 10 : -1;
    candidate.complete = false;
  });

  const originalRandom = Math.random;
  const randomValues = [
    0.8, 0.8, 0.99, // Snake&Ladder, Snake, 6 steps: progress 10 -> 4
    0.1, 0.6,       // UNO, Skip: second surprise reveal
  ];
  const stages = [];
  const stageObserver = new MutationObserver(() => {
    const name = els.specialName.textContent.trim();
    const effect = els.specialEffect.textContent.trim();
    if (name && stages.at(-1)?.name !== name) {
      stages.push({ name, effect, progress: token.progress });
    }
  });

  Math.random = () => randomValues.shift() ?? 0.1;
  stageObserver.observe(els.specialCard, { childList: true, subtree: true, characterData: true });
  try {
    await resolveSurprise(player, token, 16);
  } finally {
    stageObserver.disconnect();
    Math.random = originalRandom;
  }

  render();
  return {
    finalProgress: token.progress,
    finalPosition: tokenPosition(player, token),
    stages,
    triggeredSecondSurprise: stages.some((stage) => stage.name === "Blue has UNO"),
  };
}

if (typeof location !== "undefined" && (location.hostname === "127.0.0.1" || location.hostname === "localhost")) {
  window.__lunoDemo = { runChainedSurpriseBrowserDemo };

  if (new URLSearchParams(location.search).get("demo") === "chained-surprise") {
    window.addEventListener("load", async () => {
      const result = await runChainedSurpriseBrowserDemo();
      const output = document.createElement("pre");
      output.id = "demoResult";
      output.hidden = true;
      output.textContent = JSON.stringify(result);
      document.body.append(output);
    });
  }
}

els.username.value = "";
