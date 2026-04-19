import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../../storage/sqlite.js";
import {
  getPreferences,
  listStanceSignals,
  recordStanceSignal,
  upsertPreferences,
  PreferencesSchema,
  StanceSignalSchema,
} from "./index.js";

describe("PreferencesSchema", () => {
  it("requires a non-empty address", () => {
    expect(() => PreferencesSchema.parse({ address: "" })).toThrow();
  });

  it("uppercases and validates a 2-letter state code", () => {
    const p = PreferencesSchema.parse({ address: "123 Main", state: "ca" });
    expect(p.state).toBe("CA");
  });

  it("rejects a 3-letter state code", () => {
    expect(() => PreferencesSchema.parse({ address: "123 Main", state: "CAL" })).toThrow();
  });
});

describe("upsertPreferences", () => {
  it("inserts and overwrites the single-row preferences table", () => {
    const db = openMemoryDb();
    expect(getPreferences(db)).toBeNull();

    upsertPreferences(db, { address: "123 Main", state: "ca", zip: "94110" });
    const first = getPreferences(db);
    expect(first?.address).toBe("123 Main");
    expect(first?.state).toBe("CA");

    upsertPreferences(db, { address: "456 Oak", state: "wa" });
    const second = getPreferences(db);
    expect(second?.address).toBe("456 Oak");
    expect(second?.state).toBe("WA");
    expect(second?.zip).toBeUndefined();

    const count = (
      db.prepare("SELECT COUNT(*) AS n FROM preferences").get() as { n: number }
    ).n;
    expect(count).toBe(1);
  });
});

describe("StanceSignalSchema", () => {
  it("requires either issue or billId", () => {
    expect(() =>
      StanceSignalSchema.parse({ direction: "agree", source: "onboarding" }),
    ).toThrow();
  });

  it("defaults weight to 1.0", () => {
    const s = StanceSignalSchema.parse({
      direction: "agree",
      source: "onboarding",
      issue: "climate",
    });
    expect(s.weight).toBe(1.0);
  });

  it("rejects negative weights", () => {
    expect(() =>
      StanceSignalSchema.parse({
        direction: "agree",
        source: "onboarding",
        issue: "climate",
        weight: -1,
      }),
    ).toThrow();
  });
});

describe("recordStanceSignal", () => {
  it("writes the signal and returns its id", () => {
    const db = openMemoryDb();
    const id = recordStanceSignal(db, {
      direction: "agree",
      source: "onboarding",
      issue: "climate",
      weight: 1,
    });
    expect(id).toBeGreaterThan(0);

    const rows = listStanceSignals(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.issue).toBe("climate");
    expect(rows[0]?.direction).toBe("agree");
  });

  it("lists signals newest-first", () => {
    const db = openMemoryDb();
    recordStanceSignal(db, { direction: "agree", source: "onboarding", issue: "a", weight: 1 });
    recordStanceSignal(db, { direction: "disagree", source: "monitoring", issue: "b", weight: 1 });
    recordStanceSignal(db, { direction: "skip", source: "dashboard", billId: "hr-1", weight: 1 });

    const rows = listStanceSignals(db);
    expect(rows.map((r) => r.direction)).toEqual(["skip", "disagree", "agree"]);
    expect(rows[0]?.billId).toBe("hr-1");
  });
});
