import { describe, expect, it, vi } from "vitest";

import { createBallotResolver } from "./index.js";

describe("createBallotResolver", () => {
  it("calls Google Civic when a key is configured", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          election: {
            id: "2000",
            name: "General Election",
            electionDay: "2026-11-03",
            ocdDivisionId: "ocd-division/country:us/state:ca",
          },
          normalizedInput: {
            line1: "1600 Amphitheatre Parkway",
            city: "Mountain View",
            state: "CA",
            zip: "94043",
          },
          contests: [],
          pollingLocations: [],
        };
      },
    })) as unknown as typeof fetch;

    const resolver = createBallotResolver({
      fetcher,
      googleCivicApiKey: "fake-google-key",
    });

    const result = await resolver.voterInfo("1600 Amphitheatre Parkway, 94043, CA");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.adapterId).toBe("googleCivic");
  });

  it("returns an actionable unavailable when the Google Civic key is missing", async () => {
    const resolver = createBallotResolver({});

    const result = await resolver.voterInfo("1600 Amphitheatre Parkway, 94043, CA");
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("Google Civic API key is not configured");
    expect(result.actionable).toContain("plugins.entries.politiclaw.config.apiKeys.googleCivic");
  });
});
