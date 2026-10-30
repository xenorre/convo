# syntax=docker/dockerfile:1
FROM node:24-alpine
WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

ENV NODE_ENV=production
EXPOSE 3000
# Which build this is, shown in Settings and by /healthz (deploy.sh passes
# them; without, the version comes from package.json). Declared after the
# dependency install so a new commit doesn't redo it.
ARG GIT_COMMIT=
ARG BUILD_DATE=
ENV GIT_COMMIT=${GIT_COMMIT} BUILD_DATE=${BUILD_DATE}

# Healthcheck hits /healthz
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "src/index.js"]