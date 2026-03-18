# Tasks: Agent Apply

**Input**: Design documents from `/specs/011-agent-apply/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `backend/src/`, `backend/tests/`
- **Frontend**: `frontend/src/`, `frontend/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add apply-specific configuration (limits, timeout, rate limit, idempotency retention).

- [ ] T001 Add agent apply limits to backend/src/config/limits.ts — agent.apply.maxOperations (e.g. 200, align with agent.maxActionItems), agent.apply.maxPayloadBytes (e.g. 1_048_576), agent.apply.idempotencyRetentionMinutes (e.g. 5)
- [ ] T002 Add apply request config to backend/src/config/env.ts — APPLY_REQUEST_TIMEOUT_MS (default 10_000 per constitution), APPLY_RATE_LIMIT (default 20 per constitution); ensure these are referenced by apply handler and middleware

**Checkpoint**: Configuration extended with apply limits and timeouts.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Apply request/response schemas, idempotency derivation, plan validation, in-transaction edge helpers, idempotency store, apply executor, and HTTP + frontend client. No user story work can begin until this phase is complete.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T003 [P] Add apply request/response schemas in backend/src/schemas/agent.schemas.ts — ApplyApplyRequestSchema (mode: z.literal('apply'), actionPlan: z.array(ActionPlanItemSchema).min(1)); ApplyApplyResponseSchema (boardRevision: number, updatedBoard: board state shape with nodes/edges, tempIdMapping: { nodes: Record<string, string>, edges: Record<string, string> }); export types; align with specs/011-agent-apply/contracts/agent-apply-endpoint.md
- [ ] T004 [P] Create idempotency key derivation in backend/src/agent/apply-idempotency.ts — export computeApplyIdempotencyKey(normalizedPlan: string, boardRevision: number): string using deterministic hash (e.g. crypto.createHash('sha256').update(normalizedPlan + boardRevision).digest('hex'))
- [ ] T005 [P] Create apply plan normalizer in backend/src/agent/apply-normalizer.ts — export normalizeActionPlanForHash(plan: ActionPlanItem[]): string; produce canonical JSON string (stable key order, sorted or deterministic) for hashing; used by idempotency key
- [ ] T006 Create apply plan validation in backend/src/agent/apply-validator.ts — export validateApplyPlan(plan: ActionPlanItem[], boardId: string, opts: { client, limits }): Promise<{ valid: true } | { valid: false, code: 'ACTION_PLAN_INVALID', reasons: string[] } | { valid: false, code: 'LOCKED_NODE', lockedNodeIds: string[] }>; check plan.length ≤ limits.agent.apply.maxOperations; check payload size if applicable; reuse validateActionPlanReferences from output-validator for refs; check locked via domain/validation/action-plan-rules; return first failure code and details
- [ ] T007 Add in-transaction edge helpers in backend/src/services/edges.service.ts — export createEdgeInTx(client: PoolClient, board: Board, data: CreateEdgeRequest): Promise<Edge>; updateEdgeInTx(client, board, edgeId, patch): Promise<{ edge, changes, previous }>; deleteEdgeInTx(client, board, edgeId): Promise<{ edgeId, previousState }>; perform same validation and repo calls as public createEdge/updateEdge/deleteEdge but without withBoardMutation (caller owns transaction); used by apply executor
- [ ] T008 Create idempotency store in backend/src/agent/apply-idempotency-store.ts — in-memory store with TTL from config (idempotencyRetentionMinutes); set(key, { boardRevision, updatedBoard, tempIdMapping }, ttlMs); get(key) -> stored result or null; export createApplyIdempotencyStore(config): { get, set }; used by apply service to return 200 with cached result on duplicate key
- [ ] T009 Create apply executor in backend/src/services/agent-apply.service.ts — export applyActionPlan(boardId: string, actionPlan: ActionPlanItem[]): Promise<ApplyResult>; compute normalizedPlan = normalizeActionPlanForHash(actionPlan); load board (findBoardById), compute idempotencyKey = computeApplyIdempotencyKey(normalizedPlan, board.revision); if idempotencyStore.get(idempotencyKey) return that result (200 same shape); validate via apply-validator (on LOCKED_NODE or ACTION_PLAN_INVALID throw with code + details); withBoardMutation: assertBoardEditable; tempIdMap = new TempIdMap(); newRevision = board.revision + 1; for each item in order: create_node -> map to CreateNodeRequest, createNodeInTx, tempIdMap.register(tempId, node.id); update_node -> resolve nodeId via tempIdMap, updateNodeInTx; delete_node -> deleteNodeInTx; create_edge -> resolve source/target via tempIdMap, createEdgeInTx, tempIdMap.register edge; update_edge -> updateEdgeInTx; delete_edge -> deleteEdgeInTx; batch_layout -> for each item updateNodeInTx position; build OperationEntry for each with actorType: 'agent', operationType per item; push ops; return { result: { boardRevision: newRevision, updatedBoard, tempIdMapping }, operations: ops, newRevision }; hydrate updatedBoard via board-state.service or existing hydration; idempotencyStore.set(idempotencyKey, result); map ActionPlanCreateNode.node to CreateNodeRequest (content, style, metadata) per node.schemas
- [ ] T010 Create apply handler in backend/src/http/controllers/agent.controller.ts — export applyHandler: parse params.boardId (UUID), body with ApplyApplyRequestSchema (mode 'apply'); call agent-apply.service.applyActionPlan(boardId, body.actionPlan); return 200 with ApplyApplyResponseSchema; on error: LOCKED_NODE -> 409 with error envelope { code: 'LOCKED_NODE', message, details: { lockedNodeIds } }; ACTION_PLAN_INVALID -> 422 with { code: 'ACTION_PLAN_INVALID', message, details: { reasons } }; plan too large -> 413 ACTION_PLAN_TOO_LARGE with details; BOARD_NOT_FOUND 404, BOARD_ARCHIVED 409; use standard error envelope; log full details server-side only
- [ ] T011 Register apply route in backend/src/http/router.ts — add POST /boards/:boardId/agent/actions/apply pointing to agent.controller.applyHandler; place after or alongside existing agent/actions route; apply timeout and rate limit per config
- [ ] T012 [P] Create apply API client in frontend/src/api/agent.api.ts — export submitApply(boardId: string, actionPlan: ActionPlanItem[]): Promise<ApplyApplyResponse>; POST to /api/boards/${boardId}/agent/actions/apply with body { mode: 'apply', actionPlan }; use existing apiRequest; timeout from env/config
- [ ] T013 [P] Add apply state to frontend/src/store/board.store.ts — extend agentState or add applyStatus: 'idle'|'running'|'success'|'error', applyError: SyncError | null; actions setApplyStatus, setApplyError, clearApplyState; reset apply state in existing reset() when board changes

**Checkpoint**: Apply endpoint exists; frontend can call submitApply and store apply state. Backend validates plan, executes in transaction, writes agent operations, returns board + tempIdMapping; duplicate apply returns cached 200.

---

## Phase 3: User Story 1 — Confidently apply a valid agent plan (Priority: P1) 🎯 MVP

**Goal**: User clicks Apply on a suggestion; the system validates the plan, applies all changes in one transaction, increments revision once, and returns updated board state; the UI reconciles and shows success.

**Independent Test**: Trigger a suggest that returns a valid action plan, click Apply, verify all changes committed, board revision +1, operations logged with actor agent; re-open board and see same state.

### Implementation for User Story 1

- [ ] T014 [US1] Wire Apply button and apply flow in frontend — in ActionSummaryList or chat panel add "Apply" button; on click: set applyStatus='running', call agent.api.submitApply(boardId, latestSuggestion.actionPlan); on success: run reconciliation (T015), clear preview (dismiss suggestion), set applyStatus='success' then 'idle'; on error: set applyStatus='error', setApplyError from response; prevent submit when applyStatus='running' or when no actionPlan
- [ ] T015 [US1] Reconcile confirmed state from apply response in frontend/src/store/board.store.ts (or dedicated apply reconciliation helper) — on apply success: set board.revision = response.boardRevision; replace nodesById and edgesById with response.updatedBoard nodes/edges (or merge and apply tempIdMapping to fix any temp id references); apply tempIdMapping so created node/edge ids are updated in store; clear agentState.latestSuggestion / previewVisible so preview is not shown as committed
- [ ] T016 [US1] Apply loading and success states in frontend — show loading indicator (spinner or inline "Applying...") while applyStatus='running'; disable Apply button during run; on success show brief success feedback (toast or inline "Changes applied") then clear; ensure preview is not shown as committed until response received

**Checkpoint**: User can apply a valid plan; board updates once; UI shows loading and success; state reconciled from server response.

---

## Phase 4: User Story 2 — Safe failure for invalid or conflicting plans (Priority: P2)

**Goal**: When the plan is invalid (locked targets, broken references, or too large), the backend rejects with 409/422/413 and user-friendly messages; no partial state is committed. Frontend displays clear error states.

**Independent Test**: Lock a node, apply a plan touching it → 409 LOCKED_NODE, revision unchanged. Submit invalid refs → 422 ACTION_PLAN_INVALID. Submit plan over size limit → 413. UI shows appropriate messages.

### Implementation for User Story 2

- [ ] T017 [US2] Ensure 409 LOCKED_NODE response in backend — in apply-validator and agent-apply.service, when any target node is locked return/throw with code LOCKED_NODE and lockedNodeIds; controller returns 409 with envelope { code: 'LOCKED_NODE', message: concise user-facing text, details: { lockedNodeIds } }; log full details server-side only
- [ ] T018 [US2] Ensure 422 ACTION_PLAN_INVALID response in backend — when validateApplyPlan returns ACTION_PLAN_INVALID (broken refs, schema, disallowed ops), controller returns 422 with envelope { code: 'ACTION_PLAN_INVALID', message: concise user-facing text, details: { reasons } }; message and reasons suitable for UI display per FR-012
- [ ] T019 [US2] Ensure 413 ACTION_PLAN_TOO_LARGE response in backend — in apply-validator or apply handler, when actionPlan.length > maxOperations or request payload size > maxPayloadBytes return 413 with envelope { code: 'ACTION_PLAN_TOO_LARGE', message: instruct user to split changes, details: { maxOperations, maxPayloadBytes } }
- [ ] T020 [US2] Display apply error states in frontend — when apply fails, show error message from response.error.message; for LOCKED_NODE show "Some items are locked and can't be changed"; for ACTION_PLAN_INVALID show "The suggestion is out of date"; for ACTION_PLAN_TOO_LARGE show "Too many changes at once—try smaller steps"; set applyError and applyStatus='error'; provide dismiss or retry UX
- [ ] T021 [US2] Log full validation details server-side only in backend — in apply-validator and apply handler log raw reasons, node ids, and validation output for debugging; never include these in API response body per FR-012

**Checkpoint**: All failure modes return correct status and envelope; no partial commits; UI shows clear, user-friendly error messages.

---

## Phase 5: User Story 3 — Prevent duplicate apply of the same plan (Priority: P3)

**Goal**: Duplicate apply requests (same plan + same board revision) are detected via idempotency key; second request returns 200 with the same result without re-applying. Frontend avoids double-submit.

**Independent Test**: Send two identical apply requests concurrently or retry after success; only one commit; second response returns same boardRevision and state.

### Implementation for User Story 3

- [ ] T022 [US3] Idempotency lookup before execute in backend — in agent-apply.service.applyActionPlan, after computing idempotencyKey call idempotencyStore.get(idempotencyKey); if non-null return stored result (200 same shape: boardRevision, updatedBoard, tempIdMapping) without entering withBoardMutation; ensure stored result shape matches ApplyApplyResponseSchema
- [ ] T023 [US3] Idempotency store write after success in backend — in agent-apply.service after successful withBoardMutation and before returning, call idempotencyStore.set(idempotencyKey, { boardRevision, updatedBoard, tempIdMapping }, ttlMs from config); key is derived from normalized plan + board revision at start of request (pre-apply revision)
- [ ] T024 [US3] Prevent double-submit in frontend — disable Apply button while applyStatus='running'; optionally debounce Apply click (e.g. 500ms) or ignore repeated clicks until status leaves 'running'; ensure loading state is visible so user does not click again

**Checkpoint**: Duplicate apply returns 200 with cached result; revision increments once; frontend does not double-submit.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: OpenAPI and docs sync, observability, quickstart validation.

- [ ] T025 [P] Add apply endpoint to OpenAPI and documentation — in documentation/openapi.yaml add POST /boards/{boardId}/agent/actions/apply with request body (mode: apply, actionPlan), responses 200/404/409/413/422; update documentation/api.md with apply behavior and examples; update documentation/validation-rules.md for apply validation and error codes
- [ ] T026 Add structured logging and metrics for apply in backend — log apply start (boardId, planLength), success (boardId, newRevision, operationCount), failure (boardId, code), duplicate (boardId, idempotencyKey); metrics: apply_requests_total (labels: outcome, code), apply_duration_seconds; use existing obs/logger and metrics patterns
- [ ] T027 Run quickstart validation — execute steps in specs/011-agent-apply/quickstart.md manually or via script; verify suggest → preview → apply → state reconciled and failure cases (locked, invalid, too large) behave as documented

**Checkpoint**: Contract and docs aligned; apply flow observable; quickstart passes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start first.
- **Phase 2 (Foundational)**: Depends on Phase 1. Blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2. Delivers MVP apply flow.
- **Phase 4 (US2)**: Depends on Phase 2; can overlap with US1 (error handling in same handler).
- **Phase 5 (US3)**: Depends on Phase 2 (idempotency in service/store); can follow US1.
- **Phase 6 (Polish)**: Depends on Phase 3–5 being done for full coverage.

### User Story Dependencies

- **US1 (P1)**: Requires Phase 2. No dependency on US2/US3 for happy path.
- **US2 (P2)**: Requires Phase 2; extends same apply handler and validator.
- **US3 (P3)**: Requires Phase 2 (store + key in service); extends apply executor.

### Parallel Opportunities

- Phase 1: T001 and T002 can be done in parallel.
- Phase 2: T003, T004, T005 in parallel; T012, T013 in parallel after schemas/types are known.
- Phase 6: T025 can run in parallel with T026.

---

## Parallel Example: Phase 2

```bash
# Schema + idempotency + normalizer in parallel:
T003: Add apply request/response schemas in backend/src/schemas/agent.schemas.ts
T004: Create idempotency key derivation in backend/src/agent/apply-idempotency.ts
T005: Create apply plan normalizer in backend/src/agent/apply-normalizer.ts

# Frontend client + store state in parallel (after contract is clear):
T012: Create apply API client in frontend/src/api/agent.api.ts
T013: Add apply state to frontend store
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Apply a suggestion end-to-end; verify revision +1, operations with actor agent, state reconciled
5. Deploy/demo

### Incremental Delivery

1. Phase 1 + 2 → Apply endpoint and client ready
2. Phase 3 (US1) → Happy-path apply and UI
3. Phase 4 (US2) → Safe failure and error UX
4. Phase 5 (US3) → Duplicate prevention
5. Phase 6 → Docs and observability

### Notes

- [P] tasks = different files or no blocking dependency within phase
- [USn] label maps task to spec user story for traceability
- Apply reuses existing withBoardMutation, createNodeInTx, operations repo, and agent types/schemas from 010
- Operation type `apply_agent_action_batch` and actor_type `agent` already exist in operation-factory; use per-operation types (create_node, update_node, …) for each applied item with actorType 'agent'
