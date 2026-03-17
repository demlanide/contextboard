# Quickstart: Node CRUD

**Feature**: `005-node-crud` | **Date**: 2026-03-16

## Prerequisites

Before starting implementation, verify:

1. **Backend running**: `npm run dev` in `backend/` starts the Express server
2. **Database ready**: PostgreSQL is running with migrations applied through `007_narrow_operation_type.sql`
3. **Frontend running**: `npm run dev` in `frontend/` starts the Vite dev server
4. **Prior slices working**: Board create, list, state hydration, and revision infrastructure are functional

## Implementation Order

### Phase A: Backend Node Mutation Endpoints

Start with backend because the frontend depends on working APIs.

**Order within Phase A**:

1. **Node validation rules** (`domain/validation/node-rules.ts`) — pure functions, no I/O. Test first.
2. **Merge-patch utility** (`domain/patch/merge-patch.ts`) — pure function. Test first.
3. **Node repo extensions** (`repos/nodes.repo.ts`) — add `insertNode`, `updateNode`, `softDeleteNode`. Add cascade edge soft-delete in `repos/edges.repo.ts`.
4. **Zod request schemas** (`schemas/node.schemas.ts`) — create and update request parsing.
5. **Node service** (`services/nodes.service.ts`) — orchestrate validation + repo + operations via `withBoardMutation`.
6. **Node controller** (`http/controllers/nodes.controller.ts`) — thin HTTP handlers.
7. **Router registration** (`http/router.ts`) — mount node routes.
8. **Config limits** (`config/limits.ts`) — add node-specific limits if not already present.

**Verification**: Run `npm test` to confirm unit + integration + contract tests pass. Manually test with curl:

```bash
# Create a sticky node
curl -X POST http://localhost:3000/api/boards/{boardId}/nodes \
  -H "Content-Type: application/json" \
  -d '{"type":"sticky","x":100,"y":200,"width":200,"height":120,"content":{"text":"Hello"}}'

# Update node position
curl -X PATCH http://localhost:3000/api/nodes/{nodeId} \
  -H "Content-Type: application/merge-patch+json" \
  -d '{"x":300,"y":400}'

# Delete node
curl -X DELETE http://localhost:3000/api/nodes/{nodeId}

# Hydrate board to verify state
curl http://localhost:3000/api/boards/{boardId}/state
```

### Phase B: Frontend Canvas and Node Rendering

Build the read path first — render nodes from hydrated state before adding interactions.

**Order within Phase B**:

1. **Canvas component** (`components/canvas/Canvas.tsx`) — scrollable container with CSS transform panning.
2. **Node renderer** (`components/canvas/nodes/NodeRenderer.tsx`) — dispatch to type-specific components.
3. **Node type components** (`StickyNode.tsx`, `TextNode.tsx`, `ShapeNode.tsx`) — visual rendering.
4. **Canvas pan hook** (`hooks/useCanvasPan.ts`) — drag on empty area to translate viewport.
5. **Integrate into BoardPage** — replace canvas placeholder with real Canvas component.

**Verification**: Open a board that was seeded with nodes via curl. Confirm all node types render correctly at their positions.

### Phase C: Frontend Node Interactions

Add write interactions one at a time, from simplest to most complex.

**Order within Phase C**:

1. **Node API client** (`api/nodes.api.ts`) — createNode, updateNode, deleteNode functions.
2. **Store mutations** — add node CRUD actions to `board.store.ts` with optimistic UI.
3. **Node mutations hook** (`hooks/useNodeMutations.ts`) — orchestrate API calls + store updates.
4. **Toolbar + placement mode** (`CanvasToolbar.tsx`) — select node type, click-to-place.
5. **Node wrapper** (`NodeWrapper.tsx`) — selection, drag handles, resize handles, state indicators.
6. **Drag-to-move** (`hooks/useNodeDrag.ts`) — drag interaction with commit on release.
7. **Resize** (`hooks/useNodeResize.ts`) — resize handles with commit on release.
8. **Inline editing** (`InlineEditor.tsx`) — text editing with auto-save on blur.
9. **Delete + undo toast** (`UndoToast.tsx`) — delete action with timed undo.
10. **Pending/saved/failed indicators** — visual state in `NodeWrapper`.

**Verification**: Full end-to-end flow — create, edit, move, resize, delete nodes. Reload board to confirm persistence.

## Key Patterns

### Using withBoardMutation (backend)

All node mutations use the existing transaction wrapper:

```typescript
const node = await withBoardMutation(boardId, async ({ client, board }) => {
  // 1. Validate board editability
  // 2. Validate node-specific rules
  // 3. Execute repo operation
  // 4. Build operation entry
  const newRevision = board.revision + 1;
  return {
    result: createdNode,
    operations: [operation],
    newRevision,
  };
});
```

### Optimistic UI pattern (frontend)

```typescript
// 1. Apply optimistic change
store.addPendingNode(tempId, optimisticNode);

// 2. Call API
try {
  const confirmed = await api.createNode(boardId, payload);
  store.confirmNode(tempId, confirmed.node, confirmed.boardRevision);
} catch (err) {
  store.rollbackPendingNode(tempId);
  showError(err);
}
```

### Merge-patch application (backend)

```typescript
const merged = applyMergePatch(existingNode.content, patch.content);
validateContentForType(existingNode.type, merged); // throws on invalid
```

## Test Strategy

| Category | Location | What to test |
|----------|----------|--------------|
| Unit | `backend/tests/unit/node-rules.unit.test.ts` | Content validation per type, geometry validation, lock checks |
| Unit | `backend/tests/unit/merge-patch.unit.test.ts` | Merge-patch edge cases: null removal, nested merge, array replace |
| Integration | `backend/tests/integration/nodes.integration.test.ts` | Full transaction: create + revision bump + operation log; delete + cascade |
| Contract | `backend/tests/contract/nodes.contract.test.ts` | HTTP status codes, response shapes, content-type enforcement |
| Unit | `frontend/tests/unit/node-mutations.unit.test.ts` | Store mutation actions, optimistic/rollback flows |
| E2E | `frontend/tests/e2e/node-crud.e2e.test.ts` | Playwright: create all types, edit, move, delete, reload persistence |
