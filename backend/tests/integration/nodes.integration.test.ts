/**
 * Integration tests for node CRUD + cascade.
 * Requires a running PostgreSQL database.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool } from '../../src/db/pool.js';
import { createBoard } from '../../src/services/boards.service.js';
import { createNode, updateNode, deleteNode } from '../../src/services/nodes.service.js';
import { NodeNotFoundError, NodeLockedError } from '../../src/domain/validation/node-rules.js';
import { BoardValidationError } from '../../src/domain/validation/board-rules.js';
import { updateBoard } from '../../src/services/boards.service.js';

async function cleanAll() {
  await pool.query('DELETE FROM board_operations');
  await pool.query('DELETE FROM board_edges');
  await pool.query('DELETE FROM board_nodes');
  await pool.query('DELETE FROM idempotency_keys');
  await pool.query('DELETE FROM chat_threads');
  await pool.query('DELETE FROM boards');
}

let boardId: string;

beforeAll(async () => {
  await cleanAll();
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

beforeEach(async () => {
  await cleanAll();
  const { board } = await createBoard({ title: 'Test Board' });
  boardId = board.id;
});

describe('createNode', () => {
  it('creates a sticky node with correct content', async () => {
    const result = await createNode(boardId, {
      type: 'sticky',
      x: 100,
      y: 200,
      width: 200,
      height: 120,
      content: { text: 'Hello' },
      parentId: null,
      rotation: 0,
      zIndex: 0,
      style: {},
      metadata: {},
    });

    expect(result.node.type).toBe('sticky');
    expect(result.node.x).toBe(100);
    expect(result.node.y).toBe(200);
    expect(result.node.content).toEqual({ text: 'Hello' });
    expect(result.node.boardId).toBe(boardId);
  });

  it('creates a text node', async () => {
    const result = await createNode(boardId, {
      type: 'text',
      x: 0,
      y: 0,
      width: 240,
      height: 160,
      content: { text: 'Body', title: 'Title' },
      parentId: null,
      rotation: 0,
      zIndex: 0,
      style: {},
      metadata: {},
    });

    expect(result.node.type).toBe('text');
    expect(result.node.content).toEqual({ text: 'Body', title: 'Title' });
  });

  it('creates a shape node', async () => {
    const result = await createNode(boardId, {
      type: 'shape',
      x: 0,
      y: 0,
      width: 160,
      height: 160,
      content: { shapeType: 'rectangle' },
      parentId: null,
      rotation: 0,
      zIndex: 0,
      style: {},
      metadata: {},
    });

    expect(result.node.type).toBe('shape');
    expect(result.node.content).toEqual({ shapeType: 'rectangle' });
  });

  it('bumps board revision and writes create_node operation', async () => {
    const result = await createNode(boardId, {
      type: 'sticky',
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      content: { text: 'Test' },
      parentId: null,
      rotation: 0,
      zIndex: 0,
      style: {},
      metadata: {},
    });

    expect(result.boardRevision).toBe(1);

    const ops = await pool.query(
      'SELECT * FROM board_operations WHERE board_id = $1 ORDER BY created_at DESC LIMIT 1',
      [boardId]
    );
    expect(ops.rows[0].operation_type).toBe('create_node');
    expect(ops.rows[0].target_type).toBe('node');
    expect(Number(ops.rows[0].board_revision)).toBe(1);
  });
});

describe('updateNode', () => {
  it('updates position correctly', async () => {
    const { node } = await createNode(boardId, {
      type: 'sticky',
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      content: { text: 'Test' },
      parentId: null,
      rotation: 0,
      zIndex: 0,
      style: {},
      metadata: {},
    });

    const result = await updateNode(node.id, { x: 300, y: 400 });
    expect(result.node.x).toBe(300);
    expect(result.node.y).toBe(400);
  });

  it('merge-patches content correctly', async () => {
    const { node } = await createNode(boardId, {
      type: 'text',
      x: 0,
      y: 0,
      width: 240,
      height: 160,
      content: { text: 'Original', title: 'Title' },
      parentId: null,
      rotation: 0,
      zIndex: 0,
      style: {},
      metadata: {},
    });

    const result = await updateNode(node.id, { content: { text: 'Updated' } });
    expect(result.node.content).toEqual({ text: 'Updated', title: 'Title' });
  });

  it('bumps revision and writes update_node operation', async () => {
    const { node } = await createNode(boardId, {
      type: 'sticky',
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      content: { text: 'Test' },
      parentId: null,
      rotation: 0,
      zIndex: 0,
      style: {},
      metadata: {},
    });

    const result = await updateNode(node.id, { x: 50 });
    expect(result.boardRevision).toBe(2);

    const ops = await pool.query(
      "SELECT * FROM board_operations WHERE operation_type = 'update_node' AND target_id = $1",
      [node.id]
    );
    expect(ops.rows).toHaveLength(1);
  });

  it('rejects update on locked node', async () => {
    const { node } = await createNode(boardId, {
      type: 'sticky',
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      content: { text: 'Test' },
      parentId: null,
      rotation: 0,
      zIndex: 0,
      style: {},
      metadata: {},
    });

    // Lock the node
    await updateNode(node.id, { locked: true });

    await expect(updateNode(node.id, { x: 100 })).rejects.toThrow(NodeLockedError);
  });

  it('rejects update on soft-deleted node', async () => {
    const { node } = await createNode(boardId, {
      type: 'sticky',
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      content: { text: 'Test' },
      parentId: null,
      rotation: 0,
      zIndex: 0,
      style: {},
      metadata: {},
    });

    await deleteNode(node.id);

    await expect(updateNode(node.id, { x: 100 })).rejects.toThrow(NodeNotFoundError);
  });
});

describe('deleteNode', () => {
  it('soft-deletes node and writes delete_node operation', async () => {
    const { node } = await createNode(boardId, {
      type: 'sticky',
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      content: { text: 'Test' },
      parentId: null,
      rotation: 0,
      zIndex: 0,
      style: {},
      metadata: {},
    });

    const result = await deleteNode(node.id);
    expect(result.deletedNodeId).toBe(node.id);
    expect(result.deletedEdgeIds).toEqual([]);

    const ops = await pool.query(
      "SELECT * FROM board_operations WHERE operation_type = 'delete_node'",
    );
    expect(ops.rows).toHaveLength(1);
  });

  it('cascades to connected edges', async () => {
    const { node: n1 } = await createNode(boardId, {
      type: 'sticky',
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      content: { text: 'A' },
      parentId: null,
      rotation: 0,
      zIndex: 0,
      style: {},
      metadata: {},
    });

    const { node: n2 } = await createNode(boardId, {
      type: 'sticky',
      x: 300,
      y: 0,
      width: 200,
      height: 120,
      content: { text: 'B' },
      parentId: null,
      rotation: 0,
      zIndex: 0,
      style: {},
      metadata: {},
    });

    // Insert an edge between n1 and n2
    await pool.query(
      `INSERT INTO board_edges (id, board_id, source_node_id, target_node_id)
       VALUES (gen_random_uuid(), $1, $2, $3)`,
      [boardId, n1.id, n2.id]
    );

    const result = await deleteNode(n1.id);
    expect(result.deletedEdgeIds).toHaveLength(1);

    // Verify edge is soft-deleted
    const edges = await pool.query(
      'SELECT * FROM board_edges WHERE board_id = $1 AND deleted_at IS NULL',
      [boardId]
    );
    expect(edges.rows).toHaveLength(0);
  });

  it('cascade and node delete share same revision', async () => {
    const { node } = await createNode(boardId, {
      type: 'sticky',
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      content: { text: 'Test' },
      parentId: null,
      rotation: 0,
      zIndex: 0,
      style: {},
      metadata: {},
    });

    const result = await deleteNode(node.id);
    expect(result.boardRevision).toBe(2); // create=1, delete=2
  });

  it('rejects delete on locked node', async () => {
    const { node } = await createNode(boardId, {
      type: 'sticky',
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      content: { text: 'Test' },
      parentId: null,
      rotation: 0,
      zIndex: 0,
      style: {},
      metadata: {},
    });

    await updateNode(node.id, { locked: true });
    await expect(deleteNode(node.id)).rejects.toThrow(NodeLockedError);
  });
});

describe('archived board', () => {
  it('rejects node mutations on archived board', async () => {
    await updateBoard(boardId, { status: 'archived' });

    await expect(
      createNode(boardId, {
        type: 'sticky',
        x: 0,
        y: 0,
        width: 200,
        height: 120,
        content: { text: 'Test' },
        parentId: null,
        rotation: 0,
        zIndex: 0,
        style: {},
        metadata: {},
      })
    ).rejects.toThrow(BoardValidationError);
  });
});
