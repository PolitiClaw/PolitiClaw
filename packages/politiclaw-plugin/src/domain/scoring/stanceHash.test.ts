import { describe, expect, it } from "vitest";

import type { IssueStance } from "../preferences/types.js";
import { hashStanceSnapshot } from "./stanceHash.js";

const baseStance: IssueStance = {
  issue: "housing",
  stance: "support",
  weight: 4,
};

describe("hashStanceSnapshot", () => {
  it("produces identical truncated hashes for identical input", () => {
    const first = hashStanceSnapshot([baseStance]);
    const second = hashStanceSnapshot([baseStance]);
    expect(first).toBe(second);
    expect(first).toHaveLength(16);
  });

  it("produces a 64-char hash when truncated is false", () => {
    const full = hashStanceSnapshot([baseStance], { truncated: false });
    expect(full).toHaveLength(64);
  });

  it("treats input order as irrelevant", () => {
    const stances: IssueStance[] = [
      { issue: "housing", stance: "support", weight: 4 },
      { issue: "defense", stance: "oppose", weight: 3 },
    ];
    const reversed = [...stances].reverse();
    expect(hashStanceSnapshot(stances)).toBe(hashStanceSnapshot(reversed));
  });

  it("changes when a note is added", () => {
    const without = hashStanceSnapshot([baseStance]);
    const withNote = hashStanceSnapshot([
      { ...baseStance, note: "specifically rent stabilization" },
    ]);
    expect(withNote).not.toBe(without);
  });

  it("changes when the note text changes", () => {
    const first = hashStanceSnapshot([{ ...baseStance, note: "rent stabilization" }]);
    const second = hashStanceSnapshot([
      { ...baseStance, note: "single-room occupancy protections" },
    ]);
    expect(first).not.toBe(second);
  });

  it("changes when sourceText is added", () => {
    const without = hashStanceSnapshot([baseStance]);
    const withSourceText = hashStanceSnapshot([
      { ...baseStance, sourceText: "I want rent stabilization" },
    ]);
    expect(withSourceText).not.toBe(without);
  });

  it("treats undefined, null, and empty-string note as equivalent (backward compatible)", () => {
    const explicitlyMissing = hashStanceSnapshot([baseStance]);
    const explicitlyUndefined = hashStanceSnapshot([{ ...baseStance, note: undefined }]);
    const explicitlyEmpty = hashStanceSnapshot([{ ...baseStance, note: "" }]);
    expect(explicitlyUndefined).toBe(explicitlyMissing);
    expect(explicitlyEmpty).toBe(explicitlyMissing);
  });

  it("changes when stance weight changes", () => {
    const lighter = hashStanceSnapshot([{ ...baseStance, weight: 2 }]);
    const heavier = hashStanceSnapshot([{ ...baseStance, weight: 5 }]);
    expect(lighter).not.toBe(heavier);
  });

  it("changes when stance polarity changes", () => {
    const support = hashStanceSnapshot([{ ...baseStance, stance: "support" }]);
    const oppose = hashStanceSnapshot([{ ...baseStance, stance: "oppose" }]);
    expect(support).not.toBe(oppose);
  });

  it("preserves the original 16-char hash for stances without notes", () => {
    // This guards backward compatibility: existing bill_alignment and
    // rep_scores rows were keyed on hashes computed without the note column.
    // A stance with no note must keep producing the same hash so cached rows
    // remain reachable after this change ships.
    const hash = hashStanceSnapshot([baseStance]);
    // Expected hash for {issue: "housing", stance: "support", weight: 4}
    // computed by sha256(JSON.stringify([{issue,stance,weight}])).slice(0,16)
    // Pre-image: '[{"issue":"housing","stance":"support","weight":4}]'
    expect(hash).toBe("b964a22f5e13e816");
  });
});
