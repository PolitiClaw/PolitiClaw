/**
 * Resolves the effective per-bill direction used by representative-alignment
 * scoring, given the user's `auto_direction_mode` preference, an optional
 * explicit user signal, and an optional classifier output.
 *
 * Rules (matches the design spec — see plan for the source-of-truth table):
 *
 * - User signal, when present, always wins for `supplement`, `co-equal`,
 *   and `advisory`. (`off` is handled below.)
 * - `off`: classifier output is ignored; only user signals count.
 * - `supplement`: classifier counts only when no user signal exists.
 * - `co-equal`: classifier counts; user signal overrides per-bill (same
 *   effective scoring shape as `supplement`; the modes diverge in how
 *   audit trails surface to the review tool, not in scoring math).
 * - `advisory`: classifier never auto-counts; user signals are the only
 *   source of "this bill counted toward the rep score."
 *
 * For modes that *do* admit classifier output, only high-confidence
 * `advances` / `obstructs` calls count automatically. Mid-confidence,
 * `mixed`, `unclear`, and below-floor results return `null` (excluded
 * from scoring; surfaced in the review tool by callers that care).
 */
import type { AutoDirectionMode } from "../preferences/types.js";
import type { BillDirection } from "./direction.js";
import { HIGH_CONFIDENCE_THRESHOLD } from "./direction.js";

export type EffectiveDirection = "agree" | "disagree" | null;

export type ResolveDirectionInput = {
  mode: AutoDirectionMode;
  userDirection: "agree" | "disagree" | null;
  classifier: BillDirection | null;
};

export function resolveEffectiveDirection(
  input: ResolveDirectionInput,
): EffectiveDirection {
  if (input.mode === "off") {
    return input.userDirection ?? null;
  }

  if (input.userDirection) {
    return input.userDirection;
  }

  if (input.mode === "advisory") {
    return null;
  }

  if (!input.classifier) {
    return null;
  }

  if (input.classifier.kind === "advances") {
    return input.classifier.confidence >= HIGH_CONFIDENCE_THRESHOLD
      ? "agree"
      : null;
  }
  if (input.classifier.kind === "obstructs") {
    return input.classifier.confidence >= HIGH_CONFIDENCE_THRESHOLD
      ? "disagree"
      : null;
  }
  return null;
}
