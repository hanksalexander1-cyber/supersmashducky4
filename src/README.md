# Source layout

`index.html` loads `app.js` as a browser ES module. `app.js` imports `src/main.js`, which creates the shared runtime and wires modules together.

- `config.js` contains API paths, stage metadata, controls, and gameplay tuning.
- `ducks/assets.js` loads sprite sheets, validates duck data, and builds duck graphics.
- `game/simulation.js` owns fighter state, movement, combat, ledges, projectiles, and match rules.
- `game/renderer.js` draws the live canvas scene; `game/stage-art.js` loads static stage images and draws animated spotlights.
- `network/peer-room.js` owns PeerJS rooms and message handling. It receives callbacks for UI work and match rules.
- `ui/roster.js` renders the roster and player panels; `ui/controls.js` owns key remapping and input listeners.
- `ui/audio.js` provides local volume settings, synthesized match sounds, and touch-control preferences.
- `main.js` loads the roster, applies snapshots, runs the frame loop, and connects the modules.

The current build also includes solo training, match recaps and JSON replay export, stage hazards and shareable edited geometry, configurable match rules, spectator seats, automatic 60-second guest reconnection, distance-aware camera zoom, and host-run single-elimination tournaments. Battle items include aimed Isaac shots, a temporary Gust run-speed boost (+2.2 for 10 seconds), and Spring's jump boost, with host-selectable 4-, 8-, or 15-second spawn intervals and a two-item field limit. Room state remains in memory; local audio and touch preferences are saved in browser storage.

Serve the project over HTTP (for example, with VS Code Live Server) so the browser can load ES modules and local assets.
