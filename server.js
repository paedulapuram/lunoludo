"use strict";

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const {
  authenticateColorLogin,
  colorNames,
  createGame,
  moveToken,
  publicState,
  rollDice,
  specialEffectText,
} = require("./shared/ludo-core");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 4173;
const revealStepDelayMs = 2000;

const room = {
  state: createGame(),
  sockets: new Map(),
};

app.use("/assets", express.static(path.join(__dirname, "assets")));
app.get("/app.js", (_request, response) => response.sendFile(path.join(__dirname, "app.js")));
app.get("/styles.css", (_request, response) => response.sendFile(path.join(__dirname, "styles.css")));

app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

io.on("connection", (socket) => {
  socket.emit("room:state", publicState(room.state));

  socket.on("auth:login", ({ username, password } = {}, ack = () => {}) => {
    const login = authenticateColorLogin(username, password);
    if (!login.ok) {
      ack({ ok: false, error: "Use matching color credentials: red/red, blue/blue, yellow/yellow, or green/green." });
      return;
    }

    socket.data.color = login.color;
    room.sockets.set(socket.id, login.color);
    const player = room.state.players.find((candidate) => candidate.color === login.color);
    player.connected = true;
    player.name = colorNames[login.color];
    room.state.log.push(`${player.name} joined the shared room.`);
    ack({ ok: true, color: login.color, state: publicState(room.state) });
    broadcastState();
  });

  socket.on("game:reset", () => {
    room.state = createGame();
    for (const color of room.sockets.values()) {
      const player = room.state.players.find((candidate) => candidate.color === color);
      if (player) player.connected = true;
    }
    broadcastState();
  });

  socket.on("game:roll", (_payload, ack = () => {}) => {
    const color = socket.data.color;
    const result = rollDice(room.state, color);
    ack(result);
    broadcastState();
  });

  socket.on("game:move", async ({ tokenId } = {}, ack = () => {}) => {
    const color = socket.data.color;
    const result = await moveToken(room.state, color, tokenId, {
      onSpecial: async (player, card) => {
        broadcastState();
        io.emit("room:special", {
          color: player.color,
          source: card.source,
          name: card.name,
          steps: card.steps,
          effectText: specialEffectText(card),
        });
        await wait(revealStepDelayMs * 2);
      },
    });
    ack(result);
    room.state.resolvingSpecial = false;
    broadcastState();
  });

  socket.on("disconnect", () => {
    const color = room.sockets.get(socket.id);
    room.sockets.delete(socket.id);
    if (color && !Array.from(room.sockets.values()).includes(color)) {
      const player = room.state.players.find((candidate) => candidate.color === color);
      if (player) player.connected = false;
      broadcastState();
    }
  });
});

function broadcastState() {
  io.emit("room:state", publicState(room.state));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (require.main === module) {
  server.listen(port, () => {
    console.log(`Luno Ludo shared room running on port ${port}`);
  });
}

module.exports = { server, io, room };
