# Star Citizen for Stream Deck

Stream Deck plugin that controls Star Citizen through the player's own keybinds.
**Windows only**

## Development

A `Makefile` wraps the common commands (run `make` for the list), including
`make switch-dev` / `make switch-prod` to move Stream Deck between the linked project
folder and an installed package (`switch-prod` installs the latest GitHub release,
`switch-prod-local` a package of the current code). Profiles and settings are kept; a
backup goes to `.backups/` first. The underlying script is `tools/devtools.mjs`.

```sh
npm install
npm run build        # generate profiles/icons, bundle into it.jacopofilonzi.deck-citizen.sdPlugin
npx streamdeck dev   # once: enable developer mode
npx streamdeck link it.jacopofilonzi.deck-citizen.sdPlugin   # once: install the plugin folder in Stream Deck
npm run watch        # rebuild and restart the plugin on every change
npm test             # unit tests (Node 24+, runs TypeScript directly)
npm run validate     # check manifest.json
npm run pack         # release package: dist/it.jacopofilonzi.deck-citizen.streamDeckPlugin
```

Plugin logs: `it.jacopofilonzi.deck-citizen.sdPlugin/logs/`.

Development builds include debug deep links (`streamdeck://plugins/message/it.jacopofilonzi.deck-citizen/debug/...`,
see `src/plugin.ts`); they sit behind the build-time constant `__DEV__` and are left out of
release builds. `npm run pack` builds the release in `build/` (the linked dev folder is not
touched), takes the version from `package.json`, turns off the Node debugger and packs it.
To install the package, remove the dev link first (`npx streamdeck unlink it.jacopofilonzi.deck-citizen`):
both use the same plugin id.

## Updates

The plugin is not on the Elgato Marketplace, so it checks GitHub itself
(`src/update/update-checker.ts`, release builds only): 15 s after start and then daily it
reads the latest release of this repository. A newer version is announced once with a
Windows notification (sent through PowerShell) and stays as a banner in the key settings,
whose Install button downloads the package and opens it (Stream Deck asks to confirm).
"Check GitHub for new versions" in Plugin settings turns it off. In development builds
the deep link `.../debug/update` runs the check as if 0.0.0 were installed.

## CI and releases

`.github/workflows/build.yml` runs on GitHub (Windows): every push and pull request is
type-checked, tested and packaged (packing validates the manifest) (the package is kept as a build artifact).
Pushing a tag `vX.Y.Z` also creates a GitHub release with the `.streamDeckPlugin` attached;
the tag sets the plugin version (`X.Y.Z.0`), so `package.json` does not need a bump:

```sh
git tag v0.2.0
git push origin v0.2.0
```

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
  page closes or after 15 minutes idle. The page edits the same custom groups JSON;
  menu layouts are arranged by dragging keys (or with a menu on each key).
  Import / export: "Export all" writes every custom group plus the game settings (a backup),
  "Export group" writes one group to share; imports are merged into the editor and applied on Save.
- **Key images** (`src/render`): static SVG keys with the group color bar, caption, icon,
  name and bind. Icons are listed in `src/render/icons.ts`; groups and functions pick
  one with `"icon"`, and any icon also works with an `-off` suffix (dimmed and crossed out).
- **Menu** (`src/menu`): a menu is a plugin profile ("SC Menu") whose keys are all
  "menu slot" actions; the plugin draws each slot from the group and the device size.
  Coordinates are `x` from the left and `y` from the bottom; `x0y0` is always Back.

## Game data

The default binds and the action names are read from the player's own game: on start the
plugin reads `Data\Libs\Config\defaultProfile.xml` and
`Data\Localization\english\global.ini` out of `Data.p4k` (`src/gamedata`, ZIP64 with zstd)
and caches them in `%LOCALAPPDATA%\deck-citizen\game-data\<build>-<size>-<date>`. This
takes a couple of seconds and happens again only when the game updates (the plugin watches
`build_manifest.id`). Until then, or if reading fails, it uses the copy in `game-data/`
bundled with the plugin, and the key settings say so.

## Updating the bundled fallback copy after a patch

```sh
python tools/p4k_extract.py "<StarCitizen>/LIVE/Data.p4k" "config\defaultprofile.xml" game-data/<build>/raw/defaultProfile.cryxml
python tools/cryxml2xml.py game-data/<build>/raw/defaultProfile.cryxml game-data/<build>/defaultProfile.xml
python tools/p4k_extract.py "<StarCitizen>/LIVE/Data.p4k" "localization\english\global.ini" <temp>/global.ini
python tools/extract_labels.py game-data/<build>/defaultProfile.xml <temp>/global.ini game-data/<build>/labels.json
npm test   # checks that every built-in group still points at existing actions
```

`tools/*.py` need Python 3.14+ (standard library only).

## License

MIT, see [LICENSE](LICENSE). The files in `game-data/` are extracted from Star Citizen and
belong to Cloud Imperium Games; they are not covered by the MIT license. This is a fan-made
tool, not affiliated with or endorsed by Cloud Imperium Games or Elgato.
