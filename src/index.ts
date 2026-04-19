import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { configureStorage } from "./storage/context.js";
import { politiclawTools } from "./tools/preferences.js";

export default definePluginEntry({
  id: "politiclaw",
  name: "PolitiClaw",
  description:
    "Local-first personal political co-pilot: monitors legislation, tracks representatives, prepares you for elections, and drafts outreach.",
  register(api) {
    configureStorage(() => api.runtime.state.resolveStateDir());
    for (const tool of politiclawTools) api.registerTool(tool);
    api.logger.info(
      `PolitiClaw: registered ${politiclawTools.length} tools (${politiclawTools.map((t) => t.name).join(", ")})`,
    );
  },
});
