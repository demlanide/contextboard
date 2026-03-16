# test-matrix.md

This test matrix defines a prioritized, engineer-actionable suite for verifying the single-user MVP API end-to-end, including batch atomicity, idempotency, asset pipeline behavior, agent plan validation, and forward-compat checks for future multi-user migration. It assumes schema-driven validation via OpenAPI 3.1 and standardized PATCH semantics via JSON Merge Patch.

## Assumptions (MVP limits)

- Max nodes per board: **5000**
- Max batch ops per request: **200**
- Max upload image size: **20MB**
- Max text length per node: **20,000 chars**
- LLM max tokens: **8k** (truncate to ~**6k** tokens for content)

## Test matrix (50 cases)

Legend:
- Priority `P0` = release blocker
- Priority `P1` = important
- Priority `P2` = nice-to-have
- Mode `A` = automated
- Mode `M` = manual

| ID | Title | Description | Preconditions | Request example | Expected response | Pri | Mode | Implementation notes |
|---|---|---|---|---|---|---|---|---|
| T001 | Create board | Creates board + thread | None | `POST /boards {"title":"A"}` | `201` board, revision=0 | P0 | A | Assert thread auto-created |
| T002 | List boards | Returns created board | Board exists | `GET /boards` | `200` boards[] | P0 | A | Sort `updatedAt desc` |
| T003 | Get board | Fetch metadata | Board exists | `GET /boards/{b}` | `200` board | P0 | A |  |
| T004 | Patch board title | Merge-patch title only | Board exists | `PATCH /boards/{b} {"title":"B"}` | `200` updated board | P0 | A | Require merge-patch content type |
| T005 | Patch board zoom invalid | Reject zoom out of range | Board exists | `PATCH /boards/{b} {"viewportState":{"zoom":99}}` | `422 VALIDATION_ERROR` | P1 | A | Range per spec |
| T006 | Delete board | Soft delete board | Board exists | `DELETE /boards/{b}` | `200` success | P0 | A | Subsequent `GET /boards/{b}` and `/boards/{b}/state` return `404 BOARD_NOT_FOUND` |
| T007 | Get state | Hydration returns nodes/edges/chat | Board exists | `GET /boards/{b}/state` | `200` state | P0 | A | Excludes deleted items |
| T008 | Create sticky | Basic create | Board exists | `POST /boards/{b}/nodes {...sticky...}` | `201` node | P0 | A | Validate width/height ≥ 20 |
| T009 | Create text | Basic create | Board exists | `POST /boards/{b}/nodes {...text...}` | `201` node | P0 | A | Validate text ≤ 20k |
| T010 | Create image w/o assetId | Reject | Board exists | `POST /boards/{b}/nodes {"type":"image"}` | `422` | P0 | A |  |
| T011 | Create image with missing asset | Reject | Board exists | `...assetId:"missing"` | `422 VALIDATION_ERROR` | P0 | A | Missing referenced asset is a validation failure for image-node create |
| T012 | Create shape invalid type | Reject unknown shapeType | Board exists | `...shapeType:"hex"` | `422` | P1 | A |  |
| T013 | Patch node move | `x/y` update | Node exists | `PATCH /nodes/{n} {"x":1,"y":2}` | `200` node | P0 | A |  |
| T014 | Patch node delete key via null | `null` removes key | Node exists | `PATCH /nodes/{n} {"metadata":{"groupId":null}}` | `200` key removed | P1 | A | JSON Merge Patch |
| T015 | Patch wrong content-type | Reject `application/json` | Node exists | `PATCH /nodes/{n}` CT json | `415` | P1 | A |  |
| T016 | Locked node patch | Reject edits | Locked node | `PATCH /nodes/{n} {"x":9}` | `409 LOCKED_NODE` | P0 | A | State conflict, not validation failure |
| T017 | Delete node | Soft delete | Node exists | `DELETE /nodes/{n}` | `200` | P0 | A |  |
| T018 | Delete node cascades edges | Connected edges removed | Node + edge exist | `DELETE /nodes/{n}` | `200`, edges gone | P0 | A | Validate in `state` |
| T019 | Create edge | Valid endpoints | Two nodes exist | `POST /boards/{b}/edges {a,b}` | `201` edge | P0 | A |  |
| T020 | Create edge cross-board | Reject | Nodes in different boards | `POST /boards/A/edges {a(from A), b(from B)}` | `422` | P0 | A |  |
| T021 | Create edge self-loop | Reject self-loop edge | Node exists | `...{a,a}` | `422` | P1 | A |  |
| T022 | Patch edge label | Merge patch label | Edge exists | `PATCH /edges/{e} {"label":"x"}` | `200` | P1 | A |  |
| T023 | Delete edge | Soft delete | Edge exists | `DELETE /edges/{e}` | `200` | P0 | A |  |
| T024 | Batch create+update | Atomic diff + revision bump | Board exists | `POST /boards/{b}/nodes/batch {...}` | `200` diff + `newRevision` | P0 | A | Revision increments once |
| T025 | Batch rollback on invalid op | All-or-nothing | Board exists | Batch includes bad nodeId | `422`, no change | P0 | A | Compare pre/post revision |
| T026 | Batch >200 ops | Reject | Board exists | Batch ops=201 | `422` | P1 | A |  |
| T027 | Batch tempIds mapping | Created mapping returned | Board exists | Create with tempId | `200` created[tempId] | P0 | A |  |
| T028 | Operations logged | Each mutation writes ops | Board exists | Create node then `GET ops` | Contains op | P0 | A | `actorType=user` |
| T029 | Ops afterRevision filter | Poll incremental | Ops exist | `GET ops?afterRevision=k` | Only `>k` | P1 | A |  |
| T030 | Upload asset success | Normal upload | Board exists | `POST /assets/upload (png<20MB)` | `201` asset | P0 | M | Use fixture |
| T031 | Upload asset too large | 21MB reject | None | Upload 21MB | `413` | P0 | M |  |
| T032 | Upload unsupported mime | Reject | None | Upload disallowed mime | `415` | P1 | M |  |
| T033 | Get asset metadata | Returns urls/status | Asset exists | `GET /assets/{a}` | `200` asset | P1 | A |  |
| T034 | Get asset file | Streams bytes | Asset exists | `GET /assets/{a}/file` | `200` bytes | P1 | M | Validate content-type |
| T035 | Thumb missing behavior | Missing thumbnail is not silently faked | Asset without thumb | `GET /assets/{a}/thumbnail` | `404 ASSET_THUMBNAIL_NOT_AVAILABLE` | P2 | A | No fallback thumbnail in MVP |
| T036 | Get chat | Thread + messages | Board exists | `GET /boards/{b}/chat` | `200` | P0 | A | One thread per board |
| T037 | Send chat message | Stores userMessage | Board exists | `POST /boards/{b}/chat/messages {"message":"hi"}` | `200` userMessage | P0 | A |  |
| T038 | Send chat too long | Reject >20k chars | Board exists | Send huge message | `422` | P1 | A |  |
| T039 | Agent suggest happy | Returns plan + preview | Board + nodes exist | `POST /boards/{b}/agent/actions {mode:suggest}` | `200` plan | P0 | M/A | Stub LLM in CI |
| T040 | Agent suggest no side effects | Revision unchanged | Board exists | Suggest then `GET board` | Revision same | P0 | A |  |
| T041 | Agent apply happy | Applies atomic diff | Plan valid | `POST /boards/{b}/agent/actions/apply` | `200` diff + `newRevision` | P0 | M/A | `actorType=agent` |
| T042 | Agent apply invalid action type | Reject | Board exists | Apply `type:"hack"` | `422 ACTION_PLAN_INVALID` | P0 | A |  |
| T043 | Agent apply locked target | Reject | Locked node | Apply update locked | `409 LOCKED_NODE` | P0 | A | Same conflict policy as direct node patch |
| T044 | Agent apply cross-board refs | Reject | Two boards | `create_edge` across boards | `422` | P0 | A |  |
| T045 | Agent apply too many actions | Reject >200 | Board exists | `actionPlan` size=201 | `422` | P1 | A |  |
| T046 | Idempotency POST create node | Same response repeated | Board exists | POST node with same key twice | Identical response | P0 | A |  |
| T047 | Idempotency conflict | Same key different body | Board exists | Retry with changed body | `409 IDEMPOTENCY_CONFLICT` | P0 | A |  |
| T048 | Concurrency: simultaneous batches | Monotonic revisions | Board exists | Run 2 batch calls concurrently | No partial; rev increments | P1 | M | Consider DB lock |
| T049 | Sanitization in agent context | Secrets redacted | Node contains token-like string | Suggest call | Plan ok; logs redaction | P2 | M | Verify agent-context rules |
| T050 | Migration forward-compat | Actor/sender fields stable | Board exists | Mix user/agent ops | actorType persisted | P2 | A | Future userId additive |
