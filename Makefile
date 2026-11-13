# Developer shortcuts. Every target runs npm or node, so it works from PowerShell, cmd
# or Git Bash. Run `make` (or `make help`) for the list.

.PHONY: help install build update-game-data watch restart test typecheck check pack clean status logs editor switch-dev switch-prod switch-prod-local release

help:
	@echo Setup and build
	@echo   make install            install dependencies (npm ci)
	@echo   make build              build the development plugin
	@echo   make watch              rebuild and restart the plugin on every change
	@echo   make restart            restart the plugin in Stream Deck
	@echo Checks
	@echo   make test               unit tests
	@echo   make typecheck          TypeScript check
	@echo   make check              typecheck + tests + release package (what CI runs)
	@echo Packages and releases
	@echo   make pack               release package in dist/
	@echo   make release VERSION=x.y.z   tag vX.Y.Z and push it: GitHub publishes the release
	@echo   make clean              remove build/ and dist/
	@echo   make update-game-data   refresh the bundled fallback game data from the installed game
	@echo Stream Deck
	@echo   make status             which version Stream Deck runs (dev or installed)
	@echo   make switch-dev         use the linked project folder (development)
	@echo   make switch-prod        install the latest GitHub release
	@echo   make switch-prod-local  install a package built from the current code
	@echo   make logs [LINES=n]     last lines of the plugin log
	@echo   make editor             open the group editor (development version only)

install:
	npm ci

build:
	npm run build

watch:
	npm run watch

restart:
	npx streamdeck restart it.jacopofilonzi.deck-citizen

test:
	npm test

typecheck:
	npm run typecheck

check: typecheck test pack

pack:
	npm run pack

update-game-data:
	node tools/update-game-data.mjs

clean:
	node -e "for (const d of ['build', 'dist']) require('fs').rmSync(d, { recursive: true, force: true })"

status:
	node tools/devtools.mjs status

LINES ?= 30
logs:
	node tools/devtools.mjs logs $(LINES)

editor:
	node tools/devtools.mjs editor

switch-dev:
	node tools/devtools.mjs switch-dev

switch-prod:
	node tools/devtools.mjs switch-prod

switch-prod-local:
	node tools/devtools.mjs switch-prod local

release:
	node tools/devtools.mjs release $(VERSION)
