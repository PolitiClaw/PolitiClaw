/**
 * Canonical stance-snapshot hashing.
 *
 * Two callers join on the truncated form (`bill_alignment` and `rep_scores`),
 * so they must produce identical hashes. The full form is used by the letters
 * cache. Both forms cover the same fields; only the output length differs.
 *
 * Optional fields (`note`, `sourceText`) are included only when present, so
 * users who never set a note keep the same snapshot hash they had before
 * those fields were factored into scoring.
 */
import { createHash } from "node:crypto";

import type { IssueStance } from "../preferences/types.js";

const TRUNCATED_LENGTH = 16;

type HashableStance = Pick<IssueStance, "issue" | "stance" | "weight"> &
  Partial<Pick<IssueStance, "note" | "sourceText">>;

export type StanceHashOptions = {
  truncated?: boolean;
};

export function hashStanceSnapshot(
  stances: readonly HashableStance[],
  options: StanceHashOptions = {},
): string {
  const normalized = [...stances]
    .map((stance) => {
      const entry: Record<string, unknown> = {
        issue: stance.issue,
        stance: stance.stance,
        weight: stance.weight,
      };
      if (stance.note !== undefined && stance.note !== null && stance.note !== "") {
        entry.note = stance.note;
      }
      if (
        stance.sourceText !== undefined &&
        stance.sourceText !== null &&
        stance.sourceText !== ""
      ) {
        entry.sourceText = stance.sourceText;
      }
      return entry;
    })
    .sort((a, b) => String(a.issue).localeCompare(String(b.issue)));

  const fullDigest = createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");

  if (options.truncated === false) {
    return fullDigest;
  }
  return fullDigest.slice(0, TRUNCATED_LENGTH);
}
