# syntax=docker/dockerfile:1

# --- Build frontend ---
# The built files are the same on every platform, so this stage runs natively
# on the build machine instead of under emulation (deploy.sh builds amd64 on
# an Apple Silicon Mac).
FROM --platform=$BUILDPLATFORM node:24 AS frontend-build
WORKDIR /app/frontend

# Provide production-friendly defaults for Vite at build time
ARG VITE_API_URL=/api
ARG VITE_WS_URL=
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}

COPY frontend/package*.json ./
RUN npm ci
COPY frontend .
# Which build this is, shown in Settings and by /healthz (deploy.sh passes
# them; without, the version comes from package.json). Declared after the
# dependency install so a new commit doesn't redo it.
ARG GIT_COMMIT=
ARG BUILD_DATE=
ENV GIT_COMMIT=${GIT_COMMIT} BUILD_DATE=${BUILD_DATE}
RUN npm run build

# --- Install backend production deps ---
FROM node:24-slim AS backend-deps
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

# --- Runtime image ---
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app/backend

# Copy backend deps and source
COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY backend .

# Copy built frontend into public directory to be served by Express
COPY --from=frontend-build /app/frontend/dist ./public

# Runs as the image's unprivileged user. It owns only the folder for uploaded
# files (a volume in production takes this folder's owner) and the log folder.
RUN mkdir -p uploads logs && chown node:node uploads logs
USER node

EXPOSE 3000
# Which build this is, shown in Settings and by /healthz (deploy.sh passes
# them; without, the version comes from package.json). Declared after the
# dependency install so a new commit doesn't redo it.
ARG GIT_COMMIT=
ARG BUILD_DATE=
ENV GIT_COMMIT=${GIT_COMMIT} BUILD_DATE=${BUILD_DATE}
# The slim image has no wget or curl, so Node itself makes the request.
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "src/index.js"]