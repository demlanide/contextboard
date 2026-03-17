import { z } from 'zod';
import { CreateNodeRequestSchema, UpdateNodeRequestSchema } from './node.schemas.js';
import { NodeSchema } from './board-state.schemas.js';

// ─── Batch Operation Items ──────────────────────────────────────────────────

export const BatchCreateItemSchema = z.object({
  type: z.literal('create'),
  tempId: z.string().min(1),
  node: CreateNodeRequestSchema,
});

export const BatchUpdateItemSchema = z.object({
  type: z.literal('update'),
  nodeId: z.string().min(1),
  changes: UpdateNodeRequestSchema,
});

export const BatchDeleteItemSchema = z.object({
  type: z.literal('delete'),
  nodeId: z.string().uuid(),
});

export const BatchOperationItemSchema = z.discriminatedUnion('type', [
  BatchCreateItemSchema,
  BatchUpdateItemSchema,
  BatchDeleteItemSchema,
]);

export type BatchOperationItem = z.infer<typeof BatchOperationItemSchema>;

// ─── Batch Request ──────────────────────────────────────────────────────────

export const BatchRequestSchema = z.object({
  operations: z.array(BatchOperationItemSchema),
});

export type BatchRequest = z.infer<typeof BatchRequestSchema>;

// ─── Batch Response ─────────────────────────────────────────────────────────

export const BatchDeletedEntrySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['node', 'edge']),
});

export const BatchResponseSchema = z.object({
  batchId: z.string().uuid(),
  boardRevision: z.number().int(),
  created: z.array(NodeSchema.extend({ tempId: z.string() })),
  updated: z.array(NodeSchema),
  deleted: z.array(BatchDeletedEntrySchema),
});

export type BatchResponse = z.infer<typeof BatchResponseSchema>;
