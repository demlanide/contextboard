# Feature Specification: Agent Suggest

**Feature Branch**: `010-agent-suggest`  
**Created**: 2026-03-17  
**Status**: Draft  
**Input**: User description: "Agent suggest — non-durable AI suggestion flow with context building, action plan validation, preview payload, prompt-entry UX, and preview UI"

## Clarifications

### Session 2026-03-17

- Q: Does the suggest prompt flow through the existing S8 chat composer or require a dedicated separate UI element? → A: Reuse the S8 chat composer. The user types in the same chat input; the system routes to the suggest endpoint when appropriate via a mode toggle or contextual routing.
- Q: When a model returns a plan where some items are valid but others reference deleted/locked/non-existent entities, should the system reject the entire plan or return it with invalid items flagged? → A: Reject the entire plan. If any action item fails validation, the whole plan is treated as invalid and no preview is shown. Consistent with apply's all-or-nothing atomicity.
- Q: What is the minimum required preview form for MVP — canvas overlay, action summary list, or both? → A: Both. Proposed changes render on the canvas with distinct visuals AND a summary list of planned actions appears in the chat/side panel.
- Q: When the board revision advances while a suggestion preview is active, should the preview be automatically cleared or kept visible with a stale indicator? → A: Keep visible but mark as stale. The preview remains with a clear stale indicator (e.g., banner, badge, or dimmed state). The user can dismiss or re-request at their discretion.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask the Agent for a Suggestion (Priority: P1)

A user is working on a board with several nodes and edges. They want the AI agent to help reorganize, group, or enhance the board content. The user types a prompt into the board's chat panel composer, optionally selects relevant nodes, and submits the request. The system analyzes the board context and returns a textual explanation along with an optional structured action plan — without changing anything on the board.

**Why this priority**: This is the core capability of the agent suggest feature. Without the ability to send a prompt and receive a validated suggestion, no other suggest behavior is useful. This story delivers the foundational round-trip: prompt in, suggestion out, board unchanged.

**Independent Test**: Can be fully tested by creating a board with nodes, submitting a suggest prompt, and verifying that the response contains assistant text, the board revision remains unchanged, and no durable board mutations occur. Delivers the core value of safe AI-assisted analysis.

**Acceptance Scenarios**:

1. **Given** an active board with nodes and edges, **When** the user submits a prompt in suggest mode, **Then** the system returns an assistant text explanation and the board revision does not change.
2. **Given** an active board with nodes, **When** the user submits a suggest prompt, **Then** the system returns a validated action plan alongside the assistant text when the agent proposes changes.
3. **Given** an active board, **When** the user submits a suggest prompt and the agent returns only textual analysis with no proposed changes, **Then** the response includes assistant text with no action plan, and no preview is generated.
4. **Given** an active board, **When** the suggest request completes, **Then** both the user prompt and the agent response are persisted as chat messages in the board's thread.

---

### User Story 2 - Review a Suggestion Preview (Priority: P1)

After receiving a suggestion, the user reviews what the agent proposes before deciding whether to act on it. The preview highlights which board entities would be affected and what new entities would be created. The preview is visually distinct from committed board content, so the user never confuses a proposal with reality.

**Why this priority**: Without a reviewable preview, the user cannot make an informed decision about applying a suggestion. Preview is what makes suggest safe and trustworthy — it transforms an opaque AI response into a transparent proposal.

**Independent Test**: Can be tested by submitting a suggest request that returns an action plan, verifying the preview data contains affected entity IDs and temp IDs for new entities, and confirming the board canvas renders preview elements distinctly from committed entities.

**Acceptance Scenarios**:

1. **Given** a suggest response with an action plan, **When** the user views the preview, **Then** the preview shows which existing nodes and edges would be affected and what new elements would be created.
2. **Given** a suggest response with preview data, **When** the preview is displayed on the canvas, **Then** preview elements are visually distinct from committed board content (e.g., different opacity, border style, or color treatment).
3. **Given** a suggest preview is visible, **When** the user inspects the board, **Then** confirmed board state remains completely unmodified — no nodes, edges, or revision values have changed.
4. **Given** a suggest response with an action plan, **When** the user dismisses the preview, **Then** all preview elements are removed and the board returns to its confirmed state.

---

### User Story 3 - Context-Aware Suggestions from Selection (Priority: P2)

A user selects specific nodes on the board before submitting a suggest prompt. The system builds context from the selection, nearby nodes, visible nodes, edges, and referenced assets, prioritizing selected entities. This context grounds the agent's response in the user's focus area rather than treating the entire board equally.

**Why this priority**: Selection-based context significantly improves the relevance and quality of agent suggestions. While suggest works without selection (using the full board), selection-aware context is what makes the agent feel focused and intelligent.

**Independent Test**: Can be tested by selecting a subset of nodes, submitting a suggest prompt, and verifying that the suggestion references or operates on the selected context. Compare with an unselected prompt to confirm different behavior.

**Acceptance Scenarios**:

1. **Given** an active board with selected nodes, **When** the user submits a suggest prompt, **Then** the agent's response is grounded in the selected nodes and their surrounding context.
2. **Given** a board with many nodes but a small selection, **When** context is built for the agent, **Then** selected nodes are prioritized, nearby nodes within proximity are included second, and visible nodes fill remaining context capacity.
3. **Given** a board where nodes contain sensitive-looking content (token-like strings, email addresses), **When** context is built for the agent, **Then** the content is sanitized before being sent to the model, and the response acknowledges that redaction occurred.

---

### User Story 4 - Handle Invalid or Failed Suggestions (Priority: P2)

The agent sometimes returns malformed output, the model service may time out, or the network may fail. The user needs to understand what happened and be able to retry without confusion. Invalid suggestions must never be presented as applicable plans, and failures must never leave the user unsure about board state.

**Why this priority**: Error handling is essential for user trust. A suggest feature that fails silently or shows broken previews will undermine confidence in the entire AI workflow. This story ensures graceful degradation.

**Independent Test**: Can be tested by simulating model failures (timeout, invalid JSON, disallowed action types) and verifying that the user sees appropriate error messages, the board remains unchanged, and retry is available.

**Acceptance Scenarios**:

1. **Given** a suggest request where the model returns invalid JSON, **When** a repair attempt also fails, **Then** the system returns an assistant message with no action plan and logs diagnostic metadata.
2. **Given** a suggest request where the model returns an action plan with disallowed action types, **When** the system validates the output, **Then** the plan is rejected and the user receives an explanation that the suggestion could not be generated.
3. **Given** a suggest request where the model service times out, **When** the total request budget is exhausted, **Then** the user sees a clear timeout error, the board state remains unchanged, and the user can retry.
4. **Given** a suggest request that fails, **When** the user views the chat thread, **Then** the user message is persisted but no invalid agent response is stored as a valid chat record.
5. **Given** a suggest request where the model returns a plan that references non-existent node IDs, **When** the system validates the output, **Then** the references are flagged and the plan is not presented as applicable.

---

### User Story 5 - Prompt Entry and Submission UX (Priority: P2)

The user enters a suggest prompt through the existing chat panel message composer. The submission experience provides clear feedback: loading state while waiting for the agent, disabled duplicate submission, and preserved prompt text on failure. The chat panel serves as the unified surface for both plain chat and suggest interactions.

**Why this priority**: A smooth prompt entry experience is important for the product to feel usable, but the underlying suggest mechanics take precedence. This story ensures baseline UX quality for the prompt workflow.

**Independent Test**: Can be tested by entering a prompt, verifying loading state appears on submission, confirming duplicate sends are prevented, and checking that prompt text is preserved on failure.

**Acceptance Scenarios**:

1. **Given** the board screen with the chat panel open, **When** the user types a prompt and submits it, **Then** a loading indicator appears and the submit action is disabled until the response arrives.
2. **Given** a suggest request in progress, **When** the user attempts to submit another prompt, **Then** the duplicate submission is prevented.
3. **Given** a suggest request that fails, **When** the error is shown, **Then** the user's prompt text is preserved so they can retry without retyping.
4. **Given** the board screen, **When** the user submits a suggest prompt, **Then** the board canvas remains interactive during the loading period (the user can pan, zoom, and select).

---

### User Story 6 - Dismiss, Retry, and Stale Suggestion Handling (Priority: P3)

After receiving a suggestion, the user may want to dismiss it, request a different suggestion by retrying with a new prompt, or discover that the suggestion is stale because the board changed since it was generated. The system handles each case without leaving preview artifacts or confusing the user about what is committed.

**Why this priority**: These are secondary interaction flows that improve polish and confidence. The core suggest/preview loop must work first, but dismiss, retry, and stale handling round out the experience.

**Independent Test**: Can be tested by generating a suggestion, dismissing it and verifying the board returns to confirmed state, retrying with a new prompt and verifying the old preview is replaced, and manually changing the board to verify stale indication behavior.

**Acceptance Scenarios**:

1. **Given** a visible suggestion preview, **When** the user explicitly dismisses the suggestion, **Then** all preview elements are removed and the board displays only confirmed state.
2. **Given** a visible suggestion preview, **When** the user submits a new suggest prompt, **Then** the previous preview is cleared and replaced by the new suggestion's preview when it arrives.
3. **Given** a suggestion based on board revision N, **When** the board is modified (revision advances to N+1) before the user acts on the suggestion, **Then** the preview remains visible but is marked with a stale indicator, and the user can dismiss or re-request at their discretion.
4. **Given** a stale or dismissed suggestion, **When** the user views the chat history, **Then** the original suggestion message remains in chat history for reference even though the preview is no longer active.

---

### Edge Cases

- What happens when the user submits an empty or whitespace-only prompt? The system rejects it with a validation error before any agent processing begins.
- What happens when the board has no nodes or edges? The system sends minimal context to the agent. The agent may return only textual analysis with no action plan.
- What happens when context truncation is required because the board has thousands of nodes? The system applies deterministic truncation: selected nodes first, then nearby, then visible. Nodes exceeding capacity are summarized via a cluster summary. The agent works with the truncated context.
- What happens when the model returns a plan with more than 200 action items? The system rejects the plan as exceeding the action count limit and returns an assistant message without a valid action plan.
- What happens when the user submits a suggest request on an archived board? The system rejects the request. Suggest is a precursor to mutation and should not be offered on read-only boards.
- What happens when the model returns valid JSON but the confidence score is very low? The system does not filter by confidence in MVP. The plan is validated structurally and returned. The user decides whether to act on it.
- What happens when the model returns a plan that includes a batch_layout action referencing a locked node? In suggest mode, structural validation catches this. The entire plan is rejected, since any invalid action item invalidates the whole plan. The user receives an explanation of what went wrong.
- What happens when a suggest request is interrupted by the user navigating away from the board? The in-flight request is abandoned by the client. No board state is affected. If the request completes on the backend, the chat messages may still be persisted but the client discards the response.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept a suggest request containing a prompt, suggest mode indicator, and optional selection context, and return an assistant text response without mutating board state.
- **FR-002**: System MUST NOT increment board revision as a result of any suggest request.
- **FR-003**: System MUST build an agent context snapshot from the board's current state including board metadata, selected nodes, nearby nodes, visible nodes, edges, and referenced asset metadata, respecting configured capacity limits.
- **FR-004**: System MUST prioritize context inclusion in this order: selected entities first, nearby entities second, visible entities third, with global board summary as fallback when truncation is needed.
- **FR-005**: System MUST sanitize board content before sending it to the model, redacting secrets-like patterns (API keys, bearer tokens), obvious PII (emails, phone numbers), and unsafe content, and MUST include a redaction summary in the context.
- **FR-006**: System MUST truncate context to fit within configured token budgets, truncating per-node content before dropping whole nodes, and replacing excess nodes with cluster summaries when capacity limits are exceeded.
- **FR-007**: System MUST validate the model's output against the allowed action plan schema: only `create_node`, `update_node`, `delete_node`, `create_edge`, `update_edge`, `delete_edge`, and `batch_layout` action types are permitted.
- **FR-008**: System MUST reject malformed or unsafe action plans returned by the model rather than passing them to the client as valid applicable plans.
- **FR-009**: System MUST return a preview payload with affected node IDs, affected edge IDs, new node temp IDs, and new edge temp IDs alongside a valid action plan.
- **FR-010**: System MUST persist the user's prompt as a user chat message and the agent's response as an agent chat message in the board's chat thread.
- **FR-011**: System MUST enforce an approximately 18-second total request budget for suggest, with at most 1 retry on transient model failures using exponential backoff with jitter.
- **FR-012**: When the model returns invalid JSON, the system MUST attempt one repair request asking for valid JSON only. If still invalid, the system MUST return an assistant message with no action plan and log diagnostic metadata.
- **FR-013**: System MUST validate that action plan items reference only existing, non-deleted, same-board entities where applicable, and that locked nodes are not targeted for mutation actions. If any single action item fails validation, the entire plan MUST be rejected — no partial plans are returned.
- **FR-014**: System MUST enforce a maximum of 200 action items per action plan.
- **FR-015**: System MUST reject suggest requests against archived or deleted boards.
- **FR-016**: System MUST validate prompt presence and enforce a maximum prompt length.
- **FR-017**: System MUST validate selection context structure when provided, including that selected node and edge ID arrays are well-formed.
- **FR-018**: System MUST reuse the existing chat panel message composer from S8 as the suggest prompt entry point. The system routes to the suggest endpoint via a mode toggle or contextual routing; no dedicated separate prompt input is required.
- **FR-019**: System MUST show a loading state while a suggest request is in progress and prevent duplicate submissions.
- **FR-020**: System MUST render the assistant's text response in the chat panel alongside other chat messages.
- **FR-021**: System MUST display preview in two forms: (1) a canvas overlay where proposed additions, modifications, and deletions render directly on the board with visually distinct treatment (e.g., different opacity, dashed borders, or color), and (2) an action summary list in the chat panel or side panel showing a structured overview of all planned actions.
- **FR-022**: System MUST provide dismiss and retry affordances for suggestions, allowing the user to clear the preview and return to confirmed board state.
- **FR-023**: System MUST keep preview state separate from confirmed board state in the frontend. Preview nodes and edges MUST NOT be written into the confirmed store.
- **FR-024**: System MUST preserve the user's prompt text on suggest failure so the user can retry without retyping.
- **FR-025**: When a suggest request fails (model error, timeout, or validation failure), the system MUST persist the user message but MUST NOT persist an invalid agent response as a valid chat record.
- **FR-026**: When the board's confirmed state changes (revision advances) after a suggestion was generated, the system MUST keep the preview visible but mark it with a clear stale indicator (e.g., banner, badge, or dimmed treatment). The user may dismiss or re-request at their discretion; the preview is not automatically cleared.
- **FR-027**: System MUST NOT include raw binary image data in the agent context snapshot. Image nodes MUST be represented by thumbnail URLs, captions, extracted text, and processing status.

### Key Entities

- **Agent Context Snapshot**: A structured, sanitized, token-budget-aware representation of the board's current state sent to the model. Contains board metadata, selected/nearby/visible nodes projected into an LLM-friendly shape, edges, referenced asset metadata, system notes, and sanitization summaries. Respects configured capacity limits for each context level.
- **Action Plan**: A validated list of structured edit instructions proposed by the agent. Each item specifies an allowed action type and the associated payload. The plan is non-durable in suggest mode — it exists only as a preview proposal until explicitly applied through a separate endpoint.
- **Action Plan Item**: An individual instruction within an action plan. Allowed types are: create_node, update_node, delete_node, create_edge, update_edge, delete_edge, and batch_layout. Each type has a defined payload schema.
- **Preview Payload**: Metadata describing what a valid action plan would affect if applied. Contains lists of affected node IDs, affected edge IDs, new node temp IDs, and new edge temp IDs. Used by the frontend to render the preview overlay.
- **Suggest Response**: The complete response returned by the suggest endpoint. Contains the persisted agent chat message (with assistant text and optional structured action plan), the validated action plan, and the preview payload.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can submit a suggest prompt and receive an assistant response with preview data within 15 seconds for typical boards (up to 500 nodes), measured from prompt submission to response render.
- **SC-002**: 100% of suggest requests leave the board revision unchanged, verifiable by comparing revision before and after the suggest call.
- **SC-003**: Users can visually distinguish between preview elements and committed board content on first viewing, without any additional explanation.
- **SC-004**: Invalid model output (malformed JSON, disallowed action types, invalid references) is rejected in 100% of cases rather than being presented as an applicable plan.
- **SC-005**: Users can complete the full suggest-review-dismiss cycle (prompt, preview, dismiss) without any residual preview artifacts remaining on the board.
- **SC-006**: Sensitive content (secrets, PII) present in board nodes is redacted before being sent to the model, with zero instances of raw secrets appearing in model requests.
- **SC-007**: Suggest request failures (timeout, model error, validation rejection) communicate what happened and whether the board changed, allowing the user to retry or move on without confusion.
- **SC-008**: Context building for a board with 5,000 nodes completes within 2 seconds, with deterministic truncation producing consistent results for the same board state.

## Assumptions

- The chat thread and message persistence infrastructure exists from prior slices (S8 / 009-chat-persistence). This feature extends chat with the suggest endpoint and structured action plan data.
- Node, edge, and asset CRUD capabilities are fully operational from prior slices (S4, S5, S7). The suggest feature reads these entities for context building but does not create, modify, or delete them.
- The board state hydration endpoint is available and returns the current confirmed state. The suggest flow reads from the same data source for context building.
- The LLM provider integration can be stubbed for automated testing. The suggest feature is responsible for orchestrating the model call, not for the quality of the model's reasoning.
- Image assets may have varying processing statuses (ready, processing, failed). The context builder includes whatever metadata is available and indicates processing status where applicable.
- The frontend state management infrastructure (normalized store, sync layer, preview state separation) is established from prior frontend slices.

## Scope Boundaries

### In Scope
- POST endpoint for board-scoped agent suggest
- Agent context snapshot construction from board, selection, nearby/visible nodes, edges, and assets
- Context sanitization and truncation to token budgets
- Model output validation against allowed action plan schema
- Preview payload generation for valid action plans
- Suggest response including assistant text, action plan, and preview
- Chat message persistence for suggest prompts and responses
- Prompt entry UX in the board screen
- Assistant response rendering in the chat panel
- Preview UI for proposed changes on the board canvas
- Dismiss, retry, and stale-suggestion handling in the interface
- LLM timeout and retry policy for suggest

### Explicitly Out of Scope
- Durable apply behavior (committing suggested changes to the board — covered by S10 / 011-agent-apply)
- Final transaction commit of suggested actions
- Operations polling (covered by S11)
- Recovery/snapshot features unless required by suggest diagnostics only
- Multiple concurrent suggest requests per board
- Streaming/progressive model responses
- User-editable action plans (modifying individual plan items before apply)
- Autonomous agent behavior without user prompt
- Cross-board suggestions
