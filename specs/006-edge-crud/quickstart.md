# Quickstart: Edge CRUD

**Feature Branch**: `006-edge-crud`
**Date**: 2026-03-16

## Prerequisites

- Node.js LTS (v20+)
- PostgreSQL 15+ running locally or via Docker
- Backend and frontend dependencies installed (`npm install` in both `backend/` and `frontend/`)
- Database migrations applied (`npm run migrate` in `backend/`)

The `board_edges` table already exists from migration `006_create_board_edges.sql`. No new migrations are needed for this feature.

## Backend Development

### Start the backend

```bash
cd backend
npm run dev
```

### Key files to implement (in order)

1. **`src/config/limits.ts`** — Add edge-specific limits:
   - `edge.label.max: 1000`

2. **`src/domain/validation/edge-rules.ts`** — Domain validation:
   - `EdgeError`, `EdgeNotFoundError` error classes
   - `assertEdgeExists(edge)` — throws EDGE_NOT_FOUND
   - `assertEdgeActive(edge)` — throws EDGE_NOT_FOUND if soft-deleted
   - `assertEndpointsExist(sourceNode, targetNode)` — throws INVALID_EDGE_REFERENCE
   - `assertEndpointsActive(sourceNode, targetNode)` — throws INVALID_EDGE_REFERENCE
   - `assertEndpointsSameBoard(boardId, sourceNode, targetNode)` — throws INVALID_EDGE_REFERENCE

3. **`src/schemas/edge.schemas.ts`** — Zod request/response schemas:
   - `CreateEdgeRequestSchema` — sourceNodeId, targetNodeId (required uuid), label, style, metadata
   - `UpdateEdgeRequestSchema` — label, style, metadata (all optional)
   - `EdgeResponseDataSchema` — edge + boardRevision
   - `DeleteEdgeResponseDataSchema` — success, deletedEdgeId, boardRevision

4. **`src/repos/edges.repo.ts`** — Extend with:
   - `findActiveById(client, edgeId)` — single edge lookup
   - `insertEdge(client, params)` — INSERT with all fields
   - `updateEdge(client, edgeId, fields)` — dynamic SET for label/style/metadata
   - `softDeleteEdge(client, edgeId)` — SET deleted_at = now()

5. **`src/services/edges.service.ts`** — Mutation orchestration:
   - `createEdge(boardId, body)` — uses `withBoardMutation`, validates, inserts, builds operation
   - `updateEdge(edgeId, body)` — uses `withBoardMutation`, validates, updates, builds operation
   - `deleteEdge(edgeId)` — uses `withBoardMutation`, validates, soft-deletes, builds operation

6. **`src/http/controllers/edges.controller.ts`** — Request handlers:
   - `handleCreateEdge` — parse boardId param + body, delegate to service
   - `handleUpdateEdge` — parse edgeId param + body, delegate to service
   - `handleDeleteEdge` — parse edgeId param, delegate to service

7. **`src/http/router.ts`** — Register routes:
   - `POST /boards/:boardId/edges` with `idempotencyMiddleware('create_edge')`
   - `PATCH /edges/:edgeId` with `requireMergePatch` + `idempotencyMiddleware('update_edge')`
   - `DELETE /edges/:edgeId`

### Verify backend

```bash
# Create a board
curl -s -X POST http://localhost:3000/api/boards \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test Board"}' | jq

# Create two nodes (note the board ID from above)
curl -s -X POST http://localhost:3000/api/boards/{boardId}/nodes \
  -H 'Content-Type: application/json' \
  -d '{"type":"sticky","x":100,"y":100,"width":200,"height":200,"content":{"text":"Node A"}}' | jq

curl -s -X POST http://localhost:3000/api/boards/{boardId}/nodes \
  -H 'Content-Type: application/json' \
  -d '{"type":"sticky","x":400,"y":100,"width":200,"height":200,"content":{"text":"Node B"}}' | jq

# Create an edge (use node IDs from above)
curl -s -X POST http://localhost:3000/api/boards/{boardId}/edges \
  -H 'Content-Type: application/json' \
  -d '{"sourceNodeId":"{nodeAId}","targetNodeId":"{nodeBId}","label":"leads to"}' | jq

# Update the edge label
curl -s -X PATCH http://localhost:3000/api/edges/{edgeId} \
  -H 'Content-Type: application/merge-patch+json' \
  -d '{"label":"depends on"}' | jq

# Delete the edge
curl -s -X DELETE http://localhost:3000/api/edges/{edgeId} | jq

# Verify edge is gone from board state
curl -s http://localhost:3000/api/boards/{boardId}/state | jq '.data.edges'
```

## Frontend Development

### Start the frontend

```bash
cd frontend
npm run dev
```

### Key files to implement (in order)

1. **`src/api/edges.api.ts`** — API client functions:
   - `createEdge(boardId, body)` → POST
   - `updateEdge(edgeId, body)` → PATCH with merge-patch content type
   - `deleteEdge(edgeId)` → DELETE

2. **`src/store/board.store.ts`** — Add edge actions:
   - `addEdge(edge)` — optimistic insert into edgesById + edgeOrder
   - `updateEdge(edgeId, changes)` — optimistic update
   - `removeEdge(edgeId)` — optimistic removal
   - `confirmEdge(tempId, serverEdge)` — reconcile optimistic with confirmed

3. **`src/components/canvas/edges/EdgeRenderer.tsx`** — Render confirmed edges:
   - SVG layer overlaying the canvas
   - Lines from source node center to target node center
   - Label display on edge

4. **`src/components/canvas/edges/PreviewEdge.tsx`** — Render temporary edge during drag:
   - Dashed line from source node to cursor position
   - Disappears when drag ends

5. **`src/components/canvas/edges/ConnectionHandle.tsx`** — Drag source on nodes:
   - Small handle element on each node
   - Initiates connection drag on pointerdown

6. **`src/hooks/useEdgeConnection.ts`** — Drag-to-connect interaction:
   - Track drag state (source node, cursor position, hovered target)
   - Classify valid/invalid targets
   - Trigger edge creation on valid drop

7. **`src/hooks/useEdgeMutations.ts`** — Edge mutation orchestration:
   - `createEdge` — optimistic add, API call, reconcile or rollback
   - `updateEdge` — optimistic update, API call, reconcile or rollback
   - `deleteEdge` — optimistic remove, API call, confirm or restore

### Run tests

```bash
# Backend
cd backend
npm test

# Frontend
cd frontend
npm test

# E2E
cd frontend
npx playwright test
```
