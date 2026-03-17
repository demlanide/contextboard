# Feature Specification: Assets and Image Nodes

**Feature Branch**: `008-assets-image-nodes`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: User description: "Asset upload, image-node support, and browser upload flow"

## Clarifications

### Session 2026-03-16

- Q: Can an image node reference an asset whose processingStatus is not `ready`? → A: No. Image node creation requires processingStatus = `ready`; non-ready assets are rejected with 422 VALIDATION_ERROR.
- Q: Is thumbnail generation synchronous or asynchronous during upload? → A: Synchronous. Thumbnail is generated during upload before the 201 response. A successful upload always returns processingStatus = `ready` with a valid thumbnailUrl.
- Q: Should the system trust the client-declared MIME type or inspect actual file content? → A: Sniff file magic bytes to determine actual type; reject with 415 if the declared MIME type does not match the detected actual type.
- Q: How should image node dimensions be determined on initial placement? → A: Fit to a max bounding box (e.g., 400x400) preserving aspect ratio. Asset metadata retains original pixel dimensions for zoom/detail use.
- Q: Should asset uploads require a boardId or be global? → A: Require boardId at upload time. The system validates that the board exists and is editable before accepting the file.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload an image to the board (Priority: P1)

A user working on a board wants to add a visual reference — such as a screenshot, diagram, or design — by uploading an image file from their device. They select or drop an image, see that the upload is in progress, and receive clear confirmation when the upload succeeds or fails. A successful upload produces a reusable asset that can back one or more image nodes.

**Why this priority**: Without a working upload flow, no image can exist on the board. This is the prerequisite for all other image-related behavior.

**Independent Test**: Can be fully tested by uploading an image file and confirming the returned asset metadata contains a valid ID, MIME type, file size, and processing status — without placing any node yet.

**Acceptance Scenarios**:

1. **Given** a user on an active board, **When** they upload a valid PNG image under 20 MB, **Then** the system returns 201 with asset metadata including id, kind, mimeType, originalFilename, url, thumbnailUrl, fileSizeBytes, width, height, and processingStatus.
2. **Given** a user attempting an upload, **When** the file exceeds 20 MB (image) or 50 MB (generic file), **Then** the system rejects the upload with 413 and no asset is persisted.
3. **Given** a user attempting an upload, **When** the file MIME type is not in the configured allowed list, **Then** the system rejects the upload with 415 and no asset is persisted.
4. **Given** a user on an active board, **When** they upload a valid JPEG image, **Then** asset metadata records the correct MIME type, width, and height.
5. **Given** a user on the board UI, **When** the upload is in progress, **Then** the user sees a visible progress or loading indicator and cannot trigger a duplicate upload for the same attempt.

---

### User Story 2 - Place an image node on the board after uploading (Priority: P1)

After uploading an image, the user places an image node on the board canvas. The image node references the uploaded asset through `content.assetId`. The user sees the image rendered on the board once the node is confirmed by the server.

**Why this priority**: This is the core value of the feature — getting an image onto the board as a first-class visual object that participates in board state, revision tracking, and operations logging.

**Independent Test**: Can be tested by uploading an image, then creating an image node that references that asset, and confirming the node appears in hydrated board state.

**Acceptance Scenarios**:

1. **Given** a successfully uploaded image asset, **When** the user creates an image node with `content.assetId` referencing that asset, **Then** the system returns 201 with the confirmed node, increments board revision once, and writes a create_node operation.
2. **Given** a successfully uploaded image asset, **When** the user places the image node, **Then** the node appears on the canvas in its confirmed position and renders the image using the asset's file URL.
3. **Given** an image node on the board, **When** the board state is hydrated, **Then** the image node is included in the nodes array with its asset reference intact.
4. **Given** no asset has been uploaded, **When** the user attempts to create an image node with a nonexistent assetId, **Then** the system rejects the request with 422 VALIDATION_ERROR and no node is created.
5. **Given** an image node linked to an asset, **When** the user updates the node's caption or position, **Then** the update succeeds normally and the asset reference is preserved.

---

### User Story 3 - Distinguish upload success from placement success (Priority: P1)

When uploading and placing an image, the user can clearly tell whether the asset upload succeeded, the node placement succeeded, or both. If one step fails, the user understands which step failed and what to do next.

**Why this priority**: Without clear separation of upload and placement feedback, users cannot recover from partial failures. This is a core UX requirement stated in the product scope.

**Independent Test**: Can be tested by simulating upload success followed by placement failure, and confirming the UI communicates both states separately.

**Acceptance Scenarios**:

1. **Given** a successful upload but a failed node placement (e.g., board became archived), **When** the placement error is returned, **Then** the user sees that the upload succeeded but placement failed, and the uploaded asset remains available for retry.
2. **Given** a failed upload (e.g., file too large), **When** the 413 error is returned, **Then** the user sees the upload failure without any placement attempt, and understands the file was not stored.
3. **Given** both upload and placement succeed, **When** the image appears on the board, **Then** the user sees a single coherent success state without ambiguity about which steps completed.

---

### User Story 4 - Retrieve asset metadata and original file (Priority: P2)

A user or the system can retrieve metadata about a previously uploaded asset, and can stream or download the original file. This supports rendering image nodes on the board and any future asset inspection needs.

**Why this priority**: Asset retrieval is necessary for rendering image nodes and for any client that rehydrates board state and needs to display images. It is secondary to upload and placement because those must work first.

**Independent Test**: Can be tested by uploading an asset, then calling the metadata endpoint and file endpoint independently, confirming correct responses.

**Acceptance Scenarios**:

1. **Given** a previously uploaded asset, **When** the metadata endpoint is called with the asset ID, **Then** the system returns the full asset metadata object.
2. **Given** a previously uploaded asset, **When** the file endpoint is called, **Then** the system streams the original file with the correct content type header.
3. **Given** an unknown asset ID, **When** the metadata or file endpoint is called, **Then** the system returns 404 ASSET_NOT_FOUND.

---

### User Story 5 - Retrieve asset thumbnail (Priority: P2)

For image assets, the system can provide a thumbnail version. If a thumbnail is not yet available, the system communicates this clearly instead of returning a broken response.

**Why this priority**: Thumbnails improve rendering performance for boards with many images. They are important but not strictly required for MVP image node functionality.

**Independent Test**: Can be tested by uploading an image and requesting its thumbnail, then testing with an asset that has no thumbnail available.

**Acceptance Scenarios**:

1. **Given** an uploaded image asset with a generated thumbnail, **When** the thumbnail endpoint is called, **Then** the system returns the thumbnail image with appropriate content type.
2. **Given** an uploaded image asset without a generated thumbnail, **When** the thumbnail endpoint is called, **Then** the system returns 404 ASSET_THUMBNAIL_NOT_AVAILABLE.
3. **Given** an unknown asset ID, **When** the thumbnail endpoint is called, **Then** the system returns 404 ASSET_NOT_FOUND.

---

### User Story 6 - Delete an image node without losing the asset (Priority: P2)

A user removes an image node from the board. The underlying asset file is not deleted, preserving it for potential reuse or future recovery.

**Why this priority**: This matches the MVP asset lifecycle rule. It is important for data safety but secondary to the core upload-and-place flow.

**Independent Test**: Can be tested by creating an image node, deleting it, and confirming the asset metadata is still retrievable and the original file is still downloadable.

**Acceptance Scenarios**:

1. **Given** an image node on the board, **When** the user deletes the image node, **Then** the node is soft-deleted, connected edges are soft-deleted, board revision increments once, and operations are logged.
2. **Given** a deleted image node, **When** the asset metadata endpoint is called for the referenced asset, **Then** the asset metadata is still returned successfully.
3. **Given** a deleted image node, **When** the board state is hydrated, **Then** the deleted image node does not appear in the nodes array, but the asset still exists in storage.

---

### User Story 7 - Upload image via drag-and-drop (Priority: P3)

A user drags an image file from their file system onto the board canvas. The upload begins immediately, and on success, the image is placed on the board near the drop location.

**Why this priority**: Drag-and-drop is a natural and expected interaction for a canvas-based application, but the core upload-via-button flow must work first. This is a convenience enhancement.

**Independent Test**: Can be tested by dragging a valid image file onto the canvas and confirming upload and node placement occur at the expected position.

**Acceptance Scenarios**:

1. **Given** a user viewing an active board, **When** they drag a valid image file onto the canvas, **Then** the upload begins, progress is visible, and on success an image node is placed near the drop coordinates.
2. **Given** a user dragging an invalid file type, **When** the file is dropped, **Then** the upload is rejected with an appropriate error and no node is created.

---

### Edge Cases

- Files with a valid extension but whose magic bytes do not match the declared MIME type are rejected with 415. Corrupted files that pass magic-byte detection but fail dimension extraction or thumbnail generation are rejected during synchronous processing and no asset is persisted.
- How does the system behave when the upload transport connection drops mid-transfer?
- Image node creation referencing an asset whose processingStatus is not `ready` is rejected with 422 VALIDATION_ERROR. The user must wait for processing to complete or retry after the asset reaches `ready` status.
- Upload to an archived board is rejected (board not editable). Upload to a deleted board is rejected (board not found). Since boardId is required at upload, these checks happen before file processing begins.
- What happens if the same file is uploaded twice — are two separate assets created?
- How does the system handle concurrent upload and placement requests for the same asset?
- What happens when an image node update attempts to change `content.assetId` to a nonexistent asset?
- What happens when storage is temporarily unavailable — does the system distinguish metadata integrity from blob availability?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept multipart file uploads with a required boardId field, validate the board exists and is editable, and persist asset metadata durably, returning 201 on success.
- **FR-002**: System MUST reject uploads exceeding the configured size limit (20 MB for images, 50 MB for generic files) with 413 Payload Too Large.
- **FR-003**: System MUST reject uploads with unsupported MIME types with 415 Unsupported Media Type. The system MUST sniff file magic bytes to determine the actual content type and reject the upload if the declared MIME type does not match the detected type.
- **FR-004**: System MUST assign each uploaded asset a stable UUID, a storage key, and a processing status.
- **FR-005**: System MUST return asset metadata including id, kind, mimeType, originalFilename, url, thumbnailUrl, fileSizeBytes, width, height, processingStatus, and timestamps.
- **FR-006**: System MUST allow retrieval of asset metadata by asset ID, returning 404 ASSET_NOT_FOUND for unknown IDs.
- **FR-007**: System MUST allow streaming/download of the original uploaded file by asset ID with the correct content type header.
- **FR-008**: System MUST return a thumbnail for image assets when available, or 404 ASSET_THUMBNAIL_NOT_AVAILABLE when no thumbnail exists.
- **FR-009**: System MUST support image node creation only when `content.assetId` references an existing asset whose processingStatus is `ready`. Assets in `pending`, `processing`, or `failed` status MUST be rejected with 422 VALIDATION_ERROR.
- **FR-010**: System MUST reject image node creation or update with a missing or invalid asset reference with 422 VALIDATION_ERROR.
- **FR-011**: System MUST NOT automatically delete the underlying asset when an image node is soft-deleted.
- **FR-012**: System MUST increment board revision exactly once per successful image node creation, update, or deletion.
- **FR-013**: System MUST write operation log entries for all durable image node mutations (create_node, update_node, delete_node) and asset creation (create_asset).
- **FR-014**: System MUST soft-delete connected edges when an image node is deleted, within the same transaction.
- **FR-015**: System MUST enforce that archived boards reject asset uploads and image node mutations.
- **FR-016**: System MUST enforce that deleted boards reject asset uploads and image node mutations.
- **FR-017**: System MUST enforce that locked image nodes cannot be updated or deleted through normal edit endpoints, returning 409 LOCKED_NODE.
- **FR-018**: The browser UI MUST provide a visible upload affordance (button or drag-and-drop entry point) for adding images.
- **FR-019**: The browser UI MUST show a visible progress or loading state while an upload is in flight.
- **FR-020**: The browser UI MUST clearly distinguish between an upload failure and a node placement failure when they occur separately.
- **FR-021**: The browser UI MUST render confirmed image nodes on the canvas using the asset file URL or thumbnail URL.
- **FR-022**: The browser UI MUST reconcile image node state from server-confirmed responses, not from local assumptions.
- **FR-023**: System MUST support idempotent upload retries when the same idempotency key is provided with the same payload.

### Key Entities

- **Asset**: An uploaded file stored durably with metadata. Key attributes: id, boardId (required at upload in MVP), kind (image/file), mimeType, originalFilename, storageKey, fileSizeBytes, width, height, processingStatus, extractedText (nullable), aiCaption (nullable), metadata. Assets are independent of nodes — deleting a node does not delete its asset.
- **Image Node**: A board node of type `image` whose content payload requires `assetId` referencing a valid asset, and optionally includes `caption`. Image nodes follow all standard node rules (geometry, style, metadata, soft-delete, lock) plus asset-specific validation. Default placement dimensions are determined by fitting the image's native aspect ratio within a max bounding box (e.g., 400x400); the user can resize the node after placement.
- **Board Operation (create_asset)**: An operation log entry written when an asset is uploaded, recording the asset creation in the board's operations history for audit and future sync purposes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can upload an image and see it placed on the board within 5 seconds for files under 5 MB on a standard broadband connection.
- **SC-002**: Users can tell whether the upload succeeded, the placement succeeded, or both, in 100% of upload-and-place attempts — no ambiguous outcome states.
- **SC-003**: 100% of image node creation attempts with invalid asset references are rejected before any durable state change occurs.
- **SC-004**: Deleting an image node never causes the underlying asset to become unavailable — asset retrieval continues to succeed after node deletion.
- **SC-005**: Oversize uploads and unsupported file types are communicated to the user before any server-side storage is consumed.
- **SC-006**: Board state hydration includes image nodes with intact asset references, and image rendering works correctly on board reload.
- **SC-007**: All durable asset and image node mutations are represented in the operations log and revision history — no silent state changes.

## Assumptions

- MVP thumbnail generation is synchronous: the thumbnail is generated during upload processing before the 201 response is returned. A successful image upload always returns processingStatus = `ready` with a valid thumbnailUrl. The `pending` and `processing` statuses exist in the data model for future async workflows but are not used in the MVP upload happy path.
- Asset uploads require a boardId at upload time. The system validates that the referenced board exists and is editable before accepting the file. The `boardId` column on the asset table remains nullable at the database level for future flexibility, but the MVP upload endpoint requires it.
- Each upload creates a new distinct asset, even if the same file is uploaded twice. Deduplication is not required for MVP.
- The allowed MIME type list for image uploads includes at minimum: image/png, image/jpeg, image/gif, image/webp. The exact list is configurable.
- File storage uses a local filesystem or object store strategy; the specific storage backend is an implementation decision, not a product requirement.
- Image dimension extraction (width, height) is performed during upload processing when possible. Dimensions may be null for non-image file types. When placing an image node, the frontend derives initial node width/height by fitting the image's native aspect ratio within a max bounding box (e.g., 400x400). Original pixel dimensions remain in asset metadata.
- For MVP, a successful image upload completes synchronously and returns processingStatus = `ready`. The `pending → processing → ready/failed` transition model exists in the data model for future async processing but is not exercised in the MVP upload path. A failed upload (validation, storage error) does not persist an asset record — there is no `failed` status to observe in normal MVP flows.
