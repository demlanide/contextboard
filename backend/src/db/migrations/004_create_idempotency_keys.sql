CREATE TABLE IF NOT EXISTS idempotency_keys (
  id                   uuid        PRIMARY KEY,
  scope_key            text        NOT NULL UNIQUE,
  request_fingerprint  text        NOT NULL,
  response_status_code integer     NOT NULL,
  response_body        jsonb       NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at
  ON idempotency_keys(expires_at);
