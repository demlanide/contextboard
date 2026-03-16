CREATE TABLE IF NOT EXISTS boards (
  id            uuid        PRIMARY KEY,
  title         text        NOT NULL DEFAULT 'Untitled board',
  description   text,
  status        text        NOT NULL DEFAULT 'active',
  viewport_state jsonb      NOT NULL DEFAULT '{}'::jsonb,
  settings      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  summary       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  revision      bigint      NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT boards_status_check
    CHECK (status IN ('active', 'archived', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_boards_status ON boards(status);
CREATE INDEX IF NOT EXISTS idx_boards_updated_at ON boards(updated_at DESC);
