import { beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayTool = vi.hoisted(() => vi.fn());

vi.mock("../gateway/callGatewayTool.js", () => ({
  loadCallGatewayTool: () => Promise.resolve(callGatewayTool),
}));

import {
  getGatewayCronAdapter,
  resetGatewayCronAdapterForTests,
} from "./gatewayAdapter.js";

beforeEach(() => {
  callGatewayTool.mockReset();
  resetGatewayCronAdapterForTests();
});

describe("real gateway cron adapter", () => {
  it("lists jobs through the resolved callGatewayTool", async () => {
    callGatewayTool.mockResolvedValueOnce({
      jobs: [{ id: "cron_1", name: "weekly" }],
    });

    const jobs = await getGatewayCronAdapter().list({ includeDisabled: true });

    expect(callGatewayTool).toHaveBeenCalledWith("cron.list", {}, {
      includeDisabled: true,
    });
    expect(jobs).toEqual([{ id: "cron_1", name: "weekly" }]);
  });

  it("adds and updates jobs through the resolved callGatewayTool", async () => {
    const created = { id: "cron_2", name: "watch" };
    const updated = { id: "cron_2", name: "watch", enabled: false };
    callGatewayTool.mockResolvedValueOnce(created).mockResolvedValueOnce(updated);
    const job = {
      name: "watch",
      schedule: { kind: "cron" as const, expr: "0 9 * * 1" },
      sessionTarget: "isolated",
      wakeMode: "now" as const,
      payload: { kind: "agentTurn" as const, message: "check" },
    };

    const adapter = getGatewayCronAdapter();
    await expect(adapter.add(job)).resolves.toBe(created);
    await expect(
      adapter.update("cron_2", { enabled: false }),
    ).resolves.toBe(updated);
    expect(callGatewayTool).toHaveBeenNthCalledWith(1, "cron.add", {}, job);
    expect(callGatewayTool).toHaveBeenNthCalledWith(2, "cron.update", {}, {
      id: "cron_2",
      patch: { enabled: false },
    });
  });
});
