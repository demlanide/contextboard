/**
 * Integration tests for edge CRUD.
 * Requires a running PostgreSQL database.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool } from '../../src/db/pool.js';
import { createBoard, updateBoard } from '../../src/services/boards.service.js';
import { createNode } from '../../src/services/nodes.service.js';
import { createEdge, updateEdge, deleteEdge } from '../../src/services/edges.service.js';
import { EdgeNotFoundError, InvalidEdgeReferenceError, EdgeError } from '../../src/domain/validation/edge-rules.js';
import { BoardValidationError } from '../../src/domain/validation/board-rules.js';

async function cleanAll() {
  await pool.query('DELETE FROM board_operations');
  await pool.query('DELETE FROM board_edges');
  await pool.query('DELETE FROM board_nodes');
  await pool.query('DELETE FROM idempotency_keys');
  await pool.query('DELETE FROM chat_threads');
  await pool.query('DELETE FROM boards');
}

let boardId: string;
let nodeAId: string;
let nodeBId: string;

async function setupBoardWithNodes() {
  const { board } = await createBoard({ title: 'Test Board' });
  boardId = board.id;

  const { node: nodeA } = await createNode(boardId, {
    type: 'sticky', x: 0, y: 0, width: 200, height: 120,
    content: { text: 'A' }, parentId: null, rotation: 0, zIndex: 0, style: {}, metadata: {},
  });
  nodeAId = nodeA.id;

  const { node: nodeB } = await createNode(boardId, {
    type: 'sticky', x: 300, y: 0, width: 200, height: 120,
    content: { text: 'B' }, parentId: null, rotation: 0, zIndex: 0, style: {}, metadata: {},
  });
  nodeBId = nodeB.id;
}

beforeAll(async () => { await cleanAll(); });
afterAll(async () => { await cleanAll(); await pool.end(); });
beforeEach(async () => { await cleanAll(); await setupBoardWithNodes(); });

describe('createEdge', () => {
  it('creates edge between two active same-board nodes', async () => {
    const result = await createEdge(boardId, {
      sourceNodeId: nodeAId, targetNodeId: nodeBId, label: 'leads to', style: {}, metadata: {},
    });

    expect(result.edge.sourceNodeId).toBe(nodeAId);
    expect(result.edge.targetNodeId).toBe(nodeBId);
    expect(result.edge.label).toBe('leads to');
    expect(result.edge.boardId).toBe(boardId);
  });

  it('bumps revision exactly once and writes create_edge operation', async () => {
    const result = await createEdge(boardId, {
      sourceNodeId: nodeAId, targetNodeId: nodeBId, label: null, style: {}, metadata: {},
    });

    // 2 createNode operations (rev 1, 2) + 1 createEdge (rev 3)
    expect(result.boardRevision).toBe(3);

    const ops = await pool.query(
      "SELECT * FROM board_operations WHERE operation_type = 'create_edge' AND board_id = $1",
      [boardId]
    );
    expect(ops.rows).toHaveLength(1);
    expect(ops.rows[0].target_type).toBe('edge');
  });

  it('rejects self-loop', async () => {
    await expect(
      createEdge(boardId, {
        sourceNodeId: nodeAId, targetNodeId: nodeAId, label: null, style: {}, metadata: {},
      })
    ).rejects.toThrow(EdgeError);
  });

  it('rejects cross-board nodes', async () => {
    const { board: otherBoard } = await createBoard({ title: 'Other Board' });
    const { node: otherNode } = await createNode(otherBoard.id, {
      type: 'sticky', x: 0, y: 0, width: 200, height: 120,
      content: { text: 'Other' }, parentId: null, rotation: 0, zIndex: 0, style: {}, metadata: {},
    });

    await expect(
      createEdge(boardId, {
        sourceNodeId: nodeAId, targetNodeId: otherNode.id, label: null, style: {}, metadata: {},
      })
    ).rejects.toThrow(InvalidEdgeReferenceError);
  });

  it('rejects deleted source node', async () => {
    const { deleteNode } = await import('../../src/services/nodes.service.js');
    await deleteNode(nodeAId);

    await expect(
      createEdge(boardId, {
        sourceNodeId: nodeAId, targetNodeId: nodeBId, label: null, style: {}, metadata: {},
      })
    ).rejects.toThrow(InvalidEdgeReferenceError);
  });

  it('rejects non-existent node', async () => {
    await expect(
      createEdge(boardId, {
        sourceNodeId: '00000000-0000-0000-0000-000000000099',
        targetNodeId: nodeBId, label: null, style: {}, metadata: {},
      })
    ).rejects.toThrow(InvalidEdgeReferenceError);
  });

  it('allows duplicate edges between same nodes', async () => {
    await createEdge(boardId, {
      sourceNodeId: nodeAId, targetNodeId: nodeBId, label: 'first', style: {}, metadata: {},
    });
    const result = await createEdge(boardId, {
      sourceNodeId: nodeAId, targetNodeId: nodeBId, label: 'second', style: {}, metadata: {},
    });
    expect(result.edge.label).toBe('second');
  });
});

describe('updateEdge', () => {
  it('updates edge label via merge-patch', async () => {
    const { edge } = await createEdge(boardId, {
      sourceNodeId: nodeAId, targetNodeId: nodeBId, label: 'original', style: {}, metadata: {},
    });

    const result = await updateEdge(edge.id, { label: 'updated' });
    expect(result.edge.label).toBe('updated');
  });

  it('bumps revision and writes update_edge operation', async () => {
    const { edge } = await createEdge(boardId, {
      sourceNodeId: nodeAId, targetNodeId: nodeBId, label: null, style: {}, metadata: {},
    });

    const result = await updateEdge(edge.id, { label: 'new label' });
    expect(result.boardRevision).toBe(4); // 2 nodes + 1 create edge + 1 update

    const ops = await pool.query(
      "SELECT * FROM board_operations WHERE operation_type = 'update_edge' AND target_id = $1",
      [edge.id]
    );
    expect(ops.rows).toHaveLength(1);
  });

  it('rejects update on non-existent edge', async () => {
    await expect(
      updateEdge('00000000-0000-0000-0000-000000000099', { label: 'test' })
    ).rejects.toThrow(EdgeNotFoundError);
  });

  it('merge-patches style correctly', async () => {
    const { edge } = await createEdge(boardId, {
      sourceNodeId: nodeAId, targetNodeId: nodeBId, label: null,
      style: { color: 'red', width: 2 }, metadata: {},
    });

    const result = await updateEdge(edge.id, { style: { color: 'blue' } });
    expect(result.edge.style).toEqual({ color: 'blue', width: 2 });
  });
});

describe('deleteEdge', () => {
  it('soft-deletes edge and writes delete_edge operation', async () => {
    const { edge } = await createEdge(boardId, {
      sourceNodeId: nodeAId, targetNodeId: nodeBId, label: 'test', style: {}, metadata: {},
    });

    const result = await deleteEdge(edge.id);
    expect(result.deletedEdgeId).toBe(edge.id);

    const ops = await pool.query(
      "SELECT * FROM board_operations WHERE operation_type = 'delete_edge' AND target_id = $1",
      [edge.id]
    );
    expect(ops.rows).toHaveLength(1);
  });

  it('deleted edge excluded from active queries', async () => {
    const { edge } = await createEdge(boardId, {
      sourceNodeId: nodeAId, targetNodeId: nodeBId, label: null, style: {}, metadata: {},
    });

    await deleteEdge(edge.id);

    const edges = await pool.query(
      'SELECT * FROM board_edges WHERE board_id = $1 AND deleted_at IS NULL',
      [boardId]
    );
    expect(edges.rows).toHaveLength(0);
  });

  it('rejects delete on non-existent edge', async () => {
    await expect(
      deleteEdge('00000000-0000-0000-0000-000000000099')
    ).rejects.toThrow(EdgeNotFoundError);
  });
});

describe('archived board', () => {
  it('rejects all edge mutations on archived board', async () => {
    await updateBoard(boardId, { status: 'archived' });

    await expect(
      createEdge(boardId, {
        sourceNodeId: nodeAId, targetNodeId: nodeBId, label: null, style: {}, metadata: {},
      })
    ).rejects.toThrow(BoardValidationError);
  });
});
