# Non-Functional Requirements

## Purpose

This document defines the non-functional requirements for the Context Board MVP backend and its supporting frontend interactions.

It covers the operational qualities of the system rather than feature behavior.

It answers:
- what latency and timeout budgets the system should target
- how LLM retries should work
- what must be logged and observed
- how errors should be reported
- what upload and storage constraints apply
- what rate limits should exist in MVP
- how concurrent writes should be handled
- what performance expectations apply to board hydration

This document is intended to become the implementation-facing source of truth for runtime, reliability, and operability decisions.

---

## NFR principles

### 1. Correctness over cleverness

For MVP, the system should prioritize predictable, correct state transitions over aggressive optimization.

### 2. Backend durability is more important than UI immediacy

UI responsiveness matters, but the system must never trade away durable consistency for a faster-looking mutation flow.

### 3. Safe degradation is required

When the system cannot complete a workflow within budget, it should fail in a controlled and observable way rather than hang silently or partially commit.

### 4. One simple operational model for MVP

The MVP should use one API service, one database, one storage integration, and optional narrow async workers.

### 5. All budgets should be explicit

Timeouts, limits, and retry behavior should not be left implicit in SDK defaults.

---

## System scope

These requirements apply to:
- backend HTTP API
- PostgreSQL persistence
- object/file storage for assets
- agent suggest/apply orchestration
- asset upload and retrieval
- board state hydration
- frontend expectations around request timing and retry semantics

They do not attempt to define enterprise SLOs yet.

---

## Availability and reliability targets

## MVP target availability

The MVP should target practical reliability suitable for internal alpha/beta and early external use, not formal enterprise uptime.

Recommended goal:
- API availability target: **99.5% monthly** for core read/write endpoints in normal operating conditions

This is a planning target, not a contractual SLA.

## Data integrity target

The more important target for MVP is integrity:
- no partial durable mutation commits
- no silent loss of acknowledged writes
- no revision advancement without committed state
- no operations log rows for rolled-back mutations

Integrity requirements are stricter than uptime requirements.

---

## Request timeout budgets

Timeout budgets should be explicit per class of request.

## General HTTP server policy

Recommended server behavior:
- every request path must have a bounded execution time
- timeouts should produce controlled errors and logs
- the backend should not leave requests hanging indefinitely

## Suggested request timeout classes

### Fast read endpoints

Examples:
- board summary reads
- small metadata reads
- operations read with small result set

Target latency:
- p50: under **150 ms**
- p95: under **400 ms**

Hard timeout budget:
- **2 seconds**

### Standard mutation endpoints

Examples:
- create/update/delete node
- create/update/delete edge
- board patch
- small batch mutation

Target latency:
- p50: under **250 ms**
- p95: under **800 ms**

Hard timeout budget:
- **5 seconds**

### Board hydrate endpoint

Example:
- `GET /boards/:boardId/state`

Target latency for typical boards:
- p50: under **400 ms**
- p95: under **1200 ms**

Hard timeout budget:
- **6 seconds**

### Upload endpoints

Upload timing depends on file size, but the server must still be bounded.

Target:
- metadata persistence after upload should complete quickly once bytes are received

Hard timeout budget:
- **30 seconds** end-to-end for MVP upload request handling

### Agent suggest endpoints

This class includes LLM latency.

Target latency:
- p50: under **4 seconds**
- p95: under **12 seconds**

Hard timeout budget:
- **20 seconds**

### Agent apply endpoints

Apply includes validation, transaction, and possibly larger diffs.

Target latency:
- p50: under **1.5 seconds**
- p95: under **5 seconds**

Hard timeout budget:
- **10 seconds**

## Timeout design rule

The timeout budget should include all internal work for that request class, not only network time.

---

## Database timeout budgets

The database layer should have explicit bounds.

### Recommended DB settings

- transaction acquisition / pool wait timeout: **2 seconds**
- standard statement timeout: **3 seconds**
- heavier hydrate query budget: **5 seconds**
- apply/batch transaction statement budget: **5 seconds**

### Rule

A database timeout must fail the whole request cleanly and roll back the transaction.

---

## LLM timeout and retry policy

LLM calls need a stricter policy than ordinary HTTP calls because they are slower and less deterministic.

## LLM usage scope

This policy applies to:
- suggest model call
- future summarization/captioning jobs if routed through LLMs

It does not apply to apply transaction execution itself.

## LLM call timeout

Recommended timeout:
- single LLM request timeout: **12 seconds**
- absolute per-request agent budget including retries: **18 seconds** for suggest

## Retry policy

Recommended MVP retry policy:
- **at most 1 retry** for suggest
- **no retry** for apply transaction execution
- retries only for retryable transport/provider failures

### Retryable conditions

Retry on:
- provider timeout
- transient 5xx from provider
- connection reset / transport interruption
- rate-limit style response only if backoff still fits within total request budget

### Non-retryable conditions

Do not retry on:
- invalid prompt construction by our code
- invalid model output shape that clearly violates schema repeatedly
- user input too large
- policy rejection or provider refusal
- request budget already exhausted

## Backoff policy

Recommended backoff:
- exponential with jitter
- initial delay around **300-500 ms**
- only one retry in MVP

## LLM retry safety rule

If retrying would exceed the endpoint hard timeout or push the UX into an unreasonably long wait, fail fast instead.

## Output validation rule

A successful HTTP response from the LLM provider is not enough.

The output must still pass:
- parsing
- action schema validation
- action-type allow-list validation

If output validation fails, treat the suggest call as failed.

---

## Observability requirements

Observability is required from the start.

## Structured logging

All backend logs should be structured, machine-readable logs.

Every log event should include when available:
- timestamp
- service name
- environment
- log level
- request ID
- route or job name
- board ID
- actor type
- duration if the event is completion-oriented
- error class if applicable

## Required request-level logs

For every HTTP request, log at least:
- request start or completion
- method
- route
- status code
- latency
- request ID

## Required mutation logs

For every durable mutation, log at least:
- board ID
- mutation type
- entity counts affected
- resulting revision
- transaction success/failure
- idempotency key presence if applicable

## Required agent logs

For suggest/apply flows, log at least:
- board ID
- request ID
- context size summary
- selected entity counts
- action count returned
- model call duration
- retry count
- validation outcome

## Required upload logs

For asset upload and processing, log at least:
- board ID
- asset ID if created
- MIME type
- file size
- storage result
- thumbnail processing result if applicable

## Logging safety rules

Do not log:
- raw secrets
- full tokens
- full uploaded binary content
- raw sensitive prompt text without sanitization rules
- full personally sensitive payloads unless explicitly safe and necessary

---

## Metrics requirements

The system should emit metrics from the start, even if only a minimal stack is used.

## Minimum required metrics

### HTTP
- request count by route/status
- request latency histogram by route
- error count by route/class

### Database
- query latency histogram
- transaction failure count
- pool wait time
- pool saturation indicators

### Agent
- suggest request count
- suggest success/failure count
- LLM latency histogram
- retry count
- invalid output count
- action plan size histogram

### Assets
- upload success/failure count
- upload size histogram
- thumbnail job success/failure count
- storage failure count

### Board sync
- board hydrate latency histogram
- board hydrate payload size histogram
- apply latency histogram
- operations read latency histogram later

---

## Tracing requirements

Distributed tracing is optional for MVP, but request correlation is not optional.

## Minimum tracing requirement

Every request and every async job should carry a correlation ID or request ID through:
- HTTP handler
- service layer
- repository layer where practical
- external provider call logs
- worker jobs

If full tracing is available, instrument:
- board hydrate
- standard mutation flow
- suggest flow
- apply flow
- asset upload and thumbnail generation

---

## Error reporting requirements

The system should support operational error reporting in addition to local logs.

## Required behavior

Unexpected server errors should be reported to an error tracking system with:
- stack trace
- request ID
- environment
- route/job name
- board ID if present
- safe contextual tags

## Reportable events

Report at minimum:
- unhandled exceptions
- transaction failures not caused by expected validation rejection
- storage integration failures
- repeated LLM provider failures
- serialization/response-shape failures

## Do not report as critical exceptions

Do not flood error reporting with expected client-driven validation failures such as:
- invalid body shape
- unsupported content type
- missing resource
- locked node conflict

Those should be logged and counted as normal operational events, not exception alerts.

---

## Upload and storage constraints

The MVP needs explicit limits for uploads and storage behavior.

## Allowed asset classes

For MVP, recommend support for:
- PNG
- JPEG
- WebP
- optionally GIF only if rendering/storage cost is acceptable

## Upload size limits

Recommended default limits:
- per-file upload max: **10 MB** for MVP image uploads
- reject anything larger with `413 Payload Too Large`

If larger creative assets are needed later, raise limits intentionally rather than silently.

## Storage policy

### Object storage

Store original uploaded bytes in object/file storage using backend-generated storage keys.

### Metadata storage

Store in PostgreSQL:
- asset ID
- board ID
- MIME type
- byte size
- width/height if known
- original filename as metadata only
- storage key
- processing status
- created/updated timestamps

### Thumbnail policy

Recommended:
- generate thumbnails for large images asynchronously when possible
- original asset remains canonical
- thumbnail failures should not invalidate a successful original upload unless the product explicitly requires thumbnail presence

## Missing blob policy

If metadata exists but the underlying blob is missing:
- treat this as a storage integrity issue
- log and report it
- return a controlled server error or dedicated asset retrieval failure
- do not pretend the asset never existed

## Storage lifecycle policy

For MVP:
- deleting a board should mark assets non-active in metadata first
- physical blob deletion may be synchronous or deferred, but policy must be consistent
- avoid immediate hard deletion if it threatens transaction simplicity

---

## Rate limiting requirements

Rate limiting is needed in MVP mainly for abuse and runaway usage control.

## General policy

Apply rate limits per authenticated actor later, and per IP or session fallback in early MVP if full auth is not yet present.

## Recommended MVP limits

### Read endpoints
- relatively generous
- example: **120 requests/minute** per actor/IP for standard reads

### Standard mutation endpoints
- example: **60 requests/minute** per actor/IP

### Upload endpoints
- example: **20 requests/minute** per actor/IP
- also apply concurrent upload limits

### Suggest endpoints
- example: **12 requests/minute** per actor/IP
- more important than ordinary read limits because of LLM cost

### Apply endpoints
- example: **20 requests/minute** per actor/IP
- also protect against duplicate apply button storms with idempotency or request dedupe

## Rate limit response

When limit is exceeded:
- return `429 Too Many Requests`
- include retry guidance if available
- log rate-limit events as operational signals

---

## Concurrency policy

Concurrency rules must be explicit because this backend is transaction-heavy.

## Core concurrency rule

Durable writes for a single board must be serialized.

### Recommended implementation policy

For any durable mutation affecting a board:
- acquire a per-board write lock inside the transaction
- validate and apply under that lock
- bump revision once
- append operations in the same transaction

This protects:
- monotonic revision order
- deterministic apply behavior
- batch correctness
- node/edge topology consistency

## Allowed concurrency

Concurrent reads are allowed.

Concurrent writes to different boards are allowed.

Concurrent writes to the same board should not execute in overlapping commit windows.

## Suggest concurrency

Suggest is read-only for durable board state and may run concurrently, but:
- it should be bounded by rate limits
- its result is only a preview
- apply must still re-validate against current state

## Upload concurrency

Uploads may run concurrently up to a bounded service limit, but metadata commit and board-level mutations must still obey normal consistency rules.

## Duplicate action protection

For apply and other critical mutation endpoints, use one or more of:
- idempotency keys
- client-side duplicate button disable
- server-side in-flight dedupe where feasible

---

## Performance expectations for board hydration

Board hydration is one of the most important performance-sensitive flows.

## Definition

Board hydration means loading the canonical board state required to render the board screen.

This typically includes:
- board metadata
- active nodes
- active edges
- needed asset metadata
- revision
- optional thread summary data if included by contract

## Target performance budgets

For a typical MVP board size, target:
- p50 under **400 ms**
- p95 under **1200 ms**

For larger but still supported boards, target:
- p95 under **2000 ms**

## Payload expectations

Hydrate responses should be large enough to be useful, but not careless.

Recommended approach:
- include only active entities needed for the default board view
- avoid embedding heavy binary content
- include asset metadata, not asset bytes
- avoid over-fetching unrelated chat history in the board hydrate response

## Query design expectations

Hydrate should be implemented using efficient indexed reads and predictable joins/batches.

Avoid:
- N+1 query patterns
- loading deleted entities unless endpoint semantics require it
- loading full asset blobs through hydrate

## When hydration exceeds budget

If hydrate latency regularly exceeds target:
- profile query shape first
- reduce payload scope second
- add caching only if consistency semantics remain clear

### Caching note

For MVP, prefer correct indexed DB reads over premature caching of board state.

---

## Batch and apply performance expectations

## Batch mutation

For small to medium mutation batches, target:
- p50 under **500 ms**
- p95 under **1500 ms**

## Apply

For realistic MVP action plans, target:
- p50 under **1.5 seconds**
- p95 under **5 seconds**

### Apply performance rule

Do not sacrifice validation thoroughness for a lower median latency.

Correct atomic behavior matters more than shaving a few hundred milliseconds off apply.

---

## Resource usage limits

The system should define and enforce basic usage bounds.

## Recommended MVP limits

- max actions per apply plan: **50**
- max actions per batch request: **50**
- max selected entities in suggest context: **100**
- max prompt length: explicit product-configured cap
- max text length per node: explicit product-configured cap

These values may change, but they should exist in config rather than remaining implicit.

---

## Background job requirements

If async workers are used, they should have explicit reliability behavior.

## Job requirements

- jobs must be idempotent where practical
- job failure must be observable
- retry count must be bounded
- poison/failing jobs must not retry forever

## Recommended MVP policy

- thumbnail generation retry: up to **3 attempts** with backoff
- OCR/caption jobs later: bounded retries with dead-letter or failure status

Async job failure must not corrupt already accepted primary board state.

---

## Configuration requirements

All critical non-functional limits should be configuration-driven.

At minimum, configure:
- request timeout budgets
- DB statement timeout
- upload size limit
- rate limits
- LLM timeout and retry count
- max action count
- max prompt size
- allowed MIME types

Do not hardcode these values deep inside feature code.

---

## Security-related operational requirements

Even though this is not a full security document, a few operational rules are required.

## Required rules

- secrets must come from environment or secret manager, never source code
- storage credentials and LLM credentials must be isolated by environment
- logs must redact secrets and token-like values
- upload MIME validation must not rely only on client-declared type
- public asset access policy must be explicit, not accidental

---

## Recovery and degradation behavior

The system must fail safely.

## On DB timeout or transaction failure

- roll back the transaction
- return controlled error response
- log and count the event
- do not advance revision

## On LLM provider failure

- fail suggest cleanly
- do not mutate board state
- preserve chat/request context only according to product rules
- surface retryable error to client when appropriate

## On storage failure during upload

- do not create misleading success metadata
- return controlled upload failure
- log and report the event

## On async thumbnail failure

- keep primary asset usable if original upload succeeded
- mark processing failure explicitly
- allow retry later

---

## Testing expectations for non-functional behavior

These requirements should influence test planning.

## Minimum NFR-focused tests

- request timeout handling tests
- DB timeout rollback tests
- LLM retry decision tests
- rate-limit tests
- upload size and MIME rejection tests
- duplicate apply protection tests
- board hydrate performance smoke tests
- missing blob handling tests

---

## Recommended implementation summary

### Timeout defaults
- read: 2s
- mutation: 5s
- hydrate: 6s
- upload: 30s
- suggest: 20s hard budget
- apply: 10s

### LLM policy
- 12s single call timeout
- 1 retry max
- retry only transient failures

### Upload/storage
- image types only for MVP
- 10 MB file cap
- original in object storage, metadata in Postgres

### Rate limiting
- reads: 120/min
- mutations: 60/min
- uploads: 20/min
- suggest: 12/min
- apply: 20/min

### Concurrency
- serialize durable writes per board
- allow concurrent reads
- re-validate apply inside transaction

### Hydrate performance
- p50 < 400 ms
- p95 < 1200 ms for typical boards

---

## Final summary

The non-functional model should be built around one central rule:

**the system must remain bounded, observable, and correct under normal load, transient provider failures, and conflicting write attempts.**

That means:
- every important request path has explicit timeout budgets
- LLM retries are limited and safe
- logs, metrics, and error reporting are built in from the start
- uploads and storage behavior have clear limits
- rate limits protect the system and model costs
- writes are serialized per board
- board hydration has measurable performance targets

If these requirements are adopted early, the MVP will be much easier to operate, debug, and scale without rewriting the core architecture later.

