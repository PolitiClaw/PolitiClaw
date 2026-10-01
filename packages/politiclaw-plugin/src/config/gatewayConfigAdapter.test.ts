import { beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayTool = vi.hoisted(() => vi.fn());

vi.mock("../gateway/callGatewayTool.js", () => ({
  loadCallGatewayTool: () => Promise.resolve(callGatewayTool),
}));

import {
  getGatewayConfigAdapter,
  resetGatewayConfigAdapterForTests,
} from "../config/gatewayConfigAdapter.js";

beforeEach(() => {
  callGatewayTool.mockReset();
  resetGatewayConfigAdapterForTests();
});

describe("real gateway config adapter", () => {
  it("reads a config snapshot through the resolved callGatewayTool", async () => {
    callGatewayTool.mockResolvedValueOnce({
      hash: "base-hash",
      path: "/tmp/openclaw.json",
      config: { plugins: {} },
    });

    const snapshot = await getGatewayConfigAdapter().getSnapshot();

    expect(callGatewayTool).toHaveBeenCalledWith("config.get", {}, {});
    expect(snapshot).toEqual({
      hash: "base-hash",
      path: "/tmp/openclaw.json",
      config: { plugins: {} },
    });
  });

  it("patches config through the resolved callGatewayTool", async () => {
    callGatewayTool.mockResolvedValueOnce({
      noop: false,
      path: "/tmp/openclaw.json",
      config: { plugins: { entries: {} } },
      restart: { delayMs: 1500, coalesced: true },
    });

    const result = await getGatewayConfigAdapter().patch({
      patch: { plugins: { entries: { politiclaw: {} } } },
      baseHash: "base-hash",
      note: "set api key",
      restartDelayMs: 1500,
    });

    expect(callGatewayTool).toHaveBeenCalledWith("config.patch", {}, {
      raw: JSON.stringify({ plugins: { entries: { politiclaw: {} } } }),
      baseHash: "base-hash",
      note: "set api key",
      restartDelayMs: 1500,
    });
    expect(result).toEqual({
      noop: false,
      path: "/tmp/openclaw.json",
      config: { plugins: { entries: {} } },
      restart: { delayMs: 1500, coalesced: true },
    });
  });
});
