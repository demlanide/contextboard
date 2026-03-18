// T003: Agent module types matching data-model.md shapes

export interface AgentContextSnapshot {
  meta: {
    boardId: string;
    boardRevision: number;
    mode: 'suggest';
    requestId: string;
    generatedAt: string; // ISO 8601
    limits: ContextLimits;
  };
  board: {
    title: string;
    summary: Record<string, unknown> | null;
    viewport: { x: number; y: number; zoom: number } | null;
  };
  selection: {
    selectedNodeIds: string[];
    selectedEdgeIds: string[];
  };
  nodes: {
    selected: NodeProjection[];
    nearby: NodeProjection[];
    visible: NodeProjection[];
  };
  edges: {
    selected: EdgeProjection[];
    visible: EdgeProjection[];
  };
  assets: {
    referenced: AssetProjection[];
  };
  artifacts: {
    systemNotes: SystemNote[];
  };
  sanitization: {
    piiRemoved: boolean;
    secretsRedacted: boolean;
    redactionSummary: RedactionEntry[];
  };
}

export interface ContextLimits {
  maxTokensTotal: number;
  maxTokensContent: number;
  maxSelectedNodes: number;
  maxNearbyNodes: number;
  maxVisibleNodes: number;
  maxEdges: number;
  maxActionItems: number;
}

export interface NodeProjection {
  id: string;
  type: 'sticky' | 'text' | 'image' | 'shape';
  geometry: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  zIndex: number;
  content: {
    text: string | null;
    assetId?: string | null;
  };
  metadata: {
    locked: boolean;
    hidden: boolean;
    aiGenerated: boolean;
    tags: string[];
  };
  provenance: {
    source: 'user' | 'agent' | 'system';
    updatedAt: string;
  };
}

export interface EdgeProjection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string | null;
  edgeType: string;
}

export interface AssetProjection {
  id: string;
  nodeId: string;
  thumbnailUrl: string | null;
  aiCaption: string | null;
  extractedText: string | null;
  processingStatus: 'ready' | 'processing' | 'failed';
}

export interface ClusterSummary {
  scope: 'nearby' | 'visible';
  count: number;
  themes: string[];
  sampleNodeIds: string[];
  confidence: number;
  provenance: { source: 'system'; updatedAt: string };
}

export interface SystemNote {
  kind: string;
  message: string;
}

export interface RedactionEntry {
  kind: 'email' | 'token' | 'url' | 'other';
  count: number;
}

export interface LLMRawResponse {
  explanation: string;
  confidence: number;
  actionPlan: unknown[];
  preview: unknown;
}

// Action plan items (validated shapes)
export type ActionPlanItem =
  | ActionPlanCreateNode
  | ActionPlanUpdateNode
  | ActionPlanDeleteNode
  | ActionPlanCreateEdge
  | ActionPlanUpdateEdge
  | ActionPlanDeleteEdge
  | ActionPlanBatchLayout;

export interface ActionPlanCreateNode {
  type: 'create_node';
  tempId: string;
  node: {
    type: 'sticky' | 'text' | 'image' | 'shape';
    x: number;
    y: number;
    width: number;
    height: number;
    content: { text: string };
    style: Record<string, unknown>;
    metadata: { aiGenerated: true };
  };
}

export interface ActionPlanUpdateNode {
  type: 'update_node';
  nodeId: string;
  patch: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    content?: { text?: string };
    style?: Record<string, unknown>;
  };
}

export interface ActionPlanDeleteNode {
  type: 'delete_node';
  nodeId: string;
}

export interface ActionPlanCreateEdge {
  type: 'create_edge';
  tempId: string;
  edge: {
    sourceNodeId: string;
    targetNodeId: string;
    label?: string;
    edgeType?: string;
  };
}

export interface ActionPlanUpdateEdge {
  type: 'update_edge';
  edgeId: string;
  patch: {
    label?: string;
    edgeType?: string;
  };
}

export interface ActionPlanDeleteEdge {
  type: 'delete_edge';
  edgeId: string;
}

export interface ActionPlanBatchLayout {
  type: 'batch_layout';
  items: Array<{
    nodeId: string;
    x: number;
    y: number;
  }>;
}

export interface PreviewPayload {
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
  newNodeTempIds: string[];
  newEdgeTempIds: string[];
}

export interface ValidatedLLMOutput {
  explanation: string;
  confidence: number;
  actionPlan: ActionPlanItem[];
  preview: PreviewPayload;
}
