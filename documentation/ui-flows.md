# UI Flows

## Purpose

This document defines the primary user interaction flows for the Context Board MVP.

It is intended to support frontend planning, UX implementation, and task breakdown.

It focuses on the main scenarios that drive the product experience:
- create board
- add sticky
- connect nodes
- upload image and place node
- send chat prompt
- review suggested plan
- apply action plan
- handle invalid plan and error states

This document describes the expected user journey, screen behavior, UI states, backend touchpoints, and acceptance expectations for each flow.

---

## UX principles

### 1. The board is the primary workspace

The board should feel like the main canvas where durable work happens.

### 2. Chat is an assistant, not the source of truth

Chat helps propose changes, but durable structure lives on the board.

### 3. Suggest and apply must feel clearly different

Users should always be able to tell the difference between:
- a suggestion preview
- a committed board change

### 4. Actions should feel direct and low-friction

Simple manual actions like adding a sticky or connecting nodes should be faster than invoking the agent.

### 5. Failures should be understandable and recoverable

Errors should not leave users unsure whether the board changed.

---

## Shared screen model

The main board screen is assumed to contain:
- top bar or board header
- central canvas area
- optional side panel(s)
- chat panel or chat drawer
- selection state and tool affordances
- toast/error feedback area

The exact visual layout may change, but the user flows should preserve the same behavioral model.

---

## Flow 1: Create board

## Goal

The user creates a new board and lands in an empty or near-empty board workspace ready for editing.

## Entry points

- home/dashboard “Create board” button
- empty-state action
- future duplicate/template actions if added later

## Happy path

1. user clicks **Create board**
2. user optionally enters a title or accepts default title
3. frontend sends create board request
4. backend creates board and default thread if applicable
5. frontend navigates to the board screen
6. frontend hydrates board state
7. user sees an empty board state ready for work

## UI states

### Idle
- create button visible

### Submitting
- button shows loading
- duplicate submission is disabled

### Success
- navigate to newly created board
- empty canvas shown
- chat panel available if part of default board layout

### Failure
- stay on current screen
- show inline or toast error
- allow retry

## Backend touchpoints

- `POST /boards`
- `GET /boards/:boardId/state`

## Acceptance expectations

- user is taken to a real board, not a placeholder screen
- board title is visible after creation
- no duplicate board is created from double click
- initial state is fully hydrated before editing assumptions are made

---

## Flow 2: Add sticky

## Goal

The user quickly places a new text-based node on the board.

## Entry points

- toolbar “Sticky” action
- context menu on canvas
- keyboard shortcut later if added

## Happy path

1. user activates **Add sticky**
2. user clicks on canvas or sticky appears at default position
3. sticky appears in editable state
4. user types content
5. frontend sends create node request on create/commit
6. backend returns confirmed node and revision
7. frontend reconciles confirmed node into board state
8. sticky becomes part of durable board state

## UX variants

### Immediate create then edit
- sticky is created on click
- text edit starts right away

### Draft first then create
- sticky is local-only until user confirms

For MVP, either is acceptable, but the behavior should be consistent.

## UI states

### Idle
- add sticky affordance visible

### Drafting
- sticky is visually editable
- unsaved state may be indicated subtly

### Saving
- optimistic or pending indicator may appear

### Saved
- sticky behaves like normal confirmed node

### Save failure
- user sees that save failed
- draft text is not silently lost
- user can retry or cancel

## Backend touchpoints

- `POST /boards/:boardId/nodes`
- optionally `PATCH /boards/:boardId/nodes/:nodeId` if text is committed after initial create

## Acceptance expectations

- adding a sticky feels fast
- the user can immediately type after creating it
- failed save does not leave the user uncertain whether the sticky exists
- final sticky position and content reflect server-confirmed state

---

## Flow 3: Connect nodes

## Goal

The user creates a visible relationship between two nodes.

## Entry points

- drag from connection handle on node A to node B
- select two nodes and choose “Connect” later if added

## Happy path

1. user starts drag from node A connection handle
2. UI shows edge preview following cursor
3. user hovers valid target node B
4. valid target state is visually indicated
5. user releases on node B
6. frontend sends create edge request
7. backend validates same-board and active-node rules
8. backend returns confirmed edge and revision
9. frontend reconciles edge into confirmed board state

## UI states

### Idle
- connection handles visible on eligible nodes

### Connecting
- temporary edge preview rendered
- invalid targets visibly distinct from valid targets

### Saving
- edge may remain visible with pending indicator

### Saved
- confirmed edge renders normally

### Failure
- preview/pending edge disappears or rolls back
- user sees explainable error

## Validation UX

The UI should prevent obvious invalid targets when possible, but backend validation still decides final acceptance.

Examples of obvious invalid states:
- target node deleted/not visible
- same node if self-loop is disallowed

## Backend touchpoints

- `POST /boards/:boardId/edges`

## Acceptance expectations

- the drag interaction is clear and responsive
- valid targets are understandable
- invalid connection attempts fail cleanly
- edge does not remain ghosted after rejection

---

## Flow 4: Upload image and place node

## Goal

The user uploads an image asset and places it onto the board as a node.

## Entry points

- upload button in toolbar
- drag-and-drop onto canvas
- insert menu from side panel

## Happy path

1. user chooses or drops image file
2. frontend validates obvious client-side constraints if available
3. frontend uploads file
4. backend stores asset and returns asset metadata
5. frontend creates or offers to create an image node linked to that asset
6. user places image node on board or it appears in default position
7. backend confirms node creation
8. image node renders on board using asset metadata/URL strategy

## UX variants

### Auto-place
- asset upload immediately creates node at default position

### Upload then place
- upload succeeds first
- user chooses where to place the node

For MVP, either is acceptable, but “upload then place” is often easier to reason about.

## UI states

### Selecting file
- upload affordance active

### Uploading
- visible progress or at least spinner state
- duplicate upload action disabled for same attempt

### Upload succeeded
- success state shown
- image ready to place

### Placing
- image preview follows cursor or appears in staged state

### Saved
- image node becomes confirmed part of board state

### Failure
- upload failure and placement failure are clearly distinguished

## Error states

- unsupported file type
- file too large
- upload transport failure
- asset saved but node placement failed

The user should know which part failed.

## Backend touchpoints

- `POST /boards/:boardId/assets`
- `POST /boards/:boardId/nodes`

## Acceptance expectations

- users can understand whether they uploaded an asset, placed a node, or both
- upload constraints are communicated clearly
- a failed placement does not imply the asset upload was lost unless it actually failed

---

## Flow 5: Send chat prompt

## Goal

The user asks the assistant for a suggestion or transformation based on the board context.

## Entry points

- chat input in board screen
- selected-node contextual action that seeds the prompt later

## Happy path

1. user types prompt in chat input
2. user optionally has selection context already active
3. user submits prompt
4. chat input enters loading state
5. frontend sends suggest request with prompt and context
6. backend generates suggestion and returns assistant message plus action plan preview
7. chat thread shows assistant response
8. preview state becomes available for review

## UI states

### Idle
- chat input enabled
- send button enabled when prompt valid

### Sending
- input may remain editable or temporarily disabled depending on UX choice
- request in progress clearly visible

### Success
- assistant response rendered in chat
- preview affordance appears
- board itself remains unchanged

### Failure
- message send or suggest generation error shown
- user can retry
- prompt text should not disappear unexpectedly

## Important UX rule

The user must not think the board changed just because the assistant responded.

The preview should be presented as a proposed change, not an applied one.

## Backend touchpoints

- `POST /boards/:boardId/agent/actions`

## Acceptance expectations

- prompt send feels responsive
- assistant response is clearly separated from durable board changes
- the user can understand that a suggestion is ready for review

---

## Flow 6: Review suggested plan

## Goal

The user inspects what the assistant proposes before deciding whether to apply it.

## Entry points

- immediately after successful suggest response
- clicking a prior suggestion in chat history later if supported

## Happy path

1. user receives assistant suggestion
2. preview UI highlights affected nodes/edges or shows a diff-like summary
3. user reviews proposed additions, updates, deletions, or relationships
4. user chooses one of:
   - Apply
   - Dismiss
   - Revise with another prompt

## Review UI requirements

The review state should make these things understandable:
- what will be created
- what will be changed
- what will be removed
- what area of the board is affected

## Recommended preview forms

One or more of:
- canvas overlay
- highlighted affected entities
- side panel diff summary
- mini list of planned actions

## UI states

### Preview visible
- proposed changes are visually distinct from confirmed state

### Preview hidden
- user can return to preview without losing the suggestion

### Dismissed
- preview removed
- confirmed board remains unchanged

## Important UX rule

Preview must not overwrite confirmed board state in a way that looks committed.

The user should always be able to distinguish:
- what already exists
- what is being proposed

## Backend touchpoints

No new backend request is required to review a plan if the suggestion result already contains previewable data.

## Acceptance expectations

- the user can explain what the plan will do before pressing Apply
- preview is visually distinct from committed content
- dismissing preview does not alter board state

---

## Flow 7: Apply action plan

## Goal

The user commits the assistant’s suggested changes to the durable board state.

## Entry points

- Apply button in preview panel
- Apply button in chat suggestion card

## Happy path

1. user reviews preview
2. user clicks **Apply**
3. apply action enters loading state
4. duplicate apply is disabled
5. frontend sends explicit action plan to apply endpoint
6. backend validates and atomically applies the plan
7. backend returns confirmed diff and new revision
8. frontend reconciles confirmed state from server response
9. preview clears or becomes marked as applied
10. board now visibly reflects committed changes

## UI states

### Ready to apply
- Apply button enabled

### Applying
- loading state shown
- duplicate actions disabled
- preview may remain visible while waiting

### Applied successfully
- confirmed board updates
- revision advances internally
- success feedback optional but useful

### Apply failed
- confirmed board remains unchanged
- preview may remain for retry if still relevant
- user sees clear error state

## Important UX rule

The UI should not commit preview changes into confirmed board state before the server confirms success.

## Backend touchpoints

- `POST /boards/:boardId/agent/actions/apply`

## Acceptance expectations

- apply feels deliberate and irreversible enough for MVP
- user can tell when apply is still running
- after success, the board reflects the server-confirmed result
- after failure, the board remains in previously confirmed state

---

## Flow 8: Handle invalid plan and error state

## Goal

The user understands when a suggested or attempted action cannot be applied, and the product recovers without ambiguity.

## Scenarios

### Scenario A: Suggest returns invalid or unusable plan

Possible reasons:
- backend rejects model output shape
- unsupported action type
- invalid references in suggestion

#### UX behavior
1. user sends prompt
2. backend fails to produce valid actionable suggestion
3. chat shows controlled failure or fallback assistant message
4. no preview is shown as if it were valid
5. user can retry with another prompt

### Scenario B: Apply fails validation

Possible reasons:
- board changed since suggest
- node is now locked/deleted
- action plan invalid against current state

#### UX behavior
1. user clicks Apply
2. apply request fails
3. confirmed board remains unchanged
4. user sees message that plan could not be applied
5. preview may be kept for inspection, but should be marked invalid or stale
6. user can dismiss or regenerate suggestion

### Scenario C: Transport or server failure

Possible reasons:
- timeout
- network issue
- storage issue
- transient server failure

#### UX behavior
- show request failure clearly
- avoid implying board may have changed unless server confirmation exists
- allow retry where safe

## Error messaging requirements

Error messages should answer at least one of these:
- what failed
- whether the board changed
- what the user can do next

## Recommended message style

Prefer:
- “Suggestion couldn’t be generated.”
- “Plan couldn’t be applied because the board changed.”
- “Upload failed. Your board was not changed.”

Avoid vague messages like:
- “Something went wrong.”

unless accompanied by additional useful context.

## Acceptance expectations

- users are never left guessing whether state changed
- invalid plans are not shown as safe to apply
- stale previews are visually distinguishable from valid previews

---

## Cross-flow UX states

Several shared UI states should behave consistently across flows.

## Loading states

Use visible, local loading indicators for:
- create board
- add sticky save
- connect nodes save
- upload image
- send prompt
- apply plan

## Disabled states

Disable:
- duplicate submit buttons while request is active
- apply button while apply is in progress
- repeated create actions when current one is unresolved

## Success feedback

Success feedback may be subtle for manual board edits but should be clearer for long-running flows like upload or apply.

## Error feedback

Errors should appear close to the relevant action when possible, with toasts or banners for broader failures.

---

## Suggested acceptance checklist by flow

## Create board
- board created once
- user lands in hydrated board view

## Add sticky
- sticky appears quickly
- text can be entered immediately
- failed save is recoverable

## Connect nodes
- preview edge interaction is clear
- invalid targets are understandable
- failed create does not leave ghost edge

## Upload image and place node
- upload and placement are understandable as separate steps if implemented separately
- user can tell whether asset upload succeeded
- image node renders after confirmation

## Send chat prompt
- assistant response is visible
- board does not appear committed yet

## Review suggested plan
- user can inspect intended changes before apply
- preview is distinct from confirmed state

## Apply action plan
- apply is explicit
- duplicate apply is prevented
- server-confirmed result drives final board state

## Invalid plan/error handling
- failure messaging is actionable
- users are not confused about whether board changed

---

## Recommended implementation notes

1. Keep manual editing flows faster than agent flows.
2. Keep preview state separate from confirmed board state.
3. Use clear visual language for draft, pending, preview, confirmed, and failed states.
4. Make duplicate submit prevention part of every mutation flow.
5. Always communicate whether a failure changed durable board state or not.

---

## Final summary

The UI flow model should be built around one central rule:

**users should always understand whether they are editing the board directly, previewing an assistant suggestion, or committing a durable change.**

If this distinction stays clear across all major scenarios, the MVP will feel much more trustworthy:
- manual actions stay fast and direct
- agent suggestions feel useful but safe
- apply feels deliberate and atomic
- failures remain recoverable and understandable

That clarity is what will make frontend planning, implementation, and QA much easier.

