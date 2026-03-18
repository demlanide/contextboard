// T009 + T028: Context builder with spatial priority, truncation, and sanitization
import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { findBoardById } from '../repos/boards.repo.js';
import * as nodesRepo from '../repos/nodes.repo.js';
import * as edgesRepo from '../repos/edges.repo.js';
import * as assetsRepo from '../repos/assets.repo.js';
import { limits } from '../config/limits.js';
import { sanitizeSnapshot } from './sanitizer.js';
import { logger } from '../obs/logger.js';
import type {
  AgentContextSnapshot,
  AssetProjection,
  ContextLimits,
  NodeProjection,
  EdgeProjection,
} from './types.js';

interface SelectionContext {
  selectedNodeIds?: string[];
  selectedEdgeIds?: string[];
  viewport?: { x: number; y: number; zoom: number };
}

interface NodeRow {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  content: Record<string, unknown>;
  metadata: Record<string, unknown>;
  locked: boolean;
  hidden: boolean;
  updatedAt: string;
  boardId: string;
}

function projectNode(node: NodeRow): NodeProjection {
  return {
    id: node.id,
    type: node.type as NodeProjection['type'],
    geometry: {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      rotation: node.rotation,
    },
    zIndex: node.zIndex,
    content: {
      text: typeof node.content?.text === 'string' ? node.content.text : null,
      assetId: typeof node.content?.assetId === 'string' ? node.content.assetId : null,
    },
    metadata: {
      locked: node.locked,
      hidden: node.hidden,
      aiGenerated: node.metadata?.aiGenerated === true,
      tags: Array.isArray(node.metadata?.tags) ? node.metadata.tags as string[] : [],
    },
    provenance: {
      source: (node.metadata?.source as 'user' | 'agent' | 'system') ?? 'user',
      updatedAt: node.updatedAt,
    },
  };
}

function projectEdge(edge: {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string | null;
  metadata: Record<string, unknown>;
}): EdgeProjection {
  return {
    id: edge.id,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    label: edge.label,
    edgeType: (edge.metadata?.edgeType as string) ?? 'default',
  };
}

// Euclidean distance between centers of two bounding boxes
function centerDistance(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): number {
  const aCx = a.x + a.width / 2;
  const aCy = a.y + a.height / 2;
  const bCx = b.x + b.width / 2;
  const bCy = b.y + b.height / 2;
  return Math.sqrt((aCx - bCx) ** 2 + (aCy - bCy) ** 2);
}

// AABB overlap test — does the node intersect the viewport?
function intersectsViewport(
  node: { x: number; y: number; width: number; height: number },
  viewport: { x: number; y: number; zoom: number },
  viewportSize = { w: 1920, h: 1080 } // reasonable default
): boolean {
  const vw = viewportSize.w / viewport.zoom;
  const vh = viewportSize.h / viewport.zoom;
  const vx = viewport.x;
  const vy = viewport.y;

  return (
    node.x + node.width > vx &&
    node.x < vx + vw &&
    node.y + node.height > vy &&
    node.y < vy + vh
  );
}

export async function buildContextSnapshot(
  boardId: string,
  boardRevision: number,
  selectionContext: SelectionContext | undefined,
  { client }: { client: PoolClient }
): Promise<AgentContextSnapshot> {
  const board = await findBoardById(client, boardId);
  const allNodes = (await nodesRepo.findActiveByBoardId(client, boardId)) as NodeRow[];
  const allEdges = await edgesRepo.findActiveByBoardId(client, boardId);

  const selectedNodeIdSet = new Set(selectionContext?.selectedNodeIds ?? []);
  const selectedEdgeIdSet = new Set(selectionContext?.selectedEdgeIds ?? []);

  // Project all
  const allProjected = allNodes.map(projectNode);
  const allEdgesProjected = allEdges.map(projectEdge);

  // Classify nodes into tiers
  const selectedNodes = allProjected
    .filter((n) => selectedNodeIdSet.has(n.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, limits.agent.maxSelectedNodes);

  const selectedSet = new Set(selectedNodes.map((n) => n.id));

  // Nearby: within nearbyRadiusPx of any selected node center
  const nearbyRadiusPx = limits.agent.nearbyRadiusPx;
  let nearbyNodes: NodeProjection[] = [];

  if (selectedNodes.length > 0) {
    const selectedGeometries = selectedNodes.map((n) => n.geometry);
    nearbyNodes = allProjected
      .filter((n) => {
        if (selectedSet.has(n.id)) return false;
        return selectedGeometries.some(
          (sg) => centerDistance(sg, n.geometry) <= nearbyRadiusPx
        );
      })
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limits.agent.maxNearbyNodes);
  }

  const nearbySet = new Set(nearbyNodes.map((n) => n.id));

  // Visible: intersects viewport, excluding selected and nearby
  let visibleNodes: NodeProjection[];
  if (selectionContext?.viewport) {
    visibleNodes = allProjected
      .filter((n) => {
        if (selectedSet.has(n.id) || nearbySet.has(n.id)) return false;
        return intersectsViewport(n.geometry, selectionContext.viewport!);
      })
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limits.agent.maxVisibleNodes);
  } else {
    // No viewport — put remaining in visible
    visibleNodes = allProjected
      .filter((n) => !selectedSet.has(n.id) && !nearbySet.has(n.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limits.agent.maxVisibleNodes);
  }

  // Classify edges
  const selectedEdges = allEdgesProjected
    .filter((e) => selectedEdgeIdSet.has(e.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  const visibleEdges = allEdgesProjected
    .filter((e) => !selectedEdgeIdSet.has(e.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, limits.agent.maxEdges);

  // Collect asset references from all node tiers
  const allContextNodes = [...selectedNodes, ...nearbyNodes, ...visibleNodes];
  const assetIds = allContextNodes
    .filter((n) => n.type === 'image' && n.content.assetId)
    .map((n) => ({ nodeId: n.id, assetId: n.content.assetId! }));

  const assetProjections: AssetProjection[] = [];
  if (assetIds.length > 0) {
    try {
      const boardAssets = await assetsRepo.findByBoardId(client, boardId);
      const assetMap = new Map(boardAssets.map((a) => [a.id, a]));
      for (const { nodeId, assetId } of assetIds) {
        const asset = assetMap.get(assetId);
        if (asset) {
          assetProjections.push({
            id: asset.id,
            nodeId,
            thumbnailUrl: asset.thumbnail_storage_key ? `/assets/${asset.id}/thumbnail` : null,
            aiCaption: asset.ai_caption,
            extractedText: asset.extracted_text,
            processingStatus: asset.processing_status as 'ready' | 'processing' | 'failed',
          });
        }
      }
    } catch (err) {
      logger.warn('Failed to load assets for context', { error: String(err) });
    }
  }

  const contextLimits: ContextLimits = {
    maxTokensTotal: limits.agent.maxTokensTotal,
    maxTokensContent: limits.agent.maxTokensContent,
    maxSelectedNodes: limits.agent.maxSelectedNodes,
    maxNearbyNodes: limits.agent.maxNearbyNodes,
    maxVisibleNodes: limits.agent.maxVisibleNodes,
    maxEdges: limits.agent.maxEdges,
    maxActionItems: limits.agent.maxActionItems,
  };

  const snapshot: AgentContextSnapshot = {
    meta: {
      boardId,
      boardRevision,
      mode: 'suggest',
      requestId: uuidv4(),
      generatedAt: new Date().toISOString(),
      limits: contextLimits,
    },
    board: {
      title: board?.title ?? '',
      summary: (board?.summary as Record<string, unknown>) ?? null,
      viewport: selectionContext?.viewport ?? null,
    },
    selection: {
      selectedNodeIds: selectionContext?.selectedNodeIds ?? [],
      selectedEdgeIds: selectionContext?.selectedEdgeIds ?? [],
    },
    nodes: {
      selected: selectedNodes,
      nearby: nearbyNodes,
      visible: visibleNodes,
    },
    edges: {
      selected: selectedEdges,
      visible: visibleEdges,
    },
    assets: {
      referenced: assetProjections,
    },
    artifacts: {
      systemNotes: [],
    },
    sanitization: {
      piiRemoved: false,
      secretsRedacted: false,
      redactionSummary: [],
    },
  };

  // Apply sanitization
  return sanitizeSnapshot(snapshot);
}
