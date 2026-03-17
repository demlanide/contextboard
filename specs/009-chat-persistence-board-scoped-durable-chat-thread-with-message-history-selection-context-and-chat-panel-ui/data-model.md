# Data Model: Chat Persistence

## Entities

### chat_threads (existing)

Already created in migration `002_create_chat_threads.sql`. One per board, auto-created at board creation time.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | Stable thread identity |
| board_id | uuid | NOT NULL UNIQUE FK→boards(id) ON DELETE CASCADE | One thread per board |
| metadata | jsonb | NOT NULL DEFAULT '{}' | Thread-level metadata |
| created_at | timestamptz | NOT NULL DEFAULT now() | |
| updated_at | timestamptz | NOT NULL DEFAULT now() | |

No changes needed to this table.

### chat_messages (new)

Append-only messages within a board's chat thread.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | Message identity |
| thread_id | uuid | NOT NULL FK→chat_threads(id) ON DELETE CASCADE | Parent thread |
| sender_type | text | NOT NULL CHECK IN ('user','agent','system') | Message author type |
| message_text | text | nullable | Plain text content, max 20,000 chars (app-level) |
| message_json | jsonb | NOT NULL DEFAULT '{}' | Structured content (may include actionPlan in agent messages) |
| selection_context | jsonb | NOT NULL DEFAULT '{}' | Snapshot of board selection at send time |
| created_at | timestamptz | NOT NULL DEFAULT now() | Server-assigned ordering timestamp |

**Indexes**:
- `idx_chat_messages_thread_created` on `(thread_id, created_at)` — primary query pattern for loading messages in order
- `idx_chat_messages_sender_type` on `(sender_type)` — future filtering support

### Migration: `009_create_chat_messages.sql`

```sql
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
```

## Relationships

```text
boards 1──1 chat_threads 1──* chat_messages
```

- Each board has exactly one `chat_thread` (enforced by UNIQUE constraint on `board_id`).
- Each thread has zero or more `chat_messages` ordered by `created_at`.
- Deleting a board cascades to thread, which cascades to messages.

## Validation Rules

### Message create (request boundary)

- `message` (text): required, string, 1–20,000 characters
- `selectionContext`: optional object; if provided, must contain:
  - `selectedNodeIds`: optional array of UUID strings
  - `selectedEdgeIds`: optional array of UUID strings
  - `viewport`: optional object with `x` (number), `y` (number), `zoom` (positive number)

### Message create (domain boundary)

- Board must exist and not be deleted (404 BOARD_NOT_FOUND)
- Board must not be archived (409 BOARD_ARCHIVED — for write; reads still allowed)
- Chat thread must exist for board (integrity check — auto-created at board creation)

### No mutation side effects

- Message persistence does NOT increment board revision
- Message persistence does NOT write board_operations entries
- Message persistence does NOT acquire board advisory lock

## State Transitions

Chat messages are **append-only** and **immutable** after creation. No update or delete flows exist in MVP.

| State | Description |
|-------|-------------|
| Created | Message inserted with sender_type, text, optional context |
| Permanent | Message cannot be edited or deleted in MVP |

## Selection Context Shape

```typescript
interface SelectionContext {
  selectedNodeIds?: string[]
  selectedEdgeIds?: string[]
  viewport?: {
    x: number
    y: number
    zoom: number
  }
}
```

Stored as a snapshot at send time. May reference entities that no longer exist at read time. No referential integrity enforced on stored IDs — they are informational metadata, not foreign keys.
