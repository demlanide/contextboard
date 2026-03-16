import { z } from 'zod';
import { BoardSchema, ChatThreadSchema } from './board.schemas.js';

// ─── TypeScript Interfaces (camelCase, matching OpenAPI) ─────────────────────

export interface Node {
  id: string;
  boardId: string;
  type: 'sticky' | 'text' | 'image' | 'shape';
  parentId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  content: Record<string, unknown>;
  style: Record<string, unknown>;
  metadata: Record<string, unknown>;
  locked: boolean;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Edge {
  id: string;
  boardId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string | null;
  style: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BoardState {
  board: import('./board.schemas.js').Board;
  nodes: Node[];
  edges: Edge[];
  chatThread: import('./board.schemas.js').ChatThread;
  lastOperationRevision: number;
}

// ─── Zod Schemas (T012 — response shape enforcement) ─────────────────────────

export const NodeSchema = z.object({
  id: z.string().uuid(),
  boardId: z.string().uuid(),
  type: z.enum(['sticky', 'text', 'image', 'shape']),
  parentId: z.string().uuid().nullable(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number(),
  zIndex: z.number().int(),
  content: z.record(z.unknown()),
  style: z.record(z.unknown()),
  metadata: z.record(z.unknown()),
  locked: z.boolean(),
  hidden: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const EdgeSchema = z.object({
  id: z.string().uuid(),
  boardId: z.string().uuid(),
  sourceNodeId: z.string().uuid(),
  targetNodeId: z.string().uuid(),
  label: z.string().nullable(),
  style: z.record(z.unknown()),
  metadata: z.record(z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const GetBoardStateResponseSchema = z.object({
  data: z.object({
    board: BoardSchema,
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema),
    chatThread: ChatThreadSchema,
    lastOperationRevision: z.number().int(),
  }),
  error: z.null(),
});

export type GetBoardStateResponse = z.infer<typeof GetBoardStateResponseSchema>;
