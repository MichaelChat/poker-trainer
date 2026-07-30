import { describe, it, expect } from "vitest";
import {
  evaluate5, evaluate7, compareTuples, HAND_NAMES,
  simulatePreflopSegment, simulatePostflopSegment,
  runPreStreetVillains, dealNewHand, nextStreetHand, resolveHeroAction,
  computeHeroNet, AGGRESSION_PRESETS,
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

describe("session stack accounting (computeHeroNet)", () => {
  it("splits the pot evenly across a tie", () => {
    const heroVal = [1, 14, 10];
    const hand2way = { terminal: { type: "showdown", result: "tie", heroVal, oppVals: [[1, 14, 10]] }, pot: 10, heroTotalInvested: 3 };
    const hand3way = { terminal: { type: "showdown", result: "tie", heroVal, oppVals: [[1, 14, 10], [1, 14, 10]] }, pot: 10, heroTotalInvested: 3 };
    // computeHeroNet rounds to the nearest 0.1bb for display, so compare against that same rounding.
    expect(computeHeroNet(hand2way)).toBeCloseTo(Math.round((10 / 2 - 3) * 10) / 10, 5);
    expect(computeHeroNet(hand3way)).toBeCloseTo(Math.round((10 / 3 - 3) * 10) / 10, 5);
  });

  it("loses the full investment on a fold", () => {
    const h = { terminal: { type: "folded" }, pot: 12, heroTotalInvested: 4 };
    expect(computeHeroNet(h)).toBe(-4);
  });

  it("wins the whole pot minus own investment when uncontested", () => {
    const h = { terminal: { type: "uncontested" }, pot: 7.5, heroTotalInvested: 3 };
    expect(computeHeroNet(h)).toBeCloseTo(4.5, 5);
  });
});
