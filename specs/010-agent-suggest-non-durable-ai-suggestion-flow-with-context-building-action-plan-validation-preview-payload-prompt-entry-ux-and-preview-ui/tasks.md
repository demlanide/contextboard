# Tasks: Agent Suggest

**Input**: Design documents from `/specs/010-agent-suggest-.../`
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

**Purpose**: Extend configuration with agent suggest limits and LLM provider environment variables.

- [X] T001 Add agent suggest limits to backend/src/config/limits.ts — agent.promptText { min: 1, max: 20_000 }, agent.maxActionItems: 200, agent.maxSelectedNodes: 50, agent.maxNearbyNodes: 100, agent.maxVisibleNodes: 200, agent.maxEdges: 200, agent.maxTokensTotal: 8000, agent.maxTokensContent: 6000, agent.nearbyRadiusPx: 800, agent.selectionMaxNodeIds: 100, agent.selectionMaxEdgeIds: 100
- [X] T002 Add LLM provider config to backend/src/config/env.ts — LLM_PROVIDER ('stub' | 'openai', default 'stub'), LLM_CALL_TIMEOUT_MS (default 12000), LLM_TOTAL_BUDGET_MS (default 18000), LLM_MAX_RETRIES (default 1), OPENAI_API_KEY (optional), OPENAI_MODEL (default 'gpt-4o'), SUGGEST_REQUEST_TIMEOUT_MS (default 20000), SUGGEST_RATE_LIMIT (default 12)

**Checkpoint**: Configuration extended with all agent limits and LLM provider settings.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core backend types, schemas, LLM client, preview builder, and frontend API client/types that MUST exist before any user story endpoint can work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 [P] Create agent module types in backend/src/agent/types.ts — AgentContextSnapshot (meta, board, selection, nodes, edges, assets, artifacts, sanitization per data-model.md), ContextLimits, NodeProjection (id, type, geometry, zIndex, content, metadata, provenance), EdgeProjection, AssetProjection, ClusterSummary, RedactionEntry, SystemNote, LLMRawResponse (explanation, confidence, actionPlan, preview), all matching data-model.md shapes exactly
- [X] T004 [P] Create Zod schemas in backend/src/schemas/agent.schemas.ts — AgentActionsRequestSchema (prompt: string 1–20000, mode: z.enum(['suggest','apply']), selectionContext: optional with selectedNodeIds string[] max 100, selectedEdgeIds string[] max 100, viewport {x,y,zoom}), ActionPlanItemSchema (discriminated union on type for create_node, update_node, delete_node, create_edge, update_edge, delete_edge, batch_layout per data-model.md), LLMOutputSchema (explanation string, confidence number, actionPlan ActionPlanItemSchema[], preview object), PreviewPayloadSchema (affectedNodeIds, affectedEdgeIds, newNodeTempIds, newEdgeTempIds string arrays), AgentActionsResponseSchema matching OpenAPI AgentActionsResponse (message ChatMessage, actionPlan ActionPlanItem[], preview PreviewPayload)
- [X] T005 [P] Create LLM client in backend/src/agent/llm-client.ts — export callLLM(prompt: string, snapshot: AgentContextSnapshot, opts: { timeoutMs, totalBudgetMs, maxRetries }): Promise<LLMRawResponse>; when env.LLM_PROVIDER='stub' return canned response (explanation acknowledging prompt, empty actionPlan, empty preview); when 'openai' call OpenAI chat completions with JSON mode, system prompt instructing output schema, timeout via AbortController; basic single-call path only (retry logic added in US4)
- [X] T006 [P] Create preview builder in backend/src/agent/preview-builder.ts — export buildPreview(actionPlan: ActionPlanItem[]): PreviewPayload; traverse plan items, collect affectedNodeIds from update_node/delete_node/batch_layout, affectedEdgeIds from update_edge/delete_edge, newNodeTempIds from create_node tempIds, newEdgeTempIds from create_edge tempIds; pure function, no DB access
- [X] T007 [P] Create suggest API client in frontend/src/api/agent.api.ts — export submitSuggest(boardId: string, prompt: string, mode: 'suggest', selectionContext?: SelectionContext): Promise<AgentActionsResponse>; POST to /api/boards/${boardId}/agent/actions; use existing apiRequest base from api/client.ts; timeout from frontend env
- [X] T008 [P] Add agent types to frontend/src/store/types.ts — ActionPlanItem (discriminated union matching backend), ActionPlanCreateNode, ActionPlanUpdateNode, ActionPlanDeleteNode, ActionPlanCreateEdge, ActionPlanUpdateEdge, ActionPlanDeleteEdge, ActionPlanBatchLayout, PreviewPayload (affectedNodeIds, affectedEdgeIds, newNodeTempIds, newEdgeTempIds), AgentSuggestion (message: ChatMessage, actionPlan: ActionPlanItem[], preview: PreviewPayload, boardRevision: number), AgentState (suggestStatus: 'idle'|'running'|'error', latestSuggestion: AgentSuggestion|null, previewVisible: boolean, previewStale: boolean, suggestError: SyncError|null)

**Checkpoint**: Foundation ready — types, schemas, LLM stub, preview builder, frontend API client and types all available.

---

## Phase 3: User Story 1 — Ask the Agent for a Suggestion (Priority: P1) 🎯 MVP

**Goal**: User submits a suggest prompt and receives an assistant text response with an optional validated action plan and preview metadata. Board revision remains unchanged. Both prompt and response are persisted as chat messages.

**Independent Test**: Create a board with nodes, submit a suggest prompt via POST /api/boards/:boardId/agent/actions with mode=suggest, verify response contains assistant text + actionPlan + preview, verify board revision unchanged before/after, verify chat messages persisted in GET /boards/:boardId/chat.

### Implementation for User Story 1

- [X] T009 [P] [US1] Create basic context builder in backend/src/agent/context-builder.ts — export buildContextSnapshot(boardId, boardRevision, selectionContext, { client }): Promise<AgentContextSnapshot>; fetch board metadata, fetch all non-deleted nodes for the board via nodes.repo, project each to NodeProjection shape (id, type, geometry, zIndex, content.text, metadata.locked/hidden/aiGenerated/tags, provenance); fetch all non-deleted edges via edges.repo, project to EdgeProjection; fetch referenced asset metadata via assets.repo, project to AssetProjection (thumbnailUrl, aiCaption, extractedText, processingStatus — no binary data per FR-027); place all nodes in nodes.visible for now (spatial priority added in US3); populate meta with boardId, boardRevision, mode='suggest', requestId, generatedAt, limits from config; return assembled snapshot
- [X] T010 [P] [US1] Create output validator in backend/src/agent/output-validator.ts — export validateLLMOutput(raw: unknown): { valid: true, parsed: ValidatedLLMOutput } | { valid: false, reasons: string[] }; parse raw against LLMOutputSchema from agent.schemas.ts; check actionPlan.length ≤ limits.agent.maxActionItems; check all action types in allow-list; validate per-type payload shapes; export validateActionPlanReferences(plan: ActionPlanItem[], boardId: string, { client }): Promise<{ valid: true } | { valid: false, reasons: string[] }>; for each update_node/delete_node: verify node exists, not deleted, same board, not locked; for each batch_layout item: same checks; for each update_edge/delete_edge: verify edge exists, not deleted, same board; for create_edge: verify source/target are existing node IDs or tempIds from earlier create_node items; if ANY item fails, return all reasons (entire plan rejected per clarification)
- [X] T011 [P] [US1] Create action plan validation rules in backend/src/domain/validation/action-plan-rules.ts — export ALLOWED_ACTION_TYPES constant array; export assertActionTypeAllowed(type: string): void throwing INVALID_ACTION_TYPE; export assertNodeMutable(node: { id, boardId, deleted, locked }, expectedBoardId: string): void throwing reference errors for deleted/wrong-board/locked; export assertEdgeMutable(edge: { id, boardId, deleted }, expectedBoardId: string): void; these are called by output-validator for reference validation
- [X] T012 [US1] Create agent service in backend/src/services/agent.service.ts — export suggest(boardId, prompt, selectionContext, requestId): Promise<SuggestResult>; withTransaction: validate board exists + active + not archived (reuse chat-rules.assertBoardChatWritable), load chat thread, persist user message (sender_type=user, message_text=prompt, selection_context); then outside transaction: build context snapshot via context-builder, call LLM via llm-client.callLLM with prompt + snapshot, validate LLM output via output-validator.validateLLMOutput, if schema valid then validateActionPlanReferences, if references valid then buildPreview; persist agent message (sender_type=agent, message_text=explanation, message_json={actionPlan, confidence}); return { message, actionPlan, preview }; on any agent error: persist agent message with explanation-only text and no plan, return empty plan + empty preview
- [X] T013 [US1] Create agent controller in backend/src/http/controllers/agent.controller.ts — export suggestHandler: validate boardId UUID from params, parse body with AgentActionsRequestSchema (assert mode='suggest'), call agent.service.suggest, return successResponse({ message, actionPlan, preview }) matching contracts/agent-suggest-endpoint.md; on agent error include error envelope with code (AGENT_TIMEOUT, ACTION_PLAN_INVALID, AGENT_UNAVAILABLE); handle BOARD_NOT_FOUND (404), BOARD_ARCHIVED (409), VALIDATION_ERROR (422)
- [X] T014 [US1] Register suggest route in backend/src/http/router.ts — add POST /boards/:boardId/agent/actions route pointing to agent.controller.suggestHandler; place before existing boardId catch-all routes
- [X] T015 [US1] Add agent state slice to frontend/src/store/board.store.ts — add agentState: AgentState to store with defaults (suggestStatus='idle', latestSuggestion=null, previewVisible=false, previewStale=false, suggestError=null); add actions: setSuggestStatus, setLatestSuggestion(suggestion), clearSuggestion(), setSuggestError; add resetAgent in existing reset() flow; add computed stale detection: when board.revision changes, if latestSuggestion exists and latestSuggestion.boardRevision < board.revision then set previewStale=true
- [X] T016 [US1] Create useSuggest hook in frontend/src/hooks/useSuggest.ts — export useSuggest(boardId: string); submitSuggest(prompt, selectionContext?): set suggestStatus='running', call agent.api.submitSuggest, on success set latestSuggestion with current board.revision as boardRevision + set previewVisible=true + set suggestStatus='idle' + append agent message to chatState.messages, on error set suggestStatus='error' + set suggestError; expose suggestStatus, latestSuggestion, previewVisible, previewStale, suggestError, submitSuggest
- [X] T017 [US1] Wire suggest response rendering into chat panel in frontend/src/components/layout/ChatSidebar.tsx — when a suggest response arrives (agent message with actionPlan in messageJson), render the assistant text in the chat message list using the existing MessageBubble; ensure the user's suggest prompt also appears as a user message in the list; no preview rendering yet (US2)

**Checkpoint**: `POST /api/boards/:boardId/agent/actions` with mode=suggest returns assistant text + actionPlan + preview. Board revision unchanged. Chat messages persisted. Frontend shows suggest responses in chat panel. Stub LLM returns canned responses.

---

## Phase 4: User Story 2 — Review a Suggestion Preview (Priority: P1)

**Goal**: After receiving a suggestion with an action plan, the user sees proposed changes rendered on the canvas with visually distinct treatment (dashed borders, reduced opacity) and an action summary list in the chat panel. Preview state is completely separate from confirmed board state.

**Independent Test**: Submit a suggest request that returns an action plan, verify preview overlay renders on canvas with distinct styling, verify action summary list appears in chat panel, verify confirmed board state (nodesById, edgesById) is unmodified, dismiss preview and verify canvas returns to confirmed state.

### Implementation for User Story 2

- [X] T018 [P] [US2] Create PreviewNode component in frontend/src/components/canvas/PreviewNode.tsx — render a single preview node derived from an ActionPlanCreateNode or ActionPlanUpdateNode item; for create: render at specified x,y,width,height with content text, styled with 0.6 opacity and 2px dashed blue border; for update: render a highlight overlay on the affected node position showing the patch diff with dashed amber border; for delete: render a strikethrough overlay with red dashed border and 0.4 opacity; accept actionType ('create'|'update'|'delete') and geometry/content props
- [X] T019 [P] [US2] Create PreviewEdge component in frontend/src/components/canvas/PreviewEdge.tsx — render a single preview edge; for create: render dashed line between source/target positions with 0.6 opacity and blue color; for delete: render dashed red line with strikethrough indicator; accept actionType and source/target coordinates
- [X] T020 [US2] Create PreviewOverlay component in frontend/src/components/canvas/PreviewOverlay.tsx — read latestSuggestion.actionPlan from board store agentState; derive preview elements: for each create_node → render PreviewNode(type='create'), for each update_node → look up node position from nodesById and render PreviewNode(type='update') with patch, for each delete_node → look up node and render PreviewNode(type='delete'), for each create_edge → render PreviewEdge(type='create'), for each delete_edge → render PreviewEdge(type='delete'), for each batch_layout item → render PreviewNode(type='update') showing position change; only render when agentState.previewVisible=true; render as a layer above confirmed board entities but below UI controls
- [X] T021 [P] [US2] Create ActionSummaryList component in frontend/src/components/chat/ActionSummaryList.tsx — render a structured list of planned actions from actionPlan; group by type: "Create N nodes", "Update N nodes", "Delete N nodes", "Create N edges", "Delete N edges", "Reposition N nodes"; each item shows action type icon and brief description; render below the agent message in the chat panel when actionPlan is non-empty
- [X] T022 [US2] Integrate PreviewOverlay into BoardScreen in frontend/src/components/board/BoardScreen.tsx — import PreviewOverlay, render it as a child of the canvas container positioned above the existing node/edge layers; only render when agentState.latestSuggestion is not null and agentState.previewVisible is true
- [X] T023 [US2] Add dismiss preview action to useSuggest in frontend/src/hooks/useSuggest.ts — export dismissPreview(): call store.clearSuggestion() which sets latestSuggestion=null, previewVisible=false, previewStale=false; wire a "Dismiss" button in ActionSummaryList that calls dismissPreview

**Checkpoint**: Preview overlay renders proposed changes on canvas with distinct visual treatment. Action summary list appears in chat panel. Confirmed board state unmodified. Dismiss clears all preview artifacts.

---

## Phase 5: User Story 3 — Context-Aware Suggestions from Selection (Priority: P2)

**Goal**: When the user selects nodes before submitting a suggest prompt, the system builds prioritized context (selected → nearby → visible) with sanitization and truncation. This grounds the agent's response in the user's focus area.

**Independent Test**: Select a subset of nodes, submit suggest, verify the context snapshot sent to the LLM prioritizes selected nodes. Test with a board containing PII patterns and verify redaction. Test with 5000+ nodes and verify truncation produces deterministic results within 2 seconds.

### Implementation for User Story 3

- [X] T024 [P] [US3] Add spatial query helpers to backend/src/repos/nodes.repo.ts — export findNodesByBoardId(client, boardId): Promise<NodeRow[]> returning all non-deleted nodes with geometry; export findNodeGeometryByIds(client, nodeIds): Promise<Pick<NodeRow, 'id'|'x'|'y'|'width'|'height'>[]> for quick geometry lookups for proximity calculation
- [X] T025 [P] [US3] Add edge context query to backend/src/repos/edges.repo.ts — export findEdgesByBoardId(client, boardId): Promise<EdgeRow[]> returning all non-deleted edges for context builder; filter to edges where both source and target nodes exist
- [X] T026 [P] [US3] Add asset metadata query to backend/src/repos/assets.repo.ts — export findAssetMetadataByNodeIds(client, nodeIds): Promise<AssetMetadataRow[]> returning id, node_id, thumbnail_url, ai_caption, extracted_text, processing_status for referenced nodes; no binary data
- [X] T027 [P] [US3] Create sanitizer in backend/src/agent/sanitizer.ts — export sanitizeSnapshot(snapshot: AgentContextSnapshot): AgentContextSnapshot; scan all node content.text fields for secrets-like patterns (regex: API keys /(?:sk|pk|api)[_-]?[a-zA-Z0-9]{20,}/, bearer tokens /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/, AWS keys /AKIA[0-9A-Z]{16}/) and PII (emails /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, phone numbers /\+?[\d\s\-()]{10,}/); replace matches with [REDACTED:email], [REDACTED:token], [REDACTED:url]; accumulate redactionSummary with counts per kind; set sanitization.piiRemoved and secretsRedacted flags; return sanitized copy (do not mutate input)
- [X] T028 [US3] Extend context builder with spatial priority and truncation in backend/src/agent/context-builder.ts — implement context levels: (1) selected: nodes whose IDs are in selectionContext.selectedNodeIds, up to maxSelectedNodes, sorted by ID; (2) nearby: nodes whose center is within nearbyRadiusPx of any selected node center (Euclidean distance), excluding selected, up to maxNearbyNodes, sorted by ID; (3) visible: nodes intersecting viewport bounding box (AABB overlap with selectionContext.viewport), excluding selected and nearby, up to maxVisibleNodes, sorted by ID; implement truncation per research.md R4: first truncate per-node content.text starting from visible→nearby→selected, then drop whole nodes from visible→nearby if still over budget, replace dropped with ClusterSummary; apply sanitizer to final snapshot; ensure deterministic output (sorted by ID within tiers)
- [X] T029 [US3] Wire selection context capture into useSuggest in frontend/src/hooks/useSuggest.ts — on submitSuggest, read ui.selectedNodeIds, ui.selectedEdgeId (normalize to array), and viewport state from board store; package as selectionContext object matching the API schema; pass to agent.api.submitSuggest; if no selection, send without selectionContext (agent uses full board context)

**Checkpoint**: Context builder produces prioritized, sanitized, truncated snapshots. Selected nodes appear first in context. PII redacted. Truncation deterministic. Frontend captures selection at submit time.

---

## Phase 6: User Story 4 — Handle Invalid or Failed Suggestions (Priority: P2)

**Goal**: When the model returns malformed output, times out, or produces an invalid plan, the system degrades gracefully. The user sees a clear error message, the board remains unchanged, and the prompt text is preserved for retry.

**Independent Test**: Simulate model timeout (configure short timeout), verify error response with code AGENT_TIMEOUT. Submit with stub returning invalid JSON, verify JSON repair attempt then graceful failure. Submit with stub returning disallowed action type, verify plan rejection with ACTION_PLAN_INVALID. Verify user message always persisted. Verify prompt text preserved in frontend on error.

### Implementation for User Story 4

- [X] T030 [US4] Extend LLM client with retry and JSON repair in backend/src/agent/llm-client.ts — add retry logic: on transient failure (network error, 5xx, timeout), retry once with exponential backoff + jitter (base 1s, jitter ±500ms), respecting totalBudgetMs; add JSON repair: if LLM returns invalid JSON, send one repair request ("Please return only valid JSON matching the schema"), parse result; if still invalid return { valid: false, rawText }; track attempt count and elapsed time; log each attempt with duration and outcome
- [X] T031 [US4] Extend agent service with comprehensive error handling in backend/src/services/agent.service.ts — wrap LLM call in try/catch; on timeout: persist agent message with text "I wasn't able to generate suggestions in time. Please try again." and empty plan, return error code AGENT_TIMEOUT; on invalid JSON after repair: persist agent message with text explaining failure and no plan, return AGENT_UNAVAILABLE; on schema validation failure: persist agent message with explanation, return ACTION_PLAN_INVALID with reasons; on reference validation failure: persist agent message with text about invalid references, return ACTION_PLAN_INVALID with specific reasons; on unexpected error: persist generic failure message, return AGENT_UNAVAILABLE; in all error cases: user message already persisted (step 4 of contract behavior), no invalid plan data in persisted agent message
- [X] T032 [US4] Handle suggest errors in frontend — in useSuggest.ts: on error response, set suggestStatus='error' and suggestError from response error envelope; preserve draftText in store so user can retry without retyping; in ChatSidebar.tsx: show error message inline below the user's prompt message (not as a system message); show "Retry" button that re-submits the preserved draft; differentiate error types: timeout → "The assistant timed out", invalid plan → "The suggestion couldn't be validated", unavailable → "The assistant is temporarily unavailable"

**Checkpoint**: All failure modes handled gracefully. User message always persisted. Invalid plans never shown as previews. Prompt preserved for retry. Clear error messages with correct codes.

---

## Phase 7: User Story 5 — Prompt Entry and Submission UX (Priority: P2)

**Goal**: The user enters suggest prompts through the existing chat panel composer with a mode toggle. Loading state provides clear feedback, duplicate submissions are prevented, and the canvas remains interactive during suggest requests.

**Independent Test**: Toggle to suggest mode, submit a prompt, verify loading indicator appears and submit disabled. Try submitting again while loading — prevented. Verify canvas is still pannable/zoomable during loading. Switch back to chat mode and verify normal chat submit works.

### Implementation for User Story 5

- [X] T033 [P] [US5] Create SuggestModeToggle in frontend/src/components/chat/SuggestModeToggle.tsx — render a toggle control (segmented button group: "Chat" | "Suggest") in the composer area; read/write board.settings.agentEditMode from store (existing field); when 'suggest' selected, show a subtle visual indicator (e.g., purple accent) to differentiate from normal chat; emit mode change to parent via callback
- [X] T034 [P] [US5] Create SuggestLoadingIndicator in frontend/src/components/chat/SuggestLoadingIndicator.tsx — render an animated indicator (pulsing dots or spinner with "Thinking..." text) displayed in the chat message area while suggestStatus='running'; visually distinct from regular chat loading; include elapsed time indicator after 5 seconds ("Still working...")
- [X] T035 [US5] Modify MessageComposer to integrate suggest mode in frontend/src/components/chat/MessageComposer.tsx — import SuggestModeToggle and render above the text input; when mode='suggest', submit calls useSuggest.submitSuggest instead of useChat.sendMessage; disable submit button when agentState.suggestStatus='running' OR chatState.sendStatus='sending'; show SuggestLoadingIndicator in message area when suggest is running; ensure Shift+Enter still creates newlines, Enter submits
- [X] T036 [US5] Ensure canvas remains interactive during suggest loading — verify no modal overlay or pointer-events:none is applied to the canvas area during suggest requests; the loading indicator is contained within the chat panel; if any existing loading overlay blocks the canvas, gate it to exclude suggest loading state

**Checkpoint**: Suggest mode toggle works. Loading indicator shows during suggest. Duplicate submissions prevented. Canvas interactive during loading. Mode switch between chat and suggest is seamless.

---

## Phase 8: User Story 6 — Dismiss, Retry, and Stale Suggestion Handling (Priority: P3)

**Goal**: Users can dismiss suggestions, retry with new prompts (clearing old previews), and see stale indicators when the board changes after a suggestion was generated. No preview artifacts remain after dismiss.

**Independent Test**: Generate a suggestion, dismiss it — verify all preview elements removed. Generate a suggestion, submit a new prompt — verify old preview replaced. Modify the board (move a node) — verify stale indicator appears on the suggestion. Check chat history still shows the original suggestion message after dismiss.

### Implementation for User Story 6

- [X] T037 [US6] Wire dismiss and retry flows in frontend/src/hooks/useSuggest.ts — dismissSuggestion(): clear latestSuggestion, set previewVisible=false, previewStale=false (keep chat messages intact); on new submitSuggest: if latestSuggestion exists, auto-dismiss before starting new request; expose dismissSuggestion in hook return
- [X] T038 [P] [US6] Create StaleBanner in frontend/src/components/canvas/StaleBanner.tsx — render a banner overlay at the top of the preview area when agentState.previewStale=true; text: "This suggestion may be outdated — the board has changed since it was generated"; include "Dismiss" and "Re-request" action buttons; dismiss calls dismissSuggestion, re-request preserves the original prompt and re-submits
- [X] T039 [US6] Implement stale detection in frontend/src/store/board.store.ts — in any action that updates board.revision (from hydration, mutation responses, or polling), check if agentState.latestSuggestion exists and agentState.latestSuggestion.boardRevision < new board.revision; if so, set agentState.previewStale=true; this ensures stale is detected regardless of what caused the revision change
- [X] T040 [US6] Integrate dismiss button and stale banner into UI — in ActionSummaryList: add a "Dismiss" button that calls dismissSuggestion; in PreviewOverlay: render StaleBanner above the preview layer when previewStale=true; in ChatSidebar: ensure dismissed suggestion messages remain visible in chat history (only preview overlay is cleared, messages are permanent)

**Checkpoint**: Dismiss clears all preview artifacts. New suggest auto-dismisses old preview. Stale indicator appears on board revision change. Chat history preserved after dismiss.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Structured logging, rate limiting, and quickstart validation.

- [X] T041 [P] Add structured logging to agent service in backend/src/services/agent.service.ts — log requestId, boardId, boardRevision on suggest start; log context build duration; log LLM call duration, attempt count, success/failure; log validation result (pass/fail with reason count); log overall suggest duration; use existing logger patterns from chat.service.ts
- [X] T042 [P] Add suggest rate limiting in backend/src/http/router.ts — apply rate limit middleware to POST /boards/:boardId/agent/actions with limit from SUGGEST_RATE_LIMIT config (default 12/min); return 429 RATE_LIMIT_EXCEEDED when exceeded
- [X] T043 Run quickstart.md verification — execute all curl commands from specs/010-agent-suggest-.../quickstart.md against a running local instance; verify: suggest returns response, board revision unchanged, chat messages persisted, stub mode works

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3–8)**: All depend on Foundational phase completion
  - US1 (core suggest) can start immediately after Foundational
  - US2 (preview UI) depends on US1 (needs working suggest endpoint + store to render from)
  - US3 (context-aware) can start after Foundational backend tasks exist (parallel with US1 frontend)
  - US4 (error handling) depends on US1 (needs working service to extend error paths)
  - US5 (prompt UX) depends on US1 frontend (needs useSuggest hook + store)
  - US6 (dismiss/stale) depends on US2 (needs preview to dismiss/mark stale)
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — No story dependencies
- **US2 (P1)**: Depends on US1 (needs suggest response + store to derive preview from)
- **US3 (P2)**: Backend tasks can start after Foundational (parallel with US1); frontend task T029 depends on US1 frontend (needs useSuggest hook)
- **US4 (P2)**: Depends on US1 backend (needs agent.service and llm-client to extend)
- **US5 (P2)**: Depends on US1 frontend (needs MessageComposer and useSuggest to integrate with)
- **US6 (P3)**: Depends on US2 (needs preview to dismiss and stale-check)

### Within Each User Story

- Types/schemas before validators
- Validators before services
- Services before controllers
- Controllers before route registration
- Backend before frontend (for endpoints the frontend calls)

### Parallel Opportunities

- T003 + T004 + T005 + T006 + T007 + T008 (all foundational) can run in parallel
- T009 + T010 + T011 (context-builder, output-validator, action-plan-rules) can run in parallel
- T018 + T019 + T021 (PreviewNode, PreviewEdge, ActionSummaryList) can run in parallel
- T024 + T025 + T026 + T027 (repo helpers + sanitizer) can run in parallel
- T033 + T034 (SuggestModeToggle + SuggestLoadingIndicator) can run in parallel
- US3 backend (T024–T028) can run in parallel with US2 frontend (T018–T023)
- US4 and US5 can run in parallel after US1 completes

---

## Parallel Example: Foundational Phase

```text
# All these can run simultaneously (different files, no dependencies):
Task T003: Agent types in backend/src/agent/types.ts
Task T004: Zod schemas in backend/src/schemas/agent.schemas.ts
Task T005: LLM client in backend/src/agent/llm-client.ts
Task T006: Preview builder in backend/src/agent/preview-builder.ts
Task T007: Agent API client in frontend/src/api/agent.api.ts
Task T008: Agent types in frontend/src/store/types.ts
```

## Parallel Example: After US1 Completes

```text
# US2 frontend, US3 backend, US4 backend, US5 frontend can overlap:
Tasks T018-T023 (US2: preview UI on canvas + action list)
Tasks T024-T028 (US3: spatial context + sanitizer)
Tasks T030-T031 (US4: retry + error handling)
Tasks T033-T035 (US5: mode toggle + loading UX)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (core suggest flow)
4. **STOP and VALIDATE**: Submit suggest, verify response, check revision unchanged, verify chat persistence
5. Deploy/demo if ready — basic suggest works end-to-end with stub LLM

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Core Suggest) → Test prompt→response flow → First milestone (MVP)
3. US2 (Preview UI) → Test canvas overlay + action list → Visual suggest experience
4. US3 (Context-Aware) → Test prioritized context + sanitization → Intelligent suggestions
5. US4 (Error Handling) → Test failure modes → Robust suggest
6. US5 (Prompt UX) → Test mode toggle + loading → Polished entry point
7. US6 (Dismiss/Stale) → Test dismiss + stale detection → Complete UX
8. Polish → Logging + rate limits + quickstart validation → Ship-ready

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (core suggest — blocking for others)
3. Once US1 is done:
   - Developer A: US2 (preview UI)
   - Developer B: US3 backend + US4 (context + error handling)
   - Developer C: US5 (prompt UX)
4. Once US2 is done:
   - Developer C: US6 (dismiss/stale)
5. Polish phase together

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Suggest does NOT use withBoardMutation — uses withTransaction for chat message persistence only; no revision bump, no operations log, no advisory lock
- Agent stub (LLM_PROVIDER=stub) enables full flow testing without LLM provider
- Existing agent-stub.ts is replaced by the new agent/llm-client.ts with stub mode
- Preview state is NEVER written into confirmed nodesById/edgesById — derived at render time from actionPlan
- The chat composer from S8 is reused; suggest mode is added via a toggle, not a separate UI
