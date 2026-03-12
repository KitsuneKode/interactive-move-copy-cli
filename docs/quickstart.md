# Quickstart

This repository ships three Bun-first interactive terminal tools:

- `mvi`: interactive move
- `cpi`: interactive copy
- `rmi`: interactive remove

## Core Commands

```sh
bun install
bun run link:global
bun test
bun run build
```

Useful local commands:

```sh
bun run config:init
bun run config:edit
bun run src/bin/mvi.ts --help
bun run src/bin/cpi.ts --help
bun run src/bin/rmi.ts --help
```

## Shared Config

Config path:

```text
${XDG_CONFIG_HOME:-~/.config}/interactive-move-copy-cli/config.json
```

Default shape:

```json
{
  "mvi": {},
  "cpi": {},
  "rmi": {
    "mode": "trash"
  }
}
```

Rules:

- `bun run config:init` creates the file if it is missing and normalizes known defaults if it already exists.
- `bun run config:edit` ensures the file exists first, then opens it with `$VISUAL`, then `$EDITOR`, then `nano`.
- `bun run link:global` should continue to run `config:init` before building and linking.

## Interaction Model

- Source picker:
  - `Right` opens a directory
  - `Left` or `Backspace` goes to the parent directory
  - `Space` toggles selection
  - `Enter` confirms the current selection
  - `Ctrl+R` resets to the starting state
- Destination picker:
  - `Right` opens a directory
  - `Left` or `Backspace` goes to the parent directory
  - `Enter` or `c` confirms the current directory
  - `Ctrl+R` resets to the starting directory

## Shell Completion

- Bash completion lives in `completions/mvi.bash`
- Zsh completion is sourced through `completions/mvi.zsh`
- Completion must work for `mvi`, `cpi`, and `rmi`
- Users should never be told to run completion functions directly

## Lightweight Expectations

- Keep help/version and non-TTY failures cheap.
- Keep bundle/runtime changes small and measurable.
- Preserve safety work in copy/move/remove paths even when it costs I/O.
