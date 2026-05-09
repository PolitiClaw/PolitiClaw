import { Type } from "@sinclair/typebox";
import type {
  AnyAgentTool,
  OpenClawPluginToolContext,
  OpenClawPluginToolFactory,
} from "openclaw/plugin-sdk/plugin-entry";

import { getPreferences } from "../domain/preferences/index.js";
import { buildDirectionLlmClient } from "../domain/scoring/directionLlm.js";
import {
  ALIGNMENT_DISCLAIMER,
  CONFIDENCE_FLOOR,
  scoreBill,
  type DirectionForStance,
  type LlmClient,
  type ScoreBillResult,
} from "../domain/scoring/index.js";
import { createBillsResolver } from "../sources/bills/index.js";
import type { BillRef } from "../sources/bills/types.js";
import { getPluginConfig, getStorage } from "../storage/context.js";
import { safeParse } from "../validation/typebox.js";

/**
 * Test seam: tests inject a fake client via `setDirectionLlmForTests` to
 * exercise the directional-framing output without coupling to a real LLM
 * SDK or OpenClaw's runtime. When unset and a runtime context is available,
 * the factory pulls a real LLM client from OpenClaw's simple-completion API
 * scoped to the user's `legislation_review_model` preference.
 */
let directionLlmOverride: LlmClient | null = null;

export function setDirectionLlmForTests(client: LlmClient | null): void {
  directionLlmOverride = client;
}

const BILL_TYPES = [
  "HR",
  "S",
  "HJRES",
  "SJRES",
  "HCONRES",
  "SCONRES",
  "HRES",
  "SRES",
] as const;

const BILL_ID_REGEX = /^(\d{2,4})-(hr|s|hjres|sjres|hconres|sconres|hres|sres)-(\d+)$/i;

const ScoreBillParams = Type.Object({
  billId: Type.Optional(
    Type.String({
      description:
        "Canonical bill id: '<congress>-<billType>-<number>', e.g. '119-hr-1234'.",
    }),
  ),
  congress: Type.Optional(Type.Integer({ minimum: 1 })),
  billType: Type.Optional(Type.String()),
  number: Type.Optional(Type.String()),
  refresh: Type.Optional(
    Type.Boolean({ description: "When true, bypass the bill-detail cache and re-fetch." }),
  ),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

function normalizeBillType(raw: string): string | null {
  const upper = raw.trim().toUpperCase();
  return (BILL_TYPES as readonly string[]).includes(upper) ? upper : null;
}

function parseBillRef(input: {
  billId?: string;
  congress?: number;
  billType?: string;
  number?: string;
}): BillRef | null {
  if (input.billId) {
    const match = BILL_ID_REGEX.exec(input.billId.trim());
    if (!match) return null;
    return {
      congress: Number(match[1]),
      billType: match[2]!.toUpperCase(),
      number: match[3]!,
    };
  }
  if (input.congress !== undefined && input.billType && input.number) {
    const billType = normalizeBillType(input.billType);
    if (!billType) return null;
    return { congress: input.congress, billType, number: input.number };
  }
  return null;
}

/**
 * Render a scoring result as text. Enforces two output rules:
 *   - confidence < 0.4 renders as "insufficient data" (raw numbers are kept
 *     in `details` for audit but hidden from prose)
 *   - every position-adjacent output includes ALIGNMENT_DISCLAIMER verbatim
 */
export function renderScoreBillOutput(result: ScoreBillResult): string {
  if (result.status === "unavailable") {
    const hint = result.actionable ? ` (${result.actionable})` : "";
    return `Bill unavailable: ${result.reason}.${hint}`;
  }
  if (result.status === "no_stances") {
    return `Cannot score: ${result.reason}. ${result.actionable}.`;
  }

  const { bill, alignment, source } = result;
  const header = `Bill ${bill.congress} ${bill.billType} ${bill.number} — ${bill.title}`;
  const provenance = `Source: ${source.adapterId} (tier ${source.tier}).`;

  if (alignment.belowConfidenceFloor) {
    return [
      header,
      provenance,
      "Alignment: insufficient data (confidence below floor; cannot honestly label this bill against your stances).",
      alignment.rationale,
      "",
      ALIGNMENT_DISCLAIMER,
    ].join("\n");
  }

  const relevancePct = Math.round(alignment.relevance * 100);
  const confidencePct = Math.round(alignment.confidence * 100);
  const matchLines =
    alignment.matches.length > 0
      ? alignment.matches.map(
          (m) =>
            `  • ${m.issue} (${m.stance}, weight ${m.stanceWeight}) via ${m.matchedText}`,
        )
      : ["  • (no declared-stance matches on this bill)"];

  const directionBlock = result.direction ? renderDirectionSection(result.direction) : [];

  return [
    header,
    provenance,
    `Relevance to your stances: ${relevancePct}% (confidence ${confidencePct}%).`,
    "Matches:",
    ...matchLines,
    ...directionBlock,
    "",
    alignment.rationale,
    "",
    ALIGNMENT_DISCLAIMER,
  ].join("\n");
}

function renderDirectionSection(direction: readonly DirectionForStance[]): string[] {
  if (direction.length === 0) return [];
  const lines: string[] = ["", "Direction against your stances [AI-rated]:"];
  for (const { issue, stance, direction: dir } of direction) {
    const stanceWord = stance === "support" ? "support" : "opposition";
    const head = `  • ${issue} (${stanceWord})`;
    if (dir.kind === "advances" || dir.kind === "obstructs") {
      const verb = dir.kind === "advances" ? "appears to advance" : "appears to obstruct";
      const confidencePct = Math.round(dir.confidence * 100);
      lines.push(`${head}: ${verb} (confidence ${confidencePct}%) — "${dir.quotedText}"`);
      lines.push(`      Counter-consideration: ${dir.counterConsideration}`);
    } else if (dir.kind === "mixed") {
      const confidencePct = Math.round(dir.confidence * 100);
      lines.push(`${head}: mixed signals from bill text (confidence ${confidencePct}%).`);
      if (dir.advancesQuote) lines.push(`      Advances side: "${dir.advancesQuote}"`);
      if (dir.obstructsQuote) lines.push(`      Obstructs side: "${dir.obstructsQuote}"`);
      if (!dir.advancesQuote && !dir.obstructsQuote) {
        lines.push(`      Rationale: ${dir.rationale}`);
      }
    } else {
      lines.push(`${head}: direction unclear — ${dir.rationale}`);
    }
  }
  return lines;
}

const SCORE_BILL_DESCRIPTION =
  "Compute how much a federal bill touches the user's declared issue stances. " +
  "Deterministic (no LLM): matches policy area, subjects, title, and summary against " +
  "each declared stance. Reports relevance and confidence; confidence below the " +
  `${CONFIDENCE_FLOOR} floor renders as "insufficient data". ` +
  "Rationale names specific matched subjects (never abstract generalities). " +
  "Requires declared issue stances (see politiclaw_issue_stances with action='set') and " +
  "plugins.entries.politiclaw.config.apiKeys.apiDataGov for the bill source.";

async function executeScoreBill(
  rawParams: unknown,
  llm: LlmClient | undefined,
): Promise<ReturnType<typeof textResult<ScoreBillResult | { status: "invalid" }>>> {
  const parsed = safeParse(ScoreBillParams, rawParams);
  if (!parsed.ok) {
    return textResult(
      `Invalid input: ${parsed.messages.join("; ")}`,
      { status: "invalid" },
    );
  }

  // Cross-field "billId, or congress+billType+number" was a Zod refine;
  // parseBillRef returns null for either-shape failures and we report it.
  const ref = parseBillRef(parsed.data);
  if (!ref) {
    return textResult(
      "Could not parse bill reference. Use billId like '119-hr-1234' or congress + billType + number.",
      { status: "invalid" },
    );
  }

  const { db } = getStorage();
  const cfg = getPluginConfig();
  const resolver = createBillsResolver({
    apiDataGovKey: cfg.apiKeys?.apiDataGov,
    scraperBaseUrl: cfg.sources?.bills?.scraperBaseUrl,
  });

  const result = await scoreBill(db, resolver, ref, {
    refresh: parsed.data.refresh,
    llm,
  });
  return textResult(renderScoreBillOutput(result), result);
}

/**
 * Static tool metadata. The runtime registers the factory below so the
 * tool's execute can close over per-call OpenClaw context (config, agentId)
 * for the directional classifier. Tests still call this object's execute
 * directly to exercise the test seam.
 */
export const scoreBillTool: AnyAgentTool = {
  name: "politiclaw_score_bill",
  label: "Score a bill against your declared stances",
  description: SCORE_BILL_DESCRIPTION,
  parameters: ScoreBillParams,
  async execute(_toolCallId, rawParams) {
    return executeScoreBill(rawParams, directionLlmOverride ?? undefined);
  },
};

/**
 * Per-call resolver for an LLM client used by the directional classifier.
 * Returns null when:
 * - the user has `auto_direction_mode = 'off'`,
 * - the OpenClaw context is missing config or agentId,
 * - or OpenClaw can't resolve a usable provider (no auth, no default
 *   model, etc.).
 *
 * Returning null causes `scoreBill` to skip direction classification for
 * this call without erroring.
 */
async function resolveDirectionLlm(
  ctx: OpenClawPluginToolContext,
): Promise<LlmClient | null> {
  const { db } = getStorage();
  const prefs = getPreferences(db);
  if (!prefs || prefs.autoDirectionMode === "off") return null;
  return buildDirectionLlmClient({
    config: ctx.config,
    agentId: ctx.agentId,
    modelRef: prefs.legislationReviewModel,
  });
}

export const scoreBillToolFactory: OpenClawPluginToolFactory = (ctx) => ({
  name: "politiclaw_score_bill",
  label: "Score a bill against your declared stances",
  description: SCORE_BILL_DESCRIPTION,
  parameters: ScoreBillParams,
  async execute(_toolCallId, rawParams) {
    const llm = directionLlmOverride ?? (await resolveDirectionLlm(ctx)) ?? undefined;
    return executeScoreBill(rawParams, llm);
  },
});

export const scoringTools: AnyAgentTool[] = [scoreBillTool];

export const scoringToolFactoryPairs: ReadonlyArray<{
  tool: AnyAgentTool;
  factory: OpenClawPluginToolFactory;
}> = [{ tool: scoreBillTool, factory: scoreBillToolFactory }];
