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
5. Generate `003-revision-operations-foundation`
6. Generate `004-frontend-foundation`
7. Continue slice-by-slice following `documentation/roadmap.md`

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

## Prompt 5 — Feature Spec: 004 Frontend Foundation

Use this after `001-board-foundation` and `002-board-state-hydration` exist.

```text
Create the next feature spec for Context Board MVP: 004-frontend-foundation.

This feature should map to roadmap slice S3.5 in documentation/roadmap.md.

Scope:
- frontend app bootstrap and runtime configuration
- frontend routing and board route
- shared API client and environment wiring
- minimal board create/open flow using existing board APIs
- app shell and board screen skeleton
- hydration integration with GET /boards/{boardId}/state
- loading, empty, and error states for initial board load
- canvas placeholder and chat placeholder surfaces
- frontend lint/test baseline

Rules to preserve:
- backend remains the source of truth
- hydration response is authoritative for confirmed board state
- this slice prepares the real web app surface without redefining backend contracts
- board create/open flow should use the existing S1 and S2 APIs rather than invent frontend-only state
- empty board should render as an actual app screen, not a mock or fake local stub

Include:
- prioritized user stories
- independently testable acceptance scenarios
- functional requirements
- initial frontend architecture and state boundaries
- measurable success criteria suitable for MVP implementation

Explicitly exclude:
- node CRUD behavior beyond placeholders and render surfaces
- edge CRUD
- assets upload flow
- chat send flow
- agent suggest/apply
- operations polling

Primary source docs:
- documentation/roadmap.md
- documentation/overview.md
- documentation/api.md
- documentation/openapi.yaml
- documentation/frontend-state-sync.md
- documentation/ui-flows.md
- documentation/non-functional-requirements.md
- documentation/architecture.md
- documentation/test-matrix.md
```

---

## Prompt 6 — Feature Spec: 005 Node CRUD

Use this after `003-revision-operations-foundation` and `004-frontend-foundation` exist.

```text
Create the next feature spec for Context Board MVP: 005-node-crud.

This feature should map to roadmap slice S4 in documentation/roadmap.md.

Scope:
- POST /boards/{boardId}/nodes
- PATCH /nodes/{nodeId}
- DELETE /nodes/{nodeId}
- core node validation for geometry, content, style, metadata, lock state
- soft-delete behavior for nodes
- cascade soft-delete of connected edges when a node is deleted
- board canvas rendering of confirmed nodes
- node create/edit/move/delete interactions in the browser
- pending, saved, and failed node UI states with response reconciliation

Rules to preserve:
- backend is the source of truth
- node mutations are durable board mutations
- successful node mutations increment revision and write operations
- patch uses application/merge-patch+json
- locked nodes return 409 LOCKED_NODE
- node delete is soft delete
- deleted nodes are excluded from normal board state
- optimistic UI is temporary convenience only; server response defines final durable state

Boundary rule:
- prioritize sticky, text, and shape node behavior in this slice
- do not make asset-backed image node behavior a required part of this spec; that belongs to 008-assets-image-nodes

Include:
- prioritized user stories
- independently testable acceptance scenarios
- functional requirements
- node entity rules and mutation behavior
- measurable success criteria suitable for MVP implementation

Explicitly exclude:
- assets upload and retrieval
- image-node happy path that depends on uploaded assets
- edge CRUD as a standalone capability
- batch mutation endpoint
- chat and agent flows
- operations polling

Primary source docs:
- documentation/roadmap.md
- documentation/functional-spec.md
- documentation/api.md
- documentation/openapi.yaml
- documentation/data-model.md
- documentation/validation-rules.md
- documentation/frontend-state-sync.md
- documentation/ui-flows.md
- documentation/test-matrix.md
- documentation/architecture.md
```

---

## Prompt 7 — Feature Spec: 006 Edge CRUD

Use this after `005-node-crud` exists.

```text
Create the next feature spec for Context Board MVP: 006-edge-crud.

This feature should map to roadmap slice S5 in documentation/roadmap.md.

Scope:
- POST /boards/{boardId}/edges
- PATCH /edges/{edgeId}
- DELETE /edges/{edgeId}
- edge validation for same-board references, deleted-node rejection, and self-loop rejection
- soft-delete behavior for edges
- browser interaction for connecting nodes
- temporary edge preview and valid/invalid target feedback
- rollback-safe UI behavior when edge creation fails

Rules to preserve:
- backend is the source of truth
- valid edges only connect active nodes on the same board
- self-loop edges are rejected in MVP
- edge mutations increment revision and write operations
- patch uses application/merge-patch+json
- deleted edges are excluded from normal board state
- backend validation remains authoritative even if the UI prevents obvious invalid targets early

Include:
- prioritized user stories
- independently testable acceptance scenarios
- functional requirements
- edge lifecycle rules
- measurable success criteria suitable for MVP implementation

Explicitly exclude:
- node CRUD details except what edge validation requires
- assets
- batch mutation endpoint
- chat and agent flows
- operations polling

Primary source docs:
- documentation/roadmap.md
- documentation/functional-spec.md
- documentation/api.md
- documentation/openapi.yaml
- documentation/data-model.md
- documentation/validation-rules.md
- documentation/frontend-state-sync.md
- documentation/ui-flows.md
- documentation/test-matrix.md
- documentation/architecture.md
```

---

## Prompt 8 — Feature Spec: 007 Node Batch Mutations

Use this after `005-node-crud` and `003-revision-operations-foundation` exist.

```text
Create the next feature spec for Context Board MVP: 007-node-batch-mutations.

This feature should map to roadmap slice S6 in documentation/roadmap.md.

Scope:
- POST /boards/{boardId}/nodes/batch
- ordered execution of create/update/delete batch items
- atomic rollback on failure
- temp id mapping for created nodes
- revision and operation-log behavior for batch commits
- browser support for grouped or multi-node actions where useful
- reconciliation from returned batch diff instead of local inference
- UI behavior for pending grouped actions and rollback on failure

Rules to preserve:
- all-or-nothing transaction
- max 200 operations per request
- one revision bump for the whole committed batch
- failed batch leaves durable state unchanged
- temp ids resolve deterministically
- backend is the source of truth
- returned batch diff is the canonical final state for the client

Include:
- prioritized user stories
- independently testable acceptance scenarios
- functional requirements
- temp-id and rollback behavior
- measurable success criteria suitable for MVP implementation

Explicitly exclude:
- agent apply flow
- assets
- chat
- operations polling endpoint itself
- snapshot/recovery behavior unless absolutely necessary for this slice

Primary source docs:
- documentation/roadmap.md
- documentation/functional-spec.md
- documentation/api.md
- documentation/openapi.yaml
- documentation/data-model.md
- documentation/validation-rules.md
- documentation/test-matrix.md
- documentation/architecture.md
- documentation/frontend-state-sync.md
```

---

## Prompt 9 — Feature Spec: 008 Assets and Image Nodes

Use this after `005-node-crud` exists.

```text
Create the next feature spec for Context Board MVP: 008-assets-image-nodes.

This feature should map to roadmap slice S7 in documentation/roadmap.md.

Scope:
- POST /assets/upload
- GET /assets/{assetId}
- GET /assets/{assetId}/file
- GET /assets/{assetId}/thumbnail
- asset metadata persistence
- image-node compatibility through content.assetId
- enabling image node create/update behavior backed by uploaded assets
- browser upload flow with progress or visible in-flight state
- image placement interaction after upload
- UI distinction between upload failure and placement failure

Rules to preserve:
- upload returns 201
- oversize upload returns 413
- unsupported mime type returns 415
- missing image asset reference returns 422 VALIDATION_ERROR
- missing thumbnail returns 404 ASSET_THUMBNAIL_NOT_AVAILABLE
- deleting an image node does not delete the asset in MVP
- backend is the source of truth
- user must be able to tell whether the asset upload succeeded, node placement succeeded, or both

Include:
- prioritized user stories
- independently testable acceptance scenarios
- functional requirements
- asset lifecycle and image-node compatibility rules
- measurable success criteria suitable for MVP implementation

Explicitly exclude:
- OCR/captioning as a required synchronous capability
- long-running asset intelligence workflows beyond MVP hooks
- chat and agent flows except what they require from asset metadata later
- operations polling

Primary source docs:
- documentation/roadmap.md
- documentation/functional-spec.md
- documentation/api.md
- documentation/openapi.yaml
- documentation/data-model.md
- documentation/validation-rules.md
- documentation/examples.md
- documentation/frontend-state-sync.md
- documentation/ui-flows.md
- documentation/non-functional-requirements.md
- documentation/test-matrix.md
- documentation/architecture.md
```

---

## Prompt 10 — Feature Spec: 009 Chat Persistence

Use this after `001-board-foundation`, `002-board-state-hydration`, and `004-frontend-foundation` exist.

```text
Create the next feature spec for Context Board MVP: 009-chat-persistence.

This feature should map to roadmap slice S8 in documentation/roadmap.md.

Scope:
- GET /boards/{boardId}/chat
- POST /boards/{boardId}/chat/messages
- persistent append-only user and agent messages
- selection context persistence
- board-scoped thread/message behavior
- board chat panel or drawer
- message composer and history rendering
- loading and failure states for chat send flow

Rules to preserve:
- one board has one chat thread
- chat messages are durable but plain chat does not mutate board state
- archived boards allow chat/history reads only
- archived boards reject new chat messages
- backend is the source of truth
- the user must not think the board changed just because chat returned a response

Include:
- prioritized user stories
- independently testable acceptance scenarios
- functional requirements
- thread/message entity behavior
- measurable success criteria suitable for MVP implementation

Explicitly exclude:
- dedicated agent suggest endpoint
- dedicated agent apply endpoint
- operations polling
- recovery features

Primary source docs:
- documentation/roadmap.md
- documentation/functional-spec.md
- documentation/api.md
- documentation/openapi.yaml
- documentation/data-model.md
- documentation/validation-rules.md
- documentation/ui-flows.md
- documentation/frontend-state-sync.md
- documentation/test-matrix.md
```

---

## Prompt 11 — Feature Spec: 010 Agent Suggest

Use this after `009-chat-persistence`, `005-node-crud`, `006-edge-crud`, and `008-assets-image-nodes` exist.

```text
Create the next feature spec for Context Board MVP: 010-agent-suggest.

This feature should map to roadmap slice S9 in documentation/roadmap.md.

Scope:
- POST /boards/{boardId}/agent/actions in suggest mode
- context building from board, selection, nearby/visible nodes, edges, and referenced assets
- sanitization and truncation behavior
- model output validation
- preview payload and safe plan return
- prompt-entry UX in the board screen
- assistant response rendering in chat or suggestion surface
- preview UI for proposed changes
- dismiss, retry, and invalid-suggestion handling in the interface

Rules to preserve:
- suggest is non-durable
- suggest must not increment board revision
- malformed or unsafe action plans are rejected rather than treated as valid
- backend sanitizes context before sending it to the model
- suggest keeps preview state separate from confirmed board state
- LLM suggest policy uses an approximately 18 second total request budget with at most 1 retry on transient failures
- preview must remain visually distinct from committed board content

Include:
- prioritized user stories
- independently testable acceptance scenarios
- functional requirements
- expected action plan shape and validation behavior
- measurable success criteria suitable for MVP implementation

Explicitly exclude:
- durable apply behavior
- final transaction commit of suggested actions
- operations polling
- recovery/snapshot features unless required by suggest diagnostics only

Primary source docs:
- documentation/roadmap.md
- documentation/functional-spec.md
- documentation/api.md
- documentation/openapi.yaml
- documentation/agent-context.md
- documentation/validation-rules.md
- documentation/non-functional-requirements.md
- documentation/ui-flows.md
- documentation/frontend-state-sync.md
- documentation/examples.md
- documentation/test-matrix.md
- documentation/architecture.md
```

---

## Prompt 12 — Feature Spec: 011 Agent Apply

Use this after `010-agent-suggest` and the mutation foundation slices exist.

```text
Create the next feature spec for Context Board MVP: 011-agent-apply.

This feature should map to roadmap slice S10 in documentation/roadmap.md.

Scope:
- POST /boards/{boardId}/agent/actions/apply
- re-validation of submitted action plans
- transactional apply of creates, updates, deletes, and layout changes
- temp id resolution for newly created entities
- agent-attributed operation rows
- explicit apply interaction in the UI
- apply loading, success, and failure states
- duplicate-apply prevention
- confirmed-state reconciliation from the server apply response

Rules to preserve:
- apply is the only durable agent write path
- apply is all-or-nothing
- apply increments revision exactly once on success
- apply writes durable operations for committed changes
- locked targets return 409 LOCKED_NODE
- invalid plans return 422 ACTION_PLAN_INVALID
- no partial state is committed on failure
- the UI must not treat preview content as committed board state before server confirmation

Include:
- prioritized user stories
- independently testable acceptance scenarios
- functional requirements
- apply validation and transaction behavior
- measurable success criteria suitable for MVP implementation

Explicitly exclude:
- new suggest behavior beyond what apply consumes
- operations polling endpoint
- recovery/snapshot requirements except where they are explicitly part of apply safety

Primary source docs:
- documentation/roadmap.md
- documentation/functional-spec.md
- documentation/api.md
- documentation/openapi.yaml
- documentation/data-model.md
- documentation/agent-context.md
- documentation/validation-rules.md
- documentation/non-functional-requirements.md
- documentation/frontend-state-sync.md
- documentation/ui-flows.md
- documentation/examples.md
- documentation/test-matrix.md
- documentation/architecture.md
```

---

## Prompt 13 — Feature Spec: 012 Operations Polling

Use this after `003-revision-operations-foundation` and `004-frontend-foundation` exist.

```text
Create the next feature spec for Context Board MVP: 012-operations-polling.

This feature should map to roadmap slice S11 in documentation/roadmap.md.

Scope:
- GET /boards/{boardId}/operations?afterRevision=...&limit=...
- filtering by revision
- deterministic ordering
- limit/pagination behavior for MVP polling
- client sync layer for afterRevision polling
- stale-state detection and rehydrate fallback behavior
- lightweight UI or sync-state signaling where useful

Rules to preserve:
- revision is the sync primitive
- operations returned must reflect committed durable state only
- results are strictly after the requested revision
- ordering must be stable and deterministic
- backend remains the source of truth
- incremental polling should extend the confirmed-state model, not create a conflicting second state system

Include:
- prioritized user stories
- independently testable acceptance scenarios
- functional requirements
- incremental sync semantics
- measurable success criteria suitable for MVP implementation

Explicitly exclude:
- websocket/realtime sync
- collaborative multi-user state propagation
- recovery features

Primary source docs:
- documentation/roadmap.md
- documentation/functional-spec.md
- documentation/api.md
- documentation/openapi.yaml
- documentation/data-model.md
- documentation/frontend-state-sync.md
- documentation/non-functional-requirements.md
- documentation/test-matrix.md
- documentation/architecture.md
```

---

## Prompt 14 — Feature Spec: 013 Recovery and Polish

Use this last, after the core MVP slices are stable.

```text
Create the next feature spec for Context Board MVP: 013-recovery-polish.

This feature should map to roadmap slice S12 in documentation/roadmap.md.

Scope:
- snapshot creation policy for destructive or high-impact flows
- restore aids and recovery-oriented safeguards
- summary field refresh policies
- undo foundations where useful for future extension
- sync/reload polish that does not change the core MVP architecture
- recovery-oriented UX hooks
- clearer status messaging for risky or long-running flows
- polish around draft, preview, confirmed, failed, and stale states

Rules to preserve:
- this slice must not distort the simpler MVP architecture
- snapshots are restore aids, not the source of truth
- recovery features must never weaken core durability guarantees
- do not introduce realtime collaboration or full version history in this slice
- polish should improve confidence without changing earlier MVP contracts

Include:
- prioritized user stories
- independently testable acceptance scenarios
- functional requirements
- recovery and summary behavior
- measurable success criteria suitable for MVP implementation

Explicitly exclude:
- multi-user collaboration
- CRDT/conflict-resolution systems
- full branching/version-history product scope
- large autonomous background orchestration beyond narrow MVP jobs

Primary source docs:
- documentation/roadmap.md
- documentation/functional-spec.md
- documentation/data-model.md
- documentation/api.md
- documentation/non-functional-requirements.md
- documentation/architecture.md
- documentation/agent-context.md
- documentation/ui-flows.md
- documentation/frontend-state-sync.md
- documentation/test-matrix.md
```

---

## Notes

- After each feature spec is generated, use the normal Spec Kit planning/task steps before moving to the next slice.
- Prefer one roadmap slice per feature spec unless there is a strong reason to merge them.
- `documentation/frontend-state-sync.md` is now part of the canonical source set for frontend-heavy or sync-sensitive feature specs.
