# mvi / cpi

Interactive terminal file move and copy tools. Browse files visually, multi-select with fuzzy search, pick a destination folder, and execute — all without typing paths.

`mvi` moves files. `cpi` copies files. Same interface, same keybindings.

## Features

- Visual file browser with directory navigation
- Fuzzy search to filter files as you type
- Multi-select with checkboxes
- Nerd Font icons for 30+ file types
- Destination folder picker (directories only)
- Pre-flight validation (permissions, conflicts, circular moves)
- Explicit confirmation before any operation (`Y/n`)
- No-clobber by default — never overwrites without asking
- TOCTOU guard — verifies files still exist before each operation
- Clean terminal restore on exit, Ctrl+C, or crash
- Zero runtime dependencies — just Bun

## Requirements

- [Bun](https://bun.sh) v1.0+
- A terminal with [Nerd Font](https://www.nerdfonts.com/) for file icons (optional but recommended)

## Install

```sh
git clone https://github.com/KitsuneKode/interactive-move-cli.git
cd interactive-move-cli
bun install
bun link
```

This installs `mvi` and `cpi` globally.

## Usage

```sh
mvi              # browse current directory, move selected files
mvi ~/Downloads  # start in ~/Downloads
cpi .            # copy files from current directory
```

### Flags

```
-h, --help      Show help
-v, --version   Show version
```

## How It Works

### Flow

```
mvi [dir]
  |
  v
File Browser (alt screen)
  - Browse files/dirs in current directory
  - Type to fuzzy-search, Space to select, Enter to open dirs
  - Press Enter with selections to confirm source files
  |
  v
Folder Picker (alt screen)
  - Browse directories only
  - Navigate into subdirs with Enter
  - Press 'c' to confirm current directory as destination
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
  - Runs native mv/cp per file via Bun.$
  - Verifies each source still exists before operating (TOCTOU guard)
  - Shows per-file progress with checkmarks/crosses
  - Prints summary: N moved/copied, M failed
```

### Keybindings — Source Selection

| Key | Action |
|-----|--------|
| Up/Down | Navigate file list |
| Space | Toggle selection on current file |
| Enter | Open directory / confirm selection |
| Backspace | Delete search char / go to parent |
| Ctrl+A | Select all visible files |
| Ctrl+D | Deselect all |
| Tab | Show selected files summary |
| Esc | Clear search / quit |
| Any letter | Fuzzy search |

### Keybindings — Destination Picker

| Key | Action |
|-----|--------|
| Up/Down | Navigate directories |
| Enter | Open directory |
| Backspace | Go to parent |
| c | Confirm current directory |
| Esc | Cancel (go back) |

## Data Safety

This tool is designed to never silently destroy data:

1. **No-clobber default** — Uses `mv -n` / `cp -rn`. If a file with the same name exists at the destination, the operation is skipped unless you explicitly choose overwrite.

2. **Explicit confirmation** — A final `[Y/n]` prompt shows exactly what will happen before any operation runs.

3. **Conflict detection** — Before execution, the validator checks every source filename against the destination. If conflicts exist, you choose: overwrite all, skip conflicts, or abort entirely.

4. **Circular move prevention** — Detects and blocks attempts to move a directory into its own subdirectory.

5. **TOCTOU guard** — Each file is stat-checked immediately before the mv/cp call. If a file was deleted between selection and execution, it's reported as failed and the rest continue.

6. **Native commands** — Uses the system's `mv` and `cp` directly via `Bun.$`. No custom file-copying logic that could partially write or corrupt data. Bun's shell template literals escape all arguments, preventing shell injection from filenames with special characters.

7. **Clean exit** — Terminal state (raw mode, alternate screen, cursor visibility) is restored on normal exit, Ctrl+C, SIGINT, and SIGTERM.

## Shell Completions

### Bash

Add to `~/.bashrc`:

```sh
source /path/to/interactive-move-cli/completions/mvi.bash
```

### Zsh

Add the completions directory to your `fpath` in `~/.zshrc`:

```sh
fpath=(/path/to/interactive-move-cli/completions $fpath)
autoload -Uz compinit && compinit
```

Or symlink directly:

```sh
ln -s /path/to/interactive-move-cli/completions/mvi.zsh ~/.zfunc/_mvi
```

## Project Structure

```
src/
  bin/mvi.ts, cpi.ts      Entry points (shebang scripts)
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
  ops/executor.ts          mv/cp execution with progress
tests/
  fuzzy.test.ts            Fuzzy matching tests
  format.test.ts           Formatting tests
  icons.test.ts            Icon resolution tests
  validator.test.ts        Validation logic tests
```

## Testing

```sh
bun test
```

## License

MIT
