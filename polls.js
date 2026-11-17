// Umfrage-Tool: API und Speicher
// Mit DATABASE_URL (z.B. von Neon) werden Umfragen dauerhaft gespeichert.
// Ohne DATABASE_URL landen sie nur im Arbeitsspeicher (gehen beim Neustart verloren).
const crypto = require("crypto");
const express = require("express");

const MAX_OPTIONS = 12;
const KEEP_DAYS = 60; // Umfragen werden nach 60 Tagen automatisch gelöscht

const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const randomId = (len) => {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789"; // ohne l, o, 0, 1 (Verwechslung)
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
};

// ---------------- Speicher ----------------
function memoryStore() {
  const polls = new Map(); // id -> { poll, votes: Map(voter -> vote) }
  return {
    kind: "Arbeitsspeicher (nicht dauerhaft!)",
    async init() {},
    async create(poll) { polls.set(poll.id, { poll, votes: new Map() }); },
    async get(id) {
      const e = polls.get(id);
      return e ? { poll: e.poll, votes: [...e.votes.values()] } : null;
    },
    async vote(id, vote) {
      const e = polls.get(id); if (!e) return;
      if (vote.choices.length === 0) e.votes.delete(vote.voter);
      else e.votes.set(vote.voter, { ...e.votes.get(vote.voter), ...vote, updatedAt: Date.now() });
    },
    async setClosed(id, closed) { const e = polls.get(id); if (e) e.poll.closed = closed; },
    async remove(id) { polls.delete(id); },
    async cleanup() {
      const limit = Date.now() - KEEP_DAYS * 864e5;
      for (const [id, e] of polls) if (e.poll.createdAt < limit) polls.delete(id);
    },
  };
}

// Verbindungs-Link aufräumen, falls er z.B. als "psql 'postgresql://…'" eingefügt wurde
function normalizeUrl(raw) {
  let url = String(raw).trim().replace(/^psql\s+/, "").replace(/^['"]|['"]$/g, "");
  try {
    const u = new URL(url);
    u.searchParams.delete("channel_binding");
    if (["require", "prefer", "verify-ca"].includes(u.searchParams.get("sslmode"))) u.searchParams.set("sslmode", "verify-full");
    url = u.toString();
  } catch {}
  return url;
}

function postgresStore(url) {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: normalizeUrl(url), max: 3 });
  pool.on("error", (e) => console.error("Datenbank-Fehler:", e.message));
  const toPoll = (row) => ({ ...row.data, id: row.id, adminKey: row.admin_key, closed: row.closed, createdAt: Number(row.created_ms) });
  return {
    kind: "Postgres-Datenbank",
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS polls (
          id TEXT PRIMARY KEY,
          admin_key TEXT NOT NULL,
          data JSONB NOT NULL,
          closed BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS votes (
          poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
          voter_id TEXT NOT NULL,
          name TEXT,
          choices JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (poll_id, voter_id)
        );`);
    },
    async create(p) {
      const { id, adminKey, closed, createdAt, ...data } = p;
      await pool.query("INSERT INTO polls (id, admin_key, data) VALUES ($1, $2, $3)", [id, adminKey, data]);
    },
    async get(id) {
      const r = await pool.query("SELECT id, admin_key, data, closed, (EXTRACT(EPOCH FROM created_at) * 1000)::BIGINT AS created_ms FROM polls WHERE id = $1", [id]);
      if (!r.rows[0]) return null;
      const v = await pool.query("SELECT voter_id, name, choices FROM votes WHERE poll_id = $1 ORDER BY updated_at", [id]);
      return { poll: toPoll(r.rows[0]), votes: v.rows.map((x) => ({ voter: x.voter_id, name: x.name, choices: x.choices })) };
    },
    async vote(id, { voter, name, choices }) {
      if (choices.length === 0) await pool.query("DELETE FROM votes WHERE poll_id = $1 AND voter_id = $2", [id, voter]);
      else await pool.query(
        `INSERT INTO votes (poll_id, voter_id, name, choices) VALUES ($1, $2, $3, $4)
         ON CONFLICT (poll_id, voter_id) DO UPDATE SET name = EXCLUDED.name, choices = EXCLUDED.choices, updated_at = NOW()`,
        [id, voter, name || null, JSON.stringify(choices)]);
    },
    async setClosed(id, closed) { await pool.query("UPDATE polls SET closed = $2 WHERE id = $1", [id, closed]); },
    async remove(id) { await pool.query("DELETE FROM polls WHERE id = $1", [id]); },
    async cleanup() { await pool.query(`DELETE FROM polls WHERE created_at < NOW() - INTERVAL '${KEEP_DAYS} days'`); },
  };
}

// ---------------- API ----------------
function createPollRouter() {
  const store = process.env.DATABASE_URL ? postgresStore(process.env.DATABASE_URL) : memoryStore();
  let ready = store.init()
    .then(() => console.log("Umfragen werden gespeichert in: " + store.kind))
    .catch((e) => { console.error("Datenbank konnte nicht gestartet werden:", e.message); throw e; });
  setInterval(() => store.cleanup().catch(() => {}), 6 * 3600 * 1000);

  const router = express.Router();
  router.use(express.json({ limit: "20kb" }));
  router.use(async (_req, res, next) => {
    try { await ready; next(); }
    catch { ready = store.init(); res.status(503).json({ error: "Datenbank nicht erreichbar. Versuch es gleich nochmal." }); }
  });

  // Einfache Bremse gegen Spam: max. 30 neue Umfragen pro Stunde und IP
  const created = new Map();
  const tooMany = (ip) => {
    const now = Date.now();
    const list = (created.get(ip) || []).filter((t) => now - t < 3600e3);
    list.push(now); created.set(ip, list);
    return list.length > 30;
  };

  // Was jemand sehen darf
  function view(entry, voter, admin) {
    const { poll, votes } = entry;
    const isAdmin = !!admin && admin === poll.adminKey;
    const mine = votes.find((v) => v.voter === voter) || null;
    const canSee = !poll.hideResults || !!mine || isAdmin || poll.closed;
    const out = {
      id: poll.id,
      question: poll.question,
      options: poll.options,
      multi: poll.multi,
      names: poll.names,
      hideResults: poll.hideResults,
      closed: poll.closed,
      createdAt: poll.createdAt,
      isAdmin,
      myVote: mine ? { name: mine.name, choices: mine.choices } : null,
      voterCount: votes.length,
      results: null,
    };
    if (canSee) {
      const counts = poll.options.map(() => 0);
      const who = poll.options.map(() => []);
      for (const v of votes) for (const c of v.choices) if (c >= 0 && c < counts.length) { counts[c]++; if (poll.names) who[c].push(v.name || "?"); }
      out.results = { counts, who: poll.names ? who : null };
    }
    return out;
  }

  const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: "Da ist etwas schiefgelaufen. Versuch es nochmal." });
  });

  router.post("/polls", wrap(async (req, res) => {
    if (tooMany(req.ip)) return res.status(429).json({ error: "Zu viele Umfragen erstellt. Warte etwas." });
    const b = req.body || {};
    const question = clean(b.question, 200);
    const seen = new Set();
    const options = (Array.isArray(b.options) ? b.options : [])
      .map((o) => clean(o, 100))
      .filter((o) => o && !seen.has(o.toLowerCase()) && seen.add(o.toLowerCase()))
      .slice(0, MAX_OPTIONS);
    if (!question) return res.status(400).json({ error: "Bitte gib eine Frage ein." });
    if (options.length < 2) return res.status(400).json({ error: "Es braucht mindestens 2 verschiedene Antworten." });
    const poll = {
      id: randomId(6),
      adminKey: randomId(16),
      question, options,
      multi: !!b.multi,
      names: !!b.names,
      hideResults: !!b.hideResults,
      closed: false,
      createdAt: Date.now(),
    };
    await store.create(poll);
    res.json({ id: poll.id, adminKey: poll.adminKey });
  }));

  router.get("/polls/:id", wrap(async (req, res) => {
    const entry = await store.get(clean(req.params.id, 12));
    if (!entry) return res.status(404).json({ error: "Diese Umfrage gibt es nicht (mehr)." });
    res.json(view(entry, clean(req.query.voter, 40), clean(req.query.admin, 40)));
  }));

  router.post("/polls/:id/vote", wrap(async (req, res) => {
    const id = clean(req.params.id, 12);
    const entry = await store.get(id);
    if (!entry) return res.status(404).json({ error: "Diese Umfrage gibt es nicht (mehr)." });
    const { poll } = entry;
    if (poll.closed) return res.status(400).json({ error: "Die Umfrage ist bereits geschlossen." });
    const b = req.body || {};
    const voter = clean(b.voter, 40);
    if (voter.length < 8) return res.status(400).json({ error: "Ungültige Anfrage." });
    let choices = [...new Set((Array.isArray(b.choices) ? b.choices : []).map(Number))]
      .filter((c) => Number.isInteger(c) && c >= 0 && c < poll.options.length);
    if (!poll.multi) choices = choices.slice(0, 1);
    const name = poll.names ? clean(b.name, 30) : "";
    if (poll.names && choices.length && !name) return res.status(400).json({ error: "Bitte gib deinen Namen ein." });
    await store.vote(id, { voter, name, choices });
    res.json(view(await store.get(id), voter, clean(b.admin, 40)));
  }));

  router.post("/polls/:id/close", wrap(async (req, res) => {
    const id = clean(req.params.id, 12);
    const entry = await store.get(id);
    const b = req.body || {};
    if (!entry || entry.poll.adminKey !== clean(b.admin, 40)) return res.status(403).json({ error: "Nur wer die Umfrage erstellt hat, darf das." });
    await store.setClosed(id, !!b.closed);
    res.json(view(await store.get(id), clean(b.voter, 40), entry.poll.adminKey));
  }));

  router.post("/polls/:id/delete", wrap(async (req, res) => {
    const id = clean(req.params.id, 12);
    const entry = await store.get(id);
    if (!entry || entry.poll.adminKey !== clean((req.body || {}).admin, 40)) return res.status(403).json({ error: "Nur wer die Umfrage erstellt hat, darf das." });
    await store.remove(id);
    res.json({ ok: true });
  }));

  return router;
}

module.exports = { createPollRouter };
