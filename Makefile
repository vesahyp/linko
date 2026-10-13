# Linko: dev, checks, the touch playthrough. The game deploys from GitHub
# Actions on every push to main (.github/workflows/deploy.yml); nothing here
# deploys.
#
#   make dev           # vite dev server, also on the LAN for a phone
#   make build         # production build -> dist/
#   make preview       # build, then serve it locally
#   make check         # typecheck + build + sim-check + playthrough: what a commit needs green
#   make sim-check     # the planet's rules, the waves, the hand's runs, headless
#   make balance       # the hand plays RUNS runs to WAVES waves, one line each (RUNS ?= 12 WAVES ?= 12)
#   make shots-setup   # once: install Playwright and Chromium
#   make playthrough   # the hand plays on an emulated iPhone by real touches, on video (SEED ?= 7 UPTO ?= 3 stages)
#   make sheets        # frame sheets of the last playthrough, twelve frames each

.PHONY: dev build preview check sim-check balance shots-setup playthrough sheets

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
playthrough:
	SEED=$(SEED) WAVES=$(UPTO) node scripts/playthrough.mjs

sheets:
	node scripts/sheet.mjs
