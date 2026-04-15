import { z } from 'zod';

export const GetOperationsQuerySchema = z.object({
  afterRevision: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type GetOperationsQuery = z.infer<typeof GetOperationsQuerySchema>;

export const OperationResponseSchema = z.object({
  id: z.string().uuid(),
  boardId: z.string().uuid(),
  boardRevision: z.number().int(),
  actorType: z.enum(['user', 'agent', 'system']),
  operationType: z.string(),
  targetType: z.string(),
  targetId: z.string().uuid().nullable(),
  batchId: z.string().uuid().nullable(),
  payload: z.record(z.unknown()),
  inversePayload: z.record(z.unknown()).nullable(),
  createdAt: z.string(),
});

export type OperationResponse = z.infer<typeof OperationResponseSchema>;

export const GetOperationsResponseDataSchema = z.object({
  operations: z.array(OperationResponseSchema),
  nextCursor: z.string().nullable(),
  headRevision: z.number().int(),
});

export type GetOperationsResponseData = z.infer<typeof GetOperationsResponseDataSchema>;
