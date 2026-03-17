import { z } from 'zod';
import { EdgeSchema } from './board-state.schemas.js';
import { limits } from '../config/limits.js';

// ─── Create Edge Request ────────────────────────────────────────────────────

export const CreateEdgeRequestSchema = z.object({
  sourceNodeId: z.string().uuid(),
  targetNodeId: z.string().uuid(),
  label: z.string().max(limits.edge.label.max).nullable().optional().default(null),
  style: z.record(z.unknown()).optional().default({}),
  metadata: z.record(z.unknown()).optional().default({}),
});

export type CreateEdgeRequest = z.infer<typeof CreateEdgeRequestSchema>;

// ─── Update Edge Request ────────────────────────────────────────────────────

export const UpdateEdgeRequestSchema = z.object({
  label: z.string().max(limits.edge.label.max).nullable().optional(),
  style: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateEdgeRequest = z.infer<typeof UpdateEdgeRequestSchema>;

// ─── Response Schemas ───────────────────────────────────────────────────────

export const EdgeResponseDataSchema = z.object({
  edge: EdgeSchema,
  boardRevision: z.number().int(),
});

export const DeleteEdgeResponseDataSchema = z.object({
  success: z.boolean(),
  deletedEdgeId: z.string().uuid(),
  boardRevision: z.number().int(),
});
