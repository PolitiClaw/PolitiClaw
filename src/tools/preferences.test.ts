import { afterEach, describe, expect, it } from "vitest";
import { openMemoryDb } from "../storage/sqlite.js";
import { Kv } from "../storage/kv.js";
import {
  setStorageForTests,
  resetStorageConfigForTests,
} from "../storage/context.js";
import {
  getPreferencesTool,
  recordStanceSignalTool,
  setPreferencesTool,
  listStanceSignals,
} from "./preferences.js";

function withMemoryStorage() {
  const db = openMemoryDb();
  setStorageForTests({ db, kv: new Kv(db) });
  return db;
}

afterEach(() => {
  resetStorageConfigForTests();
});

describe("set_preferences tool", () => {
  it("persists input and returns confirmation text", async () => {
    const db = withMemoryStorage();
    const result = await setPreferencesTool.execute!(
      "call-1",
      { address: "123 Main", state: "ca", zip: "94110" },
      undefined,
      undefined,
    );
    expect(result.content[0]).toMatchObject({ type: "text" });
    const row = db.prepare("SELECT address, state FROM preferences WHERE id=1").get() as {
      address: string;
      state: string;
    };
    expect(row.address).toBe("123 Main");
    expect(row.state).toBe("CA");
  });

  it("rejects empty address", async () => {
    withMemoryStorage();
    await expect(
      setPreferencesTool.execute!("call-1", { address: "" }, undefined, undefined),
    ).rejects.toThrow();
  });
});

describe("get_preferences tool", () => {
  it("returns null details before any preferences are set", async () => {
    withMemoryStorage();
    const result = await getPreferencesTool.execute!("call-1", {}, undefined, undefined);
    expect(result.details).toEqual({ preferences: null });
  });

  it("returns persisted preferences", async () => {
    withMemoryStorage();
    await setPreferencesTool.execute!(
      "call-1",
      { address: "123 Main", state: "ca" },
      undefined,
      undefined,
    );
    const result = await getPreferencesTool.execute!("call-2", {}, undefined, undefined);
    expect((result.details as { preferences: { address: string } }).preferences.address).toBe(
      "123 Main",
    );
  });
});

describe("record_stance_signal tool", () => {
  it("writes a signal row", async () => {
    const db = withMemoryStorage();
    const result = await recordStanceSignalTool.execute!(
      "call-1",
      { direction: "agree", source: "onboarding", issue: "climate" },
      undefined,
      undefined,
    );
    expect((result.details as { id: number }).id).toBeGreaterThan(0);
    expect(listStanceSignals(db)).toHaveLength(1);
  });

  it("rejects signals with neither issue nor billId", async () => {
    withMemoryStorage();
    await expect(
      recordStanceSignalTool.execute!(
        "call-1",
        { direction: "agree", source: "onboarding" },
        undefined,
        undefined,
      ),
    ).rejects.toThrow();
  });
});
