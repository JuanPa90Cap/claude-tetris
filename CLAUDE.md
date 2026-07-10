# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file vanilla JS Tetris clone. HTML5 Canvas + CSS, zero dependencies, zero build step. `game.js` (~300 lines) contains the entire game — board model, pieces, physics, rendering, input, and game loop.

## Running

No install, no build. Two ways:

```bash
# Just open it
start index.html          # Windows
open index.html           # macOS
xdg-open index.html       # Linux

# Or serve it (avoids any file:// canvas/asset quirks)
python3 -m http.server 8000
npx serve .
php -S localhost:8000
```

There is no `package.json`, no test suite, no linter, and no CI — there is nothing to "build" or "run tests" for. Verify changes by loading the page in a browser and playing.

## Architecture

Three files, one direction of dependency: `index.html` → `style.css` + `game.js`.

- **`index.html`** — DOM shell only: `<canvas id="board">` (300×600, the play field) and `<canvas id="next-canvas">` (120×120, next-piece preview), score/lines/level panel, controls list, pause/game-over overlay.
- **`style.css`** — dark/retro arcade visuals only (flexbox layout, `backdrop-filter` overlay). No game logic.
- **`game.js`** — everything else. Key parts, in the order you'll need them when making changes:

  - **Board model**: `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or a color index `1..N` identifying which piece occupies it.
  - **Piece data** (`PIECES`, `COLORS`): pieces are plain matrices, index-aligned with a parallel color array. `PIECES[0]`/`COLORS[0]` are `null` placeholders so piece-type numbers line up with color indices 1..N directly. **Matrix size is not fixed** — the I-piece is 4×4, O is 2×2, the rest are 3×3 — every consumer (`collide`, `rotateCW`, `merge`, `draw`, `ghostY`) iterates `shape.length`/`shape[r].length` dynamically rather than assuming a fixed grid. `randomPiece()` picks `type` via `Math.floor(Math.random() * N) + 1`, where `N` is the current piece count — **this literal must be updated whenever a piece is added to or removed from `PIECES`**, since nothing derives it from `PIECES.length` automatically.
  - **Rotation** (`rotateCW`): generic transpose + row-reverse, works for any matrix shape. `tryRotate()` wraps it with simple wall-kick offsets `[0,-1,1,-2,2]` (no full SRS kick table) tried against `collide` until one fits.
  - **Collision** (`collide(shape, ox, oy)`): the single source of truth for "can this shape sit here" — used by movement, rotation, ghost projection, soft/hard drop, and the spawn game-over check. Empty (`0`) cells are always skipped, so pieces with holes in the middle (e.g. a ring shape) are fully supported: a hole just means that board cell stays empty after the piece locks, and a line through it won't clear until another piece fills the gap.
  - **Lock cycle**: `lockPiece()` → `merge()` (writes shape into `board`) → `clearLines()` (removes full rows, unshifts empty rows at top, updates score/level/`dropInterval`) → `spawn()` (promotes `next` to `current`, generates a new `next`, checks game-over via `collide` at spawn position).
  - **Rendering** (`draw`, `drawNext`, `drawBlock`, `drawGrid`): `drawBlock` no-ops on falsy color index, so holes/empty cells render as nothing automatically. `draw()` layers grid → locked board → ghost piece (`globalAlpha 0.2`, position from `ghostY()`) → current piece. `drawNext()` centers the preview shape inside a **hardcoded 4×4** box (`offX/offY` from `(4 - shape.length)/2`) — fine for pieces up to 4×4, would clip/misplace anything larger.
  - **Game loop** (`loop`, driven by `requestAnimationFrame`): accumulates `dt`, drops the piece one row when `dropAccum >= dropInterval`, otherwise locks it. `init()` resets all state and starts the loop; `togglePause()` cancels/resumes the `requestAnimationFrame` chain.
  - **Input**: a single `keydown` listener switches on `e.code` (arrows, `KeyX` for rotate, `Space` for hard drop, `KeyP` for pause) — no key remapping abstraction, add new bindings directly in the switch.

## Adding a new piece

Three coordinated edits in `game.js`, all near the top of the file:

1. Append the shape's color to `COLORS` (new index = next array position).
2. Append the shape matrix to `PIECES` at the same index, using that color index for filled cells and `0` for empty ones (holes are fine — see Collision above).
3. Update the `Math.random() * N` literal inside `randomPiece()` to the new total piece count so the new type can actually spawn.

Nothing else needs to change — rotation, collision, merge, rendering, and line-clearing already operate on arbitrary shape dimensions, as long as the new piece is 4×4 or smaller (see the `drawNext` caveat above).
