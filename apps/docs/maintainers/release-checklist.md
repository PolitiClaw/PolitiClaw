# Release Checklist

Use this checklist when a runtime change could affect public docs.

## NPM Release Automation

PolitiClaw publishes `@politiclaw/politiclaw` through a reviewed release PR
plus a human-gated GitHub Release.

1. Run the **Prepare npm release** GitHub Action and choose `patch`, `minor`,
   or `major`.
2. Review and merge the generated release PR after checks pass.
3. Publish a GitHub Release tagged `vX.Y.Z` from `main`.
4. The **Publish npm package** workflow verifies the tag, reruns
   `npm run release:check`, confirms the version is not already published, and
   publishes with npm provenance.

One-time setup:

- Configure npm Trusted Publishing for `@politiclaw/politiclaw` with provider
  `GitHub Actions`, repository `PolitiClaw/PolitiClaw`, workflow
  `publish-npm.yml`, and environment `npm-production`.
- Create the GitHub environment `npm-production` with required reviewer
  protection.

## Manual Docs Refresh

1. Update the runtime source of truth first.
2. Regenerate docs with `npm run docs:generate`.
3. Run `npm run docs:check`.
4. Re-read any affected guide or maintainer pages for overclaims.
5. Verify the relevant generated pages changed in the expected way.
6. Build the docs site before merging or releasing.

## Changes That Usually Need A Docs Refresh

- tool additions, removals, or renamed parameters
- config-schema changes
- source coverage changes
- cron template changes
- skill additions or renamed skill directories
- storage migrations
