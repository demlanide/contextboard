import multer from 'multer';
import { RequestHandler } from 'express';
import { limits } from '../../config/limits.js';

const storage = multer.memoryStorage();

export const uploadMiddleware: RequestHandler = multer({
  storage,
  limits: {
    fileSize: limits.asset.fileMaxSizeBytes,
  },
}).single('file');
