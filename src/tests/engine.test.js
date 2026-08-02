import { describe, it, expect } from "vitest";
import {
  evaluate5, evaluate7, compareTuples, HAND_NAMES,
  simulatePreflopSegment, simulatePostflopSegment, blindAmount,
  runPreStreetVillains, dealNewHand, nextStreetHand, resolveHeroAction, playOutAllIn, buildHand,
  computeHeroPayout, AGGRESSION_PRESETS,
} from "../engine/poker-engine.js";

function c(str) {
  const suit = str.slice(-1);
  const rankStr = str.slice(0, -1);
  const map = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
  const rank = map[rankStr] || parseInt(rankStr, 10);
  return { rank, suit };
}
function hand(...strs) {
  return strs.map(c);
}

describe("hand evaluator — category identification", () => {
  it("straight flush", () => expect(evaluate5(hand("9S", "TS", "JS", "QS", "KS"))[0]).toBe(8));
  it("wheel straight flush (A-5)", () => expect(evaluate5(hand("AS", "2S", "3S", "4S", "5S"))[0]).toBe(8));
  it("quads", () => expect(evaluate5(hand("7S", "7H", "7D", "7C", "2S"))[0]).toBe(7));
  it("full house", () => expect(evaluate5(hand("KS", "KH", "KD", "5S", "5H"))[0]).toBe(6));
  it("flush", () => expect(evaluate5(hand("2S", "5S", "9S", "JS", "KS"))[0]).toBe(5));
  it("straight", () => expect(evaluate5(hand("4S", "5H", "6D", "7S", "8H"))[0]).toBe(4));
  it("wheel straight (A-5, no flush)", () => expect(evaluate5(hand("AS", "2H", "3D", "4S", "5H"))[0]).toBe(4));
  it("trips", () => expect(evaluate5(hand("9S", "9H", "9D", "2S", "5H"))[0]).toBe(3));
  it("two pair", () => expect(evaluate5(hand("JS", "JH", "4D", "4S", "9H"))[0]).toBe(2));
  it("one pair", () => expect(evaluate5(hand("QS", "QH", "2D", "5S", "9H"))[0]).toBe(1));
  it("high card", () => expect(evaluate5(hand("2S", "5H", "9D", "JS", "KH"))[0]).toBe(0));
});

describe("hand evaluator — comparisons", () => {
  function cmp(a, b) { return compareTuples(evaluate5(a), evaluate5(b)); }
  it("full house beats flush", () => expect(cmp(hand("KS", "KH", "KD", "5S", "5H"), hand("2S", "5S", "9S", "JS", "KS"))).toBeGreaterThan(0));
  it("straight beats trips", () => expect(cmp(hand("4S", "5H", "6D", "7S", "8H"), hand("9S", "9H", "9D", "2S", "5H"))).toBeGreaterThan(0));
  it("6-high straight beats wheel", () => expect(cmp(hand("2S", "3H", "4D", "5S", "6H"), hand("AS", "2H", "3D", "4S", "5H"))).toBeGreaterThan(0));
  it("wheel beats ace-high no pair", () => expect(cmp(hand("AS", "2H", "3D", "4S", "5H"), hand("AH", "KD", "QS", "JH", "9C"))).toBeGreaterThan(0));
  it("AA beats KK", () => expect(cmp(hand("AS", "AH", "2D", "5S", "9H"), hand("KS", "KH", "2D", "5S", "9H"))).toBeGreaterThan(0));
  it("identical hands tie", () => expect(cmp(hand("AS", "AH", "2D", "5S", "9H"), hand("AC", "AD", "2H", "5C", "9D"))).toBe(0));
});

describe("evaluate7 — best of 7", () => {
  it("picks the board straight flush regardless of hole cards", () => {
    const board = hand("9S", "TS", "JS", "QS", "KS");
    const hero = hand("2H", "3H");
    expect(evaluate7([...hero, ...board])[0]).toBe(8);
  });
});

function withRiggedRandom(sequence, fn) {
  let i = 0;
  const orig = Math.random;
  Math.random = () => (i < sequence.length ? sequence[i++] : 0.9);
  try { return fn(); } finally { Math.random = orig; }
}

describe("round engine — cross-street fold bug regression", () => {
  it("does not re-fold or double-count an already-folded seat on a later street", () => {
    const n = 6, buttonSeat = 0;
    const foldedSeats = new Set();
    let activeCount = n;

    const flopRolls = [0.9, 0.1, 0.6, 0.1, 0.6];
    const flopSeg = withRiggedRandom(flopRolls, () =>
      simulatePostflopSegment([1, 2, 3, 4, 5], 3, 0, activeCount, true)
    );
    flopSeg.log.forEach((l) => { if (l.action === "fold") foldedSeats.add((buttonSeat + l.dist) % n); });
    activeCount = flopSeg.activeCount;
    expect(activeCount).toBe(4);

    const stillIn = (d) => !foldedSeats.has((buttonSeat + d) % n);
    const turnDistances = [1, 2, 3, 4, 5].filter(stillIn);
    expect(turnDistances).toEqual([1, 3, 5]);

    const turnRolls = [0.9, 0.6, 0.6];
    const turnSeg = withRiggedRandom(turnRolls, () =>
      simulatePostflopSegment(turnDistances, flopSeg.pot, 0, activeCount, true)
    );
    expect(turnSeg.activeCount).toBe(4);
  });

  it("treats folded-to-last-player as an immediate uncontested win", () => {
    const rolls = [0.1, 0.1, 0.1];
    const seg = withRiggedRandom(rolls, () => simulatePostflopSegment([1, 2, 3], 5, 2, 4, true));
    expect(seg.activeCount).toBe(1);
  });
});

describe("round engine — full hand lifecycle (smoke test)", () => {
  it("deals a hand, resolves a call, and can advance to the next street", () => {
    const settings = { playerCount: 6, distribution: "full", position: "random", streetsMode: "full", bluffingEnabled: false, aggression: "normal", buttonStraddleEnabled: false };
    let found = false;
    for (let i = 0; i < 50 && !found; i++) {
      const h = dealNewHand(settings);
      if (h.terminal) continue;
      const updated = resolveHeroAction(h, "call", settings.streetsMode);
      if (updated.terminal) continue;
      const flop = nextStreetHand(updated);
      expect(flop.street).toBe("flop");
      expect(flop.community.length).toBe(3);
      found = true;
    }
    expect(found).toBe(true);
  });
});

describe("tendency bias (session personalities / bluffing / aggression)", () => {
  it("a strong positive foldBias raises the fold rate well above baseline", () => {
    let folds = 0;
    const trials = 400;
    const tight = () => ({ foldBias: 0.3, raiseBias: 0 });
    for (let i = 0; i < trials; i++) {
      const seg = simulatePreflopSegment([3], 1.5, 1, 2, true, tight);
      if (seg.log[0].action === "fold") folds++;
    }
    expect(folds / trials).toBeGreaterThan(0.75);
  });

  it("aggression presets order correctly: tight > normal > loose fold rate", () => {
    function foldRate(preset, trials = 400) {
      let folds = 0;
      const fn = () => ({ foldBias: preset.foldBias, raiseBias: 0 });
      for (let i = 0; i < trials; i++) {
        const seg = simulatePreflopSegment([3], 1.5, 1, 2, true, fn);
        if (seg.log[0].action === "fold") folds++;
      }
      return folds / trials;
    }
    const tight = foldRate(AGGRESSION_PRESETS.tight);
    const normal = foldRate(AGGRESSION_PRESETS.normal);
    const loose = foldRate(AGGRESSION_PRESETS.loose);
    expect(tight).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(loose);
  });
});

describe("session stack accounting (computeHeroPayout)", () => {
  // Under the progressive-deduction model, chips are deducted from the stack the moment they're
  // committed, so computeHeroPayout only returns what to credit BACK on a win/tie — not a net.
  it("splits the pot evenly across a tie", () => {
    const heroVal = [1, 14, 10];
    const hand2way = { terminal: { type: "showdown", result: "tie", heroVal, oppVals: [[1, 14, 10]] }, pot: 10 };
    const hand3way = { terminal: { type: "showdown", result: "tie", heroVal, oppVals: [[1, 14, 10], [1, 14, 10]] }, pot: 10 };
    expect(computeHeroPayout(hand2way)).toBeCloseTo(5, 5);
    expect(computeHeroPayout(hand3way)).toBeCloseTo(Math.round((10 / 3) * 10) / 10, 5);
  });

  it("pays nothing on a fold — the invested chips were already deducted as they were bet", () => {
    const h = { terminal: { type: "folded" }, pot: 12 };
    expect(computeHeroPayout(h)).toBe(0);
  });

  it("pays nothing on a showdown loss", () => {
    const h = { terminal: { type: "showdown", result: "lose" }, pot: 12 };
    expect(computeHeroPayout(h)).toBe(0);
  });

  it("pays the full pot on an uncontested win", () => {
    const h = { terminal: { type: "uncontested" }, pot: 7.5 };
    expect(computeHeroPayout(h)).toBeCloseTo(7.5, 5);
  });

  it("pays the full pot on a showdown win", () => {
    const h = { terminal: { type: "showdown", result: "win" }, pot: 9 };
    expect(computeHeroPayout(h)).toBe(9);
  });
});

describe("stack-aware betting caps (gameplay correctness)", () => {
  function facingBet(currentBet, potBefore) {
    let hand = buildHand({ n: 6, buttonSeat: 0, heroSeat: 3, heroDistance: 3, tendencyFn: null, straddled: false });
    return { ...hand, currentBet, pot: potBefore, heroInvestedStreet: 0, afterOrder: [] };
  }

  it("caps a call to the available stack and marks it all-in", () => {
    const hand = facingBet(3, 5);
    const updated = resolveHeroAction(hand, "call", "full", 2);
    expect(updated.heroInvestedStreet).toBe(2);
    expect(updated.pot).toBe(7);
    expect(updated.currentBet).toBe(3); // hero couldn't fully match it, so the price to others is unchanged
    expect(updated.heroAllIn).toBe(true);
  });

  it("treats a raise capped short of the current bet as an all-in call, not a real raise", () => {
    const hand = facingBet(3, 5);
    const updated = resolveHeroAction(hand, "raise", "full", 1.5);
    expect(updated.heroInvestedStreet).toBe(1.5);
    expect(updated.currentBet).toBe(3);
    expect(updated.heroAllIn).toBe(true);
  });

  it("still counts as a real raise if the capped commitment clears the current bet", () => {
    const hand = facingBet(1, 3);
    const updated = resolveHeroAction(hand, "raise", "full", 4);
    expect(updated.currentBet).toBe(updated.heroInvestedStreet);
    expect(updated.currentBet).toBeGreaterThan(1);
  });

  it("is uncapped by default (fresh/practice mode has no stack limit)", () => {
    const hand = facingBet(3, 5);
    const updated = resolveHeroAction(hand, "call", "full");
    expect(updated.heroInvestedStreet).toBe(3);
    expect(updated.heroAllIn).toBeFalsy();
  });
});

describe("playOutAllIn — auto-run-out once hero has no chips left", () => {
  it("always reaches a terminal state without further hero decisions, across many random hands", () => {
    const settings = { playerCount: 6, distribution: "full", position: "random", streetsMode: "full", bluffingEnabled: false, aggression: "normal", buttonStraddleEnabled: false };
    let exercised = 0;
    for (let i = 0; i < 100; i++) {
      let hand = dealNewHand(settings);
      if (hand.terminal) continue;
      const tinyStack = 0.5; // guarantees an all-in on almost any call/raise
      const action = hand.currentBet > hand.heroInvestedStreet ? "call" : "raise";
      let updated = resolveHeroAction(hand, action, settings.streetsMode, tinyStack);
      if (!updated.heroAllIn || updated.terminal) continue;
      const played = playOutAllIn(updated, settings.streetsMode);
      expect(played.terminal).toBeTruthy();
      expect(played.heroAllIn).toBe(true);
      exercised++;
    }
    expect(exercised).toBeGreaterThan(0);
  });

  it("never commits more chips once all-in is reached (rest of the hand costs hero nothing further)", () => {
    let hand = buildHand({ n: 6, buttonSeat: 0, heroSeat: 3, heroDistance: 3, tendencyFn: null, straddled: false });
    hand = { ...hand, currentBet: 3, pot: 5, heroInvestedStreet: 0, afterOrder: [] };
    const capped = resolveHeroAction(hand, "call", "full", 2);
    expect(capped.heroAllIn).toBe(true);
    const investedAtAllIn = capped.heroTotalInvested;
    const played = capped.terminal ? capped : playOutAllIn(capped, "full");
    // heroTotalInvested is only ever updated by resolveHeroAction (hero's own actions), and
    // playOutAllIn never calls it — so it must be unchanged after the auto-run-out.
    expect(played.heroTotalInvested).toBe(investedAtAllIn);
  });
});

describe("heads-up blinds (bug regression)", () => {
  it("BB posts a full BB in heads-up, not a small blind", () => {
    expect(blindAmount(2, 1)).toBe(1);
  });
  it("BTN/SB posts a small blind in heads-up (the button IS the small blind)", () => {
    expect(blindAmount(2, 0)).toBe(0.5);
  });
  it("3+-handed mapping is unaffected: BTN posts nothing, SB=dist1, BB=dist2", () => {
    expect(blindAmount(6, 0)).toBe(0);
    expect(blindAmount(6, 1)).toBe(0.5);
    expect(blindAmount(6, 2)).toBe(1);
  });
  it("a heads-up hand dealt as BB has heroInvestedStreet of a full BB", () => {
    const hand = buildHand({ n: 2, buttonSeat: 0, heroSeat: 1, heroDistance: 1, tendencyFn: null, straddled: false });
    expect(hand.heroInvestedStreet).toBe(1);
  });
  it("a heads-up hand dealt as BTN/SB has heroInvestedStreet of a small blind, and only owes 0.5 to complete", () => {
    const hand = buildHand({ n: 2, buttonSeat: 0, heroSeat: 0, heroDistance: 0, tendencyFn: null, straddled: false });
    expect(hand.heroInvestedStreet).toBe(0.5);
    expect(hand.pot).toBe(1.5);
    const callAmount = Math.max(0, Math.round((hand.currentBet - hand.heroInvestedStreet) * 10) / 10);
    expect(callAmount).toBe(0.5);
  });
});
