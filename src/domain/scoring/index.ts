import type { PolitiClawDb } from "../../storage/sqlite.js";
import type { BillsResolver } from "../../sources/bills/index.js";
import type { BillRef } from "../../sources/bills/types.js";
import { getBillDetail, type StoredBill } from "../bills/index.js";
import { listIssueStances } from "../preferences/index.js";
import type { IssueStance } from "../preferences/types.js";
import {
  ALIGNMENT_DISCLAIMER,
  CONFIDENCE_FLOOR,
  computeBillAlignment,
  type AlignmentResult,
  type StanceMatch,
} from "./alignment.js";

export { ALIGNMENT_DISCLAIMER, CONFIDENCE_FLOOR };
export type { AlignmentResult, StanceMatch };

export type ScoreBillResult =
  | {
      status: "ok";
      bill: StoredBill;
      alignment: AlignmentResult;
      fromCache: boolean;
      source: { adapterId: string; tier: number };
    }
  | { status: "no_stances"; reason: string; actionable: string }
  | { status: "unavailable"; reason: string; actionable?: string };

export type ScoreBillOptions = {
  refresh?: boolean;
};

export async function scoreBill(
  db: PolitiClawDb,
  resolver: BillsResolver,
  ref: BillRef,
  opts: ScoreBillOptions = {},
): Promise<ScoreBillResult> {
  const stances = listIssueStances(db).map<IssueStance>((row) => ({
    issue: row.issue,
    stance: row.stance,
    weight: row.weight,
  }));

  const detail = await getBillDetail(db, resolver, ref, { refresh: opts.refresh });
  if (detail.status === "unavailable") {
    return {
      status: "unavailable",
      reason: detail.reason,
      actionable: detail.actionable,
    };
  }

  if (stances.length === 0) {
    return {
      status: "no_stances",
      reason: "no declared issue stances",
      actionable: "call politiclaw_set_issue_stance before scoring a bill",
    };
  }

  const alignment = computeBillAlignment(detail.bill, stances);
  persistAlignment(db, detail.bill.id, alignment, detail.source);

  return {
    status: "ok",
    bill: detail.bill,
    alignment,
    fromCache: detail.fromCache,
    source: detail.source,
  };
}

function persistAlignment(
  db: PolitiClawDb,
  billId: string,
  alignment: AlignmentResult,
  source: { adapterId: string; tier: number },
): void {
  db.prepare(
    `INSERT INTO bill_alignment (bill_id, stance_snapshot_hash, relevance, confidence,
                                 matched_json, rationale, computed_at,
                                 source_adapter_id, source_tier)
     VALUES (@bill_id, @hash, @relevance, @confidence, @matched, @rationale,
             @computed_at, @adapter_id, @tier)
     ON CONFLICT(bill_id, stance_snapshot_hash) DO UPDATE SET
       relevance         = excluded.relevance,
       confidence        = excluded.confidence,
       matched_json      = excluded.matched_json,
       rationale         = excluded.rationale,
       computed_at       = excluded.computed_at,
       source_adapter_id = excluded.source_adapter_id,
       source_tier       = excluded.source_tier`,
  ).run({
    bill_id: billId,
    hash: alignment.stanceSnapshotHash,
    relevance: alignment.relevance,
    confidence: alignment.confidence,
    matched: JSON.stringify(alignment.matches),
    rationale: alignment.rationale,
    computed_at: Date.now(),
    adapter_id: source.adapterId,
    tier: source.tier,
  });
}

export type StoredAlignment = {
  billId: string;
  stanceSnapshotHash: string;
  relevance: number;
  confidence: number;
  matches: StanceMatch[];
  rationale: string;
  computedAt: number;
  sourceAdapterId: string;
  sourceTier: number;
};

export function readStoredAlignment(
  db: PolitiClawDb,
  billId: string,
  stanceSnapshotHash: string,
): StoredAlignment | null {
  const row = db
    .prepare(
      `SELECT bill_id, stance_snapshot_hash, relevance, confidence, matched_json,
              rationale, computed_at, source_adapter_id, source_tier
         FROM bill_alignment
         WHERE bill_id = @bill_id AND stance_snapshot_hash = @hash`,
    )
    .get({ bill_id: billId, hash: stanceSnapshotHash }) as
    | {
        bill_id: string;
        stance_snapshot_hash: string;
        relevance: number;
        confidence: number;
        matched_json: string;
        rationale: string;
        computed_at: number;
        source_adapter_id: string;
        source_tier: number;
      }
    | undefined;
  if (!row) return null;
  return {
    billId: row.bill_id,
    stanceSnapshotHash: row.stance_snapshot_hash,
    relevance: row.relevance,
    confidence: row.confidence,
    matches: JSON.parse(row.matched_json) as StanceMatch[],
    rationale: row.rationale,
    computedAt: row.computed_at,
    sourceAdapterId: row.source_adapter_id,
    sourceTier: row.source_tier,
  };
}
