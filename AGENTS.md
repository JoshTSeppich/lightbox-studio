# Notes for coding agents

- Electron app. Main process: `src/main/` (window, panes, IPC, ChatGPT automation). Preload bridge: `src/preload/preload.js` (the renderer never gets Node). Renderer: `src/renderer/` (plain JS, no framework, no bundler).
- Python cutter in `python/`. It must never redraw or edit pixels inside a drawing: only cut out, scale a whole drawing, and move it.
- Check before committing: `npm run check` (syntax) and run `python3 python/sheet_to_frames.py <sheet> <rows> <cols> <outdir>` on a sample sheet when touching the cutter.
- Keep the renderer's Content-Security-Policy strict (`script-src 'self'`). No remote scripts.
- Small commits, one ticket from `docs/ROADMAP.md` at a time, each with a short note in the PR of what you tested.
- No personal names, account details or tokens in code, docs, fixtures or commit messages.
