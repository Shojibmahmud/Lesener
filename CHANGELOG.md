# Changelog

All notable changes to Lesener are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries were reconstructed from git history during the September 2026 documentation
pass, grouped by the feature they delivered rather than one line per commit.

## [Unreleased]

### Added
- Full documentation set: a real `README.md`, a `docs/` tree covering architecture,
  data model, setup, testing, operations, security and content authoring, ten
  architecture decision records, `CONTRIBUTING.md`, `CLAUDE.md` and this file.
- `LICENSE` (MIT).

- `docs/deployment.md`, documenting the live Vercel deployment: build settings, the
  Config-not-Secret rule for `VITE_` environment variables, how to verify a deploy
  from the bundle itself, and the partial edge-IP unreachability seen from Bangladesh.

### Changed
- **Deployed to <https://lesener.vercel.app>** (Vercel Hobby, built from `main`).
- `supabase/README.md` reduced from 825 lines to a pointer; its reference material
  moved into `docs/` and its per-level seeding journal into `docs/content-log.md`.
- `docs/operations.md` is now the backend runbook only; frontend deployment moved to
  `docs/deployment.md`.

## [0.1.0] — 2026-09-03

The ladder is complete: ten levels, 100 posts, 8,170 dictionary rows, every feature
wired to the database.

### Added

- **The reading ladder.** Ten levels of authored German — 100 posts of 450–658 words
  — with the vocabulary behind them. Levels 1–9 are B1; level 10 is a deliberate B2
  preview. Every word in the app resolves on tap; none renders as an em dash.
- **Content pipeline.** Prose and dictionary authored as files under `src/assets/`
  and applied as idempotent, checksummed SQL. Three helper scripts validate prose,
  report dictionary gaps and generate the seed.
- **Reading progress and level unlocking.** Finishing a post writes a
  `reading_sessions` row; a trigger rolls it up into `reading_progress`; the level
  gate opens off the result and is enforced by row-level security.
- **Vocabulary bank.** Tap a word to save it, grouped by post, removable, surviving
  the post it came from.
- **Accounts.** Sign-up with a real name, sign-in, password reset by email link,
  in-app password change (which signs out other sessions), and account deletion that
  actually deletes, via a password-gated Edge Function.
- **Profiles.** The dashboard greets the reader by name; names are editable and
  correct for scripts where `charAt(0)` is not.
- **Theme.** Light and dark, following the account rather than the browser, painted
  before the first frame so a dark reader never sees a white flash.
- **Schema.** Seven tables, one view, four functions, seven triggers, fourteen RLS
  policies, `anon` revoked everywhere. 85 SQL assertions covering the gate, the
  triggers, cross-user isolation and the deletion cascade.
- **Test suite.** 23 Vitest files, 252 cases, never touching the network.

### Fixed

- Dictionary reads silently truncated at 1,000 rows by PostgREST's response cap;
  `fetchDictionary` now pages under a stable sort.
- A `PGRST303` clock-skew failure on the first fetch after sign-in, now retried once.
- A returning reader briefly seeing the landing page before their session restored.
- Locked and empty levels reading alike in the dashboard.
- A JWT for a deleted account still rendering a working dashboard on another device.

[Unreleased]: https://github.com/Shojibmahmud/Lesener/compare/main...HEAD
[0.1.0]: https://github.com/Shojibmahmud/Lesener/releases/tag/v0.1.0
