# Research: Edge CRUD

**Feature Branch**: `006-edge-crud`
**Date**: 2026-03-16

## Overview

This research resolves all unknowns from the Technical Context and documents decisions for edge CRUD implementation. The tech stack is fully established from prior slices (001–005), so research focuses on edge-specific patterns and the frontend connection interaction.

## R1: Backend Edge Service Pattern

**Decision**: Follow the exact same controller → service → repo layering used by `nodes.service.ts` and `nodes.controller.ts`.

**Rationale**: The node CRUD implementation in 005 established the definitive pattern for entity mutation in this codebase. Edge CRUD has identical structural requirements: three endpoints, domain validation, `withBoardMutation` for atomic revision+operations, and response envelope formatting. Reusing the pattern minimizes cognitive overhead and ensures consistency.

**Alternatives considered**:
- Shared base service class: Rejected — adds unnecessary abstraction for MVP. Two concrete services (nodes, edges) are simpler to reason about than a generalized entity service.
- Inline edge logic in nodes service: Rejected — violates modular monolith boundary. Edges are a distinct domain concern with their own validation rules.

## R2: Edge Domain Validation Approach

**Decision**: Create `edge-rules.ts` following the same error-class + assertion-function pattern used by `node-rules.ts` and `board-rules.ts`.

**Rationale**: The existing validation modules use a consistent pattern: domain-specific error classes (`NodeError`, `BoardError`) with `code` properties, plus `assert*` functions that throw typed errors. Edge validation follows the same shape: `EdgeError`, `EdgeNotFoundError`, `assertEdgeExists`, `assertEdgeSameBoard`, `assertEndpointsActive`, `assertNotSelfLoop`.

**Alternatives considered**:
- Zod-only validation: Rejected — Zod handles request-shape validation well, but domain rules (same-board check, active-node check) require database queries and conditional logic that don't fit Zod's declarative model.
- Combined validation middleware: Rejected — domain validation belongs in the service layer where it has access to the database transaction, not in middleware.

## R3: Edge Endpoint Immutability Enforcement

**Decision**: The Zod `UpdateEdgeRequest` schema will only allow `label`, `style`, and `metadata` fields (matching OpenAPI `UpdateEdgeRequest`). `sourceNodeId` and `targetNodeId` are not included in the update schema at all.

**Rationale**: Per clarification session (2026-03-16), endpoints are immutable after creation. The simplest enforcement is at the schema level — if the fields aren't in the schema, they can't be submitted. This is simpler and safer than accepting them and then rejecting at the domain layer.

**Alternatives considered**:
- Accept endpoint fields in update but reject at domain layer: Rejected — unnecessary complexity. Better to not accept them at all.
- Strip unknown fields silently: Rejected — the OpenAPI schema uses `additionalProperties: false`, so extra fields should cause a 422, not be silently ignored.

## R4: Edge Repo Extensions

**Decision**: Extend the existing `edges.repo.ts` with `findActiveById`, `insertEdge`, `updateEdge`, and `softDeleteEdge` functions. Follow the pattern from `nodes.repo.ts`.

**Rationale**: The repo already has `findActiveByBoardId` (for hydration) and `softDeleteByNodeId` (for cascade). The new functions complete the CRUD surface. Using the same `PoolClient` parameter pattern enables transaction support through `withBoardMutation`.

**Alternatives considered**:
- New repo file: Rejected — one repo per table is the established convention. The existing file is small.
- Repository class pattern: Rejected — the codebase uses functional exports, not classes. Consistency preferred.

## R5: Frontend Connection Interaction Pattern

**Decision**: Implement drag-to-connect using React pointer events and local component state for the preview edge, coordinated through a `useEdgeConnection` hook.

**Rationale**: The existing codebase uses React hooks for canvas interactions (`useCanvasPan`, `useNodeDrag`, `useNodeResize`). A `useEdgeConnection` hook fits this pattern. The hook manages: (1) connection drag state (source node, cursor position, whether hovering a valid target), (2) preview edge rendering data, and (3) the create-edge call on release.

**Alternatives considered**:
- Canvas-level event delegation: Rejected — the existing pattern uses per-component hooks, not centralized event handlers.
- Third-party drag library (e.g., react-dnd): Rejected — adds dependency for a simple pointer-event flow. The existing hooks already demonstrate the pattern without a library.

## R6: Edge Rendering on Canvas

**Decision**: Render edges as SVG `<line>` or `<path>` elements in an SVG layer overlaying the canvas, positioned using the source and target node center coordinates.

**Rationale**: SVG is well-suited for line rendering with styling, and overlaying an SVG layer on the existing canvas is straightforward. Edge positions are derived from the node positions already stored in the Zustand store. The preview edge follows the same rendering path but uses the cursor position as the target.

**Alternatives considered**:
- Canvas 2D API: Rejected — the existing canvas uses DOM/React components for nodes. Mixing Canvas 2D for edges only adds complexity. SVG integrates naturally with the existing React rendering.
- HTML div-based lines: Rejected — SVG provides native line/path support with stroke styling. Divs require rotation transforms and are harder to style for curves.

## R7: Valid/Invalid Target Feedback

**Decision**: During a connection drag, iterate the visible nodes and classify each as valid or invalid based on: (1) not the source node (no self-loop), (2) not soft-deleted. Apply a CSS class to valid/invalid nodes for visual distinction.

**Rationale**: The frontend already knows which nodes are active (from the store). Self-loop rejection is client-side for UX feedback (backed by server validation per FR-016). The classification is simple enough to compute on every pointer move without performance concern for MVP node counts (< 5,000).

**Alternatives considered**:
- Server-side target validation on hover: Rejected — adds latency to an interaction that must feel instantaneous. Client-side pre-validation is sufficient for UX; server validates authoritatively on submit.
- Pre-compute valid targets on drag start: A reasonable optimization for large boards, but unnecessary for MVP scale. The per-move classification is trivial for < 5,000 nodes.

## R8: Edge Mutation Reconciliation

**Decision**: Follow the same optimistic-then-reconcile pattern used by node mutations in `useNodeMutations.ts` and `board.store.ts`.

**Rationale**: The frontend state sync documentation specifies that edge mutations follow the same durable backend mutation strategy as nodes. The create response returns the full edge entity and board revision; the store reconciles by replacing the optimistic entry with the server-confirmed one. For delete, the store removes the edge optimistically and confirms on server response (or restores on failure).

**Alternatives considered**:
- No optimistic UI for edges: Rejected — creating an edge should feel instant. The preview-to-confirmed transition would be jarring with a visible loading delay.
- Full rehydration after each mutation: Rejected — unnecessarily heavy. The mutation response contains the confirmed entity.

## Summary

No NEEDS CLARIFICATION items remain. All decisions align with established patterns from prior slices and the project constitution.
