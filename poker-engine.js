// Poker-Logik: Texas Hold'em No-Limit (Cash-Game)
// Reine Spiellogik ohne Netzwerk. poker.js kümmert sich um Räume, Timer und Verbindungen.
const crypto = require("crypto");

const RANKS = "23456789TJQKA";
const SUITS = "shdc";
const SEATS = 9;
const HAND_NAMES = ["Höchste Karte", "Ein Paar", "Zwei Paare", "Drilling", "Strasse", "Flush", "Full House", "Vierling", "Straight Flush"];

// ---------------- Karten & Hand-Bewertung ----------------
function newDeck() {
  const d = [];
  for (const r of RANKS) for (const s of SUITS) d.push(r + s);
  for (let i = d.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
const rankValue = (c) => RANKS.indexOf(c[0]) + 2;

/** Bewertet genau 5 Karten. Ergebnis: Zahlenliste, grösser = besser (lexikografisch vergleichen). */
function score5(cards) {
  const vals = cards.map(rankValue).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  let straightHigh = 0;
  if (new Set(vals).size === 5) {
    if (vals[0] - vals[4] === 4) straightHigh = vals[0];
    else if (vals.join(",") === "14,5,4,3,2") straightHigh = 5; // A-2-3-4-5
  }
  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts).map(([v, c]) => [c, +v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const kick = (from) => groups.slice(from).map((g) => g[1]);
  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0][0] === 4) return [7, groups[0][1], groups[1][1]];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, groups[0][1], groups[1][1]];
  if (flush) return [5, ...vals];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][0] === 3) return [3, groups[0][1], ...kick(1)];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, groups[0][1], groups[1][1], groups[2][1]];
  if (groups[0][0] === 2) return [1, groups[0][1], ...kick(1)];
  return [0, ...vals];
}
function compare(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}
function handName(score) {
  if (score[0] === 8 && score[1] === 14) return "Royal Flush";
  return HAND_NAMES[score[0]];
}
/** Beste 5-Karten-Hand aus 5 bis 7 Karten. */
function bestHand(cards) {
  let best = null;
  const n = cards.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++)
    for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
      const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
      const s = score5(five);
      if (!best || compare(s, best.score) > 0) best = { score: s, cards: five };
    }
  best.name = handName(best.score);
  return best;
}

// ---------------- Tisch ----------------
class PokerError extends Error {}

class Table {
  constructor(settings) {
    this.settings = { startChips: 1000, sb: 10, bb: 20, turnTime: 30, ...settings };
    this.seats = new Array(SEATS).fill(null); // seat -> playerId
    this.players = new Map();                  // id -> player
    this.departed = [];                        // Statistik von Leuten, die gegangen sind
    this.dealerSeat = -1;
    this.hand = null;
    this.handNo = 0;
    this.stats = { hands: 0, biggestPot: null, bestHand: null };
  }

  // ----- Spieler -----
  addPlayer(id, name) {
    if (this.players.has(id)) return this.players.get(id);
    const seat = this.seats.findIndex((s) => s === null);
    if (seat < 0) throw new PokerError("Der Tisch ist voll (max. " + SEATS + " Spieler).");
    const p = { id, name, seat, stack: this.settings.startChips, buyIns: 1, invested: this.settings.startChips,
      connected: true, sittingOut: false, leaving: false, handsWon: 0, biggestWin: 0, lastAction: null };
    this.seats[seat] = id;
    this.players.set(id, p);
    return p;
  }

  /** Spieler will gehen. Ist er in einer laufenden Hand, foldet er zuerst. */
  leave(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.leaving = true;
    const h = this.hand;
    // Wer all-in ist, muss nichts mehr entscheiden: Hand läuft bis zum Showdown weiter
    if (h && h.phase !== "done" && h.state[id] && !h.state[id].folded && !h.state[id].allIn) {
      if (h.phase === "betting" && h.toAct === id) this.act(id, "fold");
      else { h.state[id].folded = true; p.lastAction = "Fold"; this._afterFoldOutOfTurn(); }
    }
    if (!this.inHand(id)) this._remove(id);
  }
  _remove(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.departed.push({ name: p.name, stack: p.stack, net: p.stack - p.invested, buyIns: p.buyIns, handsWon: p.handsWon, biggestWin: p.biggestWin });
    this.seats[p.seat] = null;
    this.players.delete(id);
  }
  inHand(id) { const h = this.hand; return !!(h && h.phase !== "done" && h.state[id]); }

  rebuy(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.stack > 0) throw new PokerError("Nachkaufen geht nur, wenn du keine Chips mehr hast.");
    if (this.inHand(id)) throw new PokerError("Warte, bis die Hand vorbei ist.");
    p.stack += this.settings.startChips; p.buyIns++; p.invested += this.settings.startChips;
  }

  // ----- Hilfen für die Reihenfolge -----
  _seatOrder(fromSeat, filter) {
    const out = [];
    for (let i = 1; i <= SEATS; i++) {
      const id = this.seats[(fromSeat + i + SEATS) % SEATS];
      if (id && filter(id)) out.push(id);
    }
    return out; // im Uhrzeigersinn nach fromSeat, fromSeat selbst zuletzt
  }
  _canPlay(id) { const p = this.players.get(id); return p && p.stack > 0 && !p.sittingOut && p.connected && !p.leaving; }
  eligibleCount() { return [...this.players.keys()].filter((id) => this._canPlay(id)).length; }

  // ----- Hand starten -----
  startHand() {
    const eligible = this._seatOrder(this.dealerSeat, (id) => this._canPlay(id));
    if (eligible.length < 2) return false;
    for (const p of this.players.values()) p.lastAction = null;
    const dealerId = eligible[0];
    this.dealerSeat = this.players.get(dealerId).seat;
    const order = this._seatOrder(this.dealerSeat, (id) => eligible.includes(id)); // Dealer zuletzt
    const headsUp = order.length === 2;
    const sbId = headsUp ? dealerId : order[0];
    const bbId = headsUp ? order[0] : order[1];
    this.handNo++;
    const h = this.hand = {
      no: this.handNo, deck: newDeck(), board: [], street: "preflop", phase: "betting",
      dealerId, sbId, bbId, ids: [...order], state: {},
      currentBet: 0, minRaise: this.settings.bb, toAct: null, lastAggressor: null,
      runout: false, next: null, result: null, revealed: new Set(), actions: 0,
      bb: this.settings.bb,
      names: Object.fromEntries(order.map((id) => [id, this.players.get(id).name])),
    };
    for (const id of order) h.state[id] = { hole: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, canRaise: true };
    this._pay(sbId, this.settings.sb); this.players.get(sbId).lastAction = "Small Blind";
    this._pay(bbId, this.settings.bb); this.players.get(bbId).lastAction = "Big Blind";
    const dealOrder = this._seatOrder(this.players.get(dealerId).seat, (id) => !!h.state[id]);
    for (let r = 0; r < 2; r++) for (const id of dealOrder) h.state[id].hole.push(h.deck.pop());
    h.currentBet = Math.max(...order.map((id) => h.state[id].bet));
    // Erster Spieler preflop: links vom Big Blind (Heads-up: der Dealer/Small Blind)
    h.toAct = bbId;
    this._nextActor();
    return true;
  }

  _pay(id, amount) {
    const p = this.players.get(id), s = this.hand.state[id];
    const x = Math.max(0, Math.min(amount, p.stack));
    p.stack -= x; s.bet += x; s.total += x;
    if (p.stack === 0) s.allIn = true;
    return x;
  }

  live() { const h = this.hand; return h.ids.filter((id) => !h.state[id].folded); }

  // ----- Aktion eines Spielers -----
  /** type: fold | check | call | raise (amount = Gesamteinsatz in dieser Runde) | allin */
  act(id, type, amount) {
    const h = this.hand;
    if (!h || h.phase !== "betting") throw new PokerError("Gerade wird nicht gesetzt.");
    if (h.toAct !== id) throw new PokerError("Du bist nicht dran.");
    const p = this.players.get(id), s = h.state[id];
    const toCall = h.currentBet - s.bet;
    const max = s.bet + p.stack;
    let label;
    if (type === "call" && toCall <= 0) type = "check";
    if (type === "raise" && Math.floor(amount) >= max) type = "allin";
    if (type === "allin" && max <= h.currentBet) type = "call";

    switch (type) {
      case "fold":
        s.folded = true; label = "Fold"; break;
      case "check":
        if (toCall > 0) throw new PokerError("Checken geht nicht, du musst mitgehen oder folden.");
        label = "Check"; break;
      case "call":
        this._pay(id, toCall);
        label = s.allIn ? "All-in" : "Call " + s.bet; break;
      case "raise": {
        amount = Math.floor(Number(amount));
        if (!s.canRaise) throw new PokerError("Du kannst nur noch mitgehen oder folden.");
        const minTo = h.currentBet + h.minRaise;
        if (!(amount >= minTo)) throw new PokerError("Mindestens auf " + minTo + " erhöhen.");
        const raiseSize = amount - h.currentBet;
        label = (h.currentBet === 0 ? "Bet " : "Raise ") + amount;
        this._pay(id, amount - s.bet);
        h.minRaise = raiseSize; h.currentBet = amount; h.lastAggressor = id;
        this._reopen(id);
        break;
      }
      case "allin": {
        if (!s.canRaise) throw new PokerError("Du kannst nur noch mitgehen oder folden.");
        const raiseSize = max - h.currentBet;
        this._pay(id, p.stack);
        if (raiseSize >= h.minRaise) { h.minRaise = raiseSize; this._reopen(id); }
        h.currentBet = max; h.lastAggressor = id;
        label = "All-in"; break;
      }
      default: throw new PokerError("Unbekannte Aktion.");
    }
    s.acted = true; s.canRaise = false;
    p.lastAction = label;
    h.actions++;
    this._afterAction();
  }

  /** Zeit abgelaufen: checken wenn möglich, sonst folden. */
  timeout() {
    const h = this.hand;
    if (!h || h.phase !== "betting") return;
    const id = h.toAct, s = h.state[id];
    this.act(id, h.currentBet - s.bet > 0 ? "fold" : "check");
  }

  _reopen(exceptId) {
    const h = this.hand;
    for (const id of h.ids) {
      const s = h.state[id];
      if (id !== exceptId && !s.folded && !s.allIn) { s.acted = false; s.canRaise = true; }
    }
  }

  _needsAction(id) {
    const s = this.hand.state[id];
    return !s.folded && !s.allIn && (!s.acted || s.bet < this.hand.currentBet);
  }

  _nextActor() {
    const h = this.hand;
    if (this.live().length === 1) return this._finishByFold();
    const from = this.players.get(h.toAct).seat;
    const next = this._seatOrder(from, (id) => !!h.state[id] && this._needsAction(id))[0];
    if (next) { h.toAct = next; h.phase = "betting"; return; }
    this._endStreet();
  }
  _afterAction() { this._nextActor(); }
  _afterFoldOutOfTurn() {
    const h = this.hand;
    if (h.phase !== "betting") { if (this.live().length === 1 && h.phase === "between") this._finishByFold(); return; }
    if (this.live().length === 1) return this._finishByFold();
    if (!this._needsAction(h.toAct)) this._nextActor();
    else if (!this._seatOrder(0, (id) => !!h.state[id] && this._needsAction(id)).length) this._endStreet();
  }

  /** Nicht gecallte Einsätze zurückgeben (z.B. Bet, bei dem alle folden). */
  _refundUncalled() {
    const h = this.hand;
    const sorted = h.ids.map((id) => ({ id, bet: h.state[id].bet })).sort((a, b) => b.bet - a.bet);
    if (sorted.length < 2) return;
    const extra = sorted[0].bet - sorted[1].bet;
    if (extra > 0) {
      const s = h.state[sorted[0].id], p = this.players.get(sorted[0].id);
      s.bet -= extra; s.total -= extra; p.stack += extra;
      if (p.stack > 0) s.allIn = false;
    }
  }

  _endStreet() {
    const h = this.hand;
    this._refundUncalled();
    for (const id of h.ids) { const s = h.state[id]; s.bet = 0; s.acted = false; s.canRaise = !s.allIn; }
    h.currentBet = 0; h.minRaise = this.settings.bb; h.toAct = null;
    const canAct = this.live().filter((id) => !h.state[id].allIn).length;
    h.next = { preflop: "flop", flop: "turn", turn: "river", river: "showdown" }[h.street];
    if (canAct <= 1 && h.next !== "showdown" && !h.runout) {
      h.runout = true; // keiner kann mehr setzen: Karten aufdecken und Board durchlaufen lassen
      for (const id of this.live()) h.revealed.add(id);
    }
    h.phase = "between";
  }

  /** Nächste Strasse austeilen oder Showdown (wird vom Server mit kurzer Pause aufgerufen). */
  proceed() {
    const h = this.hand;
    if (!h || h.phase !== "between") return;
    if (h.next === "showdown") return this._showdown();
    h.deck.pop(); // Burn-Karte
    const n = h.next === "flop" ? 3 : 1;
    for (let i = 0; i < n; i++) h.board.push(h.deck.pop());
    h.street = h.next;
    h.lastAggressor = null;
    for (const id of h.ids) if (!h.state[id].folded) this.players.get(id).lastAction = h.state[id].allIn ? "All-in" : null;
    const canAct = this.live().filter((id) => !h.state[id].allIn);
    if (canAct.length >= 2) {
      h.phase = "betting";
      // erster aktiver Spieler links vom Dealer
      const first = this._seatOrder(this.dealerSeat, (id) => !!h.state[id] && this._needsAction(id))[0];
      h.toAct = first;
    } else {
      h.next = { flop: "turn", turn: "river", river: "showdown" }[h.street];
      h.phase = "between";
    }
  }

  _finishByFold() {
    const h = this.hand;
    this._refundUncalled();
    const winner = this.live()[0];
    const pot = h.ids.reduce((sum, id) => sum + h.state[id].total, 0);
    this.players.get(winner).stack += pot;
    for (const id of h.ids) h.state[id].bet = 0;
    h.result = { byFold: true, winnerId: winner, pots: [{ amount: pot, winners: [{ id: winner, amount: pot }] }] };
    this._recordStats(pot, [winner], null);
    h.phase = "done"; h.toAct = null;
  }

  /** Pots aus den Einsätzen bilden (Haupt-Pot + Side-Pots). */
  _buildPots() {
    const h = this.hand;
    const live = this.live();
    const caps = [...new Set(live.map((id) => h.state[id].total))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const cap of caps) {
      let amount = 0;
      for (const id of h.ids) amount += Math.max(0, Math.min(h.state[id].total, cap) - prev);
      const eligible = live.filter((id) => h.state[id].total >= cap);
      if (amount > 0) {
        // gleiche Berechtigte wie der Pot davor -> zusammenlegen
        const last = pots[pots.length - 1];
        if (last && last.eligible.length === eligible.length) last.amount += amount;
        else pots.push({ amount, eligible });
      }
      prev = cap;
    }
    // Geld über dem höchsten Cap (sollte nach Rückgabe nicht vorkommen) geht in den letzten Pot
    let rest = 0;
    for (const id of h.ids) rest += Math.max(0, h.state[id].total - prev);
    if (rest && pots.length) pots[pots.length - 1].amount += rest;
    return pots;
  }

  _showdown() {
    const h = this.hand;
    const live = this.live();
    const hands = {};
    for (const id of live) hands[id] = bestHand([...h.state[id].hole, ...h.board]);
    const pots = this._buildPots();
    const resultPots = [];
    const potWinners = new Set();
    for (const pot of pots) {
      let best = null, winners = [];
      for (const id of pot.eligible) {
        const c = best ? compare(hands[id].score, best) : 1;
        if (c > 0) { best = hands[id].score; winners = [id]; } else if (c === 0) winners.push(id);
      }
      // Gerechte Teilung, übrige Chips an den ersten Gewinner links vom Dealer
      const ordered = this._seatOrder(this.dealerSeat, (id) => winners.includes(id));
      const share = Math.floor(pot.amount / winners.length);
      let odd = pot.amount - share * winners.length;
      const ws = ordered.map((id) => { const a = share + (odd-- > 0 ? 1 : 0); this.players.get(id).stack += a; potWinners.add(id); return { id, amount: a }; });
      resultPots.push({ amount: pot.amount, winners: ws, handName: hands[ordered[0]].name });
    }
    // Wer zeigt seine Karten? Wie im echten Poker: zuerst der letzte Aggressor, dann im Uhrzeigersinn;
    // man zeigt nur, wenn man mindestens gleich gut ist wie die beste gezeigte Hand oder einen Pot gewinnt.
    if (!h.runout) {
      const startId = h.lastAggressor && live.includes(h.lastAggressor) ? h.lastAggressor
        : this._seatOrder(this.dealerSeat, (id) => live.includes(id))[0];
      const order = [startId, ...this._seatOrder(this.players.get(startId).seat, (id) => live.includes(id) && id !== startId)];
      let bestShown = null;
      for (const id of order) {
        if (potWinners.has(id) || !bestShown || compare(hands[id].score, bestShown) >= 0) {
          h.revealed.add(id);
          if (!bestShown || compare(hands[id].score, bestShown) > 0) bestShown = hands[id].score;
        }
      }
    }
    h.hands = {};
    for (const id of live) if (h.revealed.has(id)) h.hands[id] = { name: hands[id].name, cards: hands[id].cards };
    for (const id of h.ids) h.state[id].bet = 0;
    h.result = { byFold: false, pots: resultPots };
    const total = pots.reduce((s, p) => s + p.amount, 0);
    const shownWinners = [...potWinners];
    this._recordStats(total, shownWinners, shownWinners.map((id) => ({ id, ...hands[id] })));
    h.phase = "done"; h.toAct = null;
  }

  /** Gewinner ohne Showdown darf freiwillig zeigen. */
  show(id) {
    const h = this.hand;
    if (!h || h.phase !== "done" || !h.result.byFold || h.result.winnerId !== id) return false;
    h.revealed.add(id);
    return true;
  }

  _recordStats(pot, winnerIds, winnerHands) {
    this.stats.hands++;
    const h = this.hand;
    const won = {};
    for (const p of h.result.pots) for (const w of p.winners) won[w.id] = (won[w.id] || 0) + w.amount;
    for (const id of winnerIds) {
      const p = this.players.get(id);
      if (!p) continue;
      p.handsWon++;
      const profit = won[id] - h.state[id].total; // Gewinn ohne den eigenen Einsatz
      p.biggestWin = Math.max(p.biggestWin, profit);
    }
    if (!this.stats.biggestPot || pot > this.stats.biggestPot.amount) {
      this.stats.biggestPot = { amount: pot, names: winnerIds.map((id) => this.players.get(id).name), handNo: h.no };
    }
    for (const wh of winnerHands || []) {
      if (!this.stats.bestHand || compare(wh.score, this.stats.bestHand.score) > 0) {
        this.stats.bestHand = { score: wh.score, name: wh.name, cards: wh.cards, player: this.players.get(wh.id).name, handNo: h.no };
      }
    }
  }

  /** Nach einer Hand: Leute entfernen, die gehen wollten; Abwesende aussetzen lassen. */
  cleanup() {
    for (const p of [...this.players.values()]) {
      if (p.leaving) this._remove(p.id);
      else if (!p.connected) p.sittingOut = true;
    }
  }

  // ----- Ansicht für einen Spieler (ohne fremde Karten!) -----
  view(viewerId) {
    const h = this.hand;
    const seats = [];
    for (let seat = 0; seat < SEATS; seat++) {
      const id = this.seats[seat];
      if (!id) continue;
      const p = this.players.get(id);
      const s = h && h.state[id];
      let cards = null;
      if (s) {
        const visible = id === viewerId || h.revealed.has(id);
        if (!s.folded || id === viewerId) cards = visible ? s.hole : ["back", "back"];
        if (s.folded && id !== viewerId) cards = null;
        if (h.phase === "done" && !visible && id !== viewerId) cards = null; // weggeworfen
      }
      seats.push({
        seat, id, name: p.name, stack: p.stack, connected: p.connected, sittingOut: p.sittingOut, leaving: p.leaving,
        inHand: !!s, folded: !!(s && s.folded), allIn: !!(s && s.allIn), bet: s ? s.bet : 0,
        lastAction: p.lastAction, cards,
        dealer: !!h && h.dealerId === id, sb: !!h && h.sbId === id, bb: !!h && h.bbId === id,
      });
    }
    const out = {
      seats, settings: { ...this.settings }, handNo: this.handNo,
      stats: this.statsView(),
    };
    if (h) {
      const me = h.state[viewerId], mp = this.players.get(viewerId);
      out.hand = {
        no: h.no, board: h.board, street: h.street, phase: h.phase, toAct: h.toAct,
        pot: h.ids.reduce((sum, id) => sum + h.state[id].total, 0),
        currentBet: h.currentBet, runout: h.runout,
        result: h.result, hands: h.hands || null, names: h.names, revealed: [...h.revealed],
      };
      if (me && h.phase === "betting" && h.toAct === viewerId) {
        const toCall = h.currentBet - me.bet;
        const max = me.bet + mp.stack;
        out.hand.options = {
          toCall: Math.min(toCall, mp.stack), canCheck: toCall <= 0,
          canRaise: me.canRaise && max > h.currentBet,
          minRaiseTo: Math.min(h.currentBet + h.minRaise, max), maxRaiseTo: max,
          myBet: me.bet, isBet: h.currentBet === 0,
        };
      }
    }
    return out;
  }

  statsView() {
    const rows = [...this.players.values()].map((p) => ({ name: p.name, net: p.stack - p.invested, buyIns: p.buyIns, handsWon: p.handsWon, biggestWin: p.biggestWin, present: true }))
      .concat(this.departed.map((d) => ({ ...d, present: false })));
    rows.sort((a, b) => b.net - a.net);
    const best = this.stats.bestHand;
    return { hands: this.stats.hands, biggestPot: this.stats.biggestPot, bestHand: best && { name: best.name, cards: best.cards, player: best.player }, rows };
  }

  totalChips() {
    let sum = 0;
    for (const p of this.players.values()) sum += p.stack;
    if (this.hand && this.hand.phase !== "done") for (const id of this.hand.ids) sum += this.hand.state[id].total;
    return sum;
  }
}

module.exports = { Table, PokerError, bestHand, score5, compare, handName, newDeck };
