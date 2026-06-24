const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

class MockElement {
  constructor() {
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.innerHTML = "";
    this.className = "";
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this.children = [];
    this.classList = {
      add: (...names) => {
        const current = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => current.add(name));
        this.className = Array.from(current).join(" ");
      },
      remove: (...names) => {
        const removeNames = new Set(names);
        this.className = this.className
          .split(/\s+/)
          .filter((name) => name && !removeNames.has(name))
          .join(" ");
      },
    };
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  click() {
    this.listeners.click?.({ preventDefault() {} });
  }

  focus() {}
  append(...children) {
    this.children.push(...children);
  }
  querySelector() { return new MockElement(); }
}

function loadGame() {
  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new MockElement());
      return elements.get(selector);
    },
    createElement() {
      return new MockElement();
    },
  };

  const context = {
    console,
    document,
    FormData: class {},
    window: { localStorage: { getItem() { return null; }, setItem() {} } },
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
  };
  vm.createContext(context);

  const source = fs.readFileSync("app.js", "utf8");
  vm.runInContext(`${source}
globalThis.__test = {
  state,
  track,
  safeIndexes,
  surpriseIndexes,
  movableTokens,
  tokenPosition,
  applyMove,
  afterMove,
  startGame,
  openRules,
  closeRules,
  render,
  renderBoard,
  renderPanel,
  renderHomeArea,
  renderTokenStack,
  pawnCounts,
  revealDiceRoll,
  revealSpecialCard,
  applySnakeLadderCard,
  applyUnoCard,
  cardMoveTarget,
  specialEffectText,
  drawSpecialCard,
  maybeRunBot,
  botTurnDelayMs,
  els,
};`, context);

  context.__test.context = context;
  return context.__test;
}

async function nextTick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

(async () => {
  const game = loadGame();

  game.startGame("Player", 3);
  game.openRules();
  assert.strictEqual(game.els.rulesOverlay.hidden, false, "rules should open in a popup");
  game.closeRules();
  assert.strictEqual(game.els.rulesOverlay.hidden, true, "rules popup should close");

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.state.players.map((participant) => participant.color))),
    ["red", "blue", "yellow"],
    "selected players should follow Red, Blue, Yellow, Green order",
  );
  assert.strictEqual(game.state.players[0].isHuman, true, "first selected color must be manual");
  assert.strictEqual(game.state.humanPlayerId, "red", "human player id should be the first selected color");
  assert.strictEqual(game.state.players[1].isHuman, true, "second selected color must be manual");
  assert.strictEqual(game.state.players[2].isHuman, true, "third selected color must be manual");
  assert.deepStrictEqual(
    Array.from(game.surpriseIndexes).sort((a, b) => a - b),
    [4, 10, 17, 23, 30, 36, 43, 49],
    "surprise boxes should use the fixed pattern",
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(
    game.pawnCounts({
      tokens: [
        { progress: -1, complete: false },
        { progress: -1, complete: false },
        { progress: -1, complete: false },
        { progress: 0, complete: false },
      ],
    }))),
    { home: 3, play: 1, done: 0 },
    "player panel should account for pawns in home and in play",
  );
  game.renderPanel();
  assert.strictEqual(game.els.diceButton.disabled, false, "human player must be allowed to click Roll");
  assert.strictEqual(game.els.statusText.textContent, "Your turn. Roll the dice.");

  game.state.current = 1;
  game.renderPanel();
  assert.strictEqual(game.els.diceButton.disabled, false, "every selected color should allow manual Roll");

  const originalSetTimeout = game.context.setTimeout;
  const scheduled = [];
  game.context.setTimeout = (handler, delay) => {
    scheduled.push({ handler, delay });
    return scheduled.length;
  };
  game.state.current = 0;
  game.render();
  assert.strictEqual(scheduled.length, 0, "rendering the human turn must not schedule bot rolling");

  game.state.current = 1;
  game.state.rolled = false;
  game.maybeRunBot();
  assert.strictEqual(scheduled.length, 0, "manual mode must not schedule bot rolling for any color");
  game.context.setTimeout = originalSetTimeout;

  game.state.current = 0;
  const redHome = game.renderHomeArea("red", [10, 10], new Map());
  const greenHome = game.renderHomeArea("green", [1, 10], new Map());
  assert.match(redHome.className, /active-home/, "current player's home should be highlighted");
  assert.doesNotMatch(greenHome.className, /active-home/, "inactive homes should not be highlighted");

  const diceReveal = game.revealDiceRoll(game.state.players[0], 4);
  await nextTick();
  assert.strictEqual(game.els.diceRollMessage.textContent, "Red threw 4");
  assert.strictEqual(game.els.diceOverlay.hidden, false, "dice popup should stay open before Close");
  game.els.diceCloseButton.click();
  await diceReveal;
  assert.strictEqual(game.els.diceOverlay.hidden, true, "dice popup should close only after Close");

  const tokenStack = game.renderTokenStack([{ player: game.state.players[0], token: { id: "red-3" } }]);
  assert.doesNotMatch(tokenStack.children[0].innerHTML, /token-number/);
  assert.match(tokenStack.children[0].innerHTML, /pawn-red\.png/);
  const stackedPawns = game.renderTokenStack([
    { player: game.state.players[0], token: { id: "red-0" } },
    { player: game.state.players[1], token: { id: "blue-0" } },
    { player: game.state.players[2], token: { id: "yellow-0" } },
  ]);
  assert.strictEqual(stackedPawns.dataset.count, "3", "stacked cells should expose pawn count for readable layout");

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.tokenPosition(
      { color: "red" },
      { id: "red-0", progress: 0, complete: false },
    ).coord)),
    [8, 13],
    "red progress 0 should be on the red start square",
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.tokenPosition(
      { color: "red" },
      { id: "red-0", progress: 1, complete: false },
    ).coord)),
    [8, 12],
    "red progress 1 should move left from the red start square",
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.tokenPosition(
      { color: "blue" },
      { id: "blue-0", progress: 0, complete: false },
    ).coord)),
    [13, 6],
    "blue progress 0 should be on the blue start square",
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.tokenPosition(
      { color: "blue" },
      { id: "blue-0", progress: 1, complete: false },
    ).coord)),
    [12, 6],
    "blue progress 1 should move forward from the blue start square",
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.tokenPosition(
      { color: "yellow" },
      { id: "yellow-0", progress: 0, complete: false },
    ).coord)),
    [6, 1],
    "yellow start X should be one box in from the outside edge",
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.tokenPosition(
      { color: "green" },
      { id: "green-0", progress: 0, complete: false },
    ).coord)),
    [1, 8],
    "green start X should be one box in from the outside edge",
  );
  assert.strictEqual(
    game.track.some(([row, col]) => row >= 6 && row <= 8 && col >= 6 && col <= 8),
    false,
    "main track should never enter the center triangle area",
  );

  game.state.players = [{
    id: "blue",
    name: "Blue",
    color: "blue",
    isHuman: false,
    tokens: [
      { id: "blue-0", progress: 5, complete: false },
      { id: "blue-1", progress: -1, complete: false },
      { id: "blue-2", progress: -1, complete: false },
      { id: "blue-3", progress: -1, complete: false },
    ],
  }];
  game.state.current = 0;
  game.renderBoard();
  const blueFifthCell = game.els.board.children.filter((child) => child.dataset?.key === "8-5").at(-1);
  assert.ok(blueFifthCell, "blue pawn on the 5th box from X should render outside the center triangle");
  assert.doesNotMatch(blueFifthCell.className, /center-token-cell/);
  assert.match(blueFifthCell.children[0].children[0].innerHTML, /pawn-blue\.png/);

  const player = {
    id: "blue",
    name: "Blue",
    color: "blue",
    isHuman: true,
    tokens: [
      { id: "blue-0", progress: -1, complete: false },
      { id: "blue-1", progress: -1, complete: false },
      { id: "blue-2", progress: -1, complete: false },
      { id: "blue-3", progress: -1, complete: false },
    ],
  };

  assert.deepStrictEqual(game.movableTokens(player, 5), [], "home pawns must not move without a 6");
  assert.deepStrictEqual(
    game.movableTokens(player, 6),
    ["blue-0", "blue-1", "blue-2", "blue-3"],
    "home pawns must move out on a 6",
  );

  player.tokens[0].progress = 0;
  assert.deepStrictEqual(
    game.movableTokens(player, 3),
    ["blue-0"],
    "after entering play, a normal roll can move only the active pawn",
  );
  assert.deepStrictEqual(
    game.movableTokens(player, 6),
    ["blue-0", "blue-1", "blue-2", "blue-3"],
    "rolling 6 can either move an active pawn or bring a home pawn out",
  );

  player.tokens[0].progress = 8;
  assert.deepStrictEqual(
    game.movableTokens(player, 2),
    ["blue-0"],
    "a pawn on an X safe square should still be movable on the next turn",
  );

  const diceAcrossSurprise = { id: "blue-0", progress: 3, complete: false };
  game.applyMove(player, diceAcrossSurprise, 2);
  assert.strictEqual(diceAcrossSurprise.progress, 5, "dice movement should count S as a regular box instead of skipping it");

  const diceAcrossSafe = { id: "blue-0", progress: 7, complete: false };
  game.applyMove(player, diceAcrossSafe, 2);
  assert.strictEqual(diceAcrossSafe.progress, 9, "dice movement should count X as a regular box instead of skipping it");

  const ladderToken = { id: "blue-0", progress: 4, complete: false };
  game.applySnakeLadderCard(player, ladderToken, { source: "Snake&Ladder", name: "Ladder", steps: 5 });
  assert.strictEqual(ladderToken.progress, 9, "Ladder 5 should move five boxes from the next box after S");
  assert.strictEqual(game.cardMoveTarget(4, 5), 9, "Ladder 5 should count the X safe box at progress 8 as one of the five boxes");
  assert.strictEqual(game.cardMoveTarget(4, 2), 6, "Ladder 2 should land two boxes after S, not count S as one");

  const snakeToken = { id: "blue-0", progress: 9, complete: false };
  game.applySnakeLadderCard(player, snakeToken, { source: "Snake&Ladder", name: "Snake", steps: 5 });
  assert.strictEqual(snakeToken.progress, 4, "Snake 5 should move five boxes back from the previous box before S");

  game.state.players = [player];
  game.state.current = 0;
  game.state.dice = 6;
  game.state.rolled = true;
  game.state.selectable = ["blue-0"];
  game.afterMove(player, {});
  assert.strictEqual(game.state.current, 0, "rolling 6 must keep the same player");
  assert.strictEqual(game.state.rolled, false, "rolling 6 must allow another dice throw");
  assert.strictEqual(game.state.dice, null, "dice must reset before the extra throw");

  const card = { source: "UNO", name: "Reverse", steps: null };
  const reveal = game.revealSpecialCard(player, card, game.specialEffectText(card));
  await nextTick();
  assert.strictEqual(game.els.specialName.textContent, "Blue hit on Surprise");
  assert.strictEqual(game.els.specialEffect.textContent, "Blue hit on Surprise.");
  assert.strictEqual(game.els.specialOkButton.textContent, "OK 1/3");
  assert.match(game.els.specialCard.className, /sparkling/, "surprise stage should show sparkle animation");

  game.els.specialOkButton.click();
  await nextTick();
  assert.strictEqual(game.els.specialName.textContent, "Blue has UNO");
  assert.strictEqual(game.els.specialOkButton.textContent, "OK 2/3");
  assert.doesNotMatch(game.els.specialCard.className, /sparkling/, "card type stage should stop the sparkle intro");

  game.els.specialOkButton.click();
  await nextTick();
  assert.strictEqual(game.els.specialName.textContent, "Reverse");
  assert.strictEqual(game.els.specialOkButton.textContent, "OK 3/3");

  game.els.specialOkButton.click();
  await reveal;
  assert.strictEqual(game.els.specialOverlay.hidden, true, "popup must close after final OK");

  const ladderCard = { source: "Snake&Ladder", name: "Ladder", steps: 6 };
  const ladderReveal = game.revealSpecialCard(player, ladderCard, game.specialEffectText(ladderCard));
  await nextTick();
  game.els.specialOkButton.click();
  await nextTick();
  assert.strictEqual(game.els.specialName.textContent, "Blue has Snake&Ladder");
  game.els.specialOkButton.click();
  await nextTick();
  assert.strictEqual(game.els.specialName.textContent, "Ladder 6");
  assert.strictEqual(game.els.specialEffect.textContent, "Move forward 6 boxes. X and S boxes count.");
  game.els.specialOkButton.click();
  await ladderReveal;

  console.log("game-rules tests passed");
})();
