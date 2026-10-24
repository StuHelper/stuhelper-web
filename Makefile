.PHONY: check build dev generate
check:
	pnpm exec stuhelper-check release
	pnpm run check
	pnpm exec stuhelper-check workflows
build:
	pnpm run build
dev:
	pnpm run dev
generate:
	pnpm run generate

setup:
	pnpm install --frozen-lockfile
