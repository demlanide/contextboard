# Context Board MVP — Roadmap

## 1. Purpose

This document turns the existing MVP specification into an implementation roadmap made of clear vertical slices.

It is meant to answer:
- what to build first
- what each slice unlocks
- what each slice depends on
- what "done" means before moving to the next slice

This is not a staffing plan or calendar estimate.
It is a scope-and-sequencing document for implementation planning, Spec Kit feature breakdown, and engineering handoff.

---

## 2. Roadmap Principles

- Prefer vertical slices over layer-only work.
- Each slice should leave the system in a valid, testable state.
- Core invariants from the product spec always apply, even in early slices.
- Contract-first delivery is preferred: API shape, validation, persistence, and tests should move together.
- If a slice introduces durable mutations, it must define revision behavior and operation logging behavior explicitly.

---

## 3. Slice Summary

| Slice | Name | Outcome | Depends on |
|---|---|---|---|
| S0 | Engineering foundation | Repo, runtime, migrations, test harness, API skeleton | None |
| S1 | Board foundation | Boards can be created, listed, loaded, updated, soft-deleted | S0 |
| S2 | Board state hydration | Client can load a stable full board state envelope | S1 |
| S3 | Revision + operations foundation | Durable mutations have revision semantics and operation logging | S1 |
| S4 | Nodes CRUD | User can create, update, and delete board nodes safely | S1, S2, S3 |
| S5 | Edges CRUD | User can connect nodes with validated edges | S4 |
| S6 | Batch node mutations | Atomic multi-node changes are supported | S4, S3 |
| S7 | Assets + image nodes | Uploads work and image nodes can reference uploaded assets | S4 |
| S8 | Chat persistence | Board chat works with durable messages and selection context | S1, S2 |
| S9 | Agent suggest | Agent can analyze board context and return safe action plans | S4, S5, S7, S8 |
| S10 | Agent apply | User can atomically apply validated action plans | S3, S4, S5, S7, S9 |
| S11 | Operations polling | Client can incrementally fetch operations after a revision | S3 |
| S12 | Recovery + polish | Snapshots, restore aids, summaries, undo foundations | S10, S11 |

---

## 4. Recommended Execution Order

### Phase 0 — Setup
- S0 Engineering foundation

### Phase 1 — Board baseline
- S1 Board foundation
- S2 Board state hydration
- S3 Revision + operations foundation

### Phase 2 — Canvas editing
- S4 Nodes CRUD
- S5 Edges CRUD
- S6 Batch node mutations
- S7 Assets + image nodes

### Phase 3 — AI collaboration
- S8 Chat persistence
- S9 Agent suggest
- S10 Agent apply

### Phase 4 — Sync and recovery
- S11 Operations polling
- S12 Recovery + polish

---

## 5. Slice Details

## S0. Engineering foundation

### Goal

Create the implementation baseline required for all later slices.

### Scope

- project structure
- runtime configuration
- database connection and migration system
- test harness
- request validation layer
- error envelope baseline
- OpenAPI-driven contract workflow

### Why first

Without this slice, later roadmap items turn into partial prototypes instead of stable features.

### Done when

- backend app starts locally
- database migrations run successfully
- contract validation and test runner work in CI/local
- OpenAPI file is part of the delivery workflow
- standard error envelope exists

---

## S1. Board foundation

### Goal

Deliver the first usable board lifecycle.

### Scope

- `POST /boards`
- `GET /boards`
- `GET /boards/{boardId}`
- `PATCH /boards/{boardId}`
- `DELETE /boards/{boardId}` as soft delete
- board statuses: `active`, `archived`, `deleted`
- auto-create one chat thread per board

### Key rules

- create returns `201`
- patch uses JSON Merge Patch
- delete is soft delete only in MVP
- deleted boards disappear from normal listing
- deleted boards are treated as not found by normal metadata/state reads
- archived boards are read-only

### Done when

- board lifecycle API works end to end
- auto thread creation is guaranteed
- soft delete semantics are consistent
- archived and deleted behavior matches spec

---

## S2. Board state hydration

### Goal

Give the frontend one stable endpoint for loading the board workspace.

### Scope

- `GET /boards/{boardId}/state`
- consistent response envelope with board, nodes, edges, chat thread, and revision marker
- empty-board behavior for newly created boards
- exclusion of soft-deleted entities from normal state

### Why this is separate

The frontend needs a stable hydration contract early, even before all entity types are fully implemented.

### Done when

- new board returns valid empty state
- existing board returns consistent full-state shape
- deleted entities are excluded
- deleted boards return not found

---

## S3. Revision + operations foundation

### Goal

Implement the durability rules that make later mutations trustworthy.

### Scope

- board revision increment policy
- one revision increment per committed mutation batch
- `board_operations` write path
- operation payload shape and actor metadata
- idempotency baseline for supported POST endpoints

### Why this comes early

Nodes, edges, batch apply, and AI flows all rely on this slice to satisfy core invariants.

### Done when

- durable mutations write operations consistently
- revision bumps exactly once per successful mutation batch
- failed mutations produce no partial revision change
- idempotent replays behave predictably

---

## S4. Nodes CRUD

### Goal

Let the user place and edit visual objects on the board.

### Scope

- `POST /boards/{boardId}/nodes`
- `PATCH /nodes/{nodeId}`
- `DELETE /nodes/{nodeId}`
- supported node types: `sticky`, `text`, `image`, `shape`
- node validation for geometry, content, style, metadata, lock state

### Key rules

- create returns `201`
- patch uses JSON Merge Patch
- locked nodes return `409 LOCKED_NODE`
- node delete is soft delete
- node delete also soft-deletes connected edges in the same transaction

### Done when

- all supported node types validate correctly
- soft-deleted nodes disappear from normal state
- lock behavior is enforced consistently
- node mutations increment revision and write operations

---

## S5. Edges CRUD

### Goal

Allow users to create relationships between board nodes.

### Scope

- `POST /boards/{boardId}/edges`
- `PATCH /edges/{edgeId}`
- `DELETE /edges/{edgeId}`
- edge validation for same-board references, self-loop rejection, deleted-node rejection

### Key rules

- create returns `201`
- patch uses JSON Merge Patch
- cross-board references are rejected
- self-loop edges are rejected in MVP
- edge delete is soft delete

### Done when

- valid edges can be created and updated
- invalid references are rejected consistently
- edges disappear from normal state after delete
- edge mutations increment revision and write operations

---

## S6. Batch node mutations

### Goal

Support atomic multi-node edits from the client.

### Scope

- `POST /boards/{boardId}/nodes/batch`
- ordered execution of create/update/delete batch items
- temp id mapping for created nodes
- rollback on failure

### Key rules

- all-or-nothing transaction
- max 200 operations
- one revision bump for the whole batch

### Done when

- successful batches return created/updated/deleted result sets
- failed batches leave state unchanged
- temp ids resolve deterministically
- operation logging reflects the committed batch

---

## S7. Assets + image nodes

### Goal

Allow uploaded files, especially images, to participate in board state.

### Scope

- `POST /assets/upload`
- `GET /assets/{assetId}`
- `GET /assets/{assetId}/file`
- `GET /assets/{assetId}/thumbnail`
- asset metadata persistence
- image-node compatibility via `content.assetId`

### Key rules

- upload returns `201`
- oversize upload returns `413`
- unsupported mime type returns `415`
- missing asset on image-node create/update returns `422 VALIDATION_ERROR`
- missing thumbnail returns `404 ASSET_THUMBNAIL_NOT_AVAILABLE`

### Done when

- asset upload and metadata retrieval work
- original file streaming works
- thumbnail policy is consistent
- image nodes can reference valid uploaded assets only

---

## S8. Chat persistence

### Goal

Let the user have a durable board-specific conversation with the agent.

### Scope

- `GET /boards/{boardId}/chat`
- `POST /boards/{boardId}/chat/messages`
- persistent append-only messages
- selection context persistence
- thread/message schemas

### Key rules

- one board has one chat thread
- plain chat does not mutate board state
- archived boards allow chat/history reads only
- archived boards reject new chat messages

### Done when

- user messages persist
- agent replies persist
- selection context is stored when provided
- chat can be reloaded per board

---

## S9. Agent suggest

### Goal

Allow the agent to analyze board state and return a safe, reviewable proposal.

### Scope

- `POST /boards/{boardId}/agent/actions` in `suggest` mode
- context building from board, selection, visible/nearby nodes, and assets
- sanitization and truncation rules
- validated action plan shape
- preview payload

### Key rules

- suggest never mutates durable board state
- suggest never increments board revision
- malformed or unsafe action plans are rejected instead of treated as valid
- context sent to model must be sanitized

### Done when

- suggest returns assistant text
- suggest may return a valid action plan
- safe preview data is returned
- invalid model output is repaired or rejected consistently

---

## S10. Agent apply

### Goal

Let the user explicitly commit a previously suggested plan.

### Scope

- `POST /boards/{boardId}/agent/actions/apply`
- re-validation of the submitted action plan
- transactional apply of creates/updates/deletes/layout changes
- created temp id resolution
- agent-attributed operations

### Key rules

- apply is all-or-nothing
- locked targets return `409 LOCKED_NODE`
- invalid plans return `422 ACTION_PLAN_INVALID`
- apply increments revision exactly once
- apply writes durable operations for committed changes

### Done when

- valid plans apply successfully
- invalid plans commit nothing
- created ids resolve predictably
- operation log and revision behavior match the mutation contract

---

## S11. Operations polling

### Goal

Provide the first incremental sync/debugging primitive for the frontend.

### Scope

- `GET /boards/{boardId}/operations?afterRevision=...&limit=...`
- filtering by revision
- pagination/limit policy for MVP

### Key rules

- returns operations strictly after the requested revision
- ordering is stable
- board not found behavior is consistent with other endpoints

### Done when

- frontend can poll for new operations after a known revision
- operations reflect durable committed state only
- response ordering is deterministic

---

## S12. Recovery + polish

### Goal

Add recovery and future-proofing features that are useful but not required for the first usable MVP.

### Scope

- snapshots before large destructive/apply flows
- summary fields and summary refresh policies
- undo foundations
- recovery-oriented restore aids
- sync/reload polish

### Notes

This slice should not block the first usable MVP unless recovery guarantees are promoted to a hard requirement.

### Done when

- snapshot creation policy is implemented where required
- restore aids exist for destructive flows
- roadmap leaves clear extension points for undo/summaries

---

## 6. Spec Kit Mapping

Recommended first feature specs for Spec Kit:

1. `001-board-foundation` -> S1
2. `002-board-state-hydration` -> S2
3. `003-revision-operations-foundation` -> S3
4. `004-node-crud` -> S4
5. `005-edge-crud` -> S5
6. `006-node-batch-mutations` -> S6
7. `007-assets-image-nodes` -> S7
8. `008-chat-persistence` -> S8
9. `009-agent-suggest` -> S9
10. `010-agent-apply` -> S10
11. `011-operations-polling` -> S11
12. `012-recovery-polish` -> S12

If the team wants fewer, larger feature specs, the following merges are still reasonable:

- Merge S1 + S2 for a broader board baseline
- Merge S4 + S5 for one canvas-editing feature
- Merge S9 + S10 only if the team is comfortable implementing suggest and apply together

---

## 7. Notes for Task Generation

When turning slices into implementation tasks:

- keep tasks vertical, not only by backend layer
- include API, validation, persistence, and tests in the same slice
- preserve invariant-driven work early, especially revision and operation logging
- treat agent suggest and agent apply as separate delivery milestones
- do not let recovery/polish block the first usable MVP unless product requirements change

