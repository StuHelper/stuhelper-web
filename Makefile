.PHONY: check build dev generate
check:
	pnpm exec stuhelper-check repository
	pnpm run check
	pnpm exec stuhelper-check workflows
build:
	pnpm run build
dev:
	pnpm run dev
generate:
	pnpm run generate

setup:
	LEFTHOOK=0 pnpm install --frozen-lockfile
