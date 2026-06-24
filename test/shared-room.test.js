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

  try {
    await Promise.all([waitFor(red, "connect"), waitFor(blue, "connect")]);

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

    const blueRoll = await emitAck(blue, "game:roll", {});
    assert.strictEqual(blueRoll.ok, true, "blue should roll during blue's turn");
    assert.ok(
      room.state.log.some((entry) => entry.startsWith("Blue rolled ")),
      "shared room should record blue's accepted dice roll",
    );

    console.log("shared-room tests passed");
  } finally {
    red.close();
    blue.close();
    io.close();
    await new Promise((resolve) => server.close(resolve));
  }
})();
