import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../../storage/sqlite.js";
import { createBillsResolver } from "../../sources/bills/index.js";
import type { AdapterResult } from "../../sources/common/types.js";
import type { Bill, BillRef } from "../../sources/bills/types.js";
import { upsertIssueStance } from "../preferences/index.js";
import { readStoredAlignment, scoreBill } from "./index.js";

function fakeResolver(get: (ref: BillRef) => Promise<AdapterResult<Bill>>) {
  const resolver = createBillsResolver({ apiDataGovKey: "k" });
  resolver.get = get;
  return resolver;
}

const housingBill: Bill = {
  id: "119-hr-1234",
  congress: 119,
  billType: "HR",
  number: "1234",
  title: "Clean Housing Investment Act of 2026",
  policyArea: "Housing and Community Development",
  subjects: ["Affordable housing"],
  summaryText: "Authorizes grants for affordable housing.",
};

describe("scoreBill", () => {
  it("returns no_stances with actionable guidance when stances table is empty", async () => {
    const db = openMemoryDb();
    const result = await scoreBill(
      db,
      fakeResolver(async () =>
        ({
          status: "ok",
          adapterId: "congressGov",
          tier: 1,
          data: housingBill,
          fetchedAt: Date.now(),
        }) as AdapterResult<Bill>,
      ),
      { congress: 119, billType: "HR", number: "1234" },
    );
    expect(result.status).toBe("no_stances");
    if (result.status !== "no_stances") return;
    expect(result.actionable).toContain("politiclaw_issue_stances");
  });

  it("computes and persists alignment when stances are present", async () => {
    const db = openMemoryDb();
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    upsertIssueStance(db, { issue: "climate", stance: "support", weight: 3 });
    upsertIssueStance(db, { issue: "taxation", stance: "oppose", weight: 2 });

    const result = await scoreBill(
      db,
      fakeResolver(async () =>
        ({
          status: "ok",
          adapterId: "congressGov",
          tier: 1,
          data: housingBill,
          fetchedAt: Date.now(),
        }) as AdapterResult<Bill>,
      ),
      { congress: 119, billType: "HR", number: "1234" },
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.alignment.matches.length).toBeGreaterThan(0);
    expect(result.alignment.confidence).toBeGreaterThan(0);

    const stored = readStoredAlignment(
      db,
      result.bill.id,
      result.bill.updateDate ?? "",
      result.alignment.stanceSnapshotHash,
    );
    expect(stored).not.toBeNull();
    expect(stored?.relevance).toBeCloseTo(result.alignment.relevance);
    expect(stored?.sourceAdapterId).toBe("congressGov");
    expect(stored?.sourceTier).toBe(1);
  });

  it("keeps historical scores when stances change (new snapshot hash)", async () => {
    const db = openMemoryDb();
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });

    const get = async () =>
      ({
        status: "ok",
        adapterId: "congressGov",
        tier: 1,
        data: housingBill,
        fetchedAt: Date.now(),
      }) as AdapterResult<Bill>;

    const first = await scoreBill(db, fakeResolver(get), {
      congress: 119,
      billType: "HR",
      number: "1234",
    });
    expect(first.status).toBe("ok");

    upsertIssueStance(db, { issue: "climate", stance: "oppose", weight: 5 });

    const second = await scoreBill(db, fakeResolver(get), {
      congress: 119,
      billType: "HR",
      number: "1234",
    });
    expect(second.status).toBe("ok");

    const rowCount = (
      db.prepare("SELECT COUNT(*) AS n FROM bill_alignment").get() as { n: number }
    ).n;
    expect(rowCount).toBe(2);
  });

  it("persists direction rows when an LLM is provided and re-reads them on cache hit", async () => {
    const db = openMemoryDb();
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });

    const llmCalls: number[] = [];
    const llm = {
      reason: async () => {
        llmCalls.push(Date.now());
        return {
          kind: "advances",
          confidence: 0.82,
          rationale: "matched housing investment",
          quotedText: "Authorizes grants for affordable housing.",
          counterConsideration: "Some sponsors describe this as preempting state authority.",
        };
      },
    };

    const get = async () =>
      ({
        status: "ok",
        adapterId: "congressGov",
        tier: 1,
        data: housingBill,
        fetchedAt: Date.now(),
      }) as AdapterResult<Bill>;

    const first = await scoreBill(db, fakeResolver(get), {
      congress: 119,
      billType: "HR",
      number: "1234",
    }, { llm });
    expect(first.status).toBe("ok");
    if (first.status !== "ok") return;
    expect(first.direction).not.toBeNull();
    expect(first.direction?.[0]?.direction.kind).toBe("advances");
    expect(llmCalls).toHaveLength(1);

    const stored = (
      db.prepare("SELECT COUNT(*) AS n FROM bill_direction").get() as { n: number }
    ).n;
    expect(stored).toBeGreaterThan(0);

    // Second call hits cache — LLM is not invoked again.
    const second = await scoreBill(db, fakeResolver(get), {
      congress: 119,
      billType: "HR",
      number: "1234",
    }, { llm });
    expect(second.status).toBe("ok");
    if (second.status !== "ok") return;
    expect(second.direction?.[0]?.direction.kind).toBe("advances");
    expect(llmCalls).toHaveLength(1);
  });

  it("re-classifies when the bill's update_date advances (amendment)", async () => {
    const db = openMemoryDb();
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });

    let llmCallCount = 0;
    const llm = {
      reason: async () => {
        llmCallCount += 1;
        return {
          kind: "advances",
          confidence: 0.7,
          rationale: "matched",
          quotedText: "Authorizes grants for affordable housing.",
          counterConsideration: "Some sponsors describe this as preempting state authority.",
        };
      },
    };

    const billV1: Bill = { ...housingBill, updateDate: "2026-01-15" };
    const billV2: Bill = { ...housingBill, updateDate: "2026-03-22" };

    await scoreBill(db, fakeResolver(async () => ({
      status: "ok", adapterId: "congressGov", tier: 1, data: billV1, fetchedAt: Date.now(),
    } as AdapterResult<Bill>)), { congress: 119, billType: "HR", number: "1234" }, { llm });
    expect(llmCallCount).toBe(1);

    await scoreBill(db, fakeResolver(async () => ({
      status: "ok", adapterId: "congressGov", tier: 1, data: billV2, fetchedAt: Date.now(),
    } as AdapterResult<Bill>)), { congress: 119, billType: "HR", number: "1234" }, { llm, refresh: true });
    expect(llmCallCount).toBe(2);

    const rows = db
      .prepare("SELECT bill_update_date FROM bill_direction WHERE bill_id = '119-hr-1234' ORDER BY bill_update_date")
      .all() as Array<{ bill_update_date: string }>;
    expect(rows.map((r) => r.bill_update_date)).toEqual(["2026-01-15", "2026-03-22"]);
  });

  it("re-classifies when stance notes change (new snapshot hash)", async () => {
    const db = openMemoryDb();
    upsertIssueStance(db, {
      issue: "housing", stance: "support", weight: 4, note: "rent stabilization",
    });

    let llmCallCount = 0;
    const llm = {
      reason: async () => {
        llmCallCount += 1;
        return {
          kind: "advances", confidence: 0.7, rationale: "matched",
          quotedText: "Authorizes grants for affordable housing.",
          counterConsideration: "Some sponsors describe this as preempting state authority.",
        };
      },
    };

    const get = async () => ({
      status: "ok", adapterId: "congressGov", tier: 1, data: housingBill, fetchedAt: Date.now(),
    } as AdapterResult<Bill>);

    await scoreBill(db, fakeResolver(get), { congress: 119, billType: "HR", number: "1234" }, { llm });
    expect(llmCallCount).toBe(1);

    upsertIssueStance(db, {
      issue: "housing", stance: "support", weight: 4, note: "single-room occupancy",
    });

    await scoreBill(db, fakeResolver(get), { congress: 119, billType: "HR", number: "1234" }, { llm });
    expect(llmCallCount).toBe(2);
  });

  it("surfaces unavailable from the resolver with actionable guidance", async () => {
    const db = openMemoryDb();
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });

    const result = await scoreBill(
      db,
      fakeResolver(async () =>
        ({
          status: "unavailable",
          adapterId: "congressGov",
          reason: "missing apiDataGov key",
          actionable: "set plugins.entries.politiclaw.config.apiKeys.apiDataGov",
        }) as AdapterResult<Bill>,
      ),
      { congress: 119, billType: "HR", number: "1234" },
    );

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.actionable).toContain("apiDataGov");
  });
});
