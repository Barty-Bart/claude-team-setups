# Rerunning the test

These are the scripts that ran every build and scored it. They're here so you can see exactly how each run was sealed and checked, or rerun a job yourself.

- `jobs/<job>/prompt.txt` is the brief each setup got (with any starter files next to it).
- `run_build.py` runs one setup on one job in a fresh, sealed folder inside a Docker container.
- `hidden-checks/` holds the checks the building models never saw.
- `judge.py` asks two blind judges (Opus 5.5 and Sonnet 5.5) to score a finished build.

You'll need Docker, Node and Python 3, plus Claude Code signed in. The scripts read these settings:

| Variable | What it is | Default |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | your Claude Code token (or put it in the file below) | none |
| `CTS_ENV_FILE` | a file with `CLAUDE_CODE_OAUTH_TOKEN=...` in it | `~/.env` |
| `NODE_DIR` | the Node install the checks use | `/usr/local` |
| `CTS_SCRATCH` | where run configs are written | `~/.cache/claude-team-setups` |

Each run costs real money: the whole test cost about $394.
