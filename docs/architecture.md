# Architecture

## Top-Level Shape

- `src/cli.ts`: argument parsing, help output, mode dispatch, confirmation flow
- `src/config.ts`: shared config bootstrap and normalization
- `src/bin/*.ts`: shebang entrypoints for `mvi`, `cpi`, and `rmi`
- `src/ops/safe-fs.ts`: verified copy/move logic, trash handling, overwrite replacement, recovery journal
- `src/ops/executor.ts`: per-item execution and summaries
- `src/ops/validator.ts`: preflight validation and conflict detection
- `src/tui/*`: raw terminal handling, file browser, folder picker, rendering
- `completions/*`: Bash and Zsh completion entrypoints
- `tests/*`: unit and runtime coverage

## Runtime Flow

`mvi` and `cpi`:

1. Parse CLI flags and starting directory
2. Open source picker
3. Open destination picker
4. Validate conflicts and path safety
5. Ask for confirmation
6. Execute verified filesystem operations
7. Print summary

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
- Do not trade away the verified copy pipeline in `src/ops/safe-fs.ts` for superficial speed gains.

Do not weaken these guarantees without a clear reason:

- no-clobber by default
- verified copy before destructive fallback deletes
- replace-in-place semantics for overwrite instead of merge/nest
- trash-by-default behavior for `rmi`
- non-TTY rejection for interactive mode

## Tests by Concern

- `tests/executor.test.ts`: move/copy/remove execution behavior
- `tests/recovery.test.ts`: interrupted overwrite recovery
- `tests/validator.test.ts`: conflict and path validation
- `tests/cli.test.ts`: non-interactive help/runtime behavior
- `tests/config.test.ts`: shared config creation and normalization
