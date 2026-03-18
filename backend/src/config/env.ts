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
  ASSET_STORAGE_PATH: requireEnv('ASSET_STORAGE_PATH', './storage'),

  // LLM provider config
  LLM_PROVIDER: requireEnv('LLM_PROVIDER', 'stub') as 'stub' | 'openai',
  LLM_CALL_TIMEOUT_MS: parseIntEnv('LLM_CALL_TIMEOUT_MS', 12_000),
  LLM_TOTAL_BUDGET_MS: parseIntEnv('LLM_TOTAL_BUDGET_MS', 18_000),
  LLM_MAX_RETRIES: parseIntEnv('LLM_MAX_RETRIES', 1),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
  OPENAI_MODEL: requireEnv('OPENAI_MODEL', 'gpt-4o'),

  // Agent/suggest config
  SUGGEST_REQUEST_TIMEOUT_MS: parseIntEnv('SUGGEST_REQUEST_TIMEOUT_MS', 20_000),
  SUGGEST_RATE_LIMIT: parseIntEnv('SUGGEST_RATE_LIMIT', 12),
  AGENT_TIMEOUT_MS: parseIntEnv('AGENT_TIMEOUT_MS', 12_000),
  CHAT_REQUEST_TIMEOUT_MS: parseIntEnv('CHAT_REQUEST_TIMEOUT_MS', 20_000),
} as const;
