import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import {
  deleteIssueStance,
  IssueStanceSchema,
  listIssueStances,
  upsertIssueStance,
} from "../domain/preferences/index.js";
import { getStorage } from "../storage/context.js";
import { parse } from "../validation/typebox.js";

const IssueStancesParams = Type.Object({
  action: Type.Union(
    [Type.Literal("set"), Type.Literal("list"), Type.Literal("delete")],
    {
      description:
        "What to do: 'set' upserts a stance (requires issue+stance, optional weight); " +
        "'list' returns every declared stance ordered by weight (no other params); " +
        "'delete' removes one stance (requires issue).",
    },
  ),
  issue: Type.Optional(
    Type.String({
      description:
        "Required for action='set' and action='delete'. Issue label or slug. Normalized to lowercase kebab-case (e.g. 'Affordable Housing' → 'affordable-housing').",
    }),
  ),
  stance: Type.Optional(
    Type.Union(
      [Type.Literal("support"), Type.Literal("oppose"), Type.Literal("neutral")],
      {
        description:
          "Required for action='set'. The user's declared position on the issue.",
      },
    ),
  ),
  weight: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 5,
      description:
        "Optional (action='set' only). How strongly the user cares (1-5). Defaults to 3.",
    }),
  ),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

export const issueStancesTool: AnyAgentTool = {
  name: "politiclaw_issue_stances",
  label: "Manage declared issue stances (set, list, delete)",
  description:
    "Manage the user's declared positions on policy issues. These drive bill alignment scoring " +
    "and rep scoring. Pass action='set' with issue+stance (and optional 1-5 weight) to upsert — " +
    "re-running with the same issue overwrites the previous stance. Pass action='list' to return " +
    "every declared stance ordered by weight (no other params required). Pass action='delete' " +
    "with issue to remove a stance. For first-time setup or full reconfiguration, prefer politiclaw_configure.",
  parameters: IssueStancesParams,
  async execute(_toolCallId, rawParams) {
    const params = (rawParams ?? {}) as {
      action?: unknown;
      issue?: unknown;
      stance?: unknown;
      weight?: unknown;
    };
    const action = params.action;
    const { db } = getStorage();

    if (action === "list") {
      const rows = listIssueStances(db);
      if (rows.length === 0) {
        return textResult(
          "No issue stances set yet. Use politiclaw_issue_stances with action='set' to declare one.",
          { stances: [] },
        );
      }
      const lines = rows.map(
        (row) => `- ${row.issue}: ${row.stance} (weight ${row.weight})`,
      );
      return textResult(["Issue stances:", ...lines].join("\n"), { stances: rows });
    }

    if (action === "set") {
      const validated = parse(IssueStanceSchema, {
        issue: params.issue,
        stance: params.stance,
        ...(params.weight !== undefined ? { weight: params.weight } : {}),
      });
      const row = upsertIssueStance(db, validated);
      return textResult(
        `Saved ${row.stance} stance on '${row.issue}' (weight ${row.weight}).`,
        row,
      );
    }

    if (action === "delete") {
      const issue = typeof params.issue === "string" ? params.issue : "";
      if (!issue.trim()) {
        return textResult(
          "Cannot delete: 'issue' is required when action='delete'.",
          { status: "invalid" },
        );
      }
      const deleted = deleteIssueStance(db, issue);
      return textResult(
        deleted
          ? `Deleted issue stance '${issue.trim().toLowerCase()}'.`
          : `No issue stance found for '${issue}'.`,
        { deleted },
      );
    }

    return textResult(
      "Invalid action. Pass action: 'set' | 'list' | 'delete'.",
      { status: "invalid" },
    );
  },
};

export const issueStancesTools: AnyAgentTool[] = [issueStancesTool];
