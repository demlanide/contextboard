# Quickstart: Assets and Image Nodes

**Branch**: `008-assets-image-nodes` | **Date**: 2026-03-16

## Prerequisites

- Node.js LTS installed
- PostgreSQL 15+ running (via `docker-compose up -d`)
- Backend and frontend dependencies installed (`npm install` in both `backend/` and `frontend/`)
- Existing migrations 001–007 applied (`npm run migrate` in `backend/`)

## Setup

### 1. Apply the new migration

```bash
cd backend
npm run migrate
```

This runs `008_create_assets.sql` which:
- Creates the `assets` table
- Adds `create_asset` to the `board_operations` operation_type check constraint

### 2. Configure asset storage

Add to your `.env` (or environment):

```bash
ASSET_STORAGE_PATH=./storage
ASSET_MAX_IMAGE_SIZE_MB=20
ASSET_MAX_FILE_SIZE_MB=50
ASSET_ALLOWED_MIME_TYPES=image/png,image/jpeg,image/webp,image/gif
ASSET_THUMBNAIL_MAX_DIM=400
```

The storage directory will be created automatically on first upload.

### 3. Install new dependencies

```bash
cd backend
npm install multer sharp file-type
npm install -D @types/multer
```

### 4. Start the backend

```bash
cd backend
npm run dev
```

### 5. Start the frontend

```bash
cd frontend
npm run dev
```

## Verification

### Upload an image

```bash
curl -X POST http://localhost:3001/api/assets/upload \
  -F "file=@test-image.png" \
  -F "boardId=<your-board-id>" \
  -H "Idempotency-Key: test-upload-1"
```

Expected: `201` with asset metadata including `processingStatus: "ready"` and valid `url` / `thumbnailUrl`.

### Get asset metadata

```bash
curl http://localhost:3001/api/assets/<asset-id>
```

Expected: `200` with full asset metadata.

### Get original file

```bash
curl http://localhost:3001/api/assets/<asset-id>/file -o downloaded.png
```

Expected: `200` with file bytes and correct `Content-Type` header.

### Get thumbnail

```bash
curl http://localhost:3001/api/assets/<asset-id>/thumbnail -o thumb.webp
```

Expected: `200` with WebP thumbnail.

### Create image node

```bash
curl -X POST http://localhost:3001/api/boards/<board-id>/nodes \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-image-node-1" \
  -d '{
    "type": "image",
    "x": 100,
    "y": 200,
    "width": 400,
    "height": 300,
    "content": { "assetId": "<asset-id>" },
    "style": {},
    "metadata": {}
  }'
```

Expected: `201` with confirmed image node. Board revision incremented.

### Verify in hydration

```bash
curl http://localhost:3001/api/boards/<board-id>/state
```

Expected: `200` with the image node in the `nodes` array.

## Key test scenarios

| Scenario | Command | Expected |
|----------|---------|----------|
| Oversize upload | Upload 25MB file | `413` |
| Wrong MIME type | Upload .exe as image/png | `415` |
| Missing boardId | Upload without boardId field | `400` |
| Image node with bad assetId | Create node with nonexistent assetId | `422` |
| Delete image node | DELETE node | `200`; asset still accessible |

## Running tests

```bash
cd backend
npm test                    # All tests
npm test -- --grep asset    # Asset-specific tests
npm test -- --grep image    # Image node tests
```
