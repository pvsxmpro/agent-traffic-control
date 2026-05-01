# Agent Traffic Control

Local-first ATC board for parallel LLM agent sessions, built as an Obsidian plugin. The board lives as a single markdown file in your vault — the plugin just renders it as a 2D sector × bay grid.

The board exists to answer four questions at any moment:

1. What is in flight?
2. Who or what is controlling it?
3. What needs my attention next?
4. Where is the risk?

## Install

1. Run `npm install` then `npm run build` to produce `main.js` next to `manifest.json`.
2. Copy this folder (or just `manifest.json`, `main.js`, `styles.css`) into `<your-vault>/.obsidian/plugins/agent-traffic-control/`.
3. Reload Obsidian and enable the plugin in Community plugins → Installed.
4. Create your board file (default path: `12. Kanban/Agent Traffic/Agent Sessions.md`) starting from `tests/fixtures/sample-board.md` if you want a head start.
5. Click the radio-tower icon in the ribbon, or run "Open today's board" from the command palette.

## Develop

```bash
git init -b main && git add -A && git commit -m "feat: initial v1"
npm install
npm run dev      # esbuild watch mode
npm test         # round-trip parser tests
npm run typecheck
```

The round-trip invariant is locked by `tests/run.mjs`: `parse(serialize(parse(text)))` must equal `parse(text)`, and any line the parser doesn't recognise must survive the round-trip untouched.

## Markdown schema

Frontmatter declares the configuration; the body is one H1 per sector, one H2 per bay, and a list-item per strip. Continuation lines are indented two spaces. See `tests/fixtures/sample-board.md` for the canonical shape.

## Commands

| Command | Default hotkey |
|---|---|
| Open today's board | — |
| Create new strip | `N` (board focus) |
| Generate resume prompt | `R` (strip selected) |
| Generate handoff prompt | `H` (strip selected) |
| Generate context-reset prompt | — |
| Land the day | — |
| Park selected strip | `P` (strip selected) |
| Open today's archive | — |

## License

MIT — see `LICENSE`.
