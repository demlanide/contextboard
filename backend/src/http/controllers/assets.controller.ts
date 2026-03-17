import { Request, Response, NextFunction } from 'express';
import { uuidSchema, successResponse, errorResponse } from '../../schemas/common.schemas.js';
import { UploadAssetFieldsSchema } from '../../schemas/asset.schemas.js';
import {
  uploadAsset,
  getAssetMetadata,
  getAssetFile,
  getAssetThumbnail,
} from '../../services/assets.service.js';

// POST /api/assets/upload
export async function handleUploadAsset(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'Missing file in upload'));
    }

    const fieldsResult = UploadAssetFieldsSchema.safeParse(req.body);
    if (!fieldsResult.success) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'Missing or invalid boardId'));
    }

    const result = await uploadAsset({
      boardId: fieldsResult.data.boardId,
      file: {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
    });

    return res.status(201).json(successResponse(result));
  } catch (err) {
    next(err);
  }
}

// GET /api/assets/:assetId
export async function handleGetAssetMetadata(req: Request, res: Response, next: NextFunction) {
  const assetIdResult = uuidSchema.safeParse(req.params['assetId']);
  if (!assetIdResult.success) {
    return res.status(422).json(errorResponse('VALIDATION_ERROR', 'assetId must be a valid UUID'));
  }

  try {
    const asset = await getAssetMetadata(assetIdResult.data);
    return res.status(200).json(successResponse({ asset }));
  } catch (err) {
    next(err);
  }
}

// GET /api/assets/:assetId/file
export async function handleGetAssetFile(req: Request, res: Response, next: NextFunction) {
  const assetIdResult = uuidSchema.safeParse(req.params['assetId']);
  if (!assetIdResult.success) {
    return res.status(422).json(errorResponse('VALIDATION_ERROR', 'assetId must be a valid UUID'));
  }

  try {
    const { stream, contentType } = await getAssetFile(assetIdResult.data);
    res.setHeader('Content-Type', contentType);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

// GET /api/assets/:assetId/thumbnail
export async function handleGetAssetThumbnail(req: Request, res: Response, next: NextFunction) {
  const assetIdResult = uuidSchema.safeParse(req.params['assetId']);
  if (!assetIdResult.success) {
    return res.status(422).json(errorResponse('VALIDATION_ERROR', 'assetId must be a valid UUID'));
  }

  try {
    const { stream, contentType } = await getAssetThumbnail(assetIdResult.data);
    res.setHeader('Content-Type', contentType);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}
