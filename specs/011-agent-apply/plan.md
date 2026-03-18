# Implementation Plan: Agent Apply

**Branch**: `011-agent-apply` | **Date**: 2026-03-17 | **Spec**: `specs/011-agent-apply/spec.md`  
**Input**: Feature specification from `/specs/011-agent-apply/spec.md`

## Summary

Implement the agent apply flow as the **only durable AI write path**: validate an agent-generated action plan against current board state, then apply all creates, updates, deletes, and layout changes in a single atomic transaction that increments board revision once, writes operations with agent attribution, prevents duplicate apply, and never exposes partial or unconfirmed state to users.

## Technical Context

**Language/Version**: TypeScript 5.7+ (Node.js LTS backend, React 19 frontend)  
**Primary Dependencies**: Express HTTP API, Zod validation, node-postgres (pg), React Router, Zustand  
**Storage**: PostgreSQL 15+ as sole durable store for boards, nodes, edges, operations, chat, and agent artifacts  
**Testing**: Node test runner + Jest/Vitest style unit/integration tests (backend), React Testing Library + Vitest/Jest (frontend), plus contract tests against OpenAPI for new endpoints  
**Target Platform**: Single modular-monolith web service backend and SPA frontend, deployed to standard Linux container environment  
**Project Type**: Web service + SPA client (modular monolith backend, React frontend)  
**Performance Goals**: Agent apply completes end-to-end in under 5 seconds p95, with typical successful applies returning updated board state in ~1–2 seconds under normal load  
**Constraints**: Must preserve strict atomicity and revision semantics, avoid double-apply via idempotency hashing, and respect documented limits on batch size, timeouts, and rate limits for apply endpoints  
**Scale/Scope**: MVP targeting thousands of boards and concurrent users, with individual apply plans capped to modest batch sizes (within configured max operations and payload size) rather than unbounded bulk edits

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Backend Source of Truth (I)**: Apply will use existing backend mutation services and repositories; frontend remains strictly reconciled to server responses and board revision.  
- **Revision as Sync Primitive (II)**: Implementation will ensure apply increments revision exactly once on success and never on failure, matching constitution rules.  
- **Operations-First Mutation Model (III)**: All apply mutations will go through the same operations-writing transaction helpers used for manual edits, guaranteeing one revision and a coherent operations set per apply.  
- **Suggest/Apply Separation (IV)**: Apply is implemented as a dedicated POST endpoint that only accepts already-validated agent plans; suggest remains read-only and cannot change durable state.  
- **Atomic Batch Durability (V)**: Apply operations are executed inside a single DB transaction; any validation or execution failure rolls back all changes and operations.  
- **Contract-First Implementation (VI)**: New `/boards/{boardId}/agent/actions/apply` contract will be defined and aligned with OpenAPI and validation rules before endpoint implementation.  
- **Vertical Slice Testability (VII)**: Agent apply will be delivered as a slice with API, validation, operations logging, revision behavior, and end-to-end tests per user stories.  
- **Modular Monolith Architecture (VIII)**: Changes are confined to existing backend modules (agent, services, repos, http controllers) and frontend board/agent state; no new deployables.  
- **Correctness Over Optimization (IX)**: Preference is given to clear validation, atomicity, and idempotency over aggressive optimization; size limits protect performance.  
- **Explicit Budgets and Observability (X)**: Apply will use explicit config for limits, timeouts, and rate limits and emit structured logs and metrics for success, failure, and duplicate-detection paths.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
