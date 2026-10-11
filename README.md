# Zork I Graphical UI

A self-contained browser interface for playing Zork I with illustrated rooms,
interactive objects, an inventory, a compass, and a map. The game runs entirely
in the browser and does not require a web server or an internet connection.

## Play locally

Download or clone the repository, then open `index.html` in a modern browser.
Keep the repository files together so the artwork and scripts remain available.

The opening screen starts a new game. **Save** downloads a standard Quetzal
save file and **Resume** imports one. A browser-local checkpoint also preserves
the current session when storage is available.

Only import save files from sources you trust. Save processing is local, but a
malformed file could make the browser tab unresponsive.

## Deploy

The application is a static site. It can be hosted from the repository root by
GitHub Pages or any static-file host. The included Pages workflow publishes the
site after a push to `main` and can also be run manually.

No build step, package manager, application server, environment variable, or
runtime network connection is required.

## Repository layout

| Path | Purpose |
| --- | --- |
| `index.html` | Application entry point |
| `browser-game.js` | Browser game runtime and save handling |
| `browser-bridge.js` | In-browser replacement for the former HTTP API |
| `game-data.js` | Bundled story, object, room, and map data |
| `static/` | Interface CSS, JavaScript, and illustrated map tiles |
| `images/` | Room, object, character, and opening-screen artwork |
| `vendor/` | Bundled Z-machine interpreter and its license |

## Browser support

The standalone edition has been exercised in Chromium directly from disk and
as a static site. It uses modern browser APIs including `localStorage`,
`structuredClone`, `ResizeObserver`, and typed arrays.

## Third-party software and rights

The bundled Z-machine interpreter is ifvms.js and is distributed under the MIT
License. See [`vendor/ifvms-LICENSE.txt`](vendor/ifvms-LICENSE.txt).

No project-wide open-source license is asserted by this repository. Zork and
related story content remain the property of their respective rights holders.
Review the applicable rights before redistributing or publicly hosting the game
data and artwork.

Security reports should follow [`SECURITY.md`](SECURITY.md).
