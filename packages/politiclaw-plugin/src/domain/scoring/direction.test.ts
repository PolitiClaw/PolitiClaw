import { describe, it, expect } from "vitest";

import type { Bill } from "../../sources/bills/types.js";
import type { IssueStance } from "../preferences/types.js";
import {
  computeBillDirection,
  type LlmClient,
} from "./direction.js";

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: "119-hr-1234",
    congress: 119,
    billType: "HR",
    number: "1234",
    title: "Affordable Housing Investment Act",
    policyArea: "Housing and Community Development",
    subjects: ["Affordable housing", "Housing assistance"],
    summaryText:
      "Expands the Low-Income Housing Tax Credit and funds affordable housing construction grants.",
    ...overrides,
  } as Bill;
}

function stance(
  issue: string,
  direction: IssueStance["stance"] = "support",
  weight = 4,
): IssueStance {
  return { issue, stance: direction, weight };
}

function fakeLlm(response: unknown): LlmClient {
  return {
    async reason() {
      return response;
    },
  };
}

describe("computeBillDirection", () => {
  it("renders advances when LLM returns direction + grounded quote + counter", async () => {
    const llm = fakeLlm({
      kind: "advances",
      confidence: 0.82,
      rationale: "the bill expands LIHTC, a core affordable-housing tool",
      quotedText: "Expands the Low-Income Housing Tax Credit",
      counterConsideration: "Tax credits are a costly and indirect subsidy.",
    });

    const [result] = await computeBillDirection(makeBill(), [stance("affordable-housing")], llm);
    expect(result.direction.kind).toBe("advances");
    if (result.direction.kind === "advances") {
      expect(result.direction.quotedText).toContain("Low-Income Housing Tax Credit");
      expect(result.direction.counterConsideration.length).toBeGreaterThan(0);
    }
  });

  it("coerces to unclear when confidence is below the floor", async () => {
    const llm = fakeLlm({
      kind: "advances",
      confidence: 0.3,
      rationale: "weak signal",
      quotedText: "Expands the Low-Income Housing Tax Credit",
      counterConsideration: "steel-man counter",
    });

    const [result] = await computeBillDirection(makeBill(), [stance("affordable-housing")], llm);
    expect(result.direction.kind).toBe("unclear");
    if (result.direction.kind === "unclear") {
      expect(result.direction.rationale).toMatch(/below confidence floor/);
    }
  });

  it("coerces to unclear when the quote is not present in the bill text", async () => {
    const llm = fakeLlm({
      kind: "advances",
      confidence: 0.9,
      rationale: "this directly subsidizes new construction",
      quotedText: "provides five billion dollars for new construction",
      counterConsideration: "steel-man counter",
    });

    const [result] = await computeBillDirection(makeBill(), [stance("affordable-housing")], llm);
    expect(result.direction.kind).toBe("unclear");
    if (result.direction.kind === "unclear") {
      expect(result.direction.rationale).toMatch(/not grounded/);
    }
  });

  it("coerces advances-without-counter-consideration to mixed", async () => {
    const llm = fakeLlm({
      kind: "advances",
      confidence: 0.75,
      rationale: "expands LIHTC",
      quotedText: "Expands the Low-Income Housing Tax Credit",
    });

    const [result] = await computeBillDirection(makeBill(), [stance("affordable-housing")], llm);
    expect(result.direction.kind).toBe("mixed");
    if (result.direction.kind === "mixed") {
      expect(result.direction.advancesQuote).toContain("Low-Income Housing Tax Credit");
      expect(result.direction.obstructsQuote).toBe("");
      expect(result.direction.rationale).toMatch(/coerced to mixed/);
    }
  });

  it("renders mixed when both sides have grounded quotes", async () => {
    const bill = makeBill({
      summaryText:
        "Expands the Low-Income Housing Tax Credit but preempts local inclusionary zoning ordinances.",
    });
    const llm = fakeLlm({
      kind: "mixed",
      confidence: 0.7,
      rationale: "bill both subsidizes and preempts",
      advancesQuote: "Expands the Low-Income Housing Tax Credit",
      obstructsQuote: "preempts local inclusionary zoning ordinances",
    });

    const [result] = await computeBillDirection(bill, [stance("affordable-housing")], llm);
    expect(result.direction.kind).toBe("mixed");
    if (result.direction.kind === "mixed") {
      expect(result.direction.advancesQuote.length).toBeGreaterThan(0);
      expect(result.direction.obstructsQuote.length).toBeGreaterThan(0);
    }
  });

  it("skips neutral stances entirely", async () => {
    const llm = fakeLlm({
      kind: "advances",
      confidence: 0.9,
      rationale: "x",
      quotedText: "Low-Income Housing Tax Credit",
      counterConsideration: "y",
    });

    const results = await computeBillDirection(
      makeBill(),
      [stance("affordable-housing", "neutral"), stance("climate", "support")],
      llm,
    );
    expect(results.map((r) => r.issue)).toEqual(["climate"]);
  });

  it("returns unclear when the classifier throws", async () => {
    const llm: LlmClient = {
      async reason() {
        throw new Error("upstream timeout");
      },
    };

    const [result] = await computeBillDirection(makeBill(), [stance("affordable-housing")], llm);
    expect(result.direction.kind).toBe("unclear");
    if (result.direction.kind === "unclear") {
      expect(result.direction.rationale).toMatch(/upstream timeout/);
    }
  });

  it("returns unclear when the LLM explicitly emits unclear", async () => {
    const llm = fakeLlm({
      kind: "unclear",
      rationale: "bill text is too sparse to decide",
    });

    const [result] = await computeBillDirection(makeBill(), [stance("affordable-housing")], llm);
    expect(result.direction.kind).toBe("unclear");
  });
});
