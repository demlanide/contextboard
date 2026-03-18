# Data Model: Agent Apply (011-agent-apply)

## Overview

Agent apply operates entirely within the existing board, node, edge, and operations schema, adding only the minimum additional metadata needed to attribute operations to the agent and to record apply-specific context (such as idempotency keys) in existing tables.

No new top-level tables are required for this slice; instead, we rely on:
- `boards` (existing)
- `nodes` (existing)
- `edges` (existing)
- `operations` (existing)
- Chat- and agent-related tables introduced by earlier slices (for suggest and chat persistence)

## Entities

### Board

- **Identities & Keys**:
  - `id` (UUID): Primary key.
  - `revision` (integer): Monotonic board revision token.
- **Relevant Fields/Attributes** (for apply):
  - `archived` (boolean): Archived boards reject apply.
  - `deleted` / soft-delete flags: Deleted boards behave as not found.
- **Relationships**:
  - `boards.id` → `nodes.board_id`
  - `boards.id` → `edges.board_id`
  - `boards.id` → `operations.board_id`
- **Validation / Invariants**:
  - Every successful apply increments `revision` exactly once.
  - Failed or rolled-back applies MUST NOT modify `revision`.

### Node

- **Identities & Keys**:
  - `id` (UUID): Primary key.
  - `board_id` (UUID): Foreign key to `boards.id`.
- **Relevant Fields/Attributes**:
  - Geometry: `x`, `y`, `width`, `height`, `z_index`.
  - Content: `content` / `content.text` or equivalent.
  - State: `deleted` (soft-delete), `locked`, `hidden`, `ai_generated` (if present from prior slices).
- **Relationships**:
  - `nodes.board_id` → `boards.id`.
  - Referenced by `edges.source_node_id` and `edges.target_node_id`.
- **Validation / Invariants** (as used by apply):
  - `locked = true` → node MUST NOT be mutated by apply.
  - `deleted = true` → node MUST NOT be a mutation target.
  - `board_id` MUST match the target board for all node mutations in the plan.

### Edge

- **Identities & Keys**:
  - `id` (UUID): Primary key.
  - `board_id` (UUID): Foreign key to `boards.id`.
- **Relevant Fields/Attributes**:
  - `source_node_id`, `target_node_id` (UUIDs).
  - `deleted` (soft-delete).
- **Relationships**:
  - `edges.board_id` → `boards.id`.
  - `edges.source_node_id` / `edges.target_node_id` → `nodes.id`.
- **Validation / Invariants** (as used by apply):
  - Both `source_node_id` and `target_node_id` MUST reference existing, non-deleted nodes on the same board at apply time.
  - `deleted = true` → edge MUST NOT be a mutation target.

### Operation

- **Identities & Keys**:
  - `id` (UUID): Primary key.
  - `board_id` (UUID): Foreign key to `boards.id`.
- **Relevant Fields/Attributes** (for this slice):
  - `revision` (integer): Board revision associated with the operation.
  - `actor_type` (enum): Should include an `agent`/`ai` variant to attribute apply operations to the agent.
  - `actor_id` or equivalent linking to the initiating user.
  - `kind` / `operation_type` (enum/string): Encodes the type of change (e.g., create_node, update_node, delete_node, create_edge, update_edge, delete_edge, layout_change).
  - `payload` (JSONB): Structured description of what changed (IDs, fields, before/after values).
  - `metadata` (JSONB, if present): May include:
    - `origin` (e.g., `"agent-apply"`).
    - `apply_idempotency_key` (string) derived from the hash of the normalized plan + board revision.
    - Additional context for debugging and observability.
- **Relationships**:
  - `operations.board_id` → `boards.id`.
  - `operations.revision` logically groups operations for a single apply (and other batch mutations).
- **Validation / Invariants**:
  - All operations written for a given apply share the same `(board_id, revision)`.
  - Operations MUST NOT be written for failed/rolled-back applies.
  - Agent apply operations MUST carry `actor_type = 'agent'` (or equivalent) and a clear origin marker.

### Agent Action Plan (in-memory / request shape)

This is not a separate table but an API/domain shape used by suggest and apply.

- **Shape**:
  - `items: ActionPlanItem[]`, where each item is one of:
    - `create_node` (includes temporary ID, geometry, content, metadata).
    - `update_node` (target node ID, patch of fields).
    - `delete_node` (target node ID).
    - `create_edge` (temporary or existing source/target IDs, metadata).
    - `update_edge` (edge ID, patch).
    - `delete_edge` (edge ID).
    - `batch_layout` (batch of node position changes).
- **Temporary IDs**:
  - Client-provided `temp_id` values for newly created nodes/edges.
  - Resolved to durable `id` values on successful apply and returned as a mapping.
- **Validation / Invariants**:
  - All item targets MUST refer to entities on the same `board_id` as the apply call.
  - `create_edge` references using temp IDs MUST match nodes created earlier in the same plan.
  - No disallowed action types; only the allow-listed kinds above are valid.

### Apply Invocation (conceptual)

Also not a dedicated table for this slice; modeled as the request/response and the combination of operations, board revision, and idempotency key.

- **Key fields in request**:
  - `boardId` (path parameter).
  - `plan` / `actionPlan` (array of `ActionPlanItem`).
  - Optional `clientRequestId` or similar correlation ID (aligned with broader API conventions).
- **Key fields surfaced in response**:
  - `boardRevision` (new revision after successful apply).
  - `changes` or hydrated board state (authoritative view of the committed result).
  - `tempIdMapping` for newly created nodes/edges.
  - Error envelope with code and high-level reasons on failure.

## State Transitions

### Successful apply

- **Preconditions**:
  - Board exists, is not archived or deleted.
  - Request passes schema validation.
  - All references in the action plan are valid against current DB state.
  - All affected nodes/edges are mutable (not locked or deleted).
  - Plan size and payload are within configured limits.
- **Invariants**:
  - One DB transaction performs:
    - All node and edge creates/updates/deletes/layout changes.
    - Writing of corresponding operation rows with `actor_type = agent`.
    - Increment of `boards.revision` by 1.
  - The apply idempotency key is recorded alongside operations or in related metadata if needed.

### Failed apply

- **Causes**:
  - Locked targets.
  - Invalid references.
  - Validation rule violations.
  - Exceeded size/complexity limits.
  - Transaction-time errors.
- **Effects**:
  - No changes to `nodes`, `edges`, `boards.revision`, or `operations`.
  - Structured error response with high-level reasons and a stable error code.

