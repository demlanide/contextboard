// T004: Zod schemas for agent suggest endpoint
import { z } from 'zod';
import { limits } from '../config/limits.js';

// ─── Request Schemas ────────────────────────────────────────────────────────

export const AgentActionsRequestSchema = z.object({
  prompt: z
    .string()
    .min(limits.agent.promptText.min, 'Prompt must be at least 1 character')
    .max(limits.agent.promptText.max, `Prompt must be at most ${limits.agent.promptText.max} characters`),
  mode: z.enum(['suggest', 'apply']),
  images: z.array(z.string()).max(4).optional(),
  selectionContext: z
    .object({
      selectedNodeIds: z.array(z.string().uuid()).max(limits.agent.selectionMaxNodeIds).optional(),
      selectedEdgeIds: z.array(z.string().uuid()).max(limits.agent.selectionMaxEdgeIds).optional(),
      viewport: z
        .object({
          x: z.number(),
          y: z.number(),
          zoom: z.number().positive(),
        })
        .optional(),
    })
    .optional(),
});

export type AgentActionsRequest = z.infer<typeof AgentActionsRequestSchema>;

// ─── Action Plan Item Schemas ────────────────────────────────────────────────

const ActionPlanCreateNodeSchema = z.object({
  type: z.literal('create_node'),
  tempId: z.string(),
  node: z.object({
    type: z.enum(['sticky', 'text', 'image', 'shape']),
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
    content: z.object({ text: z.string() }),
    style: z.record(z.unknown()).default({}),
    metadata: z.object({ aiGenerated: z.literal(true) }),
  }),
});

const ActionPlanUpdateNodeSchema = z.object({
  type: z.literal('update_node'),
  nodeId: z.string().uuid(),
  patch: z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    content: z.object({ text: z.string().optional() }).optional(),
    style: z.record(z.unknown()).optional(),
  }),
});

const ActionPlanDeleteNodeSchema = z.object({
  type: z.literal('delete_node'),
  nodeId: z.string().uuid(),
});

const ActionPlanCreateEdgeSchema = z.object({
  type: z.literal('create_edge'),
  tempId: z.string(),
  edge: z.object({
    sourceNodeId: z.string(),
    targetNodeId: z.string(),
    label: z.string().optional(),
    edgeType: z.string().optional(),
  }),
});

const ActionPlanUpdateEdgeSchema = z.object({
  type: z.literal('update_edge'),
  edgeId: z.string().uuid(),
  patch: z.object({
    label: z.string().optional(),
    edgeType: z.string().optional(),
  }),
});

const ActionPlanDeleteEdgeSchema = z.object({
  type: z.literal('delete_edge'),
  edgeId: z.string().uuid(),
});

const ActionPlanBatchLayoutSchema = z.object({
  type: z.literal('batch_layout'),
  items: z.array(
    z.object({
      nodeId: z.string().uuid(),
      x: z.number(),
      y: z.number(),
    })
  ),
});

export const ActionPlanItemSchema = z.discriminatedUnion('type', [
  ActionPlanCreateNodeSchema,
  ActionPlanUpdateNodeSchema,
  ActionPlanDeleteNodeSchema,
  ActionPlanCreateEdgeSchema,
  ActionPlanUpdateEdgeSchema,
  ActionPlanDeleteEdgeSchema,
  ActionPlanBatchLayoutSchema,
]);

// ─── LLM Output Schema ──────────────────────────────────────────────────────

export const LLMOutputSchema = z.object({
  explanation: z.string(),
  confidence: z.number().min(0).max(1),
  actionPlan: z.array(ActionPlanItemSchema),
  preview: z.object({
    affectedNodeIds: z.array(z.string()).default([]),
    affectedEdgeIds: z.array(z.string()).default([]),
    newNodeTempIds: z.array(z.string()).default([]),
    newEdgeTempIds: z.array(z.string()).default([]),
  }).default({ affectedNodeIds: [], affectedEdgeIds: [], newNodeTempIds: [], newEdgeTempIds: [] }),
});

// ─── Response Schema ─────────────────────────────────────────────────────────

export const PreviewPayloadSchema = z.object({
  affectedNodeIds: z.array(z.string()),
  affectedEdgeIds: z.array(z.string()),
  newNodeTempIds: z.array(z.string()),
  newEdgeTempIds: z.array(z.string()),
});

// ─── Apply Request/Response Schemas ─────────────────────────────────────────

export const ApplyRequestSchema = z.object({
  mode: z.literal('apply'),
  actionPlan: z.array(ActionPlanItemSchema).min(1),
});

export type ApplyRequest = z.infer<typeof ApplyRequestSchema>;

export const ApplyResponseSchema = z.object({
  boardRevision: z.number(),
  updatedBoard: z.object({
    id: z.string(),
    revision: z.number(),
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
  }),
  tempIdMapping: z.object({
    nodes: z.record(z.string()),
    edges: z.record(z.string()),
  }),
});

export type ApplyResponse = {
  boardRevision: number;
  updatedBoard: {
    id: string;
    revision: number;
    nodes: unknown[];
    edges: unknown[];
  };
  tempIdMapping: {
    nodes: Record<string, string>;
    edges: Record<string, string>;
  };
};
