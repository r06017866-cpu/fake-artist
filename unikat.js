// Unikat – Rate-Spiel: Wer etwas nennt, das sonst niemand nennt, bekommt die meisten Punkte.
// Eigener Socket.io-Bereich "/unikat", unabhängig von den anderen Spielen.
//
// Ablauf einer Runde:
//   1. Kategorie: Der Richter dieser Runde schreibt eine Kategorie (z.B. "Lehrer von uns").
//   2. Antworten: Alle anderen schreiben geheim ihre Antworten.
//   3. Prüfen:    Der Richter verbindet gleiche Antworten ("Hr. Meier" = "Meier") oder streicht ungültige.
//   4. Punkte:    Allein = 3 Punkte, zu zweit = 1 Punkt, zu dritt oder mehr = 0 Punkte.
//                 Der Richter bekommt den Durchschnitt der anderen (gerundet).
// Der Richter wechselt jede Runde, bis jeder so oft dran war, wie "Durchgänge" eingestellt sind.

const CATEGORY_TIME = 45;               // Sekunden für den Richter, um eine Kategorie zu schreiben
const ANSWER_TIMES = [30, 45, 60, 90];  // Auswahl für die Antwortzeit
const DISCONNECT_GRACE = 8000;          // so lange wartet man auf einen Richter ohne Verbindung
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;
const MAX_ANSWER_LEN = 40;

// Punkte je nach Anzahl Spieler mit derselben Antwort
const pointsFor = (n) => (n === 1 ? 3 : n === 2 ? 1 : 0);

// Ersatz-Kategorien, falls der Richter nichts eingibt (oder auf 🎲 drückt).
// Gute Kategorien haben nur eine begrenzte Anzahl möglicher Antworten.
const CATEGORIES = [
  "Ein Land, das an die Schweiz grenzt", "Ein Schulfach", "Eine Fastfood-Kette", "Ein Planet",
  "Ein Monat", "Eine Social-Media-App", "Ein Kanton", "Eine Automarke", "Ein Fussballclub aus der Super League",
  "Eine Pizzasorte", "Ein Sternzeichen", "Ein Instrument im Orchester", "Ein Brettspiel",
  "Eine olympische Sportart", "Eine Schweizer Stadt", "Ein Gemüse", "Eine Frucht", "Ein Superheld",
  "Etwas, das im Klassenzimmer steht", "Ein Schweizer Gericht", "Ein Videospiel", "Ein Kleidungsstück",
  "Eine Farbe", "Ein Tier im Zoo", "Ein Getränk", "Eine Süssigkeit", "Ein Beruf", "Ein Wochentag",
  "Eine Hauptstadt in Europa", "Ein Körperteil", "Ein Möbelstück", "Eine Eissorte",
];

const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const int = (v, min, max, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Vergleichsschlüssel: Gross/klein, Akzente, Satzzeichen und "Herr/Frau/der/die/das" werden ignoriert
function normalize(s) {
  const k = String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/^(herr|frau|hr|fr|der|die|das|the|ein|eine) /, "").trim();
  return k || String(s).toLowerCase().trim();
}

function cleanSettings(raw = {}, base = {}) {
  return {
    answers: int(raw.answers, 1, 3, base.answers ?? 3),
    answerTime: ANSWER_TIMES.includes(Number(raw.answerTime)) ? Number(raw.answerTime) : (base.answerTime ?? 60),
    cycles: int(raw.cycles, 1, 3, base.cycles ?? 2),
  };
}

class GameError extends Error {}

module.exports = function setupUnikat(io) {
  const nsp = io.of("/unikat");
  const rooms = new Map();

  function makeCode() {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    let code;
    do { code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join(""); } while (rooms.has(code));
    return code;
  }

  const connected = (room) => [...room.players.values()].filter((p) => p.connected);

  function ensureHost(room) {
    const host = room.players.get(room.hostId);
    if (host && host.connected) return;
    const next = connected(room)[0];
    if (next) room.hostId = next.id;
  }

  // ---------------- Gruppen & Punkte ----------------
  function buildGroups(round) {
    const map = new Map();
    for (const a of round.answers) {
      const gid = round.groupOf.get(a.id);
      if (!map.has(gid)) map.set(gid, { id: gid, answers: [], players: new Set(), invalid: round.invalid.has(gid) });
      const g = map.get(gid);
      g.answers.push(a);
      g.players.add(a.playerId);
    }
    const groups = [...map.values()];
    for (const g of groups) g.points = g.invalid ? 0 : pointsFor(g.players.size);
    groups.sort((a, b) => (a.invalid - b.invalid) || (b.players.size - a.players.size) || a.answers[0].text.localeCompare(b.answers[0].text, "de"));
    return groups;
  }

  function roundPoints(round, groups) {
    const pts = {};
    for (const id of round.answerers) pts[id] = 0;
    for (const g of groups) for (const pid of g.players) pts[pid] = (pts[pid] || 0) + g.points;
    const list = [...round.answerers].map((id) => pts[id] || 0);
    const bonus = list.length ? Math.round(list.reduce((s, x) => s + x, 0) / list.length) : 0;
    return { pts, bonus };
  }

  // ---------------- Zustand senden ----------------
  function stateFor(room, pid) {
    const r = room.round;
    const now = Date.now();
    const s = {
      code: room.code, me: pid, hostId: room.hostId, phase: room.phase, settings: room.settings,
      roundNo: room.roundNo, totalRounds: room.judgeOrder.length,
      deadline: room.deadline, serverNow: now, endNote: room.endNote,
      players: [...room.players.values()].map((p) => ({
        id: p.id, name: p.name, score: p.score, connected: p.connected,
        submitted: !!(r && r.submitted.has(p.id)),
        answering: !!(r && r.answerers.has(p.id)),
        roundPts: r && r.results ? (p.id === r.judgeId ? r.results.bonus : r.results.pts[p.id] ?? null) : null,
      })),
    };
    if (r) {
      s.judgeId = r.judgeId;
      s.category = r.category;
      s.randomCategory = r.randomCategory;
      s.amAnswerer = r.answerers.has(pid);
      s.canJudge = canJudge(room, pid);
      if (room.phase === "answer") {
        s.myDraft = r.drafts.get(pid) || [];
        s.mySubmitted = r.submitted.has(pid);
      }
      if (room.phase === "review" || room.phase === "results") {
        s.groups = buildGroups(r).map((g) => ({
          id: g.id, invalid: g.invalid, count: g.players.size, points: g.points,
          answers: g.answers.map((a) => ({ id: a.id, text: a.text, pid: a.playerId, name: room.players.get(a.playerId)?.name || a.name })),
        }));
      }
      if (r.results) s.results = r.results;
    }
    return s;
  }

  function broadcast(room) {
    for (const p of room.players.values()) {
      const sid = room.sockets.get(p.id);
      if (sid) nsp.to(sid).emit("state", stateFor(room, p.id));
    }
  }

  // ---------------- Ablauf ----------------
  function schedule(room) {
    clearTimeout(room.timer);
    if (!room.deadline) return;
    room.timer = setTimeout(() => {
      room.timer = null;
      try { onDeadline(room); } catch (e) { console.error(e); }
      update(room);
    }, Math.max(0, room.deadline - Date.now()));
  }

  function update(room) { schedule(room); broadcast(room); room.lastActive = Date.now(); }

  function onDeadline(room) {
    if (room.phase === "category") startAnswer(room, pick(CATEGORIES), true);
    else if (room.phase === "answer") startReview(room);
  }

  function nextRound(room) {
    room.deadline = null;
    room.round = null;
    if (connected(room).length < MIN_PLAYERS) { room.phase = "end"; room.endNote = "Zu wenige Spieler verbunden."; return; }
    while (room.roundNo < room.judgeOrder.length) {
      const judgeId = room.judgeOrder[room.roundNo++];
      const judge = room.players.get(judgeId);
      if (!judge || !judge.connected) continue; // Richter weg: Runde überspringen
      room.round = {
        judgeId, category: "", randomCategory: false,
        answerers: new Set(), drafts: new Map(), submitted: new Set(),
        answers: [], groupOf: new Map(), invalid: new Set(), results: null,
      };
      room.phase = "category";
      room.deadline = Date.now() + CATEGORY_TIME * 1000;
      return;
    }
    room.phase = "end";
    room.endNote = "";
  }

  function startAnswer(room, category, random = false) {
    const r = room.round;
    r.category = clean(category, 80) || pick(CATEGORIES);
    r.randomCategory = random;
    r.answerers = new Set(connected(room).filter((p) => p.id !== r.judgeId).map((p) => p.id));
    room.phase = "answer";
    room.deadline = Date.now() + room.settings.answerTime * 1000;
  }

  function maybeAllSubmitted(room) {
    const r = room.round;
    if (room.phase !== "answer") return;
    const waiting = [...r.answerers].filter((id) => room.players.get(id)?.connected && !r.submitted.has(id));
    if (waiting.length === 0) startReview(room);
  }

  function startReview(room) {
    const r = room.round;
    let n = 0;
    r.answers = []; r.groupOf = new Map(); r.invalid = new Set();
    for (const pid of r.answerers) {
      const seen = new Set();
      for (const text of r.drafts.get(pid) || []) {
        if (!text) continue;
        const key = normalize(text);
        if (seen.has(key)) continue; // gleiche Antwort zweimal von derselben Person zählt einmal
        seen.add(key);
        const a = { id: "a" + (++n), playerId: pid, name: room.players.get(pid)?.name || "?", text, key };
        r.answers.push(a);
        r.groupOf.set(a.id, "k:" + key);
      }
    }
    room.phase = "review";
    room.deadline = null;
  }

  function finishReview(room) {
    const r = room.round;
    const groups = buildGroups(r);
    const { pts, bonus } = roundPoints(r, groups);
    r.results = { pts, bonus };
    for (const [id, p] of Object.entries(pts)) { const pl = room.players.get(id); if (pl) pl.score += p; }
    const judge = room.players.get(r.judgeId);
    if (judge) judge.score += bonus;
    room.phase = "results";
    room.deadline = null;
  }

  function canJudge(room, pid) {
    const r = room.round;
    if (!r) return false;
    if (pid === r.judgeId) return true;
    const judge = room.players.get(r.judgeId);
    return pid === room.hostId && (!judge || !judge.connected); // Host springt ein, wenn der Richter weg ist
  }

  // ---------------- Verbindungen ----------------
  nsp.on("connection", (socket) => {
    let room = null, playerId = null;
    const toast = (msg) => socket.emit("toast", msg);
    const isHost = () => room && room.hostId === playerId;
    const guard = (fn) => (...args) => {
      if (!room || !room.players.has(playerId)) return;
      try { fn(...args); update(room); }
      catch (e) { if (e instanceof GameError) toast(e.message); else { console.error(e); toast("Da ist etwas schiefgelaufen."); } }
    };

    function attach(r, id, name) {
      let p = r.players.get(id);
      if (!p) {
        if (r.players.size >= MAX_PLAYERS) throw new GameError("Der Raum ist voll.");
        if ([...r.players.values()].some((x) => x.name.toLowerCase() === name.toLowerCase())) name = name + " " + (r.players.size + 1);
        p = { id, name, score: 0, connected: true };
        r.players.set(id, p);
        // Wer während der Antwortphase dazukommt, darf gleich mitmachen
        if (r.phase === "answer" && r.round) r.round.answerers.add(id);
      }
      const old = r.sockets.get(id);
      if (old && old !== socket.id) nsp.to(old).emit("kicked", "In einem anderen Tab geöffnet.");
      r.sockets.set(id, socket.id);
      p.connected = true;
      room = r; playerId = id;
      socket.join(r.code);
      ensureHost(r);
      update(r);
    }

    socket.on("create", ({ name, playerId: id, settings } = {}) => {
      name = clean(name, 14); id = clean(id, 40);
      if (!name || !id) return toast("Bitte gib einen Namen ein.");
      const code = makeCode();
      const r = {
        code, hostId: id, phase: "lobby", settings: cleanSettings(settings), players: new Map(), sockets: new Map(),
        round: null, roundNo: 0, judgeOrder: [], deadline: null, timer: null, lastActive: Date.now(), endNote: "",
      };
      rooms.set(code, r);
      try { attach(r, id, name); } catch (e) { toast(e.message); }
    });

    socket.on("join", ({ code, name, playerId: id } = {}) => {
      code = clean(code, 4).toUpperCase(); name = clean(name, 14); id = clean(id, 40);
      const r = rooms.get(code);
      if (!r) { socket.emit("noroom"); return toast("Raum " + (code || "?") + " gibt es nicht (mehr)."); }
      if (!id) return;
      if (!r.players.has(id) && !name) return toast("Bitte gib einen Namen ein.");
      try { attach(r, id, name || r.players.get(id).name); } catch (e) { toast(e.message); }
    });

    socket.on("settings", guard((raw) => {
      if (!isHost() || room.phase !== "lobby") return;
      room.settings = cleanSettings(raw, room.settings);
    }));

    socket.on("start", guard(() => {
      if (!isHost() || room.phase !== "lobby") return;
      const order = connected(room).map((p) => p.id);
      if (order.length < MIN_PLAYERS) throw new GameError("Es braucht mindestens " + MIN_PLAYERS + " Spieler.");
      for (const p of room.players.values()) p.score = 0;
      room.judgeOrder = [];
      for (let c = 0; c < room.settings.cycles; c++) room.judgeOrder.push(...order);
      room.roundNo = 0;
      nextRound(room);
    }));

    socket.on("category", guard((text) => {
      if (room.phase !== "category" || room.round.judgeId !== playerId) return;
      const c = clean(text, 80);
      if (!c) throw new GameError("Schreib eine Kategorie.");
      startAnswer(room, c);
    }));

    // Entwürfe werden still gespeichert (damit beim Zeitablauf das Getippte zählt), "final" schickt ab
    socket.on("answers", ({ list, final } = {}) => {
      if (!room || !room.players.has(playerId)) return;
      const r = room.round;
      if (room.phase !== "answer" || !r.answerers.has(playerId) || r.submitted.has(playerId)) return;
      const arr = (Array.isArray(list) ? list : []).slice(0, room.settings.answers).map((x) => clean(x, MAX_ANSWER_LEN));
      r.drafts.set(playerId, arr);
      if (!final) return;
      if (!arr.some(Boolean)) return toast("Schreib mindestens eine Antwort.");
      r.submitted.add(playerId);
      maybeAllSubmitted(room);
      update(room);
    });

    socket.on("unsubmit", guard(() => {
      if (room.phase === "answer") room.round.submitted.delete(playerId);
    }));

    // --- Prüfen (nur Richter, oder Host falls Richter weg) ---
    socket.on("merge", guard(({ from, into } = {}) => {
      const r = room.round;
      if (room.phase !== "review" || !canJudge(room, playerId) || from === into) return;
      const ids = new Set(r.groupOf.values());
      if (!ids.has(from) || !ids.has(into)) return;
      for (const [aid, gid] of r.groupOf) if (gid === from) r.groupOf.set(aid, into);
      if (r.invalid.has(from)) { r.invalid.delete(from); }
    }));

    socket.on("split", guard((answerId) => {
      const r = room.round;
      if (room.phase !== "review" || !canJudge(room, playerId) || !r.groupOf.has(answerId)) return;
      const old = r.groupOf.get(answerId);
      const nid = "s:" + answerId;
      r.groupOf.set(answerId, nid);
      if (r.invalid.has(old)) r.invalid.add(nid);
    }));

    socket.on("invalid", guard(({ group, on } = {}) => {
      const r = room.round;
      if (room.phase !== "review" || !canJudge(room, playerId)) return;
      if (on) r.invalid.add(group); else r.invalid.delete(group);
    }));

    socket.on("finish", guard(() => {
      if (room.phase !== "review" || !canJudge(room, playerId)) return;
      finishReview(room);
    }));

    socket.on("next", guard(() => {
      if (room.phase !== "results") return;
      if (!isHost() && room.round.judgeId !== playerId) return;
      nextRound(room);
    }));

    socket.on("toLobby", guard(() => {
      if (!isHost()) return;
      room.phase = "lobby"; room.round = null; room.deadline = null; room.judgeOrder = []; room.roundNo = 0;
      for (const [id, p] of room.players) if (!p.connected) room.players.delete(id); // Abwesende entfernen
    }));

    socket.on("leave", () => {
      if (!room) return;
      const r = room;
      removePlayer(r, playerId);
      socket.leave(r.code);
      room = null;
      update(r);
    });

    socket.on("disconnect", () => {
      if (!room || room.sockets.get(playerId) !== socket.id) return;
      const r = room;
      r.sockets.delete(playerId);
      const p = r.players.get(playerId);
      if (!p) return;
      if (r.phase === "lobby") { r.players.delete(playerId); } // vor dem Start: Platz freigeben
      else {
        p.connected = false;
        afterLeave(r, playerId);
      }
      ensureHost(r);
      update(r);
    });
  });

  function removePlayer(r, id) {
    r.sockets.delete(id);
    r.players.delete(id);
    if (r.round) { r.round.answerers.delete(id); r.round.submitted.delete(id); }
    afterLeave(r, id);
    ensureHost(r);
  }

  function afterLeave(r, id) {
    const round = r.round;
    if (!round) return;
    if (r.phase === "category" && round.judgeId === id) {
      r.deadline = Math.min(r.deadline || Infinity, Date.now() + DISCONNECT_GRACE);
    }
    if (r.phase === "answer") maybeAllSubmitted(r);
  }

  // Leere Räume nach 30 Minuten aufräumen
  setInterval(() => {
    const now = Date.now();
    for (const [code, r] of rooms) {
      const anyone = [...r.players.values()].some((p) => p.connected);
      if (!anyone && now - r.lastActive > 30 * 60 * 1000) { clearTimeout(r.timer); rooms.delete(code); }
    }
  }, 60 * 1000);
};

module.exports.normalize = normalize;
module.exports.CATEGORIES = CATEGORIES;
