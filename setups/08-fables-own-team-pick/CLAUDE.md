## Delegation
- Do the work in the main session by default. Planning, core game code and tuning stay here.
- Use `builder` only for a self-contained piece you can specify in one paragraph.
- Use `scout` for codebase searches and log summaries that would take more than a few lookups.
- Use `tester` when test output would be long. Use `reviewer` once per finished feature.
- Never run two builders on the same files.
- Check a subagent's report against the code before relying on it.
