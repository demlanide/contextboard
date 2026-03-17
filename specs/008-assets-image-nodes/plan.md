# Implementation Plan: Assets and Image Nodes

**Branch**: `008-assets-image-nodes` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/008-assets-image-nodes/spec.md`

## Summary

Deliver asset upload, image-node placement, and browser upload flow for Context Board. Backend adds four new endpoints (upload, get metadata, get file, get thumbnail) with multipart handling, magic-byte MIME sniffing, synchronous thumbnail generation, board-scoped upload validation, and a storage abstraction interface. Image node creation is extended to validate `content.assetId` against existing assets with `ready` processingStatus. Frontend adds an upload button in the canvas toolbar, upload progress tracking, two-step upload-then-place flow with clear success/failure distinction, image node rendering from asset URLs, and drag-and-drop upload as a P3 enhancement. All asset mutations write operations log entries and integrate with the existing revision policy via `withBoardMutation`.

## Technical Context

**Language/Version**: TypeScript 5.7+ (Node.js LTS for backend, browser for frontend)
**Primary Dependencies**: Express (HTTP), Zod (schema validation), node-postgres (pg), multer (multipart), sharp (image processing/thumbnails) for backend; React 19, React Router 7, Zustand, Vite for frontend
**Storage**: PostgreSQL 15+ (asset metadata + board state); local filesystem or S3-compatible object storage (asset blobs + thumbnails); Zustand normalized store (frontend confirmed state)
**Testing**: Vitest + Supertest (backend unit/integration/contract); Vitest + React Testing Library (frontend unit); Playwright (frontend e2e)
**Target Platform**: Linux server/container (backend), modern desktop browsers (frontend)
**Project Type**: Full-stack web application (modular monolith backend + SPA frontend)
**Performance Goals**: Upload hard timeout 30s; p50 metadata reads < 150ms; file streaming begins within 500ms; thumbnail generation < 3s for images under 10MB
**Constraints**: Image upload max 20 MB; generic file max 50 MB; allowed MIME types in config; upload rate limit 20 req/min; boardId required at upload; synchronous thumbnail generation in MVP
**Scale/Scope**: Single user; 4 new API endpoints; ~18 new/modified backend files; ~12 new/modified frontend files; 1 new DB migration (assets table)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | Status | Evidence |
|---|-----------|--------|----------|
| I | Backend Source of Truth | PASS | Asset metadata persisted server-side. Frontend renders from asset URLs returned by backend. Image node creation validated against server asset state (FR-009, FR-022). |
| II | Revision as Sync Primitive | PASS | Asset upload writes `create_asset` operation. Image node mutations use `withBoardMutation` for single revision bump (FR-012, FR-013). Upload itself does not bump board revision — only node mutations do. |
| III | Operations-First Mutation | PASS | `create_asset` operation logged in same transaction as metadata persist. Image node create/update/delete operations logged via existing `buildOperation` (FR-013). |
| IV | Suggest/Apply Separation | N/A | No agent flows in this slice. Image node type already supported in action plan schema for future agent use. |
| V | Atomic Batch Durability | PASS | Upload is atomic (metadata + blob succeed together or neither persists). Image node mutations are atomic via existing transaction infrastructure. |
| VI | Contract-First Implementation | PASS | OpenAPI already defines asset endpoints and schemas. Implementation follows existing API contract (api.md §9). |
| VII | Vertical Slice Testability | PASS | 7 user stories independently testable. Slice includes upload API + validation + storage + metadata + image node validation + frontend upload flow + rendering + tests. |
| VIII | Modular Monolith | PASS | New `assets/` module for storage abstraction and image processing. New `assets.controller.ts`, `assets.service.ts`, `assets.repo.ts` follow established layering. |
| IX | Correctness Over Optimization | PASS | Magic-byte MIME sniffing validates actual content. `ready` status required before node creation. Synchronous thumbnail prevents incomplete state. |
| X | Explicit Budgets | PASS | Upload timeout (30s), file size limits (20MB/50MB), allowed MIME types, upload rate limit (20/min), thumbnail max dimensions — all in `config/limits.ts`. |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/008-assets-image-nodes/
├── plan.md                     # This file
├── research.md                 # Phase 0 output
├── data-model.md               # Phase 1 output
├── quickstart.md               # Phase 1 output
├── contracts/
│   └── asset-endpoints.md      # Phase 1 output — API endpoint contracts
└── checklists/
    └── requirements.md         # From /speckit.specify + /speckit.clarify
```

### Source Code (repository root)

```text
backend/
  src/
    config/
      limits.ts                             # MODIFIED — add asset/upload limits
    db/
      migrations/
        008_create_assets.sql               # NEW — assets table DDL
    http/
      router.ts                             # MODIFIED — register asset routes
      controllers/
        assets.controller.ts                # NEW — upload, get metadata, get file, get thumbnail
      middleware/
        upload.ts                           # NEW — multer config for multipart handling
    schemas/
      asset.schemas.ts                      # NEW — Zod schemas for upload/metadata
    services/
      assets.service.ts                     # NEW — upload orchestration, metadata CRUD, file retrieval
    domain/
      validation/
        asset-rules.ts                      # NEW — MIME, size, board-scoping, processingStatus rules
        node-rules.ts                       # MODIFIED — add assetId existence + ready-status validation for image nodes
    repos/
      assets.repo.ts                        # NEW — asset metadata CRUD
    assets/
      storage/
        storage.interface.ts                # NEW — AssetStorage interface
        local-storage.ts                    # NEW — local filesystem implementation
      image/
        mime-sniffer.ts                     # NEW — magic-byte MIME detection
        image-probe.ts                      # NEW — dimension extraction (width/height)
        thumbnail-generator.ts              # NEW — synchronous thumbnail generation via sharp
    obs/
      logger.ts                             # EXISTING — upload log events already planned
  tests/
    unit/
      asset-rules.unit.test.ts             # NEW
      mime-sniffer.unit.test.ts            # NEW
      thumbnail-generator.unit.test.ts     # NEW
    integration/
      assets.integration.test.ts           # NEW — upload + metadata + file retrieval
      image-node.integration.test.ts       # NEW — image node create with asset validation
    contract/
      assets.contract.test.ts              # NEW — HTTP endpoint contracts

frontend/
  src/
    api/
      assets.api.ts                         # NEW — uploadAsset, getAssetMetadata
    store/
      board.store.ts                        # MODIFIED — add assetsById, upload state tracking
      types.ts                              # MODIFIED — add asset types, upload state types
    components/
      canvas/
        CanvasToolbar.tsx                   # MODIFIED — add Upload Image button
        nodes/
          ImageNode.tsx                     # NEW — image node rendering from asset URL
          NodeRenderer.tsx                  # MODIFIED — dispatch to ImageNode for type=image
      upload/
        UploadButton.tsx                    # NEW — file input trigger + progress state
        UploadProgress.tsx                  # NEW — upload progress/status indicator
        DropZone.tsx                        # NEW — canvas drag-and-drop overlay (P3)
    hooks/
      useImageUpload.ts                     # NEW — upload flow with progress, error handling, placement
  tests/
    unit/
      image-upload.unit.test.ts            # NEW
```

**Structure Decision**: Full-stack slice following established patterns. Backend adds `assets.controller.ts`, `assets.service.ts`, `assets.repo.ts` in the existing layering, plus a new `assets/` module for storage abstraction and image processing utilities. Frontend adds upload components, an image node renderer, and an upload hook. The `assets/storage/` interface enables swapping local filesystem for S3 later without changing service logic.

## Constitution Check — Post-Design Re-evaluation

| # | Principle | Pre-design | Post-design | Notes |
|---|-----------|------------|-------------|-------|
| I | Backend Source of Truth | PASS | PASS | Asset metadata and blob storage are server-side. Frontend renders from server-provided URLs. Image node creation validated against server asset state. |
| II | Revision as Sync Primitive | PASS | PASS | Image node mutations use `withBoardMutation`. Asset upload writes `create_asset` operation with board revision. |
| III | Operations-First Mutation | PASS | PASS | `create_asset` operation appended in upload transaction. Image node operations use existing `buildOperation`. |
| IV | Suggest/Apply Separation | N/A | N/A | No agent flows. |
| V | Atomic Batch Durability | PASS | PASS | Upload: blob storage + metadata persist atomically (rollback deletes blob on failure). Node mutations atomic via existing infrastructure. |
| VI | Contract-First Implementation | PASS | PASS | `contracts/asset-endpoints.md` documents request/response shapes. Zod schemas match OpenAPI definitions. |
| VII | Vertical Slice Testability | PASS | PASS | Backend: unit (asset-rules, mime-sniffer, thumbnail), integration (upload + image node), contract (HTTP). Frontend: unit (upload hook), e2e (Playwright upload flow). |
| VIII | Modular Monolith | PASS | PASS | `assets/storage/` behind interface. `assets/image/` for processing. Controller → service → repo layering preserved. No cross-cutting changes. |
| IX | Correctness Over Optimization | PASS | PASS | Magic-byte sniffing, synchronous thumbnail, `ready` status gate. No caching. Full validation before blob persist. |
| X | Explicit Budgets | PASS | PASS | Upload timeout (30s), image size (20MB), generic file size (50MB), MIME allowlist, upload rate limit (20/min), thumbnail max dim (400px), all in `config/limits.ts`. |

**Post-design gate result**: PASS — no violations.

## Complexity Tracking

No constitution violations to justify.
