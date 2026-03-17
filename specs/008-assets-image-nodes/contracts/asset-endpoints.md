# API Contracts: Asset Endpoints

**Branch**: `008-assets-image-nodes` | **Date**: 2026-03-16

## POST /api/assets/upload

Upload a file to a board.

**Content-Type**: `multipart/form-data`

### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | binary | Yes | The file to upload |
| boardId | string (UUID) | Yes | Board to associate the asset with |

### Response 201 Created

```json
{
  "data": {
    "asset": {
      "id": "uuid",
      "boardId": "uuid",
      "kind": "image",
      "mimeType": "image/png",
      "originalFilename": "reference.png",
      "url": "/api/assets/uuid/file",
      "thumbnailUrl": "/api/assets/uuid/thumbnail",
      "fileSizeBytes": 234567,
      "width": 1280,
      "height": 720,
      "processingStatus": "ready",
      "extractedText": null,
      "aiCaption": null,
      "metadata": {},
      "createdAt": "2026-03-16T12:00:00.000Z",
      "updatedAt": "2026-03-16T12:00:00.000Z"
    }
  },
  "error": null
}
```

### Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 400 | VALIDATION_ERROR | Missing file or boardId field |
| 404 | BOARD_NOT_FOUND | Board does not exist or is deleted |
| 409 | BOARD_ARCHIVED | Board is archived (not editable) |
| 413 | PAYLOAD_TOO_LARGE | File exceeds size limit (20 MB image, 50 MB generic) |
| 415 | UNSUPPORTED_MEDIA_TYPE | MIME type not in allowed list, or declared type mismatches detected type |
| 422 | VALIDATION_ERROR | File failed processing (corrupted, unreadable dimensions, thumbnail generation failure) |

### Validation sequence

1. Check multipart form has `file` and `boardId` fields
2. Validate `boardId` format (UUID)
3. Load board → 404 if not found, 409 if archived
4. Check file size against configured limit → 413 if exceeded
5. Sniff file magic bytes → 415 if detected type not in allowed list
6. Compare declared MIME vs detected MIME → 415 if mismatch
7. Extract image dimensions via sharp → 422 if unreadable
8. Generate thumbnail via sharp → 422 if generation fails
9. Store blob + thumbnail in object storage
10. Persist metadata + write `create_asset` operation in DB transaction

---

## GET /api/assets/:assetId

Get asset metadata.

### Response 200 OK

```json
{
  "data": {
    "asset": {
      "id": "uuid",
      "boardId": "uuid",
      "kind": "image",
      "mimeType": "image/png",
      "originalFilename": "reference.png",
      "url": "/api/assets/uuid/file",
      "thumbnailUrl": "/api/assets/uuid/thumbnail",
      "fileSizeBytes": 234567,
      "width": 1280,
      "height": 720,
      "processingStatus": "ready",
      "extractedText": null,
      "aiCaption": null,
      "metadata": {},
      "createdAt": "2026-03-16T12:00:00.000Z",
      "updatedAt": "2026-03-16T12:00:00.000Z"
    }
  },
  "error": null
}
```

### Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 404 | ASSET_NOT_FOUND | Asset does not exist |

---

## GET /api/assets/:assetId/file

Stream the original uploaded file.

### Response 200 OK

- **Content-Type**: The stored MIME type of the asset (e.g., `image/png`)
- **Body**: Raw file bytes streamed from object storage

### Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 404 | ASSET_NOT_FOUND | Asset does not exist |
| 500 | INTERNAL_ERROR | Asset metadata exists but blob is missing from storage (storage integrity issue) |

---

## GET /api/assets/:assetId/thumbnail

Get the generated thumbnail for an image asset.

### Response 200 OK

- **Content-Type**: `image/webp` (default thumbnail format)
- **Body**: Thumbnail image bytes

### Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 404 | ASSET_NOT_FOUND | Asset does not exist |
| 404 | ASSET_THUMBNAIL_NOT_AVAILABLE | Asset exists but has no thumbnail (e.g., non-image file, or thumbnail not generated) |
| 500 | INTERNAL_ERROR | Thumbnail metadata exists but blob is missing from storage |

---

## Image Node Create (extension of existing POST /api/boards/:boardId/nodes)

No new endpoint. Extended validation for `type: "image"`.

### Additional request validation for image nodes

```json
{
  "type": "image",
  "x": 100,
  "y": 200,
  "width": 400,
  "height": 300,
  "content": {
    "assetId": "uuid",
    "caption": "Optional caption text"
  },
  "style": {},
  "metadata": {}
}
```

### Additional validation rules

| Check | Error |
|-------|-------|
| `content.assetId` missing | 422 VALIDATION_ERROR |
| Asset not found | 422 VALIDATION_ERROR |
| Asset `processingStatus` != `ready` | 422 VALIDATION_ERROR |
| Asset belongs to different board | 422 VALIDATION_ERROR |
| `content.caption` exceeds 2,000 chars | 422 VALIDATION_ERROR |

### Image Node Update (extension of existing PATCH /api/nodes/:nodeId)

If `content.assetId` is changed in a patch, the new asset reference is validated with the same rules above. If `content` is not part of the patch, asset validation is skipped.
