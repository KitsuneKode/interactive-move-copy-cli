# mvi / cpi / rmi

Interactive terminal file move, copy, and remove tools. Browse files visually, multi-select with fuzzy search, pick a destination folder when needed, and execute without typing paths.

`mvi` moves files. `cpi` copies files. `rmi` removes files by moving them to trash by default, with optional hard delete. The commands share the same source-selection interface and keybindings.

You can select both files and directories. Selections persist while you navigate, so you can collect items from multiple directories before choosing the destination.

## Features

- Visual file browser with directory navigation
- Fuzzy search to filter files as you type
- Multi-select with checkboxes
- Nerd Font icons for 30+ file types
- Destination folder picker (directories only)
- Pre-flight validation (permissions, conflicts, circular moves)
- Explicit confirmation before any operation (`Y/n`)
- No-clobber by default — never overwrites without asking
- Interactive remove command with trash-by-default safety
- Verified copy pipeline for copy and cross-device move operations
- Recovery journal for interrupted overwrite replacement
- Clean terminal restore on exit, Ctrl+C, or crash
- Zero runtime dependencies — just Bun

## Requirements

- [Bun](https://bun.sh) v1.0+
- A terminal with [Nerd Font](https://www.nerdfonts.com/) for file icons (optional but recommended)

## Install

```sh
git clone https://github.com/KitsuneKode/interactive-move-copy-cli.git
cd interactive-move-copy-cli
bun install
bun run link:global
```

This installs `mvi`, `cpi`, and `rmi` globally.

### Useful Scripts

```sh
bun run build           # bundle CLI entrypoints into dist/
bun run build:compile   # build standalone executables into dist/
bun run config:init     # create or normalize the shared config file
bun run config:edit     # open the shared config in $VISUAL / $EDITOR
bun run test            # run the full test suite
bun run check           # alias for the current verification suite
bun run link:global     # build and link mvi/cpi/rmi globally
bun run unlink:global   # remove the global link
bun run relink:global   # refresh the global link after changes
bun run clean           # remove dist/
```

## Usage

```sh
mvi              # browse current directory, move selected files
mvi ~/Downloads  # start in ~/Downloads
cpi .            # copy files from current directory
rmi              # move selected files to trash
rmi --hard-delete .  # permanently delete selected files from current directory
```

### Flags

```text
-h, --help      Show help
-v, --version   Show version
```

### `rmi` Delete Mode Flags

```text
--trash         Move items to trash (default)
--hard-delete   Permanently delete items
```

### `rmi` Config

All commands share one config file:

```text
${XDG_CONFIG_HOME:-~/.config}/interactive-move-copy-cli/config.json
```

`bun run link:global` runs `config:init` first, so the file is created automatically if it does not exist yet. You can also run `bun run config:init` manually to create or normalize it, and `bun run config:edit` to open it in `$VISUAL`, then `$EDITOR`, then `nano`.

The repository ships an example at [config.example.json](/home/kitsunekode/Projects/cli-tools/interactive-move-copy-cli/config.example.json).

Default config:

```json
{
  "mvi": {},
  "cpi": {},
  "rmi": {
    "mode": "trash"
  }
}
```

Current keys:

- `mvi`: reserved for future move-specific settings
- `cpi`: reserved for future copy-specific settings
- `rmi.mode`: default delete behavior, either `"trash"` or `"hard-delete"`

## How It Works

### Flow

```text
mvi [dir]
  |
  v
File Browser (alt screen)
  - Browse files/dirs in current directory
  - Type to fuzzy-search, Space to select, Right to open dirs
  - Press Enter with selections to confirm source files/directories
  |
  v
Folder Picker (alt screen)
  - Browse directories only
  - Navigate into subdirs with Right
  - Press Enter or 'c' to confirm current directory as destination
  |
  v
Validation (pre-flight checks)
  - Destination exists and is writable?
  - Source != destination?
  - Not moving a parent into its own child?
  - Name conflicts at destination? -> prompt overwrite/skip/abort
  |
  v
Confirmation Prompt
  - Lists all files and destination
  - Requires explicit 'y' to proceed (default is No)
  |
  v
Execution
  - Uses atomic rename for same-device moves when possible
  - Uses hidden staging paths plus verification for copies and fallback moves
  - Shows per-file progress with checkmarks/crosses
  - Prints summary: N moved/copied, M failed
```

```text
rmi [dir]
  |
  v
File Browser (alt screen)
  - Browse files/dirs in current directory
  - Type to fuzzy-search, Space to select, Right to open dirs
  - Press Enter with selections to confirm source files/directories
  |
  v
Validation (pre-flight checks)
  - Selected sources still exist?
  - Not deleting a parent and child in the same run?
  |
  v
Confirmation Prompt
  - Trash by default, hard delete only when explicitly requested
  - Requires explicit 'y' to proceed (default is No)
  |
  v
Execution
  - Same-device trash uses rename into the trash store when possible
  - Cross-device trash uses verified copy-then-delete
  - Hard delete permanently removes the selected paths
```

### Keybindings — Source Selection

| Key | Action |
| --- | --- |
| Up/Down | Navigate file list |
| Left | Go to parent / delete search char |
| Right | Open directory |
| Space | Toggle selection on current file |
| Enter | Confirm selection |
| Backspace | Delete search char / go to parent |
| Ctrl+A | Select all visible files |
| Ctrl+D | Deselect all |
| Ctrl+R | Reset to the starting directory/state |
| Tab | Show selected files summary |
| Esc | Clear search / quit |
| Any letter | Fuzzy search |

### Keybindings — Destination Picker

| Key | Action |
| --- | --- |
| Up/Down | Navigate directories |
| Left | Go to parent |
| Right | Open directory |
| Enter | Confirm current directory |
| Backspace | Go to parent |
| c | Confirm current directory |
| Ctrl+R | Reset to the starting directory |
| Esc | Cancel (go back) |

## Data Safety

This tool is designed to avoid silent data loss:

1. **No-clobber default** — If a path with the same name exists at the destination, the operation is skipped unless you explicitly choose overwrite.

2. **Explicit confirmation** — A final `[Y/n]` prompt shows exactly what will happen before any operation runs.

3. **Verified staging** — Copies and cross-device moves write into a hidden staging path, verify the staged result against the source, and only then promote it to the final destination.

4. **Safe replacement** — Overwrite mode replaces the existing destination path instead of merging or nesting directories.

5. **Conflict detection** — Before execution, the validator checks destination conflicts, duplicate destination names within the selection, and parent/child overlaps that would cause partial or ambiguous results.

6. **Recovery journal** — Interrupted overwrite replacements leave a journal so the next run can restore the previous destination if the final path was never promoted.

7. **Verified delete on move fallback** — When a move cannot use an atomic same-device rename, the source is deleted only after the destination copy has been verified.

8. **Trash by default** — `rmi` moves items to trash unless you explicitly opt into `--hard-delete` or set that mode in config.

9. **Clean exit** — Terminal state (raw mode, alternate screen, cursor visibility) is restored on normal exit, Ctrl+C, SIGINT, and SIGTERM.

## Shell Completions

### Bash

Add to `~/.bashrc`:

```sh
source /path/to/interactive-move-copy-cli/completions/mvi.bash
```

### Zsh

Source the helper file directly from `~/.zshrc`:

```sh
[[ ! -f ~/.config/zsh/mvi.zsh ]] || source ~/.config/zsh/mvi.zsh
```

One-time setup:

```sh
mkdir -p ~/.config/zsh
cp /path/to/interactive-move-copy-cli/completions/mvi.zsh ~/.config/zsh/mvi.zsh
```

The TUI requires an interactive terminal. `--help` and `--version` work in non-interactive shells, but browsing mode does not.

## Project Structure

```text
src/
  bin/mvi.ts, cpi.ts, rmi.ts      Entry points (shebang scripts)
  config.ts               Shared config loading and normalization
  cli.ts                   Arg parsing, orchestration
  core/types.ts            TypeScript interfaces
  core/constants.ts        ANSI codes, key maps, colors
  tui/terminal.ts          Raw mode, keypress parsing, cleanup
  tui/renderer.ts          Diff-based ANSI screen rendering
  tui/fuzzy.ts             Fuzzy match with scoring
  tui/file-browser.ts      Source file selection component
  tui/folder-picker.ts     Destination directory picker
  fs/file-info.ts          Directory listing with caching
  fs/icons.ts              Nerd Font icon mapping
  fs/format.ts             Size/date formatting
  ops/validator.ts         Pre-flight validation
  ops/executor.ts          Verified execution with progress
  ops/safe-fs.ts           Staging, verification, and recovery journal logic
  scripts/config-init.ts   Create or normalize the default config
  scripts/config-edit.ts   Open the config in the default editor
tests/
  cli.test.ts              Non-interactive runtime checks
  fuzzy.test.ts            Fuzzy matching tests
  format.test.ts           Formatting tests
  icons.test.ts            Icon resolution tests
  recovery.test.ts         Journal recovery behavior
  config.test.ts           Config loading tests
  validator.test.ts        Validation logic tests
```

## Testing

```sh
bun test
```

## License

MIT
