// Fake Artist – Multiplayer-Server
// Start: npm start  (danach http://localhost:3000 öffnen)
const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const WORDS = require("./words");

const PORT = process.env.PORT || 3000;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;
const STROKES_PER_PLAYER = 2;
const MAX_POINTS_PER_STROKE = 1500;
const COLORS = ["#ff4d6d", "#3a86ff", "#06d6a0", "#ffbe0b", "#8338ec", "#fb5607", "#00b4d8", "#ff70d6", "#7cb518", "#8d6e63"];

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.send("ok"));
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });

/** code -> room */
const rooms = new Map();

// ---------- Hilfsfunktionen ----------
const rand = (n) => Math.floor(Math.random() * n);
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);

function makeCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // ohne I und O (Verwechslung)
  let code;
  do { code = Array.from({ length: 4 }, () => letters[rand(letters.length)]).join(""); } while (rooms.has(code));
  return code;
}

function norm(s) {
  return String(s).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function guessMatches(guess, word) {
  const g = norm(guess), w = norm(word);
  if (!g) return false;
  if (g === w) return true;
  if (w.length >= 4 && g.includes(w)) return true; // z.B. "ein Fondue"
  if (w.length >= 5 && levenshtein(g, w) <= 1) return true; // kleiner Tippfehler
  return false;
}

/** "Kategorie: Wort" pro Zeile -> [{category, word}] */
function parseCustomWords(text) {
  return String(text || "").split(/\r?\n/).map((line) => {
    const m = line.split(":");
    if (m.length < 2) return null;
    const category = clean(m[0], 30), word = clean(m.slice(1).join(":"), 40);
    return category && word ? { category, word } : null;
  }).filter(Boolean).slice(0, 200);
}

function pickWord(room) {
  let pool = [];
  if (!room.settings.onlyCustom || room.settings.custom.length === 0) {
    for (const [category, words] of Object.entries(WORDS)) for (const word of words) pool.push({ category, word });
  }
  pool = pool.concat(room.settings.custom);
  let fresh = pool.filter((p) => !room.usedWords.has(p.category + "|" + p.word));
  if (fresh.length === 0) { room.usedWords.clear(); fresh = pool; }
  const choice = fresh[rand(fresh.length)];
  room.usedWords.add(choice.category + "|" + choice.word);
  return choice;
}

const getPlayer = (room, id) => room.players.find((p) => p.id === id);
const connectedPlayers = (room) => room.players.filter((p) => p.connected);
const roundPlayers = (room) => room.round ? room.players.filter((p) => room.round.order.includes(p.id)) : [];

// ---------- Zustand an Spieler senden ----------
function stateFor(room, playerId) {
  const r = room.round;
  const reveal = room.phase === "result";
  const me = getPlayer(room, playerId);
  const base = {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    me: playerId,
    players: room.players.map((p) => ({ id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected })),
    settings: { onlyCustom: room.settings.onlyCustom, customCount: room.settings.custom.length, customText: playerId === room.hostId ? room.settings.customText : "" },
    roundNo: room.roundNo,
    minPlayers: MIN_PLAYERS,
  };
  if (!r || !me) return base;
  const inRound = r.order.includes(playerId);
  const isFake = r.fakeId === playerId;
  return {
    ...base,
    round: {
      category: r.category,
      word: reveal || (inRound && !isFake) ? r.word : null,
      isFake: inRound && isFake,
      spectator: !inRound,
      fakeId: reveal ? r.fakeId : null,
      order: r.order,
      turn: r.turn,
      totalTurns: r.order.length * STROKES_PER_PLAYER,
      currentPlayer: room.phase === "draw" ? r.order[r.turn % r.order.length] : null,
      strokes: r.strokes,
      ready: [...r.ready],
      voted: Object.keys(r.votes),
      votes: reveal || room.phase === "guess" ? r.votes : null,
      myVote: r.votes[playerId] || null,
      accused: r.accused,
      guess: r.guess,
      result: r.result,
    },
  };
}

function broadcast(room) {
  for (const p of room.players) if (p.socketId) io.to(p.socketId).emit("state", stateFor(room, p.id));
}

// ---------- Spielablauf ----------
function startRound(room) {
  const players = connectedPlayers(room);
  const { category, word } = pickWord(room);
  room.roundNo += 1;
  room.round = {
    category, word,
    fakeId: players[rand(players.length)].id,
    order: shuffle(players.map((p) => p.id)),
    turn: 0,
    strokes: [],
    live: null,
    ready: new Set(),
    votes: {},
    accused: null,
    guess: null,
    result: null,
  };
  room.phase = "reveal";
  broadcast(room);
}

function checkAllReady(room) {
  const r = room.round;
  const needed = roundPlayers(room).filter((p) => p.connected);
  if (needed.every((p) => r.ready.has(p.id))) { room.phase = "draw"; skipOfflineDrawers(room); broadcast(room); }
}

function advanceTurn(room) {
  const r = room.round;
  r.turn += 1;
  r.live = null;
  if (r.turn >= r.order.length * STROKES_PER_PLAYER) { room.phase = "vote"; broadcast(room); return; }
  skipOfflineDrawers(room);
  broadcast(room);
}

function skipOfflineDrawers(room) {
  const r = room.round;
  let guard = 0;
  while (room.phase === "draw" && guard++ < 50) {
    const current = getPlayer(room, r.order[r.turn % r.order.length]);
    if (current && current.connected) return;
    r.turn += 1;
    if (r.turn >= r.order.length * STROKES_PER_PLAYER) { room.phase = "vote"; return; }
  }
}

function checkAllVoted(room) {
  const r = room.round;
  const voters = roundPlayers(room).filter((p) => p.connected);
  if (voters.every((p) => r.votes[p.id])) resolveVotes(room);
}

function resolveVotes(room) {
  const r = room.round;
  const tally = {};
  for (const target of Object.values(r.votes)) tally[target] = (tally[target] || 0) + 1;
  if (Object.keys(tally).length === 0) { finishRound(room, { caught: false }); return; }
  const max = Math.max(...Object.values(tally));
  const top = Object.keys(tally).filter((id) => tally[id] === max);
  r.accused = top.length === 1 ? top[0] : null; // Gleichstand = niemand wird verurteilt
  if (r.accused === r.fakeId) room.phase = "guess"; // Fake erwischt -> darf noch das Wort raten
  else finishRound(room, { caught: false, tie: top.length > 1 });
}

function finishRound(room, { caught, tie = false, guessCorrect = false }) {
  const r = room.round;
  const fakeWins = !caught || guessCorrect;
  const delta = {};
  if (fakeWins) delta[r.fakeId] = 2;
  else for (const id of r.order) if (id !== r.fakeId) delta[id] = 1;
  for (const [id, pts] of Object.entries(delta)) { const p = getPlayer(room, id); if (p) p.score += pts; }
  r.result = { fakeWins, caught, tie, guessCorrect, delta };
  room.phase = "result";
}

function revertScores(room) {
  const r = room.round;
  for (const [id, pts] of Object.entries(r.result.delta)) { const p = getPlayer(room, id); if (p) p.score -= pts; }
}

function ensureHost(room) {
  const host = getPlayer(room, room.hostId);
  if (host && host.connected) return;
  const next = connectedPlayers(room)[0];
  if (next) room.hostId = next.id;
}

// Nach Verbindungsabbruch: Ablauf nicht blockieren lassen
function onPlayerGone(room) {
  ensureHost(room);
  if (room.phase === "reveal") checkAllReady(room);
  if (room.phase === "draw") {
    const r = room.round;
    const current = getPlayer(room, r.order[r.turn % r.order.length]);
    if (!current || !current.connected) { r.live = null; advanceTurn(room); }
  }
  if (room.phase === "vote") checkAllVoted(room);
  if (room.phase === "guess") {
    const fake = getPlayer(room, room.round.fakeId);
    if (!fake || !fake.connected) finishRound(room, { caught: true });
  }
}

// ---------- Socket-Ereignisse ----------
io.on("connection", (socket) => {
  let room = null;
  let playerId = null;

  const err = (msg) => socket.emit("toast", msg);
  const isHost = () => room && room.hostId === playerId;

  function attach(r, id, name) {
    room = r; playerId = id;
    let p = getPlayer(r, id);
    if (p) {
      if (p.socketId && p.socketId !== socket.id) io.to(p.socketId).emit("kicked", "In einem anderen Tab geöffnet.");
      p.connected = true; p.socketId = socket.id; if (name) p.name = name;
    } else {
      const used = new Set(r.players.map((x) => x.color));
      p = { id, name, color: COLORS.find((c) => !used.has(c)) || COLORS[rand(COLORS.length)], score: 0, connected: true, socketId: socket.id };
      r.players.push(p);
    }
    socket.join(r.code);
    ensureHost(r);
    r.lastActive = Date.now();
    broadcast(r);
  }

  socket.on("create", ({ name, playerId: id } = {}) => {
    name = clean(name, 16); id = clean(id, 40);
    if (!name || !id) return err("Bitte gib einen Namen ein.");
    const code = makeCode();
    const r = { code, hostId: id, players: [], phase: "lobby", round: null, roundNo: 0, usedWords: new Set(), settings: { onlyCustom: false, custom: [], customText: "" }, lastActive: Date.now() };
    rooms.set(code, r);
    attach(r, id, name);
  });

  socket.on("join", ({ code, name, playerId: id } = {}) => {
    code = clean(code, 4).toUpperCase(); name = clean(name, 16); id = clean(id, 40);
    const r = rooms.get(code);
    if (!r) return err("Raum " + (code || "?") + " gibt es nicht.");
    const existing = getPlayer(r, id);
    if (!existing) {
      if (!name) return err("Bitte gib einen Namen ein.");
      if (r.players.length >= MAX_PLAYERS) return err("Der Raum ist voll (max. " + MAX_PLAYERS + ").");
      if (r.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) name = name + " " + (r.players.length + 1);
    }
    attach(r, id, name || existing.name);
  });

  socket.on("settings", ({ customText, onlyCustom } = {}) => {
    if (!isHost() || room.phase !== "lobby") return;
    room.settings.customText = String(customText || "").slice(0, 6000);
    room.settings.custom = parseCustomWords(room.settings.customText);
    room.settings.onlyCustom = !!onlyCustom;
    broadcast(room);
  });

  socket.on("start", () => {
    if (!isHost()) return;
    if (!["lobby", "result"].includes(room.phase)) return;
    if (connectedPlayers(room).length < MIN_PLAYERS) return err("Ihr braucht mindestens " + MIN_PLAYERS + " Spieler.");
    startRound(room);
  });

  socket.on("lobby", () => {
    if (!isHost()) return;
    room.phase = "lobby"; room.round = null;
    broadcast(room);
  });

  socket.on("resetScores", () => {
    if (!isHost() || room.phase !== "lobby") return;
    room.players.forEach((p) => (p.score = 0));
    broadcast(room);
  });

  socket.on("kick", (id) => {
    if (!isHost() || room.phase !== "lobby" || id === playerId) return;
    const p = getPlayer(room, id);
    if (!p) return;
    if (p.socketId) io.to(p.socketId).emit("kicked", "Du wurdest aus dem Raum entfernt.");
    room.players = room.players.filter((x) => x.id !== id);
    broadcast(room);
  });

  socket.on("ready", () => {
    if (!room || room.phase !== "reveal" || !room.round.order.includes(playerId)) return;
    room.round.ready.add(playerId);
    checkAllReady(room);
    broadcast(room);
  });

  // --- Zeichnen: nur wer dran ist, ein Strich pro Zug ---
  const myTurn = () => room && room.phase === "draw" && room.round.order[room.round.turn % room.round.order.length] === playerId;
  const validPt = (pt) => Array.isArray(pt) && pt.length === 2 && pt.every((v) => typeof v === "number" && v >= 0 && v <= 1);

  socket.on("stroke:points", (pts) => {
    if (!myTurn() || !Array.isArray(pts)) return;
    const r = room.round;
    const me = getPlayer(room, playerId);
    if (!r.live) r.live = { playerId, color: me.color, points: [] };
    const good = pts.filter(validPt).map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
    if (r.live.points.length + good.length > MAX_POINTS_PER_STROKE) return;
    r.live.points.push(...good);
    socket.to(room.code).emit("stroke:live", { playerId, color: me.color, points: good });
  });

  socket.on("stroke:end", () => {
    if (!myTurn()) return;
    const r = room.round;
    if (!r.live || r.live.points.length < 2) { r.live = null; io.to(room.code).emit("stroke:cancel"); return; }
    r.strokes.push(r.live);
    advanceTurn(room);
  });

  socket.on("skip", () => {
    if (!isHost() || room.phase !== "draw") return;
    room.round.live = null;
    io.to(room.code).emit("stroke:cancel");
    advanceTurn(room);
  });

  socket.on("vote", (targetId) => {
    if (!room || room.phase !== "vote") return;
    const r = room.round;
    if (!r.order.includes(playerId) || !r.order.includes(targetId) || targetId === playerId) return;
    r.votes[playerId] = targetId;
    checkAllVoted(room);
    broadcast(room);
  });

  socket.on("forceVote", () => {
    if (!isHost() || room.phase !== "vote" || Object.keys(room.round.votes).length === 0) return;
    resolveVotes(room); // wer noch nicht abgestimmt hat, wird ignoriert
    broadcast(room);
  });

  socket.on("guess", (text) => {
    if (!room || room.phase !== "guess" || room.round.fakeId !== playerId) return;
    const r = room.round;
    r.guess = clean(text, 40);
    if (!r.guess) return;
    finishRound(room, { caught: true, guessCorrect: guessMatches(r.guess, r.word) });
    broadcast(room);
  });

  // Host kann die automatische Prüfung des Rateversuchs korrigieren
  socket.on("overrideGuess", (correct) => {
    if (!isHost() || room.phase !== "result") return;
    const r = room.round;
    if (!r.result.caught || r.guess == null || r.result.guessCorrect === !!correct) return;
    revertScores(room);
    finishRound(room, { caught: true, guessCorrect: !!correct });
    broadcast(room);
  });

  socket.on("leave", () => {
    if (!room) return;
    const r = room;
    const p = getPlayer(r, playerId);
    socket.leave(r.code);
    room = null;
    if (!p) return;
    if (r.phase === "lobby") r.players = r.players.filter((x) => x.id !== p.id);
    else { p.connected = false; p.socketId = null; }
    onPlayerGone(r);
    broadcast(r);
  });

  socket.on("disconnect", () => {
    if (!room) return;
    const p = getPlayer(room, playerId);
    if (!p || p.socketId !== socket.id) return;
    p.connected = false; p.socketId = null;
    room.lastActive = Date.now();
    onPlayerGone(room);
    broadcast(room);
  });
});

// Leere Räume nach 30 Minuten aufräumen
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) if (connectedPlayers(r).length === 0 && now - r.lastActive > 30 * 60 * 1000) rooms.delete(code);
}, 60 * 1000);

server.listen(PORT, () => console.log("Fake Artist läuft auf http://localhost:" + PORT));
