import { PoolClient } from 'pg';
import { pool } from './pool.js';
import { Board } from '../schemas/board.schemas.js';
import { OperationEntry } from '../domain/operations/operation-factory.js';
import { assertBoardExists } from '../domain/validation/board-rules.js';
import { findBoardById, updateBoard as updateBoardRepo } from '../repos/boards.repo.js';
import { insertOperation } from '../repos/operations.repo.js';
import { logger } from '../obs/logger.js';

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Advisory Lock ────────────────────────────────────────────────────────────

export async function acquireBoardLock(client: PoolClient, boardId: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [boardId]);
}

// ─── Board Mutation Wrapper ───────────────────────────────────────────────────

export interface BoardMutationContext {
  client: PoolClient;
  board: Board;
}

export interface BoardMutationResult<T> {
  result: T;
  operations: OperationEntry[];
  /** New revision after bump. Null if mutation does not bump revision (e.g., soft-delete). */
  newRevision: number | null;
}

export async function withBoardMutation<T>(
  boardId: string,
  fn: (ctx: BoardMutationContext) => Promise<BoardMutationResult<T>>
): Promise<T> {
  return withTransaction(async (client) => {
    await acquireBoardLock(client, boardId);

    const board = await findBoardById(client, boardId);
    assertBoardExists(board);

    const { result, operations, newRevision } = await fn({ client, board: board! });

    if (newRevision !== null) {
      await updateBoardRepo(client, boardId, { revision: newRevision });
    }

    for (const op of operations) {
      await insertOperation(client, op);
    }

    logger.info('Board mutation committed', {
      boardId,
      revision: newRevision,
      operationCount: operations.length,
      operationTypes: operations.map((o) => o.operation_type),
    });

    return result;
  });
}
