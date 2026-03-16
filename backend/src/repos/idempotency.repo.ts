import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';

export interface IdempotencyRecord {
  id: string;
  scopeKey: string;
  requestFingerprint: string;
  responseStatusCode: number;
  responseBody: unknown;
  createdAt: string;
  expiresAt: string;
}

function rowToRecord(row: Record<string, unknown>): IdempotencyRecord {
  return {
    id: row.id as string,
    scopeKey: row.scope_key as string,
    requestFingerprint: row.request_fingerprint as string,
    responseStatusCode: row.response_status_code as number,
    responseBody: row.response_body,
    createdAt: (row.created_at as Date).toISOString(),
    expiresAt: (row.expires_at as Date).toISOString(),
  };
}

export async function findByScope(
  client: PoolClient,
  scopeKey: string
): Promise<IdempotencyRecord | null> {
  const { rows } = await client.query(
    `SELECT * FROM idempotency_keys WHERE scope_key = $1 AND expires_at > now()`,
    [scopeKey]
  );
  if (rows.length === 0) return null;
  return rowToRecord(rows[0]);
}

export async function insertKey(
  client: PoolClient,
  data: {
    scopeKey: string;
    requestFingerprint: string;
    responseStatusCode: number;
    responseBody: unknown;
  }
): Promise<void> {
  const expiresAt = new Date(
    Date.now() + env.IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000
  );
  await client.query(
    `INSERT INTO idempotency_keys (id, scope_key, request_fingerprint, response_status_code, response_body, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (scope_key) DO NOTHING`,
    [
      uuidv4(),
      data.scopeKey,
      data.requestFingerprint,
      data.responseStatusCode,
      JSON.stringify(data.responseBody),
      expiresAt,
    ]
  );
}
