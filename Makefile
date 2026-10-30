SHELL := /bin/bash

.PHONY: dev build-fullstack up-fullstack down-fullstack logs-fullstack deploy

dev:
	docker compose -f docker-compose.dev.yml up --build

build-fullstack:
	docker compose -f docker-compose.fullstack.yml build

up-fullstack:
	docker compose -f docker-compose.fullstack.yml up -d

down-fullstack:
	docker compose -f docker-compose.fullstack.yml down

logs-fullstack:
	docker compose -f docker-compose.fullstack.yml logs -f

# Production: see DEPLOYMENT.md.
deploy:
	./deploy.sh