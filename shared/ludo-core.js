"use strict";

const colors = ["red", "blue", "yellow", "green"];
const colorNames = { red: "Red", green: "Green", yellow: "Yellow", blue: "Blue" };
const starts = { blue: 0, yellow: 13, green: 26, red: 39 };
const safeIndexes = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const surpriseIndexes = new Set([4, 10, 17, 23, 30, 36, 43, 49]);
const maxSurpriseChain = 6;
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

function createGame() {
  return {
    players: colors.map((color) => ({
      id: color,
      name: colorNames[color],
      color,
      isHuman: true,
      connected: false,
      tokens: Array.from({ length: 4 }, (_, tokenIndex) => ({
        id: `${color}-${tokenIndex}`,
        progress: -1,
        complete: false,
      })),
    })),
    current: 0,
    dice: null,
    rolled: false,
    selectable: [],
    winner: null,
    log: ["Shared room ready. Login with a color to join."],
    specialNotice: "",
    resolvingSpecial: false,
  };
}

function authenticateColorLogin(username, password) {
  const normalizedUsername = String(username || "").trim().toLowerCase();
  const normalizedPassword = String(password || "").trim().toLowerCase();
  const ok = colors.includes(normalizedUsername) && normalizedUsername === normalizedPassword;
  return { ok, color: ok ? normalizedUsername : null };
}

function publicState(state) {
  return JSON.parse(JSON.stringify(state));
}

function currentPlayer(state) {
  return state.players[state.current];
}

function rollDice(state, color, random = Math.random) {
  const player = currentPlayer(state);
  if (!player || state.winner || state.rolled || state.resolvingSpecial || player.color !== color) {
    return { ok: false, error: "It is not your turn to roll." };
  }

  state.specialNotice = "";
  state.dice = randomDice(random);
  state.rolled = true;
  state.selectable = movableTokens(player, state.dice);
  addLog(state, `${player.name} rolled ${state.dice}.`);

  if (!state.selectable.length) {
    addLog(state, `${player.name} has no legal move.`);
    handleNoMoveAfterRoll(state, player);
  }

  return { ok: true };
}

async function moveToken(state, color, tokenId, hooks = {}) {
  const player = currentPlayer(state);
  if (!player || state.winner || state.resolvingSpecial || player.color !== color || !state.selectable.includes(tokenId)) {
    return { ok: false, error: "That pawn cannot move right now." };
  }

  const token = player.tokens.find((candidate) => candidate.id === tokenId);
  const previousProgress = token.progress;
  applyMove(state, player, token, state.dice);
  const special = await resolveSurprise(state, player, token, previousProgress, hooks);
  let captured = false;

  if (!special?.reversed) {
    captured = captureAt(state, player, token);
  }

  afterMove(state, player, { ...special, captured });
  return { ok: true };
}

function applyMove(state, player, token, steps, label = "moved") {
  if (token.progress === -1) {
    token.progress = 0;
    addLog(state, `${player.name} entered a token.`);
  } else {
    token.progress = clampProgress(token.progress + steps);
    if (token.progress === 57) {
      token.complete = true;
      addLog(state, `${player.name} reached the center.`);
    } else {
      token.complete = false;
      addLog(state, `${player.name} ${label} ${Math.abs(steps)} spaces.`);
    }
  }
}

function afterMove(state, player, special = {}) {
  const finished = player.tokens.every((token) => token.complete);
  if (finished) {
    state.winner = player.id;
    addLog(state, `${player.name} wins.`);
  } else if (special.turn === "previous") {
    advanceTurn(state, -1);
    addLog(state, "Turn moves back to the previous player.");
  } else if (special.skipNext) {
    const skipped = state.players[(state.current + 1) % state.players.length];
    advanceTurn(state, 2);
    addLog(state, `${skipped.name}'s turn was skipped.`);
  } else if (special.captured) {
    state.rolled = false;
    state.dice = null;
    state.selectable = [];
    addLog(state, `${player.name} captured a pawn and gets another throw.`);
  } else if (state.dice === 6) {
    state.rolled = false;
    state.dice = null;
    state.selectable = [];
    addLog(state, `${player.name} rolled 6 and gets another throw.`);
  } else {
    advanceTurn(state);
  }
}

function handleNoMoveAfterRoll(state, player) {
  if (state.winner) return;
  if (state.dice === 6) {
    state.rolled = false;
    state.dice = null;
    state.selectable = [];
    addLog(state, `${player.name} rolled 6 and gets another throw.`);
    return;
  }
  advanceTurn(state);
}

function advanceTurn(state, step = 1) {
  state.current = (state.current + step + state.players.length) % state.players.length;
  state.dice = null;
  state.rolled = false;
  state.selectable = [];
}

async function resolveSurprise(state, player, token, previousProgress, hooks = {}, depth = 0) {
  const position = tokenPosition(player, token);
  if (!position || position.kind !== "track" || !surpriseIndexes.has(position.index) || depth >= maxSurpriseChain) {
    return {};
  }

  const surpriseProgress = token.progress;
  const card = drawSpecialCard(hooks.random || Math.random);
  state.specialNotice = `Surprise: ${player.name} drew ${card.source} ${card.name}.`;
  state.resolvingSpecial = true;
  addLog(state, state.specialNotice);
  await hooks.onSpecial?.(player, card, specialEffectText(card));

  const result = card.source === "UNO"
    ? applyUnoCard(state, player, token, previousProgress, card.name)
    : applySnakeLadderCard(state, player, token, card);

  const nextPosition = tokenPosition(player, token);
  const landedOnNewSurprise = (
    nextPosition?.kind === "track" &&
    surpriseIndexes.has(nextPosition.index) &&
    token.progress !== surpriseProgress &&
    !token.complete
  );

  if (!result.reversed && !result.skipNext && landedOnNewSurprise) {
    const chained = await resolveSurprise(state, player, token, surpriseProgress, hooks, depth + 1);
    return { ...result, ...chained };
  }

  if (depth + 1 >= maxSurpriseChain && landedOnNewSurprise) {
    addLog(state, "Surprise chain limit reached.");
  }

  state.resolvingSpecial = false;
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

function drawSpecialCard(random = Math.random) {
  const source = random() < 0.5 ? "UNO" : "Snake&Ladder";
  const names = source === "UNO" ? ["Reverse", "+4", "Skip", "+2"] : ["Ladder", "Snake"];
  const name = names[Math.floor(random() * names.length)];
  return {
    source,
    name,
    steps: source === "UNO" ? null : randomDice(random),
  };
}

function applyUnoCard(state, player, token, previousProgress, name) {
  if (name === "Reverse") {
    token.progress = previousProgress;
    token.complete = previousProgress === 57;
    addLog(state, `UNO Reverse: ${player.name}'s dice move is undone.`);
    return { reversed: true, turn: "previous" };
  }
  if (name === "Skip") {
    addLog(state, "UNO Skip: the next player loses their turn.");
    return { skipNext: true };
  }
  const steps = name === "+4" ? 4 : 2;
  moveTokenByCard(state, player, token, steps, `UNO ${name}`);
  return {};
}

function applySnakeLadderCard(state, player, token, card) {
  const steps = card.steps;
  if (card.name === "Ladder") {
    moveTokenByCard(state, player, token, steps, "climbed a ladder");
    return {};
  }
  moveTokenByCard(state, player, token, -steps, "slid down a snake");
  return {};
}

function moveTokenByCard(state, player, token, steps, label) {
  if (token.complete || token.progress < 0) return;
  const nextProgress = cardMoveTarget(token.progress, steps);
  const moved = Math.abs(nextProgress - token.progress);
  token.progress = nextProgress;
  token.complete = token.progress === 57;
  if (token.complete) addLog(state, `${label}: ${player.name} reached the center.`);
  else if (steps >= 0) addLog(state, `${label}: ${player.name} moved forward ${moved}.`);
  else addLog(state, `${label}: ${player.name} moved back ${moved}.`);
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

function movableTokens(player, dice) {
  return player.tokens
    .filter((token) => {
      if (token.complete) return false;
      if (token.progress === -1) return dice === 6;
      return token.progress + dice <= 57;
    })
    .map((token) => token.id);
}

function captureAt(state, player, token) {
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
        addLog(state, `${player.name} captured ${opponent.name}.`);
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

function randomDice(random = Math.random) {
  return Math.floor(random() * 6) + 1;
}

function addLog(state, message) {
  state.log.push(message);
}

module.exports = {
  colors,
  colorNames,
  track,
  lanes,
  yards,
  starts,
  safeIndexes,
  surpriseIndexes,
  authenticateColorLogin,
  createGame,
  publicState,
  currentPlayer,
  rollDice,
  moveToken,
  movableTokens,
  tokenPosition,
  cardMoveTarget,
  specialEffectText,
};
