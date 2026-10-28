/**
 * OpenClaw 2026.10.8 exports this subpath as JavaScript only. These
 * declarations cover the helper the direction classifier actually calls.
 */
declare module "openclaw/plugin-sdk/simple-completion-runtime" {
  import type { OpenClawConfig } from "openclaw/plugin-sdk/plugin-entry";

  export type PreparedSimpleCompletionModel =
    | {
        model: unknown;
        auth: unknown;
        sourceAuthFingerprint?: string;
      }
    | {
        error: string;
        auth?: unknown;
      };

  export function prepareSimpleCompletionModelForAgent(params: {
    cfg: OpenClawConfig | undefined;
    agentId?: string;
    agentDir?: string;
    modelRef?: string;
    useUtilityModel?: boolean | "required";
  }): Promise<PreparedSimpleCompletionModel>;

  export function completeWithPreparedSimpleCompletionModel(params: {
    model: unknown;
    auth: unknown;
    context: {
      systemPrompt?: string;
      messages: Array<{
        role: string;
        content: string;
        timestamp?: number;
      }>;
    };
    cfg?: OpenClawConfig;
  }): Promise<unknown>;

  export function extractAssistantText(message: unknown): string;
}
