# Repository Guide

This repository ships three Bun-first terminal tools:

- `mvi`: interactive move
- `cpi`: interactive copy
- `rmi`: interactive remove, trash by default

For a faster project handoff, start with [docs/README.md](/home/kitsunekode/Projects/cli-tools/interactive-move-copy-cli/docs/README.md).

## Core Expectations

- Favor data safety over speed. Do not weaken the staged-copy, verification, overwrite-backup, or recovery-journal behavior without a strong reason.
- `rmi` must stay trash-first unless the user explicitly opts into hard delete by flag or config.
- The TUI is interactive-only. `--help` and `--version` should continue to work without a TTY, but full browsing mode should not emit escape sequences in non-interactive contexts.
- Prefer removing wasted work over adding abstraction. Cold-path laziness, bounded concurrency, and avoiding unnecessary rescans are the right optimization shape here.

## Important Paths

- `src/cli.ts`: argument parsing, mode dispatch, help output
- `src/config.ts`: shared config bootstrap and normalization
- `src/ops/safe-fs.ts`: verified filesystem operations, trash handling, recovery journal
- `src/ops/executor.ts`: operation execution and summaries
- `src/ops/validator.ts`: preflight validation and conflict detection
- `src/tui/file-browser.ts`: source selection UI
- `src/tui/folder-picker.ts`: destination picker UI
- `src/tui/destination-search.ts`: direct path jumps and optional `fzf` destination search
- `src/tui/terminal.ts`: key parsing, raw mode, cleanup
- `completions/mvi.zsh`: shared Zsh completion bootstrap for `mvi`, `cpi`, and `rmi`
- `completions/mvi.bash`: Bash completion

## Config Workflow

- Shared config path: `${XDG_CONFIG_HOME:-~/.config}/interactive-move-copy-cli/config.json`
- State path: `${XDG_CONFIG_HOME:-~/.config}/interactive-move-copy-cli/state.json`
- Default config is created or normalized by `bun run config:init`
- `bun run config:edit` should ensure the file exists first, then open it with `$VISUAL`, then `$EDITOR`, then `nano`
- `bun run link:global` is expected to initialize config before building and linking

Current default shape:

```json
{
  "mvi": {},
  "cpi": {},
  "destinationSearch": {
    "roots": ["~"],
    "bookmarks": {},
    "rememberRecent": true,
    "recentLimit": 8
  },
  "rmi": {
    "mode": "trash"
  }
}
```

## Completion Notes

- Zsh completion is sourced through `completions/mvi.zsh`
- Completion should work for `mvi`, `cpi`, and `rmi`
- Keep local Zsh options compatible with `_arguments` and `_directories`
- Do not tell users to invoke completion functions directly
- Destination picker supports direct path jumps, bookmarks, and optional `fzf` search from configured roots

## Verification

Run these before committing behavior changes:

```sh
bun test
bun run build
```

Useful targeted checks:

```sh
bun run src/bin/mvi.ts --help
bun run src/bin/cpi.ts --help
bun run src/bin/rmi.ts --help
```

When changing config bootstrap behavior, also smoke test:

```sh
XDG_CONFIG_HOME=/tmp/interactive-move-copy-cli-config bun run config:init
EDITOR=true XDG_CONFIG_HOME=/tmp/interactive-move-copy-cli-config bun run config:edit
```
