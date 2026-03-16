# Architecture

## Purpose

This document defines the backend architecture for the Context Board MVP.

It focuses on the decisions needed before task planning and implementation:
- backend module layout
- service boundaries
- where validation lives
- where transaction orchestration lives
- where agent orchestration lives
- storage abstraction for assets
- request lifecycle from HTTP request to service to repository to operations log
- how suggest and apply flows move through the system

This architecture assumes the current MVP rules already defined in the product and API docs:
- backend is source of truth
- one board has one chat thread in MVP
- durable mutations are validated on the server
- all durable mutations are logged
- board revision is the sync primitive
- agent suggest is separate from agent apply
- apply is atomic

---

## Architecture goals

The backend should optimize for:
- predictable state transitions
- strict validation of all durable writes
- easy task slicing by vertical capability
- simple deployment for MVP
- clear path to future auth, collaboration, and background processing

The backend should not optimize for:
- microservices in MVP
- realtime collaboration in MVP
- global distributed workflows
- uncontrolled agent autonomy

---

## High-level architecture

The MVP backend should be implemented as a **modular monolith**.

That means:
- one deployable API service
- one PostgreSQL database
- one object/file storage integration for assets
- optional separate worker process for thumbnail generation and other async asset processing
- strong internal module boundaries inside one codebase

This is the best fit for the current product because the system is:
- transaction-heavy
- centered on one relational state model
- dependent on atomic multi-entity writes
- easier to reason about when all mutation rules live in one backend

### Main components

1. **HTTP API**
   - request parsing
   - schema validation
   - authentication hook later
   - routing
   - response mapping

2. **Application services**
   - business use-cases
   - transaction orchestration
   - revision bump policy
   - operations log policy
   - coordination across repos

3. **Repositories**
   - SQL access only
   - row mapping
   - query composition
   - transaction-bound persistence methods

4. **Agent module**
   - context building
   - sanitization
   - LLM calling
   - response validation
   - suggest/apply coordination

5. **Assets module**
   - upload validation
   - object storage integration
   - metadata persistence
   - thumbnail/background processing hooks

6. **Observability module**
   - structured logs
   - tracing
   - metrics
   - request correlation

---

## Recommended repository layout

```text
src/
  main/
    app.ts
    bootstrap.ts

  config/
    env.ts
    flags.ts
    limits.ts

  http/
    router.ts
    middleware/
      request-id.ts
      error-handler.ts
      idempotency.ts
      content-type.ts
    controllers/
      boards.controller.ts
      board-state.controller.ts
      nodes.controller.ts
      edges.controller.ts
      assets.controller.ts
      chat.controller.ts
      agent.controller.ts
      operations.controller.ts

  schemas/
    board.schemas.ts
    node.schemas.ts
    edge.schemas.ts
    asset.schemas.ts
    chat.schemas.ts
    agent.schemas.ts
    common.schemas.ts

  services/
    boards.service.ts
    board-state.service.ts
    nodes.service.ts
    edges.service.ts
    batch.service.ts
    assets.service.ts
    chat.service.ts
    agent.service.ts
    operations.service.ts
    snapshots.service.ts

  domain/
    validation/
      board-rules.ts
      node-rules.ts
      edge-rules.ts
      asset-rules.ts
      action-plan-rules.ts
    patch/
      merge-patch.ts
    revision/
      revision-policy.ts
    operations/
      operation-factory.ts
    ids/
      temp-id-map.ts

  repos/
    boards.repo.ts
    nodes.repo.ts
    edges.repo.ts
    assets.repo.ts
    chat-threads.repo.ts
    chat-messages.repo.ts
    operations.repo.ts
    snapshots.repo.ts
    idempotency.repo.ts

  db/
    pool.ts
    tx.ts
    migrations/

  agent/
    context-builder.ts
    sanitization.ts
    llm-client.ts
    output-validator.ts
    preview-builder.ts

  assets/
    storage/
      storage.interface.ts
      s3-storage.ts
      local-storage.ts
    image/
      mime-sniffer.ts
      image-probe.ts
      thumbnail-jobs.ts

  worker/
    jobs/
      generate-thumbnail.job.ts
      extract-text.job.ts
      caption-asset.job.ts

  obs/
    logger.ts
    metrics.ts
    tracing.ts
```

### Layout rules

- `http/` must stay thin.
- `services/` own use-case orchestration.
- `repos/` are the only layer that talks directly to SQL.
- `agent/` owns all LLM-specific concerns.
- `assets/storage/` hides the storage provider behind one interface.
- `domain/validation/` contains reusable business rules, not HTTP parsing logic.

---

## Service boundaries

### 1. Boards service

Owns:
- board creation
- board update/archive/delete lifecycle rules
- default chat thread creation on board create
- board editability checks

Does not own:
- node CRUD details
- edge CRUD details
- agent context building

### 2. Board state service

Owns:
- full board hydration for `GET /boards/:boardId/state`
- assembling board + nodes + edges + assets + thread summary as needed
- active-only filtering for soft-deleted entities

Does not own:
- mutation logic
- operation writes

### 3. Nodes service

Owns:
- create/update/delete node flows
- node validation beyond schema shape
- soft-delete semantics
- connected edge cascading on node delete

Does not own:
- generic batch transaction orchestration across mixed entity types

### 4. Edges service

Owns:
- create/update/delete edge flows
- endpoint validation
- same-board enforcement
- deleted-node checks

### 5. Batch service

Owns:
- mixed mutation batches
- all-or-nothing orchestration
- ordered execution of batch items
- tempId mapping within one batch
- one revision bump for the whole batch
- operation log emission for the whole batch

This service is important because the project already defines atomic batch semantics and a single revision per committed mutation batch.

### 6. Assets service

Owns:
- asset upload flow
- MIME and size validation
- storage key generation
- asset metadata persistence
- thumbnail/extracted text/caption lifecycle hooks

Does not own:
- image node creation
n
That remains in nodes logic. Image nodes only reference assets.

### 7. Chat service

Owns:
- board thread fetch
- message persistence
- selection context persistence
- chat-only flows that do not mutate board state

### 8. Agent service

Owns:
- suggest flow
- apply flow coordination
- AgentContextSnapshot construction through the context builder
- LLM request execution
- output validation
- preview creation
- apply handoff into transactional mutation flow

Does not own:
- raw SQL
- direct storage writes

### 9. Operations service

Owns:
- append-only operation row construction
- afterRevision reads
- batch-level grouping behavior
- actor type and payload shape normalization

### 10. Snapshots service

Owns:
- optional snapshot creation before large AI apply
- immutable snapshot persistence
- snapshot retrieval for future restore/debug workflows

---

## Layer responsibilities

### HTTP layer

Responsible for:
- route matching
- parsing JSON and multipart requests
- content-type enforcement
- request ID/correlation ID
- idempotency middleware entrypoint
- schema-level validation
- translating service errors into HTTP responses

Not responsible for:
- SQL
- revision bump logic
- business invariants that depend on current DB state
- agent context construction

### Domain validation layer

Responsible for reusable business rules such as:
- node type constraints
- edge same-board checks
- locked-node restrictions
- board editable checks
- action plan allow-list validation
- JSON Merge Patch merge behavior

This layer should be pure where possible.

### Service layer

Responsible for:
- use-case orchestration
- transaction boundaries
- calling repos in the right order
- applying domain validation before commit
- deciding when to bump revision
- deciding when to append operation rows
- deciding when to create snapshots

This is the layer where most product behavior lives.

### Repository layer

Responsible for:
- executing SQL
- loading rows
- inserting/updating/deleting rows
- transaction-scoped persistence helpers
- no business branching beyond data access details

Repositories should not:
- call the LLM
- decide revision policy
- decide whether an operation should be logged

---

## Validation strategy

Validation should happen in three places.

### 1. Request schema validation

At the HTTP boundary:
- required fields present
- JSON shape valid
- enum values structurally valid
- multipart fields parseable
- unsupported content type rejected

Examples:
- missing `type` on create node
- malformed UUID string
- invalid JSON object shape
- file upload body missing file part

### 2. Domain/business validation

Inside services and domain rules:
- board exists and is editable
- locked node cannot be mutated
- edge endpoints exist and belong to same board
- image node references existing asset
- action plan uses allowed action types only
- action count limits are not exceeded

This validation may require repository reads.

### 3. Transaction-time validation

Immediately before write or during write orchestration:
- resources still exist in current transaction view
- no cross-board references remain
- no tempId resolution gaps remain
- board revision and operation write stay consistent

This is especially important for apply and mixed batch flows.

---

## Transaction orchestration

Transaction orchestration lives in the **service layer**, not controllers and not repositories.

### Rules

For every durable mutation:
- validate preconditions
- open one DB transaction
- apply all changes in order
- bump board revision exactly once for the committed logical batch
- append operation rows with the same new revision
- commit or roll back everything

### When to use a transaction

Always for:
- create node
- update node
- delete node
- create edge
- update edge
- delete edge
- mixed mutation batch
- apply agent action plan
- node delete plus connected edge soft-deletes
- snapshot + apply when snapshot is part of the same durable workflow

Usually not required for:
- suggest flow itself
- read-only state hydration
- chat reads

### Concurrency rule

Even in MVP, concurrent writes should be serialized per board.

Recommended policy:
- acquire a per-board lock inside the transaction before applying durable mutations
- then validate and apply the entire batch under that lock

This prevents partial ordering issues and keeps revisions monotonic and predictable.

---

## Agent orchestration

Agent orchestration lives in `agent.service.ts` plus the dedicated `agent/` module.

### Subcomponents

#### Context builder
Builds a strict `AgentContextSnapshot` from:
- board metadata
- selected nodes and edges
- nearby/visible context
- referenced assets
- viewport/selection context
- system summaries if present

#### Sanitization
Redacts or summarizes:
- secrets
- token-like strings
- PII-like values
- unsafe raw payload content where needed

#### LLM client
Responsible for:
- prompt assembly
- model invocation
- timeout and retry policy
- response capture

#### Output validator
Responsible for:
- strict parsing of model output
- action type allow-list enforcement
- shape validation for action plan items
- preview validation

#### Preview builder
Computes non-durable preview metadata such as:
- affected node ids
- affected edge ids
- new temp ids

### Agent contract

The agent can propose edits in suggest mode, but it cannot directly mutate durable state.

All durable state changes must go through:
1. action plan validation
2. transactional apply flow
3. revision bump
4. operations log write

---

## Asset storage abstraction

Assets should use a provider-agnostic abstraction.

### Interface

```ts
interface AssetStorage {
  putObject(input: {
    storageKey: string;
    bytes: Buffer;
    contentType: string;
  }): Promise<void>;

  getObjectStream(storageKey: string): Promise<Readable>;

  deleteObject(storageKey: string): Promise<void>;

  getSignedUrl?(input: {
    storageKey: string;
    expiresInSeconds: number;
  }): Promise<string>;
}
```

### Why this abstraction exists

It decouples:
- API logic from storage vendor
- metadata persistence from blob storage
- local dev from production deployment

### Storage responsibilities

The storage layer owns:
- storing the original file bytes
- optionally storing thumbnail bytes
- returning streams or signed URLs

The database owns:
- asset id
- board linkage
- file metadata
- storage keys
- processing status
- extracted text and captions when available

### Upload policy

The assets service should:
- validate size and allowed MIME types
- sniff actual MIME type when possible
- generate a storage key independent of original filename
- persist metadata after successful storage
- enqueue thumbnail generation if needed

---

## Request lifecycle

This is the standard backend lifecycle for a durable mutation.

### General flow

1. HTTP request enters router
2. middleware adds request ID and performs basic guards
3. controller parses request and validates schema
4. controller calls service use-case
5. service loads required entities through repos
6. service runs business validation
7. service opens transaction
8. service applies writes through repos
9. service bumps revision once
10. service appends operation rows
11. service commits transaction
12. controller maps result to response envelope

### Lifecycle diagram

```text
HTTP Request
  -> middleware
  -> controller
  -> schema validation
  -> service
  -> domain validation
  -> transaction begin
  -> repositories
  -> revision bump
  -> operations log append
  -> commit
  -> response
```

---

## Operations log design in the flow

The operations log is not an afterthought. It is part of the mutation transaction.

### Rules

- every durable mutation writes at least one operation row
- all operations for one committed logical batch share the same board revision
- operations are appended in the same transaction as the state mutation
- failed mutations write no durable operation rows

### Where operation rows are created

- the **service layer** decides which operations should exist
- `operation-factory.ts` builds normalized payloads
- `operations.repo.ts` persists them

### Why this matters

This supports:
- auditability
- polling by revision
- debugging
- future undo foundations
- future replay/recovery flows

---

## Suggest flow through the layers

Suggest must not mutate durable board state.

### Suggest request path

1. `POST /boards/:boardId/agent/actions`
2. controller validates prompt and selection context schema
3. agent service loads board context through read repos/state service
4. context builder constructs `AgentContextSnapshot`
5. sanitization trims and redacts sensitive content
6. LLM client sends prompt + snapshot
7. output validator validates returned JSON
8. preview builder computes preview metadata
9. chat service persists user and agent messages
10. response returns message + actionPlan + preview

### Layer ownership in suggest

- controller: request parsing only
- agent service: orchestration
- repos: read-only state fetches and chat persistence
- no mutation services are invoked
- no board revision bump occurs
- no operations log rows are written for board state changes

### Suggest result

The client receives a previewable plan, but the board remains unchanged.

---

## Apply flow through the layers

Apply is the critical transaction-heavy flow.

### Apply request path

1. `POST /boards/:boardId/agent/actions/apply`
2. controller validates request schema
3. agent service re-validates the action plan
4. service starts DB transaction
5. service acquires per-board write lock
6. service checks board editability
7. optional snapshot is created before apply
8. service validates every action against current DB state
9. service applies actions in order through repos
10. temp IDs are resolved to real IDs where needed
11. board revision is bumped once at the end
12. operation rows are appended for all durable changes
13. transaction commits
14. response returns created/updated/deleted diff and new revision

### Apply ownership by layer

- controller: schema validation and response mapping
- agent service: orchestration and final action validation
- domain rules: action semantics and invariants
- repos: SQL reads and writes
- operations service: normalized operation creation
- snapshots service: optional snapshot creation

### Apply design rule

The agent service may orchestrate the flow, but actual low-level entity writes should go through the same mutation services or internal mutation helpers used by normal user-driven flows.

That prevents a second hidden mutation path from appearing in the codebase.

---

## Internal mutation helpers

To avoid duplicated logic, create internal helpers shared by user edits, batch edits, and agent apply.

Examples:
- `createNodeInTx(...)`
- `updateNodeInTx(...)`
- `softDeleteNodeInTx(...)`
- `createEdgeInTx(...)`
- `updateEdgeInTx(...)`
- `softDeleteEdgeInTx(...)`

These helpers should:
- assume an active transaction
- assume schema validation is already done
- still enforce business invariants
- return normalized entities or diffs

This allows:
- nodes service to use them
- batch service to use them
- agent apply to use them

---

## Board revision policy

Board revision is the sync primitive.

### Rules

- revision is monotonic
- revision increments exactly once per successful logical mutation batch
- suggest does not increment revision
- chat-only persistence does not increment board revision unless future product rules change
- apply increments revision once even if many entities change

### Why revision bump happens at the end

The service should finish validation and write preparation first, then bump revision once for the committed batch, then write operation rows with that revision, then commit.

This keeps the revision aligned with the actual committed logical mutation.

---

## Error handling architecture

Controllers should not manually construct many custom error responses.

Use a shared error model:
- domain errors
- validation errors
- not-found errors
- conflict errors
- internal errors

### Example mapping

- schema/body invalid -> 400 or 422 depending on contract
- missing resource -> 404
- locked/editability conflict -> 409 or chosen conflict-style code
- unsupported content type -> 415
- too-large upload -> 413
- internal unexpected failure -> 500

A global error handler should convert typed application errors into the standard API envelope.

---

## Observability placement

Observability should be built into the backend architecture, not added later.

### Request-level

At middleware and controller boundaries:
- request ID
- route
- status code
- latency

### Service-level

At use-case boundaries:
- board ID
- batch ID
- revision
- actor type
- mutation counts

### Agent-level

At agent service boundaries:
- model call latency
- retry count
- context size
- action plan size
- sanitization summary
- invalid output events

### Asset-level

At upload and processing boundaries:
- file size
- MIME type
- processing status
- thumbnail generation failures

---

## Security and safety boundaries

### Input safety

- validate all JSON input shapes
- validate upload size and MIME type
- never trust original filenames
- sanitize agent context before sending to model

### Agent safety

- strict allow-list of action types
- apply requires explicit endpoint and explicit user action
- re-validate action plan at apply time
- locked nodes cannot be mutated by apply

### Secrets safety

- do not log secrets or raw tokens
- keep storage and model credentials outside code
- keep redaction summaries rather than raw secret values

---

## Async processing boundary

The MVP can start with synchronous upload + metadata persistence and optional async thumbnail generation.

### Worker responsibilities

A worker process may own:
- thumbnail generation
- OCR/extracted text
- AI asset captions
- future summarization jobs

### API service responsibilities

The API service should still own:
- upload acceptance
- metadata persistence
- processing status updates kickoff
- download endpoints

This keeps the async boundary narrow and easy to add later.

---

## Recommended implementation rules

1. Keep controllers thin.
2. Keep repos dumb.
3. Put transaction orchestration in services.
4. Put LLM concerns in the agent module only.
5. Reuse the same in-transaction mutation helpers for user edits, batch edits, and agent apply.
6. Treat operations logging as part of the transaction, not a side effect.
7. Hide asset storage behind an interface.
8. Keep suggest side-effect free for board state.
9. Make apply the only durable agent write path.
10. Design for future auth, but do not let auth complexity distort MVP structure.

---

## Suggested first engineering slices from this architecture

1. backend bootstrap + DB + base error model
2. boards service + auto chat thread creation
3. board state hydration service
4. nodes mutation helpers + node service
5. edges mutation helpers + edge service
6. revision + operations service
7. batch service
8. assets service + storage abstraction
9. chat service
10. agent suggest flow
11. agent apply flow
12. snapshot and worker polish

---

## Final summary

The backend architecture should be built around one central principle:

**all durable board changes go through a validated, transactional service flow that updates state, increments revision once, and appends operations atomically.**

Everything else follows from that:
- controllers stay thin
- repos stay focused on SQL
- services own orchestration
- agent suggest stays read-only
- agent apply reuses the same safe mutation path as normal edits
- assets are stored through an abstraction, while metadata remains relational

If this structure is preserved, the codebase will stay simple enough for MVP and still be strong enough to grow into auth, collaboration, richer agent behavior, and recovery tooling later.

