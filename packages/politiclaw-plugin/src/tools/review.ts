import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import {
  listIssueStances,
  recordStanceSignal,
} from "../domain/preferences/index.js";
import type { IssueStance } from "../domain/preferences/types.js";
import { HIGH_CONFIDENCE_THRESHOLD } from "../domain/scoring/direction.js";
import { hashStancesForRepScoring } from "../domain/scoring/index.js";
import { congressGovPublicBillUrl } from "../sources/bills/types.js";
import { getStorage } from "../storage/context.js";
import { safeParse } from "../validation/typebox.js";

const REVIEW_TIERS = ["borderline", "mixed", "unclassifiable", "all"] as const;
type ReviewTier = (typeof REVIEW_TIERS)[number];

const ReviewParams = Type.Object({
  tier: Type.Optional(
    Type.Union(REVIEW_TIERS.map((value) => Type.Literal(value))),
  ),
  stanceSlug: Type.Optional(
    Type.String({
      description:
        "Filter to a single declared stance (issue slug). Omit to include all your stances.",
    }),
  ),
  limit: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 200, default: 25 }),
  ),
});

const ResolveParams = Type.Object({
  billId: Type.String({ minLength: 1, description: "Bill id to resolve." }),
  action: Type.Union([
    Type.Literal("promote"),
    Type.Literal("override"),
    Type.Literal("skip"),
  ]),
  direction: Type.Optional(
    Type.Union([Type.Literal("agree"), Type.Literal("disagree")]),
  ),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

type PendingRow = {
  bill_id: string;
  bill_title: string | null;
  bill_congress: number | null;
  bill_type: string | null;
  bill_number: string | null;
  latest_action_text: string | null;
  stance_slug: string;
  kind: "advances" | "obstructs" | "mixed" | "unclear";
  confidence: number;
  rationale: string;
  evidence_json: string;
  user_signal_direction: "agree" | "disagree" | "skip" | null;
};

function classifyTier(row: PendingRow): ReviewTier {
  if (row.kind === "mixed") return "mixed";
  if (row.kind === "unclear") return "unclassifiable";
  if (row.confidence < HIGH_CONFIDENCE_THRESHOLD) return "borderline";
  // High-confidence advances/obstructs aren't pending review — they count
  // automatically in supplement / co-equal modes. Should not appear here.
  return "all";
}

function listPendingRows(
  stanceSnapshotHash: string,
  filter: { tier: ReviewTier; stanceSlug?: string; limit: number },
): PendingRow[] {
  const { db } = getStorage();
  // Pull ALL direction rows for the snapshot first, then filter in memory:
  // the tier classification (incl. confidence threshold) lives in TS so we
  // don't repeat the SQL. Snapshot scope keeps the candidate set small.
  const rows = db
    .prepare(
      `WITH latest_signals AS (
         SELECT bill_id, direction,
                ROW_NUMBER() OVER (
                  PARTITION BY bill_id
                  ORDER BY created_at DESC, id DESC
                ) AS rn
           FROM stance_signals
          WHERE bill_id IS NOT NULL
       )
       SELECT bd.bill_id          AS bill_id,
              b.title             AS bill_title,
              b.congress          AS bill_congress,
              b.bill_type         AS bill_type,
              b.number            AS bill_number,
              b.latest_action_text AS latest_action_text,
              bd.stance_slug      AS stance_slug,
              bd.kind             AS kind,
              bd.confidence       AS confidence,
              bd.rationale        AS rationale,
              bd.evidence_json    AS evidence_json,
              ls.direction        AS user_signal_direction
         FROM bill_direction bd
         JOIN bills b
           ON b.id = bd.bill_id
          AND COALESCE(b.update_date, '') = bd.bill_update_date
         LEFT JOIN latest_signals ls
           ON ls.bill_id = bd.bill_id AND ls.rn = 1
        WHERE bd.stance_snapshot_hash = @hash`,
    )
    .all({ hash: stanceSnapshotHash }) as PendingRow[];

  const filtered = rows
    .filter((row) => {
      const rowTier = classifyTier(row);
      // Drop rows whose tier slot is "all" (those are high-confidence calls
      // that already auto-count and don't need review).
      if (rowTier === "all") return false;
      if (filter.tier !== "all" && filter.tier !== rowTier) return false;
      if (filter.stanceSlug && row.stance_slug !== filter.stanceSlug) {
        return false;
      }
      return true;
    })
    .slice(0, filter.limit);
  return filtered;
}

function renderPending(
  rows: readonly PendingRow[],
  stances: readonly IssueStance[],
): string {
  if (rows.length === 0) {
    return "No bills pending AI-rating review for the current stance snapshot.";
  }
  const noteByStance = new Map(
    stances.map((stance) => [stance.issue, stance.note ?? null]),
  );
  const lines: string[] = [
    `${rows.length} bill${rows.length === 1 ? "" : "s"} pending review:`,
    "",
  ];
  for (const row of rows) {
    const tier = classifyTier(row);
    const url =
      row.bill_congress != null && row.bill_type != null && row.bill_number != null
        ? congressGovPublicBillUrl(row.bill_id) ?? null
        : null;
    const billLabel = url ? `[${row.bill_id}](${url})` : row.bill_id;
    const title = row.bill_title ?? "(no title)";
    lines.push(`• ${billLabel} — ${title}`);
    lines.push(`    Stance: ${row.stance_slug}${noteForStance(noteByStance, row.stance_slug)}`);
    if (tier === "borderline") {
      lines.push(
        `    AI call: ${row.kind} (confidence ${Math.round(row.confidence * 100)}% — borderline). Rationale: ${row.rationale}`,
      );
    } else if (tier === "mixed") {
      lines.push(
        `    AI call: mixed (both advancing and obstructing language). Rationale: ${row.rationale}`,
      );
    } else {
      lines.push(`    AI call: unclear — ${row.rationale}`);
    }
    if (row.user_signal_direction) {
      lines.push(
        `    You already signaled: ${row.user_signal_direction}. Promote/override updates that signal.`,
      );
    }
    if (row.latest_action_text) {
      lines.push(`    Latest action: ${row.latest_action_text}`);
    }
    lines.push("");
  }
  lines.push(
    "Use politiclaw_resolve_auto_rating with action='promote' (accept AI's call), 'override' (set your own direction), or 'skip' (mark for exclusion).",
  );
  return lines.join("\n");
}

function noteForStance(
  noteByStance: ReadonlyMap<string, string | null>,
  slug: string,
): string {
  const note = noteByStance.get(slug);
  return note ? ` — your note: ${note}` : "";
}

export const reviewAutoRatingsTool: AnyAgentTool = {
  name: "politiclaw_review_auto_ratings",
  label: "Review AI-rated bills that need your judgment",
  description:
    "List bills the LLM directional classifier flagged as borderline, mixed, or unclassifiable for the current stance snapshot. " +
    "These are bills relevant to your declared stances where the AI's call wasn't strong enough to count automatically toward rep scoring. " +
    "Use politiclaw_resolve_auto_rating to promote, override, or skip individual rows.",
  parameters: ReviewParams,
  async execute(_toolCallId, rawParams) {
    const parsed = safeParse(ReviewParams, rawParams);
    if (!parsed.ok) {
      return textResult(
        `Invalid input: ${parsed.messages.join("; ")}`,
        { status: "invalid" },
      );
    }
    const { db } = getStorage();
    const stances = listIssueStances(db).map<IssueStance>((stance) => ({
      issue: stance.issue,
      stance: stance.stance,
      weight: stance.weight,
      ...(stance.note ? { note: stance.note } : {}),
      ...(stance.sourceText ? { sourceText: stance.sourceText } : {}),
    }));
    if (stances.length === 0) {
      return textResult(
        "No declared issue stances. Use politiclaw_issue_stances with action='set' to declare stances first.",
        { status: "no_stances" },
      );
    }
    const snapshotHash = hashStancesForRepScoring(stances);
    const rows = listPendingRows(snapshotHash, {
      tier: parsed.data.tier ?? "all",
      stanceSlug: parsed.data.stanceSlug,
      limit: parsed.data.limit ?? 25,
    });
    return textResult(renderPending(rows, stances), {
      status: "ok",
      pending: rows.map((row) => ({
        billId: row.bill_id,
        stanceSlug: row.stance_slug,
        tier: classifyTier(row),
        kind: row.kind,
        confidence: row.confidence,
        userSignalDirection: row.user_signal_direction,
      })),
    });
  },
};

export const resolveAutoRatingTool: AnyAgentTool = {
  name: "politiclaw_resolve_auto_rating",
  label: "Resolve an AI-rated bill (promote / override / skip)",
  description:
    "Apply human judgment to a bill the AI classifier surfaced for review. " +
    "promote: accept the AI's call (advances → agree, obstructs → disagree); errors on mixed/unclear. " +
    "override: record your own agree/disagree on the bill (requires direction). " +
    "skip: record a 'skip' signal so the bill is excluded from rep scoring.",
  parameters: ResolveParams,
  async execute(_toolCallId, rawParams) {
    const parsed = safeParse(ResolveParams, rawParams);
    if (!parsed.ok) {
      return textResult(
        `Invalid input: ${parsed.messages.join("; ")}`,
        { status: "invalid" },
      );
    }
    const { billId, action, direction } = parsed.data;
    const { db } = getStorage();

    if (action === "skip") {
      const id = recordStanceSignal(db, {
        billId,
        direction: "skip",
        source: "review",
      });
      return textResult(`Recorded 'skip' signal on ${billId} (#${id}).`, {
        status: "ok",
        action: "skip",
        signalId: id,
      });
    }

    if (action === "override") {
      if (!direction) {
        return textResult(
          "Override requires a direction ('agree' or 'disagree').",
          { status: "invalid" },
        );
      }
      const id = recordStanceSignal(db, {
        billId,
        direction,
        source: "review",
      });
      return textResult(
        `Recorded '${direction}' signal on ${billId} from review override (#${id}).`,
        { status: "ok", action: "override", direction, signalId: id },
      );
    }

    // promote: read the latest AI call for this bill and translate to a signal.
    const stances = listIssueStances(db).map<IssueStance>((stance) => ({
      issue: stance.issue,
      stance: stance.stance,
      weight: stance.weight,
      ...(stance.note ? { note: stance.note } : {}),
      ...(stance.sourceText ? { sourceText: stance.sourceText } : {}),
    }));
    if (stances.length === 0) {
      return textResult(
        "No declared issue stances. Cannot promote AI calls without a stance set.",
        { status: "no_stances" },
      );
    }
    const snapshotHash = hashStancesForRepScoring(stances);
    const directionRow = db
      .prepare(
        `SELECT bd.kind, bd.confidence, bd.rationale
           FROM bill_direction bd
           JOIN bills b
             ON b.id = bd.bill_id
            AND COALESCE(b.update_date, '') = bd.bill_update_date
          WHERE bd.bill_id = @bill_id
            AND bd.stance_snapshot_hash = @hash
          ORDER BY bd.confidence DESC
          LIMIT 1`,
      )
      .get({ bill_id: billId, hash: snapshotHash }) as
      | { kind: "advances" | "obstructs" | "mixed" | "unclear"; confidence: number; rationale: string }
      | undefined;

    if (!directionRow) {
      return textResult(
        `No AI rating exists for bill ${billId} under your current stance snapshot. ` +
          `Run politiclaw_score_bill on it first, or use action='override' to record your own direction.`,
        { status: "no_rating" },
      );
    }
    if (directionRow.kind === "mixed" || directionRow.kind === "unclear") {
      return textResult(
        `Cannot promote a '${directionRow.kind}' AI rating — there is no single direction to accept. ` +
          `Use action='override' to record your own direction, or 'skip' to exclude the bill.`,
        { status: "unpromotable", kind: directionRow.kind },
      );
    }
    const promotedDirection: "agree" | "disagree" =
      directionRow.kind === "advances" ? "agree" : "disagree";
    const id = recordStanceSignal(db, {
      billId,
      direction: promotedDirection,
      source: "review",
    });
    return textResult(
      `Promoted AI '${directionRow.kind}' call (confidence ${Math.round(
        directionRow.confidence * 100,
      )}%) on ${billId} → recorded '${promotedDirection}' signal (#${id}).`,
      {
        status: "ok",
        action: "promote",
        direction: promotedDirection,
        signalId: id,
      },
    );
  },
};

export const reviewTools: AnyAgentTool[] = [
  reviewAutoRatingsTool,
  resolveAutoRatingTool,
];
