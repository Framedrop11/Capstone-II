.PHONY: up down test lint verify seed e2e load fe-dev fe-client fe-test fe-lint fe-build fe-e2e fe-a11y fe-verify

up:
	docker compose --env-file .env -f infra/docker/docker-compose.yml up --build -d
down:
	docker compose --env-file .env -f infra/docker/docker-compose.yml down
test:
	npm test
lint:
	npm run lint
verify:
	npm run verify
seed:
	docker compose --env-file .env -f infra/docker/docker-compose.yml exec core-api node scripts/seed-local.mjs
e2e:
	npm run test:e2e
load:
	docker run --rm -e BASE_URL=http://host.docker.internal:3000 -v "$(CURDIR)/tests/load:/scripts:ro" grafana/k6:0.52.0 run /scripts/staging-smoke.js
fe-dev:
	npm run fe:dev
fe-client:
	npm run fe:client
fe-test:
	npm run fe:test
fe-lint:
	npm run fe:lint
fe-build:
	npm run fe:build
fe-e2e:
	npm run fe:e2e
fe-a11y:
	npm run fe:a11y
fe-verify:
	npm run fe:verify
