import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk";

import {
  getPreferences,
  listStanceSignals,
  recordStanceSignal,
  upsertPreferences,
  PreferencesSchema,
  StanceSignalSchema,
} from "../domain/preferences/index.js";
import { getStorage } from "../storage/context.js";

const SetPreferencesParams = Type.Object({
  address: Type.String({ description: "Street address. Used for rep lookup in Phase 2." }),
  zip: Type.Optional(Type.String()),
  state: Type.Optional(Type.String({ description: "2-letter state code (e.g., CA)." })),
  district: Type.Optional(Type.String({ description: "Congressional district if known." })),
});

const GetPreferencesParams = Type.Object({});

const RecordStanceSignalParams = Type.Object({
  direction: Type.Union([Type.Literal("agree"), Type.Literal("disagree"), Type.Literal("skip")]),
  source: Type.Union([
    Type.Literal("onboarding"),
    Type.Literal("monitoring"),
    Type.Literal("dashboard"),
  ]),
  issue: Type.Optional(Type.String({ description: "Issue slug, e.g. 'climate'." })),
  billId: Type.Optional(Type.String({ description: "Bill id this signal applies to." })),
  weight: Type.Optional(
    Type.Number({ exclusiveMinimum: 0, description: "Signal strength (> 0); defaults to 1.0." }),
  ),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

export const setPreferencesTool: AnyAgentTool = {
  name: "politiclaw_set_preferences",
  label: "Save PolitiClaw preferences",
  description:
    "Save or update the user's political preferences (address, state, district). " +
    "Writes to the plugin-private SQLite DB. Use this during onboarding or whenever the user updates their address.",
  parameters: SetPreferencesParams,
  async execute(_toolCallId, rawParams) {
    const validated = PreferencesSchema.parse(rawParams);
    const { db } = getStorage();
    const row = upsertPreferences(db, validated);
    return textResult(`Saved preferences for ${row.address}.`, { updatedAt: row.updatedAt });
  },
};

export const getPreferencesTool: AnyAgentTool = {
  name: "politiclaw_get_preferences",
  label: "Load PolitiClaw preferences",
  description:
    "Return the currently-saved political preferences (address, state, district), or null if none are set.",
  parameters: GetPreferencesParams,
  async execute() {
    const { db } = getStorage();
    const prefs = getPreferences(db);
    const text = prefs
      ? `Preferences: ${prefs.address}${prefs.state ? `, ${prefs.state}` : ""}.`
      : "No preferences saved yet.";
    return textResult(text, { preferences: prefs });
  },
};

export const recordStanceSignalTool: AnyAgentTool = {
  name: "politiclaw_record_stance_signal",
  label: "Record PolitiClaw stance signal",
  description:
    "Record a single agree/disagree/skip signal from the user in response to a shown bill or issue. " +
    "Phase 3+ aggregates these into learned issue stances; Phase 1 only writes.",
  parameters: RecordStanceSignalParams,
  async execute(_toolCallId, rawParams) {
    const validated = StanceSignalSchema.parse(rawParams);
    const { db } = getStorage();
    const id = recordStanceSignal(db, validated);
    return textResult(`Recorded ${validated.direction} signal (#${id}).`, { id });
  },
};

export const politiclawTools: AnyAgentTool[] = [
  setPreferencesTool,
  getPreferencesTool,
  recordStanceSignalTool,
];

export { listStanceSignals };
