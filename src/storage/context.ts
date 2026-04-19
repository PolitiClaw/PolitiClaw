import { join } from "node:path";
import { openDb, type PolitiClawDb } from "./sqlite.js";
import { Kv } from "./kv.js";

export type PolitiClawStorage = {
  db: PolitiClawDb;
  kv: Kv;
};

let storage: PolitiClawStorage | null = null;
let resolveStateDir: (() => string) | null = null;

/**
 * Called once from `register(api)` with the SDK's state-dir resolver.
 * We don't open the DB eagerly — we wait until the first tool call so plugin
 * boot stays cheap and test harnesses can override with `setStorageForTests`.
 */
export function configureStorage(resolver: () => string): void {
  resolveStateDir = resolver;
}

export function getStorage(): PolitiClawStorage {
  if (storage) return storage;
  if (!resolveStateDir) {
    throw new Error("politiclaw storage: configureStorage() was not called");
  }
  const dbDir = join(resolveStateDir(), "plugins", "politiclaw");
  const db = openDb({ dbDir });
  storage = { db, kv: new Kv(db) };
  return storage;
}

export function setStorageForTests(next: PolitiClawStorage | null): void {
  storage = next;
}

export function resetStorageConfigForTests(): void {
  storage = null;
  resolveStateDir = null;
}
