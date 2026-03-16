import { z } from 'zod';
import { limits } from '../config/limits.js';

export const CreateBoardRequestSchema = z.object({
  title: z
    .string()
    .min(limits.board.title.min, 'Title must be at least 1 character')
    .max(limits.board.title.max, `Title must be at most ${limits.board.title.max} characters`)
    .optional()
    .default('Untitled board'),
  description: z
    .string()
    .max(limits.board.description.max, `Description must be at most ${limits.board.description.max} characters`)
    .nullable()
    .optional(),
});

export type CreateBoardRequest = z.infer<typeof CreateBoardRequestSchema>;

export const UpdateBoardRequestSchema = z
  .object({
    title: z
      .string()
      .min(limits.board.title.min)
      .max(limits.board.title.max)
      .optional(),
    description: z
      .string()
      .max(limits.board.description.max)
      .nullable()
      .optional(),
    viewportState: z
      .object({
        x: z.number(),
        y: z.number(),
        zoom: z.number().positive(),
      })
      .optional(),
    settings: z.record(z.unknown()).optional(),
    summary: z.record(z.unknown()).optional(),
    status: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Patch body must contain at least one field',
  });

export type UpdateBoardRequest = z.infer<typeof UpdateBoardRequestSchema>;

export const BoardSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(['active', 'archived', 'deleted']),
  viewportState: z.record(z.unknown()),
  settings: z.record(z.unknown()),
  summary: z.record(z.unknown()),
  revision: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Board = z.infer<typeof BoardSchema>;

export const ChatThreadSchema = z.object({
  id: z.string().uuid(),
  boardId: z.string().uuid(),
  metadata: z.record(z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ChatThread = z.infer<typeof ChatThreadSchema>;
