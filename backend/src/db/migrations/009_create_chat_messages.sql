CREATE TABLE IF NOT EXISTS chat_messages (
  id                uuid        PRIMARY KEY,
  thread_id         uuid        NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_type       text        NOT NULL,
  message_text      text,
  message_json      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  selection_context jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chat_messages_sender_type_check
    CHECK (sender_type IN ('user', 'agent', 'system'))
);

CREATE INDEX idx_chat_messages_thread_created ON chat_messages(thread_id, created_at);
CREATE INDEX idx_chat_messages_sender_type ON chat_messages(sender_type);
