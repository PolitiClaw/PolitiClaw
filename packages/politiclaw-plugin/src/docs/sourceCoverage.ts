export type SourceCoverageStatus =
  | "implemented"
  | "optional_upgrade"
  | "transport_pending";

export type SourceCoverageEntry = {
  id: string;
  label: string;
  status: SourceCoverageStatus;
  configKey?: string;
  required: boolean;
  summary: string;
  notes: string;
  sourcePaths: readonly string[];
  unlockedByTools: readonly string[];
};

export const DOCS_BASELINE = {
  tools: 21,
  cronTemplates: 5,
  migrations: 22,
  skills: 5,
} as const;

export const SOURCE_COVERAGE_CATALOG: readonly SourceCoverageEntry[] = [
  {
    id: "apiDataGov",
    label: "api.data.gov",
    status: "implemented",
    configKey: "apiDataGov",
    required: true,
    summary:
      "Required for the current federal bill, House vote, committee schedule, and FEC finance integrations.",
    notes:
      "One key powers api.congress.gov-backed sources and FEC OpenFEC. Senate roll-call ingest runs through a separate zero-key source (voteview.com).",
    sourcePaths: [
      "packages/politiclaw-plugin/src/sources/bills/index.ts",
      "packages/politiclaw-plugin/src/sources/votes/index.ts",
      "packages/politiclaw-plugin/src/sources/upcomingVotes/index.ts",
      "packages/politiclaw-plugin/src/sources/finance/index.ts",
    ],
    unlockedByTools: [
      "politiclaw_search_bills",
      "politiclaw_get_bill_details",
      "politiclaw_score_bill",
      "politiclaw_check_upcoming_votes",
      "politiclaw_ingest_votes",
      "politiclaw_research_finance",
    ],
  },
  {
    id: "localShapefiles",
    label: "Local shapefile pipeline",
    status: "implemented",
    required: false,
    summary:
      "Zero-key default for federal reps-by-address resolution after the cache is primed locally.",
    notes:
      "Uses Census geocoding, cached district polygons, and the bundled legislator resolver. The cache can be primed automatically during configuration or rep lookup.",
    sourcePaths: [
      "packages/politiclaw-plugin/src/sources/reps/localShapefiles.ts",
      "packages/politiclaw-plugin/src/sources/reps/shapefileCache.ts",
      "packages/politiclaw-plugin/src/tools/configure.ts",
    ],
    unlockedByTools: [
      "politiclaw_configure",
      "politiclaw_get_my_reps",
    ],
  },
  {
    id: "geocodio",
    label: "Geocodio",
    status: "optional_upgrade",
    configKey: "geocodio",
    required: false,
    summary:
      "Optional API-backed upgrade for faster reps-by-address lookup.",
    notes:
      "Used ahead of the local shapefile resolver when a key is configured.",
    sourcePaths: [
      "packages/politiclaw-plugin/src/sources/reps/index.ts",
      "packages/politiclaw-plugin/src/sources/reps/geocodio.ts",
    ],
    unlockedByTools: [
      "politiclaw_get_my_reps",
    ],
  },
  {
    id: "voteview",
    label: "Voteview (voteview.com)",
    status: "implemented",
    required: false,
    summary:
      "Zero-key tier-2 source for Senate roll-call votes. api.congress.gov has no /senate-vote endpoint, so this fills the gap.",
    notes:
      "Undocumented web-app API. The adapter tolerates a small error-envelope rate on /api/download, derives session from vote date, and rejects presidential-nomination ids (PN*) from bill linkage so confirmation votes drop out of bill-keyed scoring.",
    sourcePaths: [
      "packages/politiclaw-plugin/src/sources/votes/voteview.ts",
      "packages/politiclaw-plugin/src/sources/votes/voteviewClient.ts",
      "packages/politiclaw-plugin/src/sources/votes/billNumberParser.ts",
      "packages/politiclaw-plugin/src/sources/votes/senateProcedural.ts",
    ],
    unlockedByTools: [
      "politiclaw_ingest_votes",
      "politiclaw_score_representative",
    ],
  },
  {
    id: "googleCivic",
    label: "Google Civic voterInfoQuery",
    status: "optional_upgrade",
    configKey: "googleCivic",
    required: false,
    summary:
      "Key-gated ballot and election-logistics provider — the only ballot source the plugin wires today.",
    notes:
      "Required for every ballot tool. Per-state SoS adapters were scoped out in v1 after an audit found none of the six candidate states publishes a public address-to-ballot JSON feed. Judicial retention detail and ballot-measure plain-language enrichment are not wired.",
    sourcePaths: [
      "packages/politiclaw-plugin/src/sources/ballot/index.ts",
      "packages/politiclaw-plugin/src/sources/ballot/googleCivic.ts",
    ],
    unlockedByTools: [
      "politiclaw_get_my_ballot",
      "politiclaw_election_brief",
    ],
  },
  {
    id: "webSearchBios",
    label: "Candidate and measure bio web search",
    status: "transport_pending",
    required: false,
    summary:
      "The guarded adapter shape exists, but the production transport is not wired, so live calls return unavailable.",
    notes:
      "Tests can inject a fetcher today. Production use still depends on the host skill layer for narrative lookup.",
    sourcePaths: [
      "packages/politiclaw-plugin/src/sources/webSearch/index.ts",
      "packages/politiclaw-plugin/src/sources/webSearch/bios.ts",
    ],
    unlockedByTools: [
      "politiclaw_research_finance",
      "politiclaw_election_brief",
    ],
  },
];
