# Context Board MVP — Overview

## 1. Purpose

Context Board is an AI-first visual workspace for thinking and planning on an infinite canvas.

The user can place:
- sticky notes
- text cards
- images
- simple shapes
- connectors

On the left, there is a persistent chat with an AI agent. The agent can read the board, understand the current selection, answer questions about the workspace, and propose or apply edits to the board.

This document defines the MVP scope, architectural decisions, constraints, and implementation boundaries for the first backend and API version.

---

## 2. Product Definition

### One-line definition

A visual board where a user thinks spatially, and an AI agent can see and edit that workspace.

### MVP promise

The MVP must allow a single user to:
1. create and edit boards in the browser
2. place and manipulate visual objects on a canvas
3. chat with an agent about the board
4. ask the agent to suggest or apply structured edits
5. persist board state, chat history, assets, and operations

---

## 3. MVP Scope

### In scope

#### Board editing
- create board
- rename board
- load full board state
- infinite canvas
- pan / zoom
- create/update/delete nodes
- create/update/delete edges
- basic batch changes
- soft delete for recoverability

#### Node types
- `sticky`
- `text`
- `image`
- `shape`

#### Agent interaction
- one chat thread per board
- user sends prompt with optional selection context
- agent can analyze board or selection
- agent returns:
  - plain response
  - optional structured action plan
- user can apply suggested actions
- backend validates all agent actions before mutation

#### Persistence
- PostgreSQL as source of truth
- JSONB for flexible fields
- append-only operations log
- asset storage for images/files
- optional snapshots for restore/undo support

---

## 4. Out of Scope for MVP

These are explicitly not required in the first version:

- authentication
- multi-user collaboration
- board sharing
- permissions system
- comments
- realtime cursors / presence
- websockets or live sync
- advanced diagramming
- tables / databases
- presentation mode
- version branching
- autonomous long-running agents
- multiple chat threads per board
- full text search across boards
- fine-grained CRDT / collaborative conflict resolution

---

## 5. Core Product Constraints

### Single-user only
There is no auth in MVP.
The app is treated as local/dev/single-user usage in browser.

### One board = one chat
Each board has exactly one associated chat thread in MVP.

### Agent cannot mutate state directly
The agent never writes raw board state.
It can only produce a structured `actionPlan`, which the backend validates and converts into durable operations.

### Board state is structured
The board is not stored as one giant opaque JSON blob as the primary source of truth.
Core geometry and relationships are stored structurally.

### All durable changes are logged
Every mutation must be recorded in `board_operations`.

### Batch mutation is atomic
Batch node updates and agent apply actions must be all-or-nothing.

---

## 6. Architectural Principles

### 6.1 Relational skeleton + flexible JSON
Use PostgreSQL with:
- relational columns for stable/queryable fields
- JSONB for flexible payloads

Stable fields:
- ids
- board relationships
- geometry
- dimensions
- source/target references
- timestamps
- deletion flags

Flexible fields:
- node content
- style
- metadata
- board settings
- summaries
- action payloads

### 6.2 Operations-first mutation model
All board changes should be represented as operations.

Examples:
- `create_node`
- `update_node`
- `delete_node`
- `create_edge`
- `delete_edge`
- `batch_layout`
- `apply_agent_action_batch`

This enables:
- traceability
- undo foundations
- sync/diff foundations
- agent auditing
- restore/debug workflows

### 6.3 Backend is source of truth
Frontend may optimistically update UI, but server responses are authoritative.

### 6.4 Suggest/apply separation
Agent edits must support two modes:
- `suggest` — no board mutation, returns previewable action plan
- `apply` — validated mutation is committed

---

## 7. High-Level Architecture

### Frontend
Browser app with:
- canvas UI
- board interaction state
- chat sidebar
- selection/viewport tracking
- optimistic UI where useful

### Backend API
Responsible for:
- board CRUD
- node and edge mutations
- asset upload metadata
- chat persistence
- agent orchestration
- action validation
- operation logging

### Database
PostgreSQL stores:
- boards
- nodes
- edges
- operations
- chat threads
- chat messages
- assets
- optional snapshots

### Asset storage
File/object storage for uploaded images/files.

### AI layer
The AI layer receives:
- prompt
- board snapshot
- selection context
- nearby/visible context as needed

It returns:
- assistant text
- optional structured action plan

The backend validates this output before any mutation.

---

## 8. Board Model

A board consists of:
- board metadata
- nodes
- edges
- one chat thread
- operations history

### Nodes
Supported node types:
- `sticky`
- `text`
- `image`
- `shape`

Each node has:
- stable id
- type
- geometry
- z-order
- content
- style
- metadata
- deletion state

### Edges
Edges connect two node ids on the same board.

### Assets
Assets are uploaded files, primarily images in MVP.
An image node references an asset by id.

---

## 9. Agent Interaction Model

### Request flow
1. User selects objects or nothing
2. User sends a chat prompt
3. Frontend includes selection context
4. Backend builds AI context
5. Agent responds with:
   - text
   - optional `actionPlan`

### Apply flow
1. User accepts suggested action plan
2. Backend validates every action
3. Backend applies the batch transactionally
4. Backend writes operations log
5. Backend returns created/updated/deleted diff

### Why this matters
This keeps the system predictable:
- agent is useful
- user stays in control
- server preserves invariants
- state remains auditable

---

## 10. Key Invariants

These rules must always hold.

### Board invariants
- every node belongs to exactly one board
- every edge belongs to exactly one board
- every board has exactly one chat thread in MVP

### Edge invariants
- `sourceNodeId` and `targetNodeId` must exist
- both edge endpoints must belong to the same board as the edge
- deleted nodes cannot be used in new edges

### Mutation invariants
- backend validates all writes
- agent writes only through validated apply flow
- batch mutations are atomic
- operations are appended for every durable state change

### Chat invariants
- chat messages belong to one board thread
- agent replies may include action plans
- selection context is stored with user messages when provided

---

## 11. Non-Goals of the First API

The first API is not trying to solve:
- realtime collaborative merging
- external integrations
- role-based permissions
- long-lived workflow orchestration
- agent memory across all boards
- sophisticated layout intelligence
- cross-board references

Those can be layered later if the state model stays clean.

---

## 12. Recommended Implementation Order

### Phase 1 — Board foundation
- boards
- board state read endpoint
- nodes CRUD
- edges CRUD

### Phase 2 — Durability
- operations log
- batch mutations
- assets

### Phase 3 — Chat + agent
- chat thread
- chat messages
- agent action endpoint
- apply endpoint
- validation layer

### Phase 4 — Recovery and polish
- snapshots
- polling-based sync improvements
- undo foundations
- summaries

---

## 13. API Design Direction

The MVP API is REST-based.

Main groups:
- `/boards`
- `/boards/:boardId/state`
- `/boards/:boardId/nodes`
- `/nodes/:nodeId`
- `/boards/:boardId/edges`
- `/edges/:edgeId`
- `/assets`
- `/boards/:boardId/chat`
- `/boards/:boardId/agent/actions`
- `/boards/:boardId/agent/actions/apply`

The API should use:
- JSON request/response bodies
- consistent error envelope
- UUID ids
- ISO timestamps
- idempotency support for mutating operations where useful

---

## 14. Sync Strategy for MVP

Realtime is out of scope.

Frontend sync model:
- initial load via full board state
- mutations return updated resource or diff
- optional polling against operations or revision later
- server remains source of truth

This keeps MVP implementation simple while preserving a path to future realtime sync.

---

## 15. Data and Recovery Strategy

### Source of truth
Structured DB tables are source of truth.

### Operations log
All durable changes are logged for traceability.

### Snapshots
Optional snapshots may be stored:
- before large AI apply
- during autosave milestones
- before destructive restore points

### Deletion
Nodes and edges should use soft delete in MVP where practical.

---

## 16. Migration Path After MVP

When the product grows, the current architecture should allow extension without redesign.

### Likely next additions
- users
- board ownership
- sharing
- board membership
- realtime sync
- optimistic concurrency
- presence
- comments
- multiple chats per board

### Why current design supports that
Because we already have:
- structured board entities
- operations log
- stable ids
- validated mutation layer
- clear board/thread boundaries

---

## 17. Engineer Checklist

The backend implementation should satisfy the following:

- board state is persisted structurally
- nodes and edges are queryable independently
- all durable mutations write operations
- agent edits are never applied without validation
- batch apply is atomic
- edges cannot cross board boundaries
- one board automatically gets one chat thread
- uploads can back image nodes
- API responses are consistent and predictable
- design leaves room for multi-user migration later

---

## 18. Final Summary

This MVP is not “Miro clone with AI sprinkled on top.”

It is:

- a visual workspace
- a persistent board state model
- a controlled AI edit system
- a backend that preserves structure and history

The most important technical decision is this:

**the board is a structured system with validated operations, not an unbounded blob that the AI edits freely.**

That decision is what makes the product extensible, debuggable, and safe to build on.
