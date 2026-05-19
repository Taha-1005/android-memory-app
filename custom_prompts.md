# Custom Prompts Bundled in Claude Code

Source file (compiled binary, all prompts embedded as string literals):

`/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe`

## User-invocable skills (slash commands)

| Name | Description |
|---|---|
| `batch` | Research and plan a large-scale change, then execute it in parallel across 5–30 isolated worktree agents that each open a PR. |
| `claude-api` | Build, debug, and optimize Claude API / Anthropic SDK apps (includes prompt caching, model migrations). |
| `claude-in-chrome` | Automates Chrome to interact with web pages — click, fill forms, screenshot, read console. |
| `debug` | Enable debug logging for this session and help diagnose issues. |
| `dream` | Reflective memory consolidation — review recent activity, synthesize learnings into memory. |
| `fewer-permission-prompts` | Scan transcripts for common read-only Bash/MCP calls and add an allowlist to project settings. |
| `init` | Initialize a new CLAUDE.md file with codebase documentation. |
| `loop` | Run a prompt or slash command on a recurring interval (or self-paced). |
| `review` | Review a pull request. |
| `schedule` | Create, update, list, or run scheduled remote agents (cron-style routines). |
| `security-review` | Complete a security review of the pending changes on the current branch. |
| `simplify` | Review changed code for reuse, quality, and efficiency, then fix any issues found. |
| `update-config` | Configure the Claude Code harness via settings.json (hooks, permissions, env vars). |

## Internal / non-user-invocable prompts

| Name | Description |
|---|---|
| `keybindings-help` | Help configure keyboard shortcuts / `~/.claude/keybindings.json`. |
| `init-verifiers` | Create verifier skill(s) for automated verification of code changes. |
| `memory-types` (internal ref) | Reference for the memory type taxonomy (user/feedback/project/reference). |

## Notes

- These prompts are embedded as UTF-8/UTF-16 string literals inside the
  compiled `claude.exe` binary. They are not shipped as standalone `.md`
  files.
- The `web-research` skill listed in the running session is **not** in this
  binary — it is provided by a separately installed plugin/skill bundle.
- `userInvocable: !0` (true) skills appear as `/name` commands; `!1` (false)
  ones are loaded by the harness automatically based on triggers.
