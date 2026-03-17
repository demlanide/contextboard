import { z } from 'zod';
import { NodeSchema } from './board-state.schemas.js';

// ─── Create Node Request ─────────────────────────────────────────────────────

export const CreateNodeRequestSchema = z.object({
  type: z.enum(['sticky', 'text', 'image', 'shape']),
  x: z.number(),
  y: z.number(),
  width: z.number().positive().max(10_000),
  height: z.number().positive().max(10_000),
  content: z.record(z.unknown()),
  parentId: z.string().uuid().nullable().optional().default(null),
  rotation: z.number().optional().default(0),
  zIndex: z.number().int().optional().default(0),
  style: z.record(z.unknown()).optional().default({}),
  metadata: z.record(z.unknown()).optional().default({}),
});

export type CreateNodeRequest = z.infer<typeof CreateNodeRequestSchema>;

// ─── Update Node Request ─────────────────────────────────────────────────────

export const UpdateNodeRequestSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().max(10_000).optional(),
  height: z.number().positive().max(10_000).optional(),
  rotation: z.number().optional(),
  zIndex: z.number().int().optional(),
  content: z.record(z.unknown()).optional(),
  style: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  parentId: z.string().uuid().nullable().optional(),
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
});

export type UpdateNodeRequest = z.infer<typeof UpdateNodeRequestSchema>;

// ─── Response Schemas ────────────────────────────────────────────────────────

export const NodeResponseDataSchema = z.object({
  node: NodeSchema,
  boardRevision: z.number().int(),
});

export const DeleteNodeResponseDataSchema = z.object({
  success: z.boolean(),
  deletedNodeId: z.string().uuid(),
  deletedEdgeIds: z.array(z.string().uuid()),
  boardRevision: z.number().int(),
});
