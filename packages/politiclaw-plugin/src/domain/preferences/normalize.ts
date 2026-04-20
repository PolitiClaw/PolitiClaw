/**
 * Best-effort mapping from free-form user text ("global warming",
 * "guns", "choice") onto one of the canonical kebab-case issue slugs the
 * rest of the plugin expects. Used by the conversation onboarding mode so
 * the skill does not have to memorize the slug set and can hand raw user
 * wording through to the tool.
 *
 * Returns `matchedCanonical: true` only when a synonym was hit. A novel
 * issue (no synonym match) still gets a usable kebab-case slug so the
 * skill can decide whether to persist it or flag "this isn't one of our
 * canonical issues — keep it?" to the user.
 */

const CANONICAL_SYNONYMS: Record<string, readonly string[]> = {
  "affordable-housing": [
    "affordable housing",
    "housing",
    "rent",
    "renters",
    "zoning",
    "lihtc",
    "home prices",
  ],
  climate: [
    "climate",
    "climate change",
    "global warming",
    "clean energy",
    "renewable energy",
    "carbon",
    "emissions",
    "environment",
  ],
  healthcare: [
    "healthcare",
    "health care",
    "medicare",
    "medicaid",
    "insurance",
    "aca",
    "obamacare",
    "single payer",
    "public option",
  ],
  immigration: [
    "immigration",
    "immigrants",
    "border",
    "asylum",
    "daca",
    "citizenship",
    "dreamers",
  ],
  "gun-policy": [
    "guns",
    "gun",
    "firearm",
    "firearms",
    "second amendment",
    "2a",
    "gun control",
    "gun rights",
  ],
  "reproductive-rights": [
    "abortion",
    "reproductive",
    "reproductive rights",
    "choice",
    "pro-choice",
    "pro choice",
    "pro-life",
    "pro life",
    "dobbs",
    "roe",
  ],
  "labor-rights": [
    "labor",
    "unions",
    "union",
    "minimum wage",
    "wages",
    "workers",
    "worker rights",
    "collective bargaining",
  ],
  "tax-policy": [
    "taxes",
    "tax",
    "tax policy",
    "wealth tax",
    "corporate tax",
    "irs",
  ],
  "defense-spending": [
    "defense",
    "military",
    "pentagon",
    "defense spending",
    "military spending",
    "war",
    "foreign policy",
  ],
  "voting-rights": [
    "voting",
    "voting rights",
    "elections",
    "voter id",
    "mail in voting",
    "gerrymandering",
  ],
  education: [
    "education",
    "schools",
    "public schools",
    "student loans",
    "college",
    "universities",
    "teachers",
  ],
  "criminal-justice": [
    "criminal justice",
    "police",
    "policing",
    "prisons",
    "incarceration",
    "sentencing",
    "bail reform",
  ],
};

export type NormalizedIssue = {
  slug: string;
  matchedCanonical: boolean;
};

export function normalizeFreeformIssue(rawText: string): NormalizedIssue | null {
  const text = rawText.trim();
  if (text.length === 0) return null;
  const lower = text.toLowerCase();

  for (const [slug, synonyms] of Object.entries(CANONICAL_SYNONYMS)) {
    for (const synonym of synonyms) {
      if (containsWholePhrase(lower, synonym)) {
        return { slug, matchedCanonical: true };
      }
    }
  }

  return {
    slug: toKebabSlug(text),
    matchedCanonical: false,
  };
}

export function canonicalIssueSlugs(): string[] {
  return Object.keys(CANONICAL_SYNONYMS);
}

function containsWholePhrase(haystack: string, needle: string): boolean {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return false;
  const before = idx === 0 ? " " : haystack[idx - 1]!;
  const afterIdx = idx + needle.length;
  const after = afterIdx >= haystack.length ? " " : haystack[afterIdx]!;
  return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
}

function toKebabSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
