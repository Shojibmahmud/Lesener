# Lesener documentation

Start here. Each page has one job, in the
[Diátaxis](https://diataxis.fr/) sense — none of them is a second place to put
everything.

| | Page | Kind |
|---|---|---|
| **Getting it running** | [local-setup.md](local-setup.md) | tutorial |
| **How it fits together** | [architecture.md](architecture.md) | explanation |
| **The schema** | [data-model.md](data-model.md) | reference |
| **The test suites** | [testing.md](testing.md) | reference + how-to |
| **Running the backend** | [operations.md](operations.md) | how-to |
| **The security posture** | [security.md](security.md) | explanation |
| **Writing German content** | [content-authoring.md](content-authoring.md) | how-to |
| **What was seeded, when** | [content-log.md](content-log.md) | journal |
| **Why things are this way** | [decisions/](decisions/) | ADRs |

Also in the repository root: [CONTRIBUTING.md](../CONTRIBUTING.md) for the workflow
and the gates, [CHANGELOG.md](../CHANGELOG.md), and [CLAUDE.md](../CLAUDE.md) for
agent-facing conventions.

## Reading paths

**"I want to run this."** → [local-setup.md](local-setup.md).

**"I want to change some code."** → [architecture.md](architecture.md), then
[CONTRIBUTING.md](../CONTRIBUTING.md).

**"I want to change the schema."** → [data-model.md](data-model.md), then
[operations.md](operations.md), then [testing.md](testing.md#the-sql-suite).

**"I want to fix a typo in a German post."** →
[content-authoring.md](content-authoring.md). It is a file edit and a re-run, but
the upsert rule matters.

**"Why on earth is it built like this?"** → [decisions/](decisions/), ten records,
shortest first.

## A note on how this is maintained

Documentation lives in the repo and changes in the same commit as the code it
describes. Two conventions are worth knowing:

- **Migrations are append-only, so migration comments go stale and are never
  edited.** Where a comment and a document disagree, the document is the correction.
  [`profiles.theme`](data-model.md#theme) is the worked example.
- **Line references drift.** Prefer searching for a symbol name over trusting a
  `file.js:123` in any document written more than a few commits ago.
