.PHONY: check build dev generate
check:
	npm run check
build:
	npm run build
dev:
	npm run dev
generate:
	npm run generate

setup:
	npm ci --ignore-scripts
