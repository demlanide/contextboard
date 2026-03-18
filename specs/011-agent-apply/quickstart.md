# Quickstart: Agent Apply (011-agent-apply)

This quickstart shows how to use the Agent Apply feature end-to-end: generate a suggestion, review the preview, and durably apply the action plan to a board.

## 1. Prerequisites

- You have a Context Board instance running with:
  - A valid board created.
  - Agent Suggest (spec 010) implemented and enabled.
- You can authenticate and call the board APIs used in previous slices.

## 2. Get an agent suggestion with an action plan

1. Open a board in the UI.
2. In the chat panel, switch to **Suggest** mode.
3. Type a prompt such as:

   > “Group these scattered notes into three sections and tidy up the layout.”

4. Submit the suggest request.

Behind the scenes, the frontend calls:

- `POST /boards/{boardId}/agent/actions` with `mode="suggest"` and the current selection/viewport.

If successful, you should see:

- An assistant message in the chat with an explanation.
- A **preview overlay** on the canvas showing proposed changes.
- An **action summary list** describing creates, updates, deletes, and layout changes.

At this point, **no durable changes** have been made to the board.

## 3. Review the preview

Use the canvas and chat UI to:

- Inspect visual changes (new nodes, updated text, layout shifts).
- Review the action summary list to understand the scope of edits.
- Decide whether the suggestion looks safe and useful.

If you don’t like the suggestion:

- Use the **Dismiss** option to clear the preview, or
- Ask for a new suggestion with a refined prompt.

## 4. Apply the agent plan

When you are satisfied with the preview:

1. Click the **Apply** action in the UI.
2. Confirm if a confirmation step is presented.

The frontend then calls:

- `POST /boards/{boardId}/agent/actions/apply`
  - `mode` set to `"apply"`.
  - `actionPlan` set to the validated plan returned by suggest.

The backend will:

- Re-validate the action plan against the **current** board state.
- Enforce size and complexity limits for the plan.
- Execute all operations in a **single transaction**:
  - Create/update/delete nodes and edges.
  - Apply batch layout changes.
  - Write agent-attributed entries to the operations log.
  - Increment the board revision exactly once.
- Return:
  - The new `boardRevision`.
  - An updated view of the board.
  - Temp ID mappings for new nodes/edges.

The UI then:

- Reconciles its state to the returned board revision.
- Updates local IDs for any newly created nodes/edges.
- Clears the preview styling, since changes are now durable.

## 5. Handling failures safely

If apply fails, the backend returns a structured error. Common cases:

- **Locked targets**:
  - Code: `LOCKED_NODE`
  - Message: Explains that some items are locked and cannot be changed.
  - Effect: No changes are committed; revision is unchanged.

- **Invalid action plan**:
  - Code: `ACTION_PLAN_INVALID`
  - Message: Indicates the plan no longer matches the current board.
  - Details: High-level reasons (e.g., nodes deleted, references invalid).
  - Effect: No changes are committed; revision is unchanged.

- **Plan too large**:
  - Code: `ACTION_PLAN_TOO_LARGE`
  - Message: Explains that the change set is too large and should be split.
  - Details: Includes configured limits (e.g., max operations, max payload size).

In all failure cases:

- The board remains unchanged and safe.
- Users can adjust the board, dismiss the suggestion, or request a new one.

## 6. Verifying success

To confirm that apply worked as intended:

1. Refresh or re-open the board.
2. Check that:
   - The board revision has increased by exactly 1.
   - All expected changes from the plan are present.
   - There are no duplicated or partially applied changes.
3. If you have access to logs or admin tools, you can also:
   - Inspect the operations log for the board.
   - Verify that the operations for the new revision are marked as `agent`-attributed and grouped as one cohesive batch.

With this flow, Agent Apply becomes a safe, auditable way to let the agent make real changes to boards while preserving user control and system invariants.

