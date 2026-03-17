# Research: Node CRUD

**Feature**: `005-node-crud` | **Date**: 2026-03-16

## R-001: JSON Merge Patch implementation for JSONB fields

**Decision**: Implement a recursive `applyMergePatch` utility in `domain/patch/merge-patch.ts` that handles content, style, and metadata JSONB fields per RFC 7396 semantics.

**Rationale**: The existing codebase has no merge-patch utility. Node updates require merge-patch for nested JSONB fields (content, style, metadata) where scalar fields overwrite, objects merge recursively, arrays replace fully, and `null` removes a key. A dedicated utility centralizes this logic and is reused by future edge updates and batch mutations.

**Alternatives considered**:
- Use a third-party library (e.g., `json-merge-patch` npm package) — rejected because the logic is simple (~30 lines), avoids an extra dependency, and keeps behavior transparent for testing.
- Apply merge-patch at the SQL level with `jsonb_strip_nulls` + `||` — rejected because recursive object merging is not natively supported by PostgreSQL's `||` operator (it replaces top-level keys only), and content validation must happen in the application layer before SQL.

## R-002: Node content validation by type

**Decision**: Implement content validation as a dispatch function in `domain/validation/node-rules.ts` that switches on `node.type` and applies per-type rules. Reuse for both create (full validation) and update (partial validation of changed content fields).

**Rationale**: Each node type has different required content fields (sticky: text; text: text + optional title; shape: shapeType + optional text; image: assetId). A single dispatch function keeps this logic in one place and is easily extendable for future node types.

**Alternatives considered**:
- Validate in Zod schema discriminated unions — rejected because Zod discriminated unions would require `type` in the update payload (which isn't required for PATCH), and domain-level content validation needs access to the existing node's type to validate partial patches.
- Separate validator classes per type — rejected as over-engineered for 4 types with simple rules.

## R-003: Cascade edge soft-delete on node delete

**Decision**: When deleting a node, the `nodes.service.ts` delete flow queries for all active edges where the node is source or target, soft-deletes them, and writes `delete_edge` operation entries for each — all within the same `withBoardMutation` transaction. The single revision bump covers both the node delete and all cascaded edge deletes.

**Rationale**: The spec requires cascade edge deletion in the same operation (FR-014) with a single revision increment (FR-018). Performing the cascade inside `withBoardMutation` guarantees atomicity. Writing individual `delete_edge` operation entries (not just the `delete_node` entry) ensures the operations log is complete for future undo/replay.

**Alternatives considered**:
- Use PostgreSQL `ON DELETE CASCADE` on the FK — rejected because the app uses soft-delete (set `deleted_at`), not hard delete, and PostgreSQL cascades only trigger on actual row deletion.
- Write a single `delete_node` operation with cascaded edge IDs in the payload — rejected because individual `delete_edge` operations are more useful for future undo, replay, and polling consumers.

## R-004: Frontend canvas rendering approach

**Decision**: Use a standard DOM-based rendering approach with absolutely positioned `<div>` elements for nodes within a scrollable canvas container. Nodes are rendered from the Zustand `nodesById` confirmed state. The canvas container supports panning via CSS transforms (translate) on a content layer.

**Rationale**: DOM rendering is the simplest approach for MVP. The scale target is up to ~500 nodes in typical use (5,000 soft limit). DOM elements provide native text editing, accessibility, and standard event handling without a Canvas 2D/WebGL abstraction layer. CSS transform-based panning is performant for this scale.

**Alternatives considered**:
- HTML5 Canvas 2D — rejected for MVP because it complicates text editing (requires custom text input overlays), loses DOM accessibility, and adds implementation complexity. Can be introduced later if performance requires it.
- SVG — rejected because it shares DOM overhead with HTML divs but adds SVG-specific complexity without clear benefit for rectangular node types.
- React Flow / similar library — rejected because the project uses a custom canvas model, and introducing a large third-party canvas library at this point would constrain future flexibility and add significant dependency weight.

## R-005: Optimistic UI and undo-toast for delete

**Decision**: For node create and move, use optimistic UI with immediate visual feedback and rollback on failure. For node delete, use optimistic removal + a timed undo toast (5 seconds). The delete request is sent immediately. If the user clicks "Undo" before the toast expires, the frontend restores the node from a pre-delete snapshot. If the delete request is already confirmed, an undo is no longer possible (the toast dismisses or shows "already deleted").

**Rationale**: The spec requires lightweight delete confirmation via undo toast (clarification Q4). Sending the delete request immediately keeps the UX direct while giving users a brief window to reverse accidental deletes. This pattern is standard in modern productivity tools (Gmail, Notion, Figma).

**Alternatives considered**:
- Delay the delete request until the toast expires — rejected because it introduces a window where the UI shows the node as deleted but the server still considers it active, creating a consistency gap. Also complicates the case where the user navigates away during the delay.
- Full undo/redo stack — rejected as out of scope for this slice. The undo toast is a targeted solution for the most common accidental action.

## R-006: Node selection and interaction model

**Decision**: Single click selects a node (shows selection outline and resize handles). Double-click on a sticky or text node enters inline text editing mode. Clicking on empty canvas deselects all nodes. Selection state lives in `ui.selectedNodeIds` in the Zustand store.

**Rationale**: This is the standard interaction model for canvas-based editors. Single-click for selection, double-click for text editing is intuitive and matches user expectations from Figma, Miro, and similar tools.

**Alternatives considered**:
- Single click enters editing immediately — rejected because it prevents click-to-select without editing, making drag-to-move impossible without a separate grab handle.
