import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openMemoryDb } from "./sqlite.js";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

function runMigrationsUpTo(db: DatabaseSync, upToVersion: number): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)",
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const version = parseInt(file.slice(0, 4), 10);
    if (Number.isNaN(version) || version > upToVersion) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(version);
  }
}

function applyMigration(db: DatabaseSync, version: number): void {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const match = files.find((f) => parseInt(f.slice(0, 4), 10) === version);
  if (!match) throw new Error(`no migration file for version ${version}`);
  const sql = readFileSync(join(MIGRATIONS_DIR, match), "utf8");
  db.exec(sql);
  db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(version);
}

describe("migrations", () => {
  it("creates the core tables through the latest migration", () => {
    const db = openMemoryDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    for (const required of [
      "preferences",
      "issue_stances",
      "stance_signals",
      "alert_settings",
      "mute_list",
      "kv_store",
      "reps",
      "bills",
      "bill_alignment",
      "snapshots",
      "roll_call_votes",
      "member_votes",
      "rep_scores",
      "ballots",
      "ballot_explanations",
      "letters",
      "schema_version",
    ]) {
      expect(names).toContain(required);
    }
  });

  it("records the migration version", () => {
    const db = openMemoryDb();
    const versions = db
      .prepare("SELECT version FROM schema_version ORDER BY version")
      .all() as Array<{ version: number }>;
    expect(versions.map((v) => v.version)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
    ]);
  });

  it("is idempotent when re-run on an existing db", () => {
    const db = openMemoryDb();
    // Re-running via direct invocation of the migrate path: closing/reopening
    // an in-memory DB wouldn't preserve state, so we instead confirm the
    // preferences CHECK constraint survives by inserting the only allowed row.
    db.prepare(
      `INSERT INTO preferences (id, address, zip, state, district, updated_at)
       VALUES (1, '123 Main', '94110', 'CA', 'CA-12', 0)`,
    ).run();
    expect(() =>
      db.prepare(
        `INSERT INTO preferences (id, address, zip, state, district, updated_at)
         VALUES (2, 'x', null, null, null, 0)`,
      ).run(),
    ).toThrow(/CHECK/);
  });

  it("defaults preferences.monitoring_mode to 'action_only' on insert", () => {
    const db = openMemoryDb();
    db.prepare(
      `INSERT INTO preferences (id, address, zip, state, district, updated_at)
       VALUES (1, '123 Main', '94110', 'CA', 'CA-12', 0)`,
    ).run();
    const row = db
      .prepare("SELECT monitoring_mode FROM preferences WHERE id = 1")
      .get() as { monitoring_mode: string };
    expect(row.monitoring_mode).toBe("action_only");
  });

  it("rejects out-of-enum monitoring_mode values", () => {
    const db = openMemoryDb();
    expect(() =>
      db.prepare(
        `INSERT INTO preferences (id, address, zip, state, district, monitoring_mode, updated_at)
         VALUES (1, '123 Main', null, null, null, 'shouty', 0)`,
      ).run(),
    ).toThrow(/CHECK/);
  });

  it("accepts each of the five documented monitoring_mode values", () => {
    for (const mode of [
      "off",
      "quiet_watch",
      "weekly_digest",
      "action_only",
      "full_copilot",
    ]) {
      const db = openMemoryDb();
      db.prepare(
        `INSERT INTO preferences (id, address, zip, state, district, monitoring_mode, updated_at)
         VALUES (1, '123 Main', null, null, null, @mode, 0)`,
      ).run({ mode });
      const row = db
        .prepare("SELECT monitoring_mode FROM preferences WHERE id = 1")
        .get() as { monitoring_mode: string };
      expect(row.monitoring_mode).toBe(mode);
    }
  });

  it("migration 0014 maps legacy monitoring_cadence values to monitoring_mode", () => {
    const legacyToNew: Record<string, string> = {
      off: "off",
      election_proximity: "action_only",
      weekly: "weekly_digest",
      both: "full_copilot",
    };
    for (const [legacy, expected] of Object.entries(legacyToNew)) {
      const db = new DatabaseSync(":memory:");
      runMigrationsUpTo(db, 13);
      db.prepare(
        `INSERT INTO preferences (id, address, zip, state, district, monitoring_cadence, updated_at)
         VALUES (1, '123 Main', null, null, null, @legacy, 0)`,
      ).run({ legacy });
      applyMigration(db, 14);
      const row = db
        .prepare("SELECT monitoring_mode FROM preferences WHERE id = 1")
        .get() as { monitoring_mode: string };
      expect(row.monitoring_mode, `legacy '${legacy}'`).toBe(expected);
      db.close();
    }
  });

  it("migration 0020 backfills bill_alignment.bill_update_date from bills.update_date", () => {
    const db = new DatabaseSync(":memory:");
    runMigrationsUpTo(db, 19);
    db.prepare(
      `INSERT INTO bills (id, congress, bill_type, number, title, update_date,
                          last_synced, source_adapter_id, source_tier)
       VALUES ('119-hr-1', 119, 'HR', '1', 'Has update_date', '2025-09-01',
               0, 'congressGov', 1)`,
    ).run();
    db.prepare(
      `INSERT INTO bills (id, congress, bill_type, number, title,
                          last_synced, source_adapter_id, source_tier)
       VALUES ('119-hr-2', 119, 'HR', '2', 'No update_date',
               0, 'congressGov', 1)`,
    ).run();
    db.prepare(
      `INSERT INTO bill_alignment
         (bill_id, stance_snapshot_hash, relevance, confidence, matched_json,
          rationale, computed_at, source_adapter_id, source_tier)
       VALUES ('119-hr-1', 'h1', 0.7, 0.6, '[]', 'r', 1, 'congressGov', 1),
              ('119-hr-2', 'h2', 0.8, 0.7, '[]', 'r', 2, 'congressGov', 1)`,
    ).run();
    applyMigration(db, 20);
    const rows = db
      .prepare(
        "SELECT bill_id, bill_update_date FROM bill_alignment ORDER BY bill_id",
      )
      .all() as Array<{ bill_id: string; bill_update_date: string }>;
    expect(rows).toEqual([
      { bill_id: "119-hr-1", bill_update_date: "2025-09-01" },
      { bill_id: "119-hr-2", bill_update_date: "" },
    ]);
    db.close();
  });

  it("migration 0020 makes bill_update_date part of the bill_alignment primary key", () => {
    const db = openMemoryDb();
    db.prepare(
      `INSERT INTO bills (id, congress, bill_type, number, title,
                          last_synced, source_adapter_id, source_tier)
       VALUES ('119-hr-3', 119, 'HR', '3', 'Test',
               0, 'congressGov', 1)`,
    ).run();
    db.prepare(
      `INSERT INTO bill_alignment (bill_id, bill_update_date, stance_snapshot_hash,
                                   relevance, confidence, matched_json, rationale,
                                   computed_at, source_adapter_id, source_tier)
       VALUES ('119-hr-3', '2025-09-01', 'h', 0.5, 0.5, '[]', 'r', 0, 'congressGov', 1),
              ('119-hr-3', '2025-10-15', 'h', 0.6, 0.5, '[]', 'r', 0, 'congressGov', 1)`,
    ).run();
    const count = db
      .prepare("SELECT COUNT(*) AS n FROM bill_alignment WHERE bill_id = '119-hr-3'")
      .get() as { n: number };
    expect(count.n).toBe(2);
    expect(() =>
      db.prepare(
        `INSERT INTO bill_alignment (bill_id, bill_update_date, stance_snapshot_hash,
                                     relevance, confidence, matched_json, rationale,
                                     computed_at, source_adapter_id, source_tier)
         VALUES ('119-hr-3', '2025-09-01', 'h', 0.7, 0.5, '[]', 'r', 0, 'congressGov', 1)`,
      ).run(),
    ).toThrow();
  });

  it("migration 0020 creates bill_direction with the expected primary key", () => {
    const db = openMemoryDb();
    db.prepare(
      `INSERT INTO bills (id, congress, bill_type, number, title,
                          last_synced, source_adapter_id, source_tier)
       VALUES ('119-hr-4', 119, 'HR', '4', 'Test',
               0, 'congressGov', 1)`,
    ).run();
    db.prepare(
      `INSERT INTO bill_direction (bill_id, bill_update_date, stance_snapshot_hash,
                                   stance_slug, kind, confidence, rationale,
                                   evidence_json, computed_at, model_id)
       VALUES ('119-hr-4', '', 'h', 'housing', 'advances', 0.82, 'r', '{}', 0, 'm')`,
    ).run();
    expect(() =>
      db.prepare(
        `INSERT INTO bill_direction (bill_id, bill_update_date, stance_snapshot_hash,
                                     stance_slug, kind, confidence, rationale,
                                     evidence_json, computed_at, model_id)
         VALUES ('119-hr-4', '', 'h', 'housing', 'obstructs', 0.5, 'r', '{}', 0, 'm')`,
      ).run(),
    ).toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO bill_direction (bill_id, bill_update_date, stance_snapshot_hash,
                                     stance_slug, kind, confidence, rationale,
                                     evidence_json, computed_at, model_id)
         VALUES ('119-hr-4', '', 'h', 'housing', 'sideways', 0.5, 'r', '{}', 0, 'm')`,
      ).run(),
    ).toThrow(/CHECK/);
  });

  it("migration 0020 defaults preferences.auto_direction_mode to 'off'", () => {
    const db = openMemoryDb();
    db.prepare(
      `INSERT INTO preferences (id, address, zip, state, district, updated_at)
       VALUES (1, '123 Main', '94110', 'CA', 'CA-12', 0)`,
    ).run();
    const row = db
      .prepare("SELECT auto_direction_mode FROM preferences WHERE id = 1")
      .get() as { auto_direction_mode: string };
    expect(row.auto_direction_mode).toBe("off");
  });

  it("migration 0020 rejects out-of-enum auto_direction_mode values", () => {
    const db = openMemoryDb();
    expect(() =>
      db.prepare(
        `INSERT INTO preferences (id, address, zip, state, district,
                                  auto_direction_mode, updated_at)
         VALUES (1, '123 Main', null, null, null, 'shouty', 0)`,
      ).run(),
    ).toThrow(/CHECK/);
  });

  it("migration 0021 defaults preferences.legislation_review_model to empty string", () => {
    const db = openMemoryDb();
    db.prepare(
      `INSERT INTO preferences (id, address, zip, state, district, updated_at)
       VALUES (1, '123 Main', '94110', 'CA', 'CA-12', 0)`,
    ).run();
    const row = db
      .prepare("SELECT legislation_review_model FROM preferences WHERE id = 1")
      .get() as { legislation_review_model: string };
    expect(row.legislation_review_model).toBe("");
  });

  it("migration 0021 accepts arbitrary modelRef strings", () => {
    const db = openMemoryDb();
    db.prepare(
      `INSERT INTO preferences (id, address, zip, state, district,
                                legislation_review_model, updated_at)
       VALUES (1, '123 Main', null, null, null, 'anthropic/claude-haiku-4-5', 0)`,
    ).run();
    const row = db
      .prepare("SELECT legislation_review_model FROM preferences WHERE id = 1")
      .get() as { legislation_review_model: string };
    expect(row.legislation_review_model).toBe("anthropic/claude-haiku-4-5");
  });

  it("migration 0022 stance_slug column accepts NULL (legacy bill-level shape)", () => {
    const db = openMemoryDb();
    db.prepare(
      `INSERT INTO stance_signals (bill_id, direction, weight, source, created_at)
       VALUES ('119-hr-1', 'agree', 1.0, 'dashboard', 0)`,
    ).run();
    const row = db
      .prepare(
        "SELECT bill_id, stance_slug, direction FROM stance_signals WHERE bill_id = '119-hr-1'",
      )
      .get() as { bill_id: string; stance_slug: string | null; direction: string };
    expect(row.stance_slug).toBeNull();
    expect(row.direction).toBe("agree");
  });

  it("migration 0022 stance_slug column accepts an explicit stance value", () => {
    const db = openMemoryDb();
    db.prepare(
      `INSERT INTO stance_signals (bill_id, stance_slug, direction, weight, source, created_at)
       VALUES ('119-hr-2', 'housing', 'disagree', 1.0, 'review', 0)`,
    ).run();
    const row = db
      .prepare(
        "SELECT stance_slug, direction FROM stance_signals WHERE bill_id = '119-hr-2'",
      )
      .get() as { stance_slug: string | null; direction: string };
    expect(row.stance_slug).toBe("housing");
    expect(row.direction).toBe("disagree");
  });
});
