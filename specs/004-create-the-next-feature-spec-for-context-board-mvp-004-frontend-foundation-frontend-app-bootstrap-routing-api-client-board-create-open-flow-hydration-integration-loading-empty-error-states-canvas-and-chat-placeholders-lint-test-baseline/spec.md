# Feature Specification: Frontend Foundation

**Feature Branch**: `004-frontend-foundation`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: User description: "Create the next feature spec for Context Board MVP: 004-frontend-foundation. Frontend app bootstrap, routing, API client, board create/open flow, hydration integration, loading/empty/error states, canvas and chat placeholders, lint/test baseline."

## Clarifications

### Session 2026-03-16

- Q: How should the frontend handle archived boards? → A: Show archived boards in the list with an "archived" indicator; opening one shows the workspace with a read-only flag.
- Q: What layout model should the board workspace use for canvas and chat areas? → A: Chat as a collapsible sidebar on the left; canvas fills the remaining space and expands to full width when the sidebar is collapsed.
- Q: Should the canvas render hydrated nodes/edges visually, or defer rendering to the Nodes CRUD slice? → A: Canvas displays as a structural container; hydrated data is stored internally but visual node/edge rendering is deferred to S4.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Create a New Board (Priority: P1)

A user opens the Context Board app for the first time. They see a starting screen with a clear option to create a new board. They click the create action, optionally provide a title, and are taken directly into a board workspace. The workspace is empty but clearly ready for work—canvas area on one side, chat area on the other—and the board title is visible.

**Why this priority**: This is the first meaningful product action. Without the ability to create a board and land in the workspace, no later feature has a surface to live on. It validates the entire app-to-backend round trip.

**Independent Test**: Can be fully tested by launching the app, clicking create, and confirming the user lands on a real board screen with a visible title, an empty canvas area, and a chat area. No other features are required.

**Acceptance Scenarios**:

1. **Given** the user is on the starting screen, **When** they create a new board with a title, **Then** the system creates the board on the backend, navigates them to the board workspace, and displays the board title.
2. **Given** the user is on the starting screen, **When** they create a board without providing a title, **Then** a default title is assigned and the user still lands in a valid board workspace.
3. **Given** the user has clicked the create action, **When** the creation request is still in progress, **Then** the create action is visibly disabled and cannot be triggered again.
4. **Given** the user has clicked the create action, **When** the backend request fails, **Then** the user remains on the starting screen with a clear error message and can retry.

---

### User Story 2 — Open an Existing Board (Priority: P1)

A user returns to the app and sees a list of their existing boards on the starting screen. They select a board and are taken into the board workspace, where the full board state is loaded and stored. The workspace displays the board's title and metadata, and the canvas area is visible as a structural container ready for future rendering. Node and edge data is hydrated and held in the local store, but visual rendering of individual nodes and edges on the canvas is deferred to later slices.

**Why this priority**: Opening an existing board is equally critical to creating one. Together they form the minimal board lifecycle that all later canvas, chat, and agent features depend on.

**Independent Test**: Can be tested by creating a board first (via Story 1 or backend seeding), then navigating to the starting screen, selecting the board, and confirming the workspace shows the correct board state including the title.

**Acceptance Scenarios**:

1. **Given** boards exist in the system, **When** the user visits the starting screen, **Then** the boards are listed with their titles and last-updated times, and archived boards are visually distinguished from active boards.
2. **Given** the user is on the starting screen, **When** they select a board from the list, **Then** the system navigates to the board workspace and loads the board's current state from the backend.
3. **Given** the user has opened a board, **When** the board state finishes loading, **Then** the workspace displays the board title, the canvas container, and the chat sidebar. Hydrated node and edge data is stored locally but not yet rendered visually on the canvas.
4. **Given** the user navigates directly to a board's URL, **When** the board exists, **Then** the workspace loads and hydrates that board's state normally.
5. **Given** the user opens an archived board, **When** the board state finishes loading, **Then** the workspace displays a visible read-only indicator alongside the board content.

---

### User Story 3 — Understand Board Loading States (Priority: P2)

When a user opens or creates a board, they always understand what is happening. While the board state is being retrieved, they see a clear loading indicator. If the board is empty, they see a real workspace with clearly defined but vacant canvas and chat areas—not a blank or broken screen. If loading fails, they see an actionable error message that tells them what went wrong and what they can do next.

**Why this priority**: Without clear loading states, the user cannot distinguish between "still loading," "empty board," and "something broke." This erodes trust in every subsequent feature. It sits just below the create/open flows because it makes those flows usable.

**Independent Test**: Can be tested by simulating slow or failed backend responses and confirming the UI shows loading, empty, or error states as appropriate—without ever presenting a blank or ambiguous screen.

**Acceptance Scenarios**:

1. **Given** the user has navigated to a board, **When** the hydration request is in progress, **Then** a loading indicator is visible and no stale or partial content is shown.
2. **Given** the board has been created but has no nodes or edges, **When** the hydration completes, **Then** the workspace shows the empty board as a real screen with a canvas area and chat area ready for future use.
3. **Given** the user has navigated to a board, **When** the hydration request fails, **Then** the user sees a clear error message explaining the failure and can retry or navigate back.
4. **Given** the user navigates to a board URL that does not exist or has been deleted, **Then** the user sees a clear "board not found" message and can navigate back to the starting screen.

---

### User Story 4 — Navigate Between Starting Screen and Board (Priority: P2)

A user can move freely between the starting screen and any board workspace. When they navigate away from a board and return to the starting screen, the board list reflects the current state. When they navigate back into a board, the workspace rehydrates from the backend.

**Why this priority**: Navigation is essential for a multi-board workflow. Without it, the user is trapped after their first board interaction. It is lower priority than create/open because those establish the primary surfaces.

**Independent Test**: Can be tested by creating a board, navigating back to the starting screen, confirming the new board appears in the list, and opening it again to verify it loads correctly.

**Acceptance Scenarios**:

1. **Given** the user is viewing a board workspace, **When** they navigate back to the starting screen, **Then** the board list is displayed with current boards including any newly created ones.
2. **Given** the user is on the starting screen, **When** they open a board then navigate back and open a different board, **Then** each board workspace loads its own correct state independently.
3. **Given** the user refreshes the browser while viewing a board, **When** the page reloads, **Then** the board workspace rehydrates from the backend and displays the correct state.

---

### User Story 5 — Frontend Code Quality Baseline (Priority: P3)

Developers contributing to the frontend have automated code quality checks (linting) and a working test runner. Every contribution passes through these gates before it is merged, establishing a quality floor for all future frontend work.

**Why this priority**: Quality gates are foundational but do not directly deliver user value. They matter most when the codebase starts growing in later slices. This story ensures the infrastructure exists before that growth begins.

**Independent Test**: Can be tested by running the lint and test commands from the project root and confirming they execute successfully with meaningful coverage of at least the board create-and-open flow.

**Acceptance Scenarios**:

1. **Given** a developer has written frontend code, **When** they run the lint command, **Then** the linter checks all frontend source files and reports any violations.
2. **Given** a developer has written frontend code, **When** they run the test command, **Then** the test runner executes all frontend tests and reports results.
3. **Given** the frontend test suite exists, **When** the tests run, **Then** at least one test validates the board creation and navigation flow end to end.

---

### Edge Cases

- What happens when the user navigates directly to a board URL that does not exist? The system shows a "board not found" state and offers navigation back to the starting screen.
- What happens when the backend is unreachable during board creation? The user sees an explicit network error on the starting screen and can retry once connectivity is restored.
- What happens when the hydration request times out? The user sees a timeout-specific error message and can retry loading the board.
- What happens when the user double-clicks the create button rapidly? The system prevents duplicate board creation—only one board is created.
- What happens when the board list is empty because no boards exist? The starting screen shows an empty state with a clear prompt to create the first board.
- What happens when the user refreshes the browser on the board screen? The app rehydrates the board state from the backend without data loss.
- What happens when a board was deleted by another process between listing and opening? The user sees a "board not found" message when attempting to open it.
- What happens when the user opens an archived board? The workspace loads normally but displays a visible read-only indicator. Since this slice includes no editing interactions, the indicator prepares the user for later slices where mutations will be blocked.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a starting screen that displays a list of existing boards, including archived boards with a visual "archived" indicator to distinguish them from active boards.
- **FR-002**: System MUST show an empty state with a clear call-to-action when no boards exist.
- **FR-003**: System MUST allow the user to create a new board from the starting screen with an optional title.
- **FR-004**: System MUST prevent duplicate board creation from rapid repeated interactions (double-click protection).
- **FR-005**: System MUST navigate the user to the board workspace immediately after successful board creation.
- **FR-006**: System MUST load the full board state from the backend when entering the board workspace and store the hydrated data (board metadata, nodes, edges, chat thread reference, revision) locally. Visual rendering of nodes and edges on the canvas is deferred to later slices.
- **FR-007**: System MUST display a loading indicator while the board state is being retrieved.
- **FR-008**: System MUST display the board title and a workspace layout with a canvas area and a collapsible chat sidebar once the board state has loaded. The chat sidebar appears on the left and can be collapsed or expanded. When collapsed, the canvas fills the full workspace width.
- **FR-009**: An empty or populated board MUST render the workspace with a visible canvas container and chat sidebar, not a blank page or placeholder stub. The canvas serves as the structural surface where nodes and edges will be rendered in later slices.
- **FR-010**: System MUST display a meaningful error message when board hydration fails, distinguishing between "not found" and general errors.
- **FR-010a**: System MUST display a visible read-only indicator when the user opens an archived board, signaling that no editing actions will be available.
- **FR-011**: System MUST allow the user to retry a failed board load without leaving the board screen.
- **FR-012**: System MUST allow the user to navigate from the board workspace back to the starting screen.
- **FR-013**: System MUST support direct URL navigation to a board—entering the board URL should open that board's workspace.
- **FR-014**: System MUST handle browser refresh on the board screen by rehydrating the board state from the backend.
- **FR-015**: The board workspace MUST treat the backend hydration response as the authoritative source of confirmed board state.
- **FR-016**: System MUST have an automated linting configuration that checks all frontend source files.
- **FR-017**: System MUST have a configured test runner capable of executing frontend tests.

### Key Entities

- **Board**: The primary workspace object. Has a title, status (active, archived, or deleted), and revision number. Displayed in the starting screen list and loaded in full in the board workspace. Archived boards are visually distinguished in the list and show a read-only indicator when opened.
- **Board State**: A complete snapshot of a board including its metadata, nodes, edges, chat thread reference, and revision marker. Loaded from the backend on every board entry and treated as the authoritative confirmed state.
- **Board List**: The collection of non-deleted boards displayed on the starting screen, showing titles and last-updated information.

## Scope Boundaries

### In Scope

- Frontend application bootstrap and runtime configuration
- Two-screen routing: starting screen and board workspace
- Shared communication layer with the backend, configured for the correct environment
- Board creation flow using the existing board creation endpoint
- Board listing using the existing board listing endpoint
- Board state hydration using the existing board state endpoint
- Loading, empty, and error states for board creation and board loading
- Board workspace skeleton with a canvas area and a chat area
- Navigation between starting screen and board workspace
- Browser refresh support on the board screen
- Frontend linting and test runner configuration

### Explicitly Out of Scope

- Node creation, editing, or deletion interactions
- Edge creation, editing, or deletion interactions
- Asset or image upload flows
- Chat message sending or receiving
- Agent suggest or apply interactions
- Operations polling or incremental sync
- Canvas pan, zoom, or spatial interactions beyond placeholder display
- Chat message composition or history rendering beyond placeholder display

## Assumptions

- The backend APIs for board creation (`POST /boards`), board listing (`GET /boards`), and board state hydration (`GET /boards/{boardId}/state`) are already implemented and available.
- The MVP is a single-user application with no authentication required.
- The app is accessed through a modern web browser on desktop.
- The starting screen and the board workspace are the only two screens required in this slice.
- Canvas and chat areas are placeholder surfaces in this slice—they will gain interactive editing and messaging capabilities in later slices.
- Board state hydration replaces the entire local board state on each load, consistent with the project's confirmed-state-from-backend model.
- A default board title is acceptable when the user does not provide one during creation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create a new board and see the board workspace ready for use within 3 seconds under normal network conditions.
- **SC-002**: A user can open an existing board from the starting screen and see the fully loaded workspace within 3 seconds under normal network conditions.
- **SC-003**: 100% of board load attempts result in one of three clear states: loaded content, a loading indicator, or an actionable error message—no blank or ambiguous screens are ever shown.
- **SC-004**: The board workspace displays a canvas area and a collapsible chat sidebar on the left, even when the board is empty, on first load after creation. Collapsing the sidebar gives the canvas full workspace width.
- **SC-005**: Rapid repeated clicks on the create button produce exactly one board, with no duplicates.
- **SC-006**: All frontend source code passes the automated linting check with zero violations on merge.
- **SC-007**: At least one automated test validates the end-to-end flow of creating a board and navigating to its workspace.
- **SC-008**: Direct URL navigation to a valid board loads and displays that board's workspace correctly.
- **SC-009**: Browser refresh on the board screen reloads the board state from the backend without data loss or navigation errors.
