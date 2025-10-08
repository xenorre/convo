#!/usr/bin/env sh
set -e

# Build images
DOCKER_BUILDKIT=1 docker compose -f ../../docker-compose.fullstack.yml build

# Run stack
JWT_SECRET=${JWT_SECRET:-change_me}
export JWT_SECRET

docker compose -f ../../docker-compose.fullstack.yml up -d

echo "Stack is up. Frontend: http://localhost:8080"
