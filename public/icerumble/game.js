// ICE RUMBLE – push the other penguins off the ice!
// Single-file game: canvas rendering, physics, bots, progression, synth audio. No external requests.
(() => {
"use strict";

// ======================================================================
// Utils
// ======================================================================
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const len = (x, y) => Math.hypot(x, y);
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const $ = (id) => document.getElementById(id);

// ======================================================================
// Config
// ======================================================================
const ARENAS = [
  { id: "floe", name: "Ice Floe", desc: "The edge keeps breaking off.", icon: "🧊", level: 1, radius: 520, minR: 150, shrinkEvery: 8, shrinkBy: 40 },
  { id: "storm", name: "Snowstorm", desc: "Gusts of wind push everyone around.", icon: "🌨️", level: 3, radius: 520, minR: 160, shrinkEvery: 10, shrinkBy: 38, wind: true },
  { id: "glacier", name: "Glacier", desc: "Holes crack open in the ice.", icon: "🕳️", level: 6, radius: 540, minR: 170, shrinkEvery: 11, shrinkBy: 36, holes: true },
  { id: "spin", name: "Spinning Floe", desc: "The ice turns and flings you outward.", icon: "🌀", level: 10, radius: 520, minR: 170, shrinkEvery: 11, shrinkBy: 34, spin: true },
  { id: "seals", name: "Seal Territory", desc: "Seals charge across the ice!", icon: "🦭", level: 14, radius: 540, minR: 170, shrinkEvery: 11, shrinkBy: 36, seals: true },
  { id: "night", name: "Polar Night", desc: "Darkness. You only see what's close.", icon: "🌌", level: 19, radius: 520, minR: 160, shrinkEvery: 10, shrinkBy: 38, night: true },
  { id: "drift", name: "Drifting Floes", desc: "The floes drift apart. Boost to jump!", icon: "🧩", level: 25, radius: 520, minR: 0, shrinkEvery: 12, shrinkBy: 0, drift: true },
];
const UPGRADES = [
  { id: "push", name: "Push Power", icon: "💥", desc: "Knock others farther", per: "+6% push" },
  { id: "speed", name: "Speed", icon: "💨", desc: "Waddle faster", per: "+3% speed" },
  { id: "boost", name: "Boost Recharge", icon: "⚡", desc: "Boost more often", per: "-5% cooldown" },
  { id: "weight", name: "Weight", icon: "🏋️", desc: "Harder to push around", per: "+5% weight" },
];
const UPGRADE_MAX = 10;
const UPGRADE_COST = [40, 70, 110, 170, 250, 350, 480, 640, 840, 1080];
const SKINS = [
  { id: "classic", name: "Classic", price: 0, body: "#1f2b45", belly: "#ffffff" },
  { id: "beanie", name: "Cozy Beanie", price: 150, body: "#1f2b45", belly: "#ffffff", acc: "beanie", accColor: "#e8443a" },
  { id: "scarf", name: "Scarf Season", price: 200, body: "#273657", belly: "#fffaf0", acc: "scarf", accColor: "#2bb673" },
  { id: "cap", name: "Backwards Cap", price: 300, body: "#20263a", belly: "#ffffff", acc: "cap", accColor: "#2f7bf5" },
  { id: "shades", name: "Too Cool", price: 400, body: "#141a2b", belly: "#f2f6ff", acc: "shades", accColor: "#111" },
  { id: "pink", name: "Bubblegum", price: 550, body: "#e05a9c", belly: "#fff3f8", acc: "bow", accColor: "#ffd1e6" },
  { id: "mint", name: "Mint Chip", price: 550, body: "#2aa98b", belly: "#f3fff9", acc: null },
  { id: "chef", name: "Chef", price: 750, body: "#1f2b45", belly: "#ffffff", acc: "chef", accColor: "#ffffff" },
  { id: "headphones", name: "DJ Waddle", price: 1000, body: "#2b2140", belly: "#ffffff", acc: "headphones", accColor: "#ff4d6d" },
  // achievement skins: can't be bought, only earned
  { id: "viking", name: "Viking", ach: "Get 100 knockouts", test: () => save.kos >= 100, prog: () => `${Math.min(save.kos, 100)}/100`, body: "#5a3b22", belly: "#f6e8d6", acc: "viking", accColor: "#c9ccd3", rare: true },
  { id: "ninja", name: "Ninja", ach: "Win a round without boosting", test: () => save.noBoostWin, body: "#0f0f14", belly: "#2a2a35", acc: "ninja", accColor: "#e8443a", rare: true },
  { id: "emperor", name: "Emperor", ach: "Win in every arena", test: () => ARENAS.every((a) => (save.winsByArena[a.id] || 0) > 0), prog: () => `${ARENAS.filter((a) => (save.winsByArena[a.id] || 0) > 0).length}/${ARENAS.length}`, body: "#22314f", belly: "#fff6d8", acc: "crown", accColor: "#ffc93c", rare: true },
  { id: "gold", name: "Golden", ach: "Reach level 25", test: () => levelInfo().level >= 25, prog: () => `Lv ${levelInfo().level}/25`, body: "#d9a520", belly: "#fff1bf", acc: "tophat", accColor: "#1a1a1a", rare: true },
];
const BOT_NAMES = ["Waddles", "Flipper", "Nugget", "Frosty", "Pebble", "Snowball", "Biscuit", "Sir Wobble", "Iceberg", "Puddles", "Chilly", "Mochi", "Blizz", "Sprinkles", "Captain Slide", "Bubbles", "Penny", "Gus", "Marshmallow", "Tofu", "Pickles", "Squeak", "Kiwi", "Dumpling"];
const BOT_COLORS = ["#1f2b45", "#2a3f66", "#3b2f55", "#1d4a4a", "#4a2b2b", "#2e3a2a", "#4b3a1d", "#263046", "#3a2148", "#173b5c"];
const BOT_ACCS = [null, null, "beanie", "scarf", "cap", "bow", "headphones", "shades", null, "beanie"];
const ACC_COLORS = ["#e8443a", "#2bb673", "#2f7bf5", "#ffb000", "#b15cff", "#ff7a3c", "#00b6c7"];
const PERSONALITIES = ["aggressive", "cautious", "opportunist", "chaotic", "hunter"];
const BOTS_PER_ROUND = 9;

// Physics (world units ~ px at scale 1)
const P = {
  // tuned by simulation: bot-only rounds last ~50-80 s
  radius: 22, accel: 1150, maxSpeed: 250, dampMove: 2.1, dampGlide: 1.6,
  boostImpulse: 400, boostTime: 0.32, boostCd: 2.6, restitution: 0.5, pushBase: 0.9,
};

// ======================================================================
// Save
// ======================================================================
const SAVE_KEY = "icerumble_save_v1";
const DEFAULT_SAVE = { coins: 0, upgrades: { push: 0, speed: 0, boost: 0, weight: 0 }, owned: ["classic"], skin: "classic",
  unlocked: ["floe"], arena: "floe", games: 0, wins: 0, kos: 0, muted: false, music: true, xp: 0, winsByArena: {}, noBoostWin: false };
let save = loadSave();
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (s && typeof s === "object") {
      const m = { ...DEFAULT_SAVE, ...s, upgrades: { ...DEFAULT_SAVE.upgrades, ...(s.upgrades || {}) }, winsByArena: { ...(s.winsByArena || {}) } };
      if (s.xp === undefined) m.xp = (s.games || 0) * 40; // older saves: a little head start
      return m;
    }
  } catch {}
  return JSON.parse(JSON.stringify(DEFAULT_SAVE));
}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} }

// ---- Levels & unlocks ----
const xpToNext = (L) => 250 + 40 * (L - 1);
function levelInfo(xp = save.xp) {
  let level = 1, rest = xp;
  while (rest >= xpToNext(level) && level < 99) { rest -= xpToNext(level); level++; }
  return { level, into: rest, need: xpToNext(level) };
}
function arenaIndex(id) { return ARENAS.findIndex((a) => a.id === id); }
function arenaUnlocked(i) {
  if (i <= 0) return true;
  const a = ARENAS[i], prev = ARENAS[i - 1];
  return levelInfo().level >= a.level && (save.winsByArena[prev.id] || 0) > 0;
}
function arenaLockText(i) {
  const a = ARENAS[i], prev = ARENAS[i - 1];
  const lvlOk = levelInfo().level >= a.level, winOk = (save.winsByArena[prev.id] || 0) > 0;
  return `${lvlOk ? "✅" : "🔒"} Level ${a.level}<br>${winOk ? "✅" : "🔒"} Win ${prev.name}`;
}

// ======================================================================
// Poki SDK (only active when the Poki SDK script is on the page)
// ======================================================================
const Poki = {
  get on() { return typeof window.PokiSDK !== "undefined"; },
  init() { if (this.on) return PokiSDK.init().catch(() => {}); return Promise.resolve(); },
  loaded() { if (this.on) try { PokiSDK.gameLoadingFinished(); } catch {} },
  start() { if (this.on) try { PokiSDK.gameplayStart(); } catch {} },
  stop() { if (this.on) try { PokiSDK.gameplayStop(); } catch {} },
  commercial() {
    if (!this.on) return Promise.resolve();
    return PokiSDK.commercialBreak(() => Sound.pauseAll()).then(() => Sound.resumeAll()).catch(() => Sound.resumeAll());
  },
  rewarded() {
    if (!this.on) return Promise.resolve(false);
    return PokiSDK.rewardedBreak(() => Sound.pauseAll()).then((ok) => { Sound.resumeAll(); return !!ok; }).catch(() => { Sound.resumeAll(); return false; });
  },
};

// ======================================================================
// Sound (Web Audio synth – no files)
// ======================================================================
const Sound = {
  ctx: null, master: null, sfxGain: null, musicGain: null, noiseBuf: null, musicTimer: null, step: 0, nextTime: 0, paused: false,
  init() {
    if (this.ctx) { if (this.ctx.state === "suspended" && !this.paused) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.7; this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.16; this.musicGain.connect(this.master);
    const n = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, n, n);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.applyMute();
    this.startMusic();
  },
  applyMute() { if (this.master) this.master.gain.value = save.muted ? 0 : 1; },
  pauseAll() { this.paused = true; if (this.ctx) this.ctx.suspend(); },
  resumeAll() { this.paused = false; if (this.ctx) this.ctx.resume(); },
  tone(freq, dur, { type = "sine", vol = 0.3, slide = 0, delay = 0, attack = 0.005, dest } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxGain); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, { vol = 0.3, freq = 1200, q = 0.8, type = "lowpass", slide = 0, delay = 0, dest } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfxGain); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },
  bump(strength) {
    const v = clamp(strength, 0.15, 1);
    this.tone(140 + Math.random() * 30, 0.14, { type: "sine", vol: 0.35 * v, slide: 0.5 });
    this.noise(0.08, { vol: 0.18 * v, freq: 900 });
  },
  splash() { this.noise(0.7, { vol: 0.35, freq: 2400, slide: 0.2, q: 0.5 }); this.tone(320, 0.25, { type: "sine", vol: 0.12, slide: 0.4 }); },
  boost() { this.noise(0.3, { vol: 0.2, freq: 500, slide: 4, type: "bandpass", q: 1.5 }); this.tone(220, 0.22, { type: "triangle", vol: 0.12, slide: 2.2 }); },
  crack() { for (let i = 0; i < 4; i++) this.noise(0.05, { vol: 0.25, freq: 3000 + Math.random() * 2000, type: "highpass", delay: i * 0.05 + Math.random() * 0.02 }); },
  breakIce() { this.noise(0.5, { vol: 0.3, freq: 1500, slide: 0.3 }); this.tone(90, 0.35, { type: "sine", vol: 0.25, slide: 0.6 }); },
  wind() { this.noise(2.2, { vol: 0.22, freq: 400, slide: 2.5, type: "bandpass", q: 0.7 }); },
  ko() { this.tone(660, 0.1, { type: "square", vol: 0.08 }); this.tone(990, 0.16, { type: "square", vol: 0.08, delay: 0.08 }); },
  coin() { this.tone(988, 0.08, { type: "square", vol: 0.06 }); this.tone(1319, 0.18, { type: "square", vol: 0.06, delay: 0.07 }); },
  click() { this.tone(600, 0.05, { type: "triangle", vol: 0.12 }); },
  count(go) { this.tone(go ? 880 : 440, go ? 0.35 : 0.15, { type: "triangle", vol: 0.2 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, { type: "triangle", vol: 0.18, delay: i * 0.12 })); },
  lose() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.3, { type: "triangle", vol: 0.15, delay: i * 0.15 })); },
  // Little looping tune: bass + plucky arpeggio
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const stepDur = 0.2;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.paused) return;
      while (this.nextTime < this.ctx.currentTime + 0.3) {
        const s = this.step % 32, chord = chords[Math.floor(s / 8)];
        const t = this.nextTime - this.ctx.currentTime;
        if (save.music) {
          if (s % 4 === 0) this.tone(midi(chord[0] - 12), 0.35, { type: "triangle", vol: 0.5, delay: t, dest: this.musicGain });
          const arp = [0, 1, 2, 1, 0, 2, 1, 2][s % 8];
          if (s % 2 === 0 || Math.random() < 0.3) this.tone(midi(chord[arp] + 12), 0.16, { type: "square", vol: 0.09, delay: t, dest: this.musicGain });
          if (s % 4 === 2) this.noise(0.04, { vol: 0.12, freq: 6000, type: "highpass", delay: t, dest: this.musicGain });
        }
        this.step++; this.nextTime += stepDur;
      }
    }, 80);
  },
};

// ======================================================================
// Canvas & camera
// ======================================================================
const canvas = $("game");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, DPR = 1;
const cam = { x: 0, y: 0, scale: 1, shake: 0 };
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
}
window.addEventListener("resize", resize);
resize();
const toScreen = (x, y) => [W / 2 + (x - cam.x) * cam.scale, H / 2 + (y - cam.y) * cam.scale];
const toWorld = (sx, sy) => [(sx - W / 2) / cam.scale + cam.x, (sy - H / 2) / cam.scale + cam.y];

// ======================================================================
// Input
// ======================================================================
const input = { mode: "mouse", mouse: null, keys: new Set(), joy: null, boostQueued: false, touchUI: matchMedia("(pointer: coarse)").matches };
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { input.keys.add(k); input.mode = "keys"; if (state === "play") e.preventDefault(); }
  if (k === " " || k === "shift") { input.boostQueued = true; if (state === "play") e.preventDefault(); }
  if (k === "escape" || k === "p") togglePause();
});
window.addEventListener("keyup", (e) => input.keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => { input.keys.clear(); if (state === "play") togglePause(true); });
canvas.addEventListener("mousemove", (e) => { input.mouse = [e.clientX, e.clientY]; if (!input.keys.size) input.mode = "mouse"; });
canvas.addEventListener("mousedown", (e) => { if (e.button === 0) { input.boostQueued = true; input.mouse = [e.clientX, e.clientY]; } Sound.init(); });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
// Touch: drag anywhere = joystick, boost button separate
canvas.addEventListener("touchstart", (e) => {
  Sound.init(); input.touchUI = true; input.mode = "touch";
  for (const t of e.changedTouches) if (!input.joy) input.joy = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
  e.preventDefault();
}, { passive: false });
canvas.addEventListener("touchmove", (e) => {
  for (const t of e.changedTouches) if (input.joy && t.identifier === input.joy.id) {
    input.joy.x = t.clientX; input.joy.y = t.clientY;
    // joystick follows the finger if dragged far (feels nicer)
    const dx = input.joy.x - input.joy.ox, dy = input.joy.y - input.joy.oy, d = len(dx, dy), max = 70;
    if (d > max) { input.joy.ox = input.joy.x - (dx / d) * max; input.joy.oy = input.joy.y - (dy / d) * max; }
  }
  e.preventDefault();
}, { passive: false });
const endTouch = (e) => { for (const t of e.changedTouches) if (input.joy && t.identifier === input.joy.id) input.joy = null; };
canvas.addEventListener("touchend", endTouch); canvas.addEventListener("touchcancel", endTouch);
$("boostBtn").addEventListener("touchstart", (e) => { input.boostQueued = true; e.preventDefault(); e.stopPropagation(); }, { passive: false });
$("boostBtn").addEventListener("mousedown", (e) => { input.boostQueued = true; e.stopPropagation(); });

function playerInputVector(p) {
  if (input.mode === "keys" && input.keys.size) {
    const k = input.keys;
    let x = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    let y = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
    const l = len(x, y); return l ? [x / l, y / l] : [0, 0];
  }
  if (input.mode === "touch") {
    if (!input.joy) return [0, 0];
    const dx = input.joy.x - input.joy.ox, dy = input.joy.y - input.joy.oy, l = len(dx, dy);
    if (l < 8) return [0, 0];
    const m = clamp(l / 60, 0, 1); return [(dx / l) * m, (dy / l) * m];
  }
  if (input.mouse) {
    const [sx, sy] = toScreen(p.x, p.y);
    const dx = input.mouse[0] - sx, dy = input.mouse[1] - sy, l = len(dx, dy);
    if (l < 12) return [0, 0];
    const m = clamp((l - 12) / 110, 0, 1); return [(dx / l) * m, (dy / l) * m];
  }
  return [0, 0];
}

// ======================================================================
// Penguins
// ======================================================================
let uid = 0;
function makePenguin(opts) {
  return {
    id: ++uid, x: 0, y: 0, vx: 0, vy: 0, face: 0, r: P.radius, baseR: P.radius,
    mass: 1, push: P.pushBase, speedMul: 1, cdMul: 1,
    boostCd: rand(0.5, 1.5), boosting: 0, alive: true, falling: 0, fallVX: 0, fallVY: 0,
    kos: 0, lastHitBy: null, lastHitAt: -99, squash: 0, waddle: Math.random() * TAU,
    ix: 0, iy: 0, name: "", isPlayer: false, skin: SKINS[0], bot: null, place: 0, ...opts,
  };
}
function playerStats(p) {
  const u = save.upgrades;
  p.push = P.pushBase * (1 + 0.06 * u.push);
  p.speedMul = 1 + 0.03 * u.speed;
  p.cdMul = 1 - 0.05 * u.boost;
  p.mass = 1 + 0.05 * u.weight;
}
/** Bots get better as you level up (and a bit in later arenas). */
function difficulty(arenaId) { return clamp((levelInfo().level - 1) / 26 + arenaIndex(arenaId) * 0.015, 0, 1); }

// ======================================================================
// Round state
// ======================================================================
let G = null;          // current round
let state = "menu";    // menu | play | paused | over
const particles = [];

function newRound(arenaId, demo = false) {
  const arena = ARENAS.find((a) => a.id === arenaId) || ARENAS[0];
  const d = demo ? 0.5 : difficulty(arena.id);
  G = {
    arena, demo, R: arena.radius, shownR: arena.radius, targetR: arena.radius, time: 0, phase: demo ? "play" : "countdown", countdown: 3.2,
    shrinkT: arena.shrinkEvery, shrinkWarn: 0, penguins: [], holes: [], holeT: 5, wind: { phase: "idle", t: rand(5, 8), dir: 0, f: 0 },
    slowmo: 0, over: false, playerPlace: 0, d, ice: makeIceTexture(arena), kosBefore: save.kos, result: null,
    edge: [3, 4, 5, 7, 9].map((k) => ({ k, amp: rand(0.004, 0.009), p: rand(0, TAU) })), env: makeEnv(arena),
    rot: 0, omega: 0, playerBoosted: false, floes: null, seal: null, meltWarn: 0,
  };
  if (arena.drift) {
    const off = rand(0, TAU);
    G.floes = [{ ang: 0, d0: 0, r: 265 }, ...[0, 1, 2, 3].map((i) => ({ ang: off + (i / 4) * TAU, d0: 370, r: 205 }))].map((f, i) => ({
      ...f, d: f.d0, x: Math.cos(f.ang) * f.d0, y: Math.sin(f.ang) * f.d0, dx: 0, dy: 0, phase: -Math.PI / 2 + rand(-0.5, 0.5), spin: rand(-0.04, 0.04), seed: rand(0, 100),
      edge: [3, 5, 7].map((k) => ({ k, amp: rand(0.01, 0.025), p: rand(0, TAU) })), minR: i === 0 ? 95 : 80,
    }));
    G.R = G.shownR = 370 + 205 + 30;
  }
  if (arena.seals) G.seal = { state: "idle", t: rand(4, 6), x: 0, y: 0, vx: 0, vy: 0, r: 34, baseR: 34, mass: 14, push: 1.5, boosting: 0, squash: 0, alive: true, falling: 0, isSeal: true, dir: 0, travelled: 0, sx: 0, sy: 0, alpha: 0 };
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const n = BOTS_PER_ROUND + (demo ? 1 : 0);
  const total = n + (demo ? 0 : 1);
  const offset = rand(0, TAU);
  for (let i = 0; i < total; i++) {
    const a = offset + (i / total) * TAU, rr = arena.radius * 0.62;
    let p;
    if (!demo && i === 0) {
      p = makePenguin({ isPlayer: true, name: "You", skin: SKINS.find((s) => s.id === save.skin) || SKINS[0] });
      playerStats(p);
    } else {
      const pers = PERSONALITIES[(i + randi(0, 4)) % PERSONALITIES.length];
      const acc = pick(BOT_ACCS);
      p = makePenguin({
        name: names[i % names.length],
        skin: { body: pick(BOT_COLORS), belly: "#ffffff", acc, accColor: pick(ACC_COLORS) },
        bot: { pers, think: rand(0, 0.3), target: null, dir: [0, 0], wander: rand(0, TAU), boostWant: false,
          react: lerp(0.38, 0.14, d) * rand(0.85, 1.2), noise: lerp(0.55, 0.12, d), edge: lerp(0.68, 0.8, d) },
      });
      // bots get a bit stronger with difficulty
      p.push = P.pushBase * lerp(0.95, 1.25, d) * rand(0.95, 1.05);
      p.speedMul = lerp(0.9, 1.12, d) * rand(0.95, 1.05);
      p.mass = rand(0.95, 1.08) * lerp(1, 1.2, d);
      p.cdMul = lerp(1.15, 0.85, d);
    }
    p.x = Math.cos(a) * rr; p.y = Math.sin(a) * rr; p.face = a + Math.PI;
    if (G.floes) { // two penguins per floe
      const f = G.floes[i % G.floes.length], k = Math.floor(i / G.floes.length), aa = rand(0, TAU), rr2 = f.r * (k ? 0.5 : 0.15);
      p.x = f.x + Math.cos(aa) * rr2; p.y = f.y + Math.sin(aa) * rr2; p.face = Math.atan2(-p.y, -p.x);
    }
    G.penguins.push(p);
  }
  particles.length = 0;
  cam.x = 0; cam.y = 0;
  if (!demo) input.boostQueued = false;
}
const player = () => G && G.penguins.find((p) => p.isPlayer);
const aliveList = () => G.penguins.filter((p) => p.alive && !p.falling);

// ======================================================================
// Ice texture (pre-rendered)
// ======================================================================
const THEMES = {
  floe:    { water: ["#35cdf0", "#1497d6", "#0b6fb0"], top: ["#ffffff", "#e3f6ff", "#bfe7fb"], side: ["#7fd8f5", "#2f98cf"], line: "#1b5b8a", snow: "#ffffff", crack: "rgba(40,120,180,.45)" },
  storm:   { water: ["#7398d0", "#4a72ad", "#2c4f86"], top: ["#ffffff", "#f1f6fc", "#d6e2f0"], side: ["#b7cdea", "#6487b6"], line: "#2c4a75", snow: "#ffffff", crack: "rgba(70,100,150,.4)", snowfall: true },
  glacier: { water: ["#3fe0cf", "#14aebf", "#0a7f98"], top: ["#f6fffe", "#cff5f6", "#9fe2ec"], side: ["#64d8e6", "#1d93b3"], line: "#145f78", snow: "#ffffff", crack: "rgba(15,110,150,.55)" },
  spin:    { water: ["#7d8cff", "#5466e0", "#3443a8"], top: ["#ffffff", "#eef0ff", "#cfd6ff"], side: ["#aab6ff", "#5d6bd8"], line: "#28327e", snow: "#ffffff", crack: "rgba(70,80,170,.4)" },
  seals:   { water: ["#2fb3d6", "#18789f", "#0d4f78"], top: ["#ffffff", "#e8f5fb", "#c2e2f0"], side: ["#86cde6", "#2f8db8"], line: "#174f73", snow: "#ffffff", crack: "rgba(30,100,140,.45)" },
  night:   { water: ["#1d3f6e", "#112a4f", "#081a33"], top: ["#eef5ff", "#cfe0f7", "#a6bfe2"], side: ["#6386bf", "#2f4a80"], line: "#0f2347", snow: "#ffffff", crack: "rgba(40,70,120,.5)", night: true },
  drift:   { water: ["#4fd8f7", "#1ea6dc", "#0c73b6"], top: ["#ffffff", "#e3f6ff", "#bfe7fb"], side: ["#7fd8f5", "#2f98cf"], line: "#1b5b8a", snow: "#ffffff", crack: "rgba(40,120,180,.45)" },
};
const theme = () => THEMES[G ? G.arena.id : "floe"];

/** Ice surface texture: cartoon snow patches, cracks and shines. */
function makeIceTexture(arena) {
  const T = THEMES[arena.id];
  const size = 1024, c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d"), m = size / 2;
  const grd = g.createRadialGradient(m * 0.75, m * 0.6, 40, m, m, m * 1.05);
  grd.addColorStop(0, T.top[0]); grd.addColorStop(0.55, T.top[1]); grd.addColorStop(1, T.top[2]);
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  // snow patches with a soft blue shadow underneath
  for (let i = 0; i < (arena.id === "storm" ? 26 : 16); i++) {
    const x = rand(60, size - 60), y = rand(60, size - 60), r = rand(25, 70);
    const pts = Array.from({ length: 12 }, (_, k) => { const a = (k / 12) * TAU, rr = r * (0.82 + 0.18 * Math.sin(k * 2.1 + i * 3)); return [Math.cos(a) * rr * 1.35, Math.sin(a) * rr * 0.8]; });
    const blob = (ox, oy, fill) => { // smooth rounded blob through midpoints
      g.fillStyle = fill; g.beginPath();
      const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      let m0 = mid(pts[11], pts[0]); g.moveTo(x + ox + m0[0], y + oy + m0[1]);
      for (let k = 0; k < 12; k++) { const p = pts[k], m = mid(p, pts[(k + 1) % 12]); g.quadraticCurveTo(x + ox + p[0], y + oy + p[1], x + ox + m[0], y + oy + m[1]); }
      g.closePath(); g.fill();
    };
    blob(0, 6, "rgba(120,180,220,.25)");
    blob(0, 0, T.snow);
  }
  // cartoon cracks
  g.strokeStyle = T.crack; g.lineCap = "round"; g.lineJoin = "round";
  for (let i = 0; i < (arena.id === "glacier" ? 16 : 9); i++) {
    g.lineWidth = rand(2, 3.5);
    let x = rand(80, size - 80), y = rand(80, size - 80), a = rand(0, TAU);
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      a += rand(-0.8, 0.8); x += Math.cos(a) * rand(18, 40); y += Math.sin(a) * rand(18, 40); g.lineTo(x, y);
      if (Math.random() < 0.35) { const bx = x + Math.cos(a + 1.2) * 20, by = y + Math.sin(a + 1.2) * 20; g.moveTo(x, y); g.lineTo(bx, by); g.moveTo(x, y); }
    }
    g.stroke();
  }
  // shiny streaks
  g.strokeStyle = "rgba(255,255,255,.85)";
  for (let i = 0; i < 18; i++) {
    const x = rand(60, size - 60), y = rand(60, size - 60), l = rand(14, 40);
    g.lineWidth = rand(3, 6); g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y - l * 0.6); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.moveTo(x + 8, y + 8); g.lineTo(x + 8 + l * 0.5, y + 8 - l * 0.3); g.stroke();
  }
  return c;
}

/** Wobbly floe outline: radius multiplier for an angle (physics and drawing use the same shape). */
function edgeMul(a) { let m = 1; for (const h of G.edge) m += h.amp * Math.sin(h.k * (a - G.rot) + h.p); return m; }
function floeMul(f, a) { let m = 1; for (const h of f.edge) m += h.amp * Math.sin(h.k * (a - f.spin * G.time) + h.p); return m; }
/** Where is (x,y) relative to the ice it's on? d = distance to that ice's centre, er = edge radius in that direction. */
function surfaceInfo(x, y) {
  if (G.floes) {
    let best = null, bestRel = 1e9;
    for (const f of G.floes) {
      const dx = x - f.x, dy = y - f.y, d = len(dx, dy), er = f.r * floeMul(f, Math.atan2(dy, dx)), rel = d / er;
      if (rel < bestRel) { bestRel = rel; best = { d, er, cx: f.x, cy: f.y, floe: f }; }
    }
    return best;
  }
  return { d: len(x, y), er: edgeR(Math.atan2(y, x)), cx: 0, cy: 0, floe: null };
}
const edgeR = (a, R = G.R) => R * edgeMul(a);

/** Background: drifting floes, icebergs, fish (generated per round). */
function makeEnv(arena) {
  const R = arena.drift ? 640 : arena.radius, env = { floes: [], bergs: [], fish: [], fishT: 1.5, flakes: [] };
  for (let i = 0; i < 14; i++) {
    const a = rand(0, TAU), d = rand(R + 120, R + 700);
    env.floes.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: rand(28, 85), seed: rand(0, 100), ph: rand(0, TAU), rot: rand(0, TAU), drift: rand(-6, 6), snow: Math.random() < 0.6, pengs: Math.random() < 0.25 ? randi(1, 2) : 0 });
  }
  const nb = arena.id === "glacier" ? 11 : 7;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * TAU + rand(-0.25, 0.25), d = rand(R + 230, R + 620);
    env.bergs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: rand(70, arena.id === "glacier" ? 150 : 115), h: rand(0.9, 1.5), seed: rand(0, 100), ph: rand(0, TAU), peaks: randi(2, 3) });
  }
  for (let i = 0; i < 140; i++) env.flakes.push({ x: Math.random(), y: Math.random(), s: rand(1.5, 4), v: rand(0.6, 1.4) });
  return env;
}

// ======================================================================
// Simulation
// ======================================================================
function step(dt) {
  const gt = G.time;
  if (G.phase === "countdown") {
    const before = Math.ceil(G.countdown);
    G.countdown -= dt;
    const after = Math.ceil(G.countdown);
    if (after !== before && after > 0) Sound.count(false);
    if (G.countdown <= 0) { G.phase = "play"; Sound.count(true); showBanner("RUMBLE!", 900); Poki.start(); }
    updateBots(dt, true);
    return;
  }
  G.time += dt;
  arenaEvents(dt);

  // --- movement ---
  const pl = player();
  for (const p of G.penguins) {
    if (!p.alive) continue;
    if (p.falling) { // sinking animation
      p.falling += dt; p.x += p.fallVX * dt; p.y += p.fallVY * dt; p.fallVX *= 0.92; p.fallVY *= 0.92;
      if (p.falling > 0.7) p.alive = false;
      continue;
    }
    // drifting floes carry whoever stands on them
    if (G.floes) { const si = surfaceInfo(p.x, p.y); if (si.d <= si.er) { p.x += si.floe.dx; p.y += si.floe.dy; } }
    let ix = 0, iy = 0, wantBoost = false;
    if (p.isPlayer && !G.demo) {
      [ix, iy] = playerInputVector(p);
      if (input.boostQueued) { wantBoost = true; input.boostQueued = false; }
      if (input.mode === "mouse" && wantBoost && !ix && !iy) { ix = Math.cos(p.face); iy = Math.sin(p.face); }
    } else if (p.bot) {
      [ix, iy] = p.bot.dir; wantBoost = p.bot.boostWant; p.bot.boostWant = false;
    }
    p.ix = ix; p.iy = iy;
    const im = len(ix, iy);
    if (im > 0.05) {
      const ux = ix / im, uy = iy / im;
      const maxS = P.maxSpeed * p.speedMul * im;
      const along = p.vx * ux + p.vy * uy;
      if (along < maxS) { const a = P.accel * p.speedMul * dt; p.vx += ux * a; p.vy += uy * a; }
      p.face += angDiff(p.face, Math.atan2(uy, ux)) * Math.min(1, dt * 12);
    }
    const damp = im > 0.05 ? P.dampMove : P.dampGlide;
    const f = Math.exp(-damp * dt); p.vx *= f; p.vy *= f;
    // spinning floe: the ice drags you around and flings you outward
    if (G.arena.spin) {
      const d = len(p.x, p.y) || 1, tx = -p.y / d, ty = p.x / d, vt = p.vx * tx + p.vy * ty, k = 1.1 * dt;
      p.vx += tx * (G.omega * d - vt) * k; p.vy += ty * (G.omega * d - vt) * k;
      const out = G.omega * G.omega * d * 0.85 * dt; p.vx += (p.x / d) * out; p.vy += (p.y / d) * out;
    }
    // wind
    if (G.wind.phase === "blow") { p.vx += Math.cos(G.wind.dir) * G.wind.f * dt / p.mass; p.vy += Math.sin(G.wind.dir) * G.wind.f * dt / p.mass; }
    // boost
    p.boostCd -= dt; p.boosting = Math.max(0, p.boosting - dt);
    if (wantBoost && p.boostCd <= 0) {
      const bx = im > 0.05 ? ix / im : Math.cos(p.face), by = im > 0.05 ? iy / im : Math.sin(p.face);
      p.vx += bx * P.boostImpulse; p.vy += by * P.boostImpulse; p.face = Math.atan2(by, bx);
      p.boosting = G.floes ? 0.5 : P.boostTime; p.boostCd = P.boostCd * p.cdMul; // on drifting floes a boost is a longer jump
      if (p.isPlayer) G.playerBoosted = true;
      if (p.isPlayer || onScreen(p)) Sound.boost();
      for (let i = 0; i < 8; i++) spawn({ x: p.x - bx * p.r, y: p.y - by * p.r, vx: -bx * rand(60, 160) + rand(-40, 40), vy: -by * rand(60, 160) + rand(-40, 40), life: 0.45, size: rand(3, 6), color: "#ffffff", type: "snow" });
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.waddle += len(p.vx, p.vy) * dt * 0.09;
    p.squash = Math.max(0, p.squash - dt * 5);
  }

  // --- collisions ---
  const list = G.penguins.filter((p) => p.alive && !p.falling);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) collide(list[i], list[j]);
  // the charging seal is unstoppable
  const S = G.seal;
  if (S && S.state === "charge") for (const p of list) {
    if (len(p.x - S.x, p.y - S.y) >= p.r + S.r) continue;
    const vx = S.vx, vy = S.vy, x = S.x, y = S.y;
    collide(S, p); S.vx = vx; S.vy = vy; S.x = x; S.y = y;
    p.vx += vx * 0.35; p.vy += vy * 0.35;
  }

  // --- falling off ---
  for (const p of list) {
    const si = surfaceInfo(p.x, p.y);
    let out = si.d > si.er + p.r * 0.15;
    if (G.floes && p.boosting > 0) out = false; // boosting = jumping between floes
    for (const h of G.holes) if (h.open && len(p.x - h.x, p.y - h.y) < h.r - p.r * 0.35) out = true;
    if (out) fall(p);
  }
  // --- end of round ---
  if (!G.over) {
    const left = aliveList();
    if (G.demo) { if (left.length <= 1) { G.over = true; setTimeout(() => { if (state === "menu") newRound(pick(ARENAS.filter((a, i) => arenaUnlocked(i))).id, true); }, 1500); } }
    else if (pl && (!pl.alive || pl.falling)) endRound(false);
    else if (left.length === 1 && left[0].isPlayer) endRound(true);
  }
  updateBots(dt, false);
}

function collide(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d = len(dx, dy), minD = a.r + b.r;
  if (d >= minD || d === 0) return;
  const nx = dx / d, ny = dy / d;
  const ma = a.mass * (a.boosting ? 1.8 : 1) * (a.r / a.baseR), mb = b.mass * (b.boosting ? 1.8 : 1) * (b.r / b.baseR);
  a.vxPrev = a.vx; a.vyPrev = a.vy; b.vxPrev = b.vx; b.vyPrev = b.vy;
  // separate
  const overlap = minD - d, tot = ma + mb;
  a.x -= nx * overlap * (mb / tot); a.y -= ny * overlap * (mb / tot);
  b.x += nx * overlap * (ma / tot); b.y += ny * overlap * (ma / tot);
  // impulse
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv >= 0) return;
  const j = (-(1 + P.restitution) * rv) / (1 / ma + 1 / mb);
  const k = G.floes ? 0.82 : 1; // small floes: softer bumps, otherwise rounds are over in seconds
  const pa = a.push * (a.boosting ? 1.45 : 1) * k, pb = b.push * (b.boosting ? 1.45 : 1) * k;
  b.vx += (j / mb) * nx * pa; b.vy += (j / mb) * ny * pa;
  a.vx -= (j / ma) * nx * pb; a.vy -= (j / ma) * ny * pb;
  // who hit whom: whoever was moving into the other gets the credit
  const t = G.time;
  const va = a.vxPrev * nx + a.vyPrev * ny, vb = -(b.vxPrev * nx + b.vyPrev * ny);
  if (va >= vb * 0.7) { b.lastHitBy = a; b.lastHitAt = t; }
  if (vb >= va * 0.7) { a.lastHitBy = b; a.lastHitAt = t; }
  a.squash = b.squash = 1;
  const strength = clamp(-rv / 420, 0, 1);
  if (strength > 0.12 && (a.isPlayer || b.isPlayer || onScreen(a))) Sound.bump(strength);
  if ((a.isPlayer || b.isPlayer) && strength > 0.35) cam.shake = Math.max(cam.shake, 6 * strength);
  if (strength > 0.3) {
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    for (let k = 0; k < 6; k++) spawn({ x: cx, y: cy, vx: rand(-150, 150), vy: rand(-150, 150), life: 0.35, size: rand(2, 4), color: "#fff6c2", type: "spark" });
  }
}

function fall(p) {
  if (window.__irDebug) { const si = surfaceInfo(p.x, p.y); window.__irDebug.push({ t: +G.time.toFixed(2), rel: +(si.d / si.er).toFixed(2), floe: G.floes ? G.floes.indexOf(si.floe) : -1, v: Math.round(len(p.vx, p.vy)), hit: G.time - p.lastHitAt < 1 }); }
  p.falling = 0.0001; p.fallVX = p.vx * 0.5; p.fallVY = p.vy * 0.5;
  let killer = p.lastHitBy && G.time - p.lastHitAt < 4 && p.lastHitBy.alive && !p.lastHitBy.falling ? p.lastHitBy : null;
  if (killer && killer.isSeal) { killer = null; if (p.isPlayer || onScreen(p)) spawn({ x: p.x, y: p.y - 30, vx: 0, vy: -40, life: 1, size: 0, color: "#ffffff", type: "text", text: "🦭 SEAL!" }); }
  p.place = aliveList().length + 1;
  for (let k = 0; k < 18; k++) spawn({ x: p.x, y: p.y, vx: rand(-120, 120), vy: rand(-120, 120), life: rand(0.5, 0.9), size: rand(3, 7), color: pick(["#ffffff", "#bfe8ff", "#7cc7ef"]), type: "splash" });
  spawn({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.8, size: p.r, color: "#ffffff", type: "ring" });
  if (onScreen(p) || p.isPlayer) Sound.splash();
  if (killer) {
    killer.kos++;
    killer.r = Math.min(killer.baseR * 1.45, killer.r * 1.07);
    killer.mass *= 1.08;
    if (killer.isPlayer) {
      Sound.ko();
      spawn({ x: killer.x, y: killer.y - killer.r - 14, vx: 0, vy: -40, life: 1.1, size: 0, color: "#ffd84a", type: "text", text: "KO!" });
      hudFlash();
    }
  }
  // dramatic slow motion when the round is decided
  if (!G.demo && !G.over) {
    const left = aliveList();
    if (left.length === 1 && left[0].isPlayer) G.slowmo = 1.1;
  }
}

function arenaEvents(dt) {
  const A = G.arena;
  // stalemate breaker: after 75 s shrink faster
  const speedUp = G.time > 75 ? 1.8 : 1;
  // --- spinning ---
  if (A.spin) { G.omega = Math.min(0.62, 0.3 + G.time * 0.004); G.rot += G.omega * dt; }
  // --- drifting floes ---
  if (G.floes) driftEvents(dt, speedUp);
  // --- seals ---
  if (G.seal) sealEvents(dt);
  // --- shrinking edge ---
  if (!A.drift && G.R > A.minR + 1) {
    G.shrinkT -= dt * speedUp;
    if (G.shrinkT <= 2.2 && !G.shrinkWarn) {
      G.shrinkWarn = 1; G.targetR = Math.max(A.minR, G.R - A.shrinkBy);
      if (!G.demo) { Sound.crack(); warn(A.id === "floe" ? "The edge is cracking!" : "The ice is shrinking!", 1800); }
    }
    if (G.shrinkT <= 0) {
      const old = G.R;
      G.R = G.targetR; G.shrinkWarn = 0; G.shrinkT = A.shrinkEvery;
      if (!G.demo) Sound.breakIce();
      for (let k = 0; k < 26; k++) {
        const a = rand(0, TAU), r = rand(G.R, old);
        spawn({ x: Math.cos(a) * r, y: Math.sin(a) * r, vx: Math.cos(a) * rand(20, 60), vy: Math.sin(a) * rand(20, 60), life: rand(1.2, 2.2), size: rand(10, 22), color: "#dff4ff", type: "chunk", rot: rand(0, TAU) });
      }
    }
  }
  G.shownR = lerp(G.shownR, G.R, Math.min(1, dt * 10));
  // --- wind ---
  if (A.wind) {
    const w = G.wind; w.t -= dt;
    if (w.phase === "idle" && w.t <= 0) { w.phase = "warn"; w.t = 1.6; w.dir = rand(0, TAU); if (!G.demo) warn("Wind incoming!", 1500, w.dir); }
    else if (w.phase === "warn" && w.t <= 0) { w.phase = "blow"; w.t = 2.3; w.f = lerp(330, 430, G.d); if (!G.demo) Sound.wind(); }
    else if (w.phase === "blow" && w.t <= 0) { w.phase = "idle"; w.t = rand(5, 8.5); w.f = 0; }
    if (w.phase === "blow" && Math.random() < dt * 60) {
      const [wx, wy] = toWorld(rand(0, W), rand(0, H));
      spawn({ x: wx, y: wy, vx: Math.cos(w.dir) * rand(500, 800), vy: Math.sin(w.dir) * rand(500, 800), life: 0.6, size: rand(2, 4), color: "#ffffff", type: "snow" });
    }
  }
  // --- holes ---
  if (A.holes) {
    G.holeT -= dt;
    for (const h of G.holes) {
      h.t -= dt;
      if (!h.open && h.t <= 0) { h.open = true; h.t = rand(7, 10); if (!G.demo) Sound.breakIce(); for (let k = 0; k < 12; k++) { const a = rand(0, TAU); spawn({ x: h.x + Math.cos(a) * h.r, y: h.y + Math.sin(a) * h.r, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, life: 1, size: rand(6, 12), color: "#dff4ff", type: "chunk", rot: rand(0, TAU) }); } }
      else if (h.open && h.t <= 0) h.closing = true;
    }
    G.holes = G.holes.filter((h) => !h.closing);
    if (G.holeT <= 0 && G.holes.length < 3) {
      G.holeT = rand(4.5, 7);
      const r = rand(46, 72);
      for (let tries = 0; tries < 20; tries++) {
        const a = rand(0, TAU), dd = rand(0, G.R * 0.65);
        const x = Math.cos(a) * dd, y = Math.sin(a) * dd;
        if (G.holes.every((o) => len(o.x - x, o.y - y) > o.r + r + 40)) {
          G.holes.push({ x, y, r, t: 1.9, open: false, seed: Math.random() * 1000 });
          if (!G.demo) Sound.crack();
          break;
        }
      }
    }
  }
}

function driftEvents(dt, speedUp) {
  let ext = 0;
  for (const f of G.floes) {
    const ox = f.x, oy = f.y;
    if (f.d0 > 0) {
      f.d = f.d0 + 45 * Math.sin(G.time * 0.3 + f.phase) + Math.min(55, G.time * 0.5);
      f.ang += dt * 0.05;
    }
    f.x = Math.cos(f.ang) * f.d; f.y = Math.sin(f.ang) * f.d;
    f.dx = f.x - ox; f.dy = f.y - oy;
    ext = Math.max(ext, f.d + f.r);
  }
  G.R = ext + 30;
  // melting: every few seconds all floes get smaller
  G.shrinkT -= dt * speedUp;
  if (G.shrinkT <= 2 && !G.meltWarn) { G.meltWarn = 1; if (!G.demo) { Sound.crack(); warn("The floes are melting!", 1800); } }
  if (G.shrinkT <= 0) {
    G.shrinkT = G.arena.shrinkEvery; G.meltWarn = 0;
    if (!G.demo) Sound.breakIce();
    for (const f of G.floes) {
      const nr = Math.max(f.minR, f.r - 13);
      for (let k = 0; k < 6 && nr < f.r; k++) { const a = rand(0, TAU); spawn({ x: f.x + Math.cos(a) * f.r, y: f.y + Math.sin(a) * f.r, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, life: rand(1, 1.8), size: rand(8, 16), color: "#dff4ff", type: "chunk", rot: rand(0, TAU) }); }
      f.r = nr;
    }
  }
}

function sealEvents(dt) {
  const S = G.seal;
  S.t -= dt;
  if (S.state === "idle" && S.t <= 0) {
    const targets = aliveList();
    if (!targets.length) return;
    const tg = pick(targets);
    const a = Math.atan2(tg.y, tg.x) + rand(-0.5, 0.5), er = edgeR(a) + 45;
    S.sx = Math.cos(a) * er; S.sy = Math.sin(a) * er;
    S.dir = Math.atan2(tg.y - S.sy, tg.x - S.sx) + rand(-0.12, 0.12);
    S.x = S.sx; S.y = S.sy; S.state = "warn"; S.t = G.time > 60 ? 1.25 : 1.55; S.alpha = 0;
    if (!G.demo) Sound.tone(110, 0.5, { type: "sine", vol: 0.2, slide: 1.4 });
  } else if (S.state === "warn") {
    if (Math.random() < dt * 25) spawn({ x: S.sx + rand(-20, 20), y: S.sy + rand(-20, 20), vx: 0, vy: -20, life: 0.5, size: rand(3, 7), color: "rgba(255,255,255,.9)", type: "ring" });
    if (S.t <= 0) {
      S.state = "charge"; S.travelled = 0; S.alpha = 1;
      S.vx = Math.cos(S.dir) * 560; S.vy = Math.sin(S.dir) * 560;
      if (!G.demo) Sound.splash();
      spawnRipple(S.x, S.y);
    }
  } else if (S.state === "charge") {
    S.x += S.vx * dt; S.y += S.vy * dt; S.travelled += 560 * dt;
    S.squash = (S.squash + dt * 6) % TAU;
    if (S.travelled > G.R * 2 + 90) { S.state = "dive"; S.t = 0.5; spawnRipple(S.x, S.y); }
  } else if (S.state === "dive") {
    S.x += S.vx * dt * 0.4; S.y += S.vy * dt * 0.4; S.alpha = Math.max(0, S.t / 0.5);
    if (S.t <= 0) { S.state = "idle"; S.t = rand(3.2, 5.5) * (G.time > 60 ? 0.7 : 1); }
  }
}

// ======================================================================
// Bots
// ======================================================================
function updateBots(dt, frozen) {
  for (const p of G.penguins) {
    if (!p.bot || !p.alive || p.falling) continue;
    const b = p.bot;
    if (frozen) { b.dir = [0, 0]; continue; }
    b.think -= dt;
    if (b.think > 0) continue;
    b.think = b.react;
    think(p, b);
  }
}

function think(p, b) {
  const night = G.arena.night;
  const others = aliveList().filter((o) => o !== p && (!night || len(o.x - p.x, o.y - p.y) < 300));
  const si = surfaceInfo(p.x, p.y), rel = si.d / si.er;
  let inX = si.cx - p.x, inY = si.cy - p.y; const inL = len(inX, inY) || 1; inX /= inL; inY /= inL; // towards the middle of my ice
  // --- choose target ---
  if (!b.target || !b.target.alive || b.target.falling || !others.includes(b.target) || Math.random() < 0.08) {
    let best = null, bestScore = -1e9;
    for (const o of others) {
      const dist = len(o.x - p.x, o.y - p.y), os = surfaceInfo(o.x, o.y), orel = os.d / os.er;
      let sc = -dist;
      if (b.pers === "opportunist") sc += orel * 400 - (o.kos * 30);
      if (b.pers === "hunter" && o.isPlayer) sc += 350;
      if (b.pers === "aggressive") sc += o.kos * 60;
      if (b.pers === "cautious") sc += orel * 250;
      if (b.pers === "chaotic") sc += rand(-300, 300);
      if (sc > bestScore) { bestScore = sc; best = o; }
    }
    b.target = best;
  }
  let ax = 0, ay = 0;
  const t = b.target;
  // --- attack / position ---
  if (t) {
    const ts = surfaceInfo(t.x, t.y);
    const tx = t.x, ty = t.y, tdist = len(tx - p.x, ty - p.y);
    let oux = tx - ts.cx, ouy = ty - ts.cy; const ol = len(oux, ouy) || 1; oux /= ol; ouy /= ol; // target's outward direction
    const wantsToAttack = b.pers !== "cautious" || ts.d / ts.er > 0.55 || rel < 0.35;
    if (wantsToAttack) {
      // approach from the inner side so the push sends the target outward
      const behindX = tx - oux * (p.r + t.r + 30), behindY = ty - ouy * (p.r + t.r + 30);
      const selfOutside = (p.x - ts.cx) * oux + (p.y - ts.cy) * ouy > ts.d + 10;
      const aimX = selfOutside && tdist > 50 ? behindX : tx + t.vx * 0.15, aimY = selfOutside && tdist > 50 ? behindY : ty + t.vy * 0.15;
      const dx = aimX - p.x, dy = aimY - p.y, dl = len(dx, dy) || 1;
      ax += dx / dl; ay += dy / dl;
      const aimAng = Math.atan2(ty - p.y, tx - p.x);
      const aligned = Math.abs(angDiff(p.face, aimAng)) < 0.45;
      const boostChance = { aggressive: 0.75, hunter: 0.6, opportunist: 0.55, cautious: 0.4, chaotic: 0.45 }[b.pers];
      if (tdist < 150 && aligned && p.boostCd <= 0 && !selfOutside && si.floe === ts.floe && Math.random() < boostChance) b.boostWant = true;
      if (len(p.vx, p.vy) < 10 && Math.random() < 0.02 && !G.floes) b.boostWant = true;
    } else { ax += inX * 0.8; ay += inY * 0.8; }
  } else { // nobody in sight (polar night): wander towards the middle
    b.wander += rand(-0.6, 0.6); ax += inX * 0.5 + Math.cos(b.wander) * 0.4; ay += inY * 0.5 + Math.sin(b.wander) * 0.4;
  }
  if (b.pers === "chaotic") { b.wander += rand(-1, 1); ax += Math.cos(b.wander) * 0.6; ay += Math.sin(b.wander) * 0.6; if (Math.random() < 0.05 && p.boostCd <= 0 && !G.floes) b.boostWant = true; }
  // --- edge safety ---
  const edgeThresh = (b.pers === "cautious" ? b.edge - 0.08 : b.edge) - (G.arena.spin ? 0.1 : 0) - (G.floes ? 0.08 : 0);
  if (rel > edgeThresh) {
    const k = (rel - edgeThresh) / (1 - edgeThresh) * 3.2;
    ax += inX * k; ay += inY * k;
    const outV = -(p.vx * inX + p.vy * inY);
    if (rel > 0.88 && outV > 90 && p.boostCd <= 0 && Math.random() < 1 - b.noise) { b.boostWant = true; ax = inX; ay = inY; }
  }
  // --- drifting floes: head for the big middle floe, jump over when the gap is small ---
  if (G.floes && si.floe !== G.floes[0]) {
    const c = G.floes[0], dx = c.x - p.x, dy = c.y - p.y, dl = len(dx, dy) || 1;
    const f = si.floe, apart = len(f.x - c.x, f.y - c.y) - f.r - c.r; // > 0: my floe is separated from the middle one
    if (f.r < 115 || apart > 0) { ax += (dx / dl) * 0.3; ay += (dy / dl) * 0.3; } // small or drifting away: head home
    const toEdge = dl - c.r; // distance from me to the middle floe's edge
    if (apart > 0 && toEdge < 80 && p.boostCd <= 0 && Math.random() < 0.3 * (1 - b.noise)) { b.boostWant = true; ax = dx / dl; ay = dy / dl; }
  }
  // --- holes ---
  for (const h of G.holes) {
    const hx = p.x - h.x, hy = p.y - h.y, hd = len(hx, hy) || 1, danger = h.r + p.r + 55;
    if (hd < danger) { const k = (danger - hd) / danger * 3; ax += (hx / hd) * k; ay += (hy / hd) * k; }
  }
  // --- seal: get out of its path ---
  const S = G.seal;
  if (S && (S.state === "warn" || S.state === "charge") && Math.random() > b.noise * 0.8) {
    const dx = Math.cos(S.dir), dy = Math.sin(S.dir), rx = p.x - S.x, ry = p.y - S.y;
    const along = rx * dx + ry * dy, perp = -rx * dy + ry * dx;
    if (along > -40 && Math.abs(perp) < 90) { const sgn = perp >= 0 ? 1 : -1; ax += -dy * sgn * 2.2; ay += dx * sgn * 2.2; }
  }
  // --- wind: lean into it ---
  if (G.wind.phase !== "idle" && Math.random() > b.noise) { ax -= Math.cos(G.wind.dir) * 0.9; ay -= Math.sin(G.wind.dir) * 0.9; }
  // --- noise / imperfection ---
  const ang = Math.atan2(ay, ax) + rand(-b.noise, b.noise), mag = clamp(len(ax, ay), 0, 1);
  b.dir = mag > 0.01 ? [Math.cos(ang) * mag, Math.sin(ang) * mag] : [0, 0];
}

// ======================================================================
// Particles
// ======================================================================
function spawn(p) { if (particles.length < 600) particles.push({ ...p, max: p.life }); }
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const q = particles[i];
    q.life -= dt;
    if (q.life <= 0) { particles.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.type !== "text" && q.type !== "chunk") { q.vx *= 0.94; q.vy *= 0.94; }
    if (q.type === "chunk") q.rot += dt * 0.6;
  }
}
const onScreen = (p) => { const [sx, sy] = toScreen(p.x, p.y); return sx > -50 && sx < W + 50 && sy > -50 && sy < H + 50; };

// ======================================================================
// Rendering
// ======================================================================
let waterT = 0;
function render(dt) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // camera: overview in menus; while playing, follow the player a bit closer (bigger penguins on phones)
  const small = Math.min(W, H) < 600;
  const full = (G ? G.shownR : 520) + (small ? 50 : 90);
  const pl = G && !G.demo && state === "play" ? player() : null;
  const following = pl && pl.alive && !pl.falling;
  const view = following ? Math.min(full, small ? 330 : 440) : full;
  const target = Math.min(W, H * (W < H ? 1 : 1.05)) / (2 * view);
  cam.scale = cam.scale ? lerp(cam.scale, target, Math.min(1, dt * 3)) : target;
  const free = Math.max(0, full - view);
  const tx = following ? clamp(pl.x, -free, free) : 0, ty = following ? clamp(pl.y, -free, free) : 0;
  cam.x = lerp(cam.x, tx, Math.min(1, dt * 4)); cam.y = lerp(cam.y, ty, Math.min(1, dt * 4));
  cam.shake = Math.max(0, cam.shake - dt * 30);
  const sx = cam.shake ? rand(-cam.shake, cam.shake) : 0, sy = cam.shake ? rand(-cam.shake, cam.shake) : 0;

  waterT += dt;
  const T = theme();
  // --- water ---
  const wg = ctx.createLinearGradient(0, 0, 0, H);
  wg.addColorStop(0, T.water[0]); wg.addColorStop(0.55, T.water[1]); wg.addColorStop(1, T.water[2]);
  ctx.fillStyle = wg; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(sx, sy);
  drawWaterDetails(T);
  if (!G) { ctx.restore(); return; }
  drawEnvironment(T, dt);
  // floating chunks behind the ice
  for (const q of particles) if (q.type === "chunk") drawChunk(q);
  if (G.floes) {
    for (const f of [...G.floes].sort((p, q) => p.y - q.y)) drawSlab(T, f.x, f.y, f.r, (a) => floeMul(f, a), f.spin * G.time, 200);
    if (G.meltWarn) {
      const blink = 0.4 + 0.5 * Math.abs(Math.sin(G.time * 12));
      ctx.save(); ctx.setLineDash([10, 8]); ctx.strokeStyle = `rgba(230,40,40,${blink})`; ctx.lineWidth = 3;
      for (const f of G.floes) { slabPath(f.x, f.y, Math.max(f.minR, f.r - 13), 0, (a) => floeMul(f, a)); ctx.stroke(); }
      ctx.restore();
    }
  } else drawIceSlab(T);
  if (G.arena.spin) drawSpinMarks(T);
  // holes
  for (const h of G.holes) drawHole(h, T);
  // shrink warning: red dashed outline of the new edge
  if (G.shrinkWarn) {
    const blink = (Math.sin(G.time * 18) + 1) / 2;
    ctx.save();
    edgePath(G.shownR, 0); edgePath(G.targetR, 0, true);
    ctx.fillStyle = `rgba(255,70,60,${0.14 + blink * 0.2})`; ctx.fill("evenodd");
    ctx.setLineDash([12, 9]); ctx.lineDashOffset = -G.time * 30;
    edgePath(G.targetR, 0); ctx.strokeStyle = `rgba(230,40,40,${0.55 + blink * 0.45})`; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();
  }
  // wind warning arrows on the ice
  if (G.wind.phase !== "idle") drawWind();

  // particles under penguins
  for (const q of particles) if (q.type === "ring" || q.type === "splash") drawParticle(q);
  // penguins sorted by y
  const list = G.penguins.filter((p) => p.alive).sort((a, b) => a.y - b.y);
  for (const p of list) drawPenguin(p);
  if (G.seal) drawSeal(G.seal);
  if (theme().night) drawNight();
  for (const p of list) if (!theme().night || p.isPlayer) drawTag(p);
  for (const q of particles) if (q.type === "snow" || q.type === "spark" || q.type === "text") drawParticle(q);
  if (theme().snowfall) { ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); drawSnowfall(dt); ctx.restore(); }
  // joystick
  if (state === "play" && input.joy) {
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(input.joy.ox, input.joy.oy, 60, 0, TAU); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.beginPath(); ctx.arc(input.joy.x, input.joy.y, 24, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/** Path of the floe outline at radius R (world), shifted down by `drop` screen px. */
/** Outline of an ice slab centred at (wx, wy) with radius R, shifted down by `drop` screen px. */
function slabPath(wx, wy, R, drop, mul, append = false) {
  const [cx, cy] = toScreen(wx, wy);
  if (!append) ctx.beginPath();
  const n = 72;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU, r = R * mul(a) * cam.scale;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r + drop;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}
function edgePath(R, drop, append = false) { slabPath(0, 0, R, drop, edgeMul, append); }

function drawIceSlab(T) { drawSlab(T, 0, 0, G.shownR, edgeMul, G.rot, G.arena.radius); }

function drawSlab(T, wx, wy, Rw, mul, texRot, texRadius) {
  const [cx, cy] = toScreen(wx, wy), R = Rw * cam.scale;
  const thick = Math.max(8, 26 * cam.scale);
  const path = (scale, drop) => slabPath(wx, wy, Rw * scale, drop, mul);
  // shadow in the water
  ctx.fillStyle = "rgba(5,40,80,.28)"; path(1.02, thick + 10 * cam.scale); ctx.fill();
  // foam ring at the waterline
  ctx.save(); ctx.setLineDash([14 * cam.scale + 4, 10 * cam.scale + 3]); ctx.lineDashOffset = -waterT * 18;
  ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = Math.max(4, 12 * cam.scale); path(1.015, thick); ctx.stroke(); ctx.restore();
  // side wall
  const sg = ctx.createLinearGradient(0, cy - R, 0, cy + R + thick);
  sg.addColorStop(0, T.side[0]); sg.addColorStop(1, T.side[1]);
  ctx.fillStyle = sg; path(1, thick); ctx.fill();
  ctx.strokeStyle = T.line; ctx.lineWidth = Math.max(2, 3.5 * cam.scale); ctx.stroke();
  // vertical stripes on the visible (lower) side
  ctx.save(); path(1, thick); ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = Math.max(1.5, 3 * cam.scale);
  const stripes = Math.max(8, Math.round(28 * Rw / 520));
  for (let i = 0; i < stripes; i++) {
    const a = (i / stripes) * Math.PI + 0.05, r = Rw * mul(a) * cam.scale;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    ctx.beginPath(); ctx.moveTo(x, y + thick * 0.15); ctx.lineTo(x, y + thick * 0.75); ctx.stroke();
  }
  ctx.restore();
  // top surface (texture turns with the ice)
  ctx.save(); path(1, 0); ctx.clip();
  const texR = texRadius * 1.06 * cam.scale;
  ctx.translate(cx, cy); ctx.rotate(texRot);
  ctx.drawImage(G.ice, -texR, -texR, texR * 2, texR * 2);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.restore();
  ctx.save(); path(1, 0); ctx.clip();
  const eg = ctx.createRadialGradient(cx, cy, R * 0.82, cx, cy, R * 1.05);
  eg.addColorStop(0, "rgba(255,255,255,0)"); eg.addColorStop(1, "rgba(255,255,255,.55)");
  ctx.fillStyle = eg; ctx.fillRect(cx - R * 1.1, cy - R * 1.1, R * 2.2, R * 2.2);
  ctx.restore();
  ctx.strokeStyle = T.line; ctx.lineWidth = Math.max(2.5, 4 * cam.scale); path(1, 0); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = Math.max(1, 2 * cam.scale); path(0.985, 0); ctx.stroke();
}

/** Spinning floe: curved arrows painted on the ice show the direction. */
function drawSpinMarks(T) {
  const [cx, cy] = toScreen(0, 0);
  ctx.save(); ctx.strokeStyle = "rgba(90,105,210,.28)"; ctx.fillStyle = "rgba(90,105,210,.28)"; ctx.lineWidth = Math.max(3, 9 * cam.scale); ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const a0 = G.rot + (i / 3) * TAU, r = G.shownR * 0.55 * cam.scale;
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + 1.3); ctx.stroke();
    const ex = cx + Math.cos(a0 + 1.3) * r, ey = cy + Math.sin(a0 + 1.3) * r, ta = a0 + 1.3 + Math.PI / 2, s = Math.max(8, 22 * cam.scale);
    ctx.beginPath(); ctx.moveTo(ex + Math.cos(ta) * s, ey + Math.sin(ta) * s); ctx.lineTo(ex + Math.cos(ta + 2.4) * s, ey + Math.sin(ta + 2.4) * s); ctx.lineTo(ex + Math.cos(ta - 2.4) * s, ey + Math.sin(ta - 2.4) * s); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/** The seal: warning (bubbles + dashed path), charge, dive. */
function drawSeal(S) {
  if (S.state === "idle") return;
  const T = theme();
  if (S.state === "warn") {
    const [x0, y0] = toScreen(S.sx, S.sy), L = (G.R * 2 + 90) * cam.scale;
    const blink = 0.45 + 0.45 * Math.abs(Math.sin(G.time * 10));
    ctx.save(); ctx.setLineDash([16, 12]); ctx.lineDashOffset = -G.time * 60; ctx.strokeStyle = `rgba(230,40,40,${blink})`; ctx.lineWidth = Math.max(4, 10 * cam.scale);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(S.dir) * L, y0 + Math.sin(S.dir) * L); ctx.stroke(); ctx.restore();
    ctx.fillStyle = `rgba(255,255,255,${blink})`; ctx.font = `900 ${Math.max(16, 26 * cam.scale)}px ${FONT}`; ctx.textAlign = "center"; ctx.fillText("!", x0, y0 + 8);
    return;
  }
  const [x, y] = toScreen(S.x, S.y), r = S.r * cam.scale;
  ctx.save(); ctx.globalAlpha = S.alpha; ctx.translate(x, y); ctx.rotate(S.dir);
  // wake
  ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.ellipse(-r * 1.6, 0, r * 0.9, r * 0.5, 0, 0, TAU); ctx.fill();
  const wob = Math.sin(S.squash) * 0.3;
  ctx.fillStyle = "#6f7f8f"; ctx.strokeStyle = T.line; ctx.lineWidth = Math.max(2, 3 * cam.scale);
  // tail flippers
  ctx.beginPath(); ctx.moveTo(-r * 1.2, 0); ctx.lineTo(-r * 1.75, -r * 0.5 + wob * r); ctx.lineTo(-r * 1.6, 0); ctx.lineTo(-r * 1.75, r * 0.5 + wob * r); ctx.closePath(); ctx.fill(); ctx.stroke();
  // front flippers
  for (const sg of [-1, 1]) { ctx.beginPath(); ctx.ellipse(r * 0.2, sg * r * 0.75, r * 0.45, r * 0.18, sg * (0.6 + wob), 0, TAU); ctx.fill(); ctx.stroke(); }
  // body + head
  ctx.beginPath(); ctx.ellipse(-r * 0.2, 0, r * 1.25, r * 0.78, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#8696a6"; ctx.beginPath(); ctx.arc(r * 0.85, 0, r * 0.55, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.3, r * 0.6, r * 0.2, 0, 0, TAU); ctx.fill();
  // face
  ctx.fillStyle = "#111";
  for (const sg of [-1, 1]) { ctx.beginPath(); ctx.arc(r * 1.05, sg * r * 0.22, r * 0.1, 0, TAU); ctx.fill(); }
  ctx.beginPath(); ctx.arc(r * 1.35, 0, r * 0.08, 0, TAU); ctx.fill();
  ctx.strokeStyle = "rgba(20,20,20,.6)"; ctx.lineWidth = 1.2;
  for (const sg of [-1, 1]) for (const k of [-0.2, 0.2]) { ctx.beginPath(); ctx.moveTo(r * 1.3, sg * r * 0.12); ctx.lineTo(r * 1.65, sg * r * (0.25 + k)); ctx.stroke(); }
  ctx.restore();
}

/** Polar night: everything dark except light around penguins, plus aurora. */
let nightCv = null;
function drawNight() {
  if (!nightCv) nightCv = document.createElement("canvas");
  if (nightCv.width !== canvas.width || nightCv.height !== canvas.height) { nightCv.width = canvas.width; nightCv.height = canvas.height; }
  const n = nightCv.getContext("2d");
  n.setTransform(DPR, 0, 0, DPR, 0, 0);
  n.globalCompositeOperation = "source-over"; n.clearRect(0, 0, W, H);
  n.fillStyle = "rgba(3,8,24,.9)"; n.fillRect(0, 0, W, H);
  n.globalCompositeOperation = "destination-out";
  const light = (wx, wy, wr) => {
    const [x, y] = toScreen(wx, wy), r = wr * cam.scale;
    const g = n.createRadialGradient(x, y, r * 0.3, x, y, r);
    g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
    n.fillStyle = g; n.beginPath(); n.arc(x, y, r, 0, TAU); n.fill();
  };
  for (const p of G.penguins) if (p.alive) light(p.x, p.y, p.isPlayer ? 200 : 80);
  if (G.seal && G.seal.state !== "idle") light(G.seal.state === "warn" ? G.seal.sx : G.seal.x, G.seal.state === "warn" ? G.seal.sy : G.seal.y, 90);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(nightCv, 0, 0); ctx.restore();
  // aurora ribbons
  ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.globalCompositeOperation = "lighter";
  const cols = ["rgba(80,255,170,.10)", "rgba(120,140,255,.08)", "rgba(200,90,255,.07)"];
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = cols[i]; ctx.lineWidth = 40 + i * 14; ctx.lineCap = "round";
    ctx.beginPath();
    for (let x = -40; x <= W + 40; x += 30) {
      const y = H * (0.12 + i * 0.07) + Math.sin(x * 0.006 + waterT * 0.5 + i * 2) * 30 + Math.sin(x * 0.015 + waterT * 0.9) * 10;
      x === -40 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
  // faint glowing rim so the edge stays readable
  ctx.save(); ctx.strokeStyle = "rgba(150,215,255,.4)"; ctx.lineWidth = 3; ctx.setLineDash([4, 10]); edgePath(G.shownR, 0); ctx.stroke(); ctx.restore();
}

/** Cartoon waves and sparkles, anchored to the world so they move with the camera. */
function drawWaterDetails(T) {
  const sc = cam.scale, cell = 150;
  const [wx0, wy0] = toWorld(0, 0), [wx1, wy1] = toWorld(W, H);
  const gx0 = Math.floor(wx0 / cell) - 1, gx1 = Math.ceil(wx1 / cell) + 1, gy0 = Math.floor(wy0 / cell) - 1, gy1 = Math.ceil(wy1 / cell) + 1;
  ctx.lineCap = "round";
  for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
    const h = Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453, f = h - Math.floor(h);
    const x = (gx + f) * cell + Math.sin(waterT * 0.6 + f * 6) * 12, y = (gy + ((f * 7) % 1)) * cell;
    const [px, py] = toScreen(x, y), w = (18 + f * 16) * sc + 6;
    const bob = Math.sin(waterT * 2 + f * 10) * 3;
    ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = Math.max(2, 4 * sc);
    ctx.beginPath(); ctx.arc(px - w * 0.5, py + bob, w * 0.5, Math.PI * 1.15, Math.PI * 1.85); ctx.arc(px + w * 0.5, py + bob, w * 0.5, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    // sparkle
    if (f > 0.72) {
      const tw = (Math.sin(waterT * 3 + f * 40) + 1) / 2;
      if (tw > 0.6) {
        const sx2 = px + 40 * sc, sy2 = py - 30 * sc, r = (3 + tw * 5) * Math.max(0.6, sc);
        ctx.fillStyle = `rgba(255,255,255,${tw})`;
        ctx.beginPath(); ctx.moveTo(sx2, sy2 - r * 2); ctx.lineTo(sx2 + r * 0.45, sy2 - r * 0.45); ctx.lineTo(sx2 + r * 2, sy2); ctx.lineTo(sx2 + r * 0.45, sy2 + r * 0.45);
        ctx.lineTo(sx2, sy2 + r * 2); ctx.lineTo(sx2 - r * 0.45, sy2 + r * 0.45); ctx.lineTo(sx2 - r * 2, sy2); ctx.lineTo(sx2 - r * 0.45, sy2 - r * 0.45); ctx.fill();
      }
    }
  }
}

/** A chunky cartoon ice block (used for floes and icebergs). */
function drawBlock(x, y, r, thick, seed, T, snowCap, rot = 0) {
  const [sx, sy] = toScreen(x, y), rr = r * cam.scale, th = thick * cam.scale;
  if (sx < -rr * 2 || sx > W + rr * 2 || sy < -rr * 2 - th || sy > H + rr * 2) return;
  const path = (scale, drop) => {
    ctx.beginPath();
    for (let i = 0; i <= 9; i++) {
      const a = (i / 9) * TAU + rot, k = 0.78 + 0.22 * Math.abs(Math.sin(seed + i * 1.7));
      const px = sx + Math.cos(a) * rr * k * scale, py = sy + Math.sin(a) * rr * k * scale * 0.82 + drop;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  };
  ctx.fillStyle = "rgba(5,40,80,.25)"; path(1.04, th + 6 * cam.scale); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = Math.max(2, 6 * cam.scale); path(1.03, th); ctx.stroke();
  const sg = ctx.createLinearGradient(0, sy - rr, 0, sy + rr + th); sg.addColorStop(0, T.side[0]); sg.addColorStop(1, T.side[1]);
  ctx.fillStyle = sg; path(1, th); ctx.fill(); ctx.strokeStyle = T.line; ctx.lineWidth = Math.max(1.5, 3 * cam.scale); ctx.stroke();
  // side (connect top and bottom by drawing the bottom-half band)
  ctx.fillStyle = sg;
  for (let d = th; d > 0; d -= Math.max(2, th / 6)) { path(1, d); ctx.fill(); }
  ctx.fillStyle = T.top[1]; path(1, 0); ctx.fill(); ctx.strokeStyle = T.line; ctx.lineWidth = Math.max(1.5, 3 * cam.scale); ctx.stroke();
  if (snowCap) { ctx.fillStyle = "#ffffff"; path(0.62, -2 * cam.scale); ctx.fill(); }
  ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = Math.max(1.5, 3 * cam.scale);
  ctx.beginPath(); ctx.moveTo(sx - rr * 0.45, sy - rr * 0.2); ctx.lineTo(sx - rr * 0.2, sy - rr * 0.38); ctx.stroke();
}

/** Cartoon iceberg: a chunky base with 2-3 pointy peaks (lit side + shaded side). */
function drawBerg(b, bob, T) {
  const [sx, sy0] = toScreen(b.x, b.y), rr = b.r * cam.scale, sy = sy0 + bob;
  const hgt = b.r * b.h * cam.scale;
  if (sx < -rr * 2 || sx > W + rr * 2 || sy < -hgt - rr || sy > H + rr * 2) return;
  drawBlock(b.x, b.y + bob / Math.max(cam.scale, 0.01), b.r, 16, b.seed, T, false);
  const peaks = [];
  for (let i = 0; i < b.peaks; i++) {
    const t = b.peaks === 2 ? [-0.32, 0.3][i] : [-0.45, 0.05, 0.45][i];
    const ph = hgt * (i === 1 || b.peaks === 2 && i === 0 ? 1 : 0.7) * (0.85 + 0.3 * Math.abs(Math.sin(b.seed + i)));
    peaks.push({ x: sx + t * rr * 1.2, base: rr * (0.55 + 0.1 * Math.sin(b.seed * 3 + i)), h: ph });
  }
  peaks.sort((p, q) => q.h - p.h);
  ctx.lineJoin = "round";
  for (const p of peaks.reverse()) {
    const bx = p.x, by = sy + rr * 0.12, top = by - p.h, l = bx - p.base, r = bx + p.base, tipX = bx - p.base * 0.15;
    // shaded right face
    ctx.fillStyle = T.side[0]; ctx.beginPath(); ctx.moveTo(tipX, top); ctx.lineTo(r, by); ctx.lineTo(bx + p.base * 0.1, by); ctx.closePath(); ctx.fill();
    // lit left face
    ctx.fillStyle = T.top[0]; ctx.beginPath(); ctx.moveTo(tipX, top); ctx.lineTo(bx + p.base * 0.1, by); ctx.lineTo(l, by); ctx.closePath(); ctx.fill();
    // snow cap
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.moveTo(tipX, top);
    ctx.lineTo(tipX + (r - tipX) * 0.32, top + p.h * 0.3); ctx.lineTo(tipX + (r - tipX) * 0.12, top + p.h * 0.24); ctx.lineTo(tipX - (tipX - l) * 0.05, top + p.h * 0.34);
    ctx.lineTo(tipX - (tipX - l) * 0.3, top + p.h * 0.3); ctx.closePath(); ctx.fill();
    // outline
    ctx.strokeStyle = T.line; ctx.lineWidth = Math.max(1.5, 3 * cam.scale);
    ctx.beginPath(); ctx.moveTo(l, by); ctx.lineTo(tipX, top); ctx.lineTo(r, by); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = Math.max(1, 2 * cam.scale);
    ctx.beginPath(); ctx.moveTo(tipX - (tipX - l) * 0.55, top + p.h * 0.55); ctx.lineTo(tipX - (tipX - l) * 0.75, top + p.h * 0.8); ctx.stroke();
  }
}

function drawEnvironment(T, dt) {
  const env = G.env;
  // icebergs (big, tall)
  for (const b of [...env.bergs].sort((p, q) => p.y - q.y)) {
    const bob = Math.sin(waterT * 0.8 + b.ph) * 3;
    drawBerg(b, bob, T);
  }
  // drifting floes, some with tiny penguins
  for (const f of env.floes) {
    f.x += f.drift * dt; f.rot += dt * 0.03;
    const bob = Math.sin(waterT * 1.4 + f.ph) * 2.5;
    drawBlock(f.x, f.y + bob, f.r, 10, f.seed, T, f.snow, f.rot);
    for (let i = 0; i < f.pengs; i++) {
      const [px, py] = toScreen(f.x + (i - 0.5) * f.r * 0.5, f.y + bob - 4);
      ctx.save(); ctx.globalAlpha = 0.95;
      draw1Penguin(ctx, px, py, 11 * cam.scale + 2, Math.PI / 2 + Math.sin(waterT + f.ph + i) * 0.6, { body: "#1f2b45", belly: "#ffffff" }, waterT * 2 + i, 0);
      ctx.restore();
    }
  }
  // jumping fish
  env.fishT -= dt;
  if (env.fishT <= 0) {
    env.fishT = rand(1.2, 3);
    for (let tries = 0; tries < 10; tries++) {
      const [wx, wy] = toWorld(rand(W * 0.05, W * 0.95), rand(H * 0.1, H * 0.95));
      if (len(wx, wy) > G.shownR * 1.15) { env.fish.push({ x: wx, y: wy, t: 0, dir: Math.random() < 0.5 ? -1 : 1, c: pick(["#ff8a3d", "#ffcf3d", "#ff5f7e", "#9b7bff"]) }); spawnRipple(wx, wy); break; }
    }
  }
  for (let i = env.fish.length - 1; i >= 0; i--) {
    const f = env.fish[i]; f.t += dt;
    const k = f.t / 0.9;
    if (k >= 1) { spawnRipple(f.x + f.dir * 70, f.y); env.fish.splice(i, 1); continue; }
    const fx = f.x + f.dir * 70 * k, fy = f.y - Math.sin(k * Math.PI) * 55;
    const [px, py] = toScreen(fx, fy), s = Math.max(5, 11 * cam.scale);
    const ang = Math.atan2(-Math.cos(k * Math.PI) * 55 * Math.PI, f.dir * 70) * (f.dir > 0 ? 1 : 1);
    ctx.save(); ctx.translate(px, py); ctx.rotate(ang); ctx.scale(f.dir, 1);
    if (f.dir < 0) ctx.rotate(0);
    ctx.fillStyle = f.c; ctx.strokeStyle = "#1b3d5c"; ctx.lineWidth = Math.max(1.5, 2 * cam.scale);
    ctx.beginPath(); ctx.ellipse(0, 0, s * 1.3, s * 0.65, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 1.1, 0); ctx.lineTo(-s * 2, -s * 0.7); ctx.lineTo(-s * 2, s * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(s * 0.7, -s * 0.15, s * 0.25, 0, TAU); ctx.fill();
    ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(s * 0.75, -s * 0.15, s * 0.12, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
function spawnRipple(x, y) {
  spawn({ x, y, vx: 0, vy: 0, life: 0.8, size: 6, color: "rgba(255,255,255,.9)", type: "ring" });
  for (let k = 0; k < 5; k++) spawn({ x, y, vx: rand(-60, 60), vy: rand(-90, -30), life: 0.5, size: rand(2, 4), color: "#ffffff", type: "splash" });
}

/** Screen-space snowfall for the Snowstorm arena. */
function drawSnowfall(dt) {
  const env = G.env, w = G.wind, blow = w.phase === "blow";
  const vx = blow ? Math.cos(w.dir) * 0.9 : 0.08, vy = blow ? Math.sin(w.dir) * 0.9 + 0.1 : 0.22;
  ctx.fillStyle = "rgba(255,255,255,.85)";
  for (const f of env.flakes) {
    f.x = (f.x + vx * f.v * dt + 1) % 1; f.y = (f.y + vy * f.v * dt + 1) % 1;
    ctx.beginPath(); ctx.arc(f.x * W, f.y * H, f.s, 0, TAU); ctx.fill();
  }
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, "rgba(220,232,250,0)"); vg.addColorStop(1, "rgba(220,232,250,.35)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

function drawHole(h, T) {
  const [x, y] = toScreen(h.x, h.y), r = h.r * cam.scale;
  const shape = (scale, dy = 0) => { ctx.beginPath(); for (let i = 0; i <= 16; i++) { const a = (i / 16) * TAU, rr = r * scale * (0.9 + 0.1 * Math.sin(i * 2.3 + h.seed)); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr + dy; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); };
  if (!h.open) { // crack warning
    const k = clamp(1 - h.t / 1.9, 0, 1);
    ctx.strokeStyle = T.line; ctx.lineWidth = Math.max(2, 3 * cam.scale); ctx.lineCap = "round";
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + h.seed;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a + 0.25) * r * 0.5 * k, y + Math.sin(a + 0.25) * r * 0.5 * k);
      ctx.lineTo(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k); ctx.stroke();
    }
    ctx.strokeStyle = `rgba(230,40,40,${0.4 + 0.5 * ((Math.sin(G.time * 16) + 1) / 2)})`; ctx.setLineDash([8, 7]); ctx.lineWidth = 3;
    shape(1); ctx.stroke(); ctx.setLineDash([]);
    return;
  }
  // inner ice wall, then dark water, then outline
  ctx.fillStyle = T.side[1]; shape(1); ctx.fill();
  const wg = ctx.createRadialGradient(x, y + r * 0.2, r * 0.1, x, y + r * 0.2, r);
  wg.addColorStop(0, T.water[2]); wg.addColorStop(1, T.water[1]);
  ctx.fillStyle = wg; shape(0.86, r * 0.12); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y + r * 0.15, r * 0.45 + Math.sin(G.time * 2.5) * 3, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  ctx.strokeStyle = T.line; ctx.lineWidth = Math.max(2.5, 4 * cam.scale); shape(1); ctx.stroke();
}

function drawWind() {
  const w = G.wind, [cx, cy] = toScreen(0, 0);
  const a = w.dir, alpha = w.phase === "warn" ? 0.35 + 0.35 * Math.abs(Math.sin(G.time * 8)) : 0.25;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  const s = Math.max(20, 34 * cam.scale);
  for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) {
    const off = ((G.time * (w.phase === "blow" ? 260 : 90)) % 160);
    const x = i * 160 * cam.scale + off * cam.scale - 80 * cam.scale, y = j * 150 * cam.scale;
    ctx.beginPath(); ctx.moveTo(x + s, y); ctx.lineTo(x - s * 0.4, y - s * 0.7); ctx.lineTo(x - s * 0.1, y); ctx.lineTo(x - s * 0.4, y + s * 0.7); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawChunk(q) {
  const [x, y] = toScreen(q.x, q.y), s = q.size * cam.scale, k = clamp(q.life / q.max, 0, 1);
  ctx.save(); ctx.translate(x, y); ctx.rotate(q.rot); ctx.globalAlpha = k;
  ctx.fillStyle = "#7fc1e4"; ctx.fillRect(-s / 2, -s / 2 + 3, s, s * 0.8);
  ctx.fillStyle = q.color; ctx.fillRect(-s / 2, -s / 2, s, s * 0.8);
  ctx.restore();
}

function drawParticle(q) {
  const [x, y] = toScreen(q.x, q.y), k = clamp(q.life / q.max, 0, 1);
  ctx.globalAlpha = k;
  if (q.type === "ring") {
    ctx.strokeStyle = q.color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, (q.size + (1 - k) * 40) * cam.scale, 0, TAU); ctx.stroke();
  } else if (q.type === "text") {
    ctx.fillStyle = q.color; ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 4;
    ctx.font = `900 ${Math.round(22 + (1 - k) * 6)}px ${FONT}`; ctx.textAlign = "center";
    ctx.strokeText(q.text, x, y); ctx.fillText(q.text, x, y);
  } else {
    ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(x, y, Math.max(1, q.size * cam.scale), 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';

function drawPenguin(p) {
  const [x, y] = toScreen(p.x, p.y);
  let r = p.r * cam.scale;
  let alpha = 1;
  if (p.falling) { const k = clamp(p.falling / 0.7, 0, 1); r *= 1 - k * 0.6; alpha = 1 - k; }
  ctx.save(); ctx.globalAlpha = alpha;
  // shadow
  ctx.fillStyle = "rgba(20,60,100,.22)"; ctx.beginPath(); ctx.ellipse(x + r * 0.12, y + r * 0.28, r * 1.02, r * 0.8, 0, 0, TAU); ctx.fill();
  if (p.isPlayer && !p.falling) { ctx.strokeStyle = "rgba(255,216,74,.9)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y + r * 0.2, r * 1.25, r * 1.05, 0, 0, TAU); ctx.stroke(); }
  // boost trail
  if (p.boosting) { ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.arc(x - Math.cos(p.face) * r * 0.9, y - Math.sin(p.face) * r * 0.9, r * 0.8, 0, TAU); ctx.fill(); }
  draw1Penguin(ctx, x, y, r, p.face, p.skin, p.waddle, p.squash);
  ctx.restore();
}

/** Penguin seen from above (slight tilt). Also used for menu previews. */
function draw1Penguin(g, x, y, r, face, skin, waddle = 0, squash = 0) {
  const cos = Math.cos(face), sin = Math.sin(face);
  const wob = Math.sin(waddle) * 0.25;
  g.save(); g.translate(x, y);
  if (squash) g.scale(1 + squash * 0.12, 1 - squash * 0.1);
  // feet
  g.fillStyle = "#ff9a1f";
  for (const s of [-1, 1]) {
    const fa = face + s * 0.55 + (s * wob);
    g.beginPath(); g.ellipse(Math.cos(fa) * r * 0.78, Math.sin(fa) * r * 0.78 + r * 0.1, r * 0.26, r * 0.17, fa, 0, TAU); g.fill();
  }
  // flippers
  g.fillStyle = shade(skin.body, -0.15);
  for (const s of [-1, 1]) {
    const fa = face + s * (Math.PI / 2 + 0.15 + (s > 0 ? wob : -wob) * 0.6);
    g.beginPath(); g.ellipse(Math.cos(fa) * r * 0.9, Math.sin(fa) * r * 0.9, r * 0.36, r * 0.17, fa, 0, TAU); g.fill();
  }
  // body
  g.fillStyle = skin.body; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.strokeStyle = shade(skin.body, -0.35); g.lineWidth = Math.max(1, r * 0.07); g.stroke();
  // belly
  g.fillStyle = skin.belly; g.beginPath(); g.ellipse(cos * r * 0.3, sin * r * 0.3, r * 0.62, r * 0.55, face, 0, TAU); g.fill();
  // body highlight
  g.fillStyle = "rgba(255,255,255,.12)"; g.beginPath(); g.ellipse(-r * 0.3, -r * 0.35, r * 0.4, r * 0.25, -0.6, 0, TAU); g.fill();
  if (skin.acc === "scarf") { g.strokeStyle = skin.accColor; g.lineWidth = r * 0.22; g.beginPath(); g.arc(0, 0, r * 0.62, face - 1.6, face + 1.6); g.stroke();
    g.fillStyle = skin.accColor; g.beginPath(); g.ellipse(Math.cos(face + 1.9) * r * 0.85, Math.sin(face + 1.9) * r * 0.85, r * 0.3, r * 0.12, face + 1.9, 0, TAU); g.fill(); }
  // eyes
  for (const s of [-1, 1]) {
    const ea = face + s * 0.42, ex = Math.cos(ea) * r * 0.52, ey = Math.sin(ea) * r * 0.52;
    g.fillStyle = "#fff"; g.beginPath(); g.arc(ex, ey, r * 0.17, 0, TAU); g.fill();
    g.fillStyle = "#111"; g.beginPath(); g.arc(ex + cos * r * 0.05, ey + sin * r * 0.05, r * 0.09, 0, TAU); g.fill();
  }
  // beak
  g.fillStyle = "#ffae1f";
  g.beginPath();
  g.moveTo(cos * r * 1.12, sin * r * 1.12);
  g.lineTo(Math.cos(face + 0.32) * r * 0.72, Math.sin(face + 0.32) * r * 0.72);
  g.lineTo(Math.cos(face - 0.32) * r * 0.72, Math.sin(face - 0.32) * r * 0.72);
  g.closePath(); g.fill();
  drawAccessory(g, r, face, skin);
  g.restore();
}

function drawAccessory(g, r, face, skin) {
  const c = skin.accColor, back = face + Math.PI, bx = Math.cos(back) * r * 0.15, by = Math.sin(back) * r * 0.15;
  switch (skin.acc) {
    case "beanie":
      g.fillStyle = c; g.beginPath(); g.arc(bx, by, r * 0.62, 0, TAU); g.fill();
      g.fillStyle = shade(c, 0.25); g.beginPath(); g.arc(bx, by, r * 0.62, face - 1.2, face + 1.2); g.lineTo(bx, by); g.fill();
      g.fillStyle = "#fff"; g.beginPath(); g.arc(bx, by, r * 0.2, 0, TAU); g.fill(); break;
    case "cap":
      g.fillStyle = c; g.beginPath(); g.arc(bx, by, r * 0.6, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(Math.cos(back) * r * 0.75, Math.sin(back) * r * 0.75, r * 0.38, r * 0.22, back, 0, TAU); g.fill();
      g.fillStyle = "#fff"; g.beginPath(); g.arc(bx, by, r * 0.09, 0, TAU); g.fill(); break;
    case "shades":
      g.fillStyle = c;
      for (const s of [-1, 1]) { const ea = face + s * 0.42; g.beginPath(); g.ellipse(Math.cos(ea) * r * 0.55, Math.sin(ea) * r * 0.55, r * 0.22, r * 0.16, face, 0, TAU); g.fill(); }
      g.strokeStyle = c; g.lineWidth = r * 0.08; g.beginPath(); g.arc(0, 0, r * 0.55, face - 0.42, face + 0.42); g.stroke(); break;
    case "bow":
      g.fillStyle = c;
      for (const s of [-1, 1]) { const a = back + Math.PI / 2 * s * 0.5; g.beginPath(); g.ellipse(bx + Math.cos(a) * r * 0.22, by + Math.sin(a) * r * 0.22, r * 0.26, r * 0.15, a, 0, TAU); g.fill(); }
      g.fillStyle = shade(c, -0.2); g.beginPath(); g.arc(bx, by, r * 0.11, 0, TAU); g.fill(); break;
    case "chef":
      g.fillStyle = "#fff"; g.strokeStyle = "#d6dbe4"; g.lineWidth = r * 0.06;
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; g.beginPath(); g.arc(bx + Math.cos(a) * r * 0.25, by + Math.sin(a) * r * 0.25, r * 0.3, 0, TAU); g.fill(); g.stroke(); }
      g.beginPath(); g.arc(bx, by, r * 0.3, 0, TAU); g.fill(); break;
    case "viking":
      g.fillStyle = c; g.beginPath(); g.arc(bx, by, r * 0.6, 0, TAU); g.fill();
      g.fillStyle = "#fff6dc";
      for (const s of [-1, 1]) {
        const a = face + s * Math.PI / 2;
        g.beginPath(); g.moveTo(bx + Math.cos(a) * r * 0.5, by + Math.sin(a) * r * 0.5);
        g.quadraticCurveTo(bx + Math.cos(a) * r * 1.0, by + Math.sin(a) * r * 1.0, bx + Math.cos(a - s * 0.5) * r * 1.15, by + Math.sin(a - s * 0.5) * r * 1.15);
        g.lineTo(bx + Math.cos(a + s * 0.3) * r * 0.55, by + Math.sin(a + s * 0.3) * r * 0.55); g.fill();
      }
      break;
    case "headphones":
      g.strokeStyle = "#222"; g.lineWidth = r * 0.12; g.beginPath(); g.arc(0, 0, r * 0.75, face + 1.1, face + Math.PI * 2 - 1.1, false); g.stroke();
      g.fillStyle = c; for (const s of [-1, 1]) { const a = face + s * (Math.PI / 2 + 0.1); g.beginPath(); g.arc(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, r * 0.24, 0, TAU); g.fill(); }
      break;
    case "ninja":
      g.strokeStyle = c; g.lineWidth = r * 0.2; g.beginPath(); g.arc(0, 0, r * 0.78, face - 1.4, face + 1.4); g.stroke();
      g.fillStyle = c; g.beginPath(); g.ellipse(Math.cos(back) * r * 1.05, Math.sin(back) * r * 1.05, r * 0.35, r * 0.1, back + 0.3, 0, TAU); g.fill(); break;
    case "crown":
      g.fillStyle = c; g.beginPath();
      for (let i = 0; i <= 10; i++) { const a = (i / 10) * TAU, rr = i % 2 ? r * 0.28 : r * 0.5; i ? g.lineTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr) : g.moveTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr); }
      g.fill(); g.fillStyle = "#e8443a"; g.beginPath(); g.arc(bx, by, r * 0.12, 0, TAU); g.fill(); break;
    case "tophat":
      g.fillStyle = "#111"; g.beginPath(); g.arc(bx, by, r * 0.62, 0, TAU); g.fill();
      g.fillStyle = "#2a2a2a"; g.beginPath(); g.arc(bx, by, r * 0.4, 0, TAU); g.fill();
      g.strokeStyle = "#e8443a"; g.lineWidth = r * 0.1; g.beginPath(); g.arc(bx, by, r * 0.43, 0, TAU); g.stroke(); break;
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.round(clamp(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt, 0, 255));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function drawTag(p) {
  if (p.falling) return;
  const [x, y] = toScreen(p.x, p.y), r = p.r * cam.scale;
  const leader = G.penguins.reduce((m, q) => (q.alive && !q.falling && q.kos > (m ? m.kos : 0) ? q : m), null);
  const show = p.isPlayer || p === leader || W > 700;
  if (!show) return;
  ctx.font = `800 ${p.isPlayer ? 13 : 11}px ${FONT}`; ctx.textAlign = "center";
  const label = (p === leader && p.kos > 0 ? "👑 " : "") + p.name;
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(8,30,55,.55)"; ctx.fillStyle = p.isPlayer ? "#ffd84a" : "#ffffff";
  ctx.strokeText(label, x, y - r - 8); ctx.fillText(label, x, y - r - 8);
}

// ======================================================================
// HUD & UI
// ======================================================================
let bannerTimer = null, warnTimer = null;
function showBanner(text, ms) {
  const b = $("banner"); b.textContent = text; b.classList.remove("show"); void b.offsetWidth; b.classList.add("show");
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove("show"), ms);
}
function warn(text, ms) {
  const w = $("warn"); w.textContent = "⚠ " + text; w.classList.add("show");
  clearTimeout(warnTimer); warnTimer = setTimeout(() => w.classList.remove("show"), ms);
}
function hudFlash() { const k = $("hudKos"); k.classList.remove("pop"); void k.offsetWidth; k.classList.add("pop"); }
function updateHUD() {
  if (!G || G.demo) return;
  const p = player();
  $("hudLeft").textContent = aliveList().length;
  $("hudKos").textContent = p ? p.kos : 0;
  if (G.phase === "countdown") $("count").textContent = Math.max(1, Math.ceil(G.countdown));
  $("count").classList.toggle("show", G.phase === "countdown");
  if (p) {
    const ready = p.boostCd <= 0, frac = ready ? 1 : 1 - p.boostCd / (P.boostCd * p.cdMul);
    const pct = Math.round(clamp(frac, 0, 1) * 100) + "%";
    $("boostBtn").style.setProperty("--f", pct); $("boostBar").style.setProperty("--f", pct);
    $("boostBtn").classList.toggle("ready", ready);
    $("boostBar").classList.toggle("ready", ready);
  }
}

function setScreen(name) {
  for (const id of ["menu", "hud", "over", "pause", "shop", "skins"]) $(id).classList.toggle("hidden", id !== name && !(name === "pause" && id === "hud"));
  document.body.dataset.screen = name;
  $("boostBtn").classList.toggle("hidden", !(name === "hud" && input.touchUI));
  $("boostBar").classList.toggle("hidden", !(name === "hud" && !input.touchUI));
}

function coinsText() { return save.coins.toLocaleString("en-US"); }
function refreshCoins() { document.querySelectorAll("[data-coins]").forEach((el) => (el.textContent = coinsText())); }

// ---- Menu ----
function renderMenu() {
  refreshCoins();
  $("muteBtn").textContent = save.muted ? "🔇" : "🔊";
  if (!arenaUnlocked(arenaIndex(save.arena))) save.arena = "floe";
  const box = $("arenas");
  box.innerHTML = ARENAS.map((a, i) => {
    const open = arenaUnlocked(i), won = (save.winsByArena[a.id] || 0) > 0;
    return `<button class="arena ${save.arena === a.id ? "sel" : ""} ${open ? "" : "locked"}" data-arena="${a.id}" ${open ? "" : "aria-disabled=true"}>
      <span class="ai">${open ? a.icon : "🔒"}</span><span class="an">${a.name}${won ? " 🏆" : ""}</span><span class="ad">${open ? a.desc : arenaLockText(i)}</span></button>`;
  }).join("");
  box.querySelectorAll("[data-arena]").forEach((b) => (b.onclick = () => {
    Sound.init(); Sound.click();
    const i = arenaIndex(b.dataset.arena);
    if (!arenaUnlocked(i)) return warnMenu(`${ARENAS[i].name}: reach level ${ARENAS[i].level} and win ${ARENAS[i - 1].name}`);
    save.arena = b.dataset.arena; persist(); renderMenu();
  }));
  const sel = box.querySelector(".sel"); if (sel) sel.scrollIntoView({ block: "nearest", inline: "center" });
  drawPreview($("menuPeng"), SKINS.find((s) => s.id === save.skin) || SKINS[0], 64);
  const L = levelInfo();
  $("lvlNum").textContent = L.level;
  $("lvlBar").style.width = Math.round((L.into / L.need) * 100) + "%";
  $("lvlText").textContent = `${L.into} / ${L.need} XP`;
  $("statLine").textContent = save.games ? `${save.wins} wins · ${save.kos} KOs · ${save.games} games` : "Push everyone off. Be the last penguin standing!";
}
function warnMenu(t) { const el = $("menuNote"); el.textContent = "🔒 " + t; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2200); }
function drawPreview(cv, skin, size, face = Math.PI / 2) {
  const d = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = size * d; cv.height = size * d; cv.style.width = size + "px"; cv.style.height = size + "px";
  const g = cv.getContext("2d"); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, size, size);
  g.fillStyle = "rgba(20,60,100,.18)"; g.beginPath(); g.ellipse(size / 2 + 2, size / 2 + size * 0.1, size * 0.36, size * 0.28, 0, 0, TAU); g.fill();
  draw1Penguin(g, size / 2, size / 2, size * 0.32, face, skin, 0, 0);
}

// ---- Upgrades ----
function renderShop() {
  refreshCoins();
  $("shopList").innerHTML = UPGRADES.map((u) => {
    const lvl = save.upgrades[u.id], max = lvl >= UPGRADE_MAX, cost = UPGRADE_COST[lvl];
    return `<div class="row">
      <span class="ri">${u.icon}</span>
      <div class="rt"><b>${u.name}</b><small>${u.desc} · ${u.per} per level</small>
        <div class="pips">${Array.from({ length: UPGRADE_MAX }, (_, i) => `<i class="${i < lvl ? "on" : ""}"></i>`).join("")}</div></div>
      <button class="buy" data-up="${u.id}" ${max || save.coins < cost ? "disabled" : ""}>${max ? "MAX" : `🪙 ${cost}`}</button>
    </div>`;
  }).join("");
  $("shopList").querySelectorAll("[data-up]").forEach((b) => (b.onclick = () => {
    const id = b.dataset.up, lvl = save.upgrades[id], cost = UPGRADE_COST[lvl];
    if (lvl >= UPGRADE_MAX || save.coins < cost) return;
    save.coins -= cost; save.upgrades[id]++; persist(); Sound.coin(); renderShop();
  }));
}

// ---- Skins ----
function renderSkins() {
  refreshCoins();
  const box = $("skinList");
  box.innerHTML = SKINS.map((s) => {
    if (s.ach && s.test() && !save.owned.includes(s.id)) save.owned.push(s.id);
    const owned = save.owned.includes(s.id), eq = save.skin === s.id;
    const label = eq ? "Equipped" : owned ? "Select" : s.ach ? `🏆 ${s.ach}${s.prog ? ` (${s.prog()})` : ""}` : `🪙 ${s.price}`;
    return `<button class="skin ${eq ? "eq" : ""} ${s.rare ? "rare" : ""} ${!owned && s.ach ? "ach" : ""}" data-skin="${s.id}">
      <canvas data-prev="${s.id}"></canvas><span class="sn">${s.name}</span>
      <span class="sp">${label}</span></button>`;
  }).join("");
  box.querySelectorAll("canvas[data-prev]").forEach((cv) => drawPreview(cv, SKINS.find((s) => s.id === cv.dataset.prev), 72));
  box.querySelectorAll("[data-skin]").forEach((b) => (b.onclick = () => {
    const s = SKINS.find((x) => x.id === b.dataset.skin);
    if (save.owned.includes(s.id)) { save.skin = s.id; Sound.click(); }
    else if (!s.ach && save.coins >= s.price) { save.coins -= s.price; save.owned.push(s.id); save.skin = s.id; Sound.coin(); }
    else { b.classList.remove("nope"); void b.offsetWidth; b.classList.add("nope"); return; }
    persist(); renderSkins();
  }));
}

// ---- Round flow ----
let roundsPlayed = 0;
async function startGame() {
  Sound.init(); Sound.click();
  if (roundsPlayed > 0) { $("adNote").classList.remove("hidden"); await Poki.commercial(); $("adNote").classList.add("hidden"); }
  roundsPlayed++;
  if (!arenaUnlocked(arenaIndex(save.arena))) save.arena = "floe";
  newRound(save.arena);
  state = "play"; setScreen("hud");
  $("hudArena").textContent = G.arena.icon + " " + G.arena.name;
}

function endRound(won) {
  if (G.over) return;
  G.over = true;
  const p = player();
  const place = won ? 1 : (p.place || aliveList().length + 1);
  G.playerPlace = place;
  setTimeout(() => finish(won, place, p.kos), won ? 1300 : 1100);
}

function finish(won, place, kos) {
  Poki.stop();
  state = "over";
  const total = BOTS_PER_ROUND + 1;
  const placeCoins = [0, 50, 35, 25, 18, 14, 11, 9, 7, 6, 5][place] || 5;
  const koCoins = kos * 10;
  const earned = placeCoins + koCoins;
  const xpGain = 15 + ([0, 60, 42, 32, 24, 20, 16, 13, 11, 10, 9][place] || 9) + kos * 12;
  // remember what was locked before, to announce new unlocks
  const before = { level: levelInfo().level, arenas: ARENAS.map((a, i) => arenaUnlocked(i)), skins: SKINS.filter((x) => x.ach).map((x) => x.test()) };
  save.coins += earned; save.games++; save.kos += kos; save.xp += xpGain;
  if (won) {
    save.wins++; save.winsByArena[G.arena.id] = (save.winsByArena[G.arena.id] || 0) + 1;
    if (!G.playerBoosted) save.noBoostWin = true;
  }
  const after = levelInfo();
  const msgs = [];
  if (after.level > before.level) msgs.push(`⭐ Level up! You are now level ${after.level}.`);
  ARENAS.forEach((a, i) => { if (!before.arenas[i] && arenaUnlocked(i)) msgs.push(`New arena unlocked: ${a.icon} ${a.name}!`); });
  SKINS.filter((x) => x.ach).forEach((x, i) => { if (!before.skins[i] && x.test()) { if (!save.owned.includes(x.id)) save.owned.push(x.id); msgs.push(`🏆 New skin earned: ${x.name}!`); } });
  // hint at what's next
  const next = ARENAS.findIndex((a, i) => !arenaUnlocked(i));
  if (!msgs.length && next > 0) {
    const a = ARENAS[next], needWin = !(save.winsByArena[ARENAS[next - 1].id] > 0);
    msgs.push(`Next arena ${a.icon} ${a.name}: ${after.level < a.level ? `level ${a.level}` : ""}${after.level < a.level && needWin ? " + " : ""}${needWin ? `win ${ARENAS[next - 1].name}` : ""}`);
  }
  persist();
  G.result = { won, place, kos, earned };
  $("overTitle").textContent = won ? "VICTORY!" : place <= 3 ? `#${place} – So close!` : `#${place} of ${total}`;
  $("overTitle").className = won ? "win" : "";
  $("overSub").textContent = won ? "Last penguin on the ice 🐧👑" : pick(["Splash! Into the sea you go.", "Brrr… that water is cold.", "Pushed off the ice!", "Next time, stay away from the edge!"]);
  $("overStats").innerHTML = `
    <div><span>Place</span><b>#${place}</b><em>🪙 ${placeCoins}</em></div>
    <div><span>Knockouts</span><b>${kos}</b><em>🪙 ${koCoins}</em></div>
    <div class="tot"><span>Coins earned</span><b>🪙 ${earned}</b></div>
    <div class="xp"><span>Level ${after.level}</span><i><u style="width:${Math.round((after.into / after.need) * 100)}%"></u></i><b>+${xpGain} XP</b></div>`;
  $("unlockMsg").innerHTML = msgs.map((m) => `<div>${m}</div>`).join(""); $("unlockMsg").classList.toggle("hidden", !msgs.length);
  $("doubleBtn").classList.toggle("hidden", !Poki.on || earned === 0);
  $("doubleBtn").disabled = false;
  refreshCoins();
  setScreen("over");
  won ? Sound.win() : Sound.lose();
}

function togglePause(forceOn) {
  if (state === "play" && G && !G.over) { state = "paused"; setScreen("pause"); Poki.stop(); }
  else if (state === "paused" && forceOn !== true) { state = "play"; setScreen("hud"); Poki.start(); }
}

function toMenu() {
  state = "menu"; setScreen("menu"); renderMenu();
  newRound(save.arena, true);
}

// ---- Buttons ----
$("playBtn").onclick = startGame;
$("againBtn").onclick = startGame;
$("menuBtn").onclick = () => { Sound.click(); toMenu(); };
$("shopBtn").onclick = () => { Sound.init(); Sound.click(); state = "menu"; setScreen("shop"); renderShop(); };
$("skinsBtn").onclick = () => { Sound.init(); Sound.click(); state = "menu"; setScreen("skins"); renderSkins(); };
document.querySelectorAll("[data-back]").forEach((b) => (b.onclick = () => { Sound.click(); setScreen("menu"); renderMenu(); }));
$("pauseBtn").onclick = () => togglePause();
$("resumeBtn").onclick = () => togglePause();
$("quitBtn").onclick = () => { Poki.stop(); toMenu(); };
$("muteBtn").onclick = () => { Sound.init(); save.muted = !save.muted; persist(); Sound.applyMute(); renderMenu(); };
$("doubleBtn").onclick = async () => {
  $("doubleBtn").disabled = true;
  const ok = await Poki.rewarded();
  if (ok && G && G.result) { save.coins += G.result.earned; persist(); Sound.coin(); $("overStats").querySelector(".tot b").textContent = `🪙 ${G.result.earned * 2}`; refreshCoins(); $("doubleBtn").classList.add("hidden"); }
  else $("doubleBtn").disabled = false;
};

// ======================================================================
// Main loop
// ======================================================================
let last = performance.now(), acc = 0;
const FIXED = 1 / 120;
function frame(now) {
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G && (state === "play" || state === "menu" || state === "over")) {
    let scale = 1;
    if (G.slowmo > 0) { G.slowmo -= dt; scale = 0.3; }
    if (window.__irSpeed) scale *= window.__irSpeed;
    acc += dt * scale;
    let n = 0;
    while (acc >= FIXED && n++ < 40) { step(FIXED); acc -= FIXED; }
    updateParticles(dt * scale);
  }
  render(dt);
  updateHUD();
  requestAnimationFrame(frame);
}

// Test hooks (harmless in production)
window.__ir = { P, get G() { return G; }, get state() { return state; }, save: () => save, newRound, startGame,
  simulate(id, max = 400) { // runs a bot-only round without drawing (for balance tests)
    newRound(id, true); const s = G;
    while (aliveList().length > 1 && s.time < max) { step(FIXED); updateParticles(FIXED); }
    return { t: Math.round(s.time), alive: aliveList().length, R: Math.round(s.R), kos: s.penguins.map((p) => p.kos).reduce((a, b) => a + b, 0) };
  } };

// Boot
Poki.init().then(() => {
  Poki.loaded();
  setScreen("menu"); renderMenu(); newRound(save.arena, true);
  if (location.hash === "#reset") { localStorage.removeItem(SAVE_KEY); location.hash = ""; location.reload(); }
  requestAnimationFrame(frame);
});
})();
