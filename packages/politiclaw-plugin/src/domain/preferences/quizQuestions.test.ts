import { describe, it, expect } from "vitest";
import { QUIZ_QUESTIONS } from "./quizQuestions.js";

describe("QUIZ_QUESTIONS", () => {
  it("has at least ten questions", () => {
    expect(QUIZ_QUESTIONS.length).toBeGreaterThanOrEqual(10);
  });

  it("every question carries a kebab-case canonical slug", () => {
    for (const q of QUIZ_QUESTIONS) {
      expect(q.canonicalIssueSlug).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it("every question has a non-empty prompt and three distinct answer labels", () => {
    for (const q of QUIZ_QUESTIONS) {
      expect(q.prompt.trim().length).toBeGreaterThan(0);
      expect(q.supportAnswer.trim().length).toBeGreaterThan(0);
      expect(q.opposeAnswer.trim().length).toBeGreaterThan(0);
      expect(q.neutralAnswer.trim().length).toBeGreaterThan(0);
      const labels = new Set([q.supportAnswer, q.opposeAnswer, q.neutralAnswer]);
      expect(labels.size).toBe(3);
      expect(q.weightPrompt.trim().length).toBeGreaterThan(0);
    }
  });

  it("no canonical slug appears more than twice across the bank", () => {
    const counts = new Map<string, number>();
    for (const q of QUIZ_QUESTIONS) {
      counts.set(q.canonicalIssueSlug, (counts.get(q.canonicalIssueSlug) ?? 0) + 1);
    }
    for (const [slug, count] of counts) {
      expect(count, `${slug} appears ${count} times`).toBeLessThanOrEqual(2);
    }
  });

  it("question ids are unique", () => {
    const ids = QUIZ_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
