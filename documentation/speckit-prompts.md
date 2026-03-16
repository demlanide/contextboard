# Context Board MVP — Spec Kit Prompts

## Purpose

This document contains copy-paste prompts for running Spec Kit against the current Context Board MVP documentation set.

It also defines which documents should be treated as canonical input and which files should be ignored for now.

---

## Canonical source set

Use these documents as the source of truth:

- `documentation/overview.md`
- `documentation/functional-spec.md`
- `documentation/api.md`
- `documentation/openapi.yaml`
- `documentation/data-model.md`
- `documentation/validation-rules.md`
- `documentation/non-functional-requirements.md`
- `documentation/architecture.md`
- `documentation/frontend-state-sync.md`
- `documentation/ui-flows.md`
- `documentation/agent-context.md`
- `documentation/examples.md`
- `documentation/test-matrix.md`
- `documentation/roadmap.md`
- `documentation/task-template.md`

---

## Canonical decisions to preserve in prompts

When Spec Kit synthesizes specs, preserve these rules:

- Backend is the source of truth.
- One board has one chat thread in MVP.
- Durable board mutations are validated on the server.
- Board revision is the sync primitive.
- Operations log is part of durable mutation handling.
- Agent `suggest` is non-durable.
- Agent `apply` is the only durable agent write path.
- `DELETE /boards/{boardId}` is soft delete only.
- Deleted boards are treated as not found on normal metadata/state reads.
- `PATCH` uses `application/merge-patch+json`.
- Missing image asset reference on image-node mutation returns `422 VALIDATION_ERROR`.
- Locked node mutation returns `409 LOCKED_NODE`.
- Missing thumbnail returns `404 ASSET_THUMBNAIL_NOT_AVAILABLE`.
- Backend architecture is a modular monolith.
- LLM suggest policy uses about an 18 second total request budget with at most 1 retry on transient failures.

---

## Suggested run order

1. Generate project constitution
2. Generate `001-board-foundation`
3. Plan and task-break down `001-board-foundation`
4. Generate `002-board-state-hydration`
5. Continue slice-by-slice following `documentation/roadmap.md`

---

## Prompt 1 — Constitution

Use this for the Spec Kit constitution step.

```text
Create a project constitution for Context Board MVP using the canonical documentation set in /documentation.

The constitution should reflect these project realities:
- The product is an AI-first visual board MVP with a backend-first consistency model.
- The backend is the source of truth.
- Board revision is the sync primitive.
- Durable mutations must be validated server-side and logged as operations.
- Agent suggest and agent apply must stay strictly separate.
- Agent apply is atomic and is the only durable AI write path.
- The preferred architecture is a modular monolith, not microservices.
- OpenAPI, examples, validation rules, and test matrix must stay synchronized.
- Contract-first implementation is preferred.
- Every feature slice should be independently testable.
- Any task that changes durable mutation behavior must define revision and operation-log impact.
- For MVP, correctness and integrity are more important than premature optimization.
- Timeouts, limits, retry policies, and observability requirements are explicit and must not be left to defaults.

The constitution should define:
- core engineering principles
- quality gates for implementation and review
- documentation synchronization rules
- validation and durability rules
- observability and non-functional expectations
- how future work should stay compatible with the MVP architecture

Use these documents as primary input:
- documentation/overview.md
- documentation/functional-spec.md
- documentation/api.md
- documentation/openapi.yaml
- documentation/data-model.md
- documentation/validation-rules.md
- documentation/non-functional-requirements.md
- documentation/architecture.md
- documentation/agent-context.md
- documentation/roadmap.md
- documentation/test-matrix.md
- documentation/frontend-state-sync.md
```

---

## Prompt 2 — Feature Spec: 001 Board Foundation

Use this for the first feature spec.

```text
Create the first feature spec for Context Board MVP: 001-board-foundation.

This feature should map to roadmap slice S1 in documentation/roadmap.md.

Scope:
- board creation
- board listing
- board metadata read
- board metadata update
- board soft delete
- archived/read-only and deleted/not-found lifecycle behavior
- automatic chat thread creation on board create

Rules to preserve:
- create returns 201
- patch uses application/merge-patch+json
- delete is soft delete only in MVP
- deleted boards disappear from normal listing
- deleted boards are treated as not found by normal metadata and state reads
- archived boards are read-only
- one board has exactly one chat thread in MVP
- backend is the source of truth

Include:
- prioritized user stories
- independently testable acceptance scenarios
- functional requirements
- key entities involved in this slice
- measurable success criteria suitable for MVP implementation

Explicitly exclude:
- board state hydration endpoint behavior beyond what is needed for a created board to exist
- node CRUD
- edge CRUD
- assets
- chat message send flow
- agent suggest/apply
- operations polling

Primary source docs:
- documentation/roadmap.md
- documentation/overview.md
- documentation/functional-spec.md
- documentation/api.md
- documentation/openapi.yaml
- documentation/data-model.md
- documentation/validation-rules.md
- documentation/test-matrix.md
- documentation/ui-flows.md
```

---

## Prompt 3 — Feature Spec: 002 Board State Hydration

Use this after `001-board-foundation` exists.

```text
Create the next feature spec for Context Board MVP: 002-board-state-hydration.

This feature should map to roadmap slice S2 in documentation/roadmap.md.

Scope:
- GET /boards/{boardId}/state
- stable hydration envelope for board, nodes, edges, chat thread, and revision marker
- correct empty-board behavior
- exclusion of soft-deleted entities from normal state
- deleted board behavior returning not found

Rules to preserve:
- frontend should have one stable hydration contract
- backend remains the source of truth
- deleted entities are excluded from normal state
- deleted boards are treated as not found
- hydrate should work before full node/edge feature richness is complete

Include:
- prioritized user stories
- independently testable acceptance scenarios
- functional requirements
- state envelope definition at the feature level
- success criteria tied to reliable hydration behavior

Explicitly exclude:
- node mutation endpoints
- edge mutation endpoints
- assets upload
- chat send flow
- agent suggest/apply
- operations polling

Primary source docs:
- documentation/roadmap.md
- documentation/overview.md
- documentation/functional-spec.md
- documentation/api.md
- documentation/openapi.yaml
- documentation/data-model.md
- documentation/frontend-state-sync.md
- documentation/ui-flows.md
- documentation/test-matrix.md
- documentation/non-functional-requirements.md
```

---

## Prompt 4 — Feature Spec: 003 Revision and Operations Foundation

Use this before tasking more advanced mutation-heavy slices.

```text
Create the next feature spec for Context Board MVP: 003-revision-operations-foundation.

This feature should map to roadmap slice S3 in documentation/roadmap.md.

Scope:
- board revision increment policy
- one revision bump per committed mutation batch
- board operations log write path
- operation payload shape and actor metadata
- idempotency baseline for supported POST endpoints

Rules to preserve:
- revision is the sync primitive
- durable mutations must be logged
- failed mutations must not partially commit
- no revision advance without committed durable state
- idempotent replays must be predictable
- operations logging is part of durable mutation handling, not a detached side effect

Include:
- prioritized user stories
- independently testable acceptance scenarios
- functional requirements
- key entities and persistence behavior
- success criteria tied to durable consistency

Explicitly exclude:
- full node CRUD behavior details
- edge CRUD behavior details
- assets
- chat send flow
- agent suggest/apply
- polling endpoint itself

Primary source docs:
- documentation/roadmap.md
- documentation/functional-spec.md
- documentation/api.md
- documentation/openapi.yaml
- documentation/data-model.md
- documentation/validation-rules.md
- documentation/non-functional-requirements.md
- documentation/architecture.md
- documentation/test-matrix.md
```

---

## Notes

- After each feature spec is generated, use the normal Spec Kit planning/task steps before moving to the next slice.
- Prefer one roadmap slice per feature spec unless there is a strong reason to merge them.
- `documentation/frontend-state-sync.md` is now part of the canonical source set for frontend-heavy or sync-sensitive feature specs.
