import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";

/* ============================== THEME =============================== */
const C = {
  feltDarker: "#0A2620",
  felt: "#123D30",
  feltLine: "#1B5443",
  ink: "#0D1210",
  panel: "#132420",
  panelLine: "#234238",
  cream: "#EFE6D3",
  creamDim: "#B9AF9B",
  gold: "#C9A24B",
  goldDim: "#8C7439",
  crimson: "#BE4B45",
  sage: "#6FA98A",
};

const fontImport = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
html, body { margin: 0; padding: 0; background: #0A2620; min-height: 100%; overscroll-behavior-y: contain; }
#root, #app { min-height: 100%; background: #0A2620; }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
button { outline: none; -webkit-tap-highlight-color: transparent; }
button:focus-visible { outline: 2px solid ${C.gold}; outline-offset: 2px; }
`;


import {
  RANK_CHAR, SUIT_CHAR, RED_SUITS,
  simulateEquity, dealShowdown, HAND_NAMES, compareTuples, idealAction,
  POSITION_TABLE, ACTION_LABEL, STREET_LABEL, NEXT_STREET,
  pickPlayerCount, makeTendencyFn, dealNewHand, dealSessionHand,
  nextStreetHand, resolveHeroAction, playOutAllIn, computeHeroPayout, EQUITY_TRIALS,
} from "../engine/poker-engine.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { loadState, saveState } from "../storage/persistence.js";
import LoginBar from "../auth/LoginBar.jsx";

/* ============================== UI PIECES =============================== */
function PlayingCard({ card, size = "md", faceDown = false }) {
  const dims = size === "lg" ? { w: 64, h: 90, fs: 22 } : size === "sm" ? { w: 34, h: 48, fs: 13 } : { w: 46, h: 64, fs: 16 };
  if (faceDown) {
    return (
      <div style={{
        width: dims.w, height: dims.h, borderRadius: 8,
        background: `repeating-linear-gradient(135deg, ${C.feltLine}, ${C.feltLine} 4px, ${C.felt} 4px, ${C.felt} 8px)`,
        border: `1px solid ${C.goldDim}`,
      }} />
    );
  }
  const red = RED_SUITS.has(card.suit);
  return (
    <div style={{
      width: dims.w, height: dims.h, borderRadius: 8, background: C.cream,
      border: `1px solid ${C.goldDim}`, display: "flex", flexDirection: "column",
      justifyContent: "space-between", padding: "4px 5px", boxShadow: "0 3px 6px rgba(0,0,0,0.35)",
    }}>
      <div style={{ color: red ? C.crimson : C.ink, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: dims.fs, lineHeight: 1 }}>
        {RANK_CHAR[card.rank]}
      </div>
      <div style={{ color: red ? C.crimson : C.ink, fontSize: dims.fs + 4, alignSelf: "flex-end", lineHeight: 1 }}>
        {SUIT_CHAR[card.suit]}
      </div>
    </div>
  );
}

function EquityRing({ equity, breakeven, size = 128 }) {
  const r = size / 2 - 10;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, equity));
  const beAngle = breakeven != null ? breakeven * 360 : null;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.panelLine} strokeWidth="9" />
      <circle
        cx={cx} cy={cy} r={r} fill="none" stroke={C.gold} strokeWidth="9"
        strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {beAngle != null && (
        <line
          x1={cx} y1={cy - r - 6} x2={cx} y2={cy - r + 6}
          stroke={C.crimson} strokeWidth="3"
          transform={`rotate(${beAngle} ${cx} ${cy})`}
        />
      )}
      <text x={cx} y={cy - 2} textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontWeight="600" fontSize="24" fill={C.cream}>
        {Math.round(pct * 100)}%
      </text>
      <text x={cx} y={cy + 18} textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fill={C.creamDim}>
        EQUITY
      </text>
    </svg>
  );
}

const SEAT_ICON = { fold: "✕", check: "–", call: "●", bet: "▲", raise: "▲" };
const SEAT_ICON_COLOR = { fold: C.crimson, check: C.creamDim, call: C.sage, bet: C.gold, raise: C.gold };

function SeatRing({ n, buttonSeat, heroSeat, foldedSeats, seatActions }) {
  const size = 220, cx = size / 2, cy = size / 2, r = 82;
  const seats = [];
  for (let s = 0; s < n; s++) {
    const angle = (s / n) * 2 * Math.PI - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    const isHero = s === heroSeat;
    const isButton = s === buttonSeat;
    const isFolded = foldedSeats?.has(s) && !isHero;
    const seatAction = seatActions?.[s];

    let icon = "";
    let iconColor = C.creamDim;
    if (isHero) icon = "YOU";
    else if (seatAction) { icon = SEAT_ICON[seatAction.action] || ""; iconColor = SEAT_ICON_COLOR[seatAction.action] || C.creamDim; }
    else if (isFolded) { icon = "✕"; iconColor = C.crimson; }
    else if (isButton) icon = "D";

    seats.push(
      <div key={s} style={{
        position: "absolute", left: x - 13, top: y - 13, width: 26, height: 26,
        borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'IBM Plex Mono', monospace", fontSize: isHero ? 10 : 13, fontWeight: 600,
        background: isHero ? C.gold : isFolded ? "transparent" : C.panel,
        color: isHero ? C.ink : iconColor,
        border: `1.5px solid ${isButton ? C.crimson : C.panelLine}`,
        borderStyle: isFolded ? "dashed" : "solid",
        opacity: isFolded ? 0.6 : 1,
        transition: "background 0.35s ease, color 0.35s ease, opacity 0.35s ease, border-color 0.35s ease",
      }}>
        {icon}
      </div>
    );
  }
  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <div style={{
        position: "absolute", left: 20, top: 20, width: size - 40, height: size - 40,
        borderRadius: "50%", border: `1px solid ${C.feltLine}`, background: C.feltDarker,
      }} />
      {seats}
    </div>
  );
}



/* ============================== MAIN APP =============================== */
export default function PokerTrainer() {
  const [settings, setSettings] = useState({ playerCount: "random", distribution: "full", position: "random", streetsMode: "preflop", equityMode: "hidden", tableMode: "fresh", bluffingEnabled: false, aggression: "normal", buttonStraddleEnabled: false, animationsEnabled: false });
  const [session, setSession] = useState(null); // {n, buttonSeat, heroSeat, tendencies, heroStack, handsPlayed, buyIn}
  const [showSettings, setShowSettings] = useState(true);
  const [showStats, setShowStats] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState(null);
  const historyIdRef = useRef(0);
  const [openHelpSections, setOpenHelpSections] = useState(new Set(["how-to-play"]));
  const toggleHelpSection = useCallback((id) => {
    setOpenHelpSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const [hand, setHand] = useState(null);
  const [decision, setDecision] = useState(null); // {action, equity, ideal, correct}
  const [thinking, setThinking] = useState(false);
  const [revealCount, setRevealCount] = useState(0); // how many of hand.beforeLog entries are "shown" so far
  const revealTimerRef = useRef(null);
  const tableTopRef = useRef(null);
  const resultRef = useRef(null);

  const scrollToTop = useCallback(() => {
    requestAnimationFrame(() => {
      tableTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const startReveal = useCallback((newHand, animationsEnabled) => {
    if (revealTimerRef.current) clearInterval(revealTimerRef.current);
    const len = newHand.beforeLog.length;
    if (!animationsEnabled) { setRevealCount(len); return; }
    setRevealCount(0);
    const steps = Math.max(len, 1); // always at least one tick, so the street transition is always visible
    let i = 0;
    revealTimerRef.current = setInterval(() => {
      i += 1;
      setRevealCount(Math.min(i, len));
      if (i >= steps) clearInterval(revealTimerRef.current);
    }, 450);
  }, []);

  // Computed once per render so `act()` can reuse this exact value in "live" mode instead of
  // re-running an independent Monte Carlo sample (which would show a different % than what
  // was just displayed, purely from sampling noise).
  const liveEquity = useMemo(() => {
    if (!hand || hand.terminal || decision || settings.equityMode !== "live") return null;
    if (revealCount < hand.beforeLog.length) return null; // wait for the villain-action reveal to finish
    try {
      return simulateEquity(hand.heroCards, hand.activeCount - 1, hand.community, EQUITY_TRIALS);
    } catch (err) {
      console.error("Error computing live equity:", err);
      return null;
    }
  }, [hand, decision, settings.equityMode, revealCount]);

  const [stats, setStats] = useState({
    total: 0, correct: 0,
    byPosition: {}, byPlayerCount: {}, byStreet: {}, byCombo: {},
    actionCounts: { fold: 0, call: 0, check: 0, raise: 0 },
    luckiest: null, // underdog win despite a mistake
    unluckiest: null, // clear favorite that still lost
    history: [],
  });

  const { user } = useAuth();
  const [persistenceLoaded, setPersistenceLoaded] = useState(false);

  // Load persisted settings/stats once, and again whenever the signed-in user changes
  // (guest -> signed in, switching accounts, or signing out).
  useEffect(() => {
    let cancelled = false;
    setPersistenceLoaded(false);
    loadState(user)
      .then((saved) => {
        if (cancelled) return;
        if (saved?.settings) setSettings((s) => ({ ...s, ...saved.settings }));
        if (saved?.stats) setStats((s) => ({ ...s, ...saved.stats }));
      })
      .catch(() => { /* no saved state yet, or offline — start fresh */ })
      .finally(() => { if (!cancelled) setPersistenceLoaded(true); });
    return () => { cancelled = true; };
  }, [user]);

  // Persist settings/stats after they change. Skipped until the initial load finishes, so we
  // don't immediately clobber existing cloud/local data with transient default state.
  useEffect(() => {
    if (!persistenceLoaded) return;
    const id = setTimeout(() => {
      saveState(user, { settings, stats });
    }, 600);
    return () => clearTimeout(id);
  }, [settings, stats, user, persistenceLoaded]);

  const BUY_IN = 100;

  const startSession = useCallback(() => {
    const n = settings.playerCount === "random" ? pickPlayerCount(settings.distribution) : settings.playerCount;
    const buttonSeat = Math.floor(Math.random() * n);
    const tendencies = {};
    for (let s = 0; s < n; s++) {
      if (s === 0) continue; // hero's fixed seat, no tendency needed
      tendencies[s] = { foldBias: (Math.random() - 0.5) * 0.3, raiseBias: (Math.random() - 0.5) * 0.16 };
    }
    const newSession = { n, buttonSeat, heroSeat: 0, tendencies, heroStack: BUY_IN, handsPlayed: 0, buyIn: BUY_IN };
    setDecision(null);
    const newHand = dealSessionHand(newSession, settings);
    const blindPosted = newHand.heroInvestedStreet;
    let stack = Math.max(0, Math.round((newSession.heroStack - blindPosted) * 10) / 10);
    if (newHand.terminal) {
      stack = Math.round((stack + computeHeroPayout(newHand)) * 10) / 10;
    }
    newSession.heroStack = stack;
    setSession(newSession);
    setHand(newHand);
    startReveal(newHand, settings.animationsEnabled);
    scrollToTop();
  }, [settings, startReveal, scrollToTop]);

  const endSession = useCallback(() => {
    setSession(null);
    setHand(null);
    setDecision(null);
  }, []);

  const rebuy = useCallback(() => {
    setSession((prev) => (prev ? { ...prev, heroStack: prev.buyIn } : prev));
  }, []);

  const dealHand = useCallback(() => {
    setDecision(null);
    let newHand;
    if (session) {
      const nextSession = { ...session, buttonSeat: (session.buttonSeat + 1) % session.n, handsPlayed: session.handsPlayed + 1 };
      newHand = dealSessionHand(nextSession, settings);
      const blindPosted = newHand.heroInvestedStreet; // 0, SB, or BB
      let stack = Math.max(0, Math.round((nextSession.heroStack - blindPosted) * 10) / 10);
      if (newHand.terminal) {
        // Everyone folded before hero even got a turn — act() never runs, so credit the payout here.
        stack = Math.round((stack + computeHeroPayout(newHand)) * 10) / 10;
      }
      nextSession.heroStack = stack;
      setSession(nextSession);
    } else {
      newHand = dealNewHand(settings);
    }
    setHand(newHand);
    startReveal(newHand, settings.animationsEnabled);
    scrollToTop();
  }, [settings, session, startReveal, scrollToTop]);

  const recordStats = useCallback((h, updated, action, equity, ideal, correct, callAmount) => {
    setStats((prev) => {
      const pos = h.heroPosition, n = h.n, street = h.street;
      const byPosition = { ...prev.byPosition };
      byPosition[pos] = { total: (byPosition[pos]?.total || 0) + 1, correct: (byPosition[pos]?.correct || 0) + (correct ? 1 : 0) };
      const byPlayerCount = { ...prev.byPlayerCount };
      byPlayerCount[n] = { total: (byPlayerCount[n]?.total || 0) + 1, correct: (byPlayerCount[n]?.correct || 0) + (correct ? 1 : 0) };
      const byStreet = { ...prev.byStreet };
      byStreet[street] = { total: (byStreet[street]?.total || 0) + 1, correct: (byStreet[street]?.correct || 0) + (correct ? 1 : 0) };
      const actionCounts = { ...prev.actionCounts, [action]: (prev.actionCounts[action] || 0) + 1 };

      const comboKey = `${n}|${pos}`;
      const byCombo = { ...prev.byCombo };
      const prevCombo = byCombo[comboKey];
      byCombo[comboKey] = { n, position: pos, total: (prevCombo?.total || 0) + 1, correct: (prevCombo?.correct || 0) + (correct ? 1 : 0) };

      const terminal = updated.terminal;
      const isShowdown = terminal?.type === "showdown";
      const result = terminal?.type === "uncontested" ? "win" : isShowdown ? terminal.result : null;

      // Luckiest/unluckiest are judged on the hand's ORIGINAL (preflop) equity and ideal action,
      // not the equity at whichever street ended the hand — later streets can swing equity a lot,
      // and it's the initial decision that was actually risky or safe.
      let luckiest = prev.luckiest;
      if (isShowdown && result === "win" && updated.initialIdeal === "fold" && updated.initialAction !== "fold" && (!luckiest || updated.initialEquity < luckiest.equity)) {
        luckiest = { equity: updated.initialEquity, cards: h.heroCards, n, position: pos, handName: terminal.handName };
      }
      let unluckiest = prev.unluckiest;
      if (isShowdown && result === "lose" && updated.initialIdeal !== "fold" && updated.initialAction !== "fold" && (!unluckiest || updated.initialEquity > unluckiest.equity)) {
        unluckiest = { equity: updated.initialEquity, cards: h.heroCards, n, position: pos, handName: terminal.handName };
      }

      historyIdRef.current += 1;
      const entry = {
        id: historyIdRef.current,
        n, position: pos, street, equity, action, ideal, correct, result: result ?? "continues",
        heroCards: h.heroCards, pot: h.pot, callAmount,
        board: isShowdown ? terminal.board : (h.community.length ? h.community : null),
        handName: isShowdown ? terminal.handName : null,
        oppHands: isShowdown ? terminal.oppHands : null,
        oppHandNames: isShowdown ? terminal.oppHandNames : null,
      };
      const history = [entry, ...prev.history].slice(0, 50);

      return { total: prev.total + 1, correct: prev.correct + (correct ? 1 : 0), byPosition, byPlayerCount, byStreet, byCombo, actionCounts, luckiest, unluckiest, history };
    });
  }, []);

  const act = useCallback((action) => {
    if (!hand || thinking) return;
    setThinking(true);
    setTimeout(() => {
      try {
        const numOpponents = hand.activeCount - 1;
        const equity = (settings.equityMode === "live" && liveEquity != null)
          ? liveEquity
          : simulateEquity(hand.heroCards, numOpponents, hand.community, EQUITY_TRIALS);
        const callAmount = Math.max(0, Math.round((hand.currentBet - hand.heroInvestedStreet) * 10) / 10);
        const canCheck = callAmount === 0;
        const ideal = idealAction(equity, callAmount, hand.pot, canCheck);
        const correct = action === ideal;
        const isFirstDecision = hand.initialEquity == null;
        const initialFields = isFirstDecision
          ? { initialEquity: equity, initialIdeal: ideal, initialAction: action }
          : {};

        let updated;
        if (action === "fold") {
          updated = { ...hand, terminal: { type: "folded" }, ...initialFields };
        } else {
          const maxAdditional = session ? session.heroStack : Infinity;
          updated = { ...resolveHeroAction(hand, action, settings.streetsMode, maxAdditional), ...initialFields };
          if (updated.heroAllIn && !updated.terminal) {
            updated = playOutAllIn(updated, settings.streetsMode);
          }
        }

        recordStats(hand, updated, action, equity, ideal, correct, callAmount);
        if (session) {
          // Deduct whatever hero just committed this action immediately (gameplay correctness —
          // the stack should reflect chips in the pot right away, not just at hand's end), then
          // credit back any winnings once the hand actually concludes.
          const committed = Math.round((updated.heroInvestedStreet - hand.heroInvestedStreet) * 10) / 10;
          const payout = updated.terminal ? computeHeroPayout(updated) : 0;
          const delta = Math.round((payout - committed) * 10) / 10;
          if (delta !== 0) {
            setSession((prev) => (prev ? { ...prev, heroStack: Math.max(0, Math.round((prev.heroStack + delta) * 10) / 10) } : prev));
          }
        }
        setHand(updated);
        setDecision({ action, equity, ideal, correct });
      } catch (err) {
        // Never leave the UI stuck showing "running equity…" forever — surface the error and
        // let the player try again instead.
        console.error("Error resolving action:", err);
      } finally {
        setThinking(false);
      }
    }, 350);
  }, [hand, thinking, recordStats, settings.streetsMode, settings.equityMode, liveEquity, session]);

  const continueStreet = useCallback(() => {
    if (!hand) return;
    setDecision(null);
    const newHand = nextStreetHand(hand);
    setHand(newHand);
    startReveal(newHand, settings.animationsEnabled);
    scrollToTop();
  }, [hand, settings.animationsEnabled, startReveal, scrollToTop]);

  const worstCombo = useMemo(() => {
    const all = Object.values(stats.byCombo);
    if (all.length === 0) return null;
    const reliable = all.filter((e) => e.total >= 3);
    const pool = reliable.length > 0 ? reliable : all;
    return [...pool].sort((a, b) => (a.correct / a.total) - (b.correct / b.total) || b.total - a.total)[0];
  }, [stats.byCombo]);

  const practiceWeakestSpot = useCallback(() => {
    if (!worstCombo) return;
    const nextSettings = { ...settings, tableMode: "fresh", playerCount: worstCombo.n, position: worstCombo.position };
    setSettings(nextSettings);
    setSession(null);
    setShowSettings(true);
    setShowStats(false);
    setDecision(null);
    const newHand = dealNewHand(nextSettings);
    setHand(newHand);
    startReveal(newHand, nextSettings.animationsEnabled);
    scrollToTop();
  }, [worstCombo, settings, startReveal, scrollToTop]);

  const callAmount = hand ? Math.max(0, Math.round((hand.currentBet - hand.heroInvestedStreet) * 10) / 10) : 0;
  const canCheck = hand ? callAmount === 0 : false;
  const potOdds = hand && callAmount > 0 ? callAmount / (hand.pot + callAmount) : null;

  const visibleBeforeLog = useMemo(() => {
    if (!hand) return [];
    return decision ? hand.beforeLog : hand.beforeLog.slice(0, revealCount);
  }, [hand, decision, revealCount]);

  const foldedSeats = useMemo(() => {
    if (!hand) return new Set();
    if (decision) return hand.foldedSeats; // fully resolved once hero has acted
    const s = new Set(hand.priorFoldedSeats || []); // folds locked in before this street started
    visibleBeforeLog.forEach((e) => { if (e.action === "fold") s.add((hand.buttonSeat + e.dist) % hand.n); });
    return s;
  }, [hand, decision, visibleBeforeLog]);

  const seatActions = useMemo(() => {
    if (!hand) return {};
    const map = {};
    [...visibleBeforeLog, ...(decision ? hand.afterLog || [] : [])].forEach((e) => {
      map[(hand.buttonSeat + e.dist) % hand.n] = e;
    });
    return map;
  }, [hand, decision, visibleBeforeLog]);

  const positionOptions = settings.playerCount !== "random" ? POSITION_TABLE[settings.playerCount] : null;
  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : null;

  const revealDone = !hand || revealCount >= hand.beforeLog.length;
  const awaitingDecision = hand && !hand.terminal && !decision && revealDone;
  const awaitingContinue = hand && !hand.terminal && decision;
  const busted = session && session.heroStack <= 0;

  useEffect(() => {
    if (decision || hand?.terminal) {
      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [decision, hand?.terminal]);
  const advancedVisible = showAdvanced || !!session;

  return (
    <div style={{
      minHeight: "100vh", background: `radial-gradient(ellipse at 50% -10%, ${C.felt}, ${C.feltDarker} 60%)`,
      fontFamily: "'Fraunces', serif", color: C.cream, padding: "20px 14px 60px",
    }}>
      <style>{fontImport}</style>

      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <LoginBar />
        <header style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: C.gold, fontFamily: "'IBM Plex Mono', monospace" }}>ODDS TRAINER</div>
          <h1 style={{ fontSize: 30, fontWeight: 700, margin: "2px 0 0", letterSpacing: 0.5 }}>Hold'em Equity Room</h1>
        </header>

        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <button onClick={() => setShowSettings((v) => !v)} style={pillBtnStyle(showSettings)}>Settings</button>
          <button onClick={() => setShowStats((v) => !v)} style={pillBtnStyle(showStats)}>
            Stats {accuracy != null ? `· ${accuracy}%` : ""}
          </button>
          <button onClick={() => setShowHelp((v) => !v)} style={pillBtnStyle(showHelp)}>Help</button>
          <button onClick={() => setShowHistory((v) => !v)} style={pillBtnStyle(showHistory)}>History</button>
        </div>

        {showSettings && (
          <div style={panelStyle}>
            {session ? (
              <div style={{ fontSize: 12, color: C.creamDim, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 12 }}>
                Table locked for this session: {session.n}-handed, seat fixed, button rotating.
              </div>
            ) : (
              <>
                <div style={rowLabel}>Players per hand</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  <button style={chipStyle(settings.playerCount === "random")} onClick={() => setSettings((s) => ({ ...s, playerCount: "random", position: "random" }))}>Random</button>
                  {[2,3,4,5,6,7,8,9].map((n) => (
                    <button key={n} style={chipStyle(settings.playerCount === n)} onClick={() => setSettings((s) => ({ ...s, playerCount: n, position: "random" }))}>{n}</button>
                  ))}
                </div>
                {settings.playerCount === "random" && (
                  <>
                    <div style={rowLabel}>Table size distribution</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                      <button style={chipStyle(settings.distribution === "full")} onClick={() => setSettings((s) => ({ ...s, distribution: "full" }))}>Favor full tables</button>
                      <button style={chipStyle(settings.distribution === "even")} onClick={() => setSettings((s) => ({ ...s, distribution: "even" }))}>Even</button>
                      <button style={chipStyle(settings.distribution === "short")} onClick={() => setSettings((s) => ({ ...s, distribution: "short" }))}>Favor short-handed</button>
                    </div>
                  </>
                )}
                <div style={rowLabel}>Your position</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  <button style={chipStyle(settings.position === "random")} onClick={() => setSettings((s) => ({ ...s, position: "random" }))}>Random</button>
                  {positionOptions ? positionOptions.map((p) => (
                    <button key={p} style={chipStyle(settings.position === p)} onClick={() => setSettings((s) => ({ ...s, position: p }))}>{p}</button>
                  )) : (
                    <span style={{ fontSize: 12, color: C.creamDim, fontFamily: "'IBM Plex Mono', monospace" }}>Fix a player count to lock a position</span>
                  )}
                </div>
              </>
            )}
            <div style={rowLabel}>Streets</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              <button style={chipStyle(settings.streetsMode === "preflop")} onClick={() => setSettings((s) => ({ ...s, streetsMode: "preflop" }))}>Preflop only</button>
              <button style={chipStyle(settings.streetsMode === "full")} onClick={() => setSettings((s) => ({ ...s, streetsMode: "full" }))}>Full hand (flop → river)</button>
            </div>
            <div style={rowLabel}>Equity display</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              <button style={chipStyle(settings.equityMode === "hidden")} onClick={() => setSettings((s) => ({ ...s, equityMode: "hidden" }))}>Hidden until after (harder)</button>
              <button style={chipStyle(settings.equityMode === "live")} onClick={() => setSettings((s) => ({ ...s, equityMode: "live" }))}>Live while deciding (easier)</button>
            </div>

            <button
              onClick={() => setShowAdvanced((v) => !v)}
              style={{ ...pillBtnStyle(advancedVisible), width: "100%", marginBottom: advancedVisible ? 12 : 0 }}
            >
              Advanced settings {advancedVisible ? "▴" : "▾"}
            </button>

            {advancedVisible && (
              <>
                <div style={rowLabel}>Table mode</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  <button
                    style={chipStyle(settings.tableMode === "fresh")}
                    onClick={() => { setSettings((s) => ({ ...s, tableMode: "fresh" })); if (session) endSession(); }}
                  >
                    Fresh table each hand
                  </button>
                  <button style={chipStyle(settings.tableMode === "session")} onClick={() => setSettings((s) => ({ ...s, tableMode: "session" }))}>
                    Realistic session (same table)
                  </button>
                </div>
                {settings.tableMode === "session" && (
                  <div style={{ marginBottom: 12 }}>
                    {!session ? (
                      <>
                        <div style={{ fontSize: 12, color: C.creamDim, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8, lineHeight: 1.5 }}>
                          Locks in the table size below for the whole session, gives each opponent a fixed
                          personality, and tracks your {BUY_IN}bb stack across hands. Your seat stays put —
                          the button rotates around you, like a real table.
                        </div>
                        <button style={{ ...primaryBtnStyle, width: "100%", padding: "10px 0" }} onClick={startSession}>Start Session</button>
                      </>
                    ) : (
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ color: C.creamDim }}>{session.n}-handed · hand #{session.handsPlayed + 1}</span>
                          <span style={{ color: C.gold, fontWeight: 700 }}>{session.heroStack}bb</span>
                        </div>
                        <button style={{ ...pillBtnStyle(false), width: "100%" }} onClick={endSession}>End Session</button>
                      </div>
                    )}
                  </div>
                )}
                <div style={rowLabel}>Villain bluffing</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  <button style={chipStyle(!settings.bluffingEnabled)} onClick={() => setSettings((s) => ({ ...s, bluffingEnabled: false }))}>Off</button>
                  <button style={chipStyle(settings.bluffingEnabled)} onClick={() => setSettings((s) => ({ ...s, bluffingEnabled: true }))}>On (more random raises)</button>
                </div>
                <div style={rowLabel}>Villain aggression</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  <button style={chipStyle(settings.aggression === "tight")} onClick={() => setSettings((s) => ({ ...s, aggression: "tight" }))}>Tight</button>
                  <button style={chipStyle(settings.aggression === "normal")} onClick={() => setSettings((s) => ({ ...s, aggression: "normal" }))}>Normal</button>
                  <button style={chipStyle(settings.aggression === "loose")} onClick={() => setSettings((s) => ({ ...s, aggression: "loose" }))}>Loose</button>
                </div>
                <div style={rowLabel}>Button straddle</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  <button style={chipStyle(!settings.buttonStraddleEnabled)} onClick={() => setSettings((s) => ({ ...s, buttonStraddleEnabled: false }))}>Off</button>
                  <button style={chipStyle(settings.buttonStraddleEnabled)} onClick={() => setSettings((s) => ({ ...s, buttonStraddleEnabled: true }))}>On (villains only)</button>
                </div>
                <div style={rowLabel}>Villain action animation</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <button style={chipStyle(!settings.animationsEnabled)} onClick={() => setSettings((s) => ({ ...s, animationsEnabled: false }))}>Off</button>
                  <button style={chipStyle(settings.animationsEnabled)} onClick={() => setSettings((s) => ({ ...s, animationsEnabled: true }))}>On (watch actions play out)</button>
                </div>
              </>
            )}
          </div>
        )}

        {showStats && (
          <div style={panelStyle}>
            {stats.total === 0 ? (
              <div style={{ fontSize: 13, color: C.creamDim }}>No decisions yet — deal a hand to start building your stats.</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <StatBig label="Decisions" value={stats.total} />
                  <StatBig label="Correct" value={stats.correct} />
                  <StatBig label="Accuracy" value={`${accuracy}%`} accent />
                </div>
                {worstCombo && (
                  <button style={{ ...primaryBtnStyle, width: "100%", marginBottom: 14, padding: "10px 0" }} onClick={practiceWeakestSpot}>
                    Practice weakest spot — {worstCombo.position} · {worstCombo.n}-handed ({Math.round((worstCombo.correct / worstCombo.total) * 100)}%)
                  </button>
                )}
                <div style={rowLabel}>By position</div>
                <StatTable rows={Object.entries(stats.byPosition)} />
                <div style={{ ...rowLabel, marginTop: 10 }}>By table size</div>
                <StatTable rows={Object.entries(stats.byPlayerCount).sort((a,b)=>a[0]-b[0])} labelFn={(k)=>`${k}-handed`} />
                <div style={{ ...rowLabel, marginTop: 10 }}>By street</div>
                <StatTable rows={["preflop","flop","turn","river"].filter(s=>stats.byStreet[s]).map(s=>[s, stats.byStreet[s]])} labelFn={(k)=>STREET_LABEL[k]} />
                <div style={{ ...rowLabel, marginTop: 10 }}>Your actions</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                  {["fold", "check", "call", "raise"].map((a) => {
                    const c = stats.actionCounts[a] || 0;
                    const pct = stats.total > 0 ? Math.round((c / stats.total) * 100) : 0;
                    return (
                      <div key={a} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px solid ${C.panelLine}` }}>
                        <span style={{ color: C.creamDim }}>{ACTION_LABEL[a]}</span>
                        <span>{c} <span style={{ color: C.gold }}>({pct}%)</span></span>
                      </div>
                    );
                  })}
                </div>
                {stats.luckiest && (
                  <>
                    <div style={{ ...rowLabel, marginTop: 10 }}>Luckiest hand (bad preflop equity, won at showdown)</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                      <div style={{ display: "flex", gap: 3 }}>
                        {stats.luckiest.cards.map((c) => <PlayingCard key={c.key} card={c} size="sm" />)}
                      </div>
                      <div style={{ color: C.creamDim }}>
                        preflop equity was only <span style={{ color: C.gold }}>{Math.round(stats.luckiest.equity * 100)}%</span>
                        <br />{stats.luckiest.position} · {stats.luckiest.n}-handed · {stats.luckiest.handName}
                      </div>
                    </div>
                  </>
                )}
                {stats.unluckiest && (
                  <>
                    <div style={{ ...rowLabel, marginTop: 10 }}>Unluckiest hand (strong preflop favorite, lost at showdown)</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                      <div style={{ display: "flex", gap: 3 }}>
                        {stats.unluckiest.cards.map((c) => <PlayingCard key={c.key} card={c} size="sm" />)}
                      </div>
                      <div style={{ color: C.creamDim }}>
                        preflop equity was <span style={{ color: C.gold }}>{Math.round(stats.unluckiest.equity * 100)}%</span>
                        <br />{stats.unluckiest.position} · {stats.unluckiest.n}-handed · {stats.unluckiest.handName}
                      </div>
                    </div>
                  </>
                )}
                <button
                  style={{ ...pillBtnStyle(false), marginTop: 12, width: "100%" }}
                  onClick={() => { setStats({ total: 0, correct: 0, byPosition: {}, byPlayerCount: {}, byStreet: {}, byCombo: {}, actionCounts: { fold: 0, call: 0, check: 0, raise: 0 }, luckiest: null, unluckiest: null, history: [] }); setExpandedHistory(null); }}
                >
                  Reset stats
                </button>
              </>
            )}
          </div>
        )}

        {showHelp && (
          <div style={panelStyle}>
            <HelpSection id="how-to-play" title="How to Play" open={openHelpSections.has("how-to-play")} onToggle={toggleHelpSection}>
              <p style={helpP}>
                Each hand you're dealt two cards at a random seat, with the dealer button, table size and
                blinds set up like a real table. Players before your turn act first (folding, checking,
                calling, betting, or raising) — you'll see each one appear on the seat ring as a symbol:
                <span style={{ color: C.crimson }}> ✕</span> fold,
                <span style={{ color: C.creamDim }}> –</span> check,
                <span style={{ color: C.sage }}> ●</span> call,
                <span style={{ color: C.gold }}> ▲</span> bet/raise. When it's your turn you see the pot,
                what it costs to continue, and how many players are still in the hand — then you choose
                Fold, Check, Call, or Raise.
              </p>
              <p style={helpP}>
                In "Preflop only" mode (the default) the rest of the board is dealt out immediately after
                your decision, so you get one clean decision per hand. In "Full hand" mode, if the hand
                survives, betting continues to the flop, turn and river, with a fresh decision each street
                — unless you go all-in, in which case the rest of the hand plays out automatically with no
                further decisions from you. After every decision the app reveals your win probability and
                the mathematically ideal action, and at showdown it reveals opponents' hole cards and the
                result.
              </p>
              <p style={helpP}>
                Cards aren't burned between streets — since every street's cards are drawn uniformly at
                random from whatever's left in the deck, a burn card (a real-table anti-cheating step)
                wouldn't change the odds at all, so it's skipped here.
              </p>
            </HelpSection>

            <HelpSection id="basics" title="Poker Basics" open={openHelpSections.has("basics")} onToggle={toggleHelpSection}>
              <dl style={{ margin: 0 }}>
                <HelpTerm term="Position — what it means">
                  Where you sit relative to the dealer button decides turn order. Acting later is an
                  advantage — you get to see what everyone else does first.
                </HelpTerm>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, marginBottom: 10 }}>
                  {[
                    ["BTN", "Button/Dealer. Acts last after the flop — the strongest seat at the table."],
                    ["CO", "Cutoff. One seat before the button — second-best seat, good spot to raise."],
                    ["HJ", "Hijack. Two seats before the button — solid late position."],
                    ["MP / MP1 / MP2", "Middle position. Between early and late position; used at 6-9 handed tables."],
                    ["UTG+1", "Seat right after UTG, still early position (8-9 handed tables)."],
                    ["UTG", "Under the gun — first to act preflop. Weakest seat, least information."],
                    ["SB", "Small blind. Posts half a big blind before cards are dealt; acts first after the flop."],
                    ["BB", "Big blind. Posts a full big blind before cards are dealt; acts last preflop, right after SB post-flop."],
                    ["BTN/SB", "Heads-up (2-handed) only. The button also posts the small blind and, unlike bigger tables, acts FIRST preflop — BB acts last preflop instead."],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", gap: 10, padding: "4px 0", borderBottom: `1px solid ${C.panelLine}` }}>
                      <span style={{ color: C.gold, fontWeight: 700, minWidth: 68 }}>{k}</span>
                      <span style={{ color: C.creamDim, lineHeight: 1.4 }}>{v}</span>
                    </div>
                  ))}
                </div>
                <HelpTerm term="BB / SB (as a unit)">
                  Bet sizes are shown in "bb" — big blinds — the standard unit for comparing stack and pot
                  sizes across different table stakes. The small blind (SB) is half a big blind.
                </HelpTerm>
                <HelpTerm term="Streets (preflop, flop, turn, river)">
                  The four betting rounds of a hand. Preflop: before any community cards. Flop: first 3
                  community cards. Turn: 4th card. River: 5th and final card, followed by showdown if more
                  than one player remains.
                </HelpTerm>
                <HelpTerm term="Pot / to call">
                  The pot is everything already bet by everyone this hand. "To call" is what you'd need to
                  add to stay in.
                </HelpTerm>
                <HelpTerm term="Pot odds">
                  The price you're being offered: call amount ÷ (pot + call amount). If pot odds are 25%,
                  you only need to win the hand 1 in 4 times for calling to break even.
                </HelpTerm>
              </dl>
            </HelpSection>

            <HelpSection id="reading-table" title="Reading the Table" open={openHelpSections.has("reading-table")} onToggle={toggleHelpSection}>
              <dl style={{ margin: 0 }}>
                <HelpTerm term="Equity">
                  Your probability of winning the hand right now if it were played out to the river against
                  the players still in it, given only the cards known so far. 40% equity means you'd win
                  about 4 times out of 10 on average.
                </HelpTerm>
                <HelpTerm term="What equity assumes about opponents">
                  Equity here is calculated against completely random hole cards for everyone still in the
                  hand — it does not narrow their likely holdings based on the fact that they called or
                  raised. In real play, a player who calls a raise usually has a stronger-than-random hand,
                  so your real equity against their actual range is typically a bit lower than the number
                  shown. Modeling realistic hand ranges is a meaningfully bigger feature than this trainer
                  currently does — the number is best read as "equity vs. any two random cards," a useful
                  pot-odds training tool but not a full range solver.
                </HelpTerm>
                <HelpTerm term="The equity circle (gold arc, red mark)">
                  The gold ring fills clockwise to show your equity — how much of the circle is gold is
                  your win probability. The red tick mark shows the pot-odds breakeven point for that
                  decision. If the gold arc reaches past the red mark, your equity was above what the pot
                  was offering — continuing was profitable. If it falls short of the red mark, you needed
                  more equity than you had.
                </HelpTerm>
                <HelpTerm term="Ideal action">
                  Compares your equity to the pot odds. Below pot odds → fold. Comfortably above pot odds
                  with strong equity → raise. In between → call. It's a simplified pot-odds model for
                  training, not a full solver — it ignores implied odds, bluffing, and future streets.
                </HelpTerm>
                <HelpTerm term="Still in">
                  How many players (including you) haven't folded yet — the number of live hands your
                  equity is calculated against. This can keep dropping after your own decision if players
                  still to act behind you fold to the same bet — check the seat ring symbols to see who
                  did what.
                </HelpTerm>
                <HelpTerm term="Seat ring symbols">
                  <span style={{ color: C.crimson }}>✕</span> fold ·{" "}
                  <span style={{ color: C.creamDim }}>–</span> check ·{" "}
                  <span style={{ color: C.sage }}>●</span> call ·{" "}
                  <span style={{ color: C.gold }}>▲</span> bet/raise. The red-bordered seat is the dealer
                  button — it stays on that seat for the whole hand, even if that player folds.
                </HelpTerm>
              </dl>
            </HelpSection>

            <HelpSection id="settings" title="Settings Reference" open={openHelpSections.has("settings")} onToggle={toggleHelpSection}>
              <dl style={{ margin: 0 }}>
                <HelpTerm term="Equity display">
                  "Hidden until after" only reveals your win probability once you've acted — the harder,
                  more realistic mode. "Live while deciding" shows it before you choose, useful while
                  you're still learning to read pot odds.
                </HelpTerm>
                <HelpTerm term="Table size distribution">
                  Only applies when Players per hand is set to Random. "Favor full tables" weights toward
                  9-handed, "Favor short-handed" weights toward 2-handed, "Even" gives every size 2-9 an
                  equal chance.
                </HelpTerm>
                <HelpTerm term="Streets mode">
                  "Preflop only" resolves every hand right after your one preflop decision. "Full hand"
                  continues through flop, turn, and river when the hand survives — see How to Play above.
                </HelpTerm>
                <HelpTerm term="Realistic session (Advanced)">
                  Instead of a brand-new random table every hand, this locks in one table size for the
                  whole session, gives each opponent a fixed personality (some tighter, some looser, some
                  more aggressive) that stays consistent hand to hand, and tracks a running stack for you
                  starting at 100bb. Your seat stays fixed — the button rotates around you each hand, like
                  a real game — so your position naturally cycles instead of teleporting randomly. Your
                  stack updates the moment you commit chips, not just at the end of the hand, and you can
                  never call or raise for more than you have — a call or raise that would exceed your stack
                  is automatically capped to an all-in for whatever's left. Once you're all-in, you have no
                  more decisions to make — the rest of the hand plays out automatically to showdown, just
                  like a real all-in run-out.
                </HelpTerm>
                <HelpTerm term="Villain bluffing (Advanced)">
                  When on, opponents bet and raise somewhat more often regardless of their actual hidden
                  strength — closer to how real players occasionally bluff — instead of only betting when
                  the model's baseline odds say to.
                </HelpTerm>
                <HelpTerm term="Villain aggression (Advanced)">
                  Shifts how often opponents fold across the whole table. Tight means they fold more and
                  play fewer hands; loose means they fold less and stick around with weaker holdings;
                  normal is the baseline. Combines with bluffing and, in a session, each opponent's own
                  personality.
                </HelpTerm>
                <HelpTerm term="Button straddle (Advanced)">
                  A straddle is an optional extra blind — here, the button posting 2bb before cards are
                  dealt, which becomes the new price to call preflop. Off by default. When on, it only
                  happens on villain-dealt hands (not when you're on the button), only some of the time
                  like a real home game, and only at 3+-handed tables — in heads-up the button is already
                  the small blind, so a straddle isn't well-defined there. Because the button already
                  posted live money, the blinds and everyone else act before the button gets its (last)
                  turn.
                </HelpTerm>
                <HelpTerm term="Villain action animation (Advanced)">
                  Off by default. When on, players before your turn reveal their fold/check/call/raise one
                  at a time on the seat ring instead of all at once, so you can watch the action come
                  around to you. The pot and call amount stay hidden until the reveal finishes.
                </HelpTerm>
                <HelpTerm term="Advanced settings">
                  Table mode, bluffing, aggression, straddle, and animation live under "Advanced settings"
                  to keep the main panel simple — tap it to expand. It opens automatically while a session
                  is active.
                </HelpTerm>
              </dl>
            </HelpSection>

            <HelpSection id="stats" title="Stats & Progress" open={openHelpSections.has("stats")} onToggle={toggleHelpSection}>
              <dl style={{ margin: 0 }}>
                <HelpTerm term="Practice weakest spot">
                  Looks at your position + table-size combinations with at least a few decisions logged,
                  finds the one with the lowest accuracy, and locks Settings to that exact spot so you can
                  drill it.
                </HelpTerm>
                <HelpTerm term="Luckiest / unluckiest hand">
                  Both are judged on your equity at the very first decision of the hand (usually preflop),
                  not whatever street it ended on, and only count real showdowns — not hands won or lost
                  uncontested. Luckiest: the model said fold, you continued anyway, and won at showdown.
                  Unluckiest: the model said continue and you were a real favorite, but still lost.
                </HelpTerm>
                <HelpTerm term="History (tap a row)">
                  Tap any row in History to expand it — shows your hole cards, the board if one was dealt,
                  the pot and call amount at that decision, and (at showdown) every opponent's hole cards
                  and hand type.
                </HelpTerm>
              </dl>
            </HelpSection>
          </div>
        )}


        {showHistory && (
          <div style={panelStyle}>
            {stats.history.length === 0 ? (
              <div style={{ fontSize: 13, color: C.creamDim }}>No decisions yet — this fills in as you play.</div>
            ) : (
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                {stats.history.slice(0, 20).map((e) => (
                  <div key={e.id} style={{ borderBottom: `1px solid ${C.panelLine}` }}>
                    <div
                      onClick={() => setExpandedHistory((cur) => (cur === e.id ? null : e.id))}
                      style={{ display: "grid", gridTemplateColumns: "6ch 3ch minmax(7ch,1fr) 4ch 5ch 2ch 4ch", alignItems: "center", gap: 5, padding: "6px 0", cursor: "pointer", fontVariantNumeric: "tabular-nums" }}
                    >
                      <div style={{ color: C.creamDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.position}</div>
                      <div style={{ color: C.creamDim, whiteSpace: "nowrap" }}>{e.n}-h</div>
                      <div style={{ color: C.creamDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{STREET_LABEL[e.street]}</div>
                      <div style={{ color: C.cream, textAlign: "right", whiteSpace: "nowrap" }}>{Math.round(e.equity * 100)}%</div>
                      <div style={{ color: C.cream, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ACTION_LABEL[e.action]}</div>
                      <div style={{ color: e.correct ? C.sage : C.crimson, fontWeight: 700, textAlign: "center" }}>
                        {e.correct ? "✓" : "✕"}
                      </div>
                      <div style={{
                        textAlign: "right", whiteSpace: "nowrap",
                        color: e.result === "win" ? C.sage : e.result === "lose" ? C.crimson : e.result === "tie" ? C.gold : C.creamDim,
                      }}>
                        {e.result === "continues" ? "…" : e.result.toUpperCase()}
                      </div>
                    </div>
                    {expandedHistory === e.id && (
                      <div style={{ padding: "4px 0 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>
                          <div>
                            <div style={{ color: C.creamDim, fontSize: 10, marginBottom: 3 }}>YOUR HAND</div>
                            <div style={{ display: "flex", gap: 3 }}>
                              {e.heroCards.map((c) => <PlayingCard key={c.key} card={c} size="sm" />)}
                            </div>
                          </div>
                          {e.board && e.board.length > 0 && (
                            <div>
                              <div style={{ color: C.creamDim, fontSize: 10, marginBottom: 3 }}>BOARD</div>
                              <div style={{ display: "flex", gap: 3 }}>
                                {e.board.map((c) => <PlayingCard key={c.key} card={c} size="sm" />)}
                              </div>
                            </div>
                          )}
                        </div>
                        <div style={{ color: C.creamDim, marginBottom: 8 }}>
                          Pot {e.pot}bb · Call {e.callAmount}bb · Ideal was {ACTION_LABEL[e.ideal]}
                          {e.handName && <> · Your {e.handName}</>}
                        </div>
                        {e.oppHands && e.oppHands.length > 0 && (
                          <div>
                            <div style={{ color: C.creamDim, fontSize: 10, marginBottom: 4 }}>OPPONENTS AT SHOWDOWN</div>
                            {e.oppHands.map((oh, j) => (
                              <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <div style={{ display: "flex", gap: 3 }}>
                                  {oh.map((c) => <PlayingCard key={c.key} card={c} size="sm" />)}
                                </div>
                                <span style={{ color: C.creamDim }}>{e.oppHandNames[j]}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Table */}
        <div ref={tableTopRef} style={{ ...panelStyle, textAlign: "center" }}>
          {!hand ? (
            <div style={{ padding: "20px 0" }}>
              {settings.tableMode === "session" && !session ? (
                <>
                  <div style={{ color: C.creamDim, fontSize: 14, marginBottom: 16 }}>Start a session in Settings to begin — it locks your table and stack.</div>
                  <button style={primaryBtnStyle} onClick={startSession}>Start Session</button>
                </>
              ) : (
                <>
                  <div style={{ color: C.creamDim, fontSize: 14, marginBottom: 16 }}>Deal a hand to begin training.</div>
                  <button style={primaryBtnStyle} onClick={dealHand}>Deal Hand</button>
                </>
              )}
            </div>
          ) : (
            <>
              <SeatRing n={hand.n} buttonSeat={hand.buttonSeat} heroSeat={hand.heroSeat} foldedSeats={foldedSeats} seatActions={seatActions} />
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.creamDim, marginTop: 8, display: "flex", justifyContent: "center", gap: 10 }}>
                <span><span style={{ color: C.crimson }}>✕</span> fold</span>
                <span><span style={{ color: C.creamDim }}>–</span> check</span>
                <span><span style={{ color: C.sage }}>●</span> call</span>
                <span><span style={{ color: C.gold }}>▲</span> bet/raise</span>
                <span><span style={{ color: C.crimson, border: `1.5px solid ${C.crimson}`, borderRadius: "50%", padding: "0 3px" }}>D</span> dealer</span>
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.creamDim, marginTop: 6 }}>
                {hand.n}-HANDED · YOU ARE <span style={{ color: C.gold }}>{hand.heroPosition}</span> · {STREET_LABEL[hand.street].toUpperCase()}
                {hand.straddled && <> · <span style={{ color: C.gold }}>BTN STRADDLES TO 2bb</span></>}
                {session && <> · HAND #{session.handsPlayed + 1} · <span style={{ color: C.gold }}>{session.heroStack}bb</span></>}
              </div>

              <div style={{ display: "flex", justifyContent: "center", gap: 8, margin: "14px 0 8px" }}>
                {hand.heroCards.map((c) => <PlayingCard key={c.key} card={c} size="lg" />)}
              </div>

              {hand.community.length > 0 && !(hand.terminal?.type === "showdown") && (
                <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 12 }}>
                  {hand.community.map((c) => <PlayingCard key={c.key} card={c} size="sm" />)}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "center", gap: 18, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, marginBottom: 4 }}>
                <div><span style={{ color: C.creamDim }}>Pot</span> <b style={{ color: C.cream }}>{revealDone ? `${hand.pot}bb` : "…"}</b></div>
                <div><span style={{ color: C.creamDim }}>To call</span> <b style={{ color: C.cream }}>{!revealDone ? "…" : canCheck ? "—" : `${callAmount}bb`}</b></div>
                <div><span style={{ color: C.creamDim }}>Still in</span> <b style={{ color: C.cream }}>{revealDone ? hand.activeCount : "…"}</b></div>
              </div>
              {hand.heroAllIn && (
                <div style={{ fontSize: 11, color: C.gold, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 6, letterSpacing: 1 }}>ALL IN</div>
              )}
              {!revealDone && (
                <div style={{ fontSize: 11, color: C.creamDim, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 6 }}>watching the action come to you…</div>
              )}

              {liveEquity != null && (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
                  <EquityRing equity={liveEquity} breakeven={potOdds} size={100} />
                </div>
              )}

              {awaitingDecision && (
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  <button disabled={thinking} style={actionBtnStyle(C.crimson)} onClick={() => act("fold")}>Fold</button>
                  {canCheck ? (
                    <button disabled={thinking} style={actionBtnStyle(C.sage)} onClick={() => act("check")}>Check</button>
                  ) : (
                    <button disabled={thinking} style={actionBtnStyle(C.sage)} onClick={() => act("call")}>Call</button>
                  )}
                  <button disabled={thinking} style={actionBtnStyle(C.gold, true)} onClick={() => act("raise")}>{canCheck ? "Bet" : "Raise"}</button>
                </div>
              )}

              {hand.terminal && !decision && (
                <div ref={resultRef}>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.sage, marginBottom: 12 }}>
                    Everyone folded before your turn — you win the pot uncontested.
                  </div>
                  {busted ? (
                    <div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.crimson, marginBottom: 10 }}>You've busted this session.</div>
                      <button style={primaryBtnStyle} onClick={rebuy}>Rebuy {session.buyIn}bb</button>
                    </div>
                  ) : (
                    <button style={primaryBtnStyle} onClick={dealHand}>Next Hand</button>
                  )}
                </div>
              )}

              {decision && (
                <div ref={resultRef}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                    <EquityRing equity={decision.equity} breakeven={potOdds} />
                  </div>

                  {hand.terminal?.type === "uncontested" && (
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.sage, marginBottom: 12 }}>
                      Everyone else folded — you win the pot uncontested.
                    </div>
                  )}

                  {hand.terminal?.type === "showdown" && (
                    <div style={{ marginBottom: 14 }}>
                      {hand.heroAllIn && (
                        <div style={{ fontSize: 11, color: C.gold, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8 }}>
                          You were all-in — the rest of the hand ran out automatically.
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "center", gap: 5, marginBottom: 6 }}>
                        {hand.community.map((c) => <PlayingCard key={c.key} card={c} size="sm" />)}
                      </div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.creamDim, marginBottom: 8 }}>
                        Your {hand.terminal.handName} —{" "}
                        <span style={{ color: hand.terminal.result === "win" ? C.sage : hand.terminal.result === "tie" ? C.gold : C.crimson, fontWeight: 600 }}>
                          {hand.terminal.result.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ display: "inline-block", textAlign: "left" }}>
                        {hand.terminal.oppHands.map((oh, i) => {
                          const v = hand.terminal.oppVals[i];
                          const cmp = compareTuples(v, hand.terminal.heroVal);
                          const tag = cmp > 0 ? "beats you" : cmp === 0 ? "ties you" : "loses to you";
                          const tagColor = cmp > 0 ? C.crimson : cmp === 0 ? C.gold : C.creamDim;
                          return (
                            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 8, marginBottom: 4 }}>
                              <div style={{ display: "flex", gap: 3 }}>
                                {oh.map((c) => <PlayingCard key={c.key} card={c} size="sm" />)}
                              </div>
                              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: tagColor }}>
                                {hand.terminal.oppHandNames[i]} — {tag}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{
                    display: "inline-block", padding: "4px 14px", borderRadius: 999, marginBottom: 10,
                    background: decision.correct ? "rgba(111,169,138,0.18)" : "rgba(190,75,69,0.18)",
                    border: `1px solid ${decision.correct ? C.sage : C.crimson}`,
                    color: decision.correct ? C.sage : C.crimson,
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, letterSpacing: 1,
                  }}>
                    {decision.correct ? "CORRECT" : `INCORRECT · IDEAL WAS ${ACTION_LABEL[decision.ideal].toUpperCase()}`}
                  </div>
                  <div>
                    {awaitingContinue && (
                      <button style={primaryBtnStyle} onClick={continueStreet}>
                        Continue to {STREET_LABEL[NEXT_STREET[hand.street]]}
                      </button>
                    )}
                    {hand.terminal && (
                      busted ? (
                        <div>
                          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.crimson, marginBottom: 10 }}>You've busted this session.</div>
                          <button style={primaryBtnStyle} onClick={rebuy}>Rebuy {session.buyIn}bb</button>
                        </div>
                      ) : (
                        <button style={primaryBtnStyle} onClick={dealHand}>Next Hand</button>
                      )
                    )}
                  </div>
                </div>
              )}
              {thinking && <div style={{ marginTop: 10, fontSize: 12, color: C.creamDim, fontFamily: "'IBM Plex Mono', monospace" }}>running equity…</div>}
            </>
          )}
        </div>

        <div style={{ textAlign: "center", fontSize: 11, color: C.creamDim, marginTop: 14, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.6 }}>
          Ideal action derived from Monte Carlo equity vs. pot odds — a training heuristic, not a full GTO solver.
        </div>
      </div>
    </div>
  );
}

/* ============================== small styled bits ============================== */
const panelStyle = { background: C.panel, border: `1px solid ${C.panelLine}`, borderRadius: 14, padding: 16, marginBottom: 14 };
const rowLabel = { fontSize: 11, letterSpacing: 1.5, color: C.creamDim, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8 };
const helpP = { fontSize: 13, lineHeight: 1.5, color: C.cream, margin: "0 0 10px" };

function HelpTerm({ term, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <dt style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700, color: C.gold, marginBottom: 2 }}>{term}</dt>
      <dd style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: C.creamDim }}>{children}</dd>
    </div>
  );
}

function HelpSection({ id, title, open, onToggle, children }) {
  return (
    <div style={{ marginBottom: 8, border: `1px solid ${C.panelLine}`, borderRadius: 10, overflow: "hidden" }}>
      <button
        onClick={() => onToggle(id)}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 12px", background: open ? "rgba(201,162,75,0.1)" : "transparent", border: "none",
          color: open ? C.gold : C.cream, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700,
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span>{title}</span>
        <span style={{ color: C.creamDim }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && <div style={{ padding: "10px 12px 4px" }}>{children}</div>}
    </div>
  );
}

function pillBtnStyle(active) {
  return {
    flex: 1, padding: "9px 0", borderRadius: 999, border: `1px solid ${active ? C.gold : C.panelLine}`,
    background: active ? "rgba(201,162,75,0.14)" : C.panel, color: active ? C.gold : C.creamDim,
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, letterSpacing: 0.5, cursor: "pointer",
  };
}
function chipStyle(active) {
  return {
    padding: "6px 12px", borderRadius: 8, border: `1px solid ${active ? C.gold : C.panelLine}`,
    background: active ? C.gold : "transparent", color: active ? C.ink : C.creamDim,
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, cursor: "pointer",
  };
}
const primaryBtnStyle = {
  padding: "12px 28px", borderRadius: 10, border: "none", background: C.gold, color: C.ink,
  fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 13, letterSpacing: 0.5, cursor: "pointer",
};
function actionBtnStyle(color) {
  return {
    padding: "12px 22px", borderRadius: 10, border: `1px solid ${color}`,
    background: `${color}22`, color: color, fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700, fontSize: 13, letterSpacing: 0.5, cursor: "pointer",
  };
}
function StatBig({ label, value, accent }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, fontWeight: 700, color: accent ? C.gold : C.cream }}>{value}</div>
      <div style={{ fontSize: 10, color: C.creamDim, letterSpacing: 1 }}>{label.toUpperCase()}</div>
    </div>
  );
}
function StatTable({ rows, labelFn }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
      {rows.map(([key, v]) => (
        <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px solid ${C.panelLine}` }}>
          <span style={{ color: C.creamDim }}>{labelFn ? labelFn(key) : key}</span>
          <span>{v.correct}/{v.total} <span style={{ color: C.gold }}>({Math.round((v.correct / v.total) * 100)}%)</span></span>
        </div>
      ))}
    </div>
  );
}
