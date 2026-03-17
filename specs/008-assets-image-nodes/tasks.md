# Tasks: Assets and Image Nodes

**Input**: Design documents from `/specs/008-assets-image-nodes/`
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

**Purpose**: Install new dependencies, add configuration, create DB migration, and establish the storage abstraction that all asset-related user stories depend on.

- [X] T001 Install backend dependencies: multer, sharp, file-type, @types/multer in backend/package.json
- [X] T002 Add asset/upload limits to backend/src/config/limits.ts — imageMaxSizeBytes (20 MB), fileMaxSizeBytes (50 MB), allowedMimeTypes array, thumbnailMaxDim (400), captionMaxLength (2000)
- [X] T003 Create database migration backend/src/db/migrations/008_create_assets.sql — assets table DDL with all columns, constraints, indexes, and operation_type check constraint update to include create_asset
- [X] T004 [P] Create AssetStorage interface in backend/src/assets/storage/storage.interface.ts — putObject, getObjectStream, deleteObject methods with typed inputs/outputs per architecture doc
- [X] T005 [P] Implement LocalAssetStorage in backend/src/assets/storage/local-storage.ts — filesystem-based implementation using configurable ASSET_STORAGE_PATH, with directory auto-creation

**Checkpoint**: Dependencies installed, limits configured, migration ready, storage abstraction complete.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core backend modules that MUST be complete before any user story endpoint can work — image processing utilities, asset repository, and Zod schemas.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T006 [P] Create magic-byte MIME sniffer in backend/src/assets/image/mime-sniffer.ts — use file-type package to detect actual content type from buffer, export sniffMimeType(buffer) returning detected type or null
- [X] T007 [P] Create image dimension probe in backend/src/assets/image/image-probe.ts — use sharp metadata() to extract width/height from buffer, export probeImageDimensions(buffer) returning { width, height } or null
- [X] T008 [P] Create synchronous thumbnail generator in backend/src/assets/image/thumbnail-generator.ts — use sharp to resize within configured max bounding box, output WebP format, export generateThumbnail(buffer, maxDim) returning thumbnail buffer
- [X] T009 [P] Create asset validation rules in backend/src/domain/validation/asset-rules.ts — validateUploadSize, validateMimeType (declared vs sniffed), validateBoardForUpload (exists + editable), validateAssetForImageNode (exists + ready + same board)
- [X] T010 [P] Create Zod schemas in backend/src/schemas/asset.schemas.ts — UploadAssetFields (boardId UUID), AssetResponse shape, AssetMetadataResponse shape matching API contract
- [X] T011 Create asset repository in backend/src/repos/assets.repo.ts — insert, findById, findByBoardId methods with typed row mapping; transaction-compatible
- [X] T012 Create multer upload middleware in backend/src/http/middleware/upload.ts — memory storage, fileSize limit from config, single file field named "file"
- [X] T013 Add create_asset payload builder to backend/src/domain/operations/operation-factory.ts — extend buildOperation to support operation_type create_asset with asset metadata payload shape

**Checkpoint**: Foundation ready — image processing, validation, schemas, repo, middleware all available for endpoint implementation.

---

## Phase 3: User Story 1 — Upload an image to the board (Priority: P1) 🎯 MVP

**Goal**: User can upload an image file to a board and receive confirmed asset metadata with processingStatus = ready, thumbnailUrl, and dimensions.

**Independent Test**: Upload a PNG file via multipart POST and confirm 201 response with complete asset metadata. Verify 413 for oversize, 415 for bad MIME, 404/409 for bad board.

### Implementation for User Story 1

- [X] T014 [US1] Implement assets.service.ts upload flow in backend/src/services/assets.service.ts — orchestrate: validate board → validate file size → sniff MIME → probe dimensions → generate thumbnail → store blobs → DB transaction (insert metadata + create_asset operation + revision bump) → rollback blobs on DB error
- [X] T015 [US1] Implement upload handler in backend/src/http/controllers/assets.controller.ts — POST /api/assets/upload: parse multipart via upload middleware, extract boardId from form fields, call assets.service.upload, return 201 with asset response envelope
- [X] T016 [US1] Register upload route in backend/src/http/router.ts — POST /api/assets/upload with upload middleware and idempotency middleware
- [X] T017 [US1] Add structured upload logging to backend/src/services/assets.service.ts — log boardId, assetId, mimeType, fileSizeBytes, storageResult, thumbnailResult per NFR upload log requirements

**Checkpoint**: `POST /api/assets/upload` returns 201 with valid asset metadata. Rejection cases (413, 415, 404, 409, 422) all handled. Operations log includes create_asset entry.

---

## Phase 4: User Story 2 — Place an image node on the board (Priority: P1)

**Goal**: User can create an image node referencing an uploaded asset. Backend validates assetId existence, ready status, and same-board ownership. Node appears in hydrated board state.

**Independent Test**: Upload an image, then create an image node with that assetId. Confirm 201, revision bump, and node in GET /boards/:boardId/state. Confirm 422 for missing/invalid assetId.

### Implementation for User Story 2

- [X] T018 [US2] Extend image node validation in backend/src/domain/validation/node-rules.ts — add async validateImageNodeContent: check content.assetId required, call assets.repo.findById, verify processingStatus = ready, verify asset.board_id matches node board_id, validate caption length <= 2000; also validate on update if content.assetId changes
- [X] T019 [US2] Update nodes.service.ts create/update flows in backend/src/services/nodes.service.ts — integrate asset validation for type=image before persisting; pass assets.repo to validation function within transaction context
- [X] T020 [US2] Add asset types and assetsById to frontend store in frontend/src/store/types.ts and frontend/src/store/board.store.ts — add BoardAsset type, assetsById map, populate from hydration response if assets are included
- [X] T021 [US2] Create ImageNode component in frontend/src/components/canvas/nodes/ImageNode.tsx — render image from asset file URL (/api/assets/{assetId}/file or thumbnail URL), display caption if present, handle image load error state
- [X] T022 [US2] Update NodeRenderer dispatch in frontend/src/components/canvas/nodes/NodeRenderer.tsx — add case for type=image routing to ImageNode component

**Checkpoint**: Image nodes can be created via API with full asset validation. Image nodes render on the canvas from asset URLs. Invalid asset references are rejected with 422.

---

## Phase 5: User Story 3 — Distinguish upload success from placement success (Priority: P1)

**Goal**: Frontend upload flow clearly separates upload status from node placement status. User always knows which step succeeded or failed.

**Independent Test**: Trigger upload + placement. Simulate placement failure after upload success. Confirm UI shows upload succeeded but placement failed, with retry affordance.

### Implementation for User Story 3

- [X] T023 [US3] Create useImageUpload hook in frontend/src/hooks/useImageUpload.ts — manage two-step flow: uploadStatus (idle/uploading/success/error) and placementStatus (idle/placing/success/error) as separate state fields; upload via FormData to /api/assets/upload; on upload success derive node dimensions (aspect-ratio fit within 400x400 from asset width/height); place node via existing createNode; expose retry for placement after upload success
- [X] T024 [US3] Create UploadButton component in frontend/src/components/upload/UploadButton.tsx — file input trigger, accept image/* MIME types, disable during active upload, call useImageUpload.startUpload on file select
- [X] T025 [US3] Create UploadProgress component in frontend/src/components/upload/UploadProgress.tsx — display upload progress/spinner, show upload success or error message, show placement status separately, show retry button on placement failure
- [X] T026 [US3] Add Upload Image button to canvas toolbar in frontend/src/components/canvas/CanvasToolbar.tsx — integrate UploadButton, show UploadProgress inline or as overlay when upload is active

**Checkpoint**: User can upload an image via toolbar button. Upload status and placement status are independently visible. Failed placement after successful upload allows retry without re-uploading.

---

## Phase 6: User Story 4 — Retrieve asset metadata and original file (Priority: P2)

**Goal**: Asset metadata and original file can be retrieved by asset ID. Supports image node rendering and board hydration.

**Independent Test**: Upload an asset, then GET /api/assets/:assetId for metadata and GET /api/assets/:assetId/file for streaming. Confirm 404 for unknown IDs.

### Implementation for User Story 4

- [X] T027 [US4] Implement getMetadata and getFile in backend/src/services/assets.service.ts — getMetadata: load from repo, return mapped response; getFile: load metadata, get stream from storage, return stream + contentType; handle missing blob as 500 INTERNAL_ERROR
- [X] T028 [US4] Implement GET metadata and GET file handlers in backend/src/http/controllers/assets.controller.ts — GET /api/assets/:assetId returns metadata envelope; GET /api/assets/:assetId/file pipes storage stream with correct Content-Type header
- [X] T029 [US4] Register metadata and file routes in backend/src/http/router.ts — GET /api/assets/:assetId and GET /api/assets/:assetId/file

**Checkpoint**: Asset metadata and original file are retrievable by ID. 404 for unknown assets. 500 for storage integrity issues.

---

## Phase 7: User Story 5 — Retrieve asset thumbnail (Priority: P2)

**Goal**: Thumbnail endpoint returns generated thumbnail for image assets, or 404 ASSET_THUMBNAIL_NOT_AVAILABLE when no thumbnail exists.

**Independent Test**: Upload an image, GET /api/assets/:assetId/thumbnail. Confirm WebP response. Test with a non-image asset (if supported) and confirm 404 ASSET_THUMBNAIL_NOT_AVAILABLE.

### Implementation for User Story 5

- [X] T030 [US5] Implement getThumbnail in backend/src/services/assets.service.ts — load metadata, check thumbnail_storage_key exists (404 ASSET_THUMBNAIL_NOT_AVAILABLE if null), get stream from storage, return stream + image/webp content type
- [X] T031 [US5] Implement GET thumbnail handler in backend/src/http/controllers/assets.controller.ts — GET /api/assets/:assetId/thumbnail
- [X] T032 [US5] Register thumbnail route in backend/src/http/router.ts — GET /api/assets/:assetId/thumbnail

**Checkpoint**: Thumbnail endpoint works for image assets. Returns 404 ASSET_THUMBNAIL_NOT_AVAILABLE for assets without thumbnails.

---

## Phase 8: User Story 6 — Delete an image node without losing the asset (Priority: P2)

**Goal**: Deleting an image node soft-deletes the node and connected edges. The underlying asset remains accessible.

**Independent Test**: Create an image node, delete it. Confirm node gone from hydration. Confirm asset metadata and file still retrievable.

### Implementation for User Story 6

- [X] T033 [US6] Verify existing node delete behavior preserves assets — confirm backend/src/services/nodes.service.ts delete flow does NOT call any asset deletion; write verification comment in node-rules.ts documenting FR-011 (no asset cascade on node delete)
- [X] T034 [US6] Create frontend/src/api/assets.api.ts — uploadAsset (FormData POST with progress), getAssetMetadata (GET by ID); wire to API client base URL

**Checkpoint**: Deleting an image node leaves the asset untouched. Asset metadata and file remain accessible after node deletion.

---

## Phase 9: User Story 7 — Upload image via drag-and-drop (Priority: P3)

**Goal**: User can drag an image file onto the canvas to trigger upload and placement at the drop coordinates.

**Independent Test**: Drag a PNG file onto the canvas. Confirm upload begins, progress is visible, and image node appears near the drop location on success.

### Implementation for User Story 7

- [X] T035 [US7] Create DropZone component in frontend/src/components/upload/DropZone.tsx — overlay on Canvas that detects dragenter/dragover/drop events, validates file type on drop, extracts drop coordinates relative to canvas viewport, calls useImageUpload with target position
- [X] T036 [US7] Integrate DropZone into Canvas in frontend/src/components/canvas/Canvas.tsx — render DropZone as overlay, pass canvas coordinate transform for accurate drop position, show visual drop indicator during drag-over

**Checkpoint**: Drag-and-drop upload works. Invalid file types show error on drop. Image node placed near drop coordinates.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Tests, hydration integration, error handling polish, and documentation alignment.

- [X] T037 [P] Write unit tests for MIME sniffer in backend/tests/unit/mime-sniffer.unit.test.ts — test PNG, JPEG, WebP, GIF detection; test mismatch rejection; test unrecognizable file
- [X] T038 [P] Write unit tests for thumbnail generator in backend/tests/unit/thumbnail-generator.unit.test.ts — test resize within bounding box; test aspect ratio preservation; test corrupted input rejection
- [X] T039 [P] Write unit tests for asset validation rules in backend/tests/unit/asset-rules.unit.test.ts — test size limits, MIME validation, board editability, processingStatus gate
- [X] T040 Write integration tests for upload flow in backend/tests/integration/assets.integration.test.ts — test happy path upload (201), oversize (413), bad MIME (415), archived board (409), deleted board (404), idempotency replay
- [X] T041 Write integration tests for image node + asset validation in backend/tests/integration/image-node.integration.test.ts — test create with valid asset (201), missing asset (422), non-ready asset (422), wrong-board asset (422), caption validation
- [X] T042 Write contract tests for all 4 asset endpoints in backend/tests/contract/assets.contract.test.ts — POST upload, GET metadata, GET file, GET thumbnail; verify response shapes match contracts/asset-endpoints.md
- [X] T043 [P] Include asset metadata in board hydration response — update backend/src/services/board-state.service.ts to load assets for the board and include in state envelope; update frontend/src/store/board.store.ts hydration handler to populate assetsById
- [X] T044 Run quickstart.md verification — execute all curl commands from specs/008-assets-image-nodes/quickstart.md against a running local instance and confirm expected responses

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3–9)**: All depend on Foundational phase completion
  - US1 (upload) can start immediately after Foundational
  - US2 (image node) depends on US1 (needs uploaded asset for validation)
  - US3 (UX distinction) depends on US1 (needs upload endpoint) + US2 (needs image node creation)
  - US4 (metadata/file) can start after Foundational (independent of US2/US3)
  - US5 (thumbnail) can start after Foundational (independent of US2/US3)
  - US6 (delete safety) depends on US2 (needs image node to exist)
  - US7 (drag-drop) depends on US3 (needs upload flow)
- **Polish (Phase 10)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational (Phase 2) — No story dependencies
- **US2 (P1)**: Depends on US1 (needs working upload to have assets to reference)
- **US3 (P1)**: Depends on US1 + US2 (needs both upload and placement flows)
- **US4 (P2)**: Can start after Foundational — Parallel with US2/US3
- **US5 (P2)**: Can start after Foundational — Parallel with US2/US3
- **US6 (P2)**: Depends on US2 (needs image node to delete)
- **US7 (P3)**: Depends on US3 (needs complete upload+place flow)

### Within Each User Story

- Models/repos before services
- Services before controllers
- Controllers before route registration
- Backend before frontend (for endpoints the frontend calls)

### Parallel Opportunities

- T004 + T005 (storage interface + implementation) can run in parallel
- T006 + T007 + T008 + T009 + T010 (image utils + validation + schemas) can all run in parallel
- US4 + US5 can run in parallel with US2 + US3
- T037 + T038 + T039 (unit tests) can all run in parallel
- T043 (hydration) can run in parallel with US7

---

## Parallel Example: Foundational Phase

```text
# All these can run simultaneously (different files, no dependencies):
Task T006: MIME sniffer in backend/src/assets/image/mime-sniffer.ts
Task T007: Image probe in backend/src/assets/image/image-probe.ts
Task T008: Thumbnail generator in backend/src/assets/image/thumbnail-generator.ts
Task T009: Asset rules in backend/src/domain/validation/asset-rules.ts
Task T010: Zod schemas in backend/src/schemas/asset.schemas.ts
```

## Parallel Example: P2 Stories

```text
# US4 and US5 can run simultaneously with US2/US3:
Task T027-T029 (US4: metadata/file retrieval)
Task T030-T032 (US5: thumbnail retrieval)
# While US2 backend + frontend work proceeds in parallel
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (Upload)
4. **STOP and VALIDATE**: Upload an image via curl and confirm 201 with metadata
5. Continue to US2 → US3 for full upload-and-place flow

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Upload) → Test upload API independently → First milestone
3. US2 (Image node) → Test image node creation + rendering → Core MVP
4. US3 (UX separation) → Test upload+place with failure states → UX complete
5. US4 + US5 (Retrieval) → Test metadata + file + thumbnail → Full API
6. US6 (Delete safety) → Test delete preserves asset → Safety verified
7. US7 (Drag-drop) → Test DnD interaction → Enhancement complete
8. Polish → Tests + hydration + quickstart validation → Ship-ready

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Image node create/update reuses existing withBoardMutation infrastructure — no new transaction patterns
- Storage abstraction (T004/T005) enables future S3 swap without touching service code
