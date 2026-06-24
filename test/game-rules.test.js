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
  authenticateColorLogin,
  orderedPlayerColors,
  startGame,
  openRules,
  closeRules,
  render,
  renderBoard,
  renderPanel,
  renderHomeArea,
  renderTokenStack,
  homePlacements,
  displayColorOrder,
  displayCoord,
  displayRotationSteps,
  centerTriangleColors,
  rollDice,
  entryAssistedDice,
  updateEntryMisses,
  needsEntryAssist,
  pawnCounts,
  revealSpecialCard,
  resolveSurprise,
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

function useControlledTimers(game) {
  const originalSetTimeout = game.context.setTimeout;
  const scheduled = [];
  game.context.setTimeout = (handler, delay) => {
    scheduled.push({ handler, delay });
    return scheduled.length;
  };
  return {
    runNext() {
      const next = scheduled.shift();
      assert.ok(next, "expected a scheduled timer");
      next.handler();
    },
    restore() {
      game.context.setTimeout = originalSetTimeout;
    },
  };
}

(async () => {
  const game = loadGame();

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.authenticateColorLogin("yellow", "yellow"))),
    { ok: true, color: "yellow" },
    "matching color credentials should log in as that color",
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.authenticateColorLogin("yellow", "blue"))),
    { ok: false, color: null },
    "different username and password colors should be rejected",
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.orderedPlayerColors(4, "yellow"))),
    ["yellow", "blue", "green", "red"],
    "assigned login color should become the first player",
  );

  game.startGame("Player", 3);
  game.openRules();
  assert.strictEqual(game.els.rulesOverlay.hidden, false, "rules should open in a popup");
  game.closeRules();
  assert.strictEqual(game.els.rulesOverlay.hidden, true, "rules popup should close");

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.state.players.map((participant) => participant.color))),
    ["blue", "yellow", "green"],
    "selected players should follow Blue, Yellow, Green, Red order",
  );
  assert.strictEqual(game.state.players[0].isHuman, true, "first selected color must be manual");
  assert.strictEqual(game.state.humanPlayerId, "blue", "human player id should be the first selected color");
  assert.strictEqual(game.state.players[1].isHuman, true, "second selected color must be manual");
  assert.strictEqual(game.state.players[2].isHuman, true, "third selected color must be manual");
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.displayColorOrder())),
    ["blue", "yellow", "green", "red"],
    "blue login should show Blue, Yellow, Green, Red clockwise from bottom-left",
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.homePlacements())),
    { blue: [10, 1], yellow: [1, 1], green: [1, 10], red: [10, 10] },
    "blue login should place blue bottom-left, yellow top-left, green top-right, red bottom-right",
  );
  assert.strictEqual(game.displayRotationSteps(), 0, "blue login should use the natural board orientation");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(game.displayCoord([13, 6]))), [13, 6], "blue display should not rotate blue start");
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.centerTriangleColors())),
    { top: "green", right: "red", bottom: "blue", left: "yellow" },
    "blue center triangle should use natural colors",
  );
  const blueLoggedInHome = game.renderHomeArea("blue", [10, 1], new Map());
  const redLoggedInHome = game.renderHomeArea("red", [10, 10], new Map());
  assert.ok(blueLoggedInHome.children.some((child) => child.className === "you-badge"), "logged-in color should show You badge");
  assert.strictEqual(redLoggedInHome.children.some((child) => child.className === "you-badge"), false, "other colors should not show You badge");
  assert.strictEqual(game.needsEntryAssist(game.state.players[0]), true, "all-home player should qualify for entry assist");
  game.state.players[0].entryMisses = 2;
  assert.strictEqual(game.entryAssistedDice(game.state.players[0]), 6, "third all-home entry attempt should become 6");
  game.updateEntryMisses(game.state.players[0], 6);
  assert.strictEqual(game.state.players[0].entryMisses, 0, "rolling 6 should reset entry misses");
  game.startGame("Yellow", 4, "yellow");
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.state.players.map((participant) => participant.color))),
    ["yellow", "blue", "green", "red"],
    "yellow login should assign Yellow as the active player color",
  );
  assert.strictEqual(game.state.humanPlayerId, "yellow", "human player id should match the login color");
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.displayColorOrder())),
    ["yellow", "green", "red", "blue"],
    "yellow login should show Yellow, Green, Red, Blue clockwise from bottom-left",
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.homePlacements())),
    { yellow: [10, 1], green: [1, 1], blue: [10, 10], red: [1, 10] },
    "yellow login should place yellow bottom-left and continue clockwise",
  );
  assert.strictEqual(game.displayRotationSteps(), 1, "yellow login should rotate the board once");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(game.displayCoord([6, 1]))), [13, 6], "yellow start should display at bottom-left start position");
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.centerTriangleColors())),
    { top: "red", right: "blue", bottom: "yellow", left: "green" },
    "yellow center triangle should rotate with the board",
  );
  game.startGame("Player", 3);
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
  const blueHome = game.renderHomeArea("blue", [10, 1], new Map());
  const greenHome = game.renderHomeArea("green", [1, 10], new Map());
  assert.match(blueHome.className, /active-home/, "current player's home should be highlighted");
  assert.doesNotMatch(greenHome.className, /active-home/, "inactive homes should not be highlighted");

  game.els.diceOverlay.hidden = true;
  game.context.Math = Object.create(Math);
  game.context.Math.random = () => 0.5;
  await game.rollDice();
  assert.strictEqual(game.state.dice, 4, "controlled roll should throw 4");
  assert.strictEqual(game.els.diceOverlay.hidden, true, "dice rolls should not open a popup");

  const tokenStack = game.renderTokenStack([{ player: game.state.players[0], token: { id: "blue-3" } }]);
  assert.doesNotMatch(tokenStack.children[0].innerHTML, /token-number/);
  assert.match(tokenStack.children[0].innerHTML, /pawn-blue\.png/);
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
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.tokenPosition(
      { color: "green" },
      { id: "green-0", progress: 57, complete: true },
    ).coord)),
    [6, 7],
    "green completed pawn should sit in the green center triangle",
  );
  const previousHumanPlayerId = game.state.humanPlayerId;
  game.state.humanPlayerId = "yellow";
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(game.displayCoord(game.tokenPosition(
      { color: "yellow" },
      { id: "yellow-0", progress: 57, complete: true },
    ).coord))),
    [8, 7],
    "yellow completed pawn should display in the bottom center triangle for yellow login",
  );
  game.state.humanPlayerId = previousHumanPlayerId;
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

  const chainedToken = { id: "blue-0", progress: 10, complete: false };
  const chainedTimers = useControlledTimers(game);
  const originalMath = game.context.Math;
  const randomValues = [
    0.8, 0.8, 0.99, // Snake&Ladder, Snake, 6 steps: progress 10 -> 4
    0.1, 0.6,       // UNO, Skip: second surprise should reveal after landing on S
  ];
  game.context.Math = Object.create(Math);
  game.context.Math.random = () => randomValues.shift() ?? 0.1;
  const chainedReveal = game.resolveSurprise(player, chainedToken, 16);
  await nextTick();
  assert.strictEqual(game.els.specialName.textContent, "Blue has Snake&Ladder");
  chainedTimers.runNext();
  await nextTick();
  assert.strictEqual(game.els.specialName.textContent, "Snake 6");
  chainedTimers.runNext();
  await nextTick();
  assert.strictEqual(chainedToken.progress, 4, "Snake 6 from one S should land on the previous S");
  assert.strictEqual(game.els.specialName.textContent, "Blue has UNO", "landing on a second S should trigger another surprise reveal");
  chainedTimers.runNext();
  await nextTick();
  assert.strictEqual(game.els.specialName.textContent, "Skip");
  chainedTimers.runNext();
  await chainedReveal;
  chainedTimers.restore();
  game.context.Math = originalMath;

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
  const specialTimers = useControlledTimers(game);
  const reveal = game.revealSpecialCard(player, card, game.specialEffectText(card));
  await nextTick();
  assert.strictEqual(game.els.specialName.textContent, "Blue has UNO");
  assert.strictEqual(game.els.specialEffect.textContent, "Revealing the card.");
  assert.strictEqual(game.els.specialOkButton.hidden, true, "surprise reveal should not show OK buttons");
  assert.match(game.els.specialCard.className, /sparkling/, "card type stage should show sparkle animation");

  specialTimers.runNext();
  await nextTick();
  assert.strictEqual(game.els.specialName.textContent, "Reverse");
  assert.doesNotMatch(game.els.specialCard.className, /sparkling/, "card detail stage should stop the sparkle intro");

  specialTimers.runNext();
  await reveal;
  specialTimers.restore();
  assert.strictEqual(game.els.specialOverlay.hidden, true, "surprise reveal should close after the final delay");

  const ladderCard = { source: "Snake&Ladder", name: "Ladder", steps: 6 };
  const ladderTimers = useControlledTimers(game);
  const ladderReveal = game.revealSpecialCard(player, ladderCard, game.specialEffectText(ladderCard));
  await nextTick();
  assert.strictEqual(game.els.specialName.textContent, "Blue has Snake&Ladder");
  ladderTimers.runNext();
  await nextTick();
  assert.strictEqual(game.els.specialName.textContent, "Ladder 6");
  assert.strictEqual(game.els.specialEffect.textContent, "Move forward 6 boxes. X and S boxes count.");
  ladderTimers.runNext();
  await ladderReveal;
  ladderTimers.restore();

  console.log("game-rules tests passed");
})();
