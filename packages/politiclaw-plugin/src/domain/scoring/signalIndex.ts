/**
 * Per-(bill, stance) lookup for the latest user-recorded direction in
 * `stance_signals`. The table itself is single-flat-table append-only, so
 * "latest" is decided by the largest `(created_at, id)` tuple per
 * `(bill_id, stance_slug)` pair (NULL stance_slug = bill-level).
 *
 * Resolution rule (used by `lookupUserSignal`): a per-stance signal for
 * the matching `(bill_id, stance_slug)` pair wins; otherwise the latest
 * bill-level signal for `bill_id` wins; otherwise null.
 *
 * Both rep-alignment scoring and the review tool need this lookup, so it
 * lives here as a small, pure module rather than being duplicated.
 */
import type { PolitiClawDb } from "../../storage/sqlite.js";

export type UserSignal = {
  direction: "agree" | "disagree";
  weight: number;
  /**
   * Where in the lookup chain this row was found. Useful for surfaces
   * (e.g. the review tool) that need to disclose whether a signal applies
   * to the specific stance under review or to the bill as a whole.
   */
  scope: "stance" | "bill";
};

type SignalIndexEntry = {
  byStance: Map<string, UserSignal>;
  billLevel: UserSignal | null;
};

export type SignalIndex = ReadonlyMap<string, SignalIndexEntry>;

export function readSignalIndex(db: PolitiClawDb): SignalIndex {
  // ORDER BY recency means the first row we see for a (bill, stance_slug)
  // pair is the latest user-recorded signal; later rows for the same
  // pair are older edits and ignored.
  const rows = db
    .prepare(
      `SELECT bill_id, stance_slug, direction, weight
         FROM stance_signals
        WHERE bill_id IS NOT NULL
          AND direction IN ('agree','disagree')
        ORDER BY created_at DESC, id DESC`,
    )
    .all() as Array<{
      bill_id: string;
      stance_slug: string | null;
      direction: "agree" | "disagree";
      weight: number;
    }>;

  const out = new Map<string, SignalIndexEntry>();
  for (const row of rows) {
    let bucket = out.get(row.bill_id);
    if (!bucket) {
      bucket = { byStance: new Map(), billLevel: null };
      out.set(row.bill_id, bucket);
    }
    if (row.stance_slug) {
      // First (and therefore latest) per (bill, stance) wins; skip older.
      if (!bucket.byStance.has(row.stance_slug)) {
        bucket.byStance.set(row.stance_slug, {
          direction: row.direction,
          weight: row.weight,
          scope: "stance",
        });
      }
    } else if (bucket.billLevel === null) {
      // First (and therefore latest) bill-level signal per bill wins.
      bucket.billLevel = {
        direction: row.direction,
        weight: row.weight,
        scope: "bill",
      };
    }
  }
  return out;
}

export function lookupUserSignal(
  signals: SignalIndex,
  billId: string,
  stanceSlug: string,
): UserSignal | null {
  const bucket = signals.get(billId);
  if (!bucket) return null;
  return bucket.byStance.get(stanceSlug) ?? bucket.billLevel ?? null;
}
