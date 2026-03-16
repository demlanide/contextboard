# Frontend State Sync

## Purpose

This document defines how the frontend should manage board state and stay synchronized with the backend.

It focuses on the frontend behavior needed for implementation planning:
- how local board state is stored
- when optimistic updates are allowed
- when the client should trust server diffs instead of local assumptions
- how board revision is tracked and updated
- how initial board hydrate works
- how suggest and apply should behave in the UI
- how operations polling can be added later without changing the core state model

This document assumes the backend rules already defined elsewhere:
- backend is the source of truth
- board revision is the sync primitive
- durable mutations are validated on the server
- operations are append-only
- suggest is non-durable
- apply is atomic

---

## Core sync principles

The frontend should follow these rules.

### 1. Backend is the source of truth

The client may keep a rich local editing state, but durable board state is authoritative only after the backend accepts a mutation.

### 2. Revision is the sync primitive

The board revision is the main indicator of durable state progress.

The frontend should treat revision as:
- the canonical version number of the board state
- the checkpoint for incremental sync later
- the boundary between confirmed and stale local assumptions

### 3. Suggest is preview, not state

Agent suggest results can influence the UI, but they do not change durable board state.

The frontend must keep suggested actions separate from committed board state.

### 4. Apply is a server-confirmed state transition

The frontend should never try to simulate final durable apply results as the source of truth.

It may preview them, but after apply succeeds the frontend must trust the server response.

### 5. One state model should support both MVP and later polling

Even if MVP starts with request/response sync only, the client state model should already be compatible with later `afterRevision` polling.

---

## State model overview

The frontend should separate state into distinct layers.

```text
UI State
  - selection
  - viewport
  - dragging/resizing state
  - open panels/modals
  - pending prompt text
  - hovered items

Local Ephemeral Editing State
  - draft node position during drag
  - in-progress text edits before commit
  - pending optimistic mutation markers

Confirmed Board State
  - board
  - nodes
  - edges
  - assets metadata
  - board revision
  - last synced timestamp

Agent State
  - current prompt draft
  - latest suggested action plan
  - preview overlays
  - apply-in-progress state
  - suggest/apply errors

Sync State
  - hydrate status
  - mutation queue status
  - last acknowledged revision
  - pending request IDs / idempotency keys
  - stale/conflict flags
```

These layers should not be mixed together.

---

## Recommended client store shape

A normalized store is recommended.

```ts
interface BoardStore {
  boardId: string;

  board: {
    id: string;
    title: string;
    status: string;
    revision: number;
    updatedAt: string;
  } | null;

  nodesById: Record<string, BoardNode>;
  edgesById: Record<string, BoardEdge>;
  assetsById: Record<string, BoardAsset>;

  nodeOrder: string[];
  edgeOrder: string[];

  ui: {
    selectedNodeIds: string[];
    selectedEdgeIds: string[];
    viewport: Viewport | null;
    activePanel: string | null;
    dragging: DragState | null;
    editingNodeId: string | null;
  };

  sync: {
    hydrateStatus: 'idle' | 'loading' | 'ready' | 'error';
    lastSyncedRevision: number | null;
    inFlightMutations: MutationEnvelope[];
    applyStatus: 'idle' | 'running' | 'error';
    suggestStatus: 'idle' | 'running' | 'error';
    stale: boolean;
    lastError: string | null;
  };

  agent: {
    promptDraft: string;
    latestSuggestion: AgentSuggestion | null;
    preview: SuggestPreview | null;
    previewVisible: boolean;
  };
}
```

### Why normalized state is preferred

Because the board contains multiple linked entity types, normalized state makes it easier to:
- apply diffs from the server
- replace only changed nodes or edges
- remove deleted entities cleanly
- render previews without rebuilding the whole board model
- support later incremental operations sync

---

## Confirmed state vs ephemeral state

The client should explicitly distinguish between:

### Confirmed state
State known to be accepted by the backend.

Examples:
- node position returned from server
- edge returned from a successful create response
- board revision from last successful write or hydrate

### Ephemeral state
Local-only state that exists before backend confirmation.

Examples:
- node being dragged before pointer release
- inline text currently being typed
- selected suggestion preview overlay
- apply button loading state

### Rule

Ephemeral state should be easy to discard and reconstruct from confirmed state.

That prevents UI drift when the backend rejects or reshapes a mutation.

---

## Initial hydrate

Initial hydrate is how the frontend gets a complete board snapshot.

### Hydrate source

Use `GET /boards/:boardId/state` as the canonical initial load.

### Hydrate flow

1. route enters board screen
2. store sets `hydrateStatus = loading`
3. client requests board state
4. response is normalized into `board`, `nodesById`, `edgesById`, `assetsById`
5. `board.revision` becomes both current revision and last synced revision
6. `hydrateStatus = ready`
7. any empty-state or rendering logic uses confirmed state only

### Hydrate rules

- initial hydrate should replace confirmed board state entirely
- ephemeral UI state may be preserved only when it still makes sense
- old in-flight mutation assumptions must be cleared if the route was remounted fresh

### On hydrate failure

- keep previous confirmed state only if this is a background refresh
- show full-page error state if this is first load and no confirmed state exists

---

## Local board state management

The frontend should store board entities in normalized confirmed state and derive view models from selectors.

### Recommended selectors

- selected nodes
- visible nodes in viewport
- edges for selected nodes
- assets for image nodes
- board can edit?
- preview affected entities

### Do not store duplicated denormalized copies

Avoid keeping:
- a full `nodes[]` array plus `nodesById`
- edge references nested permanently inside node objects
- revision duplicated in many sub-stores

The more duplicated copies exist, the more likely sync bugs become.

---

## Mutation strategy

The frontend should support three mutation modes.

### 1. Pure local UI mutations

Examples:
- selection changes
- pan/zoom
- opening modals
- preview toggle

These never go to the backend.

### 2. Ephemeral editing mutations

Examples:
- drag in progress
- text typing in a draft field
- resize handle movement before commit

These remain local until commit time.

### 3. Durable backend mutations

Examples:
- create node
- patch node
- delete node
- create edge
- batch mutation
- apply action plan

These must be acknowledged by the backend before they are considered confirmed.

---

## Optimistic update policy

Optimistic updates should be used selectively, not universally.

### Safe for optimistic UI

Optimistic UI is reasonable when:
- the mutation is simple and highly predictable
- the response shape is expected to mirror the request closely
- rollback cost is low
- the backend is unlikely to transform the payload in a surprising way

Examples:
- move node position
- edit sticky text
- create simple sticky node with temp ID
- delete node from visible canvas if rollback is manageable

### Not safe as final truth

Do not rely on optimistic assumptions as the final durable result for:
- agent apply
- mixed batch edits with many dependent actions
- mutations that can cascade
- actions that create multiple entities
- anything with temp ID remapping across several objects
- anything the backend may reject because of current DB state

### Recommended rule

Use optimistic updates for responsiveness, but reconcile against the server response immediately.

The optimistic state is only a temporary UI convenience.

---

## When to fully trust the response diff

The frontend should fully trust the server diff when the server is better positioned to define the resulting durable state.

This applies to:
- any apply response
- any batch response
- any mutation with server-generated IDs
- node delete that cascades edge deletion
- actions with normalization or sanitization on the server
- future multi-user conflict cases

### Rule

When a response includes created/updated/deleted entities or a canonical board fragment, the client should apply that diff directly instead of trying to infer the final state.

### Why

Because the backend knows:
- actual committed IDs
- actual cascades
- final validated shape
- final revision

---

## Response reconciliation strategy

After every successful durable mutation, the client should:

1. read the server response
2. apply returned created/updated/deleted entities into confirmed state
3. set `board.revision` from response
4. set `lastSyncedRevision = board.revision`
5. clear matching in-flight mutation entries
6. remove stale optimistic markers

### If the response is minimal

If an endpoint only returns the changed entity and revision, patch only that entity.

### If the response is broad

If an endpoint returns a batch diff, trust the whole diff.

### If the response is ambiguous

Fallback to rehydrating `GET /boards/:boardId/state`.

---

## Revision handling

Revision handling should be explicit and centralized.

### Rules

- revision is updated only from server responses
- revision is never guessed locally
- revision changes only after successful durable writes or full hydrate
- suggest does not change revision
- chat-only traffic does not change board revision unless backend rules change later

### Recommended state fields

- `board.revision`: current confirmed revision
- `sync.lastSyncedRevision`: last known fully reconciled revision

In MVP these may often be equal.

### On write success

Set both to the returned revision.

### On hydration success

Set both to the hydrated revision.

### On failure

Do not advance revision.

---

## Handling stale state

A stale state means the UI may no longer reflect the latest durable board state.

### Causes

- a mutation failed after optimistic rendering
- later polling detects missed revisions
- a background refresh returns a newer revision than expected
- future multi-user edits modify the board elsewhere

### Response

The client should:
- mark `sync.stale = true`
- prefer refresh/reconcile over deeper optimistic assumptions
- clear obsolete previews if they are based on old topology

### Recovery path

For MVP, the simplest recovery is:
1. keep UI responsive
2. show subtle sync warning if needed
3. rehydrate board state
4. replace confirmed state with server state
5. clear stale flag

---

## Create flows and temp IDs

The UI may use temporary client IDs before server confirmation.

### Temp ID usage

Useful for:
- node create UX
- drawing an edge to a newly created node in one local interaction
- previewing multi-step agent plans

### Rules

- temp IDs live only in ephemeral or pending mutation state
- confirmed store should switch to server IDs as soon as the response arrives
- all local references must be remapped consistently

### Recommended approach

Each optimistic create mutation should store:
- `clientRequestId`
- `tempId`
- intended payload

When the response arrives:
- replace temp entity with confirmed entity
- update dependent local references
- remove temp markers

---

## Delete flows

Deletes should usually be rendered optimistically only when rollback is manageable.

### Recommended UI behavior

- remove deleted item visually right away if the UX benefits from it
- mark it as pending deletion in local sync metadata
- if server confirms, finalize removal
- if server rejects, restore from pre-mutation snapshot or local rollback data

### Cascade case

When deleting a node causes edges to disappear, trust the server response diff for the final set of removed entities.

---

## Patch flows

Patch requests should be treated as durable updates to confirmed entities.

### Example flow for node position patch

1. user drags node locally
2. local UI updates immediately during drag
3. on drag end, client sends patch
4. optimistic marker is added
5. on success, server response is reconciled and revision is updated
6. on failure, node snaps back to last confirmed position

### Example flow for text edit

1. user edits local draft text
2. on blur/save, client sends patch
3. optionally keep edited text visible optimistically
4. on success, reconcile from server
5. on failure, restore last confirmed value and show error

---

## Suggest UI flow

Suggest must behave like a preview workflow, not a committed write workflow.

### Suggest state should include

- prompt draft
- loading state
- last suggestion result
- preview overlay
- validation or model error

### Suggest flow

1. user enters prompt
2. client sends suggest request with prompt and context
3. `suggestStatus = running`
4. on success, store:
   - assistant message
   - suggested action plan
   - preview metadata
5. show preview overlay on top of current confirmed board state
6. do not modify confirmed board entities
7. `suggestStatus = idle`

### Preview rendering

Preview should be derived from:
- current confirmed board state
- suggested actions
- preview metadata

Preview should not overwrite confirmed entities in store.

### Suggest errors

If suggest fails:
- keep confirmed board state unchanged
- preserve prompt draft if useful
- show retryable error state

---

## Apply UI flow

Apply is a durable mutation workflow and should be treated carefully.

### Apply state should include

- selected suggestion being applied
- apply loading state
- apply error state
- optional snapshot/refetch fallback status

### Apply flow

1. user reviews suggestion preview
2. user clicks Apply
3. `applyStatus = running`
4. disable duplicate apply actions
5. send apply request using explicit action plan
6. wait for server response
7. on success:
   - reconcile returned diff into confirmed board state
   - update revision
   - clear preview
   - clear latest suggestion or mark it applied
8. on failure:
   - keep confirmed state unchanged
   - keep preview available if still relevant
   - show actionable error
9. `applyStatus = idle` or `error`

### Important rule

The client should not try to commit the preview into confirmed store before the server confirms apply.

That would blur the line between preview and truth.

---

## Suggest/apply separation in the store

The store should keep suggested changes separate from confirmed board state.

### Recommended model

- `confirmed board state` = what the server has accepted
- `preview state` = what the current suggestion would do

### Do not do this

Do not write preview nodes or edges directly into `nodesById` and `edgesById` as if they were confirmed.

### Better approach

Keep preview in one of these forms:
- action plan + preview metadata
- derived virtual overlay entities
- a transient rendered layer in canvas components

---

## Background refresh strategy

Even in MVP, the frontend should support safe refresh behavior.

### When to refresh

- after ambiguous mutation responses
- after recovering from stale state
- when reopening a board
- after future reconnect or tab refocus policies

### Refresh rule

A refresh should replace confirmed state from the backend, then preserve only compatible UI state such as selection and viewport if the selected entities still exist.

---

## Polling operations later

The state model should already support later incremental sync using operations.

### Future polling direction

Later, the frontend may poll:
- `GET /boards/:boardId/operations?afterRevision=<lastSyncedRevision>`

### Future polling flow

1. client stores `lastSyncedRevision`
2. polling request asks for operations after that revision
3. response returns ordered operations
4. client applies operations or server-provided deltas in sequence
5. client advances `lastSyncedRevision`

### Important compatibility rule

Even when polling is added later, the main confirmed store shape should stay the same.

Polling should just become another way to feed durable diffs into the same reconciliation logic.

### If polling detects a gap

If operations are missing, inconsistent, or too far behind:
- mark stale
- perform full rehydrate
- resume from new revision

---

## In-flight mutation tracking

The frontend should track in-flight mutations explicitly.

### Each mutation record should include

- local request ID
- endpoint/action type
- target entity IDs or temp IDs
- optimistic changes applied
- startedAt timestamp
- rollback payload or pre-mutation snapshot if needed

### Why this matters

This helps with:
- rollback
- duplicate button press prevention
- pending UI badges
- error recovery
- future idempotency support

---

## Error handling and rollback

Rollback should be straightforward because confirmed state and ephemeral state are separate.

### On mutation failure

- remove pending marker
- restore from rollback payload or last confirmed entity snapshot
- do not change revision
- surface error without corrupting confirmed state

### On apply failure

- keep confirmed board state unchanged
- preserve suggestion preview if it still makes sense
- allow retry or dismiss

### On refresh failure

- keep last confirmed state if one exists
- mark sync as degraded
- avoid wiping the canvas unnecessarily

---

## Recommended rendering strategy

Canvas rendering should derive from:
- confirmed entities
- plus optional transient preview overlay
- plus local transient interaction state

This gives a clean layering model:

```text
Confirmed board layer
+ Preview overlay layer
+ Interaction layer
= final rendered canvas
```

This is much safer than mutating confirmed entities for every temporary interaction.

---

## Practical rules by feature

### Board open
- always hydrate from server
- initialize revision from hydrate response

### Node drag
- local movement during drag
- durable patch only on commit
- reconcile on response

### Sticky text edit
- local draft while editing
- durable patch on save/blur
- rollback on failure

### Create node
- temp entity optional
- trust returned server entity and revision

### Delete node
- optional optimistic hide
- trust server diff for cascades

### Suggest
- store preview separately
- no revision change
- no confirmed entity mutation

### Apply
- no optimistic commit into confirmed state
- trust server diff
- update revision from response

### Refresh
- server replaces confirmed state
- preserve compatible UI state only

---

## Recommended implementation rules

1. Keep confirmed board state normalized.
2. Keep preview state separate from confirmed state.
3. Treat revision as server-owned.
4. Use optimistic UI only for responsiveness, never as final truth.
5. Trust server diffs for apply, batch, cascades, and remapped IDs.
6. Rehydrate when reconciliation is uncertain.
7. Track in-flight mutations explicitly.
8. Design reconciliation once and reuse it for writes, refreshes, and later operations polling.

---

## Final summary

The frontend sync model should be built around one central rule:

**confirmed board state comes from the backend, while local UI state, previews, and optimistic edits remain separate and disposable.**

That structure makes the product easier to reason about now and prepares it for future incremental sync later:
- initial hydrate loads canonical state
- durable writes reconcile against server responses
- revision tracks confirmed progress
- suggest stays preview-only
- apply becomes a server-confirmed transition
- operations polling later can feed the same reconciliation pipeline without changing the core client store design

