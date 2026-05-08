import { describe, expect, it } from "vitest";

import type { AutoDirectionMode } from "../preferences/types.js";
import type { BillDirection } from "./direction.js";
import { resolveEffectiveDirection } from "./directionResolution.js";

const advancesHigh: BillDirection = {
  kind: "advances",
  confidence: 0.85,
  rationale: "matched",
  quotedText: "...",
  counterConsideration: "...",
};
const advancesLow: BillDirection = {
  kind: "advances",
  confidence: 0.6,
  rationale: "matched weakly",
  quotedText: "...",
  counterConsideration: "...",
};
const obstructsHigh: BillDirection = {
  kind: "obstructs",
  confidence: 0.9,
  rationale: "matched",
  quotedText: "...",
  counterConsideration: "...",
};
const obstructsLow: BillDirection = {
  kind: "obstructs",
  confidence: 0.55,
  rationale: "weakly",
  quotedText: "...",
  counterConsideration: "...",
};
const mixed: BillDirection = {
  kind: "mixed",
  confidence: 0.8,
  rationale: "both sides present",
  advancesQuote: "...",
  obstructsQuote: "...",
};
const unclear: BillDirection = {
  kind: "unclear",
  rationale: "no grounded claim",
};

const ALL_MODES: AutoDirectionMode[] = ["off", "supplement", "co-equal", "advisory"];

describe("resolveEffectiveDirection", () => {
  describe("user signal always wins", () => {
    for (const mode of ALL_MODES) {
      it(`mode=${mode}: user 'agree' beats high-confidence classifier 'obstructs'`, () => {
        expect(
          resolveEffectiveDirection({
            mode,
            userDirection: "agree",
            classifier: obstructsHigh,
          }),
        ).toBe("agree");
      });
      it(`mode=${mode}: user 'disagree' beats high-confidence classifier 'advances'`, () => {
        expect(
          resolveEffectiveDirection({
            mode,
            userDirection: "disagree",
            classifier: advancesHigh,
          }),
        ).toBe("disagree");
      });
    }
  });

  describe("mode='off' ignores classifier output", () => {
    it("returns null when classifier present but no user signal", () => {
      expect(
        resolveEffectiveDirection({
          mode: "off",
          userDirection: null,
          classifier: advancesHigh,
        }),
      ).toBeNull();
    });
  });

  describe("mode='advisory' never auto-counts the classifier", () => {
    it("returns null on high-confidence classifier without user signal", () => {
      expect(
        resolveEffectiveDirection({
          mode: "advisory",
          userDirection: null,
          classifier: advancesHigh,
        }),
      ).toBeNull();
    });
  });

  describe("mode='supplement': classifier fills gaps", () => {
    it("high-confidence advances becomes 'agree' when user signal absent", () => {
      expect(
        resolveEffectiveDirection({
          mode: "supplement",
          userDirection: null,
          classifier: advancesHigh,
        }),
      ).toBe("agree");
    });
    it("high-confidence obstructs becomes 'disagree' when user signal absent", () => {
      expect(
        resolveEffectiveDirection({
          mode: "supplement",
          userDirection: null,
          classifier: obstructsHigh,
        }),
      ).toBe("disagree");
    });
    it("mid-confidence (below 0.75) advances → null (review tier)", () => {
      expect(
        resolveEffectiveDirection({
          mode: "supplement",
          userDirection: null,
          classifier: advancesLow,
        }),
      ).toBeNull();
    });
    it("mid-confidence obstructs → null", () => {
      expect(
        resolveEffectiveDirection({
          mode: "supplement",
          userDirection: null,
          classifier: obstructsLow,
        }),
      ).toBeNull();
    });
    it("mixed → null", () => {
      expect(
        resolveEffectiveDirection({
          mode: "supplement",
          userDirection: null,
          classifier: mixed,
        }),
      ).toBeNull();
    });
    it("unclear → null", () => {
      expect(
        resolveEffectiveDirection({
          mode: "supplement",
          userDirection: null,
          classifier: unclear,
        }),
      ).toBeNull();
    });
    it("no classifier → null", () => {
      expect(
        resolveEffectiveDirection({
          mode: "supplement",
          userDirection: null,
          classifier: null,
        }),
      ).toBeNull();
    });
  });

  describe("mode='co-equal': same scoring shape as 'supplement'", () => {
    it("high-confidence advances becomes 'agree' when no user signal", () => {
      expect(
        resolveEffectiveDirection({
          mode: "co-equal",
          userDirection: null,
          classifier: advancesHigh,
        }),
      ).toBe("agree");
    });
    it("mid-confidence → null (review tier)", () => {
      expect(
        resolveEffectiveDirection({
          mode: "co-equal",
          userDirection: null,
          classifier: advancesLow,
        }),
      ).toBeNull();
    });
  });

  it("threshold boundary: confidence exactly 0.75 counts", () => {
    expect(
      resolveEffectiveDirection({
        mode: "supplement",
        userDirection: null,
        classifier: { ...advancesHigh, confidence: 0.75 },
      }),
    ).toBe("agree");
  });

  it("threshold boundary: confidence at 0.7499 does not count", () => {
    expect(
      resolveEffectiveDirection({
        mode: "supplement",
        userDirection: null,
        classifier: { ...advancesHigh, confidence: 0.7499 },
      }),
    ).toBeNull();
  });
});
