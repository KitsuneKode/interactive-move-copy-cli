# Architecture

## Top-Level Shape

- `src/cli.ts`: argument parsing, help output, mode dispatch, confirmation flow, destination-selection loop
- `src/config.ts`: shared config bootstrap and normalization
- `src/config.ts`: shared config, destination-search preferences, and recent-destination state
- `src/bin/*.ts`: shebang entrypoints for `mvi`, `cpi`, and `rmi`
- `src/ops/safe-fs.ts`: verified copy/move logic, trash handling, overwrite replacement, recovery journal
- `src/ops/executor.ts`: per-item execution and summaries
- `src/ops/validator.ts`: preflight validation and conflict detection
- `src/tui/*`: raw terminal handling, file browser, folder picker, rendering
- `src/tui/destination-search.ts`: direct path targeting, bookmarks, recents, and external `fzf` integration for destination lookup
- `completions/*`: Bash and Zsh completion entrypoints
- `tests/*`: unit and runtime coverage
- `bin/*`: symlink-safe launchers for the built `dist/*.js` entrypoints used by `bun link`

## Runtime Flow

`mvi` and `cpi`:

1. Parse CLI flags and starting directory
2. Open source picker
3. Enter destination-selection loop:
   a. Open destination picker
   b. Validate conflicts and path safety
   c. If conflicts, prompt overwrite/skip/abort (Escape goes back to 3a)
   d. Ask for final confirmation (Escape goes back to 3a, Ctrl+C aborts)
4. Execute verified filesystem operations
5. Print summary

The destination-selection loop saves and restores the original file selection each iteration so conflict-resolution "skip" mutations are undone on loop-back. The picker reopens at the last chosen destination when navigating back.

`rmi`:

1. Parse CLI flags and config-backed removal mode
2. Open source picker
3. Validate selected sources
4. Ask for confirmation
5. Trash by default, or hard delete when explicitly requested
6. Print summary

## Safety-Critical Areas

- `src/ops/safe-fs.ts` is the highest-risk file. It owns staging, verification, overwrite replacement, backup handling, and recovery.
- `src/ops/validator.ts` prevents ambiguous or dangerous operations before execution.
- `src/tui/terminal.ts` and the picker components must always restore terminal state on exit.

## Performance Notes

- `src/cli.ts` keeps help/version and non-TTY paths lightweight by deferring heavy runtime imports until they are actually needed.
- `src/fs/file-info.ts` uses bounded concurrency for directory metadata collection.
- `src/tui/file-browser.ts` avoids recomputing fuzzy-filter results when only the cursor changes.
- `src/tui/destination-search.ts` keeps destination search off the hot path and only spawns external search tools on explicit `g` or `Ctrl+F`.
- Do not trade away the verified copy pipeline in `src/ops/safe-fs.ts` for superficial speed gains.

Do not weaken these guarantees without a clear reason:

- no-clobber by default
- verified copy before destructive fallback deletes
- replace-in-place semantics for overwrite instead of merge/nest
- trash-by-default behavior for `rmi`
- non-TTY rejection for interactive mode
- embedded `fzf` isolation from user preview/bind configuration

## Destination Search Contract

- `g` is exact targeting and resolves paths or bookmark aliases.
- `Ctrl+F` is fuzzy targeting and scans configured roots plus recent destinations.
- Embedded `fzf` should receive plain absolute directory paths only.
- Embedded `fzf` should use a self-contained env so global `FZF_DEFAULT_OPTS` or preview bindings do not break the picker.
- Returning from an external picker must not leak buffered input back into the TUI.
- Cancelling `fzf` (Ctrl+C or Escape inside fzf) must return to the folder picker with a notice, not exit the whole tool.

## Confirmation Contract

- `confirmSelection` in `src/cli.ts` returns `"confirm" | "abort" | "back"`.
- Ctrl+C is always an abort signal — it must never proceed with any operation.
- Only explicit `Y` or `Enter` confirms. `n`/`N` and Ctrl+C abort. Escape returns `"back"`.
- For `mvi`/`cpi`, Escape at the `[Y/n]` or conflict `[y/N/s]` prompt goes back to the destination picker.
- For `rmi`, both Escape and Ctrl+C at confirmation abort since there is no destination to return to.

## Tests by Concern

- `tests/executor.test.ts`: move/copy/remove execution behavior
- `tests/recovery.test.ts`: interrupted overwrite recovery
- `tests/validator.test.ts`: conflict and path validation
- `tests/cli.test.ts`: non-interactive help/runtime behavior
- `tests/config.test.ts`: shared config creation and normalization
