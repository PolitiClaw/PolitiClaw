import { describe, expect, it } from "vitest";
import { openMemoryDb, type PolitiClawDb } from "../../storage/sqlite.js";
import { recordStanceSignal, upsertIssueStance } from "../preferences/index.js";
import { listReps } from "../reps/index.js";
import {
  readStoredRepScores,
  scoreRepresentative,
} from "./index.js";
import { hashStanceSnapshot } from "./stanceHash.js";

function stanceHash(
  stances: Array<{
    issue: string;
    stance: "support" | "oppose" | "neutral";
    weight: number;
    note?: string;
    sourceText?: string;
  }>,
): string {
  return hashStanceSnapshot(stances);
}

function insertRep(
  db: PolitiClawDb,
  rep: {
    id: string;
    name: string;
    office?: string;
    state?: string;
    district?: string;
    adapterId?: string;
    tier?: number;
  },
): void {
  db.prepare(
    `INSERT INTO reps
       (id, name, office, party, jurisdiction, district, state, contact,
        last_synced, source_adapter_id, source_tier, raw)
     VALUES
       (@id, @name, @office, NULL, NULL, @district, @state, NULL,
        @last_synced, @adapter_id, @tier, '{}')`,
  ).run({
    id: rep.id,
    name: rep.name,
    office: rep.office ?? "US House",
    district: rep.district ?? "12",
    state: rep.state ?? "CA",
    last_synced: Date.now(),
    adapter_id: rep.adapterId ?? "congressLegislators",
    tier: rep.tier ?? 1,
  });
}

function insertBill(db: PolitiClawDb, id: string, title = "Test Bill"): void {
  db.prepare(
    `INSERT INTO bills
       (id, congress, bill_type, number, title, last_synced, source_adapter_id, source_tier)
     VALUES
       (@id, 119, 'HR', @number, @title, @last_synced, 'congressGov', 1)`,
  ).run({
    id,
    number: id.split("-")[2] ?? "1",
    title,
    last_synced: Date.now(),
  });
}

function insertBillAlignment(
  db: PolitiClawDb,
  opts: {
    billId: string;
    hash: string;
    relevance: number;
    matches: Array<{
      issue: string;
      stance: "support" | "oppose" | "neutral";
      stanceWeight: number;
      location: "policyArea" | "subject" | "title" | "summary";
      matchedText: string;
    }>;
  },
): void {
  db.prepare(
    `INSERT INTO bill_alignment
       (bill_id, bill_update_date, stance_snapshot_hash, relevance, confidence,
        matched_json, rationale, computed_at, source_adapter_id, source_tier)
     VALUES
       (@bill_id, '', @hash, @relevance, 0.6,
        @matched, 'test rationale', @computed_at, 'congressGov', 1)`,
  ).run({
    bill_id: opts.billId,
    hash: opts.hash,
    relevance: opts.relevance,
    matched: JSON.stringify(opts.matches),
    computed_at: Date.now(),
  });
}

function insertRollCallAndVote(
  db: PolitiClawDb,
  opts: {
    voteId: string;
    billId: string;
    rollCall: number;
    bioguideId: string;
    position: "Yea" | "Nay" | "Present" | "Not Voting";
    isProcedural?: boolean | null;
    chamber?: "House" | "Senate";
  },
): void {
  db.prepare(
    `INSERT INTO roll_call_votes
       (id, chamber, congress, session, roll_call_number,
        bill_id, is_procedural, source_adapter_id, source_tier, synced_at)
     VALUES
       (@id, @chamber, 119, 1, @roll_call, @bill_id, @is_procedural,
        'congressGov', 1, @synced_at)`,
  ).run({
    id: opts.voteId,
    chamber: opts.chamber ?? "House",
    roll_call: opts.rollCall,
    bill_id: opts.billId,
    is_procedural:
      opts.isProcedural === null
        ? null
        : opts.isProcedural === true
          ? 1
          : 0,
    synced_at: Date.now(),
  });
  db.prepare(
    `INSERT INTO member_votes
       (vote_id, bioguide_id, position, first_name, last_name, party, state)
     VALUES
       (@vote_id, @bioguide, @position, 'A', 'B', 'D', 'CA')`,
  ).run({
    vote_id: opts.voteId,
    bioguide: opts.bioguideId,
    position: opts.position,
  });
}

function seedMinimalScenario(
  db: PolitiClawDb,
  opts: {
    bioguide: string;
    stance: { issue: string; stance: "support" | "oppose"; weight: number };
    bills: Array<{
      billId: string;
      signalDirection: "agree" | "disagree";
      repPosition: "Yea" | "Nay" | "Present" | "Not Voting";
      isProcedural?: boolean | null;
      relevance?: number;
    }>;
  },
): string {
  upsertIssueStance(db, opts.stance);
  insertRep(db, { id: opts.bioguide, name: "Rep Test" });

  const hash = stanceHash([opts.stance]);
  let voteNumber = 1;
  for (const bill of opts.bills) {
    insertBill(db, bill.billId);
    insertBillAlignment(db, {
      billId: bill.billId,
      hash,
      relevance: bill.relevance ?? 0.8,
      matches: [
        {
          issue: opts.stance.issue,
          stance: opts.stance.stance,
          stanceWeight: opts.stance.weight,
          location: "subject",
          matchedText: `subject '${opts.stance.issue}'`,
        },
      ],
    });
    recordStanceSignal(db, {
      billId: bill.billId,
      direction: bill.signalDirection,
      weight: 1,
      source: "onboarding",
    });
    insertRollCallAndVote(db, {
      voteId: `House-119-1-${voteNumber}`,
      billId: bill.billId,
      rollCall: voteNumber,
      bioguideId: opts.bioguide,
      position: bill.repPosition,
      isProcedural: bill.isProcedural,
    });
    voteNumber += 1;
  }
  return hash;
}

describe("scoreRepresentative", () => {
  it("returns no_stances when the user hasn't declared any", () => {
    const db = openMemoryDb();
    insertRep(db, { id: "B000001", name: "Rep Test" });
    const result = scoreRepresentative(db, "B000001");
    expect(result.status).toBe("no_stances");
  });

  it("returns rep_not_found when the bioguide is not in the reps table", () => {
    const db = openMemoryDb();
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    const result = scoreRepresentative(db, "NONEXISTENT");
    expect(result.status).toBe("rep_not_found");
  });

  it("produces an aligned score when rep voted Yea on bills the user signalled agree", () => {
    const db = openMemoryDb();
    seedMinimalScenario(db, {
      bioguide: "B000002",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Yea" },
        { billId: "119-hr-11", signalDirection: "agree", repPosition: "Yea" },
        { billId: "119-hr-12", signalDirection: "agree", repPosition: "Yea" },
      ],
    });

    const result = scoreRepresentative(db, "B000002");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const housing = result.perIssue.find((issue) => issue.issue === "housing");
    expect(housing).toBeDefined();
    expect(housing!.alignedCount).toBe(3);
    expect(housing!.conflictedCount).toBe(0);
    expect(housing!.alignmentScore).toBe(1);
    expect(housing!.belowConfidenceFloor).toBe(false);
    expect(result.consideredVoteCount).toBe(3);
  });

  it("produces a conflicted score when rep voted opposite to user's signals", () => {
    const db = openMemoryDb();
    seedMinimalScenario(db, {
      bioguide: "B000003",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Nay" },
        { billId: "119-hr-11", signalDirection: "agree", repPosition: "Nay" },
      ],
    });
    const result = scoreRepresentative(db, "B000003");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const housing = result.perIssue[0]!;
    expect(housing.conflictedCount).toBe(2);
    expect(housing.alignedCount).toBe(0);
    expect(housing.alignmentScore).toBe(0);
  });

  it("excludes procedural votes by default", () => {
    const db = openMemoryDb();
    seedMinimalScenario(db, {
      bioguide: "B000004",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Yea", isProcedural: true },
        { billId: "119-hr-11", signalDirection: "agree", repPosition: "Yea", isProcedural: false },
        { billId: "119-hr-12", signalDirection: "agree", repPosition: "Nay", isProcedural: false },
      ],
    });

    const result = scoreRepresentative(db, "B000004");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.skippedProceduralCount).toBe(1);
    const housing = result.perIssue[0]!;
    expect(housing.consideredCount).toBe(2);
  });

  it("includes procedural votes when excludeProcedural=false (opt-in)", () => {
    const db = openMemoryDb();
    seedMinimalScenario(db, {
      bioguide: "B000005",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Yea", isProcedural: true },
        { billId: "119-hr-11", signalDirection: "agree", repPosition: "Yea", isProcedural: false },
      ],
    });

    const result = scoreRepresentative(db, "B000005", { excludeProcedural: false });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.skippedProceduralCount).toBe(0);
    expect(result.perIssue[0]!.consideredCount).toBe(2);
    expect(result.proceduralExcluded).toBe(false);
  });

  it("persists procedural_excluded consistent with excludeProcedural option", () => {
    const db = openMemoryDb();
    seedMinimalScenario(db, {
      bioguide: "B000015",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Yea", isProcedural: false },
      ],
    });
    const snapshotHash = stanceHash([{ issue: "housing", stance: "support", weight: 4 }]);

    scoreRepresentative(db, "B000015", { excludeProcedural: false });
    const whenIncluded = db
      .prepare(
        `SELECT procedural_excluded FROM rep_scores
          WHERE rep_id = @id AND stance_snapshot_hash = @hash AND issue = @issue`,
      )
      .get({ id: "B000015", hash: snapshotHash, issue: "housing" }) as {
      procedural_excluded: number;
    };
    expect(whenIncluded.procedural_excluded).toBe(0);

    scoreRepresentative(db, "B000015", { excludeProcedural: true });
    const whenExcluded = db
      .prepare(
        `SELECT procedural_excluded FROM rep_scores
          WHERE rep_id = @id AND stance_snapshot_hash = @hash AND issue = @issue`,
      )
      .get({ id: "B000015", hash: snapshotHash, issue: "housing" }) as {
      procedural_excluded: number;
    };
    expect(whenExcluded.procedural_excluded).toBe(1);
  });

  it("treats is_procedural=NULL as procedural (unknown → excluded by default)", () => {
    const db = openMemoryDb();
    seedMinimalScenario(db, {
      bioguide: "B000006",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Yea", isProcedural: null },
        { billId: "119-hr-11", signalDirection: "agree", repPosition: "Yea", isProcedural: false },
      ],
    });

    const result = scoreRepresentative(db, "B000006");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.skippedProceduralCount).toBe(1);
    expect(result.perIssue[0]!.consideredCount).toBe(1);
  });

  it("reports missing-signal coverage when bills touched stances but user didn't signal", () => {
    const db = openMemoryDb();
    const stance = { issue: "housing", stance: "support" as const, weight: 4 };
    upsertIssueStance(db, stance);
    insertRep(db, { id: "B000007", name: "Rep Test" });
    const hash = stanceHash([stance]);

    insertBill(db, "119-hr-10");
    insertBill(db, "119-hr-11");
    for (const billId of ["119-hr-10", "119-hr-11"]) {
      insertBillAlignment(db, {
        billId,
        hash,
        relevance: 0.7,
        matches: [
          {
            issue: "housing",
            stance: "support",
            stanceWeight: 4,
            location: "subject",
            matchedText: "subject 'housing'",
          },
        ],
      });
    }
    // Only signal one of them.
    recordStanceSignal(db, {
      billId: "119-hr-10",
      direction: "agree",
      weight: 1,
      source: "onboarding",
    });
    insertRollCallAndVote(db, {
      voteId: "House-119-1-1",
      billId: "119-hr-10",
      rollCall: 1,
      bioguideId: "B000007",
      position: "Yea",
      isProcedural: false,
    });

    const result = scoreRepresentative(db, "B000007");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.missingSignalBillCount).toBe(1);
  });

  it("reports bills-without-rep-votes when user signalled but rep has no matching roll-call", () => {
    const db = openMemoryDb();
    const stance = { issue: "housing", stance: "support" as const, weight: 4 };
    upsertIssueStance(db, stance);
    insertRep(db, { id: "B000008", name: "Rep Test" });
    const hash = stanceHash([stance]);

    insertBill(db, "119-hr-10");
    insertBill(db, "119-hr-11");
    for (const billId of ["119-hr-10", "119-hr-11"]) {
      insertBillAlignment(db, {
        billId,
        hash,
        relevance: 0.7,
        matches: [
          {
            issue: "housing",
            stance: "support",
            stanceWeight: 4,
            location: "subject",
            matchedText: "subject 'housing'",
          },
        ],
      });
      recordStanceSignal(db, {
        billId,
        direction: "agree",
        weight: 1,
        source: "onboarding",
      });
    }
    // Rep voted on only one of the two signalled bills.
    insertRollCallAndVote(db, {
      voteId: "House-119-1-1",
      billId: "119-hr-10",
      rollCall: 1,
      bioguideId: "B000008",
      position: "Yea",
      isProcedural: false,
    });

    const result = scoreRepresentative(db, "B000008");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.billsWithoutRepVotes).toBe(1);
  });

  it("persists rep_scores keyed by (rep_id, stance_snapshot_hash, issue)", () => {
    const db = openMemoryDb();
    const hash = seedMinimalScenario(db, {
      bioguide: "B000009",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Yea" },
        { billId: "119-hr-11", signalDirection: "agree", repPosition: "Yea" },
      ],
    });

    const result = scoreRepresentative(db, "B000009");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const stored = readStoredRepScores(db, "B000009", hash);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.issue).toBe("housing");
    expect(stored[0]!.alignedCount).toBe(2);
    expect(stored[0]!.citedBills.map((bill) => bill.billId)).toEqual(["119-hr-10", "119-hr-11"]);
  });

  it("keeps older scores when user edits stances (snapshot hash is part of PK)", () => {
    const db = openMemoryDb();
    const oldHash = seedMinimalScenario(db, {
      bioguide: "B000010",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Yea" },
        { billId: "119-hr-11", signalDirection: "agree", repPosition: "Yea" },
      ],
    });
    const first = scoreRepresentative(db, "B000010");
    expect(first.status).toBe("ok");

    // Edit the stance list — different weight ⇒ different hash.
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 5 });
    // Re-insert bill_alignment for the new hash (otherwise there's nothing to score against).
    const newHash = stanceHash([{ issue: "housing", stance: "support", weight: 5 }]);
    for (const billId of ["119-hr-10", "119-hr-11"]) {
      insertBillAlignment(db, {
        billId,
        hash: newHash,
        relevance: 0.8,
        matches: [
          {
            issue: "housing",
            stance: "support",
            stanceWeight: 5,
            location: "subject",
            matchedText: "subject 'housing'",
          },
        ],
      });
    }
    scoreRepresentative(db, "B000010");

    expect(readStoredRepScores(db, "B000010", oldHash)).toHaveLength(1);
    expect(readStoredRepScores(db, "B000010", newHash)).toHaveLength(1);
  });

  it("filters evidence to the current stance set (stale matched_json issues are ignored)", () => {
    const db = openMemoryDb();
    const currentStance = { issue: "housing", stance: "support" as const, weight: 4 };
    upsertIssueStance(db, currentStance);
    insertRep(db, { id: "B000011", name: "Rep Test" });
    const hash = stanceHash([currentStance]);

    // Bill alignment stored under the current hash, but matched_json references
    // an issue that's not in the current stance set (simulating a drift).
    insertBill(db, "119-hr-10");
    insertBillAlignment(db, {
      billId: "119-hr-10",
      hash,
      relevance: 0.8,
      matches: [
        {
          issue: "not-current-stance",
          stance: "support",
          stanceWeight: 3,
          location: "subject",
          matchedText: "subject 'something-else'",
        },
      ],
    });
    recordStanceSignal(db, {
      billId: "119-hr-10",
      direction: "agree",
      weight: 1,
      source: "onboarding",
    });
    insertRollCallAndVote(db, {
      voteId: "House-119-1-1",
      billId: "119-hr-10",
      rollCall: 1,
      bioguideId: "B000011",
      position: "Yea",
      isProcedural: false,
    });

    const result = scoreRepresentative(db, "B000011");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // The single vote was filtered out because its matched issue isn't in the stance list.
    expect(result.consideredVoteCount).toBe(0);
    expect(result.perIssue[0]!.belowConfidenceFloor).toBe(true);
  });

  it("rep lookup is tolerant of listReps ordering (uses exact id match, not array index)", () => {
    const db = openMemoryDb();
    insertRep(db, { id: "B000012", name: "Senator One", office: "US Senate", district: undefined });
    insertRep(db, { id: "B000013", name: "Rep Two" });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });

    const first = scoreRepresentative(db, "B000013");
    expect(first.status).toBe("ok");
    if (first.status !== "ok") return;
    expect(first.rep.id).toBe("B000013");
  });

  it("uses the latest stance signal when multiple exist for the same bill", () => {
    const db = openMemoryDb();
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    insertRep(db, { id: "B000014", name: "Rep Test" });
    const hash = stanceHash([{ issue: "housing", stance: "support", weight: 4 }]);

    insertBill(db, "119-hr-10");
    insertBillAlignment(db, {
      billId: "119-hr-10",
      hash,
      relevance: 0.8,
      matches: [
        {
          issue: "housing",
          stance: "support",
          stanceWeight: 4,
          location: "subject",
          matchedText: "subject 'housing'",
        },
      ],
    });
    // Older signal (disagree), newer signal (agree). Latest should win.
    recordStanceSignal(db, {
      billId: "119-hr-10",
      direction: "disagree",
      weight: 1,
      source: "onboarding",
    });
    recordStanceSignal(db, {
      billId: "119-hr-10",
      direction: "agree",
      weight: 1,
      source: "monitoring",
    });
    insertRollCallAndVote(db, {
      voteId: "House-119-1-1",
      billId: "119-hr-10",
      rollCall: 1,
      bioguideId: "B000014",
      position: "Yea",
      isProcedural: false,
    });
    // Need at least 2 considered votes to get above the 1-vote noise floor,
    // so add a second independent bill+signal+vote.
    insertBill(db, "119-hr-11");
    insertBillAlignment(db, {
      billId: "119-hr-11",
      hash,
      relevance: 0.8,
      matches: [
        {
          issue: "housing",
          stance: "support",
          stanceWeight: 4,
          location: "subject",
          matchedText: "subject 'housing'",
        },
      ],
    });
    recordStanceSignal(db, {
      billId: "119-hr-11",
      direction: "agree",
      weight: 1,
      source: "onboarding",
    });
    insertRollCallAndVote(db, {
      voteId: "House-119-1-2",
      billId: "119-hr-11",
      rollCall: 2,
      bioguideId: "B000014",
      position: "Yea",
      isProcedural: false,
    });

    const result = scoreRepresentative(db, "B000014");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // Both bills should count as aligned (latest signal on bill 10 was 'agree' + repPosition Yea).
    expect(result.perIssue[0]!.alignedCount).toBe(2);
    expect(result.perIssue[0]!.conflictedCount).toBe(0);
  });

  describe("auto_direction_mode integration", () => {
    function seedClassifiedBill(
      db: PolitiClawDb,
      params: {
        billId: string;
        hash: string;
        stanceSlug: string;
        repId: string;
        repPosition: "Yea" | "Nay";
        kind: "advances" | "obstructs" | "mixed" | "unclear";
        confidence: number;
      },
    ): void {
      insertBill(db, params.billId);
      insertBillAlignment(db, {
        billId: params.billId,
        hash: params.hash,
        relevance: 0.8,
        matches: [
          {
            issue: params.stanceSlug,
            stance: "support",
            stanceWeight: 4,
            location: "subject",
            matchedText: `subject '${params.stanceSlug}'`,
          },
        ],
      });
      db.prepare(
        `INSERT INTO bill_direction
           (bill_id, bill_update_date, stance_snapshot_hash, stance_slug,
            kind, confidence, rationale, evidence_json, computed_at, model_id)
         VALUES (@bill_id, '', @hash, @slug, @kind, @conf, 'r', '{}', @now, 'test')`,
      ).run({
        bill_id: params.billId,
        hash: params.hash,
        slug: params.stanceSlug,
        kind: params.kind,
        conf: params.confidence,
        now: Date.now(),
      });
      const voteRoll = parseInt(params.billId.split("-").pop() ?? "0", 10);
      insertRollCallAndVote(db, {
        voteId: `House-119-1-${voteRoll}`,
        billId: params.billId,
        rollCall: voteRoll,
        bioguideId: params.repId,
        position: params.repPosition,
        isProcedural: false,
      });
    }

    function setMode(db: PolitiClawDb, mode: "off" | "supplement" | "co-equal" | "advisory"): void {
      db.prepare(
        `INSERT INTO preferences (id, address, updated_at, auto_direction_mode)
         VALUES (1, '123 Main', 0, @mode)
         ON CONFLICT(id) DO UPDATE SET auto_direction_mode = excluded.auto_direction_mode`,
      ).run({ mode });
    }

    it("mode='off' ignores bill_direction rows even when present (preserves legacy behavior)", () => {
      const db = openMemoryDb();
      const stance = { issue: "housing", stance: "support" as const, weight: 4 };
      upsertIssueStance(db, stance);
      insertRep(db, { id: "B000020", name: "Rep Test" });
      setMode(db, "off");
      const hash = stanceHash([stance]);
      seedClassifiedBill(db, {
        billId: "119-hr-1",
        hash,
        stanceSlug: "housing",
        repId: "B000020",
        repPosition: "Yea",
        kind: "advances",
        confidence: 0.9,
      });
      // No user signal — with mode='off' the bill should not count.
      const result = scoreRepresentative(db, "B000020");
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      expect(result.perIssue[0]!.consideredCount).toBe(0);
    });

    it("mode='co-equal' counts a high-confidence advances classification as 'agree' when no user signal exists", () => {
      const db = openMemoryDb();
      const stance = { issue: "housing", stance: "support" as const, weight: 4 };
      upsertIssueStance(db, stance);
      insertRep(db, { id: "B000021", name: "Rep Test" });
      setMode(db, "co-equal");
      const hash = stanceHash([stance]);
      seedClassifiedBill(db, {
        billId: "119-hr-2",
        hash,
        stanceSlug: "housing",
        repId: "B000021",
        repPosition: "Yea",
        kind: "advances",
        confidence: 0.85,
      });
      const result = scoreRepresentative(db, "B000021");
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      expect(result.perIssue[0]!.alignedCount).toBe(1);
      expect(result.perIssue[0]!.conflictedCount).toBe(0);
    });

    it("mode='co-equal' counts high-confidence obstructs as 'disagree' (rep voting Nay aligns)", () => {
      const db = openMemoryDb();
      const stance = { issue: "housing", stance: "support" as const, weight: 4 };
      upsertIssueStance(db, stance);
      insertRep(db, { id: "B000022", name: "Rep Test" });
      setMode(db, "co-equal");
      const hash = stanceHash([stance]);
      seedClassifiedBill(db, {
        billId: "119-hr-3",
        hash,
        stanceSlug: "housing",
        repId: "B000022",
        repPosition: "Nay",
        kind: "obstructs",
        confidence: 0.9,
      });
      const result = scoreRepresentative(db, "B000022");
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      // Rep voted Nay; classifier said obstructs (so user-implied is disagree/Nay).
      // Rep agrees with user-implied position → aligned.
      expect(result.perIssue[0]!.alignedCount).toBe(1);
      expect(result.perIssue[0]!.conflictedCount).toBe(0);
    });

    it("mode='co-equal' does not count mid-confidence classifications", () => {
      const db = openMemoryDb();
      const stance = { issue: "housing", stance: "support" as const, weight: 4 };
      upsertIssueStance(db, stance);
      insertRep(db, { id: "B000023", name: "Rep Test" });
      setMode(db, "co-equal");
      const hash = stanceHash([stance]);
      seedClassifiedBill(db, {
        billId: "119-hr-4",
        hash,
        stanceSlug: "housing",
        repId: "B000023",
        repPosition: "Yea",
        kind: "advances",
        confidence: 0.6,
      });
      const result = scoreRepresentative(db, "B000023");
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      expect(result.perIssue[0]!.consideredCount).toBe(0);
    });

    it("mode='advisory' never counts the classifier — only user signals", () => {
      const db = openMemoryDb();
      const stance = { issue: "housing", stance: "support" as const, weight: 4 };
      upsertIssueStance(db, stance);
      insertRep(db, { id: "B000024", name: "Rep Test" });
      setMode(db, "advisory");
      const hash = stanceHash([stance]);
      seedClassifiedBill(db, {
        billId: "119-hr-5",
        hash,
        stanceSlug: "housing",
        repId: "B000024",
        repPosition: "Yea",
        kind: "advances",
        confidence: 0.9,
      });
      const result = scoreRepresentative(db, "B000024");
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      expect(result.perIssue[0]!.consideredCount).toBe(0);
    });

    it("user signal overrides classifier in supplement mode", () => {
      const db = openMemoryDb();
      const stance = { issue: "housing", stance: "support" as const, weight: 4 };
      upsertIssueStance(db, stance);
      insertRep(db, { id: "B000025", name: "Rep Test" });
      setMode(db, "supplement");
      const hash = stanceHash([stance]);
      seedClassifiedBill(db, {
        billId: "119-hr-6",
        hash,
        stanceSlug: "housing",
        repId: "B000025",
        repPosition: "Yea",
        kind: "advances",  // classifier would say agree
        confidence: 0.9,
      });
      // User explicitly disagrees — overrides the classifier.
      recordStanceSignal(db, {
        billId: "119-hr-6",
        direction: "disagree",
        weight: 1,
        source: "dashboard",
      });
      const result = scoreRepresentative(db, "B000025");
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      // User said disagree → expected Nay; rep voted Yea → conflicted.
      expect(result.perIssue[0]!.conflictedCount).toBe(1);
      expect(result.perIssue[0]!.alignedCount).toBe(0);
    });

    it("ignores stale direction rows from prior bill_update_date (only current version classifications count)", () => {
      const db = openMemoryDb();
      const stance = { issue: "housing", stance: "support" as const, weight: 4 };
      upsertIssueStance(db, stance);
      insertRep(db, { id: "B000026", name: "Rep Test" });
      setMode(db, "co-equal");
      const hash = stanceHash([stance]);

      // Insert bill with an update_date.
      db.prepare(
        `UPDATE bills SET update_date = '2026-03-01' WHERE id = '119-hr-7'`,
      ).run();
      insertBill(db, "119-hr-7");
      db.prepare(
        `UPDATE bills SET update_date = '2026-03-01' WHERE id = '119-hr-7'`,
      ).run();
      insertBillAlignment(db, {
        billId: "119-hr-7",
        hash,
        relevance: 0.8,
        matches: [
          {
            issue: "housing",
            stance: "support",
            stanceWeight: 4,
            location: "subject",
            matchedText: "subject 'housing'",
          },
        ],
      });
      // Stale classification row at OLDER update_date.
      db.prepare(
        `INSERT INTO bill_direction
           (bill_id, bill_update_date, stance_snapshot_hash, stance_slug,
            kind, confidence, rationale, evidence_json, computed_at, model_id)
         VALUES ('119-hr-7', '2026-01-15', @hash, 'housing', 'advances', 0.9, 'r', '{}', 0, 'test')`,
      ).run({ hash });
      insertRollCallAndVote(db, {
        voteId: "House-119-1-7",
        billId: "119-hr-7",
        rollCall: 7,
        bioguideId: "B000026",
        position: "Yea",
        isProcedural: false,
      });

      const result = scoreRepresentative(db, "B000026");
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      // Stale row should be ignored — bill not counted.
      expect(result.perIssue[0]!.consideredCount).toBe(0);
    });

    it("per-stance signals scope correctly when one bill matches two stances with conflicting AI calls", () => {
      // The reviewer's headline scenario: a bill is `advances` for one
      // stance and `obstructs` for another. Promoting just the `advances`
      // call must not stamp `agree` onto the `obstructs` stance too.
      const db = openMemoryDb();
      const housing = { issue: "housing", stance: "support" as const, weight: 4 };
      const taxation = { issue: "taxation", stance: "oppose" as const, weight: 3 };
      upsertIssueStance(db, housing);
      upsertIssueStance(db, taxation);
      insertRep(db, { id: "B000027", name: "Rep Test" });
      setMode(db, "co-equal");
      const hash = stanceHash([housing, taxation]);

      insertBill(db, "119-hr-50");
      insertBillAlignment(db, {
        billId: "119-hr-50",
        hash,
        relevance: 0.8,
        matches: [
          {
            issue: "housing",
            stance: "support",
            stanceWeight: 4,
            location: "subject",
            matchedText: "subject 'housing'",
          },
          {
            issue: "taxation",
            stance: "oppose",
            stanceWeight: 3,
            location: "subject",
            matchedText: "subject 'taxation'",
          },
        ],
      });
      // High-confidence directions in conflicting directions for this bill.
      db.prepare(
        `INSERT INTO bill_direction
           (bill_id, bill_update_date, stance_snapshot_hash, stance_slug,
            kind, confidence, rationale, evidence_json, computed_at, model_id)
         VALUES
           ('119-hr-50', '', @hash, 'housing', 'advances', 0.9, 'r', '{}', 0, 'test'),
           ('119-hr-50', '', @hash, 'taxation', 'obstructs', 0.85, 'r', '{}', 0, 'test')`,
      ).run({ hash });
      insertRollCallAndVote(db, {
        voteId: "House-119-1-50",
        billId: "119-hr-50",
        rollCall: 50,
        bioguideId: "B000027",
        position: "Yea",
        isProcedural: false,
      });

      // Simulate the user promoting only the `housing` AI call — emulating
      // a per-stance recordStanceSignal write that politiclaw_resolve_auto_rating
      // would now produce.
      recordStanceSignal(db, {
        billId: "119-hr-50",
        direction: "agree",
        weight: 1,
        source: "review",
        stanceSlug: "housing",
      });

      const result = scoreRepresentative(db, "B000027");
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      const housingIssue = result.perIssue.find((i) => i.issue === "housing");
      const taxationIssue = result.perIssue.find((i) => i.issue === "taxation");
      // Housing: per-stance user signal `agree` + rep voted Yea → aligned.
      expect(housingIssue?.alignedCount).toBe(1);
      expect(housingIssue?.conflictedCount).toBe(0);
      // Taxation: no per-stance signal exists; classifier said `obstructs`
      // (high confidence) under co-equal mode → user-implied disagree/Nay.
      // Rep voted Yea → conflicted. Critically, the housing `agree` does
      // NOT leak into taxation: the per-stance lookup wins.
      expect(taxationIssue?.alignedCount).toBe(0);
      expect(taxationIssue?.conflictedCount).toBe(1);
    });

    it("per-stance signal preempts bill-level signal for that stance only", () => {
      // Bill-level signal exists; a per-stance signal also exists. The
      // per-stance signal must win for its stance; the bill-level signal
      // must still apply to the other matched stances.
      const db = openMemoryDb();
      const housing = { issue: "housing", stance: "support" as const, weight: 4 };
      const taxation = { issue: "taxation", stance: "oppose" as const, weight: 3 };
      upsertIssueStance(db, housing);
      upsertIssueStance(db, taxation);
      insertRep(db, { id: "B000028", name: "Rep Test" });
      setMode(db, "off");
      const hash = stanceHash([housing, taxation]);

      insertBill(db, "119-hr-51");
      insertBillAlignment(db, {
        billId: "119-hr-51",
        hash,
        relevance: 0.8,
        matches: [
          {
            issue: "housing",
            stance: "support",
            stanceWeight: 4,
            location: "subject",
            matchedText: "subject 'housing'",
          },
          {
            issue: "taxation",
            stance: "oppose",
            stanceWeight: 3,
            location: "subject",
            matchedText: "subject 'taxation'",
          },
        ],
      });
      insertRollCallAndVote(db, {
        voteId: "House-119-1-51",
        billId: "119-hr-51",
        rollCall: 51,
        bioguideId: "B000028",
        position: "Yea",
        isProcedural: false,
      });

      // Bill-level: agree (applies to every matched stance by default).
      recordStanceSignal(db, {
        billId: "119-hr-51",
        direction: "agree",
        weight: 1,
        source: "dashboard",
      });
      // Per-stance: user explicitly disagrees on housing only.
      recordStanceSignal(db, {
        billId: "119-hr-51",
        direction: "disagree",
        weight: 1,
        source: "review",
        stanceSlug: "housing",
      });

      const result = scoreRepresentative(db, "B000028");
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      const housingIssue = result.perIssue.find((i) => i.issue === "housing");
      const taxationIssue = result.perIssue.find((i) => i.issue === "taxation");
      // Housing: per-stance disagree → expected Nay; rep voted Yea → conflicted.
      expect(housingIssue?.conflictedCount).toBe(1);
      expect(housingIssue?.alignedCount).toBe(0);
      // Taxation: no per-stance signal → falls back to bill-level agree;
      // rep voted Yea → aligned.
      expect(taxationIssue?.alignedCount).toBe(1);
      expect(taxationIssue?.conflictedCount).toBe(0);
    });
  });
});

// Ensure listReps/insertRep helper actually persists (smoke — the real behaviour is
// exercised in src/domain/reps/ tests; this guards the test-helper itself).
describe("test harness", () => {
  it("insertRep round-trips via listReps", () => {
    const db = openMemoryDb();
    insertRep(db, { id: "B999", name: "Rep Smoke" });
    expect(listReps(db).map((rep) => rep.id)).toContain("B999");
  });
});
