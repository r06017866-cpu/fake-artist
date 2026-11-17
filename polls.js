// Umfrage-Tool: API und Speicher
// Mit DATABASE_URL (z.B. von Neon) werden Umfragen dauerhaft gespeichert.
// Ohne DATABASE_URL landen sie nur im Arbeitsspeicher (gehen beim Neustart verloren).
const crypto = require("crypto");
const express = require("express");

const MAX_OPTIONS = 12;
const MAX_QUESTIONS = 10;
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
  // Datenbank starten. Ein Fehler darf nie den ganzen Server (und damit Fake Artist) abstürzen lassen.
  let ready;
  const start = () => {
    ready = store.init().then(() => console.log("Umfragen werden gespeichert in: " + store.kind));
    ready.catch((e) => console.error("Datenbank nicht erreichbar:", e.message));
  };
  start();
  setInterval(() => store.cleanup().catch(() => {}), 6 * 3600 * 1000);

  const router = express.Router();
  router.use(express.json({ limit: "20kb" }));
  router.use(async (_req, res, next) => {
    try { await ready; next(); }
    catch { start(); res.status(503).json({ error: "Datenbank nicht erreichbar. Versuch es gleich nochmal." }); }
  });

  // Einfache Bremse gegen Spam: max. 30 neue Umfragen pro Stunde und IP
  const created = new Map();
  const tooMany = (ip) => {
    const now = Date.now();
    const list = (created.get(ip) || []).filter((t) => now - t < 3600e3);
    list.push(now); created.set(ip, list);
    return list.length > 30;
  };

  // Alte Umfragen (nur eine Frage) ins neue Format bringen
  function normalize(entry) {
    if (!entry) return null;
    const { poll } = entry;
    if (!Array.isArray(poll.questions)) {
      poll.questions = [{ text: poll.question, options: poll.options, type: poll.multi ? "multi" : "single" }];
      poll.title = poll.question;
      entry.votes = entry.votes.map((v) => (Array.isArray(v.choices) && v.choices.length && !Array.isArray(v.choices[0]) ? { ...v, choices: [v.choices] } : v));
    }
    return entry;
  }
  const load = async (id) => normalize(await store.get(id));

  // Ergebnisse einer Frage berechnen
  function questionResults(q, qi, votes, withNames) {
    const n = q.options.length;
    const answers = votes.map((v) => ({ name: v.name || "?", a: (v.choices && v.choices[qi]) || [] })).filter((x) => x.a.length);
    if (q.type === "rank") {
      // Punkte: Platz 1 = n Punkte, Platz 2 = n-1 Punkte, … (nicht gerankt = 0)
      const points = q.options.map(() => 0), posSum = q.options.map(() => 0), posCount = q.options.map(() => 0);
      for (const { a } of answers) a.forEach((opt, pos) => { if (opt >= 0 && opt < n) { points[opt] += n - pos; posSum[opt] += pos + 1; posCount[opt]++; } });
      return {
        responders: answers.length,
        points,
        maxPoints: answers.length * n,
        avgPlace: posSum.map((s, i) => (posCount[i] ? Math.round((s / posCount[i]) * 10) / 10 : null)),
        rankings: withNames ? answers.map((x) => ({ name: x.name, order: x.a })) : null,
      };
    }
    const counts = q.options.map(() => 0), who = q.options.map(() => []);
    for (const { name, a } of answers) for (const c of a) if (c >= 0 && c < n) { counts[c]++; who[c].push(name); }
    return { responders: answers.length, counts, who: withNames ? who : null };
  }

  // Was jemand sehen darf
  function view(entry, voter, admin) {
    const { poll, votes } = entry;
    const isAdmin = !!admin && admin === poll.adminKey;
    const mine = votes.find((v) => v.voter === voter) || null;
    const canSee = !poll.hideResults || !!mine || isAdmin || poll.closed;
    return {
      id: poll.id,
      title: poll.title,
      questions: poll.questions,
      names: poll.names,
      hideResults: poll.hideResults,
      closed: poll.closed,
      createdAt: poll.createdAt,
      isAdmin,
      myVote: mine ? { name: mine.name, answers: mine.choices } : null,
      voterCount: votes.length,
      results: canSee ? poll.questions.map((q, i) => questionResults(q, i, votes, poll.names)) : null,
    };
  }

  const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: "Da ist etwas schiefgelaufen. Versuch es nochmal." });
  });

  router.post("/polls", wrap(async (req, res) => {
    if (tooMany(req.ip)) return res.status(429).json({ error: "Zu viele Umfragen erstellt. Warte etwas." });
    const b = req.body || {};
    const rawQuestions = Array.isArray(b.questions) ? b.questions : [{ text: b.question, options: b.options, type: b.multi ? "multi" : "single" }];
    if (rawQuestions.length > MAX_QUESTIONS) return res.status(400).json({ error: "Maximal " + MAX_QUESTIONS + " Fragen pro Umfrage." });
    const questions = [];
    for (const [i, rq] of rawQuestions.entries()) {
      const text = clean(rq && rq.text, 200);
      const seen = new Set();
      const options = (Array.isArray(rq && rq.options) ? rq.options : [])
        .map((o) => clean(o, 100))
        .filter((o) => o && !seen.has(o.toLowerCase()) && seen.add(o.toLowerCase()))
        .slice(0, MAX_OPTIONS);
      const label = rawQuestions.length > 1 ? `Frage ${i + 1}: ` : "";
      if (!text) return res.status(400).json({ error: label + "Bitte gib eine Frage ein." });
      if (options.length < 2) return res.status(400).json({ error: label + "Es braucht mindestens 2 verschiedene Antworten." });
      const type = ["single", "multi", "rank"].includes(rq.type) ? rq.type : "single";
      questions.push({ text, options, type });
    }
    if (!questions.length) return res.status(400).json({ error: "Bitte gib mindestens eine Frage ein." });
    const poll = {
      id: randomId(6),
      adminKey: randomId(16),
      title: clean(b.title, 120) || questions[0].text,
      questions,
      names: !!b.names,
      hideResults: !!b.hideResults,
      closed: false,
      createdAt: Date.now(),
    };
    await store.create(poll);
    res.json({ id: poll.id, adminKey: poll.adminKey });
  }));

  router.get("/polls/:id", wrap(async (req, res) => {
    const entry = await load(clean(req.params.id, 12));
    if (!entry) return res.status(404).json({ error: "Diese Umfrage gibt es nicht (mehr)." });
    res.json(view(entry, clean(req.query.voter, 40), clean(req.query.admin, 40)));
  }));

  router.post("/polls/:id/vote", wrap(async (req, res) => {
    const id = clean(req.params.id, 12);
    const entry = await load(id);
    if (!entry) return res.status(404).json({ error: "Diese Umfrage gibt es nicht (mehr)." });
    const { poll } = entry;
    if (poll.closed) return res.status(400).json({ error: "Die Umfrage ist bereits geschlossen." });
    const b = req.body || {};
    const voter = clean(b.voter, 40);
    if (voter.length < 8) return res.status(400).json({ error: "Ungültige Anfrage." });
    const raw = Array.isArray(b.answers) ? b.answers : [];
    const answers = poll.questions.map((q, i) => {
      let a = [...new Set((Array.isArray(raw[i]) ? raw[i] : []).map(Number))]
        .filter((c) => Number.isInteger(c) && c >= 0 && c < q.options.length);
      if (q.type === "single") a = a.slice(0, 1);
      return a;
    });
    const withdraw = answers.every((a) => a.length === 0);
    if (!withdraw) {
      const missing = answers.findIndex((a) => a.length === 0);
      if (missing >= 0) return res.status(400).json({ error: poll.questions.length > 1 ? `Bitte beantworte noch Frage ${missing + 1}.` : "Bitte wähle eine Antwort." });
    }
    const name = poll.names ? clean(b.name, 30) : "";
    if (poll.names && !withdraw && !name) return res.status(400).json({ error: "Bitte gib deinen Namen ein." });
    await store.vote(id, { voter, name, choices: withdraw ? [] : answers });
    res.json(view(await load(id), voter, clean(b.admin, 40)));
  }));

  router.post("/polls/:id/close", wrap(async (req, res) => {
    const id = clean(req.params.id, 12);
    const entry = await load(id);
    const b = req.body || {};
    if (!entry || entry.poll.adminKey !== clean(b.admin, 40)) return res.status(403).json({ error: "Nur wer die Umfrage erstellt hat, darf das." });
    await store.setClosed(id, !!b.closed);
    res.json(view(await load(id), clean(b.voter, 40), entry.poll.adminKey));
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
