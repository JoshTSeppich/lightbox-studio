# Roadmap

Each item is a small, testable ticket. Keep the rule from the README: drawings are only cut, scaled as a whole and moved; nothing inside a drawing is redrawn by code.

## 0.2: make the loop smooth to use
1. **Packaging:** electron-builder config for a macOS arm64 `.dmg` and a GitHub Actions workflow that builds it on tags.
2. **Key/in-between job builder:** pick a cut keys move, choose a gap (key A, key B, how many drawings), and the app composes the pair sheet (A on the left, B on the right, blank space between), attaches it and queues the prompt from a template. Store templates in `templates/*.md`.
3. **Assemble a move from several kits:** keys + in-between kits merged in drawing order into one kit (`keys` + `gap_1_2` …), with the source of each drawing recorded.
4. **Per-frame registration check:** feet anchor drift, head bob, height spread across a move, shown under the exposure sheet.
5. **Export for the game:** a sprite sheet PNG + JSON (frame rects, anchor, hold per drawing, fps) in one click.

## 0.3: song and timing
6. **Tempo detection** from the waveform, with manual override.
7. **Hit markers:** mark drawings as hits and see them on the waveform; land all hits on beats with the fewest hold changes.
8. **Export a preview video** (MP4 with the song) with ffmpeg if installed.

## 0.4: other generators
9. A provider interface for the prompt queue so other image services can be added next to ChatGPT.
10. **Suno pull:** list your Suno songs in the sidebar and download the selected one through the Suno pane.

## Known limits
- The ChatGPT queue scripts chatgpt.com; selectors live in `src/main/automation.js` (`PAGE`).
- No undo for exposure-sheet edits yet.
