.PHONY: dev test lint build docker dist-win

IMAGE ?= discordy-client:dev

dev:
	pnpm install && pnpm dev

test:
	pnpm install --frozen-lockfile && pnpm test:unit

lint:
	pnpm lint && pnpm typecheck

build:
	pnpm install --frozen-lockfile && pnpm build

docker:
	docker build -t $(IMAGE) .

dist-win:
	pnpm dist:win
