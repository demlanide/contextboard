import { PoolClient } from 'pg';
import { limits } from '../../config/limits.js';
import { Node } from '../../schemas/board-state.schemas.js';
import { findById as findAssetById } from '../../repos/assets.repo.js';
import { validateAssetForImageNode } from './asset-rules.js';

// ─── Error Classes ───────────────────────────────────────────────────────────

export class NodeError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'NodeError';
  }
}

export class NodeNotFoundError extends NodeError {
  constructor() {
    super('NODE_NOT_FOUND', 'Node not found');
  }
}

export class NodeLockedError extends NodeError {
  constructor() {
    super('LOCKED_NODE', 'Node is locked and cannot be modified');
  }
}

// ─── Assertions ──────────────────────────────────────────────────────────────

export function assertNodeExists(node: Node | null): asserts node is Node {
  if (!node) {
    throw new NodeNotFoundError();
  }
}

export function assertNodeNotLocked(node: Node): void {
  if (node.locked) {
    throw new NodeLockedError();
  }
}

// ─── Content Validation ──────────────────────────────────────────────────────

const VALID_SHAPE_TYPES = new Set(['rectangle', 'ellipse', 'diamond']);

export function validateNodeContent(
  type: Node['type'],
  content: Record<string, unknown>
): void {
  switch (type) {
    case 'sticky':
      validateStickyContent(content);
      break;
    case 'text':
      validateTextContent(content);
      break;
    case 'shape':
      validateShapeContent(content);
      break;
    case 'image':
      validateImageContent(content);
      break;
    default:
      throw new NodeError('INVALID_NODE_TYPE', `Unknown node type: ${type}`);
  }
}

function validateStickyContent(content: Record<string, unknown>): void {
  if (typeof content.text !== 'string') {
    throw new NodeError('INVALID_CONTENT', 'Sticky node requires text field');
  }
  if (content.text.length < 1 || content.text.length > limits.node.text.max) {
    throw new NodeError(
      'INVALID_CONTENT',
      `Sticky text must be 1–${limits.node.text.max} characters`
    );
  }
}

function validateTextContent(content: Record<string, unknown>): void {
  if (typeof content.text !== 'string') {
    throw new NodeError('INVALID_CONTENT', 'Text node requires text field');
  }
  if (content.text.length < 1 || content.text.length > limits.node.text.max) {
    throw new NodeError(
      'INVALID_CONTENT',
      `Text must be 1–${limits.node.text.max} characters`
    );
  }
  if (content.title !== undefined && content.title !== null) {
    if (typeof content.title !== 'string') {
      throw new NodeError('INVALID_CONTENT', 'Title must be a string');
    }
    if (content.title.length > limits.node.title.max) {
      throw new NodeError(
        'INVALID_CONTENT',
        `Title must be at most ${limits.node.title.max} characters`
      );
    }
  }
}

function validateShapeContent(content: Record<string, unknown>): void {
  if (typeof content.shapeType !== 'string' || !VALID_SHAPE_TYPES.has(content.shapeType)) {
    throw new NodeError(
      'INVALID_CONTENT',
      'Shape node requires shapeType: rectangle, ellipse, or diamond'
    );
  }
  if (content.text !== undefined && content.text !== null) {
    if (typeof content.text !== 'string') {
      throw new NodeError('INVALID_CONTENT', 'Shape text must be a string');
    }
    if (content.text.length > limits.node.shapeText.max) {
      throw new NodeError(
        'INVALID_CONTENT',
        `Shape text must be at most ${limits.node.shapeText.max} characters`
      );
    }
  }
}

function validateImageContent(content: Record<string, unknown>): void {
  if (typeof content.assetId !== 'string') {
    throw new NodeError('INVALID_CONTENT', 'Image node requires assetId field');
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(content.assetId)) {
    throw new NodeError('INVALID_CONTENT', 'assetId must be a valid UUID');
  }
  if (content.caption !== undefined && content.caption !== null) {
    if (typeof content.caption !== 'string') {
      throw new NodeError('INVALID_CONTENT', 'caption must be a string');
    }
    if (content.caption.length > limits.asset.captionMaxLength) {
      throw new NodeError(
        'INVALID_CONTENT',
        `Caption must be at most ${limits.asset.captionMaxLength} characters`
      );
    }
  }
}

/**
 * Async validation for image node content — checks that the referenced
 * asset exists, is ready, and belongs to the same board.
 * Call this after validateNodeContent for image nodes.
 */
export async function validateImageNodeAsset(
  client: PoolClient,
  content: Record<string, unknown>,
  boardId: string
): Promise<void> {
  const assetId = content.assetId as string;
  const asset = await findAssetById(client, assetId);
  validateAssetForImageNode(asset, boardId);
}
