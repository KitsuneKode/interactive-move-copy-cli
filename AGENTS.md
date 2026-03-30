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

- `src/cli.ts`: argument parsing, mode dispatch, help output, confirmation flow, destination-selection loop
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
- Embedded `fzf` must stay self-contained: feed it plain absolute directory paths and do not rely on user `FZF_DEFAULT_OPTS` or preview bindings
- `Ctrl+F` and `g` should jump within the destination picker. Final confirmation still happens with Enter or `c`
- Cancelling `fzf` (Ctrl+C or Escape inside fzf) must return to the folder picker with a notice, not exit the whole tool

## Confirmation and Navigation Expectations

- Ctrl+C is a kill signal. It must **never** proceed with an operation. At any prompt it must abort immediately.
- Only explicit `Y` or `Enter` should confirm an operation. `n`, `N`, and Ctrl+C always abort.
- `confirmSelection` in `src/cli.ts` returns `"confirm" | "abort" | "back"`. Ctrl+C → abort, Escape → back, n/N → abort.
- For `mvi`/`cpi`, the move/copy flow is a destination-selection loop:
  - Escape at the `[Y/n]` confirmation prompt goes back to the destination picker (not abort).
  - Escape at the conflict `[y/N/s]` prompt also goes back to the destination picker.
  - The original file selection is saved and restored each loop iteration so conflict-resolution "skip" mutations are undone on loop-back.
  - `pickerStartDir` starts at `browserResult.currentDir` and updates to the last picked destination on loop-back.
- For `rmi`, there is no destination to return to, so both Escape and Ctrl+C at confirmation abort.

## Development Notes

- Linked commands run the bundled `dist/*.js` output through the `bin/*` wrappers, not live `src/` files
- After behavior changes, `bun run build` and usually `bun run relink:global` are required before testing the globally linked commands
- The `bin/*` wrappers must resolve symlinks correctly so `bun link` from `~/.bun/bin` still finds the real project `dist/` directory

## Release Workflow

- Add a changeset with `bun run changeset` for user-facing or release-worthy changes.
- Work on short-lived dev branches and merge to `main`. Do not develop long-lived release changes directly on `main`.
- `.github/workflows/version-packages.yml` opens or updates a `Version Packages` PR from merged changesets.
- Merging the version PR updates `package.json` and changelog entries for the next release.
- `.github/workflows/ci.yml` validates pull requests and `main` with `bun run check` and `bun run pkg:check`, and records the validated package version in the workflow summary.
- `.github/workflows/release.yml` runs on pushes to `main` and manual dispatch. When `NPM_TOKEN` is configured and the version is not already on npm, it publishes the exact `package.json` version and creates a GitHub release tagged `vX.Y.Z`.

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
