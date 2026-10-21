---
name: backend-architecture
description: Use when designing a new module, moving responsibilities between layers, introducing infrastructure (queue, cache, service, datastore), or reviewing a change for architectural fit in the Prayosha API. Covers module boundaries, dependency direction, and when new infrastructure is justified.
---

# Backend architecture

## Purpose

Keep the Prayosha API a coherent modular monolith: clear module boundaries, one-way dependencies, infrastructure behind ports, and no new moving parts without a measured reason.

## When to use

- Adding a domain module (projects, inventory, purchase, petty cash, possession, drawings, plan changes …).
- Anything that adds a dependency, process, queue, cache or external service.
- Refactors that move code between routes/controllers/services/repositories.

## Workflow

1. Read `docs/architecture.md` §3–4 and `CLAUDE.md` "Architecture".
2. Write down the module's access patterns first (who reads/writes what, how often, list sizes). These drive the schema and indexes (`docs/database-design.md`).
3. Lay out `src/modules/<name>/` with routes → controller → service → repository, `*.schema.ts`, `*.types.ts`. Wire it in `src/app.ts` only.
4. Cross-module needs: depend on the other module's **service or read-only repository method**, never write to another module's collection. If two modules need each other, extract the shared concept into `src/common/` or redesign — no cycles.
5. External systems go behind an interface in `src/infrastructure/` (or the module) and are injected via `AppDependencies` so tests can fake them.
6. Slow or non-critical work (email, WhatsApp, image processing, bulk ops) goes to a BullMQ job with an idempotent processor in `src/jobs/workers/`; the request returns once the critical write is committed.
7. New infrastructure needs a written justification in the PR: the measured problem, why the existing stack cannot solve it, failure behaviour, and the operational cost.

## Validation checklist

- [ ] No business logic in routes/controllers; no MongoDB calls outside repositories.
- [ ] No import cycles; `users` does not import `auth`; modules do not write each other's collections.
- [ ] New external dependency is behind a port and faked in tests.
- [ ] Failure mode of every new dependency documented (what happens when it is down).
- [ ] No microservice, Kubernetes, or extra datastore without measured justification.
- [ ] `docs/architecture.md` updated if the shape of the system changed.

## Relevant files

`src/app.ts`, `src/server.ts`, `src/worker.ts`, `src/modules/*`, `src/common/*`, `src/infrastructure/*`, `src/jobs/*`, `docs/architecture.md`, `docs/scaling-roadmap.md`.
