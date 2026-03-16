# Research: Board Foundation

**Feature**: 001-board-foundation | **Date**: 2026-03-16

## Research Tasks

This document resolves all unknowns identified during the Technical
Context phase of the implementation plan.

---

## R-001: Missing board-lifecycle operation types in enum

**Context**: The `OperationType` enum in `documentation/data-model.md`
(§5.5) lists `update_board` but omits `create_board`, `delete_board`,
and `archive_board`. The spec requires op-log entries for create
(FR-009), update (FR-016), delete (FR-017), and archive (FR-014b).

**Decision**: Extend `OperationType` with three new values:
`create_board`, `delete_board`, `archive_board`.

**Rationale**: The constitution (Principle III: Operations-First
Mutation) mandates that every durable mutation must write an operation
log entry. Board create, delete, and archive are all durable mutations.
The existing `update_board` covers metadata PATCH mutations. The three
new types give operations polling consumers a clear signal for each
lifecycle event.

**Alternatives considered**:
- Reuse `update_board` for all lifecycle transitions: Rejected. Polling
  consumers would need to inspect the payload to distinguish an archive
  from a title change, making the operations log harder to filter and
  semantically weaker.

**Impact**: Add values to `OperationType` enum check constraint via
  migration. No breaking change — the enum is a free-text column with
  a CHECK constraint, not a PostgreSQL enum type.

---

## R-002: ChatThread schema incomplete in OpenAPI

**Context**: The `ChatThread` schema in `openapi.yaml` (line 1075)
only defines `id` and `boardId`. The DDL (`data-model.md` §7.6)
includes `metadata jsonb`, `created_at`, and `updated_at`. The
`CreateBoardResponse` (line 1551) returns a `chatThread` object, so
the API response schema should reflect the full shape.

**Decision**: Extend the `ChatThread` OpenAPI schema to include
`metadata`, `createdAt`, and `updatedAt`, matching the DDL.

**Rationale**: Contract-first principle (Constitution VI) requires the
OpenAPI spec to be the single source of truth for API shape. Omitting
fields that the DDL persists and the API returns creates a
documentation-code gap.

**Alternatives considered**:
- Leave the ChatThread schema minimal and let consumers ignore extra
  fields: Rejected. `additionalProperties` is not set on ChatThread,
  so strict validators would reject the extended response.

**Impact**: Schema-only change in `openapi.yaml`. No endpoint changes.

---

## R-003: UpdateBoardRequest missing `status` field for archival

**Context**: The spec clarification (session 2026-03-16) decided that
archival is initiated via `PATCH /boards/{boardId}` with
`{"status": "archived"}`. However, the current `UpdateBoardRequest`
schema (line 1178) does not include `status` as a patchable field.

**Decision**: Add `status` to `UpdateBoardRequest` with domain
validation constraining allowed transitions (`active → archived`
only via PATCH; other transitions rejected with 422).

**Rationale**: The clarification is authoritative. The OpenAPI spec
must match. Adding `status` to the patch schema and enforcing
transitions server-side preserves the contract-first model while
keeping the API surface minimal.

**Alternatives considered**:
- Dedicated `POST /boards/{boardId}/archive` endpoint: Rejected during
  spec clarification. Adds an endpoint for a single-field state
  transition that JSON Merge Patch handles cleanly.

**Impact**: Schema change in `openapi.yaml` (`UpdateBoardRequest`
  gains `status` field). Domain validation must enforce transition
  rules. This is a pre-implementation change — no existing consumers.

---

## R-004: Board creation revision semantics

**Context**: Board creation sets `revision = 0` (DDL default). The
spec says "Create returns board with `revision: 0`" (FR-003). The
question is whether `create_board` should write an op-log entry with
`board_revision = 0` and whether the first subsequent mutation bumps
revision to 1.

**Decision**: Board creation writes an op-log entry with
`board_revision = 0` (the initial revision). The first metadata update
after creation bumps revision to 1. This means revision 0 represents
the created-but-never-mutated state.

**Rationale**: The constitution says every durable mutation writes an
op-log entry. Board creation is a durable mutation. Using revision 0
for the creation entry means polling consumers who start from
`since_revision = 0` will see the creation event. Subsequent mutations
start from revision 1, making the sequence clean: 0 = created,
1 = first update, etc.

**Alternatives considered**:
- Skip op-log for board creation (creation is not a "mutation"):
  Rejected. The constitution does not exempt creation, and a board's
  existence is state that should be traceable.
- Start at revision 1 on create: Rejected. This would mean revision 0
  is never used, wasting a sentinel value and breaking the mental model
  of "revision = number of mutations applied."

---

## R-005: Idempotency key scope and TTL

**Context**: The OpenAPI spec declares an optional `Idempotency-Key`
header on `POST /boards` and `PATCH /boards/{boardId}`. The
`idempotency_keys` DDL includes `scope_key`, `request_fingerprint`,
`response_status_code`, `response_body`, and `expires_at`. The spec
does not define a TTL.

**Decision**: Idempotency key TTL is 24 hours. Scope key format:
`{operation}:{boardId}:{idempotencyKey}` for board-scoped operations,
`{operation}:global:{idempotencyKey}` for global operations like
board creation. Request fingerprint is a SHA-256 of the normalized
request body.

**Rationale**: 24 hours provides sufficient protection against
retries from frontend crashes or network issues without accumulating
unbounded storage. The scope key pattern prevents cross-endpoint
collisions. SHA-256 fingerprint detects payload-mismatch retries
(returns 409 IDEMPOTENCY_CONFLICT per OpenAPI spec).

**Alternatives considered**:
- 1-hour TTL: Too short for overnight tab-resume scenarios.
- 7-day TTL: Unnecessarily long for MVP with no multi-user collision
  risk.
- No fingerprinting (treat key as sufficient): Rejected. Without
  fingerprinting, a client reusing a key with different payload would
  get a stale cached response without warning.

---

## R-006: Board listing sort order and filter

**Context**: Test matrix T002 says "Sort `updatedAt desc`". The spec
FR-010 says "List boards returns all non-deleted boards". The question
is whether the list endpoint needs pagination, filtering by status, or
search in this slice.

**Decision**: Board listing in this slice returns all non-deleted
boards sorted by `updated_at DESC`. No pagination, no status filter
parameter, no search. Archived boards appear in the list (they are
not deleted). The `status` field in each board object allows the
client to distinguish active from archived.

**Rationale**: MVP targets ~100 boards maximum. Pagination and
filtering add complexity without user-facing value at this scale.
Archived boards should be visible in the list to prevent data loss
confusion (users should see their archived boards somewhere).

**Alternatives considered**:
- Add `?status=active` filter: Deferred to a future slice. The
  frontend can client-side filter at MVP scale.
- Paginate with cursor: Deferred. Unnecessary under 100 boards.

---

## R-007: Technology stack confirmation for greenfield project

**Context**: No source code exists yet. The architecture document
recommends TypeScript, Express, PostgreSQL, modular monolith.

**Decision**: Confirmed technology stack:
- **Runtime**: Node.js LTS (22.x) with TypeScript 5.x
- **HTTP framework**: Express 5.x
- **Validation**: Zod 3.x (schema-first validation matching OpenAPI)
- **Database client**: node-postgres (`pg` 8.x) with explicit
  connection pooling
- **Migrations**: Plain SQL files executed via a lightweight runner
  (node-pg-migrate or custom script)
- **Testing**: Vitest for unit/integration, Supertest for HTTP
  contract tests
- **Containerization**: Docker Compose for local dev (API + PostgreSQL)
- **Linting/Formatting**: ESLint + Prettier (standard TypeScript
  config)

**Rationale**: These are the most commonly used, well-documented
choices for a TypeScript backend API. Express 5 is stable and widely
understood. Zod provides TypeScript-native schema validation that
mirrors OpenAPI shapes. `pg` is the standard PostgreSQL driver for
Node.js with full transaction support.

**Alternatives considered**:
- Fastify: Slightly faster but smaller ecosystem; Express is more
  appropriate for MVP velocity.
- Drizzle/Prisma ORM: Adds abstraction over SQL that the architecture
  doc discourages ("repositories: SQL access only").
- Jest instead of Vitest: Vitest is faster and more ESM-friendly.

---

## Summary

| ID | Status | Impact |
|----|--------|--------|
| R-001 | Resolved | Migration: extend operation_type CHECK |
| R-002 | Resolved | Schema: extend ChatThread in openapi.yaml |
| R-003 | Resolved | Schema: add status to UpdateBoardRequest |
| R-004 | Resolved | Design: create_board op at revision 0 |
| R-005 | Resolved | Design: 24h TTL, scoped key, SHA-256 fingerprint |
| R-006 | Resolved | Design: no pagination/filter in this slice |
| R-007 | Resolved | Confirmed: TS + Express + Zod + pg + Vitest |

All NEEDS CLARIFICATION items resolved. No outstanding unknowns.
