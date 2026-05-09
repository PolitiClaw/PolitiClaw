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
      { billId: "119-hr-3", action: "promote" },
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
      { billId: "119-hr-4", action: "promote" },
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
      { billId: "119-hr-5", action: "promote" },
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
      { billId: "119-hr-6", action: "promote" },
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
      { billId: "119-hr-99", action: "promote" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("No AI rating exists");
  });
});
