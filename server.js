"use strict";

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const {
  authenticateColorLogin,
  colorNames,
  clockwiseColorsFrom,
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
const botTurnDelayMs = 3000;

const room = {
  state: createGame(),
  sockets: new Map(),
  config: null,
  botTimer: null,
};

app.use("/assets", express.static(path.join(__dirname, "assets")));
app.get("/app.js", (_request, response) => response.sendFile(path.join(__dirname, "app.js")));
app.get("/styles.css", (_request, response) => response.sendFile(path.join(__dirname, "styles.css")));

app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

io.on("connection", (socket) => {
  socket.emit("room:state", publicState(room.state));

  socket.on("auth:login", ({ username, password, playWithBots = false, playerCount = 4 } = {}, ack = () => {}) => {
    const login = authenticateColorLogin(username, password);
    if (!login.ok) {
      ack({ ok: false, error: "Use matching color credentials: red/red, blue/blue, yellow/yellow, or green/green." });
      return;
    }

    if (playWithBots) {
      const activeColors = clockwiseColorsFrom(login.color, playerCount);
      room.config = {
        botMode: true,
        humanColor: login.color,
        activeColors,
      };
      room.state = createGame(room.config);
      room.state.log = [
        `${colorNames[login.color]} started a ${activeColors.length}-player bot game.`,
        `Turn order: ${activeColors.map((color) => colorNames[color]).join(" → ")}.`,
      ];
    } else if (room.config?.botMode && room.config.humanColor !== login.color) {
      room.config = null;
      room.state = createGame();
      room.state.log = ["Shared room ready. Login with a color to join."];
    }

    socket.data.color = login.color;
    room.sockets.set(socket.id, login.color);
    const player = room.state.players.find((candidate) => candidate.color === login.color);
    if (!player) {
      ack({ ok: false, error: `${colorNames[login.color]} is not active in this game.` });
      return;
    }
    player.connected = true;
    player.name = colorNames[login.color];
    room.state.log.push(`${player.name} joined the shared room.`);
    ack({ ok: true, color: login.color, state: publicState(room.state) });
    broadcastState();
    scheduleBotTurn();
  });

  socket.on("game:reset", () => {
    clearTimeout(room.botTimer);
    room.state = createGame(room.config || {});
    if (room.config?.botMode) {
      room.state.log = [
        `${colorNames[room.config.humanColor]} restarted the bot game.`,
        `Turn order: ${room.config.activeColors.map((color) => colorNames[color]).join(" → ")}.`,
      ];
    }
    for (const color of room.sockets.values()) {
      const player = room.state.players.find((candidate) => candidate.color === color);
      if (player) player.connected = true;
    }
    broadcastState();
    scheduleBotTurn();
  });

  socket.on("game:roll", (_payload, ack = () => {}) => {
    const color = socket.data.color;
    const result = rollDice(room.state, color);
    ack(result);
    broadcastState();
    scheduleBotTurn();
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
    scheduleBotTurn();
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

function scheduleBotTurn() {
  clearTimeout(room.botTimer);
  if (!room.config?.botMode || room.state.winner || room.state.resolvingSpecial) return;
  const player = room.state.players[room.state.current];
  if (!player || player.isHuman) return;
  room.botTimer = setTimeout(() => runBotTurn(), botTurnDelayMs);
}

async function runBotTurn() {
  const player = room.state.players[room.state.current];
  if (!room.config?.botMode || !player || player.isHuman || room.state.winner || room.state.resolvingSpecial) return;

  if (!room.state.rolled) {
    rollDice(room.state, player.color);
    broadcastState();
  }

  if (room.state.selectable.length && room.state.players[room.state.current]?.color === player.color) {
    const tokenId = chooseBotToken(player, room.state.selectable);
    await moveToken(room.state, player.color, tokenId, {
      onSpecial: async (specialPlayer, card) => {
        broadcastState();
        io.emit("room:special", {
          color: specialPlayer.color,
          source: card.source,
          name: card.name,
          steps: card.steps,
          effectText: specialEffectText(card),
        });
        await wait(revealStepDelayMs * 2);
      },
    });
    room.state.resolvingSpecial = false;
    broadcastState();
  }

  scheduleBotTurn();
}

function chooseBotToken(player, movable) {
  const candidates = movable.map((id) => player.tokens.find((token) => token.id === id)).filter(Boolean);
  return (candidates.find((token) => token.progress >= 51)
    || candidates.find((token) => token.progress === -1)
    || candidates[0])?.id;
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
