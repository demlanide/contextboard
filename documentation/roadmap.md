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

| Slice | Name                             | Outcome                                                        | Depends on             |
|-------|----------------------------------|----------------------------------------------------------------|------------------------|
| S0    | Engineering foundation           | Repo, runtime, migrations, test harness, API skeleton          | None                   |
| S1    | Board foundation                 | Boards can be created, listed, loaded, updated, soft-deleted   | S0                     |
| S2    | Board state hydration            | Client can load a stable full board state envelope             | S1                     |
| S3    | Revision + operations foundation | Durable mutations have revision semantics and operation logging| S1                     |
| S3.5  | Frontend foundation              | Web app shell can create/open a board and hydrate a real board screen | S1, S2 |
| S4    | Nodes CRUD                       | User can create, edit, and delete basic nodes in the browser with durable sync | S1, S2, S3, S3.5 |
| S5    | Edges CRUD                       | User can visually connect nodes with validated edges and clear UI feedback | S4 |
| S6    | Batch node mutations             | Multi-node UI actions commit atomically and reconcile from server diffs | S4, S3 |
| S7    | Assets + image nodes             | User can upload images and place image nodes with progress and error states | S4 |
| S8    | Chat persistence                 | Board chat UI loads history and persists board-scoped conversation | S1, S2, S3.5 |
| S9    | Agent suggest                    | User can ask for suggestions and review preview state without mutating the board | S4, S5, S7, S8 |
| S10   | Agent apply                      | User can explicitly apply suggestions and see server-confirmed board updates | S3, S4, S5, S7, S9 |
| S11   | Operations polling               | Client sync can detect later revisions and reconcile stale local state | S3, S3.5 |
| S12   | Recovery + polish                | Recovery and UX polish strengthen confidence without changing MVP architecture | S10, S11 |

---

## 4. Recommended Execution Order

### Phase 0 — Setup
- S0 Engineering foundation

### Phase 1 — Board baseline
- S1 Board foundation
- S2 Board state hydration
- S3 Revision + operations foundation

### Phase 1.5 — Frontend baseline
- S3.5 Frontend foundation

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

## S3.5. Frontend foundation

### Goal

Create the web app baseline required for all later user-visible slices.

### Scope

- frontend app bootstrap and runtime configuration
- frontend routing and board route
- shared API client and environment wiring
- minimal board create/open flow using existing board APIs
- app shell and board screen skeleton
- hydration integration with `GET /boards/{boardId}/state`
- loading, empty, and error states for initial board load
- canvas placeholder and chat placeholder surfaces
- frontend lint/test baseline

### Why this is separate

The backend contracts in `S1-S3` are complete enough to support a real product surface.
Later UI slices will be slower and less coherent if the frontend shell is still being invented while node, edge, and agent behavior are being implemented.

### Done when

- frontend app starts locally
- user can create or open a board in the browser
- board screen performs a real hydrate request
- empty-board state renders as a real UI shell
- basic frontend quality gates exist for later slices

---

## Frontend Delivery Rule From S3.5 Onward

Slices `S0-S3` establish backend and contract foundations.
Slice `S3.5` establishes the frontend app baseline.

Starting with `S4`, every slice should be treated as a full-stack delivery slice:
- backend capability
- frontend interaction or screen behavior
- confirmed-state reconciliation behavior
- loading, success, and failure UX

The product should become more tangible after each slice from `S3.5` onward.

---

## S4. Nodes CRUD

### Goal

Let the user place and edit visual objects on the board in the web app.

### Scope

- `POST /boards/{boardId}/nodes`
- `PATCH /nodes/{nodeId}`
- `DELETE /nodes/{nodeId}`
- supported node types: `sticky`, `text`, `image`, `shape`
- node validation for geometry, content, style, metadata, lock state
- board canvas renders confirmed nodes from hydrated state
- user can add, move, edit, and delete basic nodes in the browser
- pending, saved, and failed node states are visible enough to understand
- frontend reconciles node state from server-confirmed responses

### Frontend surface

- board screen with visible canvas area
- create sticky/text/shape affordances
- inline edit or immediate edit entry after creation
- drag/move interaction for simple node positioning
- delete interaction with rollback-safe UI behavior

### Key rules

- create returns `201`
- patch uses JSON Merge Patch
- locked nodes return `409 LOCKED_NODE`
- node delete is soft delete
- node delete also soft-deletes connected edges in the same transaction
- optimistic UI is allowed only as a temporary convenience, never as final truth
- asset-backed image-node happy path does not need to feel complete until `S7`

### Done when

- all supported node types validate correctly
- soft-deleted nodes disappear from normal state
- lock behavior is enforced consistently
- node mutations increment revision and write operations
- user can create and edit at least basic nodes in the browser without guessing final state
- failed node saves do not leave the user unsure whether the node exists durably

---

## S5. Edges CRUD

### Goal

Allow users to create visible relationships between board nodes in the browser.

### Scope

- `POST /boards/{boardId}/edges`
- `PATCH /edges/{edgeId}`
- `DELETE /edges/{edgeId}`
- edge validation for same-board references, self-loop rejection, deleted-node rejection
- connection-handle or equivalent connect interaction on canvas
- temporary edge preview during connect interaction
- valid-target and invalid-target feedback in the UI
- confirmed edge reconciliation from server responses

### Frontend surface

- start-connection interaction from a node
- preview edge while dragging
- clear save or failure feedback after connect attempt

### Key rules

- create returns `201`
- patch uses JSON Merge Patch
- cross-board references are rejected
- self-loop edges are rejected in MVP
- edge delete is soft delete
- backend validation remains authoritative even if the UI blocks obvious invalid targets early

### Done when

- valid edges can be created and updated
- invalid references are rejected consistently
- edges disappear from normal state after delete
- edge mutations increment revision and write operations
- user can connect nodes visually without ghost edges persisting after failure

---

## S6. Batch node mutations

### Goal

Support atomic multi-node edits from the client and browser UI.

### Scope

- `POST /boards/{boardId}/nodes/batch`
- ordered execution of create/update/delete batch items
- temp id mapping for created nodes
- rollback on failure
- frontend can submit grouped node changes as one atomic unit where useful
- frontend trusts the returned diff instead of inferring final state locally
- pending batch state and rollback behavior are understandable in the UI

### Frontend surface

- multi-select or grouped-edit affordance where implemented
- atomic save feedback for grouped node actions
- rollback-safe reconciliation after failed batch requests

### Key rules

- all-or-nothing transaction
- max 200 operations
- one revision bump for the whole batch
- server diff is the canonical final state for batch results

### Done when

- successful batches return created/updated/deleted result sets
- failed batches leave state unchanged
- temp ids resolve deterministically
- operation logging reflects the committed batch
- grouped UI actions either fully land or visibly roll back without ambiguity

---

## S7. Assets + image nodes

### Goal

Allow uploaded files, especially images, to participate in board state through a usable browser flow.

### Scope

- `POST /assets/upload`
- `GET /assets/{assetId}`
- `GET /assets/{assetId}/file`
- `GET /assets/{assetId}/thumbnail`
- asset metadata persistence
- image-node compatibility via `content.assetId`
- upload flow in the browser
- image placement flow after upload
- progress, success, and failure states for upload and placement
- asset-backed image rendering in the board UI

### Frontend surface

- upload button or drag-and-drop entry point
- upload progress or visible in-flight state
- place-image interaction or predictable default placement
- clear distinction between asset upload success and node placement success

### Key rules

- upload returns `201`
- oversize upload returns `413`
- unsupported mime type returns `415`
- missing asset on image-node create/update returns `422 VALIDATION_ERROR`
- missing thumbnail returns `404 ASSET_THUMBNAIL_NOT_AVAILABLE`
- upload failure and placement failure must be distinguishable to the user

### Done when

- asset upload and metadata retrieval work
- original file streaming works
- thumbnail policy is consistent
- image nodes can reference valid uploaded assets only
- user can upload an image and get it onto the board without ambiguity about what succeeded

---

## S8. Chat persistence

### Goal

Let the user have a durable board-specific conversation with the agent in the board UI.

### Scope

- `GET /boards/{boardId}/chat`
- `POST /boards/{boardId}/chat/messages`
- persistent append-only messages
- selection context persistence
- thread/message schemas
- board chat panel or drawer
- chat history load on board entry
- message input, loading, and failure states
- selection context capture where the product exposes it

### Frontend surface

- visible chat panel, drawer, or equivalent board chat surface
- durable message history rendering
- message composer with request-state feedback

### Key rules

- one board has one chat thread
- plain chat does not mutate board state
- archived boards allow chat/history reads only
- archived boards reject new chat messages
- the user must not think the board changed just because chat returned a response

### Done when

- user messages persist
- agent replies persist
- selection context is stored when provided
- chat can be reloaded per board
- chat works as part of the board screen, not as a detached prototype

---

## S9. Agent suggest

### Goal

Allow the agent to analyze board state and return a safe, reviewable proposal with visible preview UX.

### Scope

- `POST /boards/{boardId}/agent/actions` in `suggest` mode
- context building from board, selection, visible/nearby nodes, and assets
- sanitization and truncation rules
- validated action plan shape
- preview payload
- prompt submission flow in the board UI
- assistant response rendering
- preview UI for proposed changes
- stale or invalid suggestion handling in the interface

### Frontend surface

- prompt entry and submit interaction
- assistant response card or chat rendering
- preview overlay, diff summary, or affected-entity highlighting
- dismiss and retry flows for suggestions

### Key rules

- suggest never mutates durable board state
- suggest never increments board revision
- malformed or unsafe action plans are rejected instead of treated as valid
- context sent to model must be sanitized
- preview state must remain visually distinct from confirmed board state

### Done when

- suggest returns assistant text
- suggest may return a valid action plan
- safe preview data is returned
- invalid model output is repaired or rejected consistently
- user can understand a suggestion without confusing it for a committed board change

---

## S10. Agent apply

### Goal

Let the user explicitly commit a previously suggested plan from the UI and see confirmed results.

### Scope

- `POST /boards/{boardId}/agent/actions/apply`
- re-validation of the submitted action plan
- transactional apply of creates/updates/deletes/layout changes
- created temp id resolution
- agent-attributed operations
- explicit apply interaction in the UI
- apply loading, success, and failure states
- duplicate-apply prevention
- board reconciliation from server-confirmed apply response

### Frontend surface

- apply button in preview or suggestion surface
- disabled duplicate actions while apply is running
- clear success/failure communication
- preview invalidation or stale-state handling after failed apply

### Key rules

- apply is all-or-nothing
- locked targets return `409 LOCKED_NODE`
- invalid plans return `422 ACTION_PLAN_INVALID`
- apply increments revision exactly once
- apply writes durable operations for committed changes
- UI must not treat preview as committed board state before server confirmation

### Done when

- valid plans apply successfully
- invalid plans commit nothing
- created ids resolve predictably
- operation log and revision behavior match the mutation contract
- user sees the board update from server-confirmed results rather than local guesswork

---

## S11. Operations polling

### Goal

Provide the first incremental sync/debugging primitive for the frontend.

### Scope

- `GET /boards/{boardId}/operations?afterRevision=...&limit=...`
- filtering by revision
- pagination/limit policy for MVP
- client sync layer can request operations after a known revision
- stale-state detection and rehydrate fallback behavior
- non-intrusive UI handling for background sync or stale indicators where useful

### Frontend surface

- centralized sync logic for `afterRevision` polling
- stale flag or lightweight sync-status signal if the product exposes it
- safe fallback to full rehydrate when incremental reconciliation is ambiguous

### Key rules

- returns operations strictly after the requested revision
- ordering is stable
- board not found behavior is consistent with other endpoints
- polling should extend the confirmed-state model, not replace it with a conflicting second state system

### Done when

- frontend can poll for new operations after a known revision
- operations reflect durable committed state only
- response ordering is deterministic
- client can detect and recover from stale local state without hidden drift

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
- recovery-oriented UX hooks
- clearer loading, success, and failure copy for long-running or risky flows
- confidence-building polish around stale preview, retry, and restore-oriented states

### Frontend surface

- recovery or restore affordances where implemented
- clearer status language for risky flows such as upload, suggest, and apply
- UX polish that reinforces what is draft, preview, confirmed, failed, or stale

### Notes

This slice should not block the first usable MVP unless recovery guarantees are promoted to a hard requirement.

### Done when

- snapshot creation policy is implemented where required
- restore aids exist for destructive flows
- roadmap leaves clear extension points for undo/summaries
- product confidence improves without changing the core MVP architecture

---

## 6. Spec Kit Mapping

Recommended first feature specs for Spec Kit:

1. `001-board-foundation` -> S1
2. `002-board-state-hydration` -> S2
3. `003-revision-operations-foundation` -> S3
4. `004-frontend-foundation` -> S3.5
5. `005-node-crud` -> S4
6. `006-edge-crud` -> S5
7. `007-node-batch-mutations` -> S6
8. `008-assets-image-nodes` -> S7
9. `009-chat-persistence` -> S8
10. `010-agent-suggest` -> S9
11. `011-agent-apply` -> S10
12. `012-operations-polling` -> S11
13. `013-recovery-polish` -> S12

If the team wants fewer, larger feature specs, the following merges are still reasonable:

- Merge S1 + S2 for a broader board baseline
- Merge S3.5 + S4 only if the team is comfortable building app shell and first canvas editing interaction together
- Merge S4 + S5 for one canvas-editing feature
- Merge S9 + S10 only if the team is comfortable implementing suggest and apply together

---

## 7. Notes for Task Generation

When turning slices into implementation tasks:

- keep tasks vertical, not only by backend layer
- include frontend UI/store/reconciliation work together with API, validation, persistence, and tests in the same slice once the slice is user-visible
- preserve invariant-driven work early, especially revision and operation logging
- treat agent suggest and agent apply as separate delivery milestones
- do not let recovery/polish block the first usable MVP unless product requirements change
