# Contract: Agent Apply Endpoint (011-agent-apply)

## Endpoint

- **Method**: `POST`  
- **Path**: `/boards/{boardId}/agent/actions/apply`

## Purpose

Apply a previously generated and validated agent action plan to the specified board in a single atomic transaction, incrementing the board revision exactly once, writing agent-attributed operations, and returning an updated, authoritative view of the board state and any temp ID mappings.

## Request

### Path parameters

- `boardId` (string, UUID): Identifier of the target board.

### Body

```json
{
  "mode": "apply",
  "actionPlan": [
    {
      "type": "create_node",
      "tempId": "temp-node-1",
      "node": {
        "type": "note",
        "x": 100,
        "y": 200,
        "width": 160,
        "height": 80,
        "zIndex": 1,
        "content": {
          "text": "New idea"
        },
        "metadata": {
          "locked": false
        }
      }
    },
    {
      "type": "update_node",
      "nodeId": "existing-node-id",
      "patch": {
        "content": {
          "text": "Updated summary"
        }
      }
    },
    {
      "type": "delete_node",
      "nodeId": "node-to-delete-id"
    },
    {
      "type": "create_edge",
      "tempId": "temp-edge-1",
      "edge": {
        "sourceId": "existing-node-id",
        "targetId": "temp-node-1"
      }
    },
    {
      "type": "batch_layout",
      "items": [
        {
          "nodeId": "existing-node-id",
          "x": 120,
          "y": 220
        }
      ]
    }
  ]
}
```

### Notes

- `mode` MUST be `"apply"` for this endpoint.
- `actionPlan` MUST be a non-empty array of allowed action items (no disallowed types).
- The server derives the idempotency key from the normalized plan plus the current board revision; clients are not required to send a separate idempotency token.

## Responses

### 200 OK — Apply succeeded

```json
{
  "boardRevision": 42,
  "updatedBoard": {
    "id": "board-id",
    "revision": 42,
    "nodes": [
      {
        "id": "new-node-id",
        "type": "note",
        "x": 100,
        "y": 200,
        "width": 160,
        "height": 80,
        "zIndex": 1,
        "content": {
          "text": "New idea"
        },
        "metadata": {
          "locked": false
        }
      }
      // ... other nodes ...
    ],
    "edges": [
      {
        "id": "new-edge-id",
        "sourceId": "existing-node-id",
        "targetId": "new-node-id"
      }
      // ... other edges ...
    ]
  },
  "tempIdMapping": {
    "nodes": {
      "temp-node-1": "new-node-id"
    },
    "edges": {
      "temp-edge-1": "new-edge-id"
    }
  }
}
```

### 409 Conflict — Locked targets

```json
{
  "error": {
    "code": "LOCKED_NODE",
    "message": "Some items in the plan target locked content and cannot be changed.",
    "details": {
      "lockedNodeIds": ["locked-node-id-1", "locked-node-id-2"]
    }
  }
}
```

- No changes are committed.
- Board revision remains unchanged.

### 422 Unprocessable Entity — Invalid action plan

```json
{
  "error": {
    "code": "ACTION_PLAN_INVALID",
    "message": "The proposed changes no longer match the current board.",
    "details": {
      "reasons": [
        "Node 'node-to-delete-id' no longer exists.",
        "Edge 'edge-to-update-id' references a deleted node."
      ]
    }
  }
}
```

- No changes are committed.
- Board revision remains unchanged.

### 404 Not Found — Board does not exist

```json
{
  "error": {
    "code": "BOARD_NOT_FOUND",
    "message": "We couldn't find that board.",
    "details": {}
  }
}
```

### 409 Conflict — Board archived

```json
{
  "error": {
    "code": "BOARD_ARCHIVED",
    "message": "This board is archived and cannot be changed.",
    "details": {}
  }
}
```

### 413 Payload Too Large — Plan exceeds configured limits

```json
{
  "error": {
    "code": "ACTION_PLAN_TOO_LARGE",
    "message": "This set of changes is too large to apply at once. Try splitting it into smaller steps.",
    "details": {
      "maxOperations": 1000,
      "maxPayloadBytes": 1048576
    }
  }
}
```

- No changes are committed.
- Board revision remains unchanged.

## Error Envelope Conventions

- All error responses use a consistent envelope with:
  - `code`: stable, machine-readable error code.
  - `message`: concise, user-facing summary.
  - `details`: structured, non-sensitive fields that help the UI present guidance.
- Internal details (raw validation errors, stack traces, internal IDs) are logged on the server and are **not** included in the response.

