# Config Schema

The generated config schema page is the source of truth for current keys, whether each one is wired today, and which files back that status.

- [Generated Config Schema](./generated/config-schema)
- [Generated Config Schema JSON](./generated/config-schema.json)

## How To Read The Status Columns

- `implemented`: the runtime uses this key today.
- `optional_upgrade`: the runtime uses this key when you configure it.

The schema only declares named keys for providers that are actually wired. For roadmap providers, see the **Roadmap** section of the plugin README. Unknown legacy key strings may still validate so older configs keep loading, but they are ignored by runtime adapters.
