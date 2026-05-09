import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("openclaw/plugin-sdk/simple-completion-runtime", () => ({
  prepareSimpleCompletionModelForAgent: vi.fn(),
  completeWithPreparedSimpleCompletionModel: vi.fn(),
  extractAssistantText: vi.fn(),
}));

import {
  completeWithPreparedSimpleCompletionModel,
  extractAssistantText,
  prepareSimpleCompletionModelForAgent,
} from "openclaw/plugin-sdk/simple-completion-runtime";

import { buildDirectionLlmClient } from "./directionLlm.js";

const fakeConfig = { fake: true } as unknown as Parameters<
  typeof buildDirectionLlmClient
>[0]["config"];

const noopLogger = { info: () => {}, warn: () => {}, error: () => {} };

beforeEach(() => {
  vi.mocked(prepareSimpleCompletionModelForAgent).mockReset();
  vi.mocked(completeWithPreparedSimpleCompletionModel).mockReset();
  vi.mocked(extractAssistantText).mockReset();
});

describe("buildDirectionLlmClient", () => {
  it("returns null when OpenClaw config is missing", async () => {
    const client = await buildDirectionLlmClient({
      config: undefined,
      agentId: "politiclaw",
      modelRef: "",
      logger: noopLogger,
    });
    expect(client).toBeNull();
    expect(prepareSimpleCompletionModelForAgent).not.toHaveBeenCalled();
  });

  it("returns null when agentId is missing", async () => {
    const client = await buildDirectionLlmClient({
      config: fakeConfig,
      agentId: undefined,
      modelRef: "",
      logger: noopLogger,
    });
    expect(client).toBeNull();
    expect(prepareSimpleCompletionModelForAgent).not.toHaveBeenCalled();
  });

  it("returns null and logs when no provider is configured", async () => {
    const warn = vi.fn();
    vi.mocked(prepareSimpleCompletionModelForAgent).mockResolvedValue({
      error: "no provider configured",
    });
    const client = await buildDirectionLlmClient({
      config: fakeConfig,
      agentId: "politiclaw",
      modelRef: "",
      logger: { ...noopLogger, warn },
    });
    expect(client).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no provider configured"));
  });

  it("passes user-configured modelRef through to OpenClaw", async () => {
    vi.mocked(prepareSimpleCompletionModelForAgent).mockResolvedValue({
      model: { fake: "model" } as never,
      auth: { fake: "auth" } as never,
      selection: { provider: "anthropic", modelId: "haiku", agentDir: "/" },
    });
    await buildDirectionLlmClient({
      config: fakeConfig,
      agentId: "politiclaw",
      modelRef: "anthropic/claude-haiku-4-5",
      logger: noopLogger,
    });
    expect(prepareSimpleCompletionModelForAgent).toHaveBeenCalledWith({
      cfg: fakeConfig,
      agentId: "politiclaw",
      modelRef: "anthropic/claude-haiku-4-5",
    });
  });

  it("omits modelRef when empty (host default)", async () => {
    vi.mocked(prepareSimpleCompletionModelForAgent).mockResolvedValue({
      model: { fake: "model" } as never,
      auth: { fake: "auth" } as never,
      selection: { provider: "openai", modelId: "gpt-4", agentDir: "/" },
    });
    await buildDirectionLlmClient({
      config: fakeConfig,
      agentId: "politiclaw",
      modelRef: "",
      logger: noopLogger,
    });
    expect(prepareSimpleCompletionModelForAgent).toHaveBeenCalledWith({
      cfg: fakeConfig,
      agentId: "politiclaw",
      modelRef: undefined,
    });
  });

  it("trims whitespace-only modelRef to empty (host default)", async () => {
    vi.mocked(prepareSimpleCompletionModelForAgent).mockResolvedValue({
      model: { fake: "model" } as never,
      auth: { fake: "auth" } as never,
      selection: { provider: "openai", modelId: "gpt-4", agentDir: "/" },
    });
    await buildDirectionLlmClient({
      config: fakeConfig,
      agentId: "politiclaw",
      modelRef: "   ",
      logger: noopLogger,
    });
    expect(prepareSimpleCompletionModelForAgent).toHaveBeenCalledWith({
      cfg: fakeConfig,
      agentId: "politiclaw",
      modelRef: undefined,
    });
  });

  it("calls completion with system prompt + user message and returns parsed JSON", async () => {
    vi.mocked(prepareSimpleCompletionModelForAgent).mockResolvedValue({
      model: { fake: "model" } as never,
      auth: { fake: "auth" } as never,
      selection: { provider: "openai", modelId: "gpt-4", agentDir: "/" },
    });
    vi.mocked(completeWithPreparedSimpleCompletionModel).mockResolvedValue(
      { fake: "assistantMessage" } as never,
    );
    vi.mocked(extractAssistantText).mockReturnValue(
      '{"kind":"advances","confidence":0.82,"rationale":"matched","quotedText":"foo"}',
    );

    const client = await buildDirectionLlmClient({
      config: fakeConfig,
      agentId: "politiclaw",
      modelRef: "",
      logger: noopLogger,
    });
    expect(client).not.toBeNull();
    const result = await client!.reason({
      system: "system prompt",
      user: "user prompt",
      responseSchema: { type: "object" },
    });

    expect(result).toEqual({
      kind: "advances",
      confidence: 0.82,
      rationale: "matched",
      quotedText: "foo",
    });

    const callArgs = vi.mocked(completeWithPreparedSimpleCompletionModel).mock.calls[0]?.[0];
    expect(callArgs?.context.systemPrompt).toBe("system prompt");
    expect(callArgs?.context.messages).toHaveLength(1);
    const message = callArgs?.context.messages[0];
    expect(message?.role).toBe("user");
    expect(message?.content).toBe("user prompt");
  });

  it("strips ```json fences before parsing", async () => {
    vi.mocked(prepareSimpleCompletionModelForAgent).mockResolvedValue({
      model: { fake: "model" } as never,
      auth: { fake: "auth" } as never,
      selection: { provider: "openai", modelId: "gpt-4", agentDir: "/" },
    });
    vi.mocked(completeWithPreparedSimpleCompletionModel).mockResolvedValue(
      { fake: "assistantMessage" } as never,
    );
    vi.mocked(extractAssistantText).mockReturnValue(
      '```json\n{"kind":"unclear","rationale":"insufficient text"}\n```',
    );

    const client = await buildDirectionLlmClient({
      config: fakeConfig,
      agentId: "politiclaw",
      modelRef: "",
      logger: noopLogger,
    });
    const result = await client!.reason({
      system: "s",
      user: "u",
      responseSchema: {},
    });
    expect(result).toEqual({ kind: "unclear", rationale: "insufficient text" });
  });

  it("strips bare ``` fences before parsing", async () => {
    vi.mocked(prepareSimpleCompletionModelForAgent).mockResolvedValue({
      model: { fake: "model" } as never,
      auth: { fake: "auth" } as never,
      selection: { provider: "openai", modelId: "gpt-4", agentDir: "/" },
    });
    vi.mocked(completeWithPreparedSimpleCompletionModel).mockResolvedValue(
      { fake: "assistantMessage" } as never,
    );
    vi.mocked(extractAssistantText).mockReturnValue('```\n{"kind":"mixed"}\n```');

    const client = await buildDirectionLlmClient({
      config: fakeConfig,
      agentId: "politiclaw",
      modelRef: "",
      logger: noopLogger,
    });
    const result = await client!.reason({
      system: "s",
      user: "u",
      responseSchema: {},
    });
    expect(result).toEqual({ kind: "mixed" });
  });

  it("throws when assistant returns empty text", async () => {
    vi.mocked(prepareSimpleCompletionModelForAgent).mockResolvedValue({
      model: { fake: "model" } as never,
      auth: { fake: "auth" } as never,
      selection: { provider: "openai", modelId: "gpt-4", agentDir: "/" },
    });
    vi.mocked(completeWithPreparedSimpleCompletionModel).mockResolvedValue(
      { fake: "assistantMessage" } as never,
    );
    vi.mocked(extractAssistantText).mockReturnValue("   ");

    const client = await buildDirectionLlmClient({
      config: fakeConfig,
      agentId: "politiclaw",
      modelRef: "",
      logger: noopLogger,
    });
    await expect(
      client!.reason({ system: "s", user: "u", responseSchema: {} }),
    ).rejects.toThrow(/empty response/);
  });

  it("propagates JSON parse errors so direction.ts can coerce to unclear", async () => {
    vi.mocked(prepareSimpleCompletionModelForAgent).mockResolvedValue({
      model: { fake: "model" } as never,
      auth: { fake: "auth" } as never,
      selection: { provider: "openai", modelId: "gpt-4", agentDir: "/" },
    });
    vi.mocked(completeWithPreparedSimpleCompletionModel).mockResolvedValue(
      { fake: "assistantMessage" } as never,
    );
    vi.mocked(extractAssistantText).mockReturnValue("not json at all");

    const client = await buildDirectionLlmClient({
      config: fakeConfig,
      agentId: "politiclaw",
      modelRef: "",
      logger: noopLogger,
    });
    await expect(
      client!.reason({ system: "s", user: "u", responseSchema: {} }),
    ).rejects.toThrow();
  });
});
