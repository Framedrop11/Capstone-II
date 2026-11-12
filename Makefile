.PHONY: up down test lint verify seed e2e load

up:
	@echo "Local service stack is added in Stage 8."
down:
	@echo "Local service stack is added in Stage 8."
test:
	npm test
lint:
	npm run lint
verify:
	npm run verify
seed:
	@echo "Synthetic seed data is added with the data layer."
e2e:
	@echo "API E2E suite is added in Stage 11."
load:
	@echo "k6 scenarios are added in Stage 11."
