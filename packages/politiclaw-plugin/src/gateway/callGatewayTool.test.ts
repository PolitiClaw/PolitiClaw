import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  resolveCallGatewayTool,
  type LoadSdkModule,
} from "./callGatewayTool.js";

const pluginSourceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const currentSubpath = "openclaw/plugin-sdk/agent-harness-runtime";
const legacySubpath = "openclaw/plugin-sdk/agent-harness";

function listTypeScriptSources(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTypeScriptSources(fullPath));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function missingSubpathError(): Error {
  return Object.assign(new Error("Package subpath is not defined by exports"), {
    code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
  });
}

describe("OpenClaw gateway SDK import", () => {
  it("does not statically import callGatewayTool from agent-harness", () => {
    const violations = listTypeScriptSources(pluginSourceRoot).filter((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return source.includes(`from "${legacySubpath}"`);
    });
    expect(violations).toEqual([]);
  });
});

describe("resolveCallGatewayTool", () => {
  it("uses agent-harness-runtime when that module exports callGatewayTool", async () => {
    const callGatewayTool = vi.fn(async () => ({ ok: true }));
    const loadModule: LoadSdkModule = vi.fn(async (specifier) => {
      if (specifier === currentSubpath) {
        return { callGatewayTool };
      }
      throw new Error(`legacy subpath loaded: ${specifier}`);
    });

    const resolved = await resolveCallGatewayTool(loadModule);

    expect(resolved).toBe(callGatewayTool);
    expect(loadModule).toHaveBeenCalledTimes(1);
    expect(loadModule).toHaveBeenCalledWith(currentSubpath);
  });

  it("falls back to agent-harness when the runtime subpath is not exported", async () => {
    const callGatewayTool = vi.fn(async () => ({ ok: true }));
    const loadModule: LoadSdkModule = vi.fn(async (specifier) => {
      if (specifier === currentSubpath) {
        throw missingSubpathError();
      }
      if (specifier === legacySubpath) {
        return { callGatewayTool };
      }
      throw new Error(`unexpected subpath: ${specifier}`);
    });

    const resolved = await resolveCallGatewayTool(loadModule);

    expect(resolved).toBe(callGatewayTool);
    expect(loadModule).toHaveBeenCalledWith(legacySubpath);
  });

  it("falls back when the runtime module loads without callGatewayTool", async () => {
    const callGatewayTool = vi.fn(async () => ({ ok: true }));
    const loadModule: LoadSdkModule = vi.fn(async (specifier) => {
      if (specifier === currentSubpath) {
        return {};
      }
      return { callGatewayTool };
    });

    const resolved = await resolveCallGatewayTool(loadModule);

    expect(resolved).toBe(callGatewayTool);
  });

  it("rethrows unexpected failures while loading the runtime subpath", async () => {
    const loadError = new Error("sdk exploded");
    const loadModule: LoadSdkModule = vi.fn(async () => {
      throw loadError;
    });

    await expect(resolveCallGatewayTool(loadModule)).rejects.toBe(loadError);
  });

  it("throws when neither subpath exports callGatewayTool", async () => {
    const loadModule: LoadSdkModule = vi.fn(async (specifier) => {
      if (specifier === currentSubpath) {
        throw missingSubpathError();
      }
      return {};
    });

    await expect(resolveCallGatewayTool(loadModule)).rejects.toThrow(
      /does not export callGatewayTool/,
    );
  });
});
