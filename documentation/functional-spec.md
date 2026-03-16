# Context Board MVP — Functional Specification

## 1. Purpose

This document defines the product behavior of the Context Board MVP.

It translates the existing overview, API contract, and data model into a functional specification that is explicit enough for implementation planning, task generation, and acceptance testing.

This document answers:
- what the system must do
- what the user can and cannot do in MVP
- what outcomes are expected for each core flow
- what edge cases must be handled consistently
- what conditions define "done" for implementation

This is a product behavior document, not a transport-level API reference and not a database schema.

---

## 2. Product Summary

Context Board is an AI-first visual workspace for thinking and planning on an infinite canvas.

A single user can:
- create boards
- place and edit visual objects on a board
- connect objects with edges
- upload images and place them on the board
- chat with an AI agent about the board
- ask the AI agent to suggest or apply structured edits
- persist board state, chat history, assets, and operations

The MVP is deliberately constrained:
- single-user only
- no authentication
- one board has exactly one chat thread
- backend is source of truth
- all durable mutations are validated and logged
- AI suggestions do not mutate state until explicitly applied

---

## 3. Functional Scope

### 3.1 In scope

The MVP must support:
- board creation
- board metadata update
- board loading
- board soft deletion
- board archival read-only behavior
- node CRUD for supported node types
- edge CRUD
- asset upload for image/file assets
- image node creation backed by uploaded assets
- board chat persistence
- AI suggest flow
- AI apply flow
- operation log retrieval for debugging and polling

### 3.2 Out of scope

The MVP does not need to support:
- authentication
- multiple users
- permissions or sharing
- realtime collaboration
- comments
- presence/cursors
- multiple chat threads per board
- autonomous long-running agents
- global cross-board memory
- advanced diagramming rules
- tables/databases inside the board
- presentation mode
- branching/version history UI

---

## 4. Actors

### 4.1 User

The human using the browser application.

Capabilities in MVP:
- creates boards
- edits board state
- uploads assets
- chats with agent
- reviews and applies agent suggestions

### 4.2 Agent

The AI assistant that can analyze board state and return:
- plain text responses
- optional structured action plans

The agent does not directly mutate durable board state.

### 4.3 Backend System

The backend API is responsible for:
- validating requests
- enforcing invariants
- persisting board/chat/asset state
- incrementing board revision
- writing operations log
- validating AI action plans before apply

---

## 5. Global Functional Rules

These rules apply across all flows.

### 5.1 Single-user assumption

The system operates as a single-user MVP. No auth or user identity management is required.

### 5.2 One board = one chat thread

Every board must have exactly one associated chat thread in MVP.

### 5.3 Backend is source of truth

The frontend may optimistically update UI, but the backend response is authoritative for persisted state.

### 5.4 Structured durable state

The board must not be treated as one opaque JSON blob. Nodes, edges, chat, assets, and operations are persisted as structured entities.

### 5.5 Durable changes are logged

Every durable mutation must be represented in the operations log.

### 5.6 Board revision is the sync primitive

Every successful durable mutation increments board revision exactly once per committed batch.

### 5.7 Suggest/apply separation

AI-generated edits must be split into:
- suggest: returns an action plan but does not mutate state
- apply: validates and commits the action plan transactionally

### 5.8 Batch atomicity

Batch edits and AI apply flows are all-or-nothing.

### 5.9 Soft delete preference

Boards, nodes, and edges should use non-destructive deletion behavior in MVP where practical.

---

## 6. Core Entities and Functional Meaning

### 6.1 Board

A board is the top-level workspace.

A board functionally owns:
- board metadata
- nodes
n- edges
- one chat thread
- operations history
- optional linked assets

Board states in MVP:
- active
- archived
- deleted

Behavior:
- active boards are editable
- archived boards are read-only
- deleted boards are excluded from normal listing

### 6.2 Node

A node is a visual object placed on the board.

Supported node types:
- sticky
- text
- image
- shape

Each node has:
- stable identity
- geometry
- z-order
- content payload
- style payload
- metadata payload
- deletion state
- optional lock/hidden flags

### 6.3 Edge

An edge expresses a relationship between two nodes on the same board.

Each edge has:
- source node
- target node
- optional label
- style payload
- metadata payload
- deletion state

### 6.4 Asset

An asset is an uploaded file.

MVP primary use case:
- uploaded image used by an image node

Assets are durable independent objects. Deleting an image node does not automatically delete the asset.

### 6.5 Chat thread and messages

Each board has one persistent chat thread.

Messages are append-only and may include:
- plain text
- optional structured message JSON
- optional selection context

### 6.6 Action plan

An action plan is a validated list of structured edit instructions proposed by the agent.

Allowed action types in MVP:
- create_node
- update_node
- delete_node
- create_edge
- update_edge
- delete_edge
- batch_layout

---

## 7. Board Lifecycle

## 7.1 Create board

### Goal
Allow the user to create a new workspace.

### Preconditions
- system is available
- request payload is valid

### Happy path
1. User creates a board with title and optional metadata.
2. System creates a board in active state.
3. System initializes board revision.
4. System automatically creates the board’s chat thread.
5. System returns created board and chat thread.

### Postconditions
- board exists in durable storage
- board is editable
- exactly one chat thread exists for the board
- board can be loaded immediately

### Acceptance criteria
- creating a board succeeds with valid input
- the new board appears in board listing
- the new board has status `active`
- the new board has revision initialized
- exactly one chat thread is created automatically
- repeated request with same idempotency key returns same result

## 7.2 Rename / update board metadata

### Goal
Allow the user to change board-level metadata.

### Editable fields in MVP
- title
- description
- viewport state
- settings
- summary if set through system flow

### Behavior
- update is partial
- server validates board exists and is editable
- successful update increments board revision
- operation log is written

### Acceptance criteria
- title can be changed
- description can be added/changed/cleared
- viewport state can be saved
- settings can be updated
- archived boards reject mutation
- deleted boards are not editable

## 7.3 List boards

### Goal
Allow the user to see available boards.

### Behavior
- returns non-deleted boards only by default
- deleted boards are excluded from normal listing
- archived boards may still appear in listing

### Acceptance criteria
- active boards are returned
- archived boards are returned unless future filtering says otherwise
- deleted boards are not returned in normal list response

## 7.4 Load board metadata

### Goal
Allow the user to load one board’s metadata.

### Behavior
- returns board if it exists and is not logically unavailable
- deleted boards may return not found in normal API behavior

### Acceptance criteria
- valid board id returns board metadata
- unknown board id returns not found

## 7.5 Load full board state

### Goal
Hydrate the full board view in one request.

### Returned data
- board metadata
- active nodes
- active edges
- board chat thread
- latest operation revision marker

### Behavior
- deleted nodes and edges are excluded by default
- this is the primary initial hydration endpoint
- backend response is authoritative for client state

### Acceptance criteria
- state endpoint returns board metadata
- state endpoint returns only non-deleted nodes and edges
- state endpoint returns chat thread metadata
- state endpoint includes latest revision marker

## 7.6 Archive board

### Goal
Allow the board to be made read-only without removing it from storage.

### Behavior
- archived boards remain readable
- archived boards reject normal edit operations
- archived boards can be restored later by a future or internal flow

### Acceptance criteria
- archived board remains loadable
- archived board rejects node, edge, chat-triggered mutation, and agent apply mutations
- archived board can still expose historical state

## 7.7 Delete board

### Goal
Remove a board from normal use without requiring hard deletion.

### Behavior
- delete transitions board to `deleted`
- deleted boards are excluded from normal board listing
- deleted boards are not editable
- hard delete is not required for MVP
- deleted boards are treated as not found by normal metadata/state read endpoints

### Acceptance criteria
- delete changes board status to `deleted`
- deleted board disappears from normal listing
- deleted board cannot be mutated
- deleted board metadata/state reads return not found in the normal API

---

## 8. Node Functional Specification

## 8.1 Supported node types

### sticky
Purpose: short note content
Required content: `text`

### text
Purpose: longer freeform text block
Required content: `text`
Optional content: `title`

### image
Purpose: visual reference backed by uploaded asset
Required content: `assetId`
Optional content: `caption`

### shape
Purpose: simple diagram shape
Required content: `shapeType`
Allowed shape types in MVP:
- rectangle
- ellipse
- diamond
Optional content: `text`

## 8.2 Create node

### Goal
Allow the user to place a new visual object on the board.

### Preconditions
- board exists
- board is editable
- node type is supported
- geometry is valid
- content satisfies node-type-specific rules
- for image nodes, referenced asset exists and is valid

### Happy path
1. User submits node data.
2. System validates request.
3. System inserts node.
4. System increments board revision.
5. System writes operation log entry.
6. System returns created node.

### Acceptance criteria
- sticky node can be created with text
- text node can be created with text and optional title
- image node can be created only with valid asset reference
- shape node can be created only with allowed shapeType
- width and height must be greater than zero
- invalid node type is rejected
- archived board rejects creation
- missing image asset reference returns validation failure
- successful create increments board revision once
- operation log contains create_node entry

## 8.3 Update node

### Goal
Allow the user to change node geometry or content.

### Editable parts
- x, y
- width, height
- rotation
- z-index
- content
- style
- metadata
- hidden
- locked where permitted by system rules

### Behavior
- partial update semantics apply
- unknown style/metadata keys may be preserved if valid
- invalid core content for node type must be rejected
- locked nodes reject normal edit/apply mutations

### Acceptance criteria
- node position can be updated
- node size can be updated
- node text/content can be updated
- style can be updated
- metadata can be updated
- invalid image asset reference is rejected
- locked node update returns `409 LOCKED_NODE`
- successful update increments board revision once
- operation log contains update_node entry

## 8.4 Delete node

### Goal
Allow the user to remove a node from active board state.

### Behavior
- node is soft-deleted
- connected edges are also soft-deleted in same transaction
- successful delete increments board revision once
- operation log entries are written for affected durable changes

### Acceptance criteria
- deleted node is excluded from normal state response
- connected edges are excluded from normal state response after delete
- deletion is transactional
- successful delete increments board revision once for the whole committed change set
- archived board rejects delete

## 8.5 Restore node

Restore behavior is useful at data-model level and future recovery level, but a public restore endpoint is not required in the first MVP API unless explicitly implemented.

If restore is implemented later:
- node can be restored only if board is editable
- dependent edge restore behavior must be explicit and validated

---

## 9. Edge Functional Specification

## 9.1 Create edge

### Goal
Allow the user to visually connect two nodes.

### Preconditions
- board exists and is editable
- source node exists
- target node exists
- source and target belong to same board
- source and target are not deleted
- source and target are not equal in MVP

### Happy path
1. User submits source and target node ids.
2. System validates both endpoints.
3. System creates edge.
4. System increments board revision.
5. System writes operation log entry.
6. System returns created edge.

### Acceptance criteria
- valid edge between two active nodes is created
- self-loop is rejected in MVP
- cross-board edge is rejected
- edge to deleted node is rejected
- successful create increments board revision once
- operation log contains create_edge entry

## 9.2 Update edge

### Goal
Allow the user to modify edge label/style/metadata.

### Editable parts
- label
- style
- metadata

### Behavior
- source/target changes are allowed only if invariants remain valid
- invalid references are rejected

### Acceptance criteria
- label can be added/changed/removed
- style can be updated
- metadata can be updated
- invalid endpoint references are rejected
- successful update increments board revision once
- operation log contains update_edge entry

## 9.3 Delete edge

### Goal
Allow the user to remove a connector from active board state.

### Behavior
- edge is soft-deleted
- successful delete increments board revision once
- operation log is written

### Acceptance criteria
- deleted edge is excluded from normal state responses
- archived board rejects delete
- operation log contains delete_edge entry

---

## 10. Asset Functional Specification

## 10.1 Upload asset

### Goal
Allow the user to upload a file, primarily an image for use on the board.

### Supported MVP behavior
- upload image or generic file
- return asset metadata
- allow later association with a board and/or image node

### Behavior
- request uses multipart upload
- system stores asset metadata durably
- system assigns processing status
- system returns metadata including file URL and thumbnail when available

### Acceptance criteria
- valid image upload succeeds
- file larger than allowed limit is rejected
- unsupported mime type can be rejected by configuration
- uploaded asset receives durable id
- asset metadata can be retrieved later

## 10.2 Get asset metadata

### Goal
Allow the client to fetch stored metadata for an uploaded asset.

### Acceptance criteria
- valid asset id returns metadata
- unknown asset id returns not found

## 10.3 Use image asset in image node

### Goal
Allow uploaded images to appear as board nodes.

### Behavior
- image node creation requires `content.assetId`
- referenced asset must exist
- asset kind should be compatible with image node usage

### Acceptance criteria
- image node with valid uploaded image asset succeeds
- image node with missing asset fails validation
- deleting the image node does not automatically delete asset file in MVP

---

## 11. Chat Functional Specification

## 11.1 Get board chat

### Goal
Allow the client to load the persistent board conversation.

### Behavior
- returns board thread metadata and recent messages
- thread exists automatically for each board

### Acceptance criteria
- valid board returns thread and messages
- unknown board returns not found

## 11.2 Send chat message

### Goal
Allow the user to chat with the board-aware agent.

### Inputs
- message text
- optional selection context containing selected ids and viewport

### Behavior
1. User sends a message.
2. System validates payload.
3. System persists user message.
4. System builds agent context from board state and optional selection context.
5. System generates agent reply.
6. System persists agent reply.
7. System returns both user and agent messages.

### Important rule
Plain chat messaging does not mutate board state by itself.

### Acceptance criteria
- valid user message is stored
- optional selection context is stored with the user message
- agent response is returned and stored
- agent response may include actionPlan in structured message JSON
- plain chat request does not increment board revision unless it causes a durable board mutation, which MVP plain chat should not
- archived board allows chat/history reads only; new chat messages and agent mutation flows are rejected

---

## 12. Agent Functional Specification

## 12.1 Agent analysis / suggest flow

### Goal
Allow the user to ask the agent for help analyzing or reorganizing the board without immediately mutating state.

### Inputs
- prompt
- mode = `suggest`
- optional selection context

### Behavior
1. User asks the agent to analyze or propose changes.
2. Backend builds AI context from board, selection, and prompt.
3. Agent returns:
   - assistant text
   - optional action plan
4. Backend validates returned action plan shape and references before returning it.
5. Backend stores the agent message.
6. No board mutation occurs.

### Acceptance criteria
- suggest returns assistant text
- suggest may return valid action plan
- suggest must not mutate board state
- suggest must not increment board revision
- backend rejects malformed action plans rather than returning unsafe output as valid
- preview data may be returned for affected entities/temp ids

## 12.2 Agent apply flow

### Goal
Allow the user to explicitly apply a previously suggested action plan.

### Inputs
- source agent message id
- action plan

### Behavior
1. User chooses to apply action plan.
2. Backend validates board is editable.
3. Backend validates every action item.
4. Backend optionally creates snapshot before apply.
5. Backend applies all actions in one transaction.
6. Backend increments board revision once.
7. Backend writes all durable operations.
8. Backend returns created, updated, and deleted entities/diffs.

### Acceptance criteria
- valid action plan applies successfully
- invalid action plan fails whole request
- no partial state is committed on failure
- successful apply increments board revision exactly once
- all durable changes are logged
- created temp ids are resolvable to real ids in response or derived result
- archived board rejects apply

## 12.3 Allowed action plan capabilities

The agent may only propose allowed action item types in MVP.

Allowed:
- create node
- update node
- delete node
- create edge
- update edge
- delete edge
- batch layout

Not allowed:
- raw SQL/database operations
- cross-board edits
- hidden side effects outside returned plan
- direct mutation without user-approved apply flow

## 12.4 Validation expectations for action plans

The backend must validate:
- action item type is allowed
- referenced ids exist where required
- targets belong to the same board
- image node creation references valid asset
- edge references are valid
- locked nodes are not mutated through normal edit/apply flow
- batch item count is within limit
- malformed or destructive invalid items fail the whole apply request

---

## 13. Operations and Sync Functional Specification

## 13.1 Operations log

### Goal
Provide a durable audit trail and future polling primitive.

### Behavior
- every durable mutation writes operation rows
- operation rows carry revision and payload context
- operation feed can be queried after a known revision

### Acceptance criteria
- create/update/delete board state writes operations
- AI apply writes operations for durable changes
- operation retrieval after a revision returns ordered changes

## 13.2 Revision behavior

### Goal
Make state synchronization deterministic for MVP.

### Rules
- each successful committed mutation batch increments board revision exactly once
- failed mutation does not increment revision
- suggest-only and read-only operations do not increment revision

### Acceptance criteria
- create node increments once
- update node increments once
- delete node plus cascaded edge delete still increments once for the transaction
- AI apply increments once for the whole plan
- chat-only message flow does not increment board revision

---

## 14. Read-only vs Mutable Behavior Matrix

### 14.1 Active board
Allowed:
- load state
- edit board metadata
- create/update/delete nodes
- create/update/delete edges
- upload assets
- send chat messages
- request agent suggestions
- apply agent action plans

### 14.2 Archived board
Allowed:
- list board
- load board metadata
- load board state
- load chat
- optionally send non-mutating analytical chat requests if product chooses to allow this

Rejected:
- board metadata mutation
- node mutation
- edge mutation
- AI apply mutation

### 14.3 Deleted board
Allowed:
- no normal user-facing mutation flows

Rejected or absent:
- normal listing
- normal editing
- normal board state usage

---

## 15. Error and Edge-Case Expectations

The functional behavior must be consistent in the following situations.

### 15.1 Missing resources
- unknown board returns not found
- unknown node returns not found
- unknown edge returns not found
- unknown asset returns not found

### 15.2 Invalid board state transitions
- archived board rejects mutation
- deleted board rejects normal access/mutation

### 15.3 Invalid node requests
- unsupported node type is rejected
- invalid geometry is rejected
- image node without valid asset is rejected
- shape node without allowed shapeType is rejected

### 15.4 Invalid edge requests
- source or target missing is rejected
- source and target on different boards is rejected
- source equals target is rejected in MVP
- deleted nodes cannot be used in new edges

### 15.5 Invalid action plans
- unknown action type invalidates whole plan
- invalid target id invalidates whole plan
- cross-board action invalidates whole plan
- malformed payload invalidates whole plan
- over-limit batch size invalidates whole plan

### 15.6 Locked nodes
- normal edit endpoints reject mutation of locked nodes
- agent apply flow also rejects mutation of locked nodes unless an explicit future override policy exists

### 15.7 Idempotent retries
- supported POST mutations may be retried safely with same idempotency key and same request payload
- same key with different payload must fail consistently

---

## 16. Functional Limits for MVP

Recommended limits:
- max nodes per board: 5,000 soft limit
- max edges per board: 10,000 soft limit
- max action-plan or batch item count: 200
- max chat message length: 20,000 characters
- max image upload size: 20 MB
- max generic file upload size: 50 MB

These are product constraints for MVP and may be enforced in validation.

---

## 17. Acceptance Checklist by Capability

A backend implementation is functionally acceptable for MVP when all of the following are true:

### Board foundation
- board can be created
- board auto-creates one chat thread
- board can be listed
- board can be loaded
- board can be renamed/updated
- board can be archived/deleted according to lifecycle rules

### State hydration
- client can load full board state in one request
- only active nodes/edges are returned by default
- current revision marker is returned

### Nodes
- all supported node types can be created with valid payloads
- nodes can be updated
- nodes can be soft-deleted
- deleting a node also removes connected edges from active state

### Edges
- valid edges can be created
- invalid references are rejected
- edges can be updated and soft-deleted

### Assets
- asset upload works
- uploaded images can back image nodes
- asset metadata is retrievable

### Chat
- user messages persist
- selection context persists when provided
- agent replies persist
- chat alone does not mutate board state

### Agent
- suggest returns safe validated output without mutation
- apply commits validated plans atomically
- failed apply commits nothing

### Durability and sync
- every durable mutation writes operations
- revision increments exactly once per successful mutation batch
- operations can be read after revision

---

## 18. Recommended Implementation Notes for Task Generation

When generating engineering tasks from this functional spec, tasks should be organized around vertical functional slices instead of only by technical layer.

Suggested slices:
1. boards + lifecycle + auto thread creation
2. full board state hydration
3. nodes CRUD + validation
4. edges CRUD + validation
5. revisioning + operations log
6. assets upload + image node compatibility
7. chat persistence + selection context
8. agent suggest flow
9. agent apply flow + transactionality + validation
10. operations polling endpoint

Each slice should include:
- API behavior
- validation rules
- persistence behavior
- revision behavior
- operation log behavior
- acceptance tests

---

## 19. Final Summary

The Context Board MVP is functionally defined by one core promise:

A user can think visually on a persistent board, discuss that board with an AI assistant, and safely apply AI-proposed structured edits without giving the AI uncontrolled write access.

The most important product behavior rules are:
- one board has one chat thread
- backend is source of truth
- durable mutations are validated and logged
- revision is the sync primitive
- AI suggestion is separate from AI apply
- apply is atomic

If these rules hold consistently across board, node, edge, asset, chat, and agent flows, the MVP is functionally coherent and ready for implementation planning.
