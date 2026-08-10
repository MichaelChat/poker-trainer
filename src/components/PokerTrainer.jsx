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
.portrait-lock-overlay { display: none; }
@media (orientation: landscape) and (hover: none) and (pointer: coarse) {
  .portrait-lock-overlay { display: flex !important; }
}
.kbd-hint { display: inline-block; }
.kbd-hint-desktop { display: block; }
@media (max-width: 640px), (hover: none) and (pointer: coarse) {
  .kbd-hint, .kbd-hint-desktop { display: none !important; }
}
.desktop-action-bar { display: none; }
@media (hover: hover) and (pointer: fine) {
  .desktop-action-bar { display: flex !important; }
  .inline-action-area { display: none !important; }
  .app-shell { padding-bottom: 110px !important; }
}
@keyframes confetti-fall {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(115vh) rotate(360deg); opacity: 0.85; }
}
@keyframes celebration-banner {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
  12% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
}
`;


import {
  RANK_CHAR, SUIT_CHAR, RED_SUITS,
  simulateEquity, dealShowdown, HAND_NAMES, compareTuples, idealAction,
  POSITION_TABLE, ACTION_LABEL, STREET_LABEL, NEXT_STREET,
  pickPlayerCount, makeTendencyFn, dealNewHand, dealSessionHand,
  nextStreetHand, resolveHeroAction, playOutAllIn, computeHeroPayout, DEFAULT_EQUITY_TRIALS, EQUITY_TRIAL_OPTIONS,
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
        borderWidth: 1.5, borderColor: isButton ? C.crimson : C.panelLine,
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

function WinCelebration({ pieces }) {
  if (!pieces) return null;
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 600 }}>
      <div style={{
        position: "absolute", top: "22%", left: "50%", transform: "translate(-50%, -50%)",
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 700, letterSpacing: 1.5,
        color: C.gold, background: "rgba(10,38,32,0.85)", border: `1px solid ${C.gold}`,
        borderRadius: 999, padding: "8px 20px", whiteSpace: "nowrap",
        animation: "celebration-banner 2.6s ease-out forwards",
      }}>
        YOU WIN
      </div>
      {pieces.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute", left: `${p.left}%`, top: "-10%",
            width: p.kind === "chip" ? 22 : 12, height: p.kind === "chip" ? 22 : 12,
            borderRadius: p.kind === "chip" ? "50%" : 2,
            background: p.kind === "chip" ? C.feltDarker : p.color,
            border: p.kind === "chip" ? `3px dashed ${p.color}` : "none",
            transform: `rotate(${p.rotate}deg)`,
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}



/* ============================== MAIN APP =============================== */
const DEFAULT_SETTINGS = {
  playerCount: "random", distribution: "full", position: "random", streetsMode: "preflop",
  equityMode: "hidden", tableMode: "fresh", bluffingEnabled: false, aggression: "normal",
  buttonStraddleEnabled: false, animationsEnabled: false, keyboardHintsEnabled: true,
  celebrationsEnabled: false, equityTrials: DEFAULT_EQUITY_TRIALS,
};

export default function PokerTrainer() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [session, setSession] = useState(null); // {n, buttonSeat, heroSeat, tendencies, heroStack, handsPlayed, buyIn}
  const [showSettings, setShowSettings] = useState(true);
  const [showStats, setShowStats] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [openSettingsSections, setOpenSettingsSections] = useState(new Set(["game"]));
  const toggleSettingsSection = useCallback((id) => {
    setOpenSettingsSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
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

  const [showBackToTop, setShowBackToTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const backToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const [hand, setHand] = useState(null);
  const [decision, setDecision] = useState(null); // {action, equity, ideal, correct}
  const [thinking, setThinking] = useState(false);
  const [revealCount, setRevealCount] = useState(0); // how many of hand.beforeLog entries are "shown" so far
  const [celebration, setCelebration] = useState(null); // { id, pieces } or null
  const celebrationIdRef = useRef(0);
  const revealTimerRef = useRef(null);
  const tableTopRef = useRef(null);
  const resultRef = useRef(null);
  const actionBarRef = useRef(null);

  const scrollIntoViewIfNeeded = useCallback((el) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // The fixed desktop action bar covers a strip at the bottom of the viewport — if it's
    // showing, treat that strip as off-screen too, or we'd wrongly think content peeking out
    // just above it is "already visible" and skip a scroll that's actually needed.
    const bar = actionBarRef.current;
    const barVisible = bar && getComputedStyle(bar).display !== "none";
    const viewportBottom = barVisible ? bar.getBoundingClientRect().top : window.innerHeight;
    const fullyVisible = rect.top >= 0 && rect.bottom <= viewportBottom;
    if (fullyVisible) return; // already on screen — don't yank the page (and the buttons out from under the cursor)
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const scrollToTop = useCallback(() => {
    requestAnimationFrame(() => {
      scrollIntoViewIfNeeded(tableTopRef.current);
    });
  }, [scrollIntoViewIfNeeded]);

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
      return simulateEquity(hand.heroCards, hand.activeCount - 1, hand.community, settings.equityTrials);
    } catch (err) {
      console.error("Error computing live equity:", err);
      return null;
    }
  }, [hand, decision, settings.equityMode, revealCount, settings.equityTrials]);

  const [stats, setStats] = useState({
    total: 0, correct: 0,
    byPosition: {}, byPlayerCount: {}, byStreet: {}, byCombo: {},
    actionCounts: { fold: 0, call: 0, check: 0, raise: 0 },
    luckiest: null, // underdog win despite a mistake
    unluckiest: null, // clear favorite that still lost
    history: [],
  });
  const [presets, setPresets] = useState([]); // [{ id, name, settings, savedAt }]

  const { user } = useAuth();
  const [persistenceLoaded, setPersistenceLoaded] = useState(false);

  // Load persisted settings/stats/presets once, and again whenever the signed-in user changes
  // (guest -> signed in, switching accounts, or signing out).
  useEffect(() => {
    let cancelled = false;
    setPersistenceLoaded(false);
    loadState(user)
      .then((saved) => {
        if (cancelled) return;
        if (saved?.settings) setSettings((s) => ({ ...s, ...saved.settings }));
        if (saved?.stats) setStats((s) => ({ ...s, ...saved.stats }));
        if (saved?.presets) setPresets(saved.presets);
      })
      .catch(() => { /* no saved state yet, or offline — start fresh */ })
      .finally(() => { if (!cancelled) setPersistenceLoaded(true); });
    return () => { cancelled = true; };
  }, [user]);

  // Persist settings/stats/presets independently, each only when that specific slice changes.
  // Deliberately NOT one combined effect — if a tab only touched settings, it should only ever
  // write {settings}, not also re-send its own possibly-stale copy of stats/presets and stomp
  // changes another tab or device made to those in the meantime. Skipped until the initial load
  // finishes, so we don't clobber existing cloud/local data with transient default state.
  useEffect(() => {
    if (!persistenceLoaded) return;
    const id = setTimeout(() => { saveState(user, { settings }); }, 600);
    return () => clearTimeout(id);
  }, [settings, user, persistenceLoaded]);

  useEffect(() => {
    if (!persistenceLoaded) return;
    const id = setTimeout(() => { saveState(user, { stats }); }, 600);
    return () => clearTimeout(id);
  }, [stats, user, persistenceLoaded]);

  useEffect(() => {
    if (!persistenceLoaded) return;
    const id = setTimeout(() => { saveState(user, { presets }); }, 600);
    return () => clearTimeout(id);
  }, [presets, user, persistenceLoaded]);

  const [presetNameInput, setPresetNameInput] = useState("");
  const [editingPresetId, setEditingPresetId] = useState(null);
  const [editingPresetName, setEditingPresetName] = useState("");
  const [confirmDeletePresetId, setConfirmDeletePresetId] = useState(null);
  const confirmDeleteTimerRef = useRef(null);
  const [confirmOverwritePreset, setConfirmOverwritePreset] = useState(false);
  const confirmOverwriteTimerRef = useRef(null);
  const presetIdRef = useRef(0);

  const existingPresetForInput = useMemo(() => {
    const name = presetNameInput.trim().toLowerCase();
    if (!name) return null;
    return presets.find((p) => p.name.toLowerCase() === name) || null;
  }, [presetNameInput, presets]);

  const setPresetNameInputChecked = useCallback((value) => {
    setPresetNameInput(value);
    // The armed "tap again to overwrite" state applies to one specific name — if the person
    // edits the name after arming it, disarm rather than let a stale confirmation apply to
    // whatever they've typed now.
    if (confirmOverwriteTimerRef.current) clearTimeout(confirmOverwriteTimerRef.current);
    setConfirmOverwritePreset(false);
  }, []);

  const savePreset = useCallback(() => {
    const name = presetNameInput.trim();
    if (!name) return;
    const existing = presets.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing && !confirmOverwritePreset) {
      // Name collides with a saved favorite — arm a confirmation instead of overwriting outright.
      if (confirmOverwriteTimerRef.current) clearTimeout(confirmOverwriteTimerRef.current);
      setConfirmOverwritePreset(true);
      confirmOverwriteTimerRef.current = setTimeout(() => setConfirmOverwritePreset(false), 3000);
      return;
    }
    if (confirmOverwriteTimerRef.current) clearTimeout(confirmOverwriteTimerRef.current);
    setConfirmOverwritePreset(false);
    const snapshot = { ...settings };
    setPresets((prev) => (
      existing
        ? prev.map((p) => (p.id === existing.id ? { ...p, settings: snapshot, savedAt: Date.now() } : p))
        : (() => { presetIdRef.current += 1; return [...prev, { id: `p${Date.now()}_${presetIdRef.current}`, name, settings: snapshot, savedAt: Date.now() }]; })()
    ));
    setPresetNameInput("");
  }, [presetNameInput, presets, settings, confirmOverwritePreset]);

  const loadPreset = useCallback((preset) => {
    if (session) setSession(null); // a loaded preset may change table size/mode — don't leave a stale session running
    setSettings((s) => ({ ...s, ...preset.settings }));
  }, [session]);

  const startRenamePreset = useCallback((preset) => {
    setEditingPresetId(preset.id);
    setEditingPresetName(preset.name);
  }, []);

  const commitRenamePreset = useCallback(() => {
    const name = editingPresetName.trim();
    setPresets((prev) => (name ? prev.map((p) => (p.id === editingPresetId ? { ...p, name } : p)) : prev));
    setEditingPresetId(null);
    setEditingPresetName("");
  }, [editingPresetId, editingPresetName]);

  const cancelRenamePreset = useCallback(() => {
    setEditingPresetId(null);
    setEditingPresetName("");
  }, []);

  const requestDeletePreset = useCallback((id) => {
    if (confirmDeleteTimerRef.current) clearTimeout(confirmDeleteTimerRef.current);
    if (confirmDeletePresetId === id) {
      setPresets((prev) => prev.filter((p) => p.id !== id));
      setConfirmDeletePresetId(null);
      return;
    }
    setConfirmDeletePresetId(id);
    confirmDeleteTimerRef.current = setTimeout(() => setConfirmDeletePresetId(null), 3000);
  }, [confirmDeletePresetId]);

  const [confirmResetSettings, setConfirmResetSettings] = useState(false);
  const confirmResetTimerRef = useRef(null);

  const requestResetSettings = useCallback(() => {
    if (confirmResetTimerRef.current) clearTimeout(confirmResetTimerRef.current);
    if (confirmResetSettings) {
      if (session) setSession(null); // defaults may change table size/mode — don't leave a stale session running
      setSettings({ ...DEFAULT_SETTINGS });
      setConfirmResetSettings(false);
      return;
    }
    setConfirmResetSettings(true);
    confirmResetTimerRef.current = setTimeout(() => setConfirmResetSettings(false), 3000);
  }, [confirmResetSettings, session]);

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
          : simulateEquity(hand.heroCards, numOpponents, hand.community, settings.equityTrials);
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
  }, [hand, thinking, recordStats, settings.streetsMode, settings.equityMode, settings.equityTrials, liveEquity, session]);

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
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;

      const key = e.key.toLowerCase();

      if (key === "?") { e.preventDefault(); setShowHelp((v) => !v); return; }

      if (awaitingDecision && !thinking) {
        if (key === "f") { e.preventDefault(); act("fold"); return; }
        if (key === "c") { e.preventDefault(); act(canCheck ? "check" : "call"); return; }
        if (key === "r" || key === "b") { e.preventDefault(); act("raise"); return; }
      }

      if (key === " " || key === "enter") {
        // Always swallow the key so it can't fall through to the browser's default
        // "activate the focused button" behavior (e.g. re-toggling the Settings/Stats/
        // Help/History tabs if one of them still has focus from an earlier click).
        e.preventDefault();
        if (tag === "BUTTON") e.target.blur();

        if (awaitingContinue) { continueStreet(); return; }
        if (hand?.terminal) { // covers both "Next Hand" (decision set) and uncontested win (no decision)
          if (busted) rebuy(); else dealHand();
          return;
        }
        if (!hand) {
          if (settings.tableMode === "session" && !session) startSession(); else dealHand();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [awaitingDecision, awaitingContinue, thinking, canCheck, act, continueStreet, hand, decision, busted, rebuy, dealHand, session, settings.tableMode, startSession]);

  useEffect(() => {
    if (decision || hand?.terminal) {
      requestAnimationFrame(() => {
        scrollIntoViewIfNeeded(resultRef.current);
      });
    }
  }, [decision, hand?.terminal, scrollIntoViewIfNeeded]);

  useEffect(() => {
    if (!settings.celebrationsEnabled || !hand?.terminal) return;
    const t = hand.terminal;
    const won = t.type === "uncontested" || (t.type === "showdown" && t.result === "win");
    if (!won) return;
    const colors = [C.gold, C.crimson, C.sage, C.cream];
    const pieces = Array.from({ length: 42 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 2.6 + Math.random() * 1.4,
      rotate: Math.random() * 360,
      kind: Math.random() < 0.4 ? "chip" : "confetti",
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    celebrationIdRef.current += 1;
    // Each celebration gets a fresh id so <WinCelebration> fully remounts every time — if two
    // wins land back-to-back, reusing the same DOM nodes (matched by key) means the browser
    // just patches the "animation" style on already-finished elements instead of restarting
    // it, which can silently no-op. A remount always gets brand-new elements.
    setCelebration({ id: celebrationIdRef.current, pieces });
    const timer = setTimeout(() => setCelebration(null), 4200);
    return () => { clearTimeout(timer); setCelebration(null); };
  }, [hand, settings.celebrationsEnabled]);
  const advancedOpen = openSettingsSections.has("advanced") || !!session;

  useEffect(() => {
    const orientation = typeof screen !== "undefined" ? screen.orientation : null;
    if (orientation && typeof orientation.lock === "function") {
      orientation.lock("portrait").catch(() => {
        // Expected to fail in a plain browser tab — locking is only permitted in installed/
        // fullscreen PWA contexts. The CSS rotate-prompt overlay is the real fallback, and the
        // web app manifest's "orientation": "portrait" covers the installed-PWA case properly.
      });
    }
  }, []);

  return (
    <div className="app-shell" style={{
      minHeight: "100vh", background: `radial-gradient(ellipse at 50% -10%, ${C.felt}, ${C.feltDarker} 60%)`,
      fontFamily: "'Fraunces', serif", color: C.cream, padding: "20px 14px 60px",
    }}>
      <style>{fontImport}</style>

      <WinCelebration key={celebration?.id} pieces={celebration?.pieces} />

      <div className="portrait-lock-overlay" style={{
        display: "none", position: "fixed", inset: 0, background: C.feltDarker, zIndex: 9999,
        flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center",
      }}>
        <div style={{ fontSize: 36, marginBottom: 14 }}>⟲</div>
        <div style={{ color: C.gold, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 13, letterSpacing: 1, marginBottom: 8 }}>
          ROTATE YOUR DEVICE
        </div>
        <div style={{ color: C.creamDim, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, maxWidth: 260, lineHeight: 1.5 }}>
          This trainer is designed for portrait mode.
        </div>
      </div>

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
            <HelpSection id="favorites" title="Favorite Settings" open={openSettingsSections.has("favorites")} onToggle={toggleSettingsSection}>
              <div style={rowLabel}>Save current settings</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input
                  value={presetNameInput}
                  onChange={(e) => setPresetNameInputChecked(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") savePreset(); }}
                  placeholder="Name this setup…"
                  style={{
                    flex: 1, minWidth: 0, padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.panelLine}`,
                    background: C.feltDarker, color: C.cream, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
                  }}
                />
                <button
                  style={{
                    ...pillBtnStyle(confirmOverwritePreset), flex: "0 0 auto", padding: "9px 16px",
                    color: confirmOverwritePreset ? C.gold : C.creamDim,
                    borderColor: confirmOverwritePreset ? C.gold : C.panelLine,
                  }}
                  onClick={savePreset}
                  disabled={!presetNameInput.trim()}
                >
                  {confirmOverwritePreset ? "Tap again to overwrite" : "Save"}
                </button>
              </div>
              {existingPresetForInput && !confirmOverwritePreset && (
                <div style={{ fontSize: 11, color: C.gold, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8 }}>
                  A favorite named "{existingPresetForInput.name}" already exists — saving will overwrite it.
                </div>
              )}
              {presets.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {presets.map((p) => (
                    <div key={p.id} style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "8px 0",
                      borderBottom: `1px solid ${C.panelLine}`,
                    }}>
                      {editingPresetId === p.id ? (
                        <input
                          autoFocus
                          value={editingPresetName}
                          onChange={(e) => setEditingPresetName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") commitRenamePreset(); if (e.key === "Escape") cancelRenamePreset(); }}
                          onBlur={commitRenamePreset}
                          style={{
                            flex: 1, minWidth: 0, padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.gold}`,
                            background: C.feltDarker, color: C.cream, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
                          }}
                        />
                      ) : (
                        <span
                          onClick={() => startRenamePreset(p)}
                          title="Click to rename"
                          style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, cursor: "pointer" }}
                        >
                          {p.name}
                        </span>
                      )}
                      <button style={{ ...pillBtnStyle(false), flex: "0 0 auto", padding: "6px 12px", fontSize: 11 }} onClick={() => loadPreset(p)}>Load</button>
                      <button
                        style={{
                          ...pillBtnStyle(confirmDeletePresetId === p.id), flex: "0 0 auto", padding: "6px 12px", fontSize: 11,
                          color: confirmDeletePresetId === p.id ? C.crimson : C.creamDim,
                          borderColor: confirmDeletePresetId === p.id ? C.crimson : C.panelLine,
                        }}
                        onClick={() => requestDeletePreset(p.id)}
                      >
                        {confirmDeletePresetId === p.id ? "Confirm?" : "Delete"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {presets.length === 0 && (
                <div style={{ fontSize: 11, color: C.creamDim, fontFamily: "'IBM Plex Mono', monospace", marginTop: 10, lineHeight: 1.5 }}>
                  Save your current settings below to quickly switch between setups later — e.g. "Preflop 6-max" or "Full hand vs loose table".
                </div>
              )}
            </HelpSection>

            <HelpSection id="game" title="Game" open={openSettingsSections.has("game")} onToggle={toggleSettingsSection}>
              {session ? (
                <div style={{ fontSize: 12, color: C.creamDim, fontFamily: "'IBM Plex Mono', monospace" }}>
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
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <button style={chipStyle(settings.position === "random")} onClick={() => setSettings((s) => ({ ...s, position: "random" }))}>Random</button>
                    {positionOptions ? positionOptions.map((p) => (
                      <button key={p} style={chipStyle(settings.position === p)} onClick={() => setSettings((s) => ({ ...s, position: p }))}>{p}</button>
                    )) : (
                      <span style={{ fontSize: 12, color: C.creamDim, fontFamily: "'IBM Plex Mono', monospace" }}>Fix a player count to lock a position</span>
                    )}
                  </div>
                </>
              )}
            </HelpSection>

            <HelpSection id="training" title="Training" open={openSettingsSections.has("training")} onToggle={toggleSettingsSection}>
              <div style={rowLabel}>Streets</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                <button style={chipStyle(settings.streetsMode === "preflop")} onClick={() => setSettings((s) => ({ ...s, streetsMode: "preflop" }))}>Preflop only</button>
                <button style={chipStyle(settings.streetsMode === "full")} onClick={() => setSettings((s) => ({ ...s, streetsMode: "full" }))}>Full hand (flop → river)</button>
              </div>
              <div style={rowLabel}>Equity display</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button style={chipStyle(settings.equityMode === "hidden")} onClick={() => setSettings((s) => ({ ...s, equityMode: "hidden" }))}>Hidden until after (harder)</button>
                <button style={chipStyle(settings.equityMode === "live")} onClick={() => setSettings((s) => ({ ...s, equityMode: "live" }))}>Live while deciding (easier)</button>
              </div>
            </HelpSection>

            <HelpSection id="opponents" title="Opponents" open={openSettingsSections.has("opponents")} onToggle={toggleSettingsSection}>
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button style={chipStyle(!settings.buttonStraddleEnabled)} onClick={() => setSettings((s) => ({ ...s, buttonStraddleEnabled: false }))}>Off</button>
                <button style={chipStyle(settings.buttonStraddleEnabled)} onClick={() => setSettings((s) => ({ ...s, buttonStraddleEnabled: true }))}>On (villains only)</button>
              </div>
            </HelpSection>

            <HelpSection id="audioVisual" title="Audio & Visual" open={openSettingsSections.has("audioVisual")} onToggle={toggleSettingsSection}>
              <div style={rowLabel}>Villain action animation</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                <button style={chipStyle(!settings.animationsEnabled)} onClick={() => setSettings((s) => ({ ...s, animationsEnabled: false }))}>Off</button>
                <button style={chipStyle(settings.animationsEnabled)} onClick={() => setSettings((s) => ({ ...s, animationsEnabled: true }))}>On (watch actions play out)</button>
              </div>
              <div style={rowLabel}>Keyboard shortcut hints (desktop only)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                <button style={chipStyle(!settings.keyboardHintsEnabled)} onClick={() => setSettings((s) => ({ ...s, keyboardHintsEnabled: false }))}>Off</button>
                <button style={chipStyle(settings.keyboardHintsEnabled)} onClick={() => setSettings((s) => ({ ...s, keyboardHintsEnabled: true }))}>On (shows F/C/R, Space, ?)</button>
              </div>
              <div style={rowLabel}>Win celebration</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button style={chipStyle(!settings.celebrationsEnabled)} onClick={() => setSettings((s) => ({ ...s, celebrationsEnabled: false }))}>Off</button>
                <button style={chipStyle(settings.celebrationsEnabled)} onClick={() => setSettings((s) => ({ ...s, celebrationsEnabled: true }))}>On (confetti &amp; chips)</button>
              </div>
            </HelpSection>

            <HelpSection id="advanced" title="Advanced" open={advancedOpen} onToggle={toggleSettingsSection}>
              <div style={rowLabel}>Table mode</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                <button
                  style={chipStyle(settings.tableMode === "fresh")}
                  onClick={() => { setSettings((s) => ({ ...s, tableMode: "fresh" })); if (session) endSession(); }}
                >
                  Fresh table
                </button>
                <button style={chipStyle(settings.tableMode === "session")} onClick={() => setSettings((s) => ({ ...s, tableMode: "session" }))}>
                  Session mode
                </button>
              </div>
              {settings.tableMode === "session" && (
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                  {!session ? (
                    <div style={{ color: C.creamDim, lineHeight: 1.5 }}>
                      Locks your table size, gives opponents fixed personalities, and tracks a {BUY_IN}bb
                      stack. Start it from the table below.
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ color: C.creamDim }}>{session.n}-handed · hand #{session.handsPlayed + 1}</span>
                        <span style={{ color: C.gold, fontWeight: 700 }}>{session.heroStack}bb</span>
                      </div>
                      <button style={{ ...pillBtnStyle(false), width: "100%" }} onClick={endSession}>End Session</button>
                    </>
                  )}
                </div>
              )}
              <div style={{ ...rowLabel, marginTop: 12 }}>Monte Carlo iterations</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                {EQUITY_TRIAL_OPTIONS.map((n) => (
                  <button key={n} style={chipStyle(settings.equityTrials === n)} onClick={() => setSettings((s) => ({ ...s, equityTrials: n }))}>
                    {n.toLocaleString()}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.creamDim, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.5 }}>
                How many random hands each equity calculation samples. Lower is faster but noisier —
                useful on a weaker device or when debugging. Higher is more statistically stable but
                slower. Default 2,000.
              </div>
            </HelpSection>

            <button
              style={{
                ...pillBtnStyle(confirmResetSettings), width: "100%", marginTop: 4,
                color: confirmResetSettings ? C.crimson : C.creamDim,
                borderColor: confirmResetSettings ? C.crimson : C.panelLine,
              }}
              onClick={requestResetSettings}
            >
              {confirmResetSettings ? "Tap again to confirm reset" : "Reset settings to default"}
            </button>

            {/* "UI" category reserved for future layout/display preferences (e.g. compact mode,
                card back style, font size) — add a HelpSection id="ui" here once one exists. */}
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
              <p style={helpP}>
                Keyboard shortcuts: <b>F</b> fold, <b>C</b> check/call, <b>R</b> bet/raise, <b>Space</b> or{" "}
                <b>Enter</b> to deal/continue/next hand, <b>?</b> to toggle this help panel. These always
                work on a physical keyboard. On desktop, the on-button hints showing each key can be
                turned off under Settings → Audio &amp; Visual; they don't appear on mobile.
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
                <HelpTerm term="Session mode (Advanced)">
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
                <HelpTerm term="Favorite Settings">
                  Save your current settings under a name to switch between setups instantly later —
                  e.g. "Preflop 6-max" or "Full hand vs loose table". Saving under a name that already
                  exists warns you and asks for a second tap before it overwrites that favorite, rather
                  than creating a duplicate silently. Click a favorite's name to rename it, Load to apply
                  it, or Delete (tap twice to confirm) to remove it. Favorites sync the same way as your
                  other settings — to this device when signed out, to your account when signed in.
                </HelpTerm>
                <HelpTerm term="Advanced">
                  Table mode/Session mode and Monte Carlo iterations live under "Advanced" since
                  they're more setup-and-forget than something you'd tweak every hand. It opens
                  automatically while a session is active.
                </HelpTerm>
                <HelpTerm term="Monte Carlo iterations (Advanced)">
                  How many random hands each equity calculation samples — more iterations means a more
                  statistically stable percentage but a slower calculation. Default 2,000. Turn it down
                  on a slower device, or when debugging and you want faster feedback over precision.
                </HelpTerm>
                <HelpTerm term="Reset settings to default">
                  Puts every setting back to its starting value — this only affects settings, not your
                  stats, hand history, or Favorite Settings. Tap once to arm it, tap again within a few
                  seconds to confirm.
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
                  <div style={{ color: C.creamDim, fontSize: 14, marginBottom: 16 }}>Session mode locks your table and stack.</div>
                  <button className="inline-action-area" style={primaryBtnStyle} onClick={startSession}>Start Session</button>
                </>
              ) : (
                <>
                  <div style={{ color: C.creamDim, fontSize: 14, marginBottom: 16 }}>Deal a hand to begin training.</div>
                  <button className="inline-action-area" style={primaryBtnStyle} onClick={dealHand}>Deal Hand <KeyCap k="Space" light show={settings.keyboardHintsEnabled} /></button>
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
                <>
                  <div className="inline-action-area" style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                    <button disabled={thinking} style={actionBtnStyle(C.crimson)} onClick={() => act("fold")}>Fold <KeyCap k="F" show={settings.keyboardHintsEnabled} /></button>
                    {canCheck ? (
                      <button disabled={thinking} style={actionBtnStyle(C.sage)} onClick={() => act("check")}>Check <KeyCap k="C" show={settings.keyboardHintsEnabled} /></button>
                    ) : (
                      <button disabled={thinking} style={actionBtnStyle(C.sage)} onClick={() => act("call")}>Call <KeyCap k="C" show={settings.keyboardHintsEnabled} /></button>
                    )}
                    <button disabled={thinking} style={actionBtnStyle(C.gold, true)} onClick={() => act("raise")}>{canCheck ? "Bet" : "Raise"} <KeyCap k="R" show={settings.keyboardHintsEnabled} /></button>
                  </div>
                  {settings.keyboardHintsEnabled && (
                    <div className="inline-action-area kbd-hint-desktop" style={{ fontSize: 10, color: C.creamDim, fontFamily: "'IBM Plex Mono', monospace", marginTop: 8 }}>
                      keyboard: F fold · C check/call · R raise
                    </div>
                  )}
                </>
              )}

              {hand.terminal && !decision && (
                <div ref={resultRef}>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.sage, marginBottom: 12 }}>
                    Everyone folded before your turn — you win the pot uncontested.
                  </div>
                  {busted ? (
                    <div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.crimson, marginBottom: 10 }}>You've busted this session.</div>
                      <button className="inline-action-area" style={primaryBtnStyle} onClick={rebuy}>Rebuy {session.buyIn}bb <KeyCap k="Space" light show={settings.keyboardHintsEnabled} /></button>
                    </div>
                  ) : (
                    <button className="inline-action-area" style={primaryBtnStyle} onClick={dealHand}>Next Hand <KeyCap k="Space" light show={settings.keyboardHintsEnabled} /></button>
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
                  <div className="inline-action-area">
                    {awaitingContinue && (
                      <button style={primaryBtnStyle} onClick={continueStreet}>
                        Continue to {STREET_LABEL[NEXT_STREET[hand.street]]} <KeyCap k="Space" light show={settings.keyboardHintsEnabled} />
                      </button>
                    )}
                    {hand.terminal && (
                      busted ? (
                        <div>
                          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.crimson, marginBottom: 10 }}>You've busted this session.</div>
                          <button style={primaryBtnStyle} onClick={rebuy}>Rebuy {session.buyIn}bb <KeyCap k="Space" light show={settings.keyboardHintsEnabled} /></button>
                        </div>
                      ) : (
                        <button style={primaryBtnStyle} onClick={dealHand}>Next Hand <KeyCap k="Space" light show={settings.keyboardHintsEnabled} /></button>
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

      <div ref={actionBarRef} className="desktop-action-bar" style={{
        position: "fixed", left: "50%", bottom: 18, transform: "translateX(-50%)",
        width: "min(480px, calc(100vw - 32px))", background: C.panel, border: `1px solid ${C.panelLine}`,
        borderRadius: 14, padding: "14px 16px", boxShadow: "0 8px 24px rgba(0,0,0,0.45)", zIndex: 450,
        alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap",
      }}>
        {awaitingDecision ? (
          <>
            <button disabled={thinking} style={actionBtnStyle(C.crimson)} onClick={() => act("fold")}>Fold <KeyCap k="F" show={settings.keyboardHintsEnabled} /></button>
            {canCheck ? (
              <button disabled={thinking} style={actionBtnStyle(C.sage)} onClick={() => act("check")}>Check <KeyCap k="C" show={settings.keyboardHintsEnabled} /></button>
            ) : (
              <button disabled={thinking} style={actionBtnStyle(C.sage)} onClick={() => act("call")}>Call <KeyCap k="C" show={settings.keyboardHintsEnabled} /></button>
            )}
            <button disabled={thinking} style={actionBtnStyle(C.gold, true)} onClick={() => act("raise")}>{canCheck ? "Bet" : "Raise"} <KeyCap k="R" show={settings.keyboardHintsEnabled} /></button>
          </>
        ) : awaitingContinue ? (
          <button style={primaryBtnStyle} onClick={continueStreet}>
            Continue to {STREET_LABEL[NEXT_STREET[hand.street]]} <KeyCap k="Space" light show={settings.keyboardHintsEnabled} />
          </button>
        ) : hand?.terminal ? (
          busted ? (
            <button style={primaryBtnStyle} onClick={rebuy}>Rebuy {session.buyIn}bb <KeyCap k="Space" light show={settings.keyboardHintsEnabled} /></button>
          ) : (
            <button style={primaryBtnStyle} onClick={dealHand}>Next Hand <KeyCap k="Space" light show={settings.keyboardHintsEnabled} /></button>
          )
        ) : !hand ? (
          settings.tableMode === "session" && !session ? (
            <button style={primaryBtnStyle} onClick={startSession}>Start Session</button>
          ) : (
            <button style={primaryBtnStyle} onClick={dealHand}>Deal Hand <KeyCap k="Space" light show={settings.keyboardHintsEnabled} /></button>
          )
        ) : thinking ? (
          <span style={{ fontSize: 12, color: C.creamDim, fontFamily: "'IBM Plex Mono', monospace" }}>running equity…</span>
        ) : null}
      </div>

      {showBackToTop && (
        <button
          onClick={backToTop}
          aria-label="Back to top"
          style={{
            position: "fixed", right: 18, bottom: 18, width: 44, height: 44, borderRadius: "50%",
            background: C.gold, color: C.ink, border: "none", fontSize: 18, fontWeight: 700,
            boxShadow: "0 3px 10px rgba(0,0,0,0.4)", cursor: "pointer", zIndex: 500,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          ↑
        </button>
      )}
    </div>
  );
}

/* ============================== small styled bits ============================== */
const panelStyle = { background: C.panel, border: `1px solid ${C.panelLine}`, borderRadius: 14, padding: 16, marginBottom: 14 };
const rowLabel = { fontSize: 11, letterSpacing: 1.5, color: C.creamDim, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8 };
const helpP = { fontSize: 13, lineHeight: 1.5, color: C.cream, margin: "0 0 10px" };

function KeyCap({ k, light = false, show = true }) {
  if (!show) return null;
  return (
    <span className="kbd-hint" style={{
      marginLeft: 6, padding: "1px 5px", borderRadius: 4,
      fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700,
      border: `1px solid ${light ? "rgba(13,18,16,0.35)" : "currentColor"}`,
      opacity: 0.75, verticalAlign: 1,
    }}>
      {k}
    </span>
  );
}

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
