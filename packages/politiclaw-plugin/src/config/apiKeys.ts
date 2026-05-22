export const API_KEY_NAMES = [
  "apiDataGov",
  "geocodio",
  "googleCivic",
] as const;

export type ApiKeyName = (typeof API_KEY_NAMES)[number];
