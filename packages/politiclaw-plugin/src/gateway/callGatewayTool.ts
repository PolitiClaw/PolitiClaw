/**
 * Resolves OpenClaw's `callGatewayTool` across SDK layouts.
 *
 * OpenClaw 2026.4.21 exports it from `openclaw/plugin-sdk/agent-harness`.
 * By OpenClaw 2026.9.6 that module still loads, but the named export lives on
 * `openclaw/plugin-sdk/agent-harness-runtime`. A static import of the old name
 * aborts plugin activation:
 * SyntaxError: The requested module 'openclaw/plugin-sdk/agent-harness' does
 * not provide an export named 'callGatewayTool'.
 *
 * Import the current subpath first. Hosts from before that subpath existed
 * reject it with ERR_PACKAGE_PATH_NOT_EXPORTED; those hosts still export the
 * function from the original module.
 */

const currentSubpath = "openclaw/plugin-sdk/agent-harness-runtime";
const legacySubpath = "openclaw/plugin-sdk/agent-harness";

export type GatewayCallOptions = {
  gatewayUrl?: string;
  gatewayToken?: string;
  timeoutMs?: number;
};

export type CallGatewayTool = <T = Record<string, unknown>>(
  method: string,
  options: GatewayCallOptions,
  params?: unknown,
) => Promise<T>;

type SdkModuleShape = {
  callGatewayTool?: unknown;
};

export type LoadSdkModule = (specifier: string) => Promise<SdkModuleShape>;

function isMissingSdkSubpath(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED"
  );
}

function readCallGatewayTool(
  sdkModule: SdkModuleShape,
): CallGatewayTool | undefined {
  if (typeof sdkModule.callGatewayTool === "function") {
    return sdkModule.callGatewayTool as CallGatewayTool;
  }
  return undefined;
}

export async function resolveCallGatewayTool(
  loadModule: LoadSdkModule,
): Promise<CallGatewayTool> {
  try {
    const runtimeModule = await loadModule(currentSubpath);
    const runtimeTool = readCallGatewayTool(runtimeModule);
    if (runtimeTool) {
      return runtimeTool;
    }
  } catch (error) {
    if (!isMissingSdkSubpath(error)) {
      throw error;
    }
  }

  const legacyModule = await loadModule(legacySubpath);
  const legacyTool = readCallGatewayTool(legacyModule);
  if (legacyTool) {
    return legacyTool;
  }

  throw new Error(
    "OpenClaw plugin SDK does not export callGatewayTool from openclaw/plugin-sdk/agent-harness-runtime or openclaw/plugin-sdk/agent-harness",
  );
}

async function defaultLoadSdkModule(specifier: string): Promise<SdkModuleShape> {
  if (specifier === currentSubpath) {
    return import("openclaw/plugin-sdk/agent-harness-runtime");
  }
  if (specifier === legacySubpath) {
    return import("openclaw/plugin-sdk/agent-harness");
  }
  throw new Error(`Unexpected OpenClaw plugin SDK subpath: ${specifier}`);
}

let cachedCallGatewayTool: Promise<CallGatewayTool> | undefined;

export function loadCallGatewayTool(): Promise<CallGatewayTool> {
  cachedCallGatewayTool ??= resolveCallGatewayTool(defaultLoadSdkModule);
  return cachedCallGatewayTool;
}

export function resetCallGatewayToolForTests(): void {
  cachedCallGatewayTool = undefined;
}
