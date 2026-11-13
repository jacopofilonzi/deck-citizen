# Star Citizen for Stream Deck

Stream Deck plugin that controls Star Citizen through the player's own keybinds.
Windows only. Inputs are sent with `SendInput` using scancodes.

## Development

```sh
npm install
npm run build        # generate profiles/icons, bundle into it.jacopofilonzi.deck-citizen.sdPlugin
npx streamdeck dev   # once: enable developer mode
npx streamdeck link it.jacopofilonzi.deck-citizen.sdPlugin   # once: install the plugin folder in Stream Deck
npm run watch        # rebuild and restart the plugin on every change
npm test             # unit tests (Node 24+, runs TypeScript directly)
npm run validate     # check manifest.json
npm run pack         # build a .streamDeckPlugin file
```

Plugin logs: `it.jacopofilonzi.deck-citizen.sdPlugin/logs/`.

## How it works

- **Keybinds** (`src/keybinds`): binds are built from stacked layers, lowest priority
  first. Today: default binds bundled with the plugin (`game-data/<build>/defaultProfile.xml`),
  then the user's `actionmaps.xml`, which only lists what the user changed. Each layer
  comes from a `KeybindSource`; changing the source of truth means changing the list
  in `src/app.ts`. Every action has an activation mode (press, tap, hold, double tap,
  delayed press, ...) that decides how long keys are held.
- **XML** (`src/xml`): files can be plain XML or CryEngine binary XML (CryXmlB, the
  format inside `Data.p4k`); the format is detected from the content.
- **Groups** (`src/catalog`): built-in groups live in `src/catalog/builtin-groups.json`;
  each function points at a game action (`<actionmap>/<action>`). Custom groups are
  JSON in the plugin settings and can also use fixed keys, macros or references.
  A game function can name a `"fallback"` action (used when the first has no usable bind)
  and a `"wheel"` direction: binds on the mouse wheel axis (`maxis_z`) are then sent as
  wheel steps, one per press or dial tick, repeating while a key is held.
  `"confirm": true` shows a Confirm / Abort page before running (Emergency group);
  each key can turn it off with "Skip confirmation".
- **Group editor** (`src/editor`, page in `it.jacopofilonzi.deck-citizen.sdPlugin/editor`): opened from
  the key settings, it runs in the browser. The plugin starts a small web server only while
  the page is open (127.0.0.1, random port, secret token in the URL) and stops it when the
  page closes or after 15 minutes idle. The page edits the same custom groups JSON.
  Import / export: "Export all" writes every custom group plus the game settings (a backup),
  "Export group" writes one group to share; imports are merged into the editor and applied on Save.
- **Key images** (`src/render`): static SVG keys with the group color bar, caption, icon,
  name and bind. Icons are listed in `src/render/icons.ts`; groups and functions pick
  one with `"icon"`, and any icon also works with an `-off` suffix (dimmed and crossed out).
- **Menu** (`src/menu`): a menu is a plugin profile ("SC Menu") whose keys are all
  "menu slot" actions; the plugin draws each slot from the group and the device size.
  Coordinates are `x` from the left and `y` from the bottom; `x0y0` is always Back.

## Updating game data after a patch

```sh
python tools/p4k_extract.py "<StarCitizen>/LIVE/Data.p4k" "config\defaultprofile.xml" game-data/<build>/raw/defaultProfile.cryxml
python tools/cryxml2xml.py game-data/<build>/raw/defaultProfile.cryxml game-data/<build>/defaultProfile.xml
python tools/p4k_extract.py "<StarCitizen>/LIVE/Data.p4k" "localization\english\global.ini" <temp>/global.ini
python tools/extract_labels.py game-data/<build>/defaultProfile.xml <temp>/global.ini game-data/<build>/labels.json
npm test   # checks that every built-in group still points at existing actions
```

`tools/*.py` need Python 3.14+ (standard library only).
