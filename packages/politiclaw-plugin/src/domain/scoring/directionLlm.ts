/**
 * OpenClaw simple-completion adapter for the direction classifier.
 *
 * The classifier in `./direction.ts` declares an `LlmClient` interface that
 * takes `{ system, user, responseSchema }` and returns parsed JSON. This
 * module bridges that interface to OpenClaw's host-agnostic completion API,
 * so the plugin works with whichever provider OpenClaw is configured for
 * (Anthropic, OpenAI, lmstudio, etc.) without bringing its own SDK.
 *
 * Graceful degradation: if OpenClaw cannot resolve a usable model (no
 * provider configured, missing auth, etc.), `buildDirectionLlmClient`
 * returns `null` rather than throwing. Callers should treat null as "skip
 * direction classification this run" — the `auto_direction_mode` user
 * preference may be set, but the host can't currently fulfill it.
 */
import type {
  OpenClawConfig,
  PluginLogger,
} from "openclaw/plugin-sdk/plugin-entry";
import {
  completeWithPreparedSimpleCompletionModel,
  extractAssistantText,
  prepareSimpleCompletionModelForAgent,
} from "openclaw/plugin-sdk/simple-completion-runtime";

import type { LlmClient } from "./direction.js";

export type DirectionLlmContext = {
  config: OpenClawConfig | undefined;
  agentId: string | undefined;
  agentDir?: string;
  /**
   * User-configured override for the model used during legislation review.
   * Empty string means "use OpenClaw's default model for this agent".
   */
  modelRef: string;
  logger?: PluginLogger;
};

export async function buildDirectionLlmClient(
  ctx: DirectionLlmContext,
): Promise<LlmClient | null> {
  if (!ctx.config || !ctx.agentId) {
    ctx.logger?.warn?.(
      "direction classifier disabled: missing OpenClaw config or agentId in tool context",
    );
    return null;
  }

  const modelRef = ctx.modelRef.trim();
  const prepared = await prepareSimpleCompletionModelForAgent({
    cfg: ctx.config,
    agentId: ctx.agentId,
    modelRef: modelRef.length > 0 ? modelRef : undefined,
  });

  if ("error" in prepared) {
    ctx.logger?.warn?.(
      `direction classifier disabled: ${prepared.error}`,
    );
    return null;
  }

  return {
    async reason(input) {
      const response = await completeWithPreparedSimpleCompletionModel({
        model: prepared.model,
        auth: prepared.auth,
        context: {
          systemPrompt: input.system,
          messages: [
            {
              role: "user",
              content: input.user,
              timestamp: Date.now(),
            },
          ],
        },
      });
      const text = extractAssistantText(response).trim();
      if (text.length === 0) {
        throw new Error("direction classifier returned empty response");
      }
      return parseJsonResponse(text);
    },
  };
}

function parseJsonResponse(raw: string): unknown {
  // Some providers wrap JSON in ```json fences. Strip those before parsing.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced && fenced[1] ? fenced[1].trim() : raw;
  return JSON.parse(candidate);
}
