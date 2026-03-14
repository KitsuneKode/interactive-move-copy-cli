# Workflow

## Preferred Development Loop

1. Read [quickstart.md](/home/kitsunekode/Projects/cli-tools/interactive-move-copy-cli/docs/quickstart.md) and [architecture.md](/home/kitsunekode/Projects/cli-tools/interactive-move-copy-cli/docs/architecture.md)
2. Make the smallest coherent change
3. Run targeted checks while iterating
4. Run the full verification pass before committing

Targeted checks:

```sh
bun run src/bin/mvi.ts --help
bun run src/bin/cpi.ts --help
bun run src/bin/rmi.ts --help
bun test tests/config.test.ts
bun test tests/executor.test.ts
```

Full verification:

```sh
bun run check
bun run build
```

When testing the globally linked commands after behavior changes:

```sh
bun run relink:global
```

Config smoke tests when config behavior changes:

```sh
XDG_CONFIG_HOME=/tmp/interactive-move-copy-cli-config bun run config:init
VISUAL=true EDITOR=true XDG_CONFIG_HOME=/tmp/interactive-move-copy-cli-config bun run src/scripts/config-edit.ts
```

## Guardrails

- Keep Bun as the default runtime and build tool.
- Preserve direct-source Zsh completion through `completions/mvi.zsh`.
- Keep `mvi`, `cpi`, and `rmi` aligned where they share UX and CLI structure.
- Do not introduce non-interactive escape sequences on stdout for help/version flows.
- Favor leaving behind a recoverable temp or backup path over risking destructive data loss.
- Prefer optimizations that remove unnecessary work. Avoid full rescans on cursor-only events, avoid loading interactive modules for help/version flows, and keep concurrency bounded.
- Treat embedded `fzf` as a controlled integration point. User `FZF_DEFAULT_OPTS`, previews, and custom binds should not be allowed to destabilize the destination picker.

## When Touching Docs

- Update `README.md` for user-facing behavior changes.
- Update `AGENTS.md` for high-level repo expectations.
- Update this `docs/` folder when workflow, safety model, or ownership boundaries change.
