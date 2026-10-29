# Lightbox Studio

A desktop studio for hand-drawn sprite animation, built around drawings you get from an image model.

- **Lightbox:** plays a move at real game speed, big and at game size, with onion skin (the drawing before in red, the one after in blue).
- **Exposure sheet:** set how many frames each drawing holds (ones, twos, threes). Timing is saved next to the move as `timing.json`.
- **Jump detector:** a bar over each step shows how much line changes from one drawing to the next. Steps over twice the usual are flagged, which is where a move reads as chunky or "boils".
- **Song track:** load a song, see its waveform, drag to set where the move starts, enter the tempo to see beat lines, and land any drawing on the nearest beat.
- **ChatGPT queue:** type prompts, attach reference pictures, and run them one after another in a signed-in ChatGPT pane inside the app. Each finished picture is saved untouched to the project with its prompt beside it.
- **Cutter:** turns a sheet of drawings (rows × columns) into a move: frames on one canvas, one ground line, feet lined up. It only cuts out, scales as a whole, and moves drawings; nothing inside a drawing is changed.
- **Suno pane:** your Suno library, signed in. Songs you download land in the project's `audio/` folder.

## Run it

Requires Node 20+ and Python 3 with the packages in `python/requirements.txt`.

```sh
npm install
pip3 install -r python/requirements.txt
npm start
```

Then **Open project folder…** and pick or create a folder. The app makes:

```
sheets/   pictures that came back from ChatGPT, with .prompt.txt beside each
kits/     cut moves, one folder each: NAME_f1.png …, NAME_strip.png, NAME.json, timing.json
audio/    songs
inbox/    anything else downloaded in a pane
```

Set `LIGHTBOX_PYTHON` if `python3` isn't the Python with those packages.

## The workflow it's built for

1. **Keys first.** Ask for the key poses of a move on one sheet, then cut and play them. If the move doesn't read from the keys alone, more drawings won't fix it.
2. **In-betweens between real keys.** For each gap, send a sheet that shows the two real neighbouring keys and ask for only the missing drawings between them. Cut it with the key copies left out (`Leave out cells`).
3. **Time it on the exposure sheet.** Slow parts on twos, fast hits on ones, holds where the action lands. Save the timing.
4. **Put it to the song.** Set the tempo and land the hit on a beat.

## Notes

- The ChatGPT and Suno panes are the real websites with your own sign-in, kept in the app's own browser profile. The queue works by scripting the ChatGPT page, so a site change can break it; each step reports what it did, and a failed step stops the queue rather than guessing.
- Suno downloads that use your plan's download credits need your own click in the Suno pane.
- Electron was chosen over Tauri because the app has to host and script real signed-in websites and catch their downloads, which Electron's Chromium views handle reliably on every OS.

## Status

Early (0.1). See [docs/ROADMAP.md](docs/ROADMAP.md).

## License

MIT
