# Validation Rules

## Purpose

This document defines the backend validation rules for the Context Board MVP.

Its goal is to consolidate validation behavior that is currently spread across product spec, API docs, agent rules, examples, and test planning.

It answers:
- what is validated at the request boundary
- what is validated as domain/business logic
- what is re-validated inside a transaction
- what is validated for assets and uploads
- what is validated for agent action plans
- how validation failures should be classified and returned

This document is intended to be the implementation-facing source of truth for validation behavior.

---

## Validation principles

### 1. Backend validation is authoritative

The frontend may pre-validate for UX, but backend validation is the source of truth for all durable writes.

### 2. Validation happens in layers

Validation is not one step. It happens at:
- request/schema boundary
- domain/business logic layer
- transaction-time consistency checks
- agent output validation layer

### 3. Durable writes must be validated against current state

Any mutation that changes persistent board state must be validated against the current database state, not only against request shape.

### 4. Suggest and apply have different validation requirements

- suggest validates prompt/context input and model output shape
- apply validates the action plan again against current server state before mutating anything

### 5. Failed validation must not produce partial durable state

If validation fails at any point during a durable mutation flow, the transaction must roll back and no durable state change may remain.

---

## Validation layers

## 1. Request validation

Request validation happens at the HTTP boundary before service logic runs.

### Responsibilities

- content-type validation
- body presence
- body schema validation
- path/query parameter validation
- required field validation
- enum value validation
- type validation
- multipart form validation

### Examples

- malformed JSON body
- missing required field like `type`
- invalid UUID path parameter
- unsupported enum value
- request body not matching expected patch object shape
- upload request missing file field

### Request validation does not check

- whether referenced entities exist
- whether board is editable
- whether nodes belong to the same board
- whether a locked node can be changed
- whether an asset belongs to the same board

Those are domain-level checks.

---

## 2. Domain/business validation

Domain validation happens after parsing and before commit.

### Responsibilities

- resource existence rules
- same-board rules
- editability rules
- soft-delete/archive restrictions
- node and edge semantic constraints
- asset usage constraints
- action plan semantics

### Examples

- board must exist
- board must be editable for mutation endpoints
- edge endpoints must exist
- edge endpoints must belong to the same board
- image node must reference an allowed asset
- locked node cannot be mutated
- archived/deleted entities cannot be mutated

---

## 3. Transaction-time validation

Transaction-time validation happens inside the write transaction immediately before or during write orchestration.

### Responsibilities

- re-checking assumptions that depend on current DB state
- validating temp ID resolution
- validating batch ordering effects
- validating current-state applicability of apply actions
- ensuring revision/logging consistency

### Examples

- entity still exists at write time
- board still editable at write time
- node not locked by latest state
- temp IDs all resolve before dependent edge creation
- action plan still valid against current board topology

---

## Error classification

Use a small, predictable error model.

### Request/schema errors

Use for:
- malformed body
- invalid type
- missing required field
- invalid query/path parameter
- invalid content type

Recommended response classes:
- `400 Bad Request` for malformed or unparseable input
- `415 Unsupported Media Type` for unsupported content type
- `413 Payload Too Large` for oversized uploads
- `422 Unprocessable Entity` only if the contract intentionally distinguishes syntactically valid but schema-invalid payloads

### Not found errors

Use `404 Not Found` when a required resource does not exist or is not retrievable under the route semantics.

### Conflict/state errors

Use `409 Conflict` for state-based violations such as:
- board not editable
- locked node mutation
- stale state conflict if introduced later
- invalid mutation because current durable state prevents it

### Semantic validation errors

Use `422 Unprocessable Entity` for semantically invalid payloads when the resource exists but the submitted mutation is not allowed by domain rules.

Examples:
- invalid edge topology
- invalid action plan shape after parsing
- image node references asset with unsupported usage type

### Internal errors

Use `500 Internal Server Error` for unexpected failures.

---

## Content-type rules

### JSON endpoints

Expected content type:
- `application/json`

Reject unsupported content types with `415`.

### Patch endpoints

If the contract uses JSON Merge Patch, standardize on one accepted content type.

Recommended policy:
- accept `application/merge-patch+json`
- optionally also accept `application/json` in MVP only if explicitly documented

This choice must be consistent across implementation, tests, and OpenAPI.

### Multipart upload endpoints

Expected content type:
- `multipart/form-data`

Reject non-multipart upload attempts with `415`.

---

## ID and reference validation

## UUID/path ID rules

### Validate format at request boundary

For any path or request field that expects an ID:
- validate type and format first
- reject malformed values before any DB lookup

### Validate existence at domain layer

After format passes:
- load entity
- return `404` if required entity does not exist

---

## Board validation rules

## Board create

### Request validation

Validate:
- title type if provided
- status value if settable on create
- any optional metadata shape

### Domain validation

Validate:
- title length limits
- initial status allowed by product rules

### Side-effect rule

If board creation also creates default chat thread, both should succeed or fail together.

---

## Board read

### Validate

- board ID format
- board existence

### Return behavior

- `404` if board not found
- if board exists but is archived, follow the route semantics defined by product/API docs

---

## Board update

### Validate request

- patch object shape
- allowed patch fields only
- field types valid

### Validate domain

- board exists
- board is editable if endpoint requires editability
- disallowed fields not patched
- title/status values satisfy product limits

### Invalid cases

- patching unsupported field
- patching deleted board
- patching board in non-editable state

---

## Board delete/archive

### Validate domain

- board exists
- board can transition to requested status
- repeated delete/archive semantics are defined and consistent

### Recommended rule

Prefer idempotent soft-delete/archive behavior when possible, but document it explicitly in API behavior.

---

## Node validation rules

## Node create

### Request validation

Validate:
- body shape
- `type` present and allowed
- position fields valid if required
- content object valid for the node type
- asset reference field valid if present

### Domain validation

Validate:
- target board exists
- board is editable
- node type allowed
- required fields for that node type are present semantically
- image node asset reference exists if required
- referenced asset belongs to the same board if cross-board asset use is forbidden

### Node-type rules

#### Sticky/text node
Validate:
- text/content shape valid
- text length within allowed limits

#### Image node
Validate:
- referenced asset exists
- referenced asset is active/usable
- asset belongs to same board if required
- asset MIME type is an allowed image type

#### Shape/system node
Validate according to supported MVP types only.

### Reject

- unknown node type
- missing required node content
- invalid asset reference
- create on non-editable board

---

## Node patch/update

### Request validation

Validate:
- patch object shape
- only allowed node fields appear
- field types are valid

### Domain validation

Validate:
- board exists
- node exists
- node belongs to board in route
- node is not deleted
- board is editable
- node is not locked if mutation touches protected fields or all fields
- patched values remain valid for node type

### Examples

Reject:
- patching node on another board route
- patching deleted node
- changing image node to reference missing asset
- modifying locked node

---

## Node delete

### Domain validation

Validate:
- board exists
- node exists
- node belongs to board
- node is not already deleted if non-idempotent semantics are used
- board is editable
- node is not locked if delete is prohibited on locked nodes

### Cascade rule

If deleting a node cascades to connected edge soft-deletes:
- validate node delete first
- then perform cascade inside the same transaction
- response should reflect actual deleted entities

---

## Edge validation rules

## Edge create

### Request validation

Validate:
- body shape
- `fromNodeId` and `toNodeId` present
- IDs format valid
- optional label/style fields valid

### Domain validation

Validate:
- board exists
- board editable
- `fromNodeId` exists
- `toNodeId` exists
- both nodes belong to the same board in route
- both nodes are active
- both nodes are connectable according to product rules
- self-loop policy is explicit
- duplicate-edge policy is explicit

### Reject

- missing endpoint node
- endpoints on different boards
- endpoint node soft-deleted
- invalid self-loop if disallowed

---

## Edge patch/update

### Request validation

Validate:
- allowed patch fields only
- valid field types

### Domain validation

Validate:
- board exists
- edge exists
- edge belongs to board
- edge is active
- board editable
- any patched endpoints still satisfy same-board and active-node rules

---

## Edge delete

### Domain validation

Validate:
- board exists
- edge exists
- edge belongs to board
- edge is active if non-idempotent delete semantics are used
- board editable

---

## Mixed batch validation rules

Batch endpoints are high-risk because one request can affect multiple entities.

## Request validation

Validate:
- batch body shape
- actions array present
- array length within allowed limits
- each action has supported `type`
- each action payload matches expected schema for that action type

## Domain validation

Validate:
- board exists
- board editable
- all referenced IDs have valid format
- all referenced durable entities exist if required
- all action types are allowed in batch mode
- action order is valid

## Transaction-time validation

Validate:
- temp IDs resolve correctly
- dependent actions reference prior creates correctly
- later actions do not rely on entities invalidated by earlier actions
- batch remains valid against current DB state at commit time

## Batch rule

If any action in the batch fails validation, the entire batch must fail and no durable mutation may commit.

---

## Asset validation rules

## Upload validation

### Request validation

Validate:
- multipart request present
- file field present
- supported form fields valid

### File validation

Validate:
- file size within configured limit
- MIME type allowed
- actual file signature acceptable when sniffing is available
- filename length reasonable if stored as metadata

### Domain validation

Validate:
- board exists
- board editable if uploads are restricted to editable boards

### Reject

- no file part
- unsupported media type
- payload too large
- corrupted/unreadable file if required metadata extraction fails critically

---

## Asset metadata validation

Validate:
- storage key generated by backend only
- MIME type stored in normalized form
- width/height values valid if captured
- processing status transitions valid

---

## Asset retrieval validation

Validate:
- asset ID format
- asset exists
- asset belongs to board if route is board-scoped
- asset is not deleted/inaccessible

### Missing blob policy

This must be defined explicitly.

Recommended policy:
- if asset metadata exists but underlying blob is missing, treat as server/storage integrity error and return `500` or a dedicated recoverable asset error, not `404` for the metadata resource itself

Document one consistent rule and align tests accordingly.

---

## Chat validation rules

## Message create

### Request validation

Validate:
- body shape
- message text present if required
- selection/context object shape valid if provided

### Domain validation

Validate:
- board exists
- chat thread exists or can be auto-created only under allowed workflow
- referenced selection entities belong to board if included

### Suggest note

Prompt text validation belongs here too before the agent flow starts.

---

## Agent suggest validation rules

Suggest is non-durable for board state, but still needs strict validation.

## Request validation

Validate:
- prompt present and string type valid
- optional context fields valid
- selected node/edge IDs arrays well-formed
- limits on prompt size and selection size

## Domain validation

Validate:
- board exists
- referenced selected entities exist if required
- selected entities belong to board
- inaccessible/deleted entities are excluded or rejected according to policy

## Agent output validation

Validate model output for:
- valid JSON/object shape
- supported action types only
- per-action payload shape
- no forbidden fields
- action count within configured limit
- preview metadata shape if returned

### Suggest rule

Even if suggest output is invalid, board state must remain unchanged.

### On invalid agent output

Recommended behavior:
- store chat failure safely if needed
- return controlled agent error
- do not pass invalid plan to frontend as if it were applicable

---

## Agent apply validation rules

Apply is the strictest validation path.

## Request validation

Validate:
- action plan body shape
- action list present
- action count within limit
- each action schema valid

## Domain validation before transaction

Validate:
- board exists
- board editable
- action types allowed
- referenced IDs structurally valid

## Transaction-time apply validation

Inside the transaction, validate again:
- board still editable
- all referenced durable entities still exist
- locked nodes are not mutated
- cross-board references are not introduced
- asset references remain valid
- temp IDs are resolved before dependent actions use them
- action order is still semantically valid against current durable state

## Apply atomicity rule

If any action fails validation or execution:
- roll back the full transaction
- do not bump revision
- do not append durable operations for partial work

---

## Action plan validation rules

Action plans are validated independently from transport parsing.

## Allowed action types

Only allow action types explicitly supported by the MVP.

Examples might include:
- createNode
- updateNode
- deleteNode
- createEdge
- updateEdge
- deleteEdge

Do not allow:
- arbitrary SQL-like operations
- unknown future action types by default
- direct board revision manipulation
- direct operations log manipulation

## Per-action validation

Each action must validate:
- action type
- required payload fields
- only allowed fields present
- referenced IDs or temp IDs format valid
- node or edge subtype fields valid

## Global action plan validation

Validate:
- maximum actions per plan
- no duplicate temp IDs
- no illegal dependency chain
- no references to undefined temp IDs
- no contradictory action sequence if disallowed

### Example contradictions

- delete node before creating edge that references it
- update entity after deleting it in same plan
- create duplicate temp IDs

---

## Locking and editability validation

## Board editability

A board in a non-editable state must reject durable mutations.

Durable mutations include:
- create/update/delete node
- create/update/delete edge
- asset upload if uploads are considered board mutations
- batch mutation
- apply action plan

Read flows may still be allowed.

## Locked node rule

A locked node cannot be mutated by:
- manual patch
- manual delete
- batch mutation
- agent apply

If some fields remain patchable even for locked nodes, list them explicitly. Otherwise treat lock as full mutation prohibition.

---

## Soft-delete and archived entity validation

## General rule

Soft-deleted entities are not valid mutation targets.

### Reads

- include or exclude soft-deleted entities according to endpoint semantics
- default board-state hydrate should usually exclude deleted entities from active canvas payload

### Writes

Reject:
- patch deleted node
- delete deleted node if non-idempotent semantics are used
- create edge to deleted node
- apply action that references deleted entity

## Archived board rule

Archived or deleted boards should reject durable mutations unless explicitly restored first.

---

## Limits validation

The system should define explicit limits and validate them consistently.

## Examples of limits

- max request body size
- max upload file size
- max prompt length
- max selected entity count for suggest
- max actions in batch/apply
- max text length per node

### Rule

Limits should live in configuration and be enforced both in request validation and in deeper validation where relevant.

---

## Idempotency validation

If idempotency keys are supported for mutation endpoints, validate:
- key format
- duplicate request semantics
- payload mismatch under reused key

### Recommended rule

If the same idempotency key is reused with a different payload:
- reject with conflict-style error
- do not treat it as the original request

### Important

Idempotency validation is not a substitute for business validation.

---

## Response validation on the server side

Even server-generated responses should be validated at module boundaries where practical.

Examples:
- agent output mapped into API response envelope
- operations payload shape
- board-state serializer shape

This is especially useful for preventing drift between services and HTTP response contracts.

---

## Logging validation failures

Validation failures should be observable but safe.

### Log

- route
- board ID if present
- request ID
- validation class
- entity/action type
- safe error summary

### Do not log

- raw secrets
- full uploaded binary content
- sensitive prompt content without sanitization
- token-like strings

---

## Recommended status mapping summary

Use this as the default unless the API contract explicitly chooses otherwise.

- `400` malformed JSON or invalid primitive/path/query format
- `404` required resource not found
- `409` conflict with current durable state, lock, or editability
- `413` payload too large
- `415` unsupported media type
- `422` semantically invalid but well-formed payload
- `500` unexpected server/storage failure

The important part is not the exact philosophy of 409 vs 422 in every edge case. The important part is choosing one mapping and using it consistently across code, tests, and docs.

---

## Recommended implementation placement

### HTTP/schema validation lives in
- route schemas
- request parsers
- content-type middleware

### Domain validation lives in
- service layer
- `domain/validation/*`

### Transaction-time validation lives in
- service transaction flow
- internal mutation helpers

### Agent output validation lives in
- `agent/output-validator.ts`

### Upload validation lives in
- assets service
- MIME/file inspection helpers

---

## Final summary

The validation model should be built around one central rule:

**a request is not valid merely because it has the right JSON shape; it is valid only if the intended durable state transition is allowed against the current board state.**

That means:
- schema validation guards the boundary
- domain validation enforces business rules
- transaction-time validation protects atomic writes
- suggest and apply are validated differently
- locked, archived, deleted, cross-board, and malformed references are all rejected consistently
- all validation failures map to a predictable API error model

If this document is implemented consistently, backend behavior will be easier to test, easier to reason about, and much safer for agent-driven mutations.

