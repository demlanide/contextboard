# Research: Revision + Operations Foundation

**Feature**: 003-revision-operations | **Date**: 2026-03-16

## Research Tasks

This document resolves all unknowns identified during the Technical
Context phase of the implementation plan.

---

## R-001: Reconcile operation_type enum with S3 clarifications

**Context**: S1 (board-foundation) extended the `operation_type` CHECK
constraint to include `create_board`, `delete_board`, and
`archive_board`. The S3 clarifications established that: (1) board
creation does NOT write an operation, (2) board soft-delete and
archival both use `update_board` with before/after status in the
payload. This means `create_board`, `delete_board`, and
`archive_board` are unused operation types.

**Decision**: Remove `create_board`, `delete_board`, and
`archive_board` from the `operation_type` CHECK constraint via a new
migration. Update the operation factory to use `update_board` for all
board status transitions. Remove the `createBoardOperation` call from
the board creation flow.

**Rationale**: The S3 clarification is authoritative. Using
`update_board` for all board-level changes (metadata, archive, delete)
keeps the enum aligned with the canonical data model doc and makes
the operation type semantically clean: one board-level operation type,
with the payload distinguishing what changed.

**Alternatives considered**:
- Keep the S1 types for backward compatibility: Rejected. No
  production consumers exist yet. Correcting now prevents
  accumulating technical debt.
- Keep `create_board` but skip writing it: Rejected. An unused enum
  value creates confusion.

**Impact**: New migration to ALTER the CHECK constraint. Update
`operation-factory.ts` to remove `createBoardOperation`,
`archiveBoardOperation`, `deleteBoardOperation` and refactor archive
and delete to use `updateBoardOperation` with status before/after
payload. Update `boards.service.ts` to stop writing operation on
board creation.

---

## R-002: Per-board write serialization mechanism

**Context**: FR-023 requires durable writes for a single board to be
serialized to guarantee monotonic revision ordering. The current
`withTransaction` helper provides transaction isolation but does not
prevent concurrent transactions from interleaving writes to the same
board.

**Decision**: Use PostgreSQL advisory locks via
`pg_advisory_xact_lock(board_id_hash)` acquired at the start of any
durable mutation transaction. The lock is automatically released on
commit or rollback. The hash is derived from the board UUID to produce
a bigint suitable for the advisory lock function.

**Rationale**: Advisory locks are lightweight, don't block reads, and
integrate cleanly with PostgreSQL transactions. They don't require
schema changes or additional tables. The `pg_advisory_xact_lock`
variant ties the lock lifetime to the transaction, preventing
accidental lock leaks.

**Alternatives considered**:
- `SELECT ... FOR UPDATE` on the boards row: Works but locks the row
  for all operations including reads in the same transaction isolation
  level. Advisory locks are more targeted.
- Optimistic concurrency with `WHERE revision = $expected`: Doesn't
  prevent interleaving; requires retry loops. Better suited for
  future multi-user scenarios as an additional layer, not as the
  primary serialization mechanism.
- Application-level mutex: Doesn't work across multiple server
  instances. Database-level locking is necessary.

**Impact**: New helper function `acquireBoardLock(client, boardId)`
in `db/tx.ts`. Called at the start of every board mutation transaction
in the service layer.

---

## R-003: Generalizing the operation factory for future slices

**Context**: The current `operation-factory.ts` has board-specific
factory functions. S4 (nodes), S5 (edges), S6 (batch), S9/S10 (agent)
all need to write operations through the same factory. The factory
needs to be extensible without rework.

**Decision**: Refactor the operation factory into a generalized
`buildOperation` function that accepts typed parameters (board_id,
revision, actor_type, operation_type, target_type, target_id,
batch_id, payload, inverse_payload). Keep convenience wrappers for
common patterns. Define TypeScript interfaces for each operation
payload shape.

**Rationale**: A single generalized builder with typed payload
interfaces allows future slices to add new operation types by defining
new payload interfaces, not by adding new factory functions. The
convenience wrappers for board operations provide backward
compatibility and documentation.

**Alternatives considered**:
- One factory function per operation type: Current approach. Doesn't
  scale — S4 alone adds 3 operation types.
- Class-based builder pattern: Over-engineered for what is essentially
  a data structure constructor.

**Impact**: Refactor `operation-factory.ts`. Define payload interfaces
for `update_board`, `create_node`, `update_node`, `delete_node`,
`create_edge`, `update_edge`, `delete_edge`. Future slices extend
by adding new interfaces.

---

## R-004: Mutation transaction wrapper for revision + operations

**Context**: Every durable mutation follows the same pattern: acquire
board lock → validate → apply writes → bump revision → write
operations → commit. The current service code manually orchestrates
this in each method. S3 should provide a reusable wrapper that
enforces the pattern.

**Decision**: Create a `withBoardMutation` higher-order function in
the service infrastructure that wraps `withTransaction`, acquires the
board lock, and provides a context object to the mutation callback.
The callback returns the operations to write. The wrapper handles
revision bump and operation insertion. This codifies the "revision
bump at end, operations in same transaction" invariant.

**Rationale**: A shared wrapper prevents each future service method
from independently reimplementing the revision+operations pattern,
which is error-prone. It also provides a single place to enforce the
board lock, revision bump timing, and operation logging.

**Alternatives considered**:
- Keep manual orchestration per service method: Works but risks
  divergence as more mutation types are added. The invariants are
  too important to rely on copy-paste consistency.
- Middleware-based approach: Transaction boundaries belong in the
  service layer, not HTTP middleware.

**Impact**: New `withBoardMutation` function. Refactor existing
`boards.service.ts` methods to use it. Future slices (S4, S5, S6)
use the same wrapper.

---

## R-005: batch_id assignment semantics

**Context**: The S3 clarification established that `batch_id` is null
for single-entity mutations and set to a UUID for multi-entity
batches. The current code always sets `batch_id` to null (S1 has
no multi-entity mutations).

**Decision**: No code change needed for single-entity mutations —
the current behavior of null `batch_id` is correct. Document the
convention that multi-entity mutation wrappers (S6 batch, S10 apply)
must generate a UUID and pass it to all operation rows in the batch.
The `buildOperation` function accepts an optional `batch_id` parameter.

**Rationale**: The existing behavior already satisfies the
clarification. The generalized factory from R-003 will accept
`batch_id` as a parameter, making the convention explicit.

**Alternatives considered**: None needed — current behavior is correct.

**Impact**: Documentation only for this slice. The `buildOperation`
interface exposes `batch_id` for future callers.

---

## Summary

| ID | Status | Impact |
|----|--------|--------|
| R-001 | Resolved | Migration + factory refactor: remove create/delete/archive board ops |
| R-002 | Resolved | New `acquireBoardLock` helper in tx.ts |
| R-003 | Resolved | Generalize operation factory with typed payload interfaces |
| R-004 | Resolved | New `withBoardMutation` wrapper for consistent mutation flow |
| R-005 | Resolved | Documentation; batch_id interface exposed in factory |

All unknowns resolved. No outstanding items.
