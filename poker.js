// Poker – Räume, Timer und Verbindungen (Socket.io-Bereich "/poker")
const { Table, PokerError } = require("./poker-engine");

const TURN_TIMES = [0, 15, 30, 60];          // 0 = kein Limit
const DISCONNECT_GRACE = 8000;               // so lange wartet man auf jemanden ohne Verbindung
const PAUSE_STREET = 800, PAUSE_RUNOUT = 1500, PAUSE_FOLD_WIN = 3500, PAUSE_SHOWDOWN = 6500;

const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
const int = (v, min, max, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };

function cleanSettings(raw = {}, base = {}) {
  const sb = int(raw.sb, 1, 50000, base.sb ?? 10);
  const bb = int(raw.bb, sb, 100000, Math.max(sb, base.bb ?? 20));
  const startChips = int(raw.startChips, bb * 10, 1000000, Math.max(bb * 10, base.startChips ?? 1000));
  const turnTime = TURN_TIMES.includes(Number(raw.turnTime)) ? Number(raw.turnTime) : (base.turnTime ?? 30);
  return { sb, bb, startChips, turnTime };
}

module.exports = function setupPoker(io) {
  const nsp = io.of("/poker");
  const rooms = new Map();

  function makeCode() {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    let code;
    do { code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join(""); } while (rooms.has(code));
    return code;
  }

  // ---------------- Zustand senden ----------------
  function broadcast(room) {
    const now = Date.now();
    for (const p of room.table.players.values()) {
      const sid = room.sockets.get(p.id);
      if (!sid) continue;
      nsp.to(sid).emit("state", {
        ...room.table.view(p.id),
        code: room.code, me: p.id, hostId: room.hostId, started: room.started, paused: room.paused,
        deadline: room.deadline, serverNow: now,
        mySitOut: !!p.manualSitOut,
      });
    }
  }

  function ensureHost(room) {
    const host = room.table.players.get(room.hostId);
    if (host && host.connected && !host.leaving) return;
    const next = [...room.table.players.values()].find((p) => p.connected && !p.leaving);
    if (next) room.hostId = next.id;
  }

  // ---------------- Ablauf (Timer) ----------------
  function phaseKey(h) { return h ? `${h.no}|${h.street}|${h.phase}|${h.actions}|${h.toAct}` : "none"; }

  function schedule(room) {
    clearTimeout(room.timer);
    const t = room.table, h = t.hand, now = Date.now();
    const key = phaseKey(h);
    if (key !== room.key) { // neuer Abschnitt: Zeitpunkt und Deadline neu setzen
      room.key = key; room.since = now;
      room.deadline = null;
      if (h && h.phase === "betting") {
        const actor = t.players.get(h.toAct);
        if (t.settings.turnTime) room.deadline = now + t.settings.turnTime * 1000;
        if (actor && !actor.connected) room.deadline = Math.min(room.deadline || Infinity, now + DISCONNECT_GRACE);
      }
    }
    if (!room.started) return;
    const elapsed = now - room.since;

    if (!h || h.phase === "done") {
      const wait = !h ? 0 : h.result.byFold ? PAUSE_FOLD_WIN : PAUSE_SHOWDOWN;
      room.timer = setTimeout(() => {
        if (room.paused) { t.cleanup(); ensureHost(room); broadcast(room); return; }
        t.cleanup();
        ensureHost(room);
        // Nur weitermachen, wenn genug Spieler da sind; sonst warten, bis jemand dazukommt
        if (t.eligibleCount() >= 2 && t.startHand()) update(room);
        else broadcast(room);
      }, Math.max(0, wait - elapsed));
      return;
    }
    if (h.phase === "between") {
      room.timer = setTimeout(() => { t.proceed(); update(room); }, Math.max(0, (h.runout ? PAUSE_RUNOUT : PAUSE_STREET) - elapsed));
      return;
    }
    if (h.phase === "betting" && room.deadline) {
      room.timer = setTimeout(() => {
        try { t.timeout(); } catch (e) { console.error(e); }
        update(room);
      }, Math.max(0, room.deadline - now));
    }
  }

  function update(room) { schedule(room); broadcast(room); room.lastActive = Date.now(); }

  // ---------------- Verbindungen ----------------
  nsp.on("connection", (socket) => {
    let room = null, playerId = null;
    const toast = (msg) => socket.emit("toast", msg);
    const isHost = () => room && room.hostId === playerId;
    const guard = (fn) => (...args) => {
      if (!room) return;
      try { fn(...args); update(room); }
      catch (e) { if (e instanceof PokerError) toast(e.message); else { console.error(e); toast("Da ist etwas schiefgelaufen."); } }
    };

    function attach(r, id, name) {
      const t = r.table;
      let p = t.players.get(id);
      if (!p) {
        if ([...t.players.values()].some((x) => x.name.toLowerCase() === name.toLowerCase())) name = name + " " + (t.players.size + 1);
        p = t.addPlayer(id, name); // wirft, wenn der Tisch voll ist
      }
      const old = r.sockets.get(id);
      if (old && old !== socket.id) nsp.to(old).emit("kicked", "In einem anderen Tab geöffnet.");
      r.sockets.set(id, socket.id);
      p.connected = true; p.leaving = false;
      if (!p.manualSitOut) p.sittingOut = false;
      room = r; playerId = id;
      socket.join(r.code);
      ensureHost(r);
      update(r);
    }

    socket.on("create", ({ name, playerId: id, settings } = {}) => {
      name = clean(name, 14); id = clean(id, 40);
      if (!name || !id) return toast("Bitte gib einen Namen ein.");
      const code = makeCode();
      const r = { code, table: new Table(cleanSettings(settings)), hostId: id, started: false, paused: false, sockets: new Map(), lastActive: Date.now() };
      rooms.set(code, r);
      try { attach(r, id, name); } catch (e) { toast(e.message); }
    });

    socket.on("join", ({ code, name, playerId: id } = {}) => {
      code = clean(code, 4).toUpperCase(); name = clean(name, 14); id = clean(id, 40);
      const r = rooms.get(code);
      if (!r) return toast("Raum " + (code || "?") + " gibt es nicht (mehr).");
      if (!r.table.players.has(id) && !name) return toast("Bitte gib einen Namen ein.");
      try { attach(r, id, name || r.table.players.get(id).name); } catch (e) { toast(e.message); }
    });

    socket.on("start", guard(() => {
      if (!isHost()) return;
      if (room.table.eligibleCount() < 2) throw new PokerError("Es braucht mindestens 2 Spieler mit Chips.");
      room.started = true; room.paused = false;
    }));

    socket.on("act", guard(({ type, amount } = {}) => {
      room.table.act(playerId, String(type), Number(amount));
    }));

    socket.on("rebuy", guard(() => { room.table.rebuy(playerId); }));

    socket.on("sitout", guard((on) => {
      const p = room.table.players.get(playerId);
      p.manualSitOut = !!on; p.sittingOut = !!on;
    }));

    socket.on("show", guard(() => { room.table.show(playerId); }));

    socket.on("settings", guard((raw) => {
      if (!isHost()) return;
      room.table.settings = cleanSettings(raw, room.table.settings);
    }));

    socket.on("pause", guard((on) => {
      if (!isHost()) return;
      room.paused = !!on;
    }));

    socket.on("kick", guard((id) => {
      if (!isHost() || id === playerId) return;
      const p = room.table.players.get(id);
      if (!p) return;
      const sid = room.sockets.get(id);
      if (sid) nsp.to(sid).emit("kicked", "Du wurdest vom Tisch entfernt.");
      room.sockets.delete(id);
      room.table.leave(id);
      ensureHost(room);
    }));

    socket.on("leave", () => {
      if (!room) return;
      const r = room;
      r.table.leave(playerId);
      r.sockets.delete(playerId);
      socket.leave(r.code);
      room = null;
      ensureHost(r);
      update(r);
    });

    socket.on("disconnect", () => {
      if (!room || room.sockets.get(playerId) !== socket.id) return;
      const p = room.table.players.get(playerId);
      room.sockets.delete(playerId);
      if (!p) return;
      p.connected = false;
      const h = room.table.hand;
      if (!room.started && !h) { room.table.leave(playerId); } // vor dem Start: Platz freigeben
      else if (h && h.phase === "betting" && h.toAct === playerId) {
        room.deadline = Math.min(room.deadline || Infinity, Date.now() + DISCONNECT_GRACE);
      }
      ensureHost(room);
      update(room);
    });
  });

  // Leere Räume nach 30 Minuten aufräumen
  setInterval(() => {
    const now = Date.now();
    for (const [code, r] of rooms) {
      const anyone = [...r.table.players.values()].some((p) => p.connected);
      if (!anyone && now - r.lastActive > 30 * 60 * 1000) { clearTimeout(r.timer); rooms.delete(code); }
    }
  }, 60 * 1000);
};
