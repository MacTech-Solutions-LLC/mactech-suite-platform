# Create Small Slice

Use this prompt when implementing a small repository change.

```text
Inspect the repo first, then propose the exact files and folders to create or
edit before making changes.

Goal:
Implement one small, reviewable slice that advances the stated task without
introducing unrelated product features.

Rules:
- Keep the change narrow.
- Do not delete files.
- Do not move files outside the repository.
- Do not add secrets, credentials, tokens, API keys, or customer data.
- Do not push.
- Update docs, evidence, or decision records when the change affects them.
- Run relevant safe validation and show git status afterward.
```
