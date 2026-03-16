<!--
Sync Impact Report
===================
Version change: 0.0.0 (template) → 1.0.0
Bump rationale: MAJOR — first constitution ratification from raw template.

Modified principles: N/A (first ratification; no prior principles existed)

Added sections:
  - Core Principles (10 principles)
  - Validation and Durability Rules
  - Quality Gates
  - Documentation Synchronization Rules
  - Observability and Non-Functional Expectations
  - Future Compatibility
  - Governance

Removed sections: None

Templates requiring updates:
  - .specify/templates/plan-template.md ✅ no update needed — "Constitution Check" section
    already references constitution gates generically
  - .specify/templates/spec-template.md ✅ no update needed — spec template is
    requirements-oriented and does not embed constitution-specific constraints
  - .specify/templates/tasks-template.md ✅ no update needed — task template organizes
    by user story; constitution principles are enforced through quality gates, not
    task categorization
  - .specify/templates/checklist-template.md ✅ no update needed — generic checklist
    template; constitution items are applied at generation time
  - .specify/templates/agent-file-template.md ✅ no update needed — development guidelines
    template is auto-generated from plans, not from constitution

Follow-up TODOs: None
-->

# Context Board MVP Constitution

## Core Principles

### I. Backend Source of Truth

The backend is the authoritative owner of all durable board state.

- The frontend MAY optimistically update the UI, but MUST reconcile with
  the server response for every mutation.
- No client-side cache or local store is permitted to override a server
  response for persisted entities.
- All reads that determine UI correctness (board hydration, mutation
  responses) MUST originate from backend-validated state.

Rationale: A single source of truth eliminates reconciliation ambiguity
and makes every state transition auditable.

### II. Revision as Sync Primitive

Board revision is the sole synchronization token for durable state.

- Every successful durable mutation batch MUST increment the board
  revision exactly once.
- Failed or rolled-back mutations MUST NOT advance the revision.
- Suggest-only and read-only operations MUST NOT increment the revision.
- The frontend MUST treat the revision returned by the server as the
  canonical sync marker for subsequent polling or diffing.

Rationale: A monotonic, server-controlled revision makes state ordering
deterministic and enables future incremental sync without redesign.

### III. Operations-First Mutation Model

Every durable state change MUST be recorded in the operations log as
part of the same transaction that commits the change.

- All operations for one committed logical batch MUST share the same
  board revision.
- Operation rows MUST NOT exist for rolled-back mutations.
- The operations log is not an afterthought or side effect; it is a
  first-class part of the mutation transaction.

Rationale: An append-only, transaction-bound operations log provides
auditability, undo foundations, agent traceability, and a future sync
feed without retrofitting.

### IV. Suggest/Apply Separation

Agent suggest and agent apply MUST remain strictly separate flows.

- Suggest MUST NOT mutate durable board state or increment revision.
- Apply is the only durable AI write path and MUST validate the full
  action plan against current server state inside a transaction before
  committing.
- The same in-transaction mutation helpers used for user-driven edits
  MUST be reused for agent apply to prevent a second hidden mutation
  path.
- Invalid, malformed, or unsafe action plans MUST be rejected entirely;
  partial apply is never permitted.

Rationale: Keeping suggest side-effect-free and apply atomic preserves
user control, server invariants, and state auditability for all
AI-driven mutations.

### V. Atomic Batch Durability

All batch mutations and agent apply flows MUST be all-or-nothing.

- If any action in a batch fails validation or execution, the entire
  transaction MUST roll back.
- No partial state, partial revision increment, or partial operations
  log entries are permitted on failure.
- Batch atomicity applies equally to user-initiated batch endpoints
  and agent apply.

Rationale: Atomic batches prevent orphaned or inconsistent board state
that would be difficult to diagnose or recover from.

### VI. Contract-First Implementation

The OpenAPI specification, request/response examples, validation rules,
and test matrix MUST be the starting point for implementation, not a
post-hoc artifact.

- New API surface MUST be defined in the OpenAPI spec before endpoint
  implementation begins.
- Validation rules documented in `documentation/validation-rules.md`
  MUST match the implemented request and domain validation exactly.
- Test cases in `documentation/test-matrix.md` MUST be traceable to
  spec-defined behavior.
- Divergence between contract and implementation is a defect.

Rationale: Contract-first delivery ensures that API consumers,
validators, and tests share one truth, reducing integration surprises.

### VII. Vertical Slice Testability

Every feature slice MUST be independently testable.

- A slice includes API behavior, validation rules, persistence,
  revision behavior, operation log behavior, and acceptance tests.
- No slice may depend on unimplemented downstream slices to pass its
  own acceptance criteria.
- Shared infrastructure (revision policy, operation logging, error
  envelope) MUST be delivered before feature slices that depend on it.

Rationale: Independent testability enables confident incremental
delivery and prevents hidden coupling between slices.

### VIII. Modular Monolith Architecture

The MVP backend MUST be implemented as a modular monolith.

- One deployable API service, one PostgreSQL database, one object
  storage integration, and optional narrow async workers.
- Strong internal module boundaries (HTTP, services, repositories,
  agent, assets, observability) MUST be maintained within one codebase.
- Controllers MUST stay thin; repositories MUST stay focused on SQL;
  services own use-case orchestration and transaction boundaries.
- LLM concerns MUST live exclusively in the agent module.

Rationale: A modular monolith is the best fit for a transaction-heavy,
relational-state-centered MVP where atomic multi-entity writes are
common. Microservices would add deployment and consistency complexity
without corresponding benefit at this stage.

### IX. Correctness Over Optimization

For the MVP, correctness and data integrity MUST take priority over
performance optimization.

- No mutation flow may sacrifice validation thoroughness for lower
  latency.
- Durable consistency MUST NOT be traded for a faster-looking UI
  mutation flow.
- Caching MUST NOT be introduced unless consistency semantics remain
  clear and documented.
- Premature optimization that obscures state transition correctness
  is a defect.

Rationale: An MVP that is correct and auditable can be optimized later;
an MVP that is fast but subtly inconsistent is expensive to fix.

### X. Explicit Budgets and Observability

Timeouts, limits, retry policies, and observability MUST be explicitly
defined and MUST NOT be left to SDK or framework defaults.

- Every request class MUST have a documented hard timeout budget.
- LLM calls MUST have an explicit single-call timeout, a bounded retry
  policy (at most 1 retry for suggest, 0 for apply), and a total
  per-request agent budget.
- Rate limits MUST be configured per endpoint class.
- Structured logging, request-level metrics, and request correlation
  IDs are required from the start, not deferred to a future phase.
- All critical non-functional limits (upload size, batch size, prompt
  length, text length) MUST live in configuration, not hardcoded in
  feature code.

Rationale: Implicit defaults create invisible failure modes. Explicit
budgets make the system bounded, observable, and safe to operate under
transient provider failures and unexpected load.

## Validation and Durability Rules

These rules apply to every flow that changes durable board state.

- Backend validation is authoritative; frontend pre-validation is a UX
  convenience only.
- Validation happens in layers: request/schema boundary, domain/business
  logic, and transaction-time consistency checks.
- A request is not valid merely because it has the right JSON shape; it
  is valid only if the intended durable state transition is allowed
  against the current board state.
- Locked nodes MUST NOT be mutated by any path (manual edit, batch,
  agent apply) unless an explicit override policy is defined and
  documented.
- Archived boards MUST reject all durable mutations.
- Deleted boards MUST be excluded from normal listing and MUST be
  treated as not found by normal read endpoints.
- Soft-deleted entities are not valid mutation targets and MUST be
  excluded from default board-state hydration.
- Agent output MUST be validated for action-type allow-list compliance,
  payload shape, and reference validity before being returned to the
  client as a valid plan.
- Any task that changes durable mutation behavior MUST define its impact
  on board revision semantics and the operations log.

## Quality Gates

### Implementation gates

Every implementation task MUST satisfy these gates before it is
considered complete:

1. The feature matches the behavior defined in the relevant
   specification documents.
2. All validation rules from `documentation/validation-rules.md` that
   apply to the touched endpoints are enforced.
3. Durable mutations increment revision exactly once per committed batch
   and write corresponding operations log entries.
4. Error responses use the standard API error envelope and the status
   code mapping defined in the API contract.
5. Structured logging covers request-level, mutation-level, and (where
   applicable) agent-level events.
6. No hardcoded timeouts, limits, or retry counts; all MUST reference
   configuration.
7. The feature is independently testable as a vertical slice.

### Review gates

Every code review MUST verify:

1. Constitution compliance: the change does not violate any principle
   defined in this document.
2. Contract alignment: API behavior matches the OpenAPI spec and the
   examples in `documentation/api.md`.
3. Validation coverage: request, domain, and transaction-time validation
   are all present for mutation flows.
4. Atomicity: batch and apply paths are all-or-nothing.
5. Observability: new flows emit structured logs and relevant metrics.
6. No silent defaults: timeouts, limits, and retry behavior are
   explicit.
7. Documentation sync: if the change modifies API surface, validation
   rules, or non-functional behavior, the corresponding documentation
   files are updated in the same changeset.

## Documentation Synchronization Rules

The canonical documentation set lives in `/documentation`. These
documents MUST stay synchronized:

| Document | Governs | Sync trigger |
|---|---|---|
| `openapi.yaml` | API contract shapes, paths, status codes | Any API surface change |
| `api.md` | API behavior narrative and examples | Any API surface change |
| `validation-rules.md` | Validation layers and error classification | Any validation logic change |
| `data-model.md` | Schema, DDL, field shapes, invariants | Any schema or entity change |
| `functional-spec.md` | Product behavior and acceptance criteria | Any feature behavior change |
| `non-functional-requirements.md` | Timeouts, limits, retry, observability | Any NFR change |
| `agent-context.md` | Agent context schema, LLM contract, validator | Any agent flow change |
| `test-matrix.md` | Test cases and expected results | Any behavior change that adds/alters test scenarios |
| `architecture.md` | Module layout, layer responsibilities, flows | Any architectural change |
| `roadmap.md` | Slice sequencing and dependencies | Any scope or sequencing change |

### Synchronization rules

- A changeset that modifies behavior governed by any document above
  MUST include the corresponding documentation update.
- A documentation-only change that contradicts implemented behavior
  MUST be accompanied by a code change or flagged as a known drift with
  a tracking issue.
- OpenAPI, examples, validation rules, and test matrix MUST be checked
  for consistency as part of every review that touches API or validation
  code.

## Observability and Non-Functional Expectations

### Timeout budgets (reference)

| Request class | Hard timeout | p50 target | p95 target |
|---|---|---|---|
| Fast reads | 2 s | 150 ms | 400 ms |
| Standard mutations | 5 s | 250 ms | 800 ms |
| Board hydration | 6 s | 400 ms | 1200 ms |
| Upload | 30 s | — | — |
| Agent suggest | 20 s | 4 s | 12 s |
| Agent apply | 10 s | 1.5 s | 5 s |

### LLM policy (reference)

- Single-call timeout: 12 s
- Max retries for suggest: 1
- Retries for apply execution: 0
- Total suggest budget including retries: 18 s
- Retry only transient provider failures; fail fast otherwise

### Rate limits (reference)

| Endpoint class | Limit |
|---|---|
| Reads | 120 req/min |
| Mutations | 60 req/min |
| Uploads | 20 req/min |
| Suggest | 12 req/min |
| Apply | 20 req/min |

### Observability requirements

- Structured, machine-readable logs on every request and mutation.
- Request correlation ID on every request, propagated through all
  layers.
- Metrics: HTTP request count/latency by route, DB query latency,
  agent call latency/retry/invalid-output counts, upload counts/sizes.
- Error reporting for unexpected server errors with stack trace,
  request ID, board ID, and environment.
- Validation failures are logged and counted but MUST NOT flood error
  reporting as critical exceptions.

## Future Compatibility

All future work MUST stay compatible with the MVP architecture by
following these rules:

- New features MUST be additive. They MUST NOT require redesigning core
  tables, the operations log, or the revision model.
- Authentication, multi-user support, and permissions MUST be layered
  on top of existing entities (e.g., adding `user_id` columns, board
  memberships) without restructuring the board/node/edge/operation
  schema.
- Realtime sync MUST build on the existing revision and operations
  primitives, not replace them.
- New entity types or action plan item types MUST go through the same
  validated, transactional service flow that existing types use.
- The suggest/apply separation MUST be preserved even as agent
  capabilities grow; autonomous agent writes without explicit user
  approval are out of scope unless the constitution is amended.
- Cross-board references, multi-thread chat, and advanced diagramming
  are future additions that MUST NOT be pre-built into MVP structures
  in ways that compromise current simplicity.

## Governance

This constitution is the highest-authority document for engineering
decisions in the Context Board MVP.

### Authority

- When a conflict exists between this constitution and any other
  document, this constitution prevails.
- Implementation, review, and planning activities MUST verify compliance
  with this document.

### Amendment procedure

1. Propose the amendment with a clear rationale and impact assessment.
2. Update this file with the change.
3. Increment the version according to semantic versioning:
   - MAJOR: principle removal or backward-incompatible redefinition.
   - MINOR: new principle or materially expanded guidance.
   - PATCH: clarification, wording, or non-semantic refinement.
4. Update the Sync Impact Report at the top of this file.
5. Verify that dependent templates and documentation remain consistent.
6. Include the constitution update in the same changeset as any code
   change that motivated it.

### Compliance review

- Every pull request that touches durable mutation logic, API surface,
  validation rules, or agent flows MUST include a constitution
  compliance check in the review.
- Complexity or deviation from these principles MUST be justified in
  the changeset description.

**Version**: 1.0.0 | **Ratified**: 2026-03-16 | **Last Amended**: 2026-03-16
