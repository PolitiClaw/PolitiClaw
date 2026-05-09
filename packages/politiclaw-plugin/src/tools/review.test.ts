import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  configureStorage,
  resetStorageConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import { Kv } from "../storage/kv.js";
import { openMemoryDb, type PolitiClawDb } from "../storage/sqlite.js";
import { listIssueStances, upsertIssueStance } from "../domain/preferences/index.js";
import type { IssueStance } from "../domain/preferences/types.js";
import { hashStancesForRepScoring } from "../domain/scoring/index.js";
import { reviewAutoRatingsTool, resolveAutoRatingTool } from "./review.js";

let db: PolitiClawDb;

function setupStorage(): PolitiClawDb {
  const database = openMemoryDb();
  configureStorage(() => "/tmp/politiclaw-tests");
  setStorageForTests({ db: database, kv: new Kv(database) });
  return database;
}

beforeEach(() => {
  db = setupStorage();
});

afterEach(() => {
  setStorageForTests(null);
  resetStorageConfigForTests();
});

function seedBill(database: PolitiClawDb, billId: string, title: string): void {
  const [, billType, number] = billId.split("-");
  database
    .prepare(
      `INSERT INTO bills (id, congress, bill_type, number, title,
                          last_synced, source_adapter_id, source_tier)
       VALUES (@id, 119, @type, @num, @title, 0, 'congressGov', 1)`,
    )
    .run({ id: billId, type: (billType ?? "hr").toUpperCase(), num: number ?? "1", title });
}

function seedDirection(
  database: PolitiClawDb,
  params: {
    billId: string;
    hash: string;
    stanceSlug: string;
    kind: "advances" | "obstructs" | "mixed" | "unclear";
    confidence: number;
  },
): void {
  database
    .prepare(
      `INSERT INTO bill_direction
         (bill_id, bill_update_date, stance_snapshot_hash, stance_slug,
          kind, confidence, rationale, evidence_json, computed_at, model_id)
       VALUES (@bill_id, '', @hash, @slug, @kind, @conf, 'r', '{}', 0, 'test')`,
    )
    .run({
      bill_id: params.billId,
      hash: params.hash,
      slug: params.stanceSlug,
      kind: params.kind,
      conf: params.confidence,
    });
}

function currentHash(): string {
  const stances = listIssueStances(db).map<IssueStance>((row) => ({
    issue: row.issue,
    stance: row.stance,
    weight: row.weight,
    ...(row.note ? { note: row.note } : {}),
    ...(row.sourceText ? { sourceText: row.sourceText } : {}),
  }));
  return hashStancesForRepScoring(stances);
}

describe("politiclaw_review_auto_ratings", () => {
  it("returns 'no_stances' when none are declared", async () => {
    const result = await reviewAutoRatingsTool.execute!(
      "call-1",
      {},
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("No declared issue stances");
  });

  it("returns 'No bills pending' when no direction rows exist", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    const result = await reviewAutoRatingsTool.execute!(
      "call-1",
      {},
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("No bills pending");
  });

  it("excludes high-confidence advances/obstructs (those auto-count)", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    const hash = currentHash();
    seedBill(db, "119-hr-1", "High-conf bill");
    seedDirection(db, {
      billId: "119-hr-1",
      hash,
      stanceSlug: "housing",
      kind: "advances",
      confidence: 0.9,
    });
    const result = await reviewAutoRatingsTool.execute!(
      "call-1",
      {},
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("No bills pending");
  });

  it("includes borderline rows (mid confidence advances/obstructs)", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    const hash = currentHash();
    seedBill(db, "119-hr-2", "Borderline bill");
    seedDirection(db, {
      billId: "119-hr-2",
      hash,
      stanceSlug: "housing",
      kind: "advances",
      confidence: 0.6,
    });
    const result = await reviewAutoRatingsTool.execute!(
      "call-1",
      {},
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("119-hr-2");
    expect(text).toContain("borderline");
  });

  it("includes mixed rows", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    const hash = currentHash();
    seedBill(db, "119-hr-3", "Mixed bill");
    seedDirection(db, {
      billId: "119-hr-3",
      hash,
      stanceSlug: "housing",
      kind: "mixed",
      confidence: 0.8,
    });
    const result = await reviewAutoRatingsTool.execute!(
      "call-1",
      {},
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("mixed");
  });

  it("includes unclassifiable rows (kind=unclear)", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    const hash = currentHash();
    seedBill(db, "119-hr-4", "Unclear bill");
    seedDirection(db, {
      billId: "119-hr-4",
      hash,
      stanceSlug: "housing",
      kind: "unclear",
      confidence: 0,
    });
    const result = await reviewAutoRatingsTool.execute!(
      "call-1",
      {},
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("unclear");
  });

  it("filters by tier", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    const hash = currentHash();
    seedBill(db, "119-hr-5", "Borderline bill");
    seedDirection(db, {
      billId: "119-hr-5",
      hash,
      stanceSlug: "housing",
      kind: "advances",
      confidence: 0.6,
    });
    seedBill(db, "119-hr-6", "Mixed bill");
    seedDirection(db, {
      billId: "119-hr-6",
      hash,
      stanceSlug: "housing",
      kind: "mixed",
      confidence: 0.8,
    });
    const result = await reviewAutoRatingsTool.execute!(
      "call-1",
      { tier: "borderline" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("119-hr-5");
    expect(text).not.toContain("119-hr-6");
  });

  it("does not show 'already signaled' when the only existing signal is scoped to a different stance", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    upsertIssueStance(db, { issue: "taxation", stance: "oppose", weight: 3 });
    const hash = currentHash();
    seedBill(db, "119-hr-50", "Multi-stance bill");
    seedDirection(db, {
      billId: "119-hr-50",
      hash,
      stanceSlug: "housing",
      kind: "advances",
      confidence: 0.9, // auto-counts, won't appear in review
    });
    seedDirection(db, {
      billId: "119-hr-50",
      hash,
      stanceSlug: "taxation",
      kind: "mixed",
      confidence: 0.85,
    });
    // User signaled per-stance on housing only.
    db.prepare(
      `INSERT INTO stance_signals (bill_id, stance_slug, direction, weight, source, created_at)
       VALUES ('119-hr-50', 'housing', 'agree', 1.0, 'review', 0)`,
    ).run();

    const result = await reviewAutoRatingsTool.execute!(
      "call-1",
      {},
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    // The pending row is for taxation. The housing signal must not appear
    // as "you already signaled" on the taxation row.
    expect(text).toContain("119-hr-50");
    expect(text).toContain("Stance: taxation");
    expect(text).not.toContain("You already signaled");
  });

  it("shows 'already signaled' on the same stance the per-stance signal scopes to", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    const hash = currentHash();
    seedBill(db, "119-hr-51", "Same-stance bill");
    seedDirection(db, {
      billId: "119-hr-51",
      hash,
      stanceSlug: "housing",
      kind: "mixed",
      confidence: 0.7,
    });
    db.prepare(
      `INSERT INTO stance_signals (bill_id, stance_slug, direction, weight, source, created_at)
       VALUES ('119-hr-51', 'housing', 'disagree', 1.0, 'review', 0)`,
    ).run();

    const result = await reviewAutoRatingsTool.execute!(
      "call-1",
      {},
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("You already signaled: disagree");
    expect(text).toContain("applies to this stance");
  });

  it("shows bill-level 'already signaled' with explicit scope disclosure on every stance review row", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    upsertIssueStance(db, { issue: "taxation", stance: "oppose", weight: 3 });
    const hash = currentHash();
    seedBill(db, "119-hr-52", "Bill with bill-level signal");
    seedDirection(db, {
      billId: "119-hr-52",
      hash,
      stanceSlug: "housing",
      kind: "mixed",
      confidence: 0.7,
    });
    seedDirection(db, {
      billId: "119-hr-52",
      hash,
      stanceSlug: "taxation",
      kind: "mixed",
      confidence: 0.7,
    });
    // Bill-level signal — applies to both matched stances.
    db.prepare(
      `INSERT INTO stance_signals (bill_id, direction, weight, source, created_at)
       VALUES ('119-hr-52', 'agree', 1.0, 'dashboard', 0)`,
    ).run();

    const result = await reviewAutoRatingsTool.execute!(
      "call-1",
      {},
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    // Both pending rows should disclose the bill-level scope so the user
    // isn't misled into thinking they signaled per-stance.
    expect(text).toContain("You already signaled: agree");
    expect(text).toContain("bill-level");
  });

  it("includes user note when present", async () => {
    upsertIssueStance(db, {
      issue: "housing",
      stance: "support",
      weight: 4,
      note: "rent stabilization specifically",
    });
    const hash = currentHash();
    seedBill(db, "119-hr-7", "Note bill");
    seedDirection(db, {
      billId: "119-hr-7",
      hash,
      stanceSlug: "housing",
      kind: "mixed",
      confidence: 0.7,
    });
    const result = await reviewAutoRatingsTool.execute!(
      "call-1",
      {},
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("rent stabilization");
  });
});

describe("politiclaw_resolve_auto_rating", () => {
  it("rejects override without a direction", async () => {
    const result = await resolveAutoRatingTool.execute!(
      "call-1",
      { billId: "119-hr-1", action: "override" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("requires a direction");
  });

  it("records 'skip' signal with source='review'", async () => {
    const result = await resolveAutoRatingTool.execute!(
      "call-1",
      { billId: "119-hr-1", action: "skip" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Recorded 'skip' signal");
    const stored = db
      .prepare("SELECT bill_id, direction, source FROM stance_signals WHERE bill_id = '119-hr-1'")
      .get() as { bill_id: string; direction: string; source: string };
    expect(stored.direction).toBe("skip");
    expect(stored.source).toBe("review");
  });

  it("records explicit override direction with source='review'", async () => {
    const result = await resolveAutoRatingTool.execute!(
      "call-1",
      { billId: "119-hr-2", action: "override", direction: "disagree" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Recorded 'disagree' signal");
    const stored = db
      .prepare("SELECT direction, source FROM stance_signals WHERE bill_id = '119-hr-2'")
      .get() as { direction: string; source: string };
    expect(stored.direction).toBe("disagree");
    expect(stored.source).toBe("review");
  });

  it("promotes 'advances' AI call to 'agree' user signal", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    const hash = currentHash();
    seedBill(db, "119-hr-3", "Advances bill");
    seedDirection(db, {
      billId: "119-hr-3",
      hash,
      stanceSlug: "housing",
      kind: "advances",
      confidence: 0.85,
    });
    const result = await resolveAutoRatingTool.execute!(
      "call-1",
      { billId: "119-hr-3", action: "promote", stanceSlug: "housing" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Promoted AI 'advances'");
    expect(text).toContain("'agree'");
    const stored = db
      .prepare("SELECT direction, source FROM stance_signals WHERE bill_id = '119-hr-3'")
      .get() as { direction: string; source: string };
    expect(stored.direction).toBe("agree");
    expect(stored.source).toBe("review");
  });

  it("promotes 'obstructs' AI call to 'disagree' user signal", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    const hash = currentHash();
    seedBill(db, "119-hr-4", "Obstructs bill");
    seedDirection(db, {
      billId: "119-hr-4",
      hash,
      stanceSlug: "housing",
      kind: "obstructs",
      confidence: 0.9,
    });
    const result = await resolveAutoRatingTool.execute!(
      "call-1",
      { billId: "119-hr-4", action: "promote", stanceSlug: "housing" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("'disagree'");
    const stored = db
      .prepare("SELECT direction FROM stance_signals WHERE bill_id = '119-hr-4'")
      .get() as { direction: string };
    expect(stored.direction).toBe("disagree");
  });

  it("rejects promote on a 'mixed' AI call", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    const hash = currentHash();
    seedBill(db, "119-hr-5", "Mixed bill");
    seedDirection(db, {
      billId: "119-hr-5",
      hash,
      stanceSlug: "housing",
      kind: "mixed",
      confidence: 0.8,
    });
    const result = await resolveAutoRatingTool.execute!(
      "call-1",
      { billId: "119-hr-5", action: "promote", stanceSlug: "housing" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Cannot promote a 'mixed'");
    const stored = db
      .prepare("SELECT COUNT(*) AS n FROM stance_signals WHERE bill_id = '119-hr-5'")
      .get() as { n: number };
    expect(stored.n).toBe(0);
  });

  it("rejects promote on an 'unclear' AI call", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    const hash = currentHash();
    seedBill(db, "119-hr-6", "Unclear bill");
    seedDirection(db, {
      billId: "119-hr-6",
      hash,
      stanceSlug: "housing",
      kind: "unclear",
      confidence: 0,
    });
    const result = await resolveAutoRatingTool.execute!(
      "call-1",
      { billId: "119-hr-6", action: "promote", stanceSlug: "housing" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Cannot promote a 'unclear'");
  });

  it("returns no_rating when no AI call exists for the bill in current snapshot", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    const result = await resolveAutoRatingTool.execute!(
      "call-1",
      { billId: "119-hr-99", action: "promote", stanceSlug: "housing" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("No AI rating exists");
  });

  it("rejects promote when stanceSlug is omitted (per-stance write required)", async () => {
    const result = await resolveAutoRatingTool.execute!(
      "call-1",
      { billId: "119-hr-1", action: "promote" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Promote requires a stanceSlug");
    const stored = db
      .prepare("SELECT COUNT(*) AS n FROM stance_signals WHERE bill_id = '119-hr-1'")
      .get() as { n: number };
    expect(stored.n).toBe(0);
  });

  it("promotes only the per-stance AI call when bill has multiple classifications", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    upsertIssueStance(db, { issue: "taxation", stance: "oppose", weight: 3 });
    const hash = currentHash();
    seedBill(db, "119-hr-7", "Bill that touches two stances");
    seedDirection(db, {
      billId: "119-hr-7",
      hash,
      stanceSlug: "housing",
      kind: "advances",
      confidence: 0.9,
    });
    seedDirection(db, {
      billId: "119-hr-7",
      hash,
      stanceSlug: "taxation",
      kind: "obstructs",
      confidence: 0.85,
    });

    const result = await resolveAutoRatingTool.execute!(
      "call-1",
      { billId: "119-hr-7", action: "promote", stanceSlug: "housing" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("housing");
    expect(text).toContain("'agree'");

    const stored = db
      .prepare(
        "SELECT direction, stance_slug FROM stance_signals WHERE bill_id = '119-hr-7'",
      )
      .all() as Array<{ direction: string; stance_slug: string | null }>;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toEqual({ direction: "agree", stance_slug: "housing" });
  });

  it("override with stanceSlug records a per-stance signal", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    const result = await resolveAutoRatingTool.execute!(
      "call-1",
      {
        billId: "119-hr-8",
        action: "override",
        direction: "disagree",
        stanceSlug: "housing",
      },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("for stance 'housing'");
    const stored = db
      .prepare(
        "SELECT direction, stance_slug, source FROM stance_signals WHERE bill_id = '119-hr-8'",
      )
      .get() as { direction: string; stance_slug: string | null; source: string };
    expect(stored).toEqual({
      direction: "disagree",
      stance_slug: "housing",
      source: "review",
    });
  });

  it("override without stanceSlug records a bill-level signal (legacy shape)", async () => {
    const result = await resolveAutoRatingTool.execute!(
      "call-1",
      { billId: "119-hr-9", action: "override", direction: "agree" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("bill-level");
    const stored = db
      .prepare(
        "SELECT direction, stance_slug FROM stance_signals WHERE bill_id = '119-hr-9'",
      )
      .get() as { direction: string; stance_slug: string | null };
    expect(stored).toEqual({ direction: "agree", stance_slug: null });
  });

  it("skip writes a bill-level signal even if stanceSlug is provided (skip is bill-scoped by design)", async () => {
    await resolveAutoRatingTool.execute!(
      "call-1",
      { billId: "119-hr-10", action: "skip", stanceSlug: "housing" },
      undefined,
      undefined,
    );
    const stored = db
      .prepare(
        "SELECT direction, stance_slug FROM stance_signals WHERE bill_id = '119-hr-10'",
      )
      .get() as { direction: string; stance_slug: string | null };
    expect(stored).toEqual({ direction: "skip", stance_slug: null });
  });
});
