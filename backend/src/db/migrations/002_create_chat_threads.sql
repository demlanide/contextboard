CREATE TABLE IF NOT EXISTS chat_threads (
  id         uuid        PRIMARY KEY,
  board_id   uuid        NOT NULL UNIQUE REFERENCES boards(id) ON DELETE CASCADE,
  metadata   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
