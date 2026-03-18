# Research: Agent Suggest

## R1: Suggest uses read-only board access — no withBoardMutation

**Decision**: The suggest flow reads board state through existing repos (nodes, edges, assets) using standard `SELECT` queries. It does NOT use `withBoardMutation` and does NOT acquire the per-board advisory lock. Chat messages are persisted using the existing S8 `withTransaction` pattern.

**Rationale**: Constitution Principle II requires that revision increments only for durable board-state mutations. Suggest is explicitly non-durable for board state (FR-002). Acquiring the advisory lock would block concurrent user edits during the potentially slow LLM call (up to 18s), creating an unacceptable UX bottleneck. Reading board state outside a mutation transaction is safe because suggest results are advisory — stale reads do not compromise correctness since the plan is re-validated at apply time (S10).

**Alternatives considered**:
- `withBoardMutation`: Would serialize suggest with user edits. Rejected because suggest does not mutate board state and would block edits for up to 18s.
- Snapshot isolation read: Considered but unnecessary for MVP single-user. Standard read consistency is sufficient.

## R2: LLM client — stubbable wrapper with timeout and retry

**Decision**: Replace `agent-stub.ts` with `agent/llm-client.ts` exporting `callLLM(prompt: string, snapshot: AgentContextSnapshot): Promise<LLMRawResponse>`. In MVP/CI, this uses a configurable stub that returns canned responses. In production, it wraps the OpenAI SDK (or fetch-based client) with explicit timeout and retry logic. The stub/real switch is controlled by `env.LLM_PROVIDER` (`stub` | `openai`).

**Rationale**: The spec requires an approximately 18s total budget with at most 1 retry (FR-011). The existing `agent-stub.ts` has the right idea (configurable timeout) but lacks retry logic, JSON repair, and the structured response shape needed for action plan validation. A thin wrapper with explicit timeout (12s per call), exponential backoff with jitter for the single retry, and a `stub` mode for testing keeps the agent module isolated (Constitution Principle VIII) while being production-ready.

**Alternatives considered**:
- Direct OpenAI SDK usage in service: Rejected because LLM concerns must stay in the agent module (Principle VIII). A wrapper enables stub testing without mocking SDK internals.
- No retry: Rejected because transient provider failures are common and one retry within the 18s budget is specified by the NFR and FR-011.

## R3: Context builder — spatial proximity via bounding box comparison

**Decision**: The context builder computes "nearby" nodes using bounding box distance from selected nodes. A configurable proximity radius (default 800px) defines the nearby boundary. Nodes whose bounding box center falls within the radius of any selected node's center are classified as nearby. Viewport intersection (visible nodes) uses a simple AABB overlap test.

**Rationale**: The agent-context.md source doc suggests "800px radius" for nearby and "bbox comparisons" as the initial approach. For MVP, computing Euclidean distance between node centers and comparing against the radius is O(N) and sufficient for 5,000 nodes within the 2s context-build target (SC-008). The context builder runs these comparisons in-memory after fetching node geometry from the DB.

**Alternatives considered**:
- Database-level spatial queries (PostGIS): Overly complex for MVP. Adds a dependency for a simple proximity check that can be done in-memory.
- No spatial awareness: Would treat all nodes equally. Rejected because context priority (selected → nearby → visible) is a core requirement (FR-004).

## R4: Context truncation — deterministic, content-first trimming

**Decision**: Truncation proceeds in phases: (1) truncate per-node text content to fit token budget, starting from lowest-priority nodes (visible → nearby → selected); (2) if still over budget, drop lowest-priority nodes entirely; (3) replace dropped nodes with a `clusterSummary` entry. Node ordering within each priority tier is deterministic (sorted by node ID) to ensure reproducible results for the same board state.

**Rationale**: FR-006 specifies "truncating per-node content before dropping whole nodes." SC-008 requires "deterministic truncation producing consistent results." Sorting by ID within tiers ensures that the same board state always produces the same context snapshot, which aids debugging and testing.

**Alternatives considered**:
- Drop nodes before truncating content: Rejected because FR-006 explicitly prioritizes content truncation first.
- Random sampling: Rejected because it violates the determinism requirement (SC-008).

## R5: Sanitizer — regex-based pattern redaction

**Decision**: The sanitizer scans text content for secrets-like patterns (API keys, bearer tokens, AWS keys, private URLs) and PII patterns (email addresses, phone numbers) using configurable regex rules. Matched content is replaced with `[REDACTED:<kind>]` placeholders. A `sanitization.redactionSummary` array records the count of each redaction kind without storing the original content.

**Rationale**: FR-005 requires sanitization before model calls. The agent-context.md source doc specifies redaction of "secrets-like patterns, obvious PII" with a summary. Regex-based pattern matching is simple, fast, and sufficient for MVP. The redaction summary enables debugging (log that 2 emails were redacted) without leaking the actual content.

**Alternatives considered**:
- NLP-based entity detection: Overly complex for MVP. Regex handles the most common patterns.
- No sanitization: Rejected because FR-005 mandates it and SC-006 requires zero raw secrets in model requests.

## R6: Output validator — strict schema check then reference validation

**Decision**: Output validation proceeds in two phases: (1) **Schema validation** — parse LLM JSON response against Zod schema matching the expected LLM output shape (explanation, confidence, actionPlan array, preview). Validate action types against the allow-list. Validate per-action payload shapes. (2) **Reference validation** — for each action item, verify referenced entity IDs exist, are not deleted, belong to the same board, and are not locked. If any item fails either phase, the entire plan is rejected (per clarification).

**Rationale**: FR-007 requires allow-list validation. FR-013 requires reference validation against current state. The clarification session confirmed whole-plan rejection on any invalid item. Two-phase validation (schema first, then DB-backed reference checks) avoids unnecessary DB queries for structurally invalid plans.

**Alternatives considered**:
- Partial plan acceptance: Rejected per clarification — entire plan must be valid or entirely rejected.
- Schema validation only (skip reference checks): Rejected because FR-013 requires reference validation against current board state.

## R7: Preview builder — compute affected IDs from valid plan

**Decision**: After successful validation, the preview builder traverses the action plan and extracts: `affectedNodeIds` (existing nodes targeted by update/delete/batch_layout), `affectedEdgeIds` (existing edges targeted by update/delete), `newNodeTempIds` (temp IDs from create_node actions), `newEdgeTempIds` (temp IDs from create_edge actions). This metadata is returned alongside the action plan in the suggest response.

**Rationale**: FR-009 requires preview metadata. The OpenAPI `Preview` schema defines these four arrays. The preview builder is a pure function over a validated action plan — no DB access needed. This keeps preview computation fast and side-effect-free.

**Alternatives considered**:
- Client-side preview computation: Rejected because the backend already has the validated plan and can compute preview metadata cheaply. Centralizing it avoids duplicated logic.

## R8: Frontend preview state — separate agent slice in Zustand store

**Decision**: Add an `agent` slice to the existing Zustand board store containing: `promptDraft`, `latestSuggestion` (action plan + preview + message), `suggestStatus` ('idle' | 'running' | 'error'), `previewVisible`, `previewStale`, `suggestionBoardRevision` (the revision at which the suggestion was generated). Preview nodes and edges are derived at render time from the action plan — they are never written into `nodesById` or `edgesById`.

**Rationale**: FR-023 requires preview state to be separate from confirmed board state. The frontend-state-sync.md doc recommends this exact pattern. Storing the revision at suggestion time enables stale detection (FR-026) by comparing against current `board.revision`. The `previewStale` flag is set when `board.revision > suggestionBoardRevision`.

**Alternatives considered**:
- Merge preview entities into confirmed store with a flag: Rejected because FR-023 explicitly forbids writing preview entities into the confirmed store.
- Separate Zustand store for agent: Considered but unnecessary. A slice within the existing board store is simpler and already has access to board revision for stale detection.

## R9: Suggest mode routing — mode toggle in chat composer

**Decision**: The existing chat panel message composer gains a mode toggle (chat vs. suggest). When in suggest mode, the submit action calls the `POST /boards/:boardId/agent/actions` endpoint instead of the chat message endpoint. The current selection context is captured from the board store at submit time. The mode toggle is a simple UI control (button group or dropdown) in the composer area.

**Rationale**: Clarification confirmed reusing the S8 chat composer as the suggest entry point. A mode toggle keeps the interaction model simple (one place to type) while clearly differentiating plain chat from suggest requests. The mode toggle aligns with the existing `board.settings.agentEditMode` field, which already supports `suggest` and `apply` values.

**Alternatives considered**:
- Automatic intent detection: Rejected for MVP — adds unpredictability. An explicit toggle is more trustworthy.
- Separate prompt area: Rejected per clarification — reuse the chat composer.

## R10: Canvas preview overlay — layered rendering

**Decision**: The board canvas gains a preview overlay layer that renders above confirmed entities. Preview nodes use reduced opacity (0.6) and dashed borders. Preview edges use dashed stroke. Modified existing entities are highlighted with a colored border. Deleted entities are shown with strikethrough/crossed-out styling. The overlay is derived from the action plan at render time and is cleared on dismiss.

**Rationale**: FR-021 requires both canvas overlay and action summary list (per clarification). SC-003 requires users to distinguish preview from confirmed content on first viewing. Reduced opacity and dashed borders are standard visual conventions for "proposed" or "draft" elements. Rendering the overlay as a separate layer ensures confirmed entities are never modified.

**Alternatives considered**:
- Inline modification of confirmed entities with preview flag: Rejected because FR-023 forbids writing preview state into confirmed store.
- Modal preview (separate screen): Rejected because the user needs spatial context to evaluate the suggestion.
