#!/usr/bin/env bash
# Checks, builds and deploys Convo to the VPS (see DEPLOYMENT.md):
#   1. tests, lint and a dependency audit, on a clean working tree;
#   2. one linux/amd64 image, stamped with the version and commit;
#   3. the image, Compose file and backup script copied over SSH to ~/apps/convo;
#   4. `compose up --wait`, then /healthz must report the commit just built.
#
# The server's address and user stay out of this public repository: set
# VPS_HOST and VPS_USER (and VPS_PORT if not 22) in the environment or in a
# gitignored .deploy.env next to this script.
# SKIP_CHECKS=1 skips step 1, for a redeploy of something already checked.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -f .deploy.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .deploy.env
  set +a
fi
: "${VPS_HOST:?Set VPS_HOST (environment or .deploy.env)}"
: "${VPS_USER:?Set VPS_USER (environment or .deploy.env)}"
VPS_PORT="${VPS_PORT:-22}"
DOMAIN="convo.deezby.pl"
PROJECT="convo-prod"
COMPOSE_FILE="docker-compose.prod.yaml"

for tool in docker ssh scp gzip git node npm curl; do
  command -v "$tool" >/dev/null || { echo "Missing command: $tool" >&2; exit 1; }
done

# Keep the scp destination and SSH arguments safe to pass to a remote shell.
[[ "$VPS_USER" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_-]*$ ]] || { echo "Invalid VPS_USER" >&2; exit 1; }
[[ "$VPS_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || { echo "Invalid VPS_HOST" >&2; exit 1; }
[[ "$VPS_PORT" =~ ^[0-9]+$ ]] || { echo "Invalid VPS_PORT" >&2; exit 1; }
REMOTE="${VPS_USER}@${VPS_HOST}"
SSH=(ssh -p "$VPS_PORT" -o BatchMode=yes "$REMOTE")

# The image records the commit, so it must contain exactly that commit.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "The working tree has uncommitted changes; commit or stash them first." >&2
  exit 1
fi
COMMIT="$(git rev-parse --short HEAD)"
VERSION="$(node -p 'require("./package.json").version')"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TAG="convo:${VERSION}-${COMMIT}"
[[ "$(git describe --tags --exact-match 2>/dev/null)" == "v$VERSION" ]] ||
  echo "Note: HEAD is not the v$VERSION release tag; deploying $COMMIT as $VERSION."

if [[ "${SKIP_CHECKS:-}" != 1 ]]; then
  echo "Running the backend tests..."
  npm --prefix backend test
  # The type check runs in the image build (npm run build).
  echo "Running the frontend lint and tests..."
  npm --prefix frontend run lint
  npm --prefix frontend run test:run
  echo "Auditing the production dependencies..."
  npm --prefix backend audit --omit=dev --audit-level=high
  npm --prefix frontend audit --omit=dev --audit-level=high
fi

docker info >/dev/null
docker buildx version >/dev/null
JWT_SECRET=x MONGO_ROOT_PASSWORD=x MONGO_APP_PASSWORD=x RESEND_API_KEY=x \
  docker compose --env-file /dev/null -f "$COMPOSE_FILE" config --quiet

echo "Checking Docker, Traefik's network and the Convo folder on the server..."
"${SSH[@]}" 'bash -s' <<'REMOTE_CHECK'
set -euo pipefail
docker info >/dev/null
docker compose up --help | grep -q -- '--wait-timeout' || {
  echo "Docker Compose with --wait-timeout support is required on the server." >&2
  exit 1
}
docker network inspect apexcore-network >/dev/null || {
  echo "Traefik's network apexcore-network is missing." >&2
  exit 1
}
# Containers with these names must be Convo's own, never another project's.
for name in convo-app convo-db; do
  owner="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$name" 2>/dev/null || true)"
  [[ -z "$owner" || "$owner" == convo-prod ]] || {
    echo "A container named $name belongs to Compose project '$owner'; refusing to touch it." >&2
    exit 1
  }
done
[[ -f "$HOME/apps/convo/.env" ]] || {
  echo "Missing ~/apps/convo/.env on the server; create it from .env.production.example." >&2
  exit 1
}
[[ "$(stat -c %a "$HOME/apps/convo/.env")" == 600 ]] ||
  echo "Warning: ~/apps/convo/.env should be readable only by its owner (chmod 600)." >&2
REMOTE_CHECK

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/convo-deploy.XXXXXX")"
trap 'rm -rf -- "$TEMP_DIR"' EXIT
UPLOAD="$(basename "$TEMP_DIR")"

echo "Building $TAG for linux/amd64..."
docker buildx build --platform linux/amd64 --load \
  --build-arg GIT_COMMIT="$COMMIT" --build-arg BUILD_DATE="$BUILD_DATE" \
  -t "$TAG" .

echo "Saving the image..."
docker save "$TAG" | gzip > "$TEMP_DIR/image.tar.gz"
cp "$COMPOSE_FILE" scripts/backup-vps.sh "$TEMP_DIR/"

echo "Copying the image and configuration to the server..."
"${SSH[@]}" "mkdir -p \"\$HOME/apps/convo/$UPLOAD\""
scp -P "$VPS_PORT" -o BatchMode=yes "$TEMP_DIR/image.tar.gz" "$TEMP_DIR/$COMPOSE_FILE" "$TEMP_DIR/backup-vps.sh" \
  "$REMOTE:apps/convo/$UPLOAD/"

echo "Starting the new version and waiting for its health check..."
printf -v REMOTE_ARGS '%q ' "$UPLOAD" "$TAG" "$PROJECT" "$COMPOSE_FILE" "$COMMIT"
"${SSH[@]}" "bash -s -- $REMOTE_ARGS" <<'REMOTE_DEPLOY'
set -euo pipefail
UPLOAD="$1" TAG="$2" PROJECT="$3" COMPOSE_FILE="$4" COMMIT="$5"
cd "$HOME/apps/convo"
trap 'rm -rf -- "$UPLOAD"' EXIT

docker load < "$UPLOAD/image.tar.gz"
docker compose -p "$PROJECT" -f "$UPLOAD/$COMPOSE_FILE" --env-file .env config --quiet

# What runs now, to go back to if the new version doesn't come up.
PREVIOUS_IMAGE="$(docker image inspect --format '{{.Id}}' convo:latest 2>/dev/null || true)"
if [[ -f "$COMPOSE_FILE" ]]; then
  cp -p -- "$COMPOSE_FILE" "$COMPOSE_FILE.previous"
fi
docker tag "$TAG" convo:latest
mv -- "$UPLOAD/$COMPOSE_FILE" "$COMPOSE_FILE"
install -m 700 "$UPLOAD/backup-vps.sh" backup-vps.sh
mkdir -p -m 700 backups

up() {
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up \
    --detach --pull never --remove-orphans --wait --wait-timeout 120 "$@"
}
running_commit() {
  docker exec convo-app node -e \
    'fetch("http://127.0.0.1:3000/healthz").then((r) => r.json()).then((b) => console.log(b.commit))' || true
}

# MongoDB is recreated only when its own settings changed.
if up && [[ "$(running_commit)" == "$COMMIT" ]]; then
  :
else
  echo "The new version didn't come up healthy:" >&2
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" logs --tail 50 app >&2
  if [[ -n "$PREVIOUS_IMAGE" && -f "$COMPOSE_FILE.previous" ]]; then
    echo "Going back to the previous version..." >&2
    docker tag "$PREVIOUS_IMAGE" convo:latest
    mv -- "$COMPOSE_FILE.previous" "$COMPOSE_FILE"
    # The same image name as the failed run, so Compose must be told.
    up --force-recreate --no-deps app && echo "The previous version runs again (commit $(running_commit))." >&2
  fi
  exit 1
fi

# Keeps the three newest builds for a rollback (see DEPLOYMENT.md).
docker image ls convo --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}' |
  grep -v ':latest$' | sort -r | tail -n +4 | cut -f2 | xargs -r docker image rm >/dev/null || true
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" ps
REMOTE_DEPLOY

echo "Checking https://$DOMAIN/healthz..."
if PUBLIC="$(curl -fsS --max-time 15 "https://$DOMAIN/healthz")"; then
  echo "$PUBLIC"
  [[ "$PUBLIC" == *"\"commit\":\"$COMMIT\""* ]] || echo "Warning: the public site doesn't report $COMMIT yet." >&2
else
  echo "Warning: https://$DOMAIN isn't reachable from here (DNS or certificate not ready?)." >&2
fi
echo "Done: $TAG is running on the server."
