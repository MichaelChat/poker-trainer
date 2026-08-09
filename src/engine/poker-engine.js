/* ============================== DECK / EVAL =============================== */
export const RANK_CHAR = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "10", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };
export const SUIT_CHAR = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const RED_SUITS = new Set(["H", "D"]);

export function makeDeck() {
  const deck = [];
  for (const suit of ["S", "H", "D", "C"]) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ rank, suit, key: rank + suit });
    }
  }
  return deck;
}
export const FULL_DECK = makeDeck();

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function compareTuples(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0, bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

export function evaluate5(cards) {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);

  const counts = {};
  ranks.forEach((r) => (counts[r] = (counts[r] || 0) + 1));
  const countEntries = Object.entries(counts).map(([r, c]) => [parseInt(r), c]);
  countEntries.sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  let straightCandidates = [...new Set(ranks)];
  if (straightCandidates.includes(14)) straightCandidates.push(1);
  straightCandidates = [...new Set(straightCandidates)].sort((a, b) => b - a);
  let straightHigh = null;
  for (let i = 0; i <= straightCandidates.length - 5; i++) {
    if (straightCandidates[i] - straightCandidates[i + 4] === 4) {
      straightHigh = straightCandidates[i];
      break;
    }
  }
  const isStraight = straightHigh !== null;

  if (isStraight && isFlush) return [8, straightHigh];
  if (countEntries[0][1] === 4) {
    const kicker = countEntries.find((e) => e[1] === 1)?.[0] ?? 0;
    return [7, countEntries[0][0], kicker];
  }
  if (countEntries[0][1] === 3 && countEntries[1] && countEntries[1][1] >= 2) {
    return [6, countEntries[0][0], countEntries[1][0]];
  }
  if (isFlush) return [5, ...ranks];
  if (isStraight) return [4, straightHigh];
  if (countEntries[0][1] === 3) {
    const kickers = countEntries.filter((e) => e[1] === 1).map((e) => e[0]).sort((a, b) => b - a);
    return [3, countEntries[0][0], ...kickers];
  }
  if (countEntries[0][1] === 2 && countEntries[1] && countEntries[1][1] === 2) {
    const pairs = [countEntries[0][0], countEntries[1][0]].sort((a, b) => b - a);
    const kicker = countEntries.find((e) => e[1] === 1)?.[0] ?? 0;
    return [2, ...pairs, kicker];
  }
  if (countEntries[0][1] === 2) {
    const kickers = countEntries.filter((e) => e[1] === 1).map((e) => e[0]).sort((a, b) => b - a);
    return [1, countEntries[0][0], ...kickers];
  }
  return [0, ...ranks];
}

export function evaluate7(cards7) {
  let best = null;
  for (let i = 0; i < 7; i++) {
    for (let j = i + 1; j < 7; j++) {
      const five = [];
      for (let k = 0; k < 7; k++) if (k !== i && k !== j) five.push(cards7[k]);
      const val = evaluate5(five);
      if (!best || compareTuples(val, best) > 0) best = val;
    }
  }
  return best;
}

export const HAND_NAMES = ["High Card", "Pair", "Two Pair", "Trips", "Straight", "Flush", "Full House", "Quads", "Straight Flush"];

// Trial count for equity simulations. Standard error of a Monte Carlo win-rate estimate is
// ~sqrt(p(1-p)/n); at the worst case (p=0.5) that's ~2.9% at n=300 (95% CI ±5.7 points),
// ~1.4% at n=1200 (±2.8 points), ~1.1% at n=2000 (±2.2 points). Configurable via the
// "Monte Carlo iterations" Advanced setting (default 2000) — weaker devices or anyone
// debugging can dial it down instead of everyone being capped at a conservative default.
export const DEFAULT_EQUITY_TRIALS = 2000;
export const EQUITY_TRIAL_OPTIONS = [300, 1000, 2000, 5000];

export function simulateEquity(heroCards, numOpponents, boardKnown = [], trials = DEFAULT_EQUITY_TRIALS) {
  if (numOpponents <= 0) return 1;
  const used = new Set([...heroCards, ...boardKnown].map((c) => c.key));
  const baseDeck = FULL_DECK.filter((c) => !used.has(c.key));
  const need = 5 - boardKnown.length;
  let wins = 0, ties = 0;
  for (let t = 0; t < trials; t++) {
    const deck = shuffle([...baseDeck]);
    let idx = 0;
    const oppHands = [];
    for (let o = 0; o < numOpponents; o++) oppHands.push([deck[idx++], deck[idx++]]);
    const rest = [];
    for (let k = 0; k < need; k++) rest.push(deck[idx++]);
    const board = [...boardKnown, ...rest];
    const heroVal = evaluate7([...heroCards, ...board]);
    let heroWins = true, tie = false;
    for (let o = 0; o < numOpponents; o++) {
      const cmp = compareTuples(heroVal, evaluate7([...oppHands[o], ...board]));
      if (cmp < 0) { heroWins = false; break; }
      if (cmp === 0) tie = true;
    }
    if (heroWins) { if (tie) ties++; else wins++; }
  }
  return (wins + ties * 0.5) / trials;
}

/**
 * Reveals actual opponent hole cards and result at showdown. `community` may already be a
 * complete 5-card board (river) or partial/empty (preflop-only mode) — any missing cards are
 * dealt randomly here so the returned `board` is always the full 5-card runout.
 */
export function dealShowdown(heroCards, community, numOpponents) {
  const used = new Set([...heroCards, ...community].map((c) => c.key));
  const deck = shuffle(FULL_DECK.filter((c) => !used.has(c.key)));
  let idx = 0;
  const oppHands = [];
  for (let o = 0; o < numOpponents; o++) oppHands.push([deck[idx++], deck[idx++]]);
  const need = 5 - community.length;
  const rest = [];
  for (let k = 0; k < need; k++) rest.push(deck[idx++]);
  const board = [...community, ...rest];
  const heroVal = evaluate7([...heroCards, ...board]);
  const oppVals = oppHands.map((h) => evaluate7([...h, ...board]));
  const oppHandNames = oppVals.map((v) => HAND_NAMES[v[0]]);
  const anyoneBeats = oppVals.some((v) => compareTuples(v, heroVal) > 0);
  const anyoneTies = oppVals.some((v) => compareTuples(v, heroVal) === 0);
  const result = anyoneBeats ? "lose" : anyoneTies ? "tie" : "win";
  return { board, oppHands, oppVals, oppHandNames, heroVal, result, handName: HAND_NAMES[heroVal[0]] };
}

/* ============================== POKER STRUCTURE =============================== */
export const POSITION_TABLE = {
  2: ["BTN/SB", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "UTG"],
  5: ["BTN", "SB", "BB", "UTG", "CO"],
  6: ["BTN", "SB", "BB", "UTG", "MP", "CO"],
  7: ["BTN", "SB", "BB", "UTG", "MP", "HJ", "CO"],
  8: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO"],
  9: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP1", "MP2", "HJ", "CO"],
};

export function preflopOrder(n) {
  if (n === 2) return [0, 1];
  const order = [];
  for (let d = 3; d < n; d++) order.push(d);
  order.push(0, 1, 2);
  return order;
}
export function postflopOrder(n) {
  const order = [];
  for (let d = 1; d < n; d++) order.push(d);
  order.push(0);
  return order;
}
export function orderForStreet(street, n, straddled) {
  if (street === "preflop") return straddled ? postflopOrder(n) : preflopOrder(n);
  return postflopOrder(n);
}

export const SB = 0.5, BB = 1;

/** Which blind (if any) a given seat distance has posted preflop — depends on table size,
 * since heads-up (n=2) uses a different button/blind mapping than 3+-handed tables.
 * 3+-handed: BTN=0 posts nothing, SB=1 posts SB, BB=2 posts BB.
 * Heads-up: BTN/SB=0 posts SB, BB=1 posts BB — the button IS the small blind. */
export function blindAmount(n, dist) {
  if (n === 2) {
    if (dist === 0) return SB;
    if (dist === 1) return BB;
    return 0;
  }
  if (dist === 1) return SB;
  if (dist === 2) return BB;
  return 0;
}

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Simulates a segment of villains acting preflop. Accounts for blinds already posted
 * (table-size-aware — see blindAmount) and a button straddle (3+-handed only; dist 0 already
 * invested `straddleAmount`). `tendencyFn(dist) -> {foldBias, raiseBias}` optionally shifts that
 * seat's fold/raise likelihood. */
export function simulatePreflopSegment(distances, pot, currentBet, activeCount, allowRaise, tendencyFn, straddleAmount = 0, n = 6) {
  let cb = currentBet, p = pot, active = activeCount;
  const log = [];
  for (const dist of distances) {
    const invested = straddleAmount > 0 && dist === 0 ? straddleAmount : blindAmount(n, dist);
    const toCall = Math.round((cb - invested) * 10) / 10;
    if (toCall <= 0) { log.push({ dist, action: "check" }); continue; }
    const { foldBias = 0, raiseBias = 0 } = tendencyFn ? tendencyFn(dist) || {} : {};
    const foldT = clamp(0.55 + foldBias, 0.15, 0.85);
    const raiseT = clamp(0.85 - raiseBias, foldT + 0.03, 0.97);
    const roll = Math.random();
    if (roll < foldT) { active -= 1; log.push({ dist, action: "fold" }); }
    else if (!allowRaise || roll < raiseT) { p += toCall; log.push({ dist, action: "call" }); }
    else {
      const raiseTo = cb <= BB ? 3 : Math.round(cb * 2.5 * 10) / 10;
      p += raiseTo - invested; cb = raiseTo;
      log.push({ dist, action: "raise", to: raiseTo });
    }
  }
  return { pot: Math.round(p * 10) / 10, currentBet: cb, activeCount: active, log };
}

/** Simulates a segment of villains acting postflop (no blinds involved, everyone starts uninvested this street). */
export function simulatePostflopSegment(distances, pot, currentBet, activeCount, allowRaise, tendencyFn) {
  let cb = currentBet, p = pot, active = activeCount;
  const log = [];
  for (const dist of distances) {
    const { foldBias = 0, raiseBias = 0 } = tendencyFn ? tendencyFn(dist) || {} : {};
    const toCall = cb;
    const roll = Math.random();
    if (toCall <= 0) {
      const betT = clamp(0.7 - raiseBias, 0.35, 0.9);
      if (!allowRaise || roll < betT) { log.push({ dist, action: "check" }); }
      else {
        const betSize = Math.max(1, Math.round(p * 0.66 * 10) / 10);
        cb = betSize; p += betSize;
        log.push({ dist, action: "bet", to: betSize });
      }
    } else {
      const foldT = clamp(0.55 + foldBias, 0.15, 0.85);
      const raiseT = clamp(0.85 - raiseBias, foldT + 0.03, 0.97);
      if (roll < foldT) { active -= 1; log.push({ dist, action: "fold" }); }
      else if (!allowRaise || roll < raiseT) { p += toCall; log.push({ dist, action: "call" }); }
      else {
        const raiseTo = Math.round(cb * 2.5 * 10) / 10;
        p += raiseTo; cb = raiseTo;
        log.push({ dist, action: "raise", to: raiseTo });
      }
    }
  }
  return { pot: Math.round(p * 10) / 10, currentBet: cb, activeCount: active, log };
}

export function idealAction(equity, callAmount, potBeforeCall, canCheck) {
  if (canCheck) return equity >= 0.55 ? "raise" : "check";
  const potOdds = callAmount / (potBeforeCall + callAmount);
  if (equity < potOdds - 0.02) return "fold";
  if (equity > potOdds + 0.15 && equity > 0.5) return "raise";
  return "call";
}

export const ACTION_LABEL = { fold: "Fold", call: "Call", check: "Check", raise: "Raise" };
export const STREET_LABEL = { preflop: "Preflop", flop: "Flop", turn: "Turn", river: "River" };
export const NEXT_STREET = { preflop: "flop", flop: "turn", turn: "river" };

export function posLabel(n, dist) {
  return POSITION_TABLE[n][dist];
}

/* ============================== HAND (ROUND) ENGINE =============================== */
export function pickPlayerCount(distribution) {
  const ns = [2, 3, 4, 5, 6, 7, 8, 9];
  if (distribution === "even") return ns[Math.floor(Math.random() * ns.length)];
  const weights = ns.map((n) => (distribution === "short" ? (10 - n) * (10 - n) : n * n));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < ns.length; i++) {
    r -= weights[i];
    if (r <= 0) return ns[i];
  }
  return ns[ns.length - 1];
}

/** Runs whichever villains act before hero on the current street, updating the folded-seat set.
 * Snapshots folds locked in before this street started (`priorFoldedSeats`) so a UI reveal
 * animation can always show a seat as folded, independent of this street's own reveal progress. */
export function runPreStreetVillains(hand) {
  const priorFoldedSeats = new Set(hand.foldedSeats);
  const order = orderForStreet(hand.street, hand.n, hand.straddled);
  const heroIdx = order.indexOf(hand.heroDistance);
  const stillIn = (dist) => !hand.foldedSeats.has((hand.buttonSeat + dist) % hand.n);
  const before = order.slice(0, heroIdx).filter(stillIn);
  const after = order.slice(heroIdx + 1).filter(stillIn);
  const straddleAmount = hand.street === "preflop" && hand.straddled ? 2 : 0;
  const seg = hand.street === "preflop"
    ? simulatePreflopSegment(before, hand.pot, hand.currentBet, hand.activeCount, true, hand.tendencyFn, straddleAmount, hand.n)
    : simulatePostflopSegment(before, hand.pot, hand.currentBet, hand.activeCount, true, hand.tendencyFn);

  const foldedSeats = new Set(hand.foldedSeats);
  seg.log.forEach((l) => { if (l.action === "fold") foldedSeats.add((hand.buttonSeat + l.dist) % hand.n); });

  const next = {
    ...hand, pot: seg.pot, currentBet: seg.currentBet, activeCount: seg.activeCount,
    foldedSeats, priorFoldedSeats, afterOrder: after, beforeLog: seg.log, afterLog: null,
  };
  if (seg.activeCount <= 1) return { ...next, terminal: { type: "uncontested" } };
  return next;
}

export const AGGRESSION_PRESETS = {
  tight: { foldBias: 0.15 },
  normal: { foldBias: 0 },
  loose: { foldBias: -0.15 },
};

/** Combines the table-wide aggression preset, the bluffing boost, and (in session mode) each
 * seat's persistent personality into one tendency function used by the segment simulators. */
export function makeTendencyFn(settings, session) {
  const preset = AGGRESSION_PRESETS[settings.aggression] || AGGRESSION_PRESETS.normal;
  const bluffBoost = settings.bluffingEnabled ? 0.12 : 0;
  return (dist) => {
    const seatTendency = session ? session.tendencies[(session.buttonSeat + dist) % session.n] : null;
    return {
      foldBias: preset.foldBias + (seatTendency?.foldBias || 0),
      raiseBias: bluffBoost + (seatTendency?.raiseBias || 0),
    };
  };
}

export function buildHand({ n, buttonSeat, heroSeat, heroDistance, tendencyFn, straddled }) {
  const heroPosition = POSITION_TABLE[n][heroDistance];
  const deck = shuffle([...FULL_DECK]);
  const heroCards = [deck[0], deck[1]];
  const heroInvestedStreet = blindAmount(n, heroDistance);
  const pot = straddled ? SB + BB + 2 : SB + BB;
  const currentBet = straddled ? 2 : BB;

  let hand = {
    n, buttonSeat, heroSeat, heroDistance, heroPosition, heroCards,
    community: [], street: "preflop",
    pot, currentBet, activeCount: n,
    heroInvestedStreet, heroTotalInvested: heroInvestedStreet,
    foldedSeats: new Set(), afterOrder: [], beforeLog: [], afterLog: null,
    tendencyFn: tendencyFn || null, straddled: !!straddled,
    terminal: null,
  };
  hand = runPreStreetVillains(hand);
  return hand;
}

export function dealNewHand(settings) {
  const n = settings.playerCount === "random" ? pickPlayerCount(settings.distribution) : settings.playerCount;
  const buttonSeat = Math.floor(Math.random() * n);
  let heroDistance;
  if (settings.position !== "random" && POSITION_TABLE[n]?.includes(settings.position)) {
    heroDistance = POSITION_TABLE[n].indexOf(settings.position);
  } else {
    heroDistance = Math.floor(Math.random() * n);
  }
  const heroSeat = (buttonSeat + heroDistance) % n;
  const straddled = n > 2 && settings.buttonStraddleEnabled && heroDistance !== 0 && Math.random() < 0.25;
  return buildHand({ n, buttonSeat, heroSeat, heroDistance, tendencyFn: makeTendencyFn(settings, null), straddled });
}

/** Session mode: table size, button rotation, and each villain's tendency persist hand to hand;
 * hero's seat stays fixed while the button advances around them, like a real table. */
export function dealSessionHand(session, settings) {
  const { n, buttonSeat, heroSeat } = session;
  const heroDistance = (heroSeat - buttonSeat + n) % n;
  const straddled = n > 2 && settings.buttonStraddleEnabled && heroDistance !== 0 && Math.random() < 0.25;
  return buildHand({ n, buttonSeat, heroSeat, heroDistance, tendencyFn: makeTendencyFn(settings, session), straddled });
}

export function nextStreetHand(hand) {
  const streetName = NEXT_STREET[hand.street];
  const used = new Set([...hand.heroCards, ...hand.community].map((c) => c.key));
  const deck = shuffle(FULL_DECK.filter((c) => !used.has(c.key)));
  const community = streetName === "flop" ? [deck[0], deck[1], deck[2]] : [...hand.community, deck[0]];
  let next = { ...hand, street: streetName, community, currentBet: 0, heroInvestedStreet: 0, terminal: null };
  next = runPreStreetVillains(next);
  return next;
}

/**
 * Once hero is all-in mid-hand, they have no more decisions to make — real poker just runs the
 * remaining streets out. Resolves the current street's after-hero action (hero contributes
 * nothing further), then keeps auto-dealing/resolving subsequent streets until a terminal state
 * (uncontested win or showdown) is reached, skipping the "Continue to <street>" prompts entirely.
 */
export function playOutAllIn(hand, streetsMode) {
  let current = hand;
  let guard = 0;
  while (!current.terminal && guard < 10) {
    guard += 1;
    const seg = current.street === "preflop"
      ? simulatePreflopSegment(current.afterOrder, current.pot, current.currentBet, current.activeCount, false, current.tendencyFn, current.street === "preflop" && current.straddled ? 2 : 0, current.n)
      : simulatePostflopSegment(current.afterOrder, current.pot, current.currentBet, current.activeCount, false, current.tendencyFn);

    const foldedSeats = new Set(current.foldedSeats);
    seg.log.forEach((l) => { if (l.action === "fold") foldedSeats.add((current.buttonSeat + l.dist) % current.n); });
    let next = { ...current, pot: seg.pot, currentBet: seg.currentBet, activeCount: seg.activeCount, foldedSeats, afterLog: seg.log };

    const forceShowdown = streetsMode === "preflop" || current.street === "river";
    if (seg.activeCount <= 1) {
      next.terminal = { type: "uncontested" };
    } else if (forceShowdown) {
      const showdown = dealShowdown(current.heroCards, current.community, seg.activeCount - 1);
      next.terminal = { type: "showdown", ...showdown };
      next.community = showdown.board;
    } else {
      next = nextStreetHand(next); // deals the next street and may itself resolve to terminal
    }
    current = next;
  }
  return current;
}

/** Gross amount to credit back to a session stack when a hand concludes. Chips invested are
 * deducted progressively as the hero bets (see the component's act()), so this only returns the
 * winnings — the whole pot on a win/uncontested win, a fair share on a tie, 0 on a loss or fold. */
export function computeHeroPayout(hand) {
  const terminal = hand.terminal;
  if (!terminal) return 0;
  if (terminal.type === "uncontested") return hand.pot;
  if (terminal.type === "showdown") {
    if (terminal.result === "win") return hand.pot;
    if (terminal.result === "tie") {
      const tieCount = 1 + terminal.oppVals.filter((v) => compareTuples(v, terminal.heroVal) === 0).length;
      return Math.round((hand.pot / tieCount) * 10) / 10;
    }
  }
  return 0; // folded or lost — the invested chips are already gone from the stack
}

/** Applies hero's action to the pot, plays out anyone still to act (no re-raises), then decides what happens next. */
export function resolveHeroAction(hand, action, streetsMode, maxAdditional = Infinity) {
  const investedBefore = hand.heroInvestedStreet;
  let pot = hand.pot, currentBet = hand.currentBet, heroInvestedStreet = hand.heroInvestedStreet;
  let heroAllIn = false;
  if (action === "call") {
    let add = Math.round((currentBet - heroInvestedStreet) * 10) / 10;
    if (add >= maxAdditional) { add = Math.max(0, Math.round(maxAdditional * 10) / 10); heroAllIn = true; }
    pot = Math.round((pot + add) * 10) / 10;
    heroInvestedStreet = Math.round((heroInvestedStreet + add) * 10) / 10;
  } else if (action === "raise") {
    let desiredTo;
    if (hand.street === "preflop") desiredTo = currentBet <= BB ? 3 : Math.round(currentBet * 2.5 * 10) / 10;
    else desiredTo = currentBet <= 0 ? Math.max(1, Math.round(pot * 0.75 * 10) / 10) : Math.round(currentBet * 2.5 * 10) / 10;
    let add = Math.round((desiredTo - heroInvestedStreet) * 10) / 10;
    if (add >= maxAdditional) { add = Math.max(0, Math.round(maxAdditional * 10) / 10); heroAllIn = true; }
    pot = Math.round((pot + add) * 10) / 10;
    heroInvestedStreet = Math.round((heroInvestedStreet + add) * 10) / 10;
    // Only actually raises the price if the (possibly capped) commitment clears the current bet —
    // a short all-in that doesn't reach it is really just an all-in call, not a raise.
    if (heroInvestedStreet > currentBet) currentBet = heroInvestedStreet;
  }
  // action === 'check' leaves pot/currentBet untouched
  const heroTotalInvested = Math.round(((hand.heroTotalInvested || 0) + (heroInvestedStreet - investedBefore)) * 10) / 10;

  const seg = hand.street === "preflop"
    ? simulatePreflopSegment(hand.afterOrder, pot, currentBet, hand.activeCount, false, hand.tendencyFn, hand.street === "preflop" && hand.straddled ? 2 : 0, hand.n)
    : simulatePostflopSegment(hand.afterOrder, pot, currentBet, hand.activeCount, false, hand.tendencyFn);

  const foldedSeats = new Set(hand.foldedSeats);
  seg.log.forEach((l) => { if (l.action === "fold") foldedSeats.add((hand.buttonSeat + l.dist) % hand.n); });

  let next = {
    ...hand, pot: seg.pot, currentBet: seg.currentBet, activeCount: seg.activeCount, heroInvestedStreet, heroTotalInvested,
    foldedSeats, afterLog: seg.log, heroAllIn: heroAllIn || hand.heroAllIn,
  };

  const forceShowdown = streetsMode === "preflop" || hand.street === "river";
  if (seg.activeCount <= 1) {
    next.terminal = { type: "uncontested" };
  } else if (forceShowdown) {
    const showdown = dealShowdown(hand.heroCards, hand.community, seg.activeCount - 1);
    next.terminal = { type: "showdown", ...showdown };
    next.community = showdown.board; // reveal the full run-out for display
  } else {
    next.terminal = null; // hand continues — UI shows "Continue to <next street>"
  }
  return next;
}
