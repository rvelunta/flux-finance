# AI input mode — design notes

## Status

| Direction | Status |
|---|---|
| AI editor as on-demand service | **v1 shipped on this branch** — `Ask AI` button in topbar opens the modal in `edit` mode, with active scenario passed as context. Edits go through a single `apply_edits` tool with six diff arrays; user previews and approves before any mutation. |
| Chat UI polish | **v1 shipped** — streaming responses (`stream.on('text')` + `.finalMessage()`), markdown rendering via `marked`, avatar columns, animated dot loader, message-body bubbles. Quick-reply chips and persistent side-drawer deferred. |

## Architecture

- One `LLMInputModal` parameterized by `mode: 'setup' | 'edit'`.
- `client.svelte.js` exposes `startConversation({ mode, scenarioForContext })` to reset state and pick the right system prompt + tool.
- Setup mode → `submit_scenario` tool → preview-and-apply flow that creates a new scenario or replaces active.
- Edit mode → `apply_edits` tool → preview shows add/modify/delete diff, applies to active scenario atomically via `applyScenarioEdits()` in `state.svelte.js`.
- Both modes share the chat transcript, markdown rendering, streaming, and the "Submit now / Apply now" force-tool-call escape hatch.

## Deferred (still earmarked, see git log on this branch for prior thinking)

### Side-drawer for edit mode
The current modal blocks the underlying scenario view. Originally I wanted a side-drawer so the user could watch their scenario change. Modal is fine for v1; reconsider once user feedback says "I want to see the chart update as the AI edits."

### Quick-reply chips for multi-choice questions
When the model asks "biweekly / semi-monthly / monthly?" we could render clickable chips. Requires either:
  - the model emitting a structured signal we can parse (brittle), OR
  - a function-call tool the model uses to render a chip menu (heavier, more conversational state).
Deferred until the friction of typing one-word answers is the actual UX bottleneck.

### Per-session chat persistence
Conversation state is in-memory; closing the modal clears it. Could persist in `sessionStorage` so reopening the modal mid-session resumes. Low priority — the conversation is brief and "fresh start" is fine.

### DOMPurify on rendered markdown
We render assistant markdown via Svelte `{@html}` with `marked` defaults. Trust source: our system prompt + Claude's output + user's own input on their own browser. Reasonably safe for personal use; add DOMPurify if/when this ships to other users.

### Conflict resolution when user edits manually mid-AI-conversation
Today nothing prevents the user from clicking Add Account while a chat is open. If they do, the scenario context the AI has cached goes stale, and the next `apply_edits` might reference the wrong things. Hasn't bitten in testing because conversations are short, but worth a defensive guard later.

### Bundle weight
Main bundle grew to ~657KB after adding `marked`. Acceptable for now; revisit code-splitting if it crosses 1MB.
