"use strict";

const assert = require("assert");
const { io: Client } = require("socket.io-client");
const { server, io, room } = require("../server");
const { createGame } = require("../shared/ludo-core");

function waitFor(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

(async () => {
  room.state = createGame();
  room.sockets.clear();

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;
  const red = Client(url, { transports: ["websocket"] });
  const blue = Client(url, { transports: ["websocket"] });
  const green = Client(url, { transports: ["websocket"] });
  const yellow = Client(url, { transports: ["websocket"] });

  try {
    await Promise.all([waitFor(red, "connect"), waitFor(blue, "connect"), waitFor(green, "connect"), waitFor(yellow, "connect")]);

    const redLogin = await emitAck(red, "auth:login", { username: "red", password: "red" });
    const blueLogin = await emitAck(blue, "auth:login", { username: "blue", password: "blue" });
    assert.strictEqual(redLogin.ok, true, "red should log into the shared room");
    assert.strictEqual(blueLogin.ok, true, "blue should log into the shared room");

    assert.deepStrictEqual(
      room.state.players.filter((player) => player.connected).map((player) => player.color).sort(),
      ["blue", "red"],
      "server should track both connected colors",
    );
    assert.deepStrictEqual(
      room.state.players.map((player) => player.color),
      ["blue", "yellow", "green", "red"],
      "shared room should follow Blue, Yellow, Green, Red order",
    );
    assert.strictEqual(room.state.players[room.state.current].color, "blue", "blue should have the first turn");

    const redBlockedRoll = await emitAck(red, "game:roll", {});
    assert.strictEqual(redBlockedRoll.ok, false, "red must not roll during blue's turn");

    room.state.players[room.state.current].entryMisses = 2;
    const blueRoll = await emitAck(blue, "game:roll", {});
    assert.strictEqual(blueRoll.ok, true, "blue should roll during blue's turn");
    assert.strictEqual(room.state.dice, 6, "entry assist should give blue a 6 after two missed entry rolls");
    const duplicateBlueRoll = await emitAck(blue, "game:roll", {});
    assert.strictEqual(duplicateBlueRoll.ok, false, "blue must not roll twice before moving");
    assert.ok(
      room.state.log.some((entry) => entry.startsWith("Blue rolled ")),
      "shared room should record blue's accepted dice roll",
    );

    room.config = null;
    room.state = createGame();
    room.sockets.clear();
    const greenManualLogin = await emitAck(green, "auth:login", {
      username: "green",
      password: "green",
      playWithBots: false,
      playerCount: 2,
    });
    const waitingRoll = await emitAck(green, "game:roll", {});
    const yellowManualLogin = await emitAck(yellow, "auth:login", {
      username: "yellow",
      password: "yellow",
      playWithBots: false,
      playerCount: 2,
    });
    const disabledBlueLogin = await emitAck(blue, "auth:login", {
      username: "blue",
      password: "blue",
      playWithBots: false,
      playerCount: 2,
    });
    const disabledRedLogin = await emitAck(red, "auth:login", {
      username: "red",
      password: "red",
      playWithBots: false,
      playerCount: 2,
    });
    assert.strictEqual(greenManualLogin.ok, true, "green should start a 2-player manual game");
    assert.strictEqual(waitingRoll.ok, false, "green cannot roll until the selected players join");
    assert.strictEqual(yellowManualLogin.ok, true, "yellow should join as the second manual player");
    assert.strictEqual(disabledBlueLogin.ok, false, "blue should be disabled after the 2-player manual game fills");
    assert.strictEqual(disabledRedLogin.ok, false, "red should be disabled after the 2-player manual game fills");
    assert.strictEqual(room.state.waitingForPlayers, false, "manual room should unlock once the selected player count joins");
    assert.deepStrictEqual(
      room.state.players.map((player) => player.color),
      ["green", "yellow"],
      "manual 2-player game should activate colors in login order",
    );

    room.sockets.clear();
    const blueFirstLogin = await emitAck(blue, "auth:login", {
      username: "blue",
      password: "blue",
      playWithBots: false,
      playerCount: 2,
    });
    assert.strictEqual(blueFirstLogin.ok, true, "blue should be able to start a fresh manual room after the old room empties");
    assert.strictEqual(room.state.waitingForPlayers, true, "fresh blue room should wait for the second selected player");
    assert.deepStrictEqual(
      room.state.players.map((player) => player.color),
      ["blue"],
      "fresh manual room should only activate the first login color until another user joins",
    );

    room.config = null;
    room.state = createGame();
    room.sockets.clear();
    const greenBotLogin = await emitAck(green, "auth:login", {
      username: "green",
      password: "green",
      playWithBots: true,
      playerCount: 3,
    });
    assert.strictEqual(greenBotLogin.ok, true, "green should start a bot game");
    assert.deepStrictEqual(
      room.state.players.map((player) => player.color),
      ["green", "red", "blue"],
      "bot game should start with the login color and continue clockwise",
    );
    assert.deepStrictEqual(
      room.state.players.map((player) => player.isHuman),
      [true, false, false],
      "only the logged-in color should be human in bot mode",
    );

    console.log("shared-room tests passed");
  } finally {
    clearTimeout(room.botTimer);
    red.close();
    blue.close();
    green.close();
    yellow.close();
    io.close();
    await new Promise((resolve) => server.close(resolve));
  }
})();
