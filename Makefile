# Linko: dev, checks, the touch playthrough. The game deploys from GitHub
# Actions on every push to main (.github/workflows/deploy.yml); nothing here
# deploys.
#
#   make dev           # vite dev server, also on the LAN for a phone
#   make build         # production build -> dist/
#   make preview       # build, then serve it locally
#   make check         # typecheck + build + sim-check + screen-check + playthrough: what a commit needs green
#   make sim-check     # the planet's rules, the waves, the hand's runs, headless
#   make balance       # the hand plays RUNS runs to WAVES waves, one line each (RUNS ?= 12 WAVES ?= 12)
#   make shots-setup   # once: install Playwright and Chromium
#   make playthrough   # the hand plays on an emulated iPhone by real touches, on video (SEED ?= 7 UPTO ?= 3 stages)
#   make sheets        # frame sheets of the last playthrough, twelve frames each
#   make boss-shots    # each boss mid-fight on an emulated iPhone, into shots/bosses/
#   make icons         # the home-screen PNG icons from public/icon.svg
#   make screen-check  # the play screen fills an iPhone in landscape, inside its safe area (shots/screen/)

.PHONY: dev build preview check sim-check balance shots-setup playthrough sheets boss-shots icons screen-check

dev:
	npm run dev

build:
	npm run build

preview: build
	npm run preview

check:
	npm run typecheck
	npm run build
	npm run sim-check
	$(MAKE) screen-check
	$(MAKE) playthrough

sim-check:
	npm run sim-check

RUNS ?= 12
WAVES ?= 12
balance:
	npm run balance -- $(RUNS) $(WAVES)

shots-setup:
	npm install --no-save playwright && npx playwright install chromium

SEED ?= 7
UPTO ?= 3
# the iPhone 15's safe area in landscape: the notch side, the other side, the top, the home bar
SAFE ?= 59,59,0,21
playthrough:
	SEED=$(SEED) WAVES=$(UPTO) SAFE=$(SAFE) node scripts/playthrough.mjs

FROM ?=
TO ?=
sheets:
	node scripts/sheet.mjs $(FROM) $(TO)

boss-shots:
	node scripts/boss-shots.mjs

icons:
	node scripts/icons.mjs

screen-check:
	node scripts/screen-check.mjs
