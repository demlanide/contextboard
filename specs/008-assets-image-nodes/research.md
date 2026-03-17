# Research: Assets and Image Nodes

**Branch**: `008-assets-image-nodes` | **Date**: 2026-03-16

## 1. Multipart Upload Handling (multer)

**Decision**: Use `multer` for Express multipart/form-data parsing.

**Rationale**: multer is the standard middleware for handling multipart uploads in Express. It supports memory and disk storage strategies, file size limits, file filtering, and integrates cleanly with the existing Express middleware chain. The memory storage strategy is suitable for MVP since files are capped at 20 MB and will be immediately written to the storage backend.

**Alternatives considered**:
- `busboy` directly — lower-level, more control, but requires manual stream handling and error management that multer abstracts
- `formidable` — similar capabilities but less idiomatic for Express middleware chains
- `express-fileupload` — simpler API but less control over limits and filtering

**Implementation notes**:
- Use memory storage (`multer.memoryStorage()`) for simplicity; the buffer is passed directly to the storage interface and image processing
- Configure `limits.fileSize` from `config/limits.ts`
- Use `fileFilter` to perform initial MIME type check before accepting the file into memory
- Single file field named `file` in the multipart request
- Board ID provided as a form field (`boardId`) in the same multipart request

## 2. Image Processing and Thumbnails (sharp)

**Decision**: Use `sharp` for image dimension extraction and synchronous thumbnail generation.

**Rationale**: sharp is the most performant Node.js image processing library, built on libvips. It handles PNG, JPEG, WebP, and GIF natively. It can extract dimensions without fully decoding the image and can generate thumbnails efficiently. Since MVP thumbnail generation is synchronous (per clarification), sharp's fast processing ensures the upload endpoint stays within the 30s timeout budget.

**Alternatives considered**:
- `jimp` — pure JavaScript, no native dependencies, but significantly slower for image processing
- `gm/imagemagick` — requires external binary installation, harder to deploy in containers
- `probe-image-size` for dimensions only — lightweight but doesn't generate thumbnails

**Implementation notes**:
- Extract width/height using `sharp(buffer).metadata()`
- Generate thumbnail using `sharp(buffer).resize({ width: 400, height: 400, fit: 'inside' }).toFormat('webp').toBuffer()`
- Thumbnail stored alongside original in the storage backend with a `thumb/` prefix on the storage key
- If sharp fails to process a file (corrupted), reject the upload entirely — no partial asset persisted
- Thumbnail max dimensions configurable in `config/limits.ts`

## 3. Magic-Byte MIME Sniffing

**Decision**: Use `file-type` package for detecting actual file content type from magic bytes.

**Rationale**: The `file-type` package reads the first few bytes of a file buffer to detect its actual MIME type. It supports all required image types (PNG, JPEG, WebP, GIF) and is fast, well-maintained, and has zero native dependencies. Per the clarification, the system rejects uploads where the declared MIME type doesn't match the detected type.

**Alternatives considered**:
- `mmmagic` — wraps libmagic, requires native compilation, heavier dependency
- `mime-types` — only maps extensions to MIME types, doesn't inspect content
- Manual magic byte checking — error-prone and doesn't cover edge cases

**Implementation notes**:
- Import as `import { fileTypeFromBuffer } from 'file-type'` (ESM)
- Compare detected type against declared `Content-Type` from the multipart upload
- If no type detected (unrecognizable file), reject with 415
- If detected type doesn't match declared type, reject with 415
- If detected type is not in the configured allow list, reject with 415

## 4. Storage Abstraction

**Decision**: Implement `AssetStorage` interface with a local filesystem implementation for MVP; design for future S3 swap.

**Rationale**: The architecture doc already defines the `AssetStorage` interface with `putObject`, `getObjectStream`, `deleteObject`, and optional `getSignedUrl`. A local filesystem implementation is simplest for MVP development and testing. The interface boundary means switching to S3 later requires only one new implementation file.

**Alternatives considered**:
- S3 from day one — adds AWS SDK dependency and configuration complexity for MVP
- Database BLOB storage — poor performance for large files, complicates backup/restore
- In-memory storage — only useful for tests, not suitable for persistence

**Implementation notes**:
- Storage root directory configurable via environment variable (e.g., `ASSET_STORAGE_PATH`)
- Storage key format: `{boardId}/{assetId}/{filename}` for originals, `{boardId}/{assetId}/thumb/{filename}` for thumbnails
- `putObject` writes buffer to filesystem using `fs.promises.writeFile` with intermediate directory creation
- `getObjectStream` returns `fs.createReadStream`
- `deleteObject` uses `fs.promises.unlink` (not used in MVP node delete, but interface complete)
- File paths never exposed to clients; only `/api/assets/{assetId}/file` and `/api/assets/{assetId}/thumbnail` URLs returned

## 5. Asset Upload Transaction Strategy

**Decision**: Two-phase upload: store blob first, then persist metadata in a DB transaction with `create_asset` operation. On metadata failure, clean up the stored blob.

**Rationale**: Storing the blob before the DB transaction avoids holding a database transaction open during potentially slow I/O. If the DB transaction fails, the orphaned blob is cleaned up in a `catch` block. This keeps DB transactions short (consistent with the constitution's correctness principle) while ensuring no metadata references a nonexistent blob.

**Alternatives considered**:
- Blob inside DB transaction — holds transaction open during file I/O, risks timeout
- Metadata first, blob second — creates a window where metadata references a missing blob
- Background reconciliation for orphans — adds complexity beyond MVP needs

**Implementation notes**:
- `assets.service.ts` upload flow:
  1. Validate board exists and is editable
  2. Validate file size, MIME (declared + sniffed)
  3. Extract image dimensions via sharp
  4. Generate thumbnail via sharp
  5. Store original blob via `AssetStorage.putObject`
  6. Store thumbnail blob via `AssetStorage.putObject`
  7. Open DB transaction: insert asset metadata, write `create_asset` operation, bump board revision
  8. Commit
  9. On DB error: delete stored blobs, throw
- Board revision IS incremented on upload since boardId is required and the upload is a board-scoped mutation

## 6. Image Node Validation Extension

**Decision**: Extend existing `node-rules.ts` to validate `content.assetId` for image nodes by checking asset existence and `processingStatus = 'ready'`.

**Rationale**: Image node creation and update already go through the node validation pipeline. Adding asset validation as an additional check in the existing `validateNodeContent` function keeps the validation centralized and ensures it applies to both direct user edits and future agent apply flows.

**Implementation notes**:
- `node-rules.ts` gains an async validation step for image nodes that queries `assets.repo.ts`
- Validation checks: asset exists, asset belongs to same board, asset processingStatus is `ready`
- For node updates that change `content.assetId`, the same validation runs
- For node updates that don't touch `content`, asset validation is skipped

## 7. Frontend Upload Flow Architecture

**Decision**: Two-step upload-then-place flow with explicit state separation between upload status and node placement status.

**Rationale**: Per the spec and clarifications, users must clearly distinguish upload success from placement success. The `useImageUpload` hook manages both steps and exposes separate status fields for each. The upload step returns asset metadata; the placement step creates the image node.

**Alternatives considered**:
- Single atomic upload+place endpoint — simpler but violates the separation principle and makes partial failure handling opaque
- Background upload with deferred placement — adds complexity without MVP benefit since uploads are synchronous

**Implementation notes**:
- `useImageUpload` hook state: `{ uploadStatus, placementStatus, assetId, error }`
- Upload: `POST /api/assets/upload` via `FormData` with `file` and `boardId`
- On upload success: derive node dimensions from asset metadata (aspect-ratio fit within 400x400)
- Placement: `POST /api/boards/{boardId}/nodes` with type `image`, content `{ assetId }`
- Progress tracking: use `XMLHttpRequest` or fetch with `ReadableStream` for upload progress percentage
- Error display: separate toast/message for upload failure vs placement failure
