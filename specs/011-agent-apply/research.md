# Research: Agent Apply (011-agent-apply)

## Decision 1: Duplicate-apply idempotency

- **Decision**: Derive an idempotency key as a deterministic hash of the normalized action plan plus the current board revision, and treat identical keys within a bounded retention window as the same apply attempt.
- **Rationale**: This avoids extra client bookkeeping while ensuring that retries or duplicate submissions for the same logical plan and board state cannot be applied more than once. Including the board revision ensures that legitimate changes to either the plan or underlying state naturally produce a new key, aligning with revision-as-sync semantics.
- **Alternatives considered**:
  - **Client-supplied plan IDs**: More flexible but pushes additional state management and collision handling to the client; easier to misuse and harder to enforce consistently.
  - **Server-issued apply IDs at preview time**: Works but introduces an extra round of coordination and storage for preview/apply linkage; the hash approach keeps apply mostly stateless with respect to preview.
  - **Rely only on locking/transactions**: Would reduce accidental duplication but cannot reliably prevent repeated logical applies for idempotent operations and provides weaker guarantees for users.

## Decision 2: Plan size and complexity limits

- **Decision**: Enforce explicit caps on per-apply operation count and payload size (configured limits), and reject plans that exceed those limits with a clear, user-visible error instructing users to split the change into smaller applies.
- **Rationale**: Bounded batch size protects apply latency, transaction lock duration, and database resource usage, while providing a predictable UX. It keeps apply aligned with constitution expectations for explicit budgets and avoids premature complexity in automatic multi-batch splitting.
- **Alternatives considered**:
  - **No explicit caps**: Risks unbounded transactions, long-running applies, and lock contention that would degrade reliability and violate timeout budgets.
  - **Very small caps only**: Overly constrains the agent and forces many separate applies even for reasonable changes, reducing usefulness.
  - **Automatic multi-batch splitting**: Valuable long-term but significantly more complex to design correctly with respect to revision, operations, and UX; deferred beyond this MVP slice.

## Decision 3: User-visible error detail vs logs

- **Decision**: Present concise, human-readable summaries with high-level reasons and stable error codes in apply error responses, while recording full technical details (validation output, internal IDs, stack traces) only in server-side logs.
- **Rationale**: This gives users enough information to correct issues (e.g., “some nodes are locked”, “plan no longer matches current board”) without exposing sensitive implementation details or internal identifiers, and aligns with the constitution’s emphasis on observability and explicit budgets without sacrificing UX.
- **Alternatives considered**:
  - **Highly technical messages in UI**: Improves debuggability for engineers but is confusing for most users and risks leaking internal information.
  - **Very generic messages only**: Safe but unhelpful; forces users to guess what went wrong and increases support burden.
  - **Role-based detail**: Potentially useful in future (e.g., admin vs end user) but adds complexity not required for the MVP scope.

## Decision 4: Apply vs suggest separation and reuse of mutation infrastructure

- **Decision**: Implement agent apply as a dedicated backend flow that reuses the same transactional mutation and operations-logging infrastructure as manual edits, while keeping suggest strictly read-only and revision-free.
- **Rationale**: This preserves a single authoritative mutation path, keeps revision semantics consistent, and fulfills the constitution’s Suggest/Apply Separation and Operations-First Mutation Model principles.
- **Alternatives considered**:
  - **Separate mutation stack for apply**: Would duplicate logic and increase risk of divergence in validation, revision, and operations behavior.
  - **Allow suggest to mutate**: Violates the constitution, complicates user understanding, and undermines auditability and control.

