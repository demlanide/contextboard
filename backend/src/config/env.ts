function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) throw new Error(`Environment variable ${name} must be an integer, got: ${raw}`);
  return parsed;
}

export const env = {
  PORT: parseIntEnv('PORT', 3000),
  DATABASE_URL: requireEnv(
    'DATABASE_URL',
    'postgresql://contextboard:contextboard@localhost:5432/contextboard'
  ),
  DB_POOL_MAX: parseIntEnv('DB_POOL_MAX', 10),
  DB_STATEMENT_TIMEOUT_MS: parseIntEnv('DB_STATEMENT_TIMEOUT_MS', 3000),
  DB_POOL_TIMEOUT_MS: parseIntEnv('DB_POOL_TIMEOUT_MS', 2000),
  REQUEST_TIMEOUT_READ_MS: parseIntEnv('REQUEST_TIMEOUT_READ_MS', 2000),
  REQUEST_TIMEOUT_MUTATION_MS: parseIntEnv('REQUEST_TIMEOUT_MUTATION_MS', 5000),
  IDEMPOTENCY_TTL_HOURS: parseIntEnv('IDEMPOTENCY_TTL_HOURS', 24),
  LOG_LEVEL: requireEnv('LOG_LEVEL', 'info'),
} as const;
