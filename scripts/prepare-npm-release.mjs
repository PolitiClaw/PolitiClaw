#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJsonPath = join(repoRoot, "packages/politiclaw-plugin/package.json");
const manifestPath = join(repoRoot, "packages/politiclaw-plugin/openclaw.plugin.json");
const packageLockPath = join(repoRoot, "package-lock.json");
const docsHomePath = join(repoRoot, "apps/docs/index.md");

const VALID_BUMPS = new Set(["patch", "minor", "major"]);

function parseArgs(argv) {
  const args = { bump: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (value === "--bump") {
      args.bump = argv[index + 1];
      index += 1;
      continue;
    }
    if (value.startsWith("--bump=")) {
      args.bump = value.slice("--bump=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }
  if (!VALID_BUMPS.has(args.bump)) {
    throw new Error(
      "Usage: node scripts/prepare-npm-release.mjs --bump patch|minor|major [--dry-run]",
    );
  }
  return args;
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Expected semver version x.y.z, got '${version}'`);
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
}

function incrementVersion(version, bump) {
  const parsedVersion = parseVersion(version);
  if (bump === "major") {
    return `${parsedVersion.major + 1}.0.0`;
  }
  if (bump === "minor") {
    return `${parsedVersion.major}.${parsedVersion.minor + 1}.0`;
  }
  return `${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch + 1}`;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function requirePackageLockEntry(packageLock, path) {
  const entry = packageLock.packages?.[path];
  if (!entry || typeof entry !== "object") {
    throw new Error(`package-lock.json is missing packages['${path}']`);
  }
  return entry;
}

function replaceDocsVersion(contents, nextVersion) {
  const nextLabel = `v${nextVersion}`;
  const eyebrowPattern =
    /(<div class="pc-eyebrow">overview <span class="red">·<\/span> )v\d+\.\d+\.\d+( <span class="blue">·<\/span> openclaw plugin<\/div>)/;
  const chipPattern =
    /(<span class="pc-chip"><span class="dot"><\/span> )v\d+\.\d+\.\d+( · local-first<\/span>)/;

  if (!eyebrowPattern.test(contents)) {
    throw new Error("Could not find docs home eyebrow version badge");
  }
  if (!chipPattern.test(contents)) {
    throw new Error("Could not find docs home chip version badge");
  }

  return contents
    .replace(eyebrowPattern, `$1${nextLabel}$2`)
    .replace(chipPattern, `$1${nextLabel}$2`);
}

function assertReleaseVersions({ packageJson, manifest, packageLock, docsHome, nextVersion }) {
  const packageLockEntry = requirePackageLockEntry(packageLock, "packages/politiclaw-plugin");
  const docsVersion = `v${nextVersion}`;

  const checks = [
    ["packages/politiclaw-plugin/package.json", packageJson.version === nextVersion],
    ["packages/politiclaw-plugin/openclaw.plugin.json", manifest.version === nextVersion],
    ["package-lock.json", packageLockEntry.version === nextVersion],
    ["apps/docs/index.md eyebrow", docsHome.includes(`overview <span class="red">·</span> ${docsVersion}`)],
    ["apps/docs/index.md chip", docsHome.includes(`${docsVersion} · local-first`)],
  ];

  const failures = checks.filter(([, passed]) => !passed).map(([label]) => label);
  if (failures.length > 0) {
    throw new Error(`Release version update incomplete: ${failures.join(", ")}`);
  }
}

const { bump, dryRun } = parseArgs(process.argv.slice(2));

const packageJson = await readJson(packageJsonPath);
const manifest = await readJson(manifestPath);
const packageLock = await readJson(packageLockPath);
const packageLockEntry = requirePackageLockEntry(packageLock, "packages/politiclaw-plugin");

if (packageJson.version !== manifest.version) {
  throw new Error(
    `Package version '${packageJson.version}' does not match manifest version '${manifest.version}'`,
  );
}
if (packageLockEntry.version !== packageJson.version) {
  throw new Error(
    `Package lock version '${packageLockEntry.version}' does not match package version '${packageJson.version}'`,
  );
}

const currentVersion = packageJson.version;
const nextVersion = incrementVersion(currentVersion, bump);

packageJson.version = nextVersion;
manifest.version = nextVersion;
packageLockEntry.version = nextVersion;

const docsHome = replaceDocsVersion(await readFile(docsHomePath, "utf8"), nextVersion);

assertReleaseVersions({ packageJson, manifest, packageLock, docsHome, nextVersion });

if (!dryRun) {
  await writeJson(packageJsonPath, packageJson);
  await writeJson(manifestPath, manifest);
  await writeJson(packageLockPath, packageLock);
  await writeFile(docsHomePath, docsHome);
}

const suffix = dryRun ? " (dry run)" : "";
console.log(`Prepared @politiclaw/politiclaw ${currentVersion} -> ${nextVersion}${suffix}`);
