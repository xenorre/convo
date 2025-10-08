SHELL := /bin/bash

.PHONY: dev build-fullstack up-fullstack down-fullstack logs-fullstack prod-up prod-down k8s-apply k8s-delete

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

prod-up:
	docker compose -f docker-compose.production.yml up -d --build

prod-down:
	docker compose -f docker-compose.production.yml down

k8s-apply:
	kubectl apply -f deploy/k8s

k8s-delete:
	kubectl delete -f deploy/k8s