import type {
  AnyAgentTool,
  OpenClawPluginToolFactory,
} from "openclaw/plugin-sdk/plugin-entry";

import { actionMomentsTools } from "../tools/actionMoments.js";
import { ballotTools } from "../tools/ballot.js";
import { billsTools } from "../tools/bills.js";
import { configureTools } from "../tools/configure.js";
import { doctorTools } from "../tools/doctor.js";
import { draftOutreachTools } from "../tools/draftOutreach.js";
import { electionBriefTools } from "../tools/electionBrief.js";
import { issueStancesTools } from "../tools/issueStances.js";
import { monitoringTools } from "../tools/monitoring.js";
import { muteTools } from "../tools/mutes.js";
import { recordStanceSignalTools } from "../tools/preferences.js";
import { reminderTools } from "../tools/reminder.js";
import { repReportTools } from "../tools/repReport.js";
import { repScoringTools } from "../tools/repScoring.js";
import { repsTools } from "../tools/reps.js";
import { researchFinanceTools } from "../tools/researchFinance.js";
import { scoringToolFactoryPairs } from "../tools/scoring.js";
import { voteIngestTools } from "../tools/voteIngest.js";

export type DocsToolGroupId =
  | "preferences"
  | "representatives"
  | "bills"
  | "ballot"
  | "monitoring"
  | "research"
  | "operations";

export type DocsToolEntry = {
  groupId: DocsToolGroupId;
  groupLabel: string;
  sourcePath: string;
  /**
   * Static tool metadata. Always populated; used by docs generation. For
   * tools that need per-call OpenClaw context, this is the docs-only shape;
   * the runtime registration pulls a context-aware version from `factory`.
   */
  tool: AnyAgentTool;
  /**
   * When set, the runtime registers this factory with OpenClaw instead of
   * the static `tool`. Lets the tool's `execute` close over per-call
   * `OpenClawPluginToolContext` (config, agentId, etc.). Docs generation
   * keeps using `tool` so static metadata stays available without invoking
   * the factory.
   */
  factory?: OpenClawPluginToolFactory;
};

export type DocsToolGroup = {
  id: DocsToolGroupId;
  label: string;
  description: string;
  entries: readonly DocsToolEntry[];
};

function makeEntries(
  groupId: DocsToolGroupId,
  groupLabel: string,
  sourcePath: string,
  tools: readonly AnyAgentTool[],
): DocsToolEntry[] {
  return tools.map((tool) => ({
    groupId,
    groupLabel,
    sourcePath,
    tool,
  }));
}

/**
 * For tools that need per-call OpenClaw context (e.g. access to
 * `ctx.config` and `ctx.agentId` to invoke a host LLM). Each pair holds the
 * static metadata used by docs and the factory used at registration time.
 */
function makeFactoryEntries(
  groupId: DocsToolGroupId,
  groupLabel: string,
  sourcePath: string,
  pairs: readonly { tool: AnyAgentTool; factory: OpenClawPluginToolFactory }[],
): DocsToolEntry[] {
  return pairs.map(({ tool, factory }) => ({
    groupId,
    groupLabel,
    sourcePath,
    tool,
    factory,
  }));
}

export const POLITICLAW_TOOL_GROUPS: readonly DocsToolGroup[] = [
  {
    id: "preferences",
    label: "Configuration and preferences",
    description:
      "Configure the plugin, declare issue stances, and manage the saved preference data that remains user-facing.",
    entries: [
      ...makeEntries(
        "preferences",
        "Configuration and preferences",
        "packages/politiclaw-plugin/src/tools/configure.ts",
        configureTools,
      ),
      ...makeEntries(
        "preferences",
        "Configuration and preferences",
        "packages/politiclaw-plugin/src/tools/issueStances.ts",
        issueStancesTools,
      ),
      ...makeEntries(
        "preferences",
        "Configuration and preferences",
        "packages/politiclaw-plugin/src/tools/preferences.ts",
        recordStanceSignalTools,
      ),
    ],
  },
  {
    id: "representatives",
    label: "Representatives and alignment",
    description:
      "Resolve federal representatives and summarize current alignment.",
    entries: [
      ...makeEntries(
        "representatives",
        "Representatives and alignment",
        "packages/politiclaw-plugin/src/tools/reps.ts",
        repsTools,
      ),
      ...makeEntries(
        "representatives",
        "Representatives and alignment",
        "packages/politiclaw-plugin/src/tools/repScoring.ts",
        repScoringTools,
      ),
      ...makeEntries(
        "representatives",
        "Representatives and alignment",
        "packages/politiclaw-plugin/src/tools/repReport.ts",
        repReportTools,
      ),
    ],
  },
  {
    id: "bills",
    label: "Bills and votes",
    description:
      "Search federal bills, inspect bill details, score bill alignment, and ingest House and Senate roll-call votes.",
    entries: [
      ...makeEntries(
        "bills",
        "Bills and votes",
        "packages/politiclaw-plugin/src/tools/bills.ts",
        billsTools,
      ),
      ...makeFactoryEntries(
        "bills",
        "Bills and votes",
        "packages/politiclaw-plugin/src/tools/scoring.ts",
        scoringToolFactoryPairs,
      ),
      ...makeEntries(
        "bills",
        "Bills and votes",
        "packages/politiclaw-plugin/src/tools/voteIngest.ts",
        voteIngestTools,
      ),
    ],
  },
  {
    id: "ballot",
    label: "Ballot and election prep",
    description:
      "Fetch ballot data and assemble a single readable election guide.",
    entries: [
      ...makeEntries(
        "ballot",
        "Ballot and election prep",
        "packages/politiclaw-plugin/src/tools/ballot.ts",
        ballotTools,
      ),
      ...makeEntries(
        "ballot",
        "Ballot and election prep",
        "packages/politiclaw-plugin/src/tools/electionBrief.ts",
        electionBriefTools,
      ),
    ],
  },
  {
    id: "monitoring",
    label: "Monitoring and cadence",
    description:
      "Check upcoming federal activity and manage alert suppression once configuration is complete.",
    entries: [
      ...makeEntries(
        "monitoring",
        "Monitoring and cadence",
        "packages/politiclaw-plugin/src/tools/monitoring.ts",
        monitoringTools,
      ),
      ...makeEntries(
        "monitoring",
        "Monitoring and cadence",
        "packages/politiclaw-plugin/src/tools/mutes.ts",
        muteTools,
      ),
      ...makeEntries(
        "monitoring",
        "Monitoring and cadence",
        "packages/politiclaw-plugin/src/tools/reminder.ts",
        reminderTools,
      ),
      ...makeEntries(
        "monitoring",
        "Monitoring and cadence",
        "packages/politiclaw-plugin/src/tools/actionMoments.ts",
        actionMomentsTools,
      ),
    ],
  },
  {
    id: "research",
    label: "Candidate research and outreach",
    description:
      "Compare candidate finance data and draft constituent outreach (letter or call script).",
    entries: [
      ...makeEntries(
        "research",
        "Candidate research and outreach",
        "packages/politiclaw-plugin/src/tools/researchFinance.ts",
        researchFinanceTools,
      ),
      ...makeEntries(
        "research",
        "Candidate research and outreach",
        "packages/politiclaw-plugin/src/tools/draftOutreach.ts",
        draftOutreachTools,
      ),
    ],
  },
  {
    id: "operations",
    label: "Operations and diagnostics",
    description:
      "Run installation health checks and surface actionable fixes for broken setups.",
    entries: makeEntries(
      "operations",
      "Operations and diagnostics",
      "packages/politiclaw-plugin/src/tools/doctor.ts",
      doctorTools,
    ),
  },
];

export const REGISTERED_POLITICLAW_TOOLS: readonly AnyAgentTool[] =
  POLITICLAW_TOOL_GROUPS.flatMap((group) => group.entries.map((entry) => entry.tool));

export const REGISTERED_POLITICLAW_TOOL_DOCS: readonly DocsToolEntry[] =
  POLITICLAW_TOOL_GROUPS.flatMap((group) => group.entries);

/**
 * What the plugin actually hands to OpenClaw at register-time: the factory
 * when a tool needs per-call context, otherwise the static tool. Docs and
 * test assertions still iterate `REGISTERED_POLITICLAW_TOOLS` for static
 * metadata.
 */
export const REGISTERED_POLITICLAW_TOOL_REGISTRATIONS: readonly (
  | AnyAgentTool
  | OpenClawPluginToolFactory
)[] = POLITICLAW_TOOL_GROUPS.flatMap((group) =>
  group.entries.map((entry) => entry.factory ?? entry.tool),
);
