const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");
const crypto = require("crypto");
const { resolveCardPlay, countCards } = require("./lib/game-engine");

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const allowedOrigins = new Set([
  "https://themind-two.vercel.app",
  ...(process.env.FRONTEND_ORIGIN ? [process.env.FRONTEND_ORIGIN] : []),
  ...(dev ? [`http://localhost:${port}`, `http://127.0.0.1:${port}`] : []),
]);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const rooms = new Map();
const AVATARS = ["🦊", "🐼", "🐸", "🐯", "🐙", "🐻", "🐧", "🦄", "🐵", "🐨", "🐰", "🐱"];

function makeCode() {
  let code;
  do {
    code = crypto.randomBytes(3).toString("hex").toUpperCase();
  } while (rooms.has(code));
  return code;
}
function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    players: [...room.players.values()].map(({ id, name, avatar, ready }) => ({ id, name, avatar, ready })),
    messages: room.messages.slice(-40),
    level: room.level,
    lives: room.lives,
    shurikens: room.shurikens,
    shurikenVotes: room.shurikenVotes.size,
    shurikenVoters: [...room.shurikenVotes],
    shurikenRound: room.shurikenRound,
    actionCount: room.actionCount,
    transitioning: room.transitioning,
    transitionType: room.transitionType,
    lastPlayed: room.lastPlayed,
    playedCards: room.playedCards.slice(-8),
    hands: room.status === "playing"
      ? [...room.players.values()].map(p => ({ playerId: p.id, cards: p.hand.length }))
      : []
  };
}
function emitRoom(io, room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}
function emitSound(io, room, type) {
  io.to(room.code).emit("game:sound", { id: crypto.randomUUID(), type });
}
function replayAction(player, actionId, callback) {
  const previous = player.actionResults.get(actionId);
  if (!previous) return false;
  callback?.(previous);
  return true;
}
function rememberAction(player, actionId, result) {
  player.actionResults.set(actionId, result);
  if (player.actionResults.size > 64) player.actionResults.delete(player.actionResults.keys().next().value);
}
function clearShurikenVotes(room) {
  if (room.shurikenVotes.size === 0) return;
  room.shurikenVotes.clear();
  room.shurikenRound += 1;
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function deal(room) {
  const deck = shuffle(Array.from({ length: 100 }, (_, i) => i + 1));
  const players = [...room.players.values()];
  players.forEach(p => { p.hand = deck.splice(0, room.level).sort((a, b) => a - b); });
  room.lastPlayed = null;
  room.playedCards = [];
  room.attemptFailed = false;
}

function finishLevel(io, room) {
  const remaining = [...room.players.values()].reduce((sum, p) => sum + p.hand.length, 0);
  if (room.status !== "playing" || room.transitioning || remaining !== 0) return;
  // Rewards from the original level track: shuriken on 2/5/8, life on 3/6/9.
  if ([2, 5, 8].includes(room.level)) room.shurikens = Math.min(3, room.shurikens + 1);
  if ([3, 6, 9].includes(room.level)) room.lives = Math.min(5, room.lives + 1);
  emitSound(io, room, "level");
  const maxLevel = room.players.size === 2 ? 12 : room.players.size === 3 ? 10 : 8;
  if (room.level >= maxLevel) {
    room.status = "won";
    emitRoom(io, room);
    emitSound(io, room, "win");
    return;
  }
  room.transitioning = true;
  room.transitionType = "level";
  clearShurikenVotes(room);
  emitRoom(io, room);
  setTimeout(() => {
    if (room.status !== "playing" || !room.transitioning) return;
    room.level += 1;
    room.transitioning = false;
    room.transitionType = null;
    deal(room);
    emitRoom(io, room);
    emitSound(io, room, "deal");
    for (const p of room.players.values()) io.to(p.id).emit("game:hand", { cards: p.hand, level: room.level });
  }, 1800);
}

function retryLevel(io, room) {
  if (room.status !== "playing" || room.transitioning || countCards(room) !== 0) return;
  room.transitioning = true;
  room.transitionType = "retry";
  room.shurikenVotes.clear();
  emitRoom(io, room);
  setTimeout(() => {
    if (room.status !== "playing" || !room.transitioning || room.transitionType !== "retry") return;
    room.transitioning = false;
    room.transitionType = null;
    deal(room);
    emitRoom(io, room);
    emitSound(io, room, "deal");
    for (const player of room.players.values()) io.to(player.id).emit("game:hand", { cards: player.hand, level: room.level });
  }, 1500);
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        callback(new Error(`Origin ${origin} is not allowed by Socket.IO CORS.`));
      },
      credentials: true,
    },
  });

  io.on("connection", socket => {
    socket.on("room:create", ({ name, avatar }, callback) => {
      const cleanName = String(name || "Player").trim().slice(0, 18) || "Player";
      const code = makeCode();
      const room = {
        code, hostId: socket.id, status: "lobby", level: 1, lives: 3, shurikens: 1,
        transitioning: false, transitionType: null, shurikenVotes: new Set(), shurikenRound: 0, actionCount: 0,
        playedCards: [], attemptFailed: false, lastPlayed: null, players: new Map(), messages: []
      };
      room.players.set(socket.id, { id: socket.id, name: cleanName, avatar: AVATARS.includes(avatar) ? avatar : AVATARS[0], ready: true, hand: [], actionResults: new Map() });
      rooms.set(code, room);
      socket.join(code);
      callback?.({ ok: true, room: publicRoom(room), playerId: socket.id });
      emitRoom(io, room);
      emitSound(io, room, "join");
    });

    socket.on("room:join", ({ code, name, avatar }, callback) => {
      const normalized = String(code || "").trim().toUpperCase();
      const room = rooms.get(normalized);
      if (!room) return callback?.({ ok: false, error: "Room tidak ditemukan." });
      if (room.status !== "lobby") return callback?.({ ok: false, error: "Permainan sudah dimulai." });
      if (room.players.size >= 8) return callback?.({ ok: false, error: "Room sudah penuh (maksimal 8 pemain)." });
      const cleanName = String(name || "Player").trim().slice(0, 18) || "Player";
      room.players.set(socket.id, { id: socket.id, name: cleanName, avatar: AVATARS.includes(avatar) ? avatar : AVATARS[0], ready: true, hand: [], actionResults: new Map() });
      socket.join(normalized);
      callback?.({ ok: true, room: publicRoom(room), playerId: socket.id });
      emitRoom(io, room);
      emitSound(io, room, "join");
    });

    socket.on("lobby:chat", ({ code, message }) => {
      const room = rooms.get(String(code || "").toUpperCase());
      const player = room?.players.get(socket.id);
      if (!room || room.status !== "lobby" || !player) return;
      const clean = String(message || "").trim().slice(0, 240);
      if (!clean) return;
      room.messages.push({ id: crypto.randomUUID(), playerId: socket.id, name: player.name, avatar: player.avatar, message: clean, time: Date.now() });
      emitRoom(io, room);
      socket.to(room.code).emit("game:sound", { id: crypto.randomUUID(), type: "chat" });
    });

    socket.on("game:start", ({ code }, callback) => {
      const room = rooms.get(String(code || "").toUpperCase());
      if (!room) return callback?.({ ok: false, error: "Room tidak ditemukan." });
      if (room.hostId !== socket.id) return callback?.({ ok: false, error: "Hanya host yang bisa memulai permainan." });
      if (room.players.size < 2) return callback?.({ ok: false, error: "Minimal 2 pemain untuk memulai." });
      if (room.status !== "lobby") return callback?.({ ok: false, error: "Permainan sudah berjalan." });
      room.status = "playing";
      room.level = 1;
      room.lives = Math.min(5, room.players.size);
      room.shurikens = 1;
      room.transitioning = false;
      room.transitionType = null;
      room.shurikenVotes.clear();
      room.shurikenRound = 0;
      room.actionCount = 0;
      deal(room);
      callback?.({ ok: true });
      emitRoom(io, room);
      emitSound(io, room, "deal");
      for (const p of room.players.values()) io.to(p.id).emit("game:hand", { cards: p.hand, level: room.level });
    });

    socket.on("game:play", ({ code, card, actionId }, callback) => {
      const room = rooms.get(String(code || "").toUpperCase());
      const player = room?.players.get(socket.id);
      if (!room || room.status !== "playing" || room.transitioning || !player) return callback?.({ ok: false, error: "Game tidak aktif atau sedang berpindah level." });
      const requestId = String(actionId || "");
      if (!requestId || requestId.length > 80) return callback?.({ ok: false, error: "ID aksi tidak valid." });
      if (replayAction(player, requestId, callback)) return;
      const value = Number(card);
      const outcome = resolveCardPlay(room, socket.id, value);
      if (!outcome.ok) return callback?.(outcome);
      room.lastPlayed.actionId = requestId;
      rememberAction(player, requestId, { ok: true });
      clearShurikenVotes(room);

      if (outcome.mistake) {
        emitSound(io, room, "mistake");
        emitSound(io, room, "life");
        if (outcome.gameOver) emitSound(io, room, "gameover");
      } else {
        emitSound(io, room, "play");
      }
      if (outcome.retryLevel) retryLevel(io, room);
      else if (outcome.levelComplete) finishLevel(io, room);

      callback?.({ ok: true });
      emitRoom(io, room);
      for (const p of room.players.values()) io.to(p.id).emit("game:hand", { cards: p.hand, level: room.level });
    });

    socket.on("game:shuriken", ({ code, actionId, round }, callback) => {
      const room = rooms.get(String(code || "").toUpperCase());
      const player = room?.players.get(socket.id);
      if (!room || room.status !== "playing" || room.transitioning || !player) return callback?.({ ok: false, error: "Game tidak aktif." });
      const requestId = String(actionId || "");
      if (!requestId || requestId.length > 80) return callback?.({ ok: false, error: "ID aksi tidak valid." });
      if (replayAction(player, requestId, callback)) return;
      if (!Number.isInteger(round) || round !== room.shurikenRound) return callback?.({ ok: false, error: "Pemungutan suara Shuriken sudah berubah. Coba lagi." });
      if (room.shurikens <= 0) return callback?.({ ok: false, error: "Shuriken sudah habis." });
      if (room.shurikenVotes.has(socket.id)) return callback?.({ ok: false, error: "Kamu sudah menyetujui penggunaan Shuriken." });
      room.shurikenVotes.add(socket.id);
      rememberAction(player, requestId, { ok: true });
      if (room.shurikenVotes.size === room.players.size) {
        room.shurikens -= 1;
        room.actionCount += 1;
        room.shurikenVotes.clear();
        room.shurikenRound += 1;
        const discarded = [];
        for (const p of room.players.values()) {
          if (p.hand.length === 0) continue;
          const lowest = Math.min(...p.hand);
          p.hand = p.hand.filter(n => n !== lowest);
          discarded.push({ playerName: p.name, value: lowest });
        }
        room.lastPlayed = { type: "shuriken", value: null, playerName: "Tim", missed: [], discarded };
        room.lastPlayed.actionId = requestId;
        emitSound(io, room, "shuriken");
        if (countCards(room) === 0 && room.attemptFailed) retryLevel(io, room);
        else if (countCards(room) === 0) finishLevel(io, room);
        for (const p of room.players.values()) io.to(p.id).emit("game:hand", { cards: p.hand, level: room.level });
      }
      callback?.({ ok: true });
      emitRoom(io, room);
    });

    socket.on("disconnect", () => {
      for (const [code, room] of rooms.entries()) {
        if (room.players.has(socket.id)) {
          room.players.delete(socket.id);
          clearShurikenVotes(room);
          if (room.players.size === 0) rooms.delete(code);
          else {
            if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
            emitRoom(io, room);
          }
        }
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> The Mind Online ready at http://localhost:${port}`);
  });
});
